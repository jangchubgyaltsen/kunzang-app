import type { Intro, KC, Scored, SelfRated } from './course.ts'
import { amdoPinyinOfWord } from './amdoPron.ts'

/**
 * 仪轨偈颂：数据来自「藏汉课诵阅读器」的颂词库（scripts/build_verses.py → public/verse/verses.json），用到时才下载。
 *
 * 学法照「科判颂词背诵器」：学习单位是一句偈颂。
 * - G:词    偈颂里的词。全 App 只记一张卡，别的仪轨里再出现就只复习，不重学。复习在每天的「卡片」里。
 * - J:仪轨/句  一句偈颂。新句：先把没学过的词一个个学（介绍 → 选意思），再看整句（逐词释义、汉义），
 *   对照（看藏文选汉义、看汉义选藏文），最后遮字背诵：通读 → 遮三分之二 → 只留首字。复习时直接只留首字。
 */
export type VWord = { t: string; g: string; s: number; n: number; a?: string }
export type VLine = { id: string; bo: string; zh: string; ph: string; syl: string[]; w: VWord[]; same?: string }
export type VSection = { title: string; lines: VLine[] }
export type Ritual = { id: string; title: string; titleBo: string; cats: string[]; gloss: 'draft' | 'ok'; source: string; sections: VSection[] }
export type WordInfo = { g: string; n: number; a?: string }
type Data = { cats: string[]; rituals: Ritual[]; course: string[]; words: Record<string, WordInfo> }

export let verseData: Data | null = null
export const ritualById = new Map<string, Ritual>()
/** 学习线上的句子：「仪轨/句」→ 句子和所在仪轨 */
export const lineByKey = new Map<string, { r: Ritual; l: VLine }>()
export let course: string[] = []
export let courseIndex = new Map<string, number>()
export const wordByT = new Map<string, WordInfo>()

let loading: Promise<Data> | null = null
export function loadVerses(): Promise<Data> {
  if (verseData) return Promise.resolve(verseData)
  loading ??= fetch('./verse/verses.json')
    .then((r) => {
      if (!r.ok) throw new Error('verses.json ' + r.status)
      return r.json() as Promise<Data>
    })
    .then((d) => {
      verseData = d
      for (const r of d.rituals) {
        ritualById.set(r.id, r)
        for (const s of r.sections) for (const l of s.lines) lineByKey.set(`${r.id}/${l.id}`, { r, l })
      }
      course = d.course
      courseIndex = new Map(course.map((k, i) => [k, i]))
      for (const [t, w] of Object.entries(d.words)) wordByT.set(t, w)
      return d
    })
  loading.catch(() => (loading = null))
  return loading
}

