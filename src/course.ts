import { syllables, syllableMap, type Syllable } from './content.ts'
import wordsRaw from './words.json'

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
const letterNo = (l: string) => String(LETTERS.findIndex((x) => x[0] === l) + 1).padStart(2, '0')
const letterAudio = (l: string) => 'L-' + letterNo(l)

export const VOWELS: [string, string, string][] = [
  ['ི', 'i', 'གི་གུ'],
  ['ུ', 'u', 'ཞབས་ཀྱུ'],
  ['ེ', 'e', 'འགྲེང་བུ'],
  ['ོ', 'o', 'ན་རོ'],
]
const cvAudio = (l: string, v: string) => `CV-${letterNo(l)}-${VOWELS.find((x) => x[0] === v)![1]}`

// 形近字：出题时优先用作干扰项
const LOOKALIKE: string[][] = [
  ['ཅ', 'ཙ'], ['ཆ', 'ཚ'], ['ཇ', 'ཛ'], ['པ', 'བ', 'ཕ'], ['ད', 'ཏ', 'ང', 'ཉ'],
  ['ཁ', 'ཤ', 'ག'], ['ཞ', 'ཟ'], ['ར', 'ཡ'], ['ལ', 'ཨ'], ['མ', 'ས', 'ཕ'], ['ན', 'ཏ'], ['ཝ', 'འ', 'ཨ'],
]

type WordSyl = Omit<Syllable, 'count' | 'reviewStatus' | 'audio' | 'audioStatus'>
export type Word = { id: string; tibetan: string; wylie: string; gloss: string; audio: string; syllables: WordSyl[]; kcs: string[] }
export const words = wordsRaw as Word[]
export const wordMap = new Map(words.map((w) => [w.tibetan, w]))

type Rule = { name: string; intro: string; example: string; has: (s: WordSyl) => boolean }
export const RULES: Record<string, Rule> = {
  'R:suf': {
    name: '后加字',
    intro: '两个字母并排、都没有元音和叠字时，第一个是基字，第二个是后加字。后加字跟在基字后面，读音很轻。',
    example: 'ལམ', has: (s) => !!s.suffix,
  },
  'R:pre': {
    name: '前加字',
    intro: 'ག ད བ མ འ 可以写在基字前面，叫前加字。前加字不带元音，在安多话里常常只是轻轻带出一点音。',
    example: 'བདག', has: (s) => !!s.prefix,
  },
  'R:sup': {
    name: '上加字',
    intro: 'ར ལ ས 可以写在另一个字母的头顶，叫上加字。写在头顶的不是基字，基字在它下面。',
    example: 'སྣང', has: (s) => !!s.superscript,
  },
  'R:sub': {
    name: '下加字',
    intro: 'ཡ ར ལ 可以写成小的形状（ྱ ྲ ླ）挂在字母脚下，叫下加字。基字在它上面。',
    example: 'བླ', has: (s) => !!s.subscript,
  },
  'R:post': {
    name: '再后加字 ས',
    intro: 'ས 可以跟在后加字的后面，叫再后加字。它不改变基字，只是写在最后。',
    example: 'གཟིགས', has: (s) => !!s.postSuffix,
  },
}

export type KC = string // L:ཀ  V:ི  R:suf  W:བླ་མ  S:བླ

