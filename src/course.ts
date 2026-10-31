import { passages, passageTitles, realAudioOf, syllables, syllableMap, type Syllable } from './content.ts'
import { lineById, linesOf, readLines, tokenMap, yitongOf, type ReadLine } from './reading.ts'
import wordsRaw from './words.json'
import { CV_PRON, CV_SOURCE, PRON, shapeMates, soundMates } from './pron.ts'
import { amdoSentences, amdoSets, amdoTables, amdoWordById, amdoWords, cellById, sentenceById, sylsOf } from './amdo.ts'

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
  /** ask：题目上方的提示语（不给就用默认的）；seq：认读一行字时依次播放的录音 */
  | { kind: 'glyph2wylie'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string; ask?: string; seq?: string[] }
  | { kind: 'wylie2glyph'; kc: KC; prompt: string; options: string[]; answer: string; audio?: string; explain: string; ask?: string }
  | { kind: 'findRoot'; kc: KC; prompt: string; parts: string[]; answer: number; audio?: string; explain: string }
  /** zh：选项是中文意思（听会话选意思） */
  | { kind: 'listen'; kc: KC; audio: string; options: string[]; answer: string; explain: string; zh?: boolean; ask?: string }
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
  /** 安多会话教材里、学到本单元刚好能读的口语词（D:），真人录音 */
  oral: KC[]
  /** 拼读表里刚好能读的格子（P:），真人录音 */
  hear: KC[]
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
    const oral = amdoWords.filter((w) => w.kcs && within(w.kcs, known) && !within(w.kcs, before)).map((w) => 'D:' + w.id)
    UNITS.push({ n: i + 1, intro: p.intro, kcs: [...p.add, ...newWords], extra, oral, hear: hearCells(known, before) })
  }
  const placed = new Set(UNITS.flatMap((u) => u.oral))
  UNITS.push({
    n: 10,
    intro: '综合练习：开篇里的全部音节和词，找基字，认读音；教材里剩下的口语词也在这里。',
    kcs: [],
    extra: [...syllables.filter((s) => !s.needsCheck).map((s) => 'S:' + s.tibetan), ...words.map((w) => 'W:' + w.tibetan)],
    oral: amdoWords.map((w) => 'D:' + w.id).filter((k) => !placed.has(k)),
    hear: amdoTables.find((t) => t.part === '叠加字')!.rows.flat().filter((c) => c.id).map((c) => 'P:' + c.id!),
  })
}

/** 拼读表（真人录音）里学到本单元刚好能读的格子；每单元最多 20 个，均匀抽，其余在资料库里听 */
function hearCells(known: Set<KC>, before: Set<KC>) {
  const skip = ['辅音', '元音', '元音与辅音拼法', '叠加字']
  const cells = amdoTables
    .filter((t) => !skip.includes(t.part))
    .flatMap((t) => t.rows.flat())
    .filter((c) => c.id && c.kcs && within(c.kcs, known) && !within(c.kcs, before))
  const k = Math.max(1, Math.ceil(cells.length / 20))
  return cells.filter((_, i) => i % k === 0).map((c) => 'P:' + c.id!)
}

export const unitOfKC = new Map<KC, number>()
for (const u of UNITS) for (const k of [...u.kcs, ...u.extra, ...u.oral, ...u.hear]) if (!unitOfKC.has(k)) unitOfKC.set(k, u.n)

/** 学到第 n 单元为止认识的全部知识点 */
export function knownThrough(n: number) {
  return new Set(UNITS.filter((u) => u.n <= n).flatMap((u) => [...u.kcs, ...u.extra, ...u.oral, ...u.hear]))
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
  if (kc.startsWith('A:')) return sentenceById.get(kc.slice(2))?.tib ?? kc
  if (kc.startsWith('D:')) return amdoWordById.get(kc.slice(2))?.tib ?? kc
  if (kc.startsWith('P:')) return cellById.get(kc.slice(2))?.cell.tib ?? kc
  if (kc.startsWith('R:')) return RULES[kc]?.name ?? kc
  if (kc.startsWith('V:')) return '◌' + kc.slice(2)
  if (kc.startsWith('X:')) return lineById.get(kc.slice(2))?.words.map((w) => w.tibetan).join('་') ?? kc
  return kc.slice(2)
}

