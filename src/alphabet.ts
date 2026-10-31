import { LETTERS, VOWELS, cvAudio, letterAudio, shuffle } from './course.ts'
import { db } from './db.ts'

// 字母表和“看字念音”练习的数据。
// 注音和汉字近音照《安多藏语一本通》第一章抄录（见 content/安多读音对照表-v0.md 第 1、2 节）。
// 书上 ཀ/ག、ཏ/ད 这类清浊字注音相同，实际读音不同，以音频为准。

/** 字母 → [一本通注音, 汉字近音] */
export const PRON: Record<string, [string, string]> = {
  ཀ: ['ga', '嘎'], ཁ: ['ka', '咔'], ག: ['ga', '嘎'], ང: ['nga', '那'],
  ཅ: ['jia', '佳'], ཆ: ['qia', '恰'], ཇ: ['jia', '贾'], ཉ: ['nya', '尼啊'],
  ཏ: ['da', '达'], ཐ: ['ta', '塔'], ད: ['da', '搭'], ན: ['na', '那'],
  པ: ['ba', '吧'], ཕ: ['pa', '帕'], བ: ['wa', '哇'], མ: ['ma', '玛'],
  ཙ: ['za', '杂'], ཚ: ['ca', '嚓'], ཛ: ['za', '杂'], ཝ: ['wa', '哇'],
  ཞ: ['xia', '夏'], ཟ: ['sa', '萨'], འ: ['a', '阿'], ཡ: ['ya', '呀'],
  ར: ['ra', '日啊'], ལ: ['la', '拉'], ཤ: ['xia', '夏'], ས: ['sa', '萨'],
  ཧ: ['ha', '哈'], ཨ: ['a', '阿'],
}

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

const wylieOf = new Map(LETTERS)
const vowelLatin = new Map(VOWELS.map(([m, v]) => [m, v]))

/** 练习里的一项：一个字母，或书上的一个拼读例子 */
export type DrillItem = { key: string; tib: string; pron: string; hanzi?: string; wylie: string; audio: string; base: string }

export const letterItem = (l: string): DrillItem => ({
  key: 'L:' + l, tib: l, pron: PRON[l][0], hanzi: PRON[l][1], wylie: wylieOf.get(l)!, audio: letterAudio(l), base: l,
})
export const cvItem = ([s, pron]: [string, string]): DrillItem => ({
  key: 'CV:' + s, tib: s, pron, wylie: wylieOf.get(s[0])!.replace(/a$/, '') + vowelLatin.get(s[1]), audio: cvAudioOf(s), base: s[0],
})

export type Scope = { kind: 'rows'; rows: number[] } | { kind: 'shape' } | { kind: 'cv' }
export type DrillMode = 'choose' | 'say'

export function scopeItems(s: Scope): DrillItem[] {
  if (s.kind === 'cv') return BOOK_CV.map(cvItem)
  if (s.kind === 'shape') return shapeLetters.map(letterItem)
  return s.rows.flatMap((r) => ROWS[r]).map(letterItem)
}

/** 四个选项：答案 + 形近字 + 同行的字 + 其他。选项按转写区分，注音相同的也能分开。 */
export function optionsFor(it: DrillItem, pool: DrillItem[]): DrillItem[] {
  const all = it.key.startsWith('CV:') ? BOOK_CV.map(cvItem) : LETTERS.map((l) => letterItem(l[0]))
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
export type Stat = { fast: number; seen: number; ok: number; lastMs?: number }
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
  stats[key] = s
}

/** 一轮 20 题：还不熟的字多出几次 */
export function buildRound(items: DrillItem[], stats: Record<string, Stat>, n = 20): DrillItem[] {
  const weight = (it: DrillItem) => (isFluent(stats[it.key]) ? 1 : (stats[it.key]?.seen ?? 0) === 0 ? 2 : 3)
  const bag = items.flatMap((it) => Array(weight(it)).fill(it) as DrillItem[])
  const out: DrillItem[] = []
  // 先保证每个字至少出现一次
  for (const it of shuffle(items)) if (out.length < n) out.push(it)
  for (const it of shuffle(bag)) {
    if (out.length >= n) break
    out.push(it)
  }
  // 避免同一个字连着出现
  const res = shuffle(out)
  for (let i = 1; i < res.length; i++)
    if (res[i].key === res[i - 1].key) {
      const j = res.findIndex((x, k) => k > i && x.key !== res[i].key && x.key !== res[i - 1].key)
      if (j > 0) [res[i], res[j]] = [res[j], res[i]]
    }
  return res
}
