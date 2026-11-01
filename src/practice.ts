import { db } from './db.ts'
import { dailyDue } from './alphabet.ts'
import { PATH, levelById, unitByN, type Track } from './course.ts'
import { dueChecks, dueKCs, ensureChecks, getPathState } from './progress.ts'
import { dayKey } from './daily.ts'

/**
 * 今日练习：每天打开 App 自动开始，一步接一步做完。
 * 1. 字卡（做完就算签到）
 * 2. 到期的单元抽查（最多 2 次）
 * 3. 到期的复习（最多 15 题）
 * 4. 拼读线的下一关
 * 5. 诵读开篇的下一关（一关一句或半句；没过就停在这关，明天再来）
 * 6. 安多会话的下一关（新句子一关 3–4 句）
 * 当天第一次打开时排好，之后一整天不变；没到期的复习、抽查到时自动跳过。
 * 一天大约 DAILY_BUDGET 题：复习多的日子先省掉会话、开篇的新内容（做完后可以点“再学一点”加回来）。
 */
export type StepKey = string // 'drill' | 'check:<id>' | 'review' | 'next:<线>'

/** 每条线在今日练习里一步，一步最多连着做几关 */
export const PER_DAY: Record<Track, number> = { spell: 1, read: 1, talk: 1 }
const CHECKS_PER_DAY = 2
export const REVIEW_SIZE = 15

/** failed：做完了但这一关没过的步骤（清单上标“未过，明天再来”） */
/** extra：因为今天复习多、超出总量而先省掉的新内容，做完后可以点“再学一点”加回来 */
export type DayPlan = { date: string; steps: StepKey[]; done: StepKey[]; failed?: StepKey[]; extra?: StepKey[] }
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
  const plan: DayPlan = { date: today, done: [], ...(await buildSteps()) }
  await db.settings.put({ key: KEY, value: plan })
  return plan
}

export async function markStep(key: StepKey, failed = false) {
  const plan = await loadPlan()
  if (!plan.done.includes(key)) plan.done.push(key)
  if (failed && !plan.failed?.includes(key)) plan.failed = [...(plan.failed ?? []), key]
  await db.settings.put({ key: KEY, value: plan })
  return plan
}

/**
 * 一天大约做多少题。字卡、抽查、到期复习一定做；剩下的额度按 拼读 → 诵读开篇 → 安多会话 的顺序排新内容，
 * 排不下的放进 extra（做完后可以点“再学一点”）。拼读至少留一关，免得复习多的日子主线停下来。
 */
export const DAILY_BUDGET = 65
/** 每一步大约多少题（含介绍卡） */
const COST: Record<string, number> = { drill: 20, check: 10, 'next:spell': 15, 'next:read': 16, 'next:talk': 10 }

async function buildSteps(): Promise<{ steps: StepKey[]; extra: StepKey[] }> {
  const steps: StepKey[] = ['drill']
  // 以前就通过、还没排抽查的单元先排上
  await ensureChecks((await getPathState()).units)
  const checks = (await dueChecks()).slice(0, CHECKS_PER_DAY)
  for (const c of checks) steps.push('check:' + c.id)
  steps.push('review')
  let used = COST.drill + checks.length * COST.check + (await dueKCs(REVIEW_SIZE)).length
  const extra: StepKey[] = []
  for (const track of ['spell', 'read', 'talk'] as Track[]) {
    const key = `next:${track}`
    if (track === 'spell' || used + COST[key] <= DAILY_BUDGET) {
      steps.push(key)
      used += COST[key]
    } else extra.push(key)
  }
  return { steps, extra }
}

/** 今天的都做完了，再加一步新内容 */
export async function addExtra(): Promise<DayPlan> {
  const plan = await loadPlan()
  const key = plan.extra?.shift()
  if (key && !plan.steps.includes(key)) plan.steps.push(key)
  await db.settings.put({ key: KEY, value: plan })
  return plan
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

/** 首页清单和每步小结里，一步的说明：做什么、大约几题、几分钟 */
export type StepInfo = { label: string; detail: string; minutes: number }
export async function stepInfo(key: StepKey): Promise<StepInfo> {
  const label = stepLabel(key)
  if (key === 'drill') return { label, detail: '字母和元音 · 做完就签到', minutes: 4 }
  if (key === 'review') {
    const n = (await dueKCs(REVIEW_SIZE)).length
    return { label, detail: n ? `${n} 题 · 按遗忘曲线到期的` : '今天没有到期的', minutes: Math.max(1, Math.round(n / 5)) }
  }
  if (key.startsWith('check:')) {
    const c = await db.checks.get(key.slice(6))
    return { label, detail: c ? `单元 ${c.unit} · 10 题` : '10 题', minutes: 2 }
  }
  const id = await levelFor(key)
  const lv = id ? levelById.get(id) : undefined
  const u = lv ? unitByN.get(lv.unit) : undefined
  const unitName = u ? (u.track === 'spell' ? `单元 ${u.n}` : u.title.replace(/^原文：/, '')) : ''
  return { label, detail: lv ? `${unitName} · ${lv.title}` : '这条线学完了', minutes: Math.round((COST[key] ?? 10) / 5) }
}
