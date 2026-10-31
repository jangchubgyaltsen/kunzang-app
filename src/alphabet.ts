import { LETTERS, LETTER_NOTE, PRON, VOWELS, cvAudio, letterAudio, shuffle } from './course.ts'

export { LETTER_NOTE, PRON }
import { db } from './db.ts'

// 字母表和“看字念音”练习的数据。
// 注音和汉字近音照《安多藏语一本通》第一章抄录（见 content/安多读音对照表-v0.md 第 1、2 节）。
// 书上 ཀ/ག、ཏ/ད 这类清浊字注音相同，实际读音不同，以音频为准。

/** 传统排列：四个一行，最后一行两个 */
export const ROWS: string[][] = Array.from({ length: 8 }, (_, i) => LETTERS.slice(i * 4, i * 4 + 4).map((l) => l[0]))

/** 《一本通》第一、二课练习里成对比较字形的字 */
export const SHAPE_PAIRS: [string, string][] = [
  ['ཁ', 'ག'], ['ཀ', 'ག'], ['ང', 'ད'], ['ད', 'ཏ'], ['པ', 'ཕ'], ['པ', 'བ'], ['ཉ', 'ན'], ['མ', 'ན'],
  ['ཙ', 'ཚ'], ['ཇ', 'ཟ'], ['འ', 'ལ'], ['ཞ', 'ཤ'], ['ཟ', 'ས'], ['ཡ', 'ཨ'], ['འ', 'ར'], ['ཝ', 'ལ'],
]
/** ཅ ཆ ཇ 右上角加一个小钩就是 ཙ ཚ ཛ */
export const HOOK_PAIRS: [string, string][] = [['ཅ', 'ཙ'], ['ཆ', 'ཚ'], ['ཇ', 'ཛ']]

const partners = new Map<string, Set<string>>()
for (const [a, b] of [...SHAPE_PAIRS, ...HOOK_PAIRS]) {
  if (!partners.has(a)) partners.set(a, new Set())
  if (!partners.has(b)) partners.set(b, new Set())
  partners.get(a)!.add(b)
  partners.get(b)!.add(a)
}
export const shapeLetters = [...partners.keys()]

/** 元音：位置和名称 */
export const VOWEL_INFO: { mark: string; pos: '上' | '下'; name: string; examples: [string, string][] }[] = [
  { mark: 'ི', pos: '上', name: VOWELS[0][2], examples: [['ཀི', 'ge'], ['མི', 'me'], ['ཞི', 'xi'], ['རི', 'ri']] },
  { mark: 'ུ', pos: '下', name: VOWELS[1][2], examples: [['ཀུ', 'ge'], ['སུ', 'se'], ['ཕུ', 'pu'], ['ཞུ', 'xie']] },
  { mark: 'ེ', pos: '上', name: VOWELS[2][2], examples: [['ཀེ', 'gei'], ['མེ', 'mei'], ['ཆེ', 'qie'], ['དེ', 'di']] },
  { mark: 'ོ', pos: '上', name: VOWELS[3][2], examples: [['ཁོ', 'ko'], ['མོ', 'mu'], ['ལོ', 'luo'], ['འོ', 'ao']] },
]

/** 《一本通》第 12–16 页的字母 + 元音拼读例子 */
export const BOOK_CV: [string, string][] = [
  ['ཀི', 'ge'], ['ཀུ', 'ge'], ['ཀེ', 'gei'], ['ཁུ', 'ke'], ['ཁོ', 'ko'], ['གོ', 'gu'], ['ངུ', 'ne'], ['ངོ', 'nu'],
  ['ཆུ', 'qi'], ['ཆེ', 'qie'], ['ཉི', 'nie'], ['ཉོ', 'niu'], ['ཐོ', 'tu'], ['དེ', 'di'], ['ནུ', 'ne'], ['ནེ', 'nei'],
  ['ཕུ', 'pu'], ['བུ', 'we'], ['མི', 'me'], ['མེ', 'mei'], ['མོ', 'mu'], ['ཙི', 'ze'], ['ཞི', 'xi'], ['ཞུ', 'xie'],
  ['ཞོ', 'xiu'], ['ཟོ', 'suo'], ['འོ', 'ao'], ['རི', 'ri'], ['ལུ', 'le'], ['ལོ', 'luo'], ['ཤི', 'he'], ['སུ', 'se'], ['སོ', 'suo'],
]
export const cvAudioOf = (s: string) => cvAudio(s[0], s[1])
const bookPron = new Map(BOOK_CV)
/** 字母 × 元音组合表：30 个字母各配 ི ུ ེ ོ，共 120 个。书上有注音的才显示注音。 */
export const CV_MARKS = VOWELS.map((v) => v[0])
export const cvPron = (s: string) => bookPron.get(s)

const wylieOf = new Map(LETTERS)
const vowelLatin = new Map(VOWELS.map(([m, v]) => [m, v]))

/** 练习里的一项：一个字母，或书上的一个拼读例子 */
export type DrillItem = { key: string; tib: string; pron: string; hanzi?: string; wylie: string; audio: string; base: string }

export const letterItem = (l: string): DrillItem => ({
  key: 'L:' + l, tib: l, pron: PRON[l][0], hanzi: PRON[l][1], wylie: wylieOf.get(l)!, audio: letterAudio(l), base: l,
})
export const cvItem = (s: string): DrillItem => ({
  key: 'CV:' + s, tib: s, pron: bookPron.get(s) ?? '', wylie: wylieOf.get(s[0])!.replace(/a$/, '') + vowelLatin.get(s[1]), audio: cvAudioOf(s), base: s[0],
})