/** 《一本通》第 12–16 页：元音和字母拼起来以后的读法 */
const VOWEL_RULE: Record<string, string> = {
  'ི': '写在上面。安多话里 ི 常常读得像 e：མི me、ཀི ge；在 ཅ ཆ ཇ ཞ ཡ 后面读 i（ཞི xi）。',
  'ུ': '写在下面。安多话里 ུ 也常读得像 e：ཀུ ge、སུ se，所以 ཀི 和 ཀུ 听起来差不多；ཕུ pu 保留 u。',
  'ེ': '写在上面。多读 ei：མེ mei；在 ཅ ཆ ཇ ཞ 后面读 ie（ཆེ qie），ཏ ད 后面读 i（དེ di）。',
  'ོ': '写在上面。多读 u：མོ mu、གོ gu；ཟ ས ལ 后面读 uo（ལོ luo），འོ 读 ao。',
}
const pronLabel = (l: string) => `${PRON[l][0]} ${PRON[l][1]}`

/** 第一次遇到某个知识点时的介绍卡 */
export function introFor(kc: KC): Intro {
  const [type, val] = [kc.slice(0, 1), kc.slice(2)]
  if (type === 'L') {
    const shape = [...(shapeMates.get(val) ?? [])], sound = [...(soundMates.get(val) ?? [])]
    const note = [
      `转写 ${letterWylie.get(val)}。`,
      sound.length ? `书上让和 ${sound.join(' ')} 比较发音。` : '',
      shape.length ? `形近字：${shape.join(' ')}。` : '',
    ].join('')
    return { kind: 'intro', kc, label: '新字母', big: val, sub: `${PRON[val][0]} ${PRON[val][1]}`, audio: letterAudio(val), note }
  }
  if (type === 'V') {
    const [mark, , name] = VOWELS.find((x) => x[0] === val)!
    return {
      kind: 'intro', kc, label: '新元音', big: 'མ' + mark, sub: CV_PRON['མ' + mark][0], audio: cvAudio('མ', mark),
      note: `${mark} 叫 ${name}。${VOWEL_RULE[mark]}`,
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
  if (type === 'A') {
    const s = sentenceById.get(val)!
    return { kind: 'intro', kc, label: '会话 · 真人录音', big: s.tib, note: s.zh, audio: s.audio }
  }
  if (type === 'D') {
    const w = amdoWordById.get(val)!
    return { kind: 'intro', kc, label: '口语词 · 真人录音', big: w.tib, note: w.zh, audio: w.audio }
  }
  if (type === 'P') {
    const c = cellById.get(val)!
    return { kind: 'intro', kc, label: '听拼读 · ' + c.part, big: c.cell.tib, audio: c.cell.audio }
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

  // 字母：照《一本通》第一、二课的练习出题——认读注音、比较成对字母的发音、比较形体差异、认读一行字母
  if (type === 'L') {
    const [p, hz] = PRON[val]
    const pool = (knownLetters.length >= 4 ? knownLetters : LETTERS).map((l) => l[0])
    // 书上成对比较的字，只用已经学过的（还没学到的不拿来当干扰项）
    const inPool = (l: string) => pool.includes(l)
    const shape = [...(shapeMates.get(val) ?? [])].filter(inPool)
    const sound = [...(soundMates.get(val) ?? [])].filter(inPool)
    // 注音一样的字（ཀ ག 都注 ga）放在“看字选注音”的选项里分不出来
    const diffPron = (l: string) => PRON[l][0] !== p
    const explain =
      `${val} 读 ${p}（${hz}），转写 ${letterWylie.get(val)}。` +
      (sound.length ? `书上让和 ${sound.join(' ')} 比较发音${sound.some((x) => !diffPron(x)) ? '，注音一样，读音不同，听录音分辨' : ''}。` : '') +
      (shape.length ? `形近字：${shape.join(' ')}。` : '')
    switch (v % 4) {
      case 0:
        return {
          kind: 'glyph2wylie', kc, ask: '这个字母怎么读？', prompt: val, answer: pronLabel(val), audio: letterAudio(val), explain,
          options: optionsWith(pronLabel(val), pool.filter(diffPron).map(pronLabel), [...shape, ...sound].filter(diffPron).map(pronLabel)),
        }
      case 1:
        if (sound.length)
          return { kind: 'listen', kc, ask: '比较发音：听录音，是哪一个？', audio: letterAudio(val), answer: val, explain, options: shuffle([val, ...sound, ...shape.slice(0, 1)]) }
        return { kind: 'listen', kc, audio: letterAudio(val), answer: val, explain, options: optionsWith(val, pool, shape) }
      case 2:
        return {
          kind: 'wylie2glyph', kc, ask: '比较字形：哪个字母读', prompt: pronLabel(val), answer: val, audio: letterAudio(val), explain,
          options: optionsWith(val, pool.filter(diffPron), shape.filter(diffPron)),
        }
      default: {
        // 认读：一行四个字母，像书上的 ཀ་ཅ་ད་པ；错的选项把其中一个换成形近字或别的字的读音
        const row = shuffle([val, ...shuffle(pool.filter((l) => l !== val)).slice(0, 3)])
        const read = (r: string[]) => r.map((l) => PRON[l][0]).join(' ')
        const answer = read(row)
        const wrong = new Set<string>()
        for (let k = 0; k < 40 && wrong.size < 3; k++) {
          const j = k % row.length
          const near = [...(shapeMates.get(row[j]) ?? []), ...(soundMates.get(row[j]) ?? [])].filter((x) => inPool(x) && PRON[x][0] !== PRON[row[j]][0])
          const sub = k < 12 && near.length ? pick(near) : pick(pool)
          const alt = read(row.map((l, m) => (m === j ? sub : l)))
          if (alt !== answer) wrong.add(alt)
        }
        return {
          kind: 'glyph2wylie', kc, ask: '认读：这一行怎么读？', prompt: row.join('་'), answer, seq: row.map(letterAudio), explain,
          options: shuffle([answer, ...wrong]),
        }
      }
    }
  }

  // 元音：看组合选注音，或听录音选组合。注音照《一本通》，书上没有的按规律推
  if (type === 'V') {
    const [mark, , name] = VOWELS.find((x) => x[0] === val)!
    const bases = (knownLetters.length ? knownLetters : LETTERS).filter((l) => !['འ', 'ཨ'].includes(l[0]))
    const [base] = pick(bases)
    const shown = base + mark
    const [p, src] = CV_PRON[shown]
    const siblings = VOWELS.filter((x) => x[0] === mark || known.has('V:' + x[0])).map((x) => base + x[0])
    const knownCV = VOWELS.filter((x) => known.has('V:' + x[0])).flatMap((x) => bases.map((l) => l[0] + x[0]))
    const explain = `${mark} 叫 ${name}。${shown} 读 ${p}（${CV_SOURCE[src]}）。${VOWEL_RULE[mark]}`
    if (v % 2 === 0)
      return {
        kind: 'glyph2wylie', kc, ask: '这个怎么读？', prompt: shown, answer: p, audio: cvAudio(base, mark), explain,
        options: optionsWith(p, Object.values(CV_PRON).map((x) => x[0]), [PRON[base][0], ...siblings.map((x) => CV_PRON[x][0]), ...knownCV.map((x) => CV_PRON[x][0])]),
      }
    // 听音选字：读音和答案一样的组合（ཀི ཀུ 都是 ge）不能当干扰项
    const ok = (x: string) => x === shown || CV_PRON[x][0] !== p
    return {
      kind: 'listen', kc, audio: cvAudio(base, mark), answer: shown, explain,
      options: optionsWith(shown, knownCV.filter(ok), [...siblings.filter(ok), base]),
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

  // 安多会话 300 句（A:编号）
  if (type === 'A') {
    const s = sentenceById.get(val)!
    const explain = `${s.tib}\n${s.zh}`
    const near = amdoSentences.filter((x) => x !== s && Math.abs(x.tib.length - s.tib.length) < 12)
    const syls = sylsOf(s.tib)
    switch (v % 5) {
      case 4:
        return { kind: 'listen', kc, audio: s.audio, answer: s.zh, explain, zh: true, options: optionsWith(s.zh, amdoSentences.map((x) => x.zh), near.map((x) => x.zh)) }
      case 0:
        return { kind: 'meaning', kc, prompt: s.tib, answer: s.zh, audio: s.audio, explain, options: optionsWith(s.zh, amdoSentences.map((x) => x.zh), near.map((x) => x.zh)) }
      case 1:
        return { kind: 'meaning2word', kc, prompt: s.zh, answer: s.tib, audio: s.audio, explain, options: optionsWith(s.tib, amdoSentences.map((x) => x.tib), near.map((x) => x.tib)) }
      case 2:
        if (syls.length >= 2 && syls.length <= 9) {
          let pieces = shuffle(syls)
          for (let k = 0; k < 5 && pieces.join() === syls.join(); k++) pieces = shuffle(syls)
          return { kind: 'order', kc, audio: s.audio, pieces, answer: syls.join('་'), explain }
        }
        return { kind: 'listen', kc, audio: s.audio, answer: s.tib, explain, options: optionsWith(s.tib, amdoSentences.map((x) => x.tib), near.map((x) => x.tib)) }
      default:
        return { kind: 'listen', kc, audio: s.audio, answer: s.tib, explain, options: optionsWith(s.tib, amdoSentences.map((x) => x.tib), near.map((x) => x.tib)) }
    }
  }

  // 拼读表的一格（P:编号）：听音选字，干扰项优先取同一行、同一张表
  if (type === 'P') {
    const c = cellById.get(val)!
    const same = c.row.filter((x) => x.id && x !== c.cell).map((x) => x.tib)
    const table = amdoTables.find((t) => t.part === c.part)!.rows.flat().filter((x) => x.id).map((x) => x.tib)
    return { kind: 'listen', kc, audio: c.cell.audio, answer: c.cell.tib, explain: `刚才读的是 ${c.cell.tib}（${c.part}）。`, options: optionsWith(c.cell.tib, table, same) }
  }

  // 安多会话教材的单词（D:编号）
  if (type === 'D') {
    const w = amdoWordById.get(val)!
    const explain = `${w.tib}：${w.zh}`
    const near = amdoWords.filter((x) => x !== w && (x.page === w.page || x.tib.length === w.tib.length))
    switch (v % 3) {
      case 0:
        return { kind: 'meaning', kc, prompt: w.tib, answer: w.zh, audio: w.audio, explain, options: optionsWith(w.zh, amdoWords.map((x) => x.zh), near.map((x) => x.zh)) }
      case 1:
        return { kind: 'listen', kc, audio: w.audio, answer: w.tib, explain, options: optionsWith(w.tib, amdoWords.map((x) => x.tib), near.map((x) => x.tib)) }
      default:
        return { kind: 'meaning2word', kc, prompt: w.zh, answer: w.tib, audio: w.audio, explain, options: optionsWith(w.tib, amdoWords.map((x) => x.tib), near.map((x) => x.tib)) }
    }
  }

  // 安多会话 300 句（A:编号）
  if (type === 'A') {
    const s = sentenceById.get(val)!
    const explain = `${s.tib}\n${s.zh}`
    const near = amdoSentences.filter((x) => x !== s && Math.abs(x.tib.length - s.tib.length) < 12)
    const syls = sylsOf(s.tib)
    switch (v % 5) {
      case 4:
        return { kind: 'listen', kc, audio: s.audio, answer: s.zh, explain, zh: true, options: optionsWith(s.zh, amdoSentences.map((x) => x.zh), near.map((x) => x.zh)) }
      case 0:
        return { kind: 'meaning', kc, prompt: s.tib, answer: s.zh, audio: s.audio, explain, options: optionsWith(s.zh, amdoSentences.map((x) => x.zh), near.map((x) => x.zh)) }
      case 1:
        return { kind: 'meaning2word', kc, prompt: s.zh, answer: s.tib, audio: s.audio, explain, options: optionsWith(s.tib, amdoSentences.map((x) => x.tib), near.map((x) => x.tib)) }
      case 2:
        if (syls.length >= 2 && syls.length <= 9) {
          let pieces = shuffle(syls)
          for (let k = 0; k < 5 && pieces.join() === syls.join(); k++) pieces = shuffle(syls)
          return { kind: 'order', kc, audio: s.audio, pieces, answer: syls.join('་'), explain }
        }
        return { kind: 'listen', kc, audio: s.audio, answer: s.tib, explain, options: optionsWith(s.tib, amdoSentences.map((x) => x.tib), near.map((x) => x.tib)) }
      default:
        return { kind: 'listen', kc, audio: s.audio, answer: s.tib, explain, options: optionsWith(s.tib, amdoSentences.map((x) => x.tib), near.map((x) => x.tib)) }
    }
  }

  // 拼读表的一格（P:编号）：听音选字，干扰项优先取同一行、同一张表
  if (type === 'P') {
    const c = cellById.get(val)!
    const same = c.row.filter((x) => x.id && x !== c.cell).map((x) => x.tib)
    const table = amdoTables.find((t) => t.part === c.part)!.rows.flat().filter((x) => x.id).map((x) => x.tib)
    return { kind: 'listen', kc, audio: c.cell.audio, answer: c.cell.tib, explain: `刚才读的是 ${c.cell.tib}（${c.part}）。`, options: optionsWith(c.cell.tib, table, same) }
  }

  // 安多会话教材的单词（D:编号）
  if (type === 'D') {
    const w = amdoWordById.get(val)!
    const explain = `${w.tib}：${w.zh}`
    const near = amdoWords.filter((x) => x !== w && (x.page === w.page || x.tib.length === w.tib.length))
    switch (v % 3) {
      case 0:
        return { kind: 'meaning', kc, prompt: w.tib, answer: w.zh, audio: w.audio, explain, options: optionsWith(w.zh, amdoWords.map((x) => x.zh), near.map((x) => x.zh)) }
      case 1:
        return { kind: 'listen', kc, audio: w.audio, answer: w.tib, explain, options: optionsWith(w.tib, amdoWords.map((x) => x.tib), near.map((x) => x.tib)) }
      default:
        return { kind: 'meaning2word', kc, prompt: w.zh, answer: w.tib, audio: w.audio, explain, options: optionsWith(w.tib, amdoWords.map((x) => x.tib), near.map((x) => x.tib)) }
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

export type LevelKind = 'learn' | 'practice' | 'read' | 'line' | 'test' | 'talk'
/** talk 关的三步：听懂（听录音选意思）→ 认读（看藏文选意思、看中文选藏文）→ 说（排音节、听音选句） */
export type TalkStage = 'hear' | 'read' | 'say'
export type Level = { id: string; unit: number; kind: LevelKind; title: string; kcs: KC[]; line?: string; stage?: TalkStage }
export type Track = 'spell' | 'read' | 'talk'
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
  // 安多会话教材：用刚学的拼读读口语词，听拼读表的真人录音
  chunk(u.oral, 10).forEach((g, i) => levels.push({ id: id('d' + (i + 1)), unit: u.n, kind: 'learn', title: '口语词 · 真人录音', kcs: g }))
  chunk(u.hear, 10).forEach((g, i) => levels.push({ id: id('h' + (i + 1)), unit: u.n, kind: 'practice', title: '听拼读 · 真人录音', kcs: g }))
  levels.push({ id: id('t'), unit: u.n, kind: 'test', title: '单元小测', kcs: [...u.kcs, ...u.extra, ...u.oral] })
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

/** 会话线：《安多方言会话教材》300 句，15 句一个单元，从第一天就能学，以听懂为先 */
export const TALK_BASE = 31
function talkUnit(set: { title: string; ids: string[] }, i: number): PathUnit {
  const n = TALK_BASE + i
  const ks = set.ids.map((x) => 'A:' + x)
  const half = Math.ceil(ks.length / 2)
  const id = (s: string) => `a${i + 1}-${s}`
  const first = sentenceById.get(set.ids[0])!
  const levels: Level[] = [
    { id: id('h1'), unit: n, kind: 'talk', stage: 'hear', title: '听懂 · 前半', kcs: ks.slice(0, half) },
    { id: id('h2'), unit: n, kind: 'talk', stage: 'hear', title: '听懂 · 后半', kcs: ks.slice(half) },
    { id: id('r'), unit: n, kind: 'talk', stage: 'read', title: '认读', kcs: ks },
    { id: id('s'), unit: n, kind: 'talk', stage: 'say', title: '说：排出整句', kcs: ks },
    { id: id('t'), unit: n, kind: 'test', title: '单元小测', kcs: ks },
  ]
  return {
    n, track: 'talk', title: `会话 ${i + 1} · ${set.title}`, levels, examples: [],
    intro: `从“${first.zh}”开始的 ${ks.length} 句安多话，全部是真人录音。先听懂，再认读，最后自己排出整句。`,
  }
}

export const PATH: PathUnit[] = [...UNITS.map(spellUnit), ...passages.map((p, i) => passageUnit(p.id, 11 + i)), ...amdoSets.map(talkUnit)]
export const LEVELS: Level[] = PATH.flatMap((u) => u.levels)
export const levelById = new Map(LEVELS.map((l) => [l.id, l]))
export const unitByN = new Map(PATH.map((u) => [u.n, u]))

const lineKCs = readLines.flatMap((l) => [...l.words.map((w) => tokenKC(w.tibetan)), 'X:' + l.id])
const ALL_WITH_TEXT = new Set([...ALL, ...lineKCs])

/** 出题时认为学习者已经认识的知识点（用来挑干扰项） */
function knownFor(unit: number) {
  return unit <= 10 ? knownThrough(unit) : ALL_WITH_TEXT
}

/** 会话关每一步用的题型（见 questionFor 的 A: 分支） */
const TALK_VARIANTS: Record<TalkStage, number[]> = { hear: [4, 4], read: [0, 1], say: [2, 3] }

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
    // 第二轮每个知识点换一种考法，不要一关里同一种题连着出
    const second = shuffle([...items.map((k, j) => questionFor(k, 1 + (j % 3), known)), ...review(Math.max(4, 10 - fresh.length * 2))])
    const qs: Question[] = [...first, ...second]
    if (lv.line && lv.kcs.includes('X:' + lv.line)) {
      const x = 'X:' + lv.line
      if (!seen.has(x)) qs.push(introFor(x))
      qs.push(questionFor(x, 0, known), { kind: 'shadow', kc: x, line: lineById.get(lv.line)! })
    }
    return { questions: qs, known }
  }

  if (lv.kind === 'talk') {
    const [a, b] = TALK_VARIANTS[lv.stage ?? 'hear']
    if (lv.stage === 'hear') {
      // 新句子先听一遍（介绍卡），马上听音选意思；最后再打乱听一轮
      const first = lv.kcs.flatMap((k) => [...(seen.has(k) ? [] : [introFor(k)]), questionFor(k, a, known)])
      return { questions: [...first, ...shuffle(lv.kcs).map((k) => questionFor(k, b, known))], known }
    }
    const pick = shuffle(lv.kcs).slice(0, 10)
    return { questions: pick.map((k, j) => questionFor(k, j % 2 ? b : a, known)), known }
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