export type Intro = { kind: 'intro'; kc: KC; label: string; big: string; sub?: string; note?: string; audio?: string; parts?: { ch: string; role: string }[] }
export type Question =
  | Intro
  | { kind: 'glyph2wylie'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'wylie2glyph'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'findRoot'; kc: KC; prompt: string; parts: string[]; answer: number; audio?: string; explain: string }
  | { kind: 'listen'; kc: KC; audio: string; options: string[]; answer: string; explain: string }
  | { kind: 'meaning'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'meaning2word'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
export type Scored = Exclude<Question, Intro>

const I = 'V:ི', U = 'V:ུ', E = 'V:ེ', O = 'V:ོ'

/** 每个单元学几个新字母、元音或规则，然后马上用它们读开篇里的真实词语。 */
const PLAN: { add: KC[]; intro: string }[] = [
  { add: ['L:ལ', 'L:མ', 'R:suf', 'L:ན', 'L:ང', 'L:ག'], intro: '先学 5 个字母。每个字母自带元音 a。两个字母并排就能拼出第一个词。' },
  { add: [I, 'L:ཟ', 'L:བ', 'L:ཐ', 'L:ར', 'L:ས'], intro: '第一个元音符号 ི，再加 5 个字母。' },
  { add: [U, 'L:ཞ', 'L:ད', 'L:པ'], intro: '元音 ུ 和 3 个字母，开始读双音节词。' },
  { add: [E, O, 'L:ཆ', 'L:འ'], intro: '元音 ེ ོ，四个元音就学全了。' },
  { add: ['L:ཀ', 'L:ཙ', 'R:pre'], intro: '前加字：写在基字前面的 ག ད བ མ འ。' },
  { add: ['L:ཡ', 'L:ཉ', 'R:sup'], intro: '上加字：写在头顶的 ར ལ ས。' },
  { add: ['L:ཕ', 'L:ཚ', 'L:ཁ', 'R:sub'], intro: '下加字：挂在脚下的 ྱ ྲ ླ。这一单元的词很多，分几次练。' },
  { add: ['L:ཏ', 'L:ཤ', 'L:ཇ', 'L:ཛ', 'R:post'], intro: '再后加字 ས，开篇里的长词基本都能读了。' },
  { add: ['L:ཅ', 'L:ཧ', 'L:ཝ', 'L:ཨ'], intro: '最后 4 个字母，30 个字母全部学完。' },
]

export type UnitDef = {
  n: number
  intro: string
  /** 必须都练过才能通过本单元：新字母、元音、规则和新词 */
  kcs: KC[]
  /** 已经能拼读的开篇音节，用来复习规则 */
  extra: KC[]
}

const sylKCs = (s: WordSyl) => {
  const k: KC[] = []
  for (const c of [s.prefix, s.superscript, s.root, ...(s.subscript ?? ''), s.suffix, s.postSuffix]) if (c) k.push('L:' + c)
  if (s.vowel) k.push('V:' + s.vowel)
  for (const [f, r] of [['suffix', 'R:suf'], ['postSuffix', 'R:post'], ['superscript', 'R:sup'], ['subscript', 'R:sub'], ['prefix', 'R:pre']] as const)
    if (s[f]) k.push(r)
  return k
}
const within = (need: KC[], have: Set<KC>) => need.every((k) => have.has(k))

const usableSyl = syllables.filter((s) => !s.particle && !s.needsCheck)

export const UNITS: UnitDef[] = []
{
  const known = new Set<KC>()
  for (const [i, p] of PLAN.entries()) {
    const before = new Set(known)
    p.add.forEach((k) => known.add(k))
    const newWords = words.filter((w) => within(w.kcs, known) && !within(w.kcs, before)).map((w) => 'W:' + w.tibetan)
    const extra = usableSyl.filter((s) => within(sylKCs(s), known) && !within(sylKCs(s), before)).map((s) => 'S:' + s.tibetan)
    UNITS.push({ n: i + 1, intro: p.intro, kcs: [...p.add, ...newWords], extra })
  }
  UNITS.push({
    n: 10,
    intro: '综合练习：开篇里的全部音节和词，找基字，认读音。',
    kcs: [],
    extra: [...syllables.filter((s) => !s.needsCheck).map((s) => 'S:' + s.tibetan), ...words.map((w) => 'W:' + w.tibetan)],
  })
}

export const unitOfKC = new Map<KC, number>()
for (const u of UNITS) for (const k of [...u.kcs, ...u.extra]) if (!unitOfKC.has(k)) unitOfKC.set(k, u.n)

/** 学到第 n 单元为止认识的全部知识点 */
export function knownThrough(n: number) {
  return new Set(UNITS.filter((u) => u.n <= n).flatMap((u) => [...u.kcs, ...u.extra]))
}
const ALL = knownThrough(99)

const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

function optionsWith(answer: string, pool: string[], preferred: string[] = [], k = 4) {
  const others = [...new Set([...shuffle(preferred), ...shuffle(pool)])].filter((x) => x !== answer)
  return shuffle([answer, ...others.slice(0, k - 1)])
}

export function partsOf(s: WordSyl) {
  const parts: { ch: string; role: string }[] = []
  if (s.prefix) parts.push({ ch: s.prefix, role: '前加字' })
  if (s.superscript) parts.push({ ch: s.superscript, role: '上加字' })
  parts.push({ ch: s.root, role: '基字' })
  for (const c of s.subscript ?? '') parts.push({ ch: c, role: '下加字' })
  if (s.suffix) parts.push({ ch: s.suffix, role: '后加字' })
  if (s.postSuffix) parts.push({ ch: s.postSuffix, role: '再后加字' })
  return parts
}

export function rootReason(s: WordSyl) {
  const why: string[] = []
  if (s.superscript) why.push(`${s.superscript} 写在头顶，是上加字，基字是它下面的 ${s.root}`)
  if (s.subscript) why.push(`${[...s.subscript].join('、')} 写在脚下，是下加字，基字是它上面的 ${s.root}`)
  if (s.prefix) why.push(`${s.prefix} 写在最前面，不带元音也不叠字，是前加字`)
  if (s.vowel && !s.superscript && !s.subscript) why.push(`元音符号加在 ${s.root} 上，所以 ${s.root} 是基字`)
  if (!why.length) why.push(`没有元音和叠字时，两个字母里第一个 ${s.root} 是基字`)
  return why.join('；') + '。'
}

/** 给人看的知识点名称 */
export function kcLabel(kc: KC) {
  if (kc.startsWith('R:')) return RULES[kc]?.name ?? kc
  if (kc.startsWith('V:')) return '◌' + kc.slice(2)
  return kc.slice(2)
}

const letterGroup = (l: string) => (LOOKALIKE.find((g) => g.includes(l)) ?? []).filter((g) => g !== l && letterWylie.has(g))

/** 第一次遇到某个知识点时的介绍卡 */
export function introFor(kc: KC): Intro {
  const [type, val] = [kc.slice(0, 1), kc.slice(2)]
  if (type === 'L') {
    const g = letterGroup(val)
    return {
      kind: 'intro', kc, label: '新字母', big: val, sub: letterWylie.get(val), audio: letterAudio(val),
      note: g.length ? `注意和 ${g.join(' ')} 区分。` : undefined,
    }
  }
  if (type === 'V') {
    const [mark, vw, name] = VOWELS.find((x) => x[0] === val)!
    return {
      kind: 'intro', kc, label: '新元音', big: 'མ' + mark, sub: 'm' + vw, audio: cvAudio('མ', mark),
      note: `${mark} 叫 ${name}，读 ${vw}。加在任何字母上，a 都换成 ${vw}。`,
    }
  }
  if (type === 'R') {
    const r = RULES[kc]
    const s = syllableOf(r.example)!
    return { kind: 'intro', kc, label: '新规则：' + r.name, big: r.example, sub: s.wylie, note: r.intro, parts: partsOf(s), audio: audioOf(r.example) }
  }
  if (type === 'W') {
    const w = wordMap.get(val)!
    return { kind: 'intro', kc, label: '新词', big: w.tibetan, sub: w.wylie, note: w.gloss, audio: w.audio }
  }
  const s = syllableMap.get(val)!
  return { kind: 'intro', kc, label: '音节', big: s.tibetan, sub: s.wylie, audio: s.audio, parts: partsOf(s) }
}

function syllableOf(t: string): WordSyl | undefined {
  return syllableMap.get(t) ?? words.flatMap((w) => w.syllables).find((s) => s.tibetan === t)
}
function audioOf(t: string) {
  return wordMap.get(t)?.audio ?? syllableMap.get(t)?.audio
}

/** 出一道题。known 是学习者已经认识的知识点，用来挑干扰项和例子；不传就用全部。 */
export function questionFor(kc: KC, variant?: number, known: Set<KC> = ALL): Scored {
  const [type, val] = [kc.slice(0, 1), kc.slice(2)]
  const v = variant ?? Math.floor(Math.random() * 4)
  const knownLetters = LETTERS.filter(([l]) => known.has('L:' + l))
  const knownWords = words.filter((w) => known.has('W:' + w.tibetan))

  if (type === 'L') {
    const w = letterWylie.get(val)!
    const group = letterGroup(val)
    const glyphPool = (knownLetters.length >= 4 ? knownLetters : LETTERS).map((l) => l[0])
    const explain = group.length ? `${val} 读 ${w}；容易混的是 ${group.join(' ')}。` : `${val} 读 ${w}。`
    if (v % 3 === 0)
      return {
        kind: 'glyph2wylie', kc, prompt: val, answer: w, audio: letterAudio(val), explain,
        options: optionsWith(w, glyphPool.map((g) => letterWylie.get(g)!), group.map((g) => letterWylie.get(g)!)),
      }
    if (v % 3 === 1)
      return { kind: 'listen', kc, audio: letterAudio(val), answer: val, options: optionsWith(val, glyphPool, group), explain }
    return { kind: 'wylie2glyph', kc, prompt: w, answer: val, audio: letterAudio(val), options: optionsWith(val, glyphPool, group), explain }
  }

  if (type === 'V') {
    const [mark, vw, name] = VOWELS.find((x) => x[0] === val)!
    const bases = (knownLetters.length ? knownLetters : LETTERS).filter((l) => !['འ', 'ཨ'].includes(l[0]))
    const [base, bw] = pick(bases)
    const shown = base + mark
    const stem = bw.slice(0, -1)
    const knownMarks = VOWELS.filter((x) => known.has('V:' + x[0]))
    const explain = `${mark} 叫 ${name}，读 ${vw}，所以 ${shown} 读 ${stem + vw}。`
    if (v % 2 === 0)
      return {
        kind: 'glyph2wylie', kc, prompt: shown, answer: stem + vw, audio: cvAudio(base, mark), explain,
        options: optionsWith(stem + vw, VOWELS.map((x) => stem + x[1]).concat(bw), knownMarks.map((x) => stem + x[1]).concat(bw)),
      }
    return {
      kind: 'listen', kc, audio: cvAudio(base, mark), answer: shown, explain,
      options: optionsWith(shown, VOWELS.map((x) => base + x[0]).concat(base), knownMarks.map((x) => base + x[0]).concat(base)),
    }
  }

  if (type === 'R') {
    const r = RULES[kc]
    const cands = [
      ...knownWords.flatMap((w) => w.syllables),
      ...usableSyl.filter((s) => known.has('S:' + s.tibetan)),
    ].filter(r.has)
    const s = cands.length ? pick(cands) : syllableOf(r.example)!
    return rootQuestion(kc, s)
  }

  if (type === 'W') {
    const w = wordMap.get(val)!
    const pool = knownWords.length >= 4 ? knownWords : words
    const near = pool.filter((x) => x !== w && x.syllables.length === w.syllables.length)
    const explain = `${w.tibetan}（${w.wylie}）：${w.gloss}`
    switch (v % 4) {
      case 0:
        return { kind: 'meaning', kc, prompt: w.tibetan, answer: w.gloss, audio: w.audio, explain, options: optionsWith(w.gloss, pool.map((x) => x.gloss)) }
      case 1:
        return { kind: 'listen', kc, audio: w.audio, answer: w.tibetan, explain, options: optionsWith(w.tibetan, pool.map((x) => x.tibetan), near.map((x) => x.tibetan)) }
      case 2:
        return { kind: 'glyph2wylie', kc, prompt: w.tibetan, answer: w.wylie, audio: w.audio, explain, options: optionsWith(w.wylie, pool.map((x) => x.wylie), near.map((x) => x.wylie)) }
      default:
        return { kind: 'meaning2word', kc, prompt: w.gloss, answer: w.tibetan, audio: w.audio, explain, options: optionsWith(w.tibetan, pool.map((x) => x.tibetan), near.map((x) => x.tibetan)) }
    }
  }

  const s = syllableMap.get(val)!
  const kind = v % 3
  if (kind === 0) return rootQuestion(kc, s)
  if (kind === 1) {
    return {
      kind: 'glyph2wylie', kc, prompt: s.tibetan, answer: s.wylie, audio: s.audio,
      options: optionsWith(s.wylie, syllables.map((x) => x.wylie), syllables.filter((x) => x.wylie !== s.wylie && (x.root === s.root || x.wylie.length === s.wylie.length)).map((x) => x.wylie)),
      explain: `${s.tibetan} 转写为 ${s.wylie}。${rootReason(s)}`,
    }
  }
  return {
    kind: 'listen', kc, audio: s.audio, answer: s.tibetan,
    options: optionsWith(s.tibetan, syllables.map((x) => x.tibetan), syllables.filter((x) => x.root === s.root || x.suffix === s.suffix).map((x) => x.tibetan)),
    explain: `刚才读的是 ${s.tibetan}（${s.wylie}）。`,
  }
}

function rootQuestion(kc: KC, s: WordSyl): Scored {
  const parts = partsOf(s)
  return {
    kind: 'findRoot', kc, prompt: s.tibetan, parts: parts.map((p) => p.ch),
    answer: parts.findIndex((p) => p.role === '基字'), audio: audioOf(s.tibetan), explain: rootReason(s),
  }
}

/**
 * 单元里还没学过的新内容：每节课最多 4 个新字母、元音或规则，
 * 每学完一个就看看哪些词已经能读了，马上加进来（最多 3 个词）。
 */
function freshItems(u: UnitDef, seen: Set<KC>) {
  const have = new Set([...knownThrough(u.n - 1), ...seen])
  const out: KC[] = []
  const ready = (k: KC) => !seen.has(k) && !out.includes(k) && within(wordMap.get(k.slice(2))!.kcs, have)
  const unitWords = u.kcs.filter((k) => k.startsWith('W:'))
  let nNew = 0, nWords = 0
  const addWords = () => {
    for (const w of unitWords) if (nWords < 3 && ready(w)) { out.push(w); nWords++ }
  }
  addWords()
  for (const k of u.kcs) {
    if (k.startsWith('W:') || seen.has(k) || nNew >= 4) continue
    out.push(k)
    have.add(k)
    nNew++
    addWords()
  }
  return out
}

/**
 * 像 Duolingo 一样组一节课：先介绍几个新字母或规则，马上出题；
 * 再介绍用这些字母拼成的新词；中间穿插复习已经学过的内容。
 */
export function buildLesson(unit: number, seen: Set<KC>, weak: KC[] = []): { questions: Question[]; known: Set<KC> } {
  const u = UNITS.find((x) => x.n === unit)!
  const known = knownThrough(unit)
  const fresh = unit === 10 ? [] : freshItems(u, seen)
  const firstRound: Question[] = []
  const later: Question[] = []
  for (const k of fresh) {
    firstRound.push(introFor(k), questionFor(k, 0, known))
    later.push(questionFor(k, 1, known))
  }
  const practiced = [...u.kcs.filter((k) => seen.has(k)), ...u.extra]
  const earlier = [...knownThrough(unit - 1)].filter((k) => seen.has(k) || k.startsWith('S:'))
  const reviewPool = [...new Set([...weak.filter((k) => known.has(k) && !fresh.includes(k)), ...shuffle(practiced), ...shuffle(earlier)])]
  const reviewCount = Math.max(4, 14 - fresh.length * 2)
  for (const k of reviewPool.slice(0, reviewCount)) later.push(questionFor(k, undefined, known))
  // 新内容按顺序先出，复习题打散穿插在后半段
  const mixed = shuffle(later)
  const questions: Question[] = []
  firstRound.forEach((q, i) => {
    questions.push(q)
    if (i % 2 === 1 && i >= 3 && mixed.length) questions.push(mixed.shift()!)
  })
  return { questions: [...questions, ...mixed], known }
}
