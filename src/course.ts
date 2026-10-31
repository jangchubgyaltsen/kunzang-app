import { passages, passageTitles, realAudioOf, syllables, syllableMap, type Syllable } from './content.ts'
import { lineById, linesOf, readLines, tokenMap, yitongOf, type ReadLine } from './reading.ts'
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
export const letterAudio = (l: string) => 'L-' + letterNo(l)

export const VOWELS: [string, string, string][] = [
  ['ི', 'i', 'གི་གུ'],
  ['ུ', 'u', 'ཞབས་ཀྱུ'],
  ['ེ', 'e', 'འགྲེང་བུ'],
  ['ོ', 'o', 'ན་རོ'],
]
export const cvAudio = (l: string, v: string) => `CV-${letterNo(l)}-${VOWELS.find((x) => x[0] === v)![1]}`

// 形近字：出题时优先用作干扰项
export const LOOKALIKE: string[][] = [
  ['ཅ', 'ཙ'], ['ཆ', 'ཚ'], ['ཇ', 'ཛ'], ['པ', 'བ', 'ཕ'], ['ད', 'ཏ', 'ང', 'ཉ'],
  ['ཁ', 'ཤ', 'ག'], ['ཞ', 'ཟ'], ['ར', 'ཡ'], ['ལ', 'ཨ'], ['མ', 'ས', 'ཕ'], ['ན', 'ཏ'], ['ཝ', 'འ', 'ཨ'],
]

type WordSyl = Omit<Syllable, 'count' | 'reviewStatus' | 'audio' | 'audioStatus'>
export type Word = { id: string; tibetan: string; wylie: string; gloss: string; audio: string; syllables: WordSyl[]; kcs: string[]; yitong?: string }
// 词卡读音：原文里出现过的词用切分版（从整句连读里切出来的），其余保留原来的单词音频
export const words = (wordsRaw as Word[]).map((w) => ({ ...w, audio: realAudioOf(w.tibetan) ?? tokenMap.get(w.tibetan)?.audio ?? w.audio, yitong: yitongOf(w.tibetan) }))
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

export type KC = string // L:ཀ  V:ི  R:suf  W:བླ་མ  S:བླ  T:原文里的词  X:原文的一句（行 id）

/** pron 是一本通式注音，按对照表推出来的，还没逐个核对 */
export type Intro = { kind: 'intro'; kc: KC; label: string; big: string; sub?: string; pron?: string; note?: string; audio?: string; parts?: { ch: string; role: string }[] }
/** 跟读：先听整句连读，再自己读（可以录下来对比），不计分 */
export type Shadow = { kind: 'shadow'; kc: KC; line: ReadLine }
export type Question =
  | Intro
  | Shadow
  | { kind: 'order'; kc: KC; audio: string; pieces: string[]; answer: string; explain: string }
  | { kind: 'glyph2wylie'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'wylie2glyph'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'findRoot'; kc: KC; prompt: string; parts: string[]; answer: number; audio?: string; explain: string }
  | { kind: 'listen'; kc: KC; audio: string; options: string[]; answer: string; explain: string }
  | { kind: 'meaning'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
  | { kind: 'meaning2word'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string }
export type Scored = Exclude<Question, Intro | Shadow>

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

export const shuffle = <T,>(a: T[]) => {
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
  if (kc.startsWith('X:')) return lineById.get(kc.slice(2))?.words.map((w) => w.tibetan).join('་') ?? kc
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
    return { kind: 'intro', kc, label: '新词', big: w.tibetan, sub: w.wylie, pron: w.yitong, note: w.gloss, audio: w.audio }
  }
  if (type === 'T') {
    const t = tokenMap.get(val)!
    return { kind: 'intro', kc, label: '原文里的词', big: t.tibetan, sub: wylieOf(t.tibetan), pron: t.yitong, audio: t.audio, note: glossOf(t.tibetan) }
  }
  if (type === 'X') {
    const l = lineById.get(val)!
    return { kind: 'intro', kc, label: '整句', big: l.words.map((w) => w.tibetan).join('་'), pron: l.words.map((w) => w.yitong).join(' '), audio: l.audio }
  }
  const s = syllableMap.get(val)!
  return { kind: 'intro', kc, label: '音节', big: s.tibetan, sub: s.wylie, audio: s.audio, parts: partsOf(s) }
}

