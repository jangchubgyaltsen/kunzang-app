import { syllables, syllableMap, type Syllable } from './content.ts'
import { WORDS } from './words.ts'

export const LETTERS: [string, string][] = [
  ['ཀ', 'ka'], ['ཁ', 'kha'], ['ག', 'ga'], ['ང', 'nga'],
  ['ཅ', 'ca'], ['ཆ', 'cha'], ['ཇ', 'ja'], ['ཉ', 'nya'],
  ['ཏ', 'ta'], ['ཐ', 'tha'], ['ད', 'da'], ['ན', 'na'],
  ['པ', 'pa'], ['ཕ', 'pha'], ['བ', 'ba'], ['མ', 'ma'],
  ['ཙ', 'tsa'], ['ཚ', 'tsha'], ['ཛ', 'dza'], ['ཝ', 'wa'],
  ['ཞ', 'zha'], ['ཟ', 'za'], ['འ', "'a"], ['ཡ', 'ya'],
  ['ར', 'ra'], ['ལ', 'la'], ['ཤ', 'sha'], ['ས', 'sa'],
  ['ཧ', 'ha'], ['ཨ', 'a'],
]
export const letterWylie = new Map(LETTERS)

export const VOWELS: [string, string, string][] = [
  ['ི', 'i', 'གི་གུ'],
  ['ུ', 'u', 'ཞབས་ཀྱུ'],
  ['ེ', 'e', 'འགྲེང་བུ'],
  ['ོ', 'o', 'ན་རོ'],
]

// 形近字：出题时优先用作干扰项
export const LOOKALIKE: string[][] = [
  ['ཅ', 'ཙ'], ['ཆ', 'ཚ'], ['ཇ', 'ཛ'], ['པ', 'བ', 'ཕ'], ['ད', 'ཏ', 'ང', 'ཉ'],
  ['ཁ', 'ཤ', 'ག'], ['ཞ', 'ཟ'], ['ར', 'ཪ', 'ཡ'], ['ལ', 'ཨ'], ['མ', 'ས', 'ཕ'], ['ན', 'ཏ'], ['ཝ', 'འ', 'ཨ'],
]

export type KC = string // L:ཀ  V:ི  S:བླ  W:བླ་མ

export type Question =
  | { kind: 'glyph2wylie'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'wylie2glyph'; kc: KC; prompt: string; options: string[]; answer: string; explain: string }
  | { kind: 'findRoot'; kc: KC; prompt: string; parts: string[]; answer: number; audio?: string; explain: string }
  | { kind: 'listen'; kc: KC; audio: string; options: string[]; answer: string; explain: string }
  | { kind: 'meaning'; kc: KC; prompt: string; options: string[]; answer: string; explain: string }

export type UnitDef = { n: number; kcs: KC[]; intro: string }

export const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
export const pick = <T,>(a: T[], k: number) => shuffle(a).slice(0, k)

export function optionsWith(answer: string, pool: string[], preferred: string[] = [], k = 4) {
  const others = [...new Set([...shuffle(preferred), ...shuffle(pool)])].filter((x) => x !== answer)
  return shuffle([answer, ...others.slice(0, k - 1)])
}

const sylBy = (f: (s: Syllable) => boolean) => syllables.filter((s) => !s.particle && !s.needsCheck && f(s)).map((s) => 'S:' + s.tibetan)
const plain = (s: Syllable) => !s.prefix && !s.superscript && !s.subscript

export const UNITS: UnitDef[] = [
  { n: 1, kcs: LETTERS.slice(0, 16).map(([l]) => 'L:' + l), intro: '前 16 个辅音字母（ཀ ཅ ཏ པ 四行）。每个字母自带元音 a。' },
  { n: 2, kcs: LETTERS.slice(16).map(([l]) => 'L:' + l), intro: '后 14 个辅音字母，注意和前面学过的形近字区分。' },
  { n: 3, kcs: VOWELS.map(([v]) => 'V:' + v), intro: '4 个元音符号：ི i、ུ u、ེ e、ོ o。它们加在字母的上方或下方。' },
  { n: 4, kcs: sylBy((s) => plain(s) && !!s.suffix && !s.postSuffix), intro: '后加字：两个字母并排时，第一个是基字，第二个是后加字。' },
  { n: 5, kcs: sylBy((s) => !!s.postSuffix && !s.prefix && !s.superscript && !s.subscript), intro: '再后加字 ས：写在后加字后面，帮你判断前面谁是前加字、谁是基字。' },
  { n: 6, kcs: sylBy((s) => !!s.superscript && !s.subscript && !s.prefix), intro: '上加字 ར ལ ས：写在头顶的字不是基字，基字在它下面。' },
  { n: 7, kcs: sylBy((s) => !!s.subscript && !s.superscript && !s.prefix), intro: '下加字 ཡ ར ལ：写在脚下的字不是基字，基字在它上面。' },
  { n: 8, kcs: sylBy((s) => !!s.subscript && !!s.superscript && !s.prefix), intro: '上加字和下加字同时出现：基字夹在中间。' },
  { n: 9, kcs: sylBy((s) => !!s.prefix), intro: '前加字 ག ད བ མ འ：写在基字前面，不带元音，也不叠字。也包括前加字和上加字、下加字一起出现的情况。' },
  { n: 10, kcs: syllables.filter((s) => !s.needsCheck).map((s) => 'S:' + s.tibetan), intro: '综合练习：开篇里的全部音节，找基字，认读音。' },
]

export const unitOfKC = new Map<KC, number>()
for (const u of UNITS) for (const k of u.kcs) if (!unitOfKC.has(k)) unitOfKC.set(k, u.n)

