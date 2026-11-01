import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'
import { db, type Attempt } from './db.ts'
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
  // 最近 7 次至少对 6 次（不到 7 次的按已有的算，最多错 1 次），并且隔天还答对过
  const last = all.slice(-7)
  const wrong = last.filter((a) => !a.ok).length
  const spaced = all.some((a) => a.ok && a.at - all[0].at >= DAY)
  return wrong <= 1 && spaced
}

/**
 * 记一次作答，更新这个知识点的 FSRS 卡片。字卡、路径、复习、抽查都走这里，同一个知识点只有一份记录。
 * rating 不给就按对错：对 Good，错 Again。Easy 只给已经进入复习阶段的卡，新卡最多 Good。
 */
export async function recordAnswer(kc: KC, ok: boolean, unit?: number, src?: string, rating?: Grade, extra?: Pick<Attempt, 'kind' | 'ms' | 'pick' | 'miss'>) {
  const now = new Date()
  await db.attempts.add({ kc, ok, at: now.getTime(), unit, src, ...extra })
  // 全书段落题（B:）只记作答，不进复习
  if (kc.startsWith('B:')) return createEmptyCard(now)
  const row = await db.cards.get(kc)
  const card: Card = row ? reviveCard(row.card) : createEmptyCard(now)
  let r: Grade = rating ?? (ok ? Rating.Good : Rating.Again)
  if (r === Rating.Easy && card.state !== State.Review) r = Rating.Good
  const next = scheduler.next(card, now, r).card
  await db.cards.put({ kc, due: next.due.getTime(), card: next })
  return next
}

/**
 * 每种题型一次答对通常要多久（最近 500 次作答的中位数，至少 10 次才算）。
 * 用来给 FSRS 分档：明显比平时快记 Easy，明显慢记 Hard。
 */
export async function speedMedians(): Promise<Map<string, number>> {
  const recent = await db.attempts.orderBy('at').reverse().limit(500).toArray()
  const by = new Map<string, number[]>()
  for (const a of recent) if (a.ok && a.kind && a.ms && !a.src) by.set(a.kind, [...(by.get(a.kind) ?? []), a.ms])
  const out = new Map<string, number>()
  for (const [k, v] of by) if (v.length >= 10) out.set(k, v.sort((a, b) => a - b)[Math.floor(v.length / 2)])
  return out
}

/** 一次就答对时按速度分档：比中位数快很多 Easy，慢一倍以上 Hard，其余 Good；没有足够记录就 Good */
export function speedRating(ms: number, median?: number): Grade {
  if (!median) return Rating.Good
  if (ms > median * 2) return Rating.Hard
  if (ms < median * 0.6) return Rating.Easy
  return Rating.Good
}

export function reviveCard(c: unknown): Card {
  const x = c as Card & { due: string | Date; last_review?: string | Date }
  return { ...x, due: new Date(x.due), last_review: x.last_review ? new Date(x.last_review) : undefined }
}

/** 已经练过（有复习卡片）的知识点 */
export async function seenKCs(): Promise<Set<KC>> {
  return new Set((await db.cards.toCollection().primaryKeys()) as KC[])
}

export type LevelStatus = 'locked' | 'available' | 'passed'
export type LevelState = { id: string; status: LevelStatus; best?: number; /** 不挡路的关：选学关，或单元已通过后才加进来的补课关 */ optional?: boolean }

/**
 * 关卡状态：拼读线和诵读线各自按顺序解锁，上一关通过才开下一关。
 * 单元的状态由它的关卡决定：全部通过算通过，单元里的知识点都掌握了算掌握。
 */
export async function getPathState(): Promise<{ levels: Map<string, LevelState>; units: UnitState[] }> {
  const rows = new Map((await db.levels.toArray()).map((r) => [r.id, r]))
  const levels = new Map<string, LevelState>()
  const units: UnitState[] = []
  const prevPassed: Record<string, boolean> = { spell: true, read: true, talk: true }
  for (const u of PATH) {
    for (const l of u.levels) {
      const r = rows.get(l.id)
      const status: LevelStatus = r?.passedAt ? 'passed' : prevPassed[u.track] ? 'available' : 'locked'
      // 选学关（l.optional），和单元小测已经通过、后来才加进来的关（补课）：可以学，但不挡后面的路
      const makeUp = !r?.passedAt && !!rows.get(u.levels[u.levels.length - 1].id)?.passedAt
      levels.set(l.id, { id: l.id, status: makeUp ? 'available' : status, best: r?.best, optional: makeUp || l.optional || undefined })
      if (!l.optional) prevPassed[u.track] = status === 'passed' || makeUp
    }
    const ls = u.levels.map((l) => levels.get(l.id)!)
    let status: UnitStatus = ls.every((l) => l.status === 'passed' || l.optional) ? 'passed' : ls[0].status === 'locked' ? 'locked' : 'available'
    if (status === 'passed') {
      const kcs = [...new Set(u.levels.filter((l) => !l.optional).flatMap((l) => l.kcs))]
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

/** 字母（L:）、元音（V:）和字母元音组合（CV:）由每日字卡负责复习，这里不出 */
export const drillKC = (kc: KC) => kc.startsWith('L:') || kc.startsWith('CV:') || kc.startsWith('V:')

export async function dueKCs(limit = 20): Promise<KC[]> {
  return (await db.cards.where('due').belowOrEqual(Date.now()).filter((r) => !drillKC(r.kc)).limit(limit).primaryKeys()) as KC[]
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
