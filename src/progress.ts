import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs'
import { db } from './db.ts'
import { PATH, levelById, unitByN, type KC } from './course.ts'

const scheduler = fsrs()
const DAY = 24 * 3600 * 1000

export type UnitStatus = 'locked' | 'available' | 'passed' | 'mastered'
export type UnitState = { n: number; status: UnitStatus; accuracy?: number }

export const PASS_ACCURACY = 0.8

/** 掌握：最近 5 次至少答对 4 次，且至少有一次答对发生在第一次作答一天以后（间隔回忆）。 */
export async function kcMastered(kc: KC) {
  const all = await db.attempts.where('kc').equals(kc).sortBy('at')
  if (all.length < 3) return false
  const last = all.slice(-5)
  const okRate = last.filter((a) => a.ok).length / last.length
  const spaced = all.some((a) => a.ok && a.at - all[0].at >= DAY)
  return okRate >= 0.8 && spaced
}

export async function recordAnswer(kc: KC, ok: boolean, unit?: number, src?: string) {
  const now = new Date()
  await db.attempts.add({ kc, ok, at: now.getTime(), unit, src })
  const row = await db.cards.get(kc)
  const card: Card = row ? reviveCard(row.card) : createEmptyCard(now)
  const next = scheduler.next(card, now, ok ? Rating.Good : Rating.Again).card
  await db.cards.put({ kc, due: next.due.getTime(), card: next })
}

function reviveCard(c: unknown): Card {
  const x = c as Card & { due: string | Date; last_review?: string | Date }
  return { ...x, due: new Date(x.due), last_review: x.last_review ? new Date(x.last_review) : undefined }
}

/** 已经练过（有复习卡片）的知识点 */
export async function seenKCs(): Promise<Set<KC>> {
  return new Set((await db.cards.toCollection().primaryKeys()) as KC[])
}

export type LevelStatus = 'locked' | 'available' | 'passed'
export type LevelState = { id: string; status: LevelStatus; best?: number }

/**
 * 关卡状态：拼读线和诵读线各自按顺序解锁，上一关通过才开下一关。
 * 单元的状态由它的关卡决定：全部通过算通过，单元里的知识点都掌握了算掌握。
 */
export async function getPathState(): Promise<{ levels: Map<string, LevelState>; units: UnitState[] }> {
  const rows = new Map((await db.levels.toArray()).map((r) => [r.id, r]))
  const levels = new Map<string, LevelState>()
  const units: UnitState[] = []
  const prevPassed: Record<string, boolean> = { spell: true, read: true }
  for (const u of PATH) {
    for (const l of u.levels) {
      const r = rows.get(l.id)
      const status: LevelStatus = r?.passedAt ? 'passed' : prevPassed[u.track] ? 'available' : 'locked'
      levels.set(l.id, { id: l.id, status, best: r?.best })
      prevPassed[u.track] = status === 'passed'
    }
    const ls = u.levels.map((l) => levels.get(l.id)!)
    let status: UnitStatus = ls.every((l) => l.status === 'passed') ? 'passed' : ls[0].status === 'locked' ? 'locked' : 'available'
    if (status === 'passed') {
      const kcs = [...new Set(u.levels.flatMap((l) => l.kcs))]
      const practiced = (await db.cards.where('kc').anyOf(kcs).primaryKeys()) as KC[]
      const m = await Promise.all(practiced.map(kcMastered))
      if (practiced.length > 0 && m.every(Boolean)) status = 'mastered'
    }
    const tests = u.levels.filter((l) => l.kind === 'test').map((l) => rows.get(l.id)?.best ?? 0)
    units.push({ n: u.n, status, accuracy: tests[0] })
  }
  return { levels, units }
}

export async function getUnitStates(): Promise<UnitState[]> {
  return (await getPathState()).units
}

/** 一关结束。正确率 ≥ 80% 算通过；单元最后一关（小测）通过后，排好定时抽查。 */
export async function finishLevel(id: string, accuracy: number) {
  const lv = levelById.get(id)!
  const prev = await db.levels.get(id)
  const passed = accuracy >= PASS_ACCURACY
  const passedAt = prev?.passedAt ?? (passed ? Date.now() : undefined)
  await db.levels.put({ id, unit: lv.unit, passedAt, best: Math.max(prev?.best ?? 0, accuracy), plays: (prev?.plays ?? 0) + 1 })
  const u = unitByN.get(lv.unit)!
  const unitDone = passed && !prev?.passedAt && u.levels[u.levels.length - 1].id === id
  if (unitDone) {
    await scheduleChecks(lv.unit)
    if (lv.unit <= 10) await db.units.put({ n: lv.unit, passedAt: Date.now(), best: accuracy })
  }
  return { passed, unitDone }
}

// ───── 定时抽查 ─────
/** 单元通过后第几天抽查 */
export const CHECK_DAYS = [1, 3, 7, 14, 30]

const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export async function scheduleChecks(unit: number, from = Date.now()) {
  const base = startOfDay(from)
  for (const [step, days] of CHECK_DAYS.entries()) {
    const id = `${unit}-${step}`
    if (!(await db.checks.get(id))) await db.checks.put({ id, unit, step, due: base + days * DAY, tries: 0 })
  }
}

/** 以前就通过、还没有抽查计划的单元（比如从旧版本升级上来的），从今天起排上。 */
export async function ensureChecks(units: UnitState[]) {
  for (const u of units)
    if ((u.status === 'passed' || u.status === 'mastered') && !(await db.checks.where('unit').equals(u.n).count())) await scheduleChecks(u.n)
}

/** 到期、还没做的抽查；同一单元只算最早的一次。 */
export async function dueChecks(now = Date.now()) {
  const rows = (await db.checks.where('due').belowOrEqual(now).toArray()).filter((c) => !c.doneAt).sort((a, b) => a.due - b.due)
  const seen = new Set<number>()
  return rows.filter((c) => !seen.has(c.unit) && seen.add(c.unit))
}

export async function upcomingChecks(limit = 8) {
  return (await db.checks.orderBy('due').toArray()).filter((c) => !c.doneAt).slice(0, limit)
}

/** 抽查结果：80% 以上算过；没过就明天再抽一次，答错的内容同时进复习队列。 */
export async function finishCheck(id: string, accuracy: number) {
  const c = (await db.checks.get(id))!
  const passed = accuracy >= PASS_ACCURACY
  // 同一单元更早、还没做的抽查一起算完成，避免攒一堆
  if (passed) {
    const older = (await db.checks.where('unit').equals(c.unit).toArray()).filter((x) => !x.doneAt && x.due <= c.due)
    for (const x of older) await db.checks.put({ ...x, doneAt: Date.now(), score: accuracy, tries: x.tries + 1 })
  } else await db.checks.put({ ...c, due: startOfDay(Date.now()) + DAY, score: accuracy, tries: c.tries + 1 })
  return passed
}

export async function dueKCs(limit = 20): Promise<KC[]> {
  return ((await db.cards.where('due').belowOrEqual(Date.now()).limit(limit).primaryKeys()) as KC[])
}

/** 最近答错较多的知识点，用于下一关优先出题。 */
export async function weakKCs(): Promise<KC[]> {
  const recent = await db.attempts.orderBy('at').reverse().limit(200).toArray()
  const wrong = new Map<KC, number>()
  for (const a of recent) if (!a.ok) wrong.set(a.kc, (wrong.get(a.kc) ?? 0) + 1)
  return [...wrong.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

export async function todayStats() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = await db.attempts.where('at').aboveOrEqual(start.getTime()).toArray()
  return { answered: today.length, correct: today.filter((a) => a.ok).length }
}
