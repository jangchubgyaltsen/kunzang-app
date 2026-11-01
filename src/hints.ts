import { LETTERS, letterAudio, cvAudio, wordMap, words, type Scored } from './course.ts'
import { CV_PRON, PRON, shapeMates, soundMates } from './pron.ts'
import { amdoSentences, amdoWords } from './amdo.ts'

/**
 * 误区表：答错第一次时，按“选了哪个错项”给一句针对性的提示，不直接给答案，然后让人再选一次。
 * 每条提示带一个误区类别（cat），记进作答记录，以后能统计哪类错误最多。
 *
 * 类别：
 *   shape   形近字认混
 *   sound   音近字（送气/不送气、清/浊）听混
 *   vowel   漏看或看错元音符号
 *   root-*  找基字时把前加字、上加字、下加字、后加字、再后加字当成了基字
 *   word    词义 / 词形混成了另一个学过的词
 *   sent    会话句混成了另一句
 *   other   其他
 */
export type Hint = { text: string; cat: string; audio?: string[] }

const pronLabel = (l: string) => `${PRON[l][0]} ${PRON[l][1]}`
const letterByPron = new Map(LETTERS.map(([l]) => [pronLabel(l), l]))
const isLetter = (x: string) => !!PRON[x]
const shapeLike = (a: string, b: string) => !!shapeMates.get(a)?.has(b)
const soundLike = (a: string, b: string) => !!soundMates.get(a)?.has(b)

const ROOT_HINT: Record<string, [string, string]> = {
  前加字: ['root-pre', '写在最前面、不带元音，是前加字。基字在它后面。'],
  上加字: ['root-sup', '写在头顶，是上加字。基字在它下面。'],
  下加字: ['root-sub', '挂在脚下，是下加字。基字在它上面。'],
  后加字: ['root-suf', '跟在基字后面，是后加字，读得很轻。'],
  再后加字: ['root-post', '写在最后，是再后加字。'],
}

const glossOwner = new Map<string, string>([
  ...words.map((w) => [w.gloss, w.tibetan] as [string, string]),
  ...amdoWords.map((w) => [w.zh, w.tib] as [string, string]),
])
const tibGloss = new Map<string, string>([
  ...words.map((w) => [w.tibetan, w.gloss] as [string, string]),
  ...amdoWords.map((w) => [w.tib, w.zh] as [string, string]),
])
const sentByZh = new Map(amdoSentences.map((s) => [s.zh, s]))
const sentByTib = new Map(amdoSentences.map((s) => [s.tib, s]))

export function hintFor(q: Scored, chosen: string | number): Hint {
  const type = q.kc.slice(0, 1)
  const val = q.kc.slice(2)

  if (q.kind === 'findRoot') {
    const ch = q.parts[chosen as number]
    const role = q.roles?.[chosen as number]
    const h = role ? ROOT_HINT[role] : undefined
    if (h) return { cat: h[0], text: `你点的 ${ch} ${h[1]}` }
    return { cat: 'other', text: `${ch} 不是基字。先找元音符号加在哪个字上，或者哪个字上下叠着别的字。` }
  }

  if (q.kind === 'build') {
    const picks = String(chosen).split('|')
    const bad = q.slots.filter((slot, k) => picks[k] !== slot.answer).map((slot) => slot.role)
    return { cat: 'build', text: `${bad.join('、')}选得不对。` }
  }

  if (q.kind === 'spotError') {
    const k = chosen as number
    return { cat: 'spot', text: `${q.parts[k]} 标的是“${q.shown[k]}”，这个标对了。看看哪个字被标成了基字，它真的是基字吗？` }
  }

  const c = String(chosen)

  // 字母
  if (type === 'L') {
    if (q.kind === 'glyph2wylie') {
      const other = letterByPron.get(c)
      if (other && shapeLike(val, other)) return { cat: 'shape', text: `你选的是 ${other} 的读音。${other} 和这个字长得像，再看清楚笔画。` }
      if (other) return { cat: 'other', text: `你选的是 ${other} 的读音，不是这个字。` }
    }
    if (isLetter(c)) {
      if (soundLike(val, c))
        return { cat: 'sound', text: `你选的 ${c} 发音很接近，书上专门让这两个比较。注意送气和清浊，先听 ${c}，再听一遍题目。`, audio: [letterAudio(c), letterAudio(val)] }
      if (shapeLike(val, c)) return { cat: 'shape', text: `${c} 和正确答案长得像，但读音不同（${c} 读 ${PRON[c][0]}）。` }
      return { cat: 'other', text: `你选的 ${c} 读 ${PRON[c][0]}。` }
    }
  }

  // 元音
  if (type === 'V') {
    if (q.kind === 'glyph2wylie') {
      const base = q.prompt[0]
      if (PRON[base] && c === PRON[base][0]) return { cat: 'vowel', text: `${c} 是不带元音的 ${base} 的读法。注意字${val === 'ུ' ? '下' : '上'}的元音符号。` }
      const owner = Object.entries(CV_PRON).find(([cv, p]) => p[0] === c && cv[0] === base)?.[0]
      if (owner) return { cat: 'vowel', text: `你选的是 ${owner} 的读音，元音符号不一样。` }
    }
    if (isLetter(c)) return { cat: 'vowel', text: `${c} 是不带元音的字母，题目里的字带着元音符号。`, audio: [letterAudio(c)] }
    if (CV_PRON[c]) return { cat: 'vowel', text: `你选的 ${c} 读 ${CV_PRON[c][0]}，元音不一样。`, audio: [cvAudio(c[0], c[1])] }
  }

  // 全书原文
  if (q.kind === 'pickWord') {
    const g = tibGloss.get(c)
    return { cat: 'word', text: `${c}${g ? `（${g}）` : ''} 不在这句里。一个词一个词对着看。` }
  }
  if (type === 'B') return { cat: 'sent', text: '这是本章另一段的意思。抓住段里认识的词再看。' }

  // 会话句
  if (type === 'A') {
    const byZh = sentByZh.get(c)
    if (byZh) return { cat: 'sent', text: `你选的是另一句的意思：${byZh.tib}。关键词可能一样，再听整句。` }
    const byTib = sentByTib.get(c)
    if (byTib) return { cat: 'sent', text: `你选的那句意思是“${byTib.zh}”。`, audio: [byTib.audio] }
  }

  // 词
  const owner = glossOwner.get(c)
  if (owner) return { cat: 'word', text: `“${c}”是 ${owner} 的意思。` }
  const gloss = tibGloss.get(c)
  if (gloss) return { cat: 'word', text: `你选的 ${c} 意思是“${gloss}”。`, audio: wordMap.get(c) ? [wordMap.get(c)!.audio] : undefined }

  return { cat: 'other', text: '再想一想。' + (q.audio ? '可以再听一遍。' : '') }
}
