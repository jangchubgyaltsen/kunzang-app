// 《安多方言会话教材》（阿坝 Flash 课件）里拆出来的内容，全部是真人录音。
// 数据由 scripts/build_amdo.py 生成：300 句会话、课本单词、拼读表、第 11–36 课课文。
import raw from './amdo.json'

export type AmdoSentence = { id: string; n: number; tib: string; zh: string; audio: string }
export type AmdoWord = { id: string; page: number; tib: string; zh: string; audio: string }
export type AmdoCell = { tib: string; audio: string; all?: boolean }
export type AmdoTable = { part: string; rows: AmdoCell[][] }
export type AmdoLesson = { n: number; topic: string; page: number; segs: { img: string; audio: string }[] }

const data = raw as {
  sentences: AmdoSentence[]
  sets: { title: string; ids: string[] }[]
  words: AmdoWord[]
  pages: { page: number; ids: string[] }[]
  tables: AmdoTable[]
  lessons: AmdoLesson[]
}

export const amdoSentences = data.sentences
export const amdoSets = data.sets
export const amdoWords = data.words
export const amdoPages = data.pages
export const amdoTables = data.tables
export const amdoLessons = data.lessons
export const sentenceById = new Map(amdoSentences.map((s) => [s.id, s]))
export const amdoWordById = new Map(amdoWords.map((w) => [w.id, w]))

/** 拼读表各部分的中文说明 */
export const TABLE_NOTES: Record<string, string> = {
  辅音: '30 个辅音字母，每行最后一格是整行连读。',
  元音: '四个元音符号的名称和例字。',
  元音与辅音拼法: '每个辅音配 ི ུ ེ ོ 四个元音。',
  五个前加字: 'ག ད བ མ འ 五个前加字的例词。',
  三个上加字: 'ར ལ ས 三个上加字。',
  四个下加字: 'ྱ ྲ ླ ྭ 四个下加字。',
  十个后加字: '十个后加字，每个辅音都配一遍。',
  两个再后加字: 'ད ས 两个再后加字。',
  叠加字: '上加字和下加字同时出现的字。',
}

// 藏文 → 录音，用于“点什么读什么”和小结里的错题
export const amdoAudioByText = new Map<string, string>()
for (const w of amdoWords) amdoAudioByText.set(w.tib.replace(/[་།\s]+$/, ''), w.audio)
for (const s of amdoSentences) amdoAudioByText.set(s.tib.replace(/[་།\s]+$/, ''), s.audio)

/** 把句子按音节切开（排词序用） */
export const sylsOf = (t: string) => t.replace(/[།\s]+/g, '་').split('་').filter(Boolean)
