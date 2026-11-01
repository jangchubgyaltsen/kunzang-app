import { wordMap } from './course.ts'

/**
 * 全书原文的逐词释义。词表在 public/book/gloss.json（由 scripts/build_gloss.py 生成），打开原文时才下载。
 * 查词顺序：课程词表里人工写的释义 → 全书词表原形 → 去掉粘在词尾的助词（འི ས ར འང འམ འོ）再查 →
 * 按音节拆成词表里有的几段，分别给意思。
 */
export type GlossPart = { tibetan: string; gloss?: string; uncertain?: boolean }
export type WordGloss = {
  /** 词本身的意思（查到的是去掉助词后的原形时，这里是原形的意思） */
  gloss?: string
  uncertain?: boolean
  /** 去掉助词后的原形，和原词不同时才有 */
  base?: string
  /** 粘在词尾的助词及其作用 */
  particle?: { tibetan: string; note: string }
  /** 整词查不到时，拆成几段各自的意思 */
  parts?: GlossPart[]
}

type Dict = Map<string, string>
let dict: Promise<Dict> | null = null
export function loadGloss(): Promise<Dict> {
  if (!dict) {
    dict = fetch('./book/gloss.json')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Record<string, string>>
      })
      .then((o) => new Map(Object.entries(o)))
    dict.catch(() => (dict = null))
  }
  return dict
}

const PARTICLES: [string, string][] = [
  ['འི', '的（属格助词）'],
  ['འང', '也（让步助词）'],
  ['འམ', '或、吗（选择／疑问助词）'],
  ['འོ', '（句末助词，表示一句话说完）'],
]
const SUFFIX_NOTE: Record<string, string> = {
  ས: '由、以（作格／工具格助词，接在元音后）',
  ར: '于、为、成（为格助词，接在元音后）',
}
/** 本身就是一个词、不要把结尾的 ས ར 当助词拆掉的 */
const KEEP = new Set(
  'ནས ལས ཀྱིས གྱིས གིས ཡིས ཞེས ཅེས ཤེས ཤེས་པ འགྱུར གྱུར བྱས ཟེར ཡར མར སྔར ཕྱིར སླར ཚུར ཕར པས བས ཏེ ཡོངས ལོངས རིས གཞིར'.split(' '),
)
const VOWELS = 'ིེོུ'
/** 音节以元音或下加字结尾、或只有一个字母：这种开音节后面才会直接粘 ས ར */
const isOpen = (syl: string) => {
  const c = syl[syl.length - 1]
  return syl.length === 1 || VOWELS.includes(c) || (c >= 'ྐ' && c <= 'ྼ')
}

function entry(d: Dict, t: string): { gloss: string; uncertain: boolean } | null {
  const curated = wordMap.get(t)?.gloss
  if (curated) return { gloss: curated, uncertain: false }
  const g = d.get(t)
  if (!g) return null
  return g.startsWith('?') ? { gloss: g.slice(1), uncertain: true } : { gloss: g, uncertain: false }
}

/** 去掉词尾助词：返回 [原形, 助词, 说明]，没有助词时返回 null */
function stripParticle(d: Dict, w: string): [string, string, string] | null {
  if (KEEP.has(w)) return null
  const syls = w.split('་')
  const last = syls[syls.length - 1]
  for (const [p, note] of PARTICLES)
    if (last.endsWith(p) && last.length > p.length) return [[...syls.slice(0, -1), last.slice(0, -p.length)].join('་'), p, note]
  for (const p of ['ས', 'ར']) {
    if (!last.endsWith(p) || last.length < 2) continue
    const rest = last.slice(0, -1)
    const base = [...syls.slice(0, -1), rest].join('་')
    if (isOpen(rest) && (entry(d, base) || d.has(base))) return [base, p, SUFFIX_NOTE[p]]
  }
  return null
}

/** 按音节从左到右，每次取词表里最长的一段 */
function split(d: Dict, w: string): GlossPart[] {
  const syls = w.split('་')
  const out: GlossPart[] = []
  let i = 0
  while (i < syls.length) {
    let hit = false
    for (let j = syls.length; j > i; j--) {
      const piece = syls.slice(i, j).join('་')
      const e = entry(d, piece) ?? (j === syls.length ? stripEntry(d, piece) : null)
      if (e && !(i === 0 && j === syls.length)) {
        out.push({ tibetan: piece, gloss: e.gloss, uncertain: e.uncertain })
        i = j
        hit = true
        break
      }
    }
    if (!hit) {
      out.push({ tibetan: syls[i] })
      i++
    }
  }
  return out
}

function stripEntry(d: Dict, w: string) {
  const s = stripParticle(d, w)
  if (!s) return null
  const e = entry(d, s[0])
  return e ? { gloss: `${e.gloss} + ${s[2].split('（')[0]}`, uncertain: e.uncertain } : null
}

export function glossOf(d: Dict, w: string): WordGloss {
  const e = entry(d, w)
  if (e) return e
  const s = stripParticle(d, w)
  if (s) {
    const [base, p, note] = s
    const b = entry(d, base)
    const particle = { tibetan: p, note }
    if (b) return { ...b, base, particle }
    return { base, particle, parts: base.includes('་') ? split(d, base) : undefined }
  }
  if (!w.includes('་')) return {}
  const parts = split(d, w)
  return parts.some((p) => p.gloss) ? { parts } : {}
}

/** 释义里可以拿来在中文译文里找对应的词：去掉括号里的说明，按顿号、分号拆开，留两个字以上的 */
export function glossTerms(g: WordGloss): string[] {
  const texts = g.gloss ? [g.gloss] : (g.parts ?? []).flatMap((p) => (p.gloss ? [p.gloss] : []))
  const out = new Set<string>()
  for (const t of texts)
    for (const piece of t.replace(/（[^）]*）/g, '、').split(/[、；，+\s]/)) {
      const x = piece.replace(/[^一-鿿]/g, '')
      if (x.length >= 2 && x.length <= 6) out.add(x)
      // 去掉“的”“了”这类结尾再试一次（“说过的”→“说过”）
      const y = x.replace(/[的了者]$/, '')
      if (y.length >= 2 && y !== x) out.add(y)
    }
  return [...out]
}

/** 词下面那一行小字：释义的第一个意思，去掉括号里的说明 */
export function shortGloss(g: WordGloss): string {
  const text = g.gloss ?? (g.parts?.some((p) => p.gloss) ? g.parts.map((p) => (p.gloss ? firstSense(p.gloss) : '…')).join('+') : '')
  return g.gloss ? firstSense(text) : text
}
const firstSense = (t: string) => {
  const x = t.replace(/^（([^）]*)）$/, '$1').split(/[、；]/)[0].replace(/（[^）]*）/g, '').trim()
  return x || t.replace(/[（）]/g, '').split(/[、；]/)[0]
}
