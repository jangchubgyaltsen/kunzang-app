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

/** 一张字卡：一个字母，或一个字母 + 元音组合。src：组合注音的来源（见 CV_PRON） */
export type DrillItem = { key: string; tib: string; pron: string; hanzi?: string; wylie: string; audio: string; base: string; src?: 0 | 1 | 2 }

export const letterItem = (l: string): DrillItem => ({
  key: 'L:' + l, tib: l, pron: PRON[l][0], hanzi: PRON[l][1], wylie: wylieOf.get(l)!, audio: letterAudio(l), base: l,
})
export const cvItem = (s: string): DrillItem => ({
  key: 'CV:' + s, tib: s, pron: CV_PRON[s][0], src: CV_PRON[s][1], wylie: wylieOf.get(s[0])!.replace(/a$/, '') + vowelLatin.get(s[1]), audio: cvAudioOf(s), base: s[0],
})

/** 全部 150 张：按字母表顺序，每个字母后面跟它的四个元音组合 */
export const ALL_CARDS: DrillItem[] = ROWS.flat().flatMap((l) => [letterItem(l), ...CV_MARKS.map((m) => cvItem(l + m))])
const LETTER_CARDS = ALL_CARDS.filter((x) => x.key.startsWith('L:'))
const CV_CARDS = ALL_CARDS.filter((x) => x.key.startsWith('CV:'))

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
export function optionsFor(it: DrillItem, mode: Mode): DrillItem[] {
  const all = it.key.startsWith('CV:') ? CV_CARDS : LETTER_CARDS
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
  return shuffle([it, ...picked])
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
  const rows = await db.cards.where('kc').startsWithAnyOf('L:', 'CV:').toArray()
  return Object.fromEntries(rows.map((r) => [r.kc, toStat(reviveCard(r.card))]))
}
export const isFluent = (s?: Stat) => !!s && s.review && s.stability >= FLUENT_DAYS

export const today = () => new Date().toLocaleDateString('sv')
const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** 记一次字卡作答，写进 FSRS，返回更新后的记录 */
export async function record(key: string, ok: boolean, ms: number): Promise<Stat> {
  const card = await recordAnswer(key, ok, undefined, 'drill', ms <= FAST_MS ? Rating.Good : Rating.Hard)
  return toStat(card)
}

/** 字卡练习里的一步：新卡先看一遍（intro），然后看字选注音（read）或听音选字（hear） */
export type Step = { it: DrillItem; intro?: boolean; mode: Mode }

const noRepeat = (q: Step[]) => {
  for (let i = 1; i < q.length; i++)
    if (q[i].it.key === q[i - 1].it.key) {
      const j = q.findIndex((x, k) => k > i && x.it.key !== q[i].it.key && x.it.key !== q[i - 1].it.key)
      if (j > 0) [q[i], q[j]] = [q[j], q[i]]
    }
  return q
}

/** 每天最多带几张新卡（一个字母和它的四个组合算 5 张） */
export const NEW_PER_DAY = 15
const DUE_MAX = 60

/** 到期没复习的卡有几张；新卡还剩几张没见过 */
export function cardCounts(stats: Record<string, Stat>) {
  const t = endOfToday()
  const seen = ALL_CARDS.filter((x) => stats[x.key]?.seen)
  return { due: seen.filter((x) => stats[x.key].due <= t).length, fresh: ALL_CARDS.length - seen.length, fluent: ALL_CARDS.filter((x) => isFluent(stats[x.key])).length }
}

/**
 * 每天早上的字卡：
 * 1. 到期的卡（答错过的、到了复习日子的），盒子越低越先考，一张一题，看字选注音和听音选字轮着来；
 * 2. 按字母表顺序带进新卡：先看一遍，再看字选注音、听音选字各考一次。
 * all：150 张全部过一遍，每张一题。
 */
export function buildDaily(stats: Record<string, Stat>, all = false): Step[] {
  const t = endOfToday()
  if (all) return noRepeat(shuffle(ALL_CARDS).map((it, i) => ({ it, mode: i % 2 ? 'hear' : 'read' })))
  const seen = ALL_CARDS.filter((x) => stats[x.key]?.seen)
  const due = seen
    .filter((x) => stats[x.key].due <= t)
    .sort((a, b) => stats[a.key].stability - stats[b.key].stability || stats[a.key].due - stats[b.key].due)
    .slice(0, DUE_MAX)
  // 积压太多时少带新卡
  const nNew = due.length >= 40 ? 0 : due.length >= 20 ? 5 : NEW_PER_DAY
  const fresh = ALL_CARDS.filter((x) => !stats[x.key]?.seen).slice(0, nNew)
  // 一张都不到期、也没有新卡时，挑最久没见的 10 张复习
  const extra = due.length || fresh.length ? [] : [...seen].sort((a, b) => (stats[a.key].at ?? 0) - (stats[b.key].at ?? 0)).slice(0, 10)
  const quiz: Step[] = [
    ...[...due, ...extra].map((it): Step => ({ it, mode: (stats[it.key]?.seen ?? 0) % 2 ? 'hear' : 'read' })),
    ...fresh.flatMap((it): Step[] => [{ it, mode: 'read' }, { it, mode: 'hear' }]),
  ]
  return [...fresh.map((it): Step => ({ it, intro: true, mode: 'read' })), ...noRepeat(shuffle(quiz))]
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
