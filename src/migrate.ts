import { createEmptyCard, State, type Card } from 'ts-fsrs'
import { db } from './db.ts'
import { PATH, type KC } from './course.ts'
import { PASS_ACCURACY } from './progress.ts'

/**
 * 一次性的数据升级，App 启动时（和导入备份后）跑一次：
 * 1. 旧版字卡自己用“盒子”记熟练度（settings 里的 alphabet-stats），搬进 FSRS（db.cards），和路径共用一份记录。
 *    路径里已经有卡片的字母，保留路径的记录。
 * 2. 拼读路径 1–9 单元改成了按字母表顺序，关卡里的内容变了，旧的通过记录对不上。
 *    按现在的内容重新算：一关里的知识点都练过（有卡片）就算通过；没通过的单元，旧的抽查计划删掉。
 */
const FLAG = 'migrated-v2'
const DAY = 24 * 3600 * 1000
const GAP_DAYS = [0, 1, 2, 4, 7, 15, 30]
type OldStat = { fast: number; seen: number; ok: number; at?: number; box?: number; due?: string }

export async function migrate() {
  if ((await db.settings.get(FLAG))?.value) return
  await moveDrillStats()
  await relayoutSpell()
  await db.settings.put({ key: FLAG, value: Date.now() })
}

async function moveDrillStats() {
  const old = (await db.settings.get('alphabet-stats'))?.value as Record<string, OldStat> | undefined
  if (!old) return
  for (const [kc, s] of Object.entries(old)) {
    if (!s?.seen || (await db.cards.get(kc))) continue
    const box = Math.min(s.box ?? s.fast ?? 0, GAP_DAYS.length - 1)
    const at = s.at ?? Date.now()
    const due = s.due ? new Date(s.due + 'T00:00:00').getTime() : at + GAP_DAYS[box] * DAY
    const card: Card = {
      ...createEmptyCard(new Date(at)),
      state: State.Review,
      stability: Math.max(GAP_DAYS[box], 0.5),
      difficulty: 5,
      reps: s.seen,
      lapses: Math.max(0, s.seen - (s.ok ?? 0)),
      scheduled_days: GAP_DAYS[box],
      last_review: new Date(at),
      due: new Date(due),
    }
    await db.cards.put({ kc, due, card })
  }
}

async function relayoutSpell() {
  const units = PATH.filter((u) => u.track === 'spell' && u.n <= 9)
  const nums = units.map((u) => u.n)
  const oldRows = (await db.levels.toArray()).filter((r) => nums.includes(r.unit))
  if (!oldRows.length) return
  const seen = new Set((await db.cards.toCollection().primaryKeys()) as KC[])
  const now = Date.now()
  await db.levels.bulkDelete(oldRows.map((r) => r.id))
  for (const u of units) {
    for (const l of u.levels)
      if (l.kcs.length && l.kcs.every((k) => seen.has(k))) await db.levels.put({ id: l.id, unit: u.n, passedAt: now, best: PASS_ACCURACY, plays: 1 })
    const test = u.levels[u.levels.length - 1]
    if (!(await db.levels.get(test.id))?.passedAt) await db.checks.where('unit').equals(u.n).delete()
  }
}
