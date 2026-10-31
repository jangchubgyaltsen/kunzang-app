import raw from './opening-words.json'

/** 开篇原文按词切开：每个词有切分版音频（从整句连读里切出来）和一本通式注音。 */
export type Token = { id: string; tibetan: string; yitong: string; audio: string }
export type ReadLine = { id: string; passage: string; index: number; audio: string; words: Token[] }

export const readLines = raw.lines as ReadLine[]
const sylYitong = raw.sylYitong as Record<string, string>

/** 每个词第一次出现时的读音（同一个词在不同句子里音频略有不同，词卡统一用第一次的） */
export const tokenMap = new Map<string, Token>()
for (const l of readLines) for (const w of l.words) if (!tokenMap.has(w.tibetan)) tokenMap.set(w.tibetan, w)

export const linesOf = (passage: string) => readLines.filter((l) => l.passage === passage)
export const lineById = new Map(readLines.map((l) => [l.id, l]))

/** 一本通式注音（按对照表规律推出来，尚未逐个核对）。整词有就用整词的，否则按音节拼。 */
export function yitongOf(tibetan: string): string | undefined {
  const t = tibetan.replace(/[་།\s]+$/, '')
  const tok = tokenMap.get(t)
  if (tok) return tok.yitong
  const parts = t.split('་').map((s) => sylYitong[s])
  return parts.every(Boolean) ? parts.join(' ') : undefined
}
