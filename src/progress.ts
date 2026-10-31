import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs'
import { db } from './db.ts'
import { UNITS, type KC } from './course.ts'

const scheduler = fsrs()
const DAY = 24 * 3600 * 1000

export type UnitStatus = 'locked' | 'available' | 'passed' | 'mastered'
export type UnitState = { n: number; status: UnitStatus; accuracy?: number }

// 通过单元：一关正确率 ≥ 80%，且本单元每个练到的知识点都至少答对过一次。
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

export async function recordAnswer(kc: KC, ok: boolean, unit?: number) {
  const now = new Date()
  await db.attempts.add({ kc, ok, at: now.getTime(), unit })
  const row = await db.cards.get(kc)
  const card: Card = row ? reviveCard(row.card) : createEmptyCard(now)
  const next = scheduler.next(card, now, ok ? Rating.Good : Rating.Again).card
  await db.cards.put({ kc, due: next.due.getTime(), card: next })
}

function reviveCard(c: unknown): Card {
  const x = c as Card & { due: string | Date; last_review?: string | Date }
  return { ...x, due: new Date(x.due), last_review: x.last_review ? new Date(x.last_review) : undefined }
}

export async function finishUnit(n: number, accuracy: number) {
  const prev = await db.units.get(n)
  const passed = accuracy >= PASS_ACCURACY
  await db.units.put({
    n,
    best: Math.max(prev?.best ?? 0, accuracy),
    passedAt: prev?.passedAt ?? (passed ? Date.now() : undefined),
  })
  return passed
}

export async function getUnitStates(): Promise<UnitState[]> {
  const rows = new Map((await db.units.toArray()).map((r) => [r.n, r]))
  const out: UnitState[] = []
  let prevPassed = true
  for (const u of UNITS) {
    const r = rows.get(u.n)
    let status: UnitStatus = 'locked'
    if (r?.passedAt) {
      const practiced = (await db.cards.where('kc').anyOf(u.kcs).primaryKeys()) as KC[]
      const m = await Promise.all(practiced.map(kcMastered))
      status = practiced.length > 0 && m.every(Boolean) ? 'mastered' : 'passed'
    } else if (prevPassed) status = 'available'
    out.push({ n: u.n, status, accuracy: r?.best })
    prevPassed = !!r?.passedAt
  }
  // 原文单元：拼读全部通过后才算解锁；阅读器本身一直可以打开。
  const spellingDone = out.every((s) => s.status === 'passed' || s.status === 'mastered')
  out.push({ n: 11, status: spellingDone ? 'available' : 'locked' }, { n: 12, status: spellingDone ? 'available' : 'locked' })
  return out
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
