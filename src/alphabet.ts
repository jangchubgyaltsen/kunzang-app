import { LETTERS, VOWELS, cvAudio, letterAudio, shuffle } from './course.ts'
import { Rating, State, type Card } from 'ts-fsrs'
import { db } from './db.ts'
import { recordAnswer, reviveCard } from './progress.ts'
import { CV_PRON, PRON, shapeMates, soundMates } from './pron.ts'

// 字母表和每日字卡的数据。注音体系见 pron.ts（《安多藏语一本通》）。
export { PRON, CV_PRON, CV_SOURCE, SHAPE_PAIRS, HOOK_PAIRS, SOUND_PAIRS } from './pron.ts'


/** 传统排列：四个一行，最后一行两个 */
export const ROWS: string[][] = Array.from({ length: 8 }, (_, i) => LETTERS.slice(i * 4, i * 4 + 4).map((l) => l[0]))

/** 和直觉不一样、要特别留意的字 */
export const LETTER_NOTE: Record<string, string> = {
  ཀ: '注 ga，但和 ག 读音不同',
  ག: '注音同 ཀ，实际是浊音',
  ཇ: '注音同 ཅ，实际是浊音',
  ད: '注音同 ཏ，实际是浊音',
  བ: '安多话读 wa，不读 ba',
  ཛ: '注音同 ཙ，实际是浊音',
  ཞ: '读 x，不读 zh',
  ཟ: '读 s，不读 z',
  ཤ: '注音同 ཞ',
  ས: '注音同 ཟ',
}


export const shapeLetters = [...shapeMates.keys()]

/** 元音：位置和名称 */
export const VOWEL_INFO: { mark: string; pos: '上' | '下'; name: string; examples: [string, string][] }[] = [
  { mark: 'ི', pos: '上', name: VOWELS[0][2], examples: [['ཀི', 'ge'], ['མི', 'me'], ['ཞི', 'xi'], ['རི', 'ri']] },
  { mark: 'ུ', pos: '下', name: VOWELS[1][2], examples: [['ཀུ', 'ge'], ['སུ', 'se'], ['ཕུ', 'pu'], ['ཞུ', 'xie']] },
  { mark: 'ེ', pos: '上', name: VOWELS[2][2], examples: [['ཀེ', 'gei'], ['མེ', 'mei'], ['ཆེ', 'qie'], ['དེ', 'di']] },
  { mark: 'ོ', pos: '上', name: VOWELS[3][2], examples: [['ཁོ', 'ko'], ['མོ', 'mu'], ['ལོ', 'luo'], ['འོ', 'ao']] },
]

export const cvAudioOf = (s: string) => cvAudio(s[0], s[1])
export const CV_MARKS = VOWELS.map((v) => v[0])
export const cvPron = (s: string) => CV_PRON[s]?.[0]

const wylieOf = new Map(LETTERS)
const vowelLatin = new Map(VOWELS.map(([m, v]) => [m, v]))

/** 一张字卡：一个字母、一个元音符号，或一个字母 + 元音组合。src：组合注音的来源（见 CV_PRON）；note：卡上的补充说明 */
export type DrillItem = { key: string; tib: string; pron: string; hanzi?: string; wylie: string; audio: string; base: string; src?: 0 | 1 | 2; note?: string }

export const letterItem = (l: string): DrillItem => ({
  key: 'L:' + l, tib: l, pron: PRON[l][0], hanzi: PRON[l][1], wylie: wylieOf.get(l)!, audio: letterAudio(l), base: l,
})
export const cvItem = (s: string): DrillItem => ({
  key: 'CV:' + s, tib: s, pron: CV_PRON[s][0], src: CV_PRON[s][1], wylie: wylieOf.get(s[0])!.replace(/a$/, '') + vowelLatin.get(s[1]), audio: cvAudioOf(s), base: s[0],
})

/** 单独的元音符号：写成 ◌ི，读音是转写字母（i u e o），录音放 ཨ 加这个元音 */
export const vowelItem = (m: string): DrillItem => {
  const v = VOWEL_INFO.find((x) => x.mark === m)!
  return {
    key: 'V:' + m, tib: '◌' + m, pron: vowelLatin.get(m)!, hanzi: v.name, wylie: vowelLatin.get(m)!, audio: cvAudioOf('ཨ' + m), base: '◌',
    note: `写在字母${v.pos}面，叫 ${v.name}。和 ཨ 拼成 ཨ${m}，安多话读 ${CV_PRON['ཨ' + m][0]}`,
  }
}

