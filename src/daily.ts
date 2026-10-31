import { db } from './db.ts'
import { passages } from './content.ts'
import { UNITS, shuffle, wordMap, type KC } from './course.ts'
import { dueKCs, getUnitStates, weakKCs } from './progress.ts'

export type GameKind = 'flip' | 'quiz' | 'build' | 'words'

export const GAMES: Record<GameKind, { name: string; desc: string; timed: boolean }> = {
  flip: { name: '翻牌配对', desc: '翻出藏文和对应的转写，配成一对', timed: false },
  quiz: { name: '快问快答', desc: '60 秒判断对错，连对有连击', timed: true },
  build: { name: '拼音节', desc: '听读音，把字一个个拼成音节', timed: false },
  words: { name: '词义连连看', desc: '把藏文词和中文意思连起来', timed: false },
}

// 星期一 … 星期日
const WEEK: GameKind[] = ['flip', 'quiz', 'build', 'words', 'flip', 'quiz', 'build']

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const weekOf = (d: Date) => dayKey(addDays(d, -((d.getDay() + 6) % 7))) // 该周星期一

// 规则（R:）没法单独出现在游戏里
const playable = (k: KC) => !k.startsWith('R:')
/** 单音节的东西才能拿来拼：开篇音节，或者只有一个音节的词 */
export const buildable = (k: KC) => k.startsWith('S:') || (k.startsWith('W:') && wordMap.get(k.slice(2))?.syllables.length === 1)

/** 已学池：复习队列里已有卡片的知识点 + 已通过单元的全部知识点。 */
export async function learnedPool() {
  const carded = (await db.cards.toCollection().primaryKeys()) as KC[]
  const states = await getUnitStates()
  const passed = UNITS.filter((u) => ['passed', 'mastered'].includes(states.find((s) => s.n === u.n)?.status ?? ''))
  const learned = new Set([...carded, ...passed.flatMap((u) => [...u.kcs, ...u.extra])].filter(playable))
  const next = UNITS.find((u) => states.find((s) => s.n === u.n)?.status === 'available')
  const preview = next?.kcs.find((k) => playable(k) && !learned.has(k))
  const words = [...learned].filter((k) => k.startsWith('W:'))
  return { learned: [...learned], words, preview }
}

/** 约 60% 取快到期和最近答错的，其余从已学池随机抽。 */
export async function chooseItems(pool: KC[], n: number) {
  const inPool = new Set(pool)
  const urgent = [...new Set([...(await dueKCs(50)), ...(await weakKCs())])].filter((k) => inPool.has(k))
  const head = shuffle(urgent).slice(0, Math.ceil(n * 0.6))
  const rest = shuffle(pool.filter((k) => !head.includes(k)))
  return shuffle([...head, ...rest].slice(0, n))
}

export type TodayPlan = { game: GameKind; items: KC[]; tasting: boolean; preview?: KC }

const enough = (g: GameKind, p: Awaited<ReturnType<typeof learnedPool>>) => {
  if (g === 'build') return p.learned.filter(buildable).length >= 4
  if (g === 'words') return p.words.length >= 4
  return p.learned.length >= 4
}

/** 今天的游戏由星期决定；内容不够时按顺序换成能玩的。 */
export async function planToday(date = new Date(), force?: GameKind): Promise<TodayPlan> {
  const p = await learnedPool()
  if (p.learned.length < 4) {
    // 新用户尝鲜：第 1 单元的字母，不记分
    return { game: 'flip', items: UNITS[0].kcs.filter((k) => k.startsWith('L:')).slice(0, 6), tasting: true }
  }
  const first = force ?? WEEK[(date.getDay() + 6) % 7]
  const order: GameKind[] = [first, 'flip', 'quiz']
  const game = order.find((g) => enough(g, p))!
  const pool = game === 'words' ? p.words : game === 'build' ? p.learned.filter(buildable) : p.learned
  const n = { flip: 6, quiz: 30, build: 6, words: 5 }[game]
  return { game, items: await chooseItems(pool, n), tasting: false, preview: game === 'flip' ? p.preview : undefined }
}

export function availableGames(p: Awaited<ReturnType<typeof learnedPool>>) {
  return (Object.keys(GAMES) as GameKind[]).filter((g) => enough(g, p))
}

export async function saveCheckin(game: GameKind, score: number, total: number) {
  const date = dayKey()
  const prev = await db.checkins.get(date)
  // 一天只记一次签到；重玩只更新更好的分数
  if (!prev || score > prev.score) await db.checkins.put({ date, game, score, total, at: prev?.at ?? Date.now() })
  return !prev
}

/** 连续天数：每个自然周（周一到周日）可以有 1 天没签，不算中断。 */
export async function streakInfo(today = new Date()) {
  const rows = await db.checkins.toArray()
  const done = new Set(rows.map((r) => r.date))
  const rest = new Set<string>()
  const restWeeks = new Set<string>()
  let streak = 0
  let d = done.has(dayKey(today)) ? today : addDays(today, -1)
  const earliest = rows.map((r) => r.date).sort()[0]
  while (earliest && dayKey(d) >= earliest) {
    const k = dayKey(d)
    if (done.has(k)) streak++
    else if (!restWeeks.has(weekOf(d)) && done.has(dayKey(addDays(d, -1)))) {
      restWeeks.add(weekOf(d))
      rest.add(k)
    } else break
    d = addDays(d, -1)
  }
  return { streak, total: done.size, today: done.has(dayKey(today)), done, rest }
}

/** 今日一句：开篇原文按天轮换一行。 */
export function lineOfDay(date = new Date()) {
  const all = passages.flatMap((p) => p.lines.map((l, i) => ({ passage: p, line: l, i })))
  const n = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
  return all[n % all.length]
}
