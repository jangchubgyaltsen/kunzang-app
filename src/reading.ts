import raw from './opening-words.json'
import { amdoPinyin, amdoPinyinOfWord } from './amdoPron.ts'

/** 开篇原文按词切开：每个词有切分版音频（从整句连读里切出来）和安多拼音注音。 */
export type Token = { id: string; tibetan: string; yitong: string; audio: string }
export type ReadLine = { id: string; passage: string; index: number; audio: string; words: Token[] }

export const readLines = raw.lines as ReadLine[]
// 开篇的注音原来是按《一本通》手写的，现在统一换成 amdoPron.ts 推出来的安多拼音
for (const l of readLines) for (const w of l.words) w.yitong = amdoPinyinOfWord(w.tibetan) ?? w.yitong

/** 每个词第一次出现时的读音（同一个词在不同句子里音频略有不同，词卡统一用第一次的） */
export const tokenMap = new Map<string, Token>()
for (const l of readLines) for (const w of l.words) if (!tokenMap.has(w.tibetan)) tokenMap.set(w.tibetan, w)

export const linesOf = (passage: string) => readLines.filter((l) => l.passage === passage)
export const lineById = new Map(readLines.map((l) => [l.id, l]))

/** 安多拼音注音（amdoPron.ts，按规律推出来，尚未逐个核对） */
export function yitongOf(tibetan: string): string | undefined {
  const t = tibetan.replace(/[་།\s]+$/, '')
  const tok = tokenMap.get(t)
  if (tok) return tok.yitong
  const parts = t.split('་').filter(Boolean).map((s) => amdoPinyin(s))
  return parts.length && parts.every(Boolean) ? parts.join(' ') : amdoPinyinOfWord(t)
}

/** 一句（音节用 ་ 隔开，可能带 །）的注音，推不出来的音节写 ? */
export const yitongOfLine = (tibetan: string) =>
  tibetan
    .split(/[་།\s]+/)
    .filter(Boolean)
    .map((s) => yitongOf(s) ?? '?')
    .join(' ')