export const wordAudio = (a?: string) => (a ? 'verse/w/' + a : undefined)
export const pronOf = (t: string) => amdoPinyinOfWord(t) ?? ''
/** 一句的藏文，逐词用 ་ 连起来（和原文一样，句末的 ། 另加） */
export const lineAudio = (l: VLine) => l.w.map((w) => wordAudio(w.a)).filter((x): x is string => !!x)
/** 这个词能不能当一张卡学：有释义，不是「…」 */
export const learnable = (w: VWord) => !!w.g && wordByT.has(w.t)
/** 一句对应的学习卡（同一句在别的仪轨里先学过的，算那一句） */
export const lineKC = (rid: string, l: VLine): KC | undefined => {
  const k = l.same ?? `${rid}/${l.id}`
  return courseIndex.has(k) ? 'J:' + k : undefined
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
function optionsWith(answer: string, pool: string[], preferred: string[] = [], k = 4) {
  const others = [...new Set([...shuffle(preferred), ...shuffle(pool)])].filter((x) => x && x !== answer)
  return shuffle([answer, ...others.slice(0, k - 1)])
}

/** 词卡的出处：学习线上第一次出现它的那句 */
function firstLineOf(t: string) {
  for (const k of course) {
    const x = lineByKey.get(k)!
    const i = x.l.w.findIndex((w) => w.t === t)
    if (i >= 0) return { ...x, i }
  }
  return undefined
}

const ctxOf = (l: VLine, i: number) => ({ words: l.w.map((w) => w.t), i })

export function verseLabel(kc: KC) {
  if (kc.startsWith('G:')) return kc.slice(2)
  const x = lineByKey.get(kc.slice(2))
  return x ? x.l.bo : kc
}

/** 介绍：词卡（在哪一句里学到的就用那句做例句），句卡（整句，逐词释义） */
export function verseIntro(kc: KC, at?: { rid: string; l: VLine }): Intro {
  if (kc.startsWith('G:')) {
    const t = kc.slice(2)
    const w = wordByT.get(t)
    const x = at ? { r: ritualById.get(at.rid)!, l: at.l, i: at.l.w.findIndex((v) => v.t === t) } : firstLineOf(t)
    const here = x && x.i >= 0 ? x.l.w[x.i].g : undefined
    return {
      kind: 'intro', kc, label: `偈颂词${x ? ' · ' + x.r.title : ''}`, big: t, pron: pronOf(t), audio: wordAudio(w?.a),
      note: here && w && here !== w.g ? `${here}（常见：${w.g}）` : (here ?? w?.g),
      ctx: x && x.i >= 0 ? ctxOf(x.l, x.i) : undefined,
    }
  }
  const x = lineByKey.get(kc.slice(2))!
  return { kind: 'intro', kc, label: `整句 · ${x.r.title}`, big: x.l.bo, verse: { rid: x.r.id, line: x.l } }
}

/** 选择题：词看藏文选意思、看意思选藏文、听音选藏文；句子看藏文选汉义、看汉义选藏文 */
export function verseQuestion(kc: KC, variant = Math.floor(Math.random() * 3)): Scored {
  if (kc.startsWith('G:')) {
    const t = kc.slice(2)
    const w = wordByT.get(t)!
    const audio = wordAudio(w.a)
    const all = [...wordByT.entries()]
    const gl = all.map(([, v]) => v.g)
    // 形近：首音节相同的词
    const near = all.filter(([x]) => x !== t && x.split('་')[0] === t.split('་')[0]).map(([x]) => x)
    const explain = `${t}（${pronOf(t)}）：${w.g}`
    const v = variant % 3
    if (v === 1) return { kind: 'meaning2word', kc, prompt: w.g, answer: t, audio, explain, options: optionsWith(t, all.filter(([x]) => x.length < t.length + 8).map(([x]) => x), near) }
    if (v === 2 && audio) return { kind: 'listen', kc, audio, answer: t, explain, ask: '听这个词，选出藏文', options: optionsWith(t, all.filter(([, x]) => x.a).map(([x]) => x), near) }
    return { kind: 'meaning', kc, prompt: t, answer: w.g, audio, explain, options: optionsWith(w.g, gl.filter((g) => g !== w.g)) }
  }
  const key = kc.slice(2)
  const x = lineByKey.get(key)!
  // 干扰项先用同一部仪轨的句子，不够再从前后的学习线上补
  const same = x.r.sections.flatMap((s) => s.lines).filter((l) => l.zh && l.id !== x.l.id)
  const i = courseIndex.get(key) ?? 0
  const around = course.slice(Math.max(0, i - 40), i + 40).map((k) => lineByKey.get(k)!.l).filter((l) => l !== x.l)
  const audio = undefined
  if (variant % 2 === 1)
    return { kind: 'meaning2word', kc, prompt: x.l.zh, answer: x.l.bo, audio, explain: x.l.zh, options: optionsWith(x.l.bo, around.map((l) => l.bo), same.map((l) => l.bo)) }
  return { kind: 'meaning', kc, prompt: x.l.bo, answer: x.l.zh, audio, explain: x.l.bo, options: optionsWith(x.l.zh, around.map((l) => l.zh), same.map((l) => l.zh)) }
}

/** 回忆卡：词先想意思再翻面；句子是遮字背诵（复习只留首字） */
export function verseRecall(kc: KC, listen = false): SelfRated | undefined {
  if (kc.startsWith('G:')) {
    const t = kc.slice(2)
    const w = wordByT.get(t)
    if (!w) return undefined
    const x = firstLineOf(t)
    const audio = wordAudio(w.a)
    return {
      kind: 'recall', kc, ask: listen && audio ? '听这个词，想想是什么意思' : '这个词是什么意思？', front: t, audio,
      autoplay: listen && !!audio, hideFront: listen && !!audio,
      ctx: x ? ctxOf(x.l, x.i) : undefined,
      back: { main: w.g, sub: pronOf(t), uncertain: true },
    }
  }
  return lineByKey.has(kc.slice(2)) ? maskCard(kc, 3) : undefined
}

/**
 * 遮字：level 0 通读（全都看得见，读一遍）；2 遮三分之二（每三个音节留一个）；3 只留首字。
 * 上面给汉义做提示，自己背出来，再点「看原文」对照，自评。
 */
export function maskCard(kc: KC, level: 0 | 2 | 3): SelfRated {
  return { kind: 'mask', kc, level }
}

/** 遮字：哪些音节遮住 */
export function maskedSyl(l: VLine, level: number): boolean[] {
  const n = l.syl.length
  if (level === 0) return Array(n).fill(false)
  if (level === 3) return l.syl.map((_, i) => i > 0)
  // 每三个音节留一个，留的位置按句子错开，免得总是同一列
  const off = (l.bo.length * 7) % 3
  return l.syl.map((_, i) => (i + off) % 3 !== 0)
}

/** 新句的学习步骤（照背诵器）：词 → 整句 → 对照 → 遮字。known：学过的词 */
export function newLineSteps(key: string, known: Set<KC>): { words: KC[]; steps: (Intro | Scored | SelfRated)[]; wordQs: Scored[] } {
  const x = lineByKey.get(key)!
  const kc: KC = 'J:' + key
  const words: KC[] = []
  for (const w of x.l.w) {
    const k = 'G:' + w.t
    if (learnable(w) && !known.has(k) && !words.includes(k)) words.push(k)
  }
  const intros = words.map((k) => verseIntro(k, { rid: x.r.id, l: x.l }))
  const wordQs = words.map((k) => verseQuestion(k, 0))
  const steps = [
    ...intros,
    verseIntro(kc),
    verseQuestion(kc, 0),
    verseQuestion(kc, 1),
    maskCard(kc, 0),
    maskCard(kc, 2),
    maskCard(kc, 3),
  ]
  return { words, steps, wordQs }
}

/** 今天新学哪几句：学习线上接着往下，至少一句；新词凑够 NEW_WORDS 个或满 MAX_LINES 句就停 */
export const MAX_LINES = 3
export const NEW_WORDS = 10
export function pickLines(introduced: Set<KC>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let nw = 0
  for (const k of course) {
    if (introduced.has('J:' + k)) continue
    const l = lineByKey.get(k)!.l
    const fresh = l.w.filter((w) => learnable(w) && !introduced.has('G:' + w.t) && !seen.has(w.t))
    if (out.length && nw + fresh.length > NEW_WORDS + 4) break
    out.push(k)
    fresh.forEach((w) => seen.add(w.t))
    nw += fresh.length
    if (out.length >= MAX_LINES || nw >= NEW_WORDS) break
  }
  return out
}
