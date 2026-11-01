import { db } from './db.ts'
import { dailyDue } from './alphabet.ts'
import { PATH, type Track } from './course.ts'
import { dueChecks, dueKCs, ensureChecks, getPathState } from './progress.ts'
import { dayKey } from './daily.ts'

/**
 * 今日练习：每天打开 App 自动开始，一步接一步做完。
 * 1. 字卡（做完就算签到）
 * 2. 到期的单元抽查（最多 2 次）
 * 3. 到期的复习（最多 15 题）
 * 4. 拼读线的下一关
 * 5. 诵读开篇（一步里连着做两关，一关一句或半句；没过就停在这关，明天再来）
 * 6. 安多会话的下一关（新句子一关 3–4 句）
 * 当天第一次打开时排好，之后一整天不变；没到期的复习、抽查到时自动跳过。
 */
export type StepKey = string // 'drill' | 'check:<id>' | 'review' | 'next:<线>'

/** 每条线在今日练习里一步，一步最多连着做几关 */
export const PER_DAY: Record<Track, number> = { spell: 1, read: 2, talk: 1 }
const CHECKS_PER_DAY = 2
export const REVIEW_SIZE = 15

export type DayPlan = { date: string; steps: StepKey[]; done: StepKey[] }
const KEY = 'practice-day'

export async function loadPlan(): Promise<DayPlan> {
  const today = dayKey()
  const saved = (await db.settings.get(KEY))?.value as DayPlan | undefined
  if (saved?.date === today) {
    // 旧版本一条线排成好几步（next:read:0、next:read:1），合成一步
    const steps = [...new Set(saved.steps.map((k) => k.replace(/^(next:\w+):\d+$/, '$1')))]
    const done = [...new Set(saved.done.map((k) => k.replace(/^(next:\w+):\d+$/, '$1')))]
    return { ...saved, steps, done }
  }
  const plan: DayPlan = { date: today, steps: await buildSteps(), done: [] }
  await db.settings.put({ key: KEY, value: plan })
  return plan
}

export async function markStep(key: StepKey) {
  const plan = await loadPlan()
  if (!plan.done.includes(key)) plan.done.push(key)
  await db.settings.put({ key: KEY, value: plan })
  return plan
}

async function buildSteps(): Promise<StepKey[]> {
  const steps: StepKey[] = ['drill']
  // 以前就通过、还没排抽查的单元先排上
  await ensureChecks((await getPathState()).units)
  for (const c of (await dueChecks()).slice(0, CHECKS_PER_DAY)) steps.push('check:' + c.id)
  steps.push('review')
  for (const track of ['spell', 'read', 'talk'] as Track[]) steps.push(`next:${track}`)
  return steps
}

/**
 * 'next:read' 这类步骤：做到这一步时，再看这条线上现在该做哪一关。
 * 同一条线上下一关要等前一关通过才解锁，所以不能一早就定死是哪一关。
 */
export async function levelFor(key: StepKey): Promise<string | undefined> {
  const track = key.split(':')[1] as Track
  const st = await getPathState()
  const open = PATH.filter((u) => u.track === track)
    .flatMap((u) => u.levels)
    .filter((l) => st.levels.get(l.id)?.status === 'available')
  // 主线上的关优先，补课关（单元通过后才加进来的）放后面
  return (open.find((l) => !st.levels.get(l.id)?.optional) ?? open[0])?.id
}

/** 这一步现在还有没有东西可做（没到期的复习、抽查，学完了的线，都跳过） */
export async function stepHasWork(key: StepKey) {
  if (key === 'drill') return dailyDue()
  if (key === 'review') return (await dueKCs(1)).length > 0
  if (key.startsWith('check:')) {
    const c = await db.checks.get(key.slice(6))
    return !!c && !c.doneAt
  }
  if (key.startsWith('next:')) return !!(await levelFor(key))
  return false
}

export function stepLabel(key: StepKey) {
  if (key === 'drill') return '字卡'
  if (key === 'review') return '到期复习'
  if (key.startsWith('check:')) return '单元抽查'
  return { spell: '拼读', read: '诵读开篇', talk: '安多会话' }[key.split(':')[1] as Track] ?? '练习'
}