/** 四个选项：答案 + 形近字 + 同行的字 + 其他。选项按转写区分，注音相同的也能分开。 */
export function optionsFor(it: DrillItem, pool: DrillItem[]): DrillItem[] {
  const all = it.key.startsWith('CV:') ? BOOK_CV.map(([x]) => cvItem(x)) : LETTERS.map((l) => letterItem(l[0]))
  const near = it.key.startsWith('CV:')
    ? all.filter((x) => x.base === it.base || partners.get(it.base)?.has(x.base) || x.tib[1] === it.tib[1])
    : all.filter((x) => partners.get(it.tib)?.has(x.tib))
  const row = ROWS.find((r) => r.includes(it.base)) ?? []
  const sameRow = all.filter((x) => !it.key.startsWith('CV:') && row.includes(x.tib))
  const picked: DrillItem[] = []
  for (const group of [shuffle(near), shuffle(sameRow), shuffle(pool), shuffle(all)])
    for (const x of group) {
      if (picked.length >= 3) break
      if (x.key === it.key || picked.some((p) => p.key === x.key)) continue
      // 拼读例子里读音完全一样的（如 ཀི ཀུ 都是 ge）不能同时出现
      if (it.key.startsWith('CV:') && (x.pron === it.pron || picked.some((p) => p.pron === x.pron))) continue
      picked.push(x)
    }
  return shuffle([it, ...picked])
}

/** 形近的另一个字（答错时拿来对比） */
export const isLookalike = (a: string, b: string) => !!partners.get(a)?.has(b)

// ---- 熟练度：看到后 3 秒内答对，连续 3 次算“一眼认出” ----

export const FAST_MS = 3000
export const FLUENT_AT = 3
export type Stat = { fast: number; seen: number; ok: number; lastMs?: number; at?: number }
const KEY = 'alphabet-stats'

export async function loadStats(): Promise<Record<string, Stat>> {
  return ((await db.settings.get(KEY))?.value as Record<string, Stat>) ?? {}
}
export async function saveStats(s: Record<string, Stat>) {
  await db.settings.put({ key: KEY, value: s })
}
export const isFluent = (s?: Stat) => (s?.fast ?? 0) >= FLUENT_AT

export function record(stats: Record<string, Stat>, key: string, ok: boolean, ms: number) {
  const s = stats[key] ?? { fast: 0, seen: 0, ok: 0 }
  s.seen++
  if (ok) s.ok++
  s.fast = ok && ms <= FAST_MS ? s.fast + 1 : 0
  s.lastMs = ms
  s.at = Date.now()
  stats[key] = s
}

/** 每日练习里的一步：新字先认识一下（intro），字母看字选读音，组合自己念再对答案（say） */
export type Step = { it: DrillItem; intro?: boolean; say?: boolean }

const noRepeat = (q: DrillItem[]) => {
  for (let i = 1; i < q.length; i++)
    if (q[i].key === q[i - 1].key) {
      const j = q.findIndex((x, k) => k > i && x.key !== q[i].key && x.key !== q[i - 1].key)
      if (j > 0) [q[i], q[j]] = [q[j], q[i]]
    }
  return q
}

/** 从一组里挑：没记牢的优先，再按顺序带新的，最后挑最久没见的熟的复习 */
function choose(all: DrillItem[], stats: Record<string, Stat>, n: number, maxFresh: number) {
  const seen = (x: DrillItem) => (stats[x.key]?.seen ?? 0) > 0
  const weak = all.filter((x) => seen(x) && !isFluent(stats[x.key])).sort((a, b) => stats[a.key].fast - stats[b.key].fast).slice(0, n)
  const fresh = all.filter((x) => !seen(x)).slice(0, Math.max(0, Math.min(maxFresh, n - weak.length)))
  const review = all
    .filter((x) => isFluent(stats[x.key]))
    .sort((a, b) => (stats[a.key].at ?? 0) - (stats[b.key].at ?? 0))
    .slice(0, Math.max(2, n - weak.length - fresh.length))
  return { weak, fresh, review }
}

/**
 * 每天自动出的一组，分两段：
 * 1. 字母：没记牢的考两次，按字母表顺序带进几个新字（先看一遍再考），熟的挑最久没见的复习；
 * 2. 字母 + 元音组合：只用已经见过的字母，看组合自己念，再听答案自评。
 */
export function buildDaily(stats: Record<string, Stat>): Step[] {
  const letters = LETTERS.map((l) => letterItem(l[0]))
  const L = choose(letters, stats, 10, 6)
  const fresh = L.weak.length >= 8 ? L.fresh.slice(0, 2) : L.weak.length >= 4 ? L.fresh.slice(0, 4) : L.fresh
  const letterQuiz = noRepeat(shuffle([...L.weak, ...L.weak, ...fresh, ...fresh, ...L.review]))

  // 组合：字母见过（或今天刚学）的才出；按字母顺序，一个字母的四个元音一起带进来
  const known = new Set([...letters.filter((x) => (stats[x.key]?.seen ?? 0) > 0), ...fresh].map((x) => x.tib))
  const combos = LETTERS.map((l) => l[0]).filter((l) => known.has(l)).flatMap((l) => CV_MARKS.map((m) => cvItem(l + m)))
  const C = choose(combos, stats, 8, 4)
  const cvQuiz = noRepeat(shuffle([...C.weak, ...C.fresh, ...C.review]))

  return [...fresh.map((it) => ({ it, intro: true })), ...letterQuiz.map((it) => ({ it })), ...cvQuiz.map((it) => ({ it, say: true }))]
}

// 每天打开 App 时自动弹出一次
const DAILY_KEY = 'alphabet-daily'
const today = () => new Date().toLocaleDateString('sv')
export async function dailyDue() {
  return (await db.settings.get(DAILY_KEY))?.value !== today()
}
export async function markDailyShown() {
  await db.settings.put({ key: DAILY_KEY, value: today() })
}