const wylieOf = (t: string) => t.split('་').map((x) => syllableMap.get(x)?.wylie ?? '?').join(' ')
/** 原文词的意思：先查词表；带格助词的词（如 བླ་མའི）找不到就不显示 */
const glossOf = (t: string) => wordMap.get(t)?.gloss

/** 原文里的一个词对应的知识点：词表里有就用 W:，否则 T: */
export const tokenKC = (t: string): KC => (wordMap.has(t) ? 'W:' + t : 'T:' + t)

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

  if (type === 'T') {
    const t = tokenMap.get(val)!
    const pool = [...tokenMap.keys()]
    const n = t.tibetan.split('་').length
    const near = pool.filter((x) => x !== val && x.split('་').length === n)
    const explain = `${t.tibetan}（${wylieOf(t.tibetan)}，注音 ${t.yitong}）`
    if (v % 2 === 0) return { kind: 'listen', kc, audio: t.audio, answer: t.tibetan, explain, options: optionsWith(t.tibetan, pool, near) }
    const wy = wylieOf(t.tibetan)
    return {
      kind: 'glyph2wylie', kc, prompt: t.tibetan, answer: wy, audio: t.audio, explain,
      options: optionsWith(wy, pool.map(wylieOf), near.map(wylieOf)),
    }
  }

  if (type === 'X') {
    const l = lineById.get(val)!
    const ws = l.words.map((w) => w.tibetan)
    let pieces = shuffle(ws)
    // 打乱后碰巧和原句一样就再换一次
    for (let k = 0; k < 5 && pieces.join() === ws.join() && ws.length > 1; k++) pieces = shuffle(ws)
    return { kind: 'order', kc, audio: l.audio, pieces, answer: ws.join('་'), explain: `${ws.join('་')}\n${l.words.map((w) => w.yitong).join(' ')}` }
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

// ───────────────────────── 关卡 ─────────────────────────
//
// 像 Duolingo 一样，每个单元拆成一串小关卡，一次只学 2–3 个新东西：
//   learn    新内容：介绍卡 + 马上出题，再穿插复习
//   practice 本单元前面几关的内容再练一遍，不加新内容
//   read     用学过的拼读规则读开篇里的真实音节
//   line     原文一句：先学这句里的词（切分版读音），最后听整句排词序、跟读
//   test     单元小测：不出介绍卡，全单元抽题，80% 通过
// 拼读线（单元 1–10）和诵读线（单元 11 起，开篇原文）各自按顺序解锁，可以同时学。

export type LevelKind = 'learn' | 'practice' | 'read' | 'line' | 'test'
export type Level = { id: string; unit: number; kind: LevelKind; title: string; kcs: KC[]; line?: string }
export type Track = 'spell' | 'read'
export type PathUnit = { n: number; track: Track; title: string; intro: string; examples: string[]; levels: Level[]; passage?: string }

/** 平均分成每份不超过 n 个，避免最后剩一个孤零零的小关 */
const chunk = <T,>(a: T[], n: number) => {
  const k = Math.ceil(a.length / n)
  return Array.from({ length: k }, (_, i) => a.slice(Math.round((i * a.length) / k), Math.round(((i + 1) * a.length) / k)))
}

/** 本单元的新内容按学习顺序排好：每加一个字母或规则，马上把已经能读的词排进来。 */
function unitOrder(u: UnitDef): KC[] {
  const have = new Set(knownThrough(u.n - 1))
  const out: KC[] = []
  const unitWords = u.kcs.filter((k) => k.startsWith('W:'))
  const addWords = () => {
    for (const w of unitWords) if (!out.includes(w) && within(wordMap.get(w.slice(2))!.kcs, have)) out.push(w)
  }
  addWords()
  for (const k of u.kcs) {
    if (k.startsWith('W:')) continue
    out.push(k)
    have.add(k)
    addWords()
  }
  for (const w of unitWords) if (!out.includes(w)) out.push(w)
  return out
}

const SPELL_TITLES = ['5 个字母 · 后加字', '元音 ◌ི · 5 个字母', '元音 ◌ུ · 3 个字母', '元音 ◌ེ ◌ོ', '前加字', '上加字', '下加字', '再后加字 ས', '最后 4 个字母', '综合：开篇全部音节和词']
const SPELL_EXAMPLES = [
  ['ལམ', 'ནང', 'མན་ངག'], ['མི', 'ཟབ', 'ཐར་ལམ'], ['ཞིང', 'དམ་པ', 'ཞལ་ལུང'], ['ཆོས', 'ཆེན་པོ', 'འོད་ཟེར'], ['བདག', 'གསལ', 'ཀུན་བཟང'],
  ['སྣང', 'སྙིང་པོ', 'རྩ་བ'], ['བླ་མ', 'ཕྱག་འཚལ', 'རྒྱལ་བ'], ['སངས་རྒྱས', 'རིག་འཛིན', 'ཐུགས་རྗེ'], ['ལྷ', 'ཚེ་གཅིག'], ['བླ', 'མའི', 'སྐུའི'],
]

function spellUnit(u: UnitDef): PathUnit {
  const levels: Level[] = []
  const id = (s: string) => `u${u.n}-${s}`
  if (u.n < 10) {
    const groups = chunk(unitOrder(u), 3)
    groups.forEach((g, i) => {
      levels.push({ id: id('l' + (i + 1)), unit: u.n, kind: 'learn', title: '新内容 ' + g.map(kcLabel).join(' '), kcs: g })
      // 每学三关，练一关
      if (i % 3 === 2 && i < groups.length - 1)
        levels.push({ id: id('p' + Math.ceil(i / 3)), unit: u.n, kind: 'practice', title: '练一练', kcs: groups.slice(i - 2, i + 1).flat() })
    })
  }
  chunk(u.extra, u.n < 10 ? 10 : 40).forEach((g, i) => levels.push({ id: id('r' + (i + 1)), unit: u.n, kind: 'read', title: '读开篇音节', kcs: g }))
  levels.push({ id: id('t'), unit: u.n, kind: 'test', title: '单元小测', kcs: [...u.kcs, ...u.extra] })
  return { n: u.n, track: 'spell', title: SPELL_TITLES[u.n - 1], intro: u.intro, examples: SPELL_EXAMPLES[u.n - 1], levels }
}

/** 原文单元：一段一个单元；一句一关，长句的词分两关学，最后一关听整句、排词序、跟读。 */
function passageUnit(passage: string, n: number): PathUnit {
  const levels: Level[] = []
  const all: KC[] = []
  for (const l of linesOf(passage)) {
    const ks = [...new Set(l.words.map((w) => tokenKC(w.tibetan)))]
    const groups = ks.length > 6 ? [ks.slice(0, Math.ceil(ks.length / 2)), ks.slice(Math.ceil(ks.length / 2))] : [ks]
    const name = linesOf(passage).length > 1 ? `第 ${l.index + 1} 句` : '这一句'
    groups.forEach((g, i) => {
      const last = i === groups.length - 1
      levels.push({
        id: `${l.id}-${i + 1}`, unit: n, kind: 'line', line: l.id,
        title: name + (groups.length > 1 ? (last ? ' · 下半' : ' · 上半') : ''), kcs: last ? [...g, 'X:' + l.id] : g,
      })
    })
    all.push(...ks, 'X:' + l.id)
  }
  levels.push({ id: `${passage}-t`, unit: n, kind: 'test', title: '整段小测', kcs: [...new Set(all)] })
  return {
    n, track: 'read', passage, title: '原文：' + (passageTitles[passage] ?? passage), levels,
    intro: '一句一关：先认这句里的词，最后听整句连读、排出词序、跟着读。', examples: [],
  }
}

export const PATH: PathUnit[] = [...UNITS.map(spellUnit), ...passages.map((p, i) => passageUnit(p.id, 11 + i))]
export const LEVELS: Level[] = PATH.flatMap((u) => u.levels)
export const levelById = new Map(LEVELS.map((l) => [l.id, l]))
export const unitByN = new Map(PATH.map((u) => [u.n, u]))

const lineKCs = readLines.flatMap((l) => [...l.words.map((w) => tokenKC(w.tibetan)), 'X:' + l.id])
const ALL_WITH_TEXT = new Set([...ALL, ...lineKCs])

/** 出题时认为学习者已经认识的知识点（用来挑干扰项） */
function knownFor(unit: number) {
  return unit <= 10 ? knownThrough(unit) : ALL_WITH_TEXT
}

/** 第一次见的知识点先上介绍卡；ask 时紧跟着出一道题 */
function withIntros(kcs: KC[], seen: Set<KC>, known: Set<KC>, ask: boolean) {
  const out: Question[] = []
  for (const k of kcs) {
    if (k.startsWith('X:')) continue
    if (!seen.has(k)) out.push(introFor(k))
    if (ask) out.push(questionFor(k, 0, known))
  }
  return out
}

/** 组一关的题。seen：已经练过的知识点；weak：最近常错的，优先拿来复习。 */
export function buildLevel(levelId: string, seen: Set<KC>, weak: KC[] = []): { questions: Question[]; known: Set<KC> } {
  const lv = levelById.get(levelId)!
  const u = unitByN.get(lv.unit)!
  const known = knownFor(lv.unit)
  const idx = u.levels.indexOf(lv)
  const earlierInUnit = u.levels.slice(0, idx).flatMap((l) => l.kcs).filter((k) => seen.has(k) && !k.startsWith('X:'))
  const weakKnown = weak.filter((k) => known.has(k) && seen.has(k) && !lv.kcs.includes(k))
  const review = (n: number) => [...new Set([...weakKnown.slice(0, 2), ...shuffle(earlierInUnit)])].slice(0, n).map((k) => questionFor(k, undefined, known))

  if (lv.kind === 'learn' || lv.kind === 'line') {
    const items = lv.kcs.filter((k) => !k.startsWith('X:'))
    const fresh = items.filter((k) => !seen.has(k))
    const first = withIntros(items, seen, known, true)
    const second = shuffle([...items.map((k) => questionFor(k, 1, known)), ...review(Math.max(4, 10 - fresh.length * 2))])
    const qs: Question[] = [...first, ...second]
    if (lv.line && lv.kcs.includes('X:' + lv.line)) {
      const x = 'X:' + lv.line
      if (!seen.has(x)) qs.push(introFor(x))
      qs.push(questionFor(x, 0, known), { kind: 'shadow', kc: x, line: lineById.get(lv.line)! })
    }
    return { questions: qs, known }
  }

  if (lv.kind === 'practice' || lv.kind === 'read') {
    const pick = shuffle(lv.kcs).slice(0, 10)
    const unseen = pick.filter((k) => !seen.has(k))
    return { questions: [...withIntros(unseen, seen, known, false), ...shuffle([...pick.map((k) => questionFor(k, undefined, known)), ...review(2)])], known }
  }

  // 单元小测：全单元抽题；原文小测每句都要排一次词序
  const xs = lv.kcs.filter((k) => k.startsWith('X:'))
  const rest = shuffle(lv.kcs.filter((k) => !k.startsWith('X:'))).slice(0, Math.max(8, 14 - xs.length))
  const unseen = [...xs, ...rest].filter((k) => !seen.has(k))
  return { questions: [...withIntros(unseen, seen, known, false), ...shuffle([...rest.map((k) => questionFor(k, undefined, known)), ...xs.map((k) => questionFor(k, 0, known))])], known }
}

/** 定时抽查：从一个单元里抽题，优先抽最近答错的。 */
export function buildSpotCheck(unit: number, weak: KC[] = []): Question[] {
  const u = unitByN.get(unit)!
  const known = knownFor(unit)
  const pool = [...new Set(u.levels.flatMap((l) => l.kcs))]
  const inPool = new Set(pool)
  const picked = [...new Set([...weak.filter((k) => inPool.has(k)).slice(0, 4), ...shuffle(pool)])].slice(0, 10)
  return shuffle(picked.map((k) => questionFor(k, k.startsWith('X:') ? 0 : undefined, known)))
}
