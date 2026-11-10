/**
 * 原文高频词（知识点 F:词）。词表 public/book/vocab.json 由 scripts/build_vocab.py 生成，
 * 用到时由 vocab.ts 下载、配上释义后放进这里。出题（course.ts）只从这里同步读，不在这里下载，免得循环引用。
 */
export type BookWordT = [tibetan: string, start: number, end: number]
export type FWord = {
  w: string
  /** 全书出现次数 */
  n: number
  /** 词频排名，从 0 开始 */
  rank: number
  /** 词下面那一行的短释义 */
  short: string
  /** 完整释义 */
  gloss: string
  uncertain: boolean
  /** 例句：整句的句子 id、词和时间、这个词在第几个 */
  ex?: { s: string; t: BookWordT[]; i: number }
}
export type TopSyl = { s: string; n: number; clip: [string, number, number] }

export const fwords: FWord[] = []
export const fwordMap = new Map<string, FWord>()
export const topSyls: TopSyl[] = []
export const vocabTotal = { n: 0 }
/** 每章：总词次，和高频词（按排名）在这一章出现的次数 */
export type ChapterCount = { id: string; total: number; c: number[] }
export const chapterCounts: ChapterCount[] = []

export function setVocab(list: FWord[], syls: TopSyl[], total: number, chs: ChapterCount[] = []) {
  chapterCounts.splice(0, chapterCounts.length, ...chs)
  fwords.splice(0, fwords.length, ...list)
  fwordMap.clear()
  for (const f of list) fwordMap.set(f.w, f)
  topSyls.splice(0, topSyls.length, ...syls)
  vocabTotal.n = total
}

/** 词的读音：从例句整句音频里切出来的一段 */
export const fwordAudio = (f: FWord) => {
  if (!f.ex) return undefined
  const [, a, b] = f.ex.t[f.ex.i]
  return `book/${f.ex.s}#${a}-${b}`
}
export const fwordSentAudio = (f: FWord) => (f.ex ? `book/${f.ex.s}` : undefined)