const LETTER_CARDS = ROWS.flat().map(letterItem)
export const VOWEL_CARDS = CV_MARKS.map(vowelItem)
const CV_CARDS = ROWS.flat().flatMap((l) => CV_MARKS.map((m) => cvItem(l + m)))
/**
 * 全部 154 张，学的顺序：先学 30 个字母和 4 个元音（元音放在第一行字母后面），
 * 再学 120 个字母 + 元音组合（某个字母和 4 个元音都“有点熟了”才开始考这个字母的组合，见 unlocked）。
 */
export const BASIC_CARDS: DrillItem[] = [...LETTER_CARDS.slice(0, 4), ...VOWEL_CARDS, ...LETTER_CARDS.slice(4)]
export const ALL_CARDS: DrillItem[] = [...BASIC_CARDS, ...CV_CARDS]

/** 一个组合拆开怎么读：ཀི = ཀ ga + ◌ི（གི་གུ）→ ge */
export function splitOf(it: DrillItem): { parts: [string, string][]; result: string } | undefined {
  if (!it.key.startsWith('CV:')) return
  const v = VOWEL_INFO.find((x) => x.mark === it.tib[1])!
  return { parts: [[it.base, PRON[it.base][0]], ['◌' + v.mark, `${vowelLatin.get(v.mark)} · ${v.name}`]], result: it.pron }
}

/** 两个字是不是书上成对比较的：形近，或发音相近 */
export const isLookalike = (a: string, b: string) => !!shapeMates.get(a)?.has(b)
export const isSoundPair = (a: string, b: string) => !!soundMates.get(a)?.has(b)
/** 两张卡的元音一样（字母卡算没有元音） */
const sameVowel = (a: DrillItem, b: DrillItem) => (a.tib[1] ?? '') === (b.tib[1] ?? '')

/**
 * 出题方式：
 * read：看字选注音（考读音）；
 * hear：听真人录音选字，干扰项是书上的形近字和发音相近的字（考形近字、辨音）。
 */
export type Mode = 'read' | 'hear'

/** 四个选项：答案 + 书上成对比较的字 + 同一个字母的其他组合 + 其他 */
export function optionsFor(it: DrillItem, mode: Mode, known?: Set<string>): DrillItem[] {
  // 干扰项只用已经见过的卡（known）；见过的不够两个，才拿没见过的补到两个
  const usable = (xs: DrillItem[]) => {
    if (!known) return xs
    const k = xs.filter((x) => x.key === it.key || known.has(x.key))
    return k.length >= 3 ? k : [...k, ...xs.filter((x) => !k.includes(x))]
  }
  if (it.key.startsWith('V:')) {
    // 元音：在另外三个元音里选；听音时 ཨི ཨུ 安多话都读 e，听不出来，不同时出现
    const heard = (x: DrillItem) => CV_PRON['ཨ' + x.tib[1]][0]
    return shuffle([it, ...usable(VOWEL_CARDS).filter((x) => x.key !== it.key && (mode === 'read' || heard(x) !== heard(it))).slice(0, 3)])
  }
  const all = usable(it.key.startsWith('CV:') ? CV_CARDS : LETTER_CARDS)
  const mates = all.filter((x) => sameVowel(x, it) && (isLookalike(it.base, x.base) || isSoundPair(it.base, x.base)))
  const sameBase = all.filter((x) => x.base === it.base)
  const picked: DrillItem[] = []
  for (const group of [shuffle(mates), shuffle(sameBase), shuffle(all)])
    for (const x of group) {
      if (picked.length >= 3) break
      if (x.key === it.key || picked.some((p) => p.key === x.key)) continue
      if (mode === 'read') {
        // 看字选注音：注音一样的选项分不出来，不能同时出现
        if (x.pron === it.pron || picked.some((p) => p.pron === x.pron)) continue
      } else if (x.pron === it.pron && !isSoundPair(it.base, x.base)) continue // 书上读音一样的（ཀི ཀུ 都是 ge、བ ཝ 都是 wa）听不出来；ཀ/ག 这种要专门练
      picked.push(x)
    }
  // 见过的字还不多时（第一天），只出两三个选项，不拿没学的字凑数
  const few = known ? picked.filter((x) => known.has(x.key)) : picked
  return shuffle([it, ...(few.length >= 2 ? few : picked.slice(0, Math.max(2, few.length)))])
}

// ---- 熟练度和复习间隔 ----
// 字卡和路径、复习共用同一份 FSRS 记录（db.cards），键就是 L:ཀ、CV:ཀི。
// 看到后 3 秒内答对算“一眼认出”，记 Good；答对但慢记 Hard；答错记 Again。
// FSRS 算出的记忆稳定度到 4 天以上，就算熟了（字母表上亮金色）。