const allSylKCs = syllables.map((s) => s.tibetan)

export function partsOf(s: Syllable) {
  const parts: { ch: string; role: string }[] = []
  if (s.prefix) parts.push({ ch: s.prefix, role: '前加字' })
  if (s.superscript) parts.push({ ch: s.superscript, role: '上加字' })
  parts.push({ ch: s.root, role: '基字' })
  for (const c of s.subscript ?? '') parts.push({ ch: c, role: '下加字' })
  if (s.suffix) parts.push({ ch: s.suffix, role: '后加字' })
  if (s.postSuffix) parts.push({ ch: s.postSuffix, role: '再后加字' })
  return parts
}

export function rootReason(s: Syllable) {
  const why: string[] = []
  if (s.superscript) why.push(`${s.superscript} 写在头顶，是上加字，基字是它下面的 ${s.root}`)
  if (s.subscript) why.push(`${[...s.subscript].join('、')} 写在脚下，是下加字，基字是它上面的 ${s.root}`)
  if (s.prefix) why.push(`${s.prefix} 写在最前面，不带元音也不叠字，是前加字`)
  if (s.vowel && !s.superscript && !s.subscript) why.push(`元音符号加在 ${s.root} 上，所以 ${s.root} 是基字`)
  if (!why.length) why.push(`没有元音和叠字时，两个字母里第一个 ${s.root} 是基字`)
  return why.join('；') + '。'
}

export function questionFor(kc: KC, variant?: number): Question {
  const [type, val] = [kc.slice(0, 1), kc.slice(2)]
  const v = variant ?? Math.floor(Math.random() * 3)
  if (type === 'L') {
    const w = letterWylie.get(val)!
    const group = LOOKALIKE.find((g) => g.includes(val)) ?? []
    if (v % 2 === 0) {
      return {
        kind: 'glyph2wylie', kc, prompt: val, answer: w,
        options: optionsWith(w, LETTERS.map((l) => l[1]), group.map((g) => letterWylie.get(g) ?? '').filter(Boolean)),
        explain: `${val} 读作 ${w}。`,
      }
    }
    return {
      kind: 'wylie2glyph', kc, prompt: w, answer: val,
      options: optionsWith(val, LETTERS.map((l) => l[0]), group.filter((g) => letterWylie.has(g))),
      explain: group.length > 1 ? `${val} 是 ${w}；容易混的是 ${group.filter((g) => g !== val && letterWylie.has(g)).join(' ')}。` : `${val} 是 ${w}。`,
    }
  }
  if (type === 'V') {
    const [mark, vw, name] = VOWELS.find((x) => x[0] === val)!
    const [base, bw] = pick(LETTERS.filter((l) => !['འ', 'ཨ'].includes(l[0])), 1)[0]
    const shown = base + mark
    const answer = bw.slice(0, -1) + vw
    return {
      kind: 'glyph2wylie', kc, prompt: shown, answer,
      options: optionsWith(answer, VOWELS.map((x) => bw.slice(0, -1) + x[1]).concat(bw)),
      explain: `${mark} 叫 ${name}，读 ${vw}，所以 ${shown} 读 ${answer}。`,
    }
  }
  if (type === 'W') {
    const zh = wordMeaning.get(val)!
    return {
      kind: 'meaning', kc, prompt: val, answer: zh,
      options: optionsWith(zh, WORDS.map((w) => w[1])),
      explain: `${val}（${wordWylie(val)}）意思是「${zh}」。`,
    }
  }
  const s = syllableMap.get(val)!
  const kind = v % 3
  if (kind === 0) {
    const parts = partsOf(s)
    return {
      kind: 'findRoot', kc, prompt: s.tibetan, parts: parts.map((p) => p.ch),
      answer: parts.findIndex((p) => p.role === '基字'), audio: s.audio, explain: rootReason(s),
    }
  }
  if (kind === 1) {
    return {
      kind: 'glyph2wylie', kc, prompt: s.tibetan, answer: s.wylie, audio: s.audio,
      options: optionsWith(s.wylie, syllables.map((x) => x.wylie), similarWylie(s)),
      explain: `${s.tibetan} 转写为 ${s.wylie}。${rootReason(s)}`,
    }
  }
  return {
    kind: 'listen', kc, audio: s.audio, answer: s.tibetan,
    options: optionsWith(s.tibetan, allSylKCs, syllables.filter((x) => x.root === s.root || x.suffix === s.suffix).map((x) => x.tibetan)),
    explain: `刚才读的是 ${s.tibetan}（${s.wylie}）。`,
  }
}

export const wordMeaning = new Map(WORDS)
export const wordWylie = (w: string) => w.split('་').map((x) => syllableMap.get(x)?.wylie ?? '?').join(' ')

function similarWylie(s: Syllable) {
  const w = s.wylie
  return syllables.filter((x) => x.wylie !== w && (x.root === s.root || x.wylie.length === w.length)).map((x) => x.wylie)
}

export function buildLesson(unit: number, weakFirst: KC[] = []): Question[] {
  const u = UNITS.find((x) => x.n === unit)!
  const kcs = [...weakFirst.filter((k) => u.kcs.includes(k)), ...shuffle(u.kcs)]
  const chosen = [...new Set(kcs)].slice(0, unit <= 3 ? 8 : 6)
  // 每个知识点出两道不同题型
  const qs = chosen.flatMap((k) => [questionFor(k, 0), questionFor(k, 1)])
  return shuffle(qs).slice(0, 12)
}