export const FAST_MS = 3000
export const FLUENT_DAYS = 4
/** 一张字卡的记录，从 FSRS 卡片里读出来 */
export type Stat = { seen: number; due: number; stability: number; review: boolean; at?: number }

const toStat = (c: Card): Stat => ({
  seen: c.reps, due: new Date(c.due).getTime(), stability: c.stability, review: c.state === State.Review,
  at: c.last_review ? new Date(c.last_review).getTime() : undefined,
})

export async function loadStats(): Promise<Record<string, Stat>> {
  const rows = await db.cards.where('kc').startsWithAnyOf('L:', 'CV:', 'V:').toArray()
  return Object.fromEntries(rows.map((r) => [r.kc, toStat(reviveCard(r.card))]))
}
export const isFluent = (s?: Stat) => !!s && s.review && s.stability >= FLUENT_DAYS
/** 有点熟了：至少答过两次，最近一次没答错（FSRS 在复习状态） */
export const isWarm = (s?: Stat) => !!s && s.review && s.seen >= 2

/**
 * 现在能考的卡：30 个字母和 4 个元音一直能考；
 * 一个字母的 4 个组合，要这个字母和 4 个元音都有点熟了才开始考。已经见过的卡一直留着复习。
 */
export function unlocked(stats: Record<string, Stat>): DrillItem[] {
  const vowelsWarm = VOWEL_CARDS.every((x) => isWarm(stats[x.key]))
  return ALL_CARDS.filter((x) => !x.key.startsWith('CV:') || stats[x.key]?.seen || (vowelsWarm && isWarm(stats['L:' + x.base])))
}
export const letterUnlocked = (stats: Record<string, Stat>, l: string) =>
  VOWEL_CARDS.every((x) => isWarm(stats[x.key])) && isWarm(stats['L:' + l])

export const today = () => new Date().toLocaleDateString('sv')
const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** 记一次字卡作答，写进 FSRS，返回更新后的记录 */
export async function record(key: string, ok: boolean, ms: number): Promise<Stat> {
  const card = await recordAnswer(key, ok, undefined, 'drill', !ok ? Rating.Again : ms <= FAST_MS ? Rating.Good : Rating.Hard, { ms })
  return toStat(card)
}

/** 字卡练习里的一步：新卡先看一遍（intro），然后看字选注音（read）或听音选字（hear）；retry 是答错后加的补练，不算进度 */
export type Step = { it: DrillItem; intro?: boolean; mode: Mode; retry?: boolean }

const noRepeat = (q: Step[]) => {
  for (let i = 1; i < q.length; i++)
    if (q[i].it.key === q[i - 1].it.key) {
      const j = q.findIndex((x, k) => k > i && x.it.key !== q[i].it.key && x.it.key !== q[i - 1].it.key)
      if (j > 0) [q[i], q[j]] = [q[j], q[i]]
    }
  return q
}

/** 每天一组字卡的张数（一张考一题） */
export const DAILY_CARDS = 15
/** 积压再多，每天也至少带这么多张新卡（正好一个字母和它的四个组合） */
export const MIN_NEW = 5
/** 刚开始的几天（做过字卡不到 EARLY_DAYS 天），每天新卡最多这么多张 */
export const EARLY_NEW = 8
export const EARLY_DAYS = 7
/** 新卡几张一组：一组先看介绍，马上考这一组，再看下一组 */
const GROUP = 4

/** 到期没复习的卡有几张；新卡还剩几张没见过 */
export function cardCounts(stats: Record<string, Stat>) {
  const t = endOfToday()
  const seen = ALL_CARDS.filter((x) => stats[x.key]?.seen)
  const open = unlocked(stats)
  return {
    due: seen.filter((x) => stats[x.key].due <= t).length, fresh: ALL_CARDS.length - seen.length,
    fluent: ALL_CARDS.filter((x) => isFluent(stats[x.key])).length, open: open.length, freshOpen: open.filter((x) => !stats[x.key]?.seen).length,
  }
}

/**
 * 每天早上的字卡，一共 15 张，每张考一题（只从 unlocked 里出：先字母和元音，熟了再加组合；刚开始几天新卡最多 newCap 张）：
 * 1. 到期的卡（答错过的、到了复习日子的）优先，记得越不牢（FSRS 稳定度越低）越先考，看字选注音和听音选字轮着来；
 * 2. 剩下的位置按学的顺序带新卡（字母和元音在前，组合在后），先看一遍再考；积压再多也至少带 5 张新卡（如果有能带的）；
 * 3. 两样加起来不到 15 张时（比如能考的都见过了），用最久没见的卡补够。
 * 答错的过几题再考一次，不占这 15 张。
 * all：现在能考的全部过一遍，每张一题。
 */
export function buildDaily(stats: Record<string, Stat>, all = false, newCap = Infinity): Step[] {
  const t = endOfToday()
  const open = unlocked(stats)
  if (all) return noRepeat(shuffle(open).map((it, i) => ({ it, mode: i % 2 ? 'hear' : 'read' })))
  const seen = ALL_CARDS.filter((x) => stats[x.key]?.seen)
  const unseen = open.filter((x) => !stats[x.key]?.seen)
  const dueAll = seen
    .filter((x) => stats[x.key].due <= t)
    .sort((a, b) => stats[a.key].stability - stats[b.key].stability || stats[a.key].due - stats[b.key].due)
  const nNew = Math.min(unseen.length, newCap, Math.max(MIN_NEW, DAILY_CARDS - dueAll.length))
  const fresh = unseen.slice(0, nNew)
  const due = dueAll.slice(0, DAILY_CARDS - fresh.length)
  const picked = new Set([...due, ...fresh].map((x) => x.key))
  const extra = [...seen]
    .filter((x) => !picked.has(x.key))
    .sort((a, b) => (stats[a.key].at ?? 0) - (stats[b.key].at ?? 0))
    .slice(0, Math.max(0, DAILY_CARDS - picked.size))
  const old = shuffle([...due, ...extra].map((it): Step => ({ it, mode: (stats[it.key]?.seen ?? 0) % 2 ? 'hear' : 'read' })))
  // 新卡 4 张一组：看完一组的介绍马上考这一组，旧卡穿插在各组之间
  const groups: DrillItem[][] = []
  for (let k = 0; k < fresh.length; k += GROUP) groups.push(fresh.slice(k, k + GROUP))
  const share = Math.ceil(old.length / (groups.length + 1))
  const out: Step[] = []
  groups.forEach((g, k) => {
    out.push(...old.slice(k * share, (k + 1) * share))
    out.push(...g.map((it): Step => ({ it, intro: true, mode: 'read' })))
    const q = noRepeat(shuffle(g.map((it, j): Step => ({ it, mode: j % 2 ? 'hear' : 'read' }))))
    // 刚看完介绍的那张不紧接着考
    if (q.length > 1 && q[0].it.key === g[g.length - 1].key) q.push(q.shift()!)
    out.push(...q)
  })
  out.push(...old.slice(groups.length * share))
  return out
}

// ---- 做到一半退出：记住今天这一组做到哪了，回来接着做 ----
const SESSION_KEY = 'alphabet-session'
type SavedStep = { key: string; intro?: boolean; mode: Mode; retry?: boolean }
export type DrillLog = { key: string; ok: boolean; ms: number }[]
type Session = { date: string; steps: SavedStep[]; i: number; log: DrillLog }
const cardByKey = new Map(ALL_CARDS.map((x) => [x.key, x]))

/** 今天没做完的那一组；没有就返回 undefined */
export async function loadSession(): Promise<{ steps: Step[]; i: number; log: DrillLog } | undefined> {
  const s = (await db.settings.get(SESSION_KEY))?.value as Session | undefined
  if (!s || s.date !== today() || s.i >= s.steps.length) return
  const steps = s.steps.filter((x) => cardByKey.has(x.key)).map((x) => ({ it: cardByKey.get(x.key)!, intro: x.intro, mode: x.mode, retry: x.retry }))
  return { steps, i: Math.min(s.i, steps.length), log: s.log ?? [] }
}
export async function saveSession(steps: Step[], i: number, log: DrillLog) {
  const value: Session = { date: today(), steps: steps.map((x) => ({ key: x.it.key, intro: x.intro, mode: x.mode, retry: x.retry })), i, log }
  await db.settings.put({ key: SESSION_KEY, value })
}

// 每天第一次打开 App 自动弹出，做完才算今天做过
const DAILY_KEY = 'alphabet-daily'
export async function dailyDue() {
  return (await db.settings.get(DAILY_KEY))?.value !== today()
}
/** 做完当天的字卡：记下“今天做过了”，同时算签到（一天一次，重做只留更好的成绩） */
export async function markDailyDone(score = 0, total = 0) {
  const date = today()
  await db.settings.put({ key: DAILY_KEY, value: date })
  const prev = await db.checkins.get(date)
  if (!prev || score > prev.score) await db.checkins.put({ date, game: 'drill', score, total, at: prev?.at ?? Date.now() })
}
