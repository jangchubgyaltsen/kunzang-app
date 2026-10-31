import raw from './opening.json'

export type Syllable = {
  tibetan: string
  wylie: string
  count: number
  root: string
  prefix?: string
  superscript?: string
  subscript?: string
  vowel?: string
  suffix?: string
  postSuffix?: string
  particle?: string
  needsCheck?: boolean
  reviewStatus: string
  audio: string
  audioStatus: string
}

export type Line = { tibetan: string; wylie: string; syllables: string[]; audio: string }

export type Passage = {
  id: string
  tibetan: string
  lines: Line[]
  audio: string
  reviewStatus: string
}

export const passages = raw.passages as Passage[]
export const syllables = raw.syllables as Syllable[]
export const syllableMap = new Map(syllables.map((s) => [s.tibetan, s]))

export const passageTitles: Record<string, string> = {
  title: '书名',
  homage: '顶礼句',
  'verse-1': '顶礼偈一 · 三大传承上师',
  'verse-2': '顶礼偈二 · 遍知法王',
  'verse-3': '顶礼偈三 · 持明无畏洲',
  'verse-4': '顶礼偈四 · 大恩根本上师',
  'verse-5': '顶礼偈五 · 所说之法',
  'verse-6': '顶礼偈六 · 立誓宣说',
}

export type Unit = { n: number; title: string; examples: string[]; ready: boolean; target?: string }

export const units: Unit[] = [
  { n: 1, title: '辅音字母（一）：ཀ 到 ཏ 行', examples: ['ཀུན', 'ཆོས', 'ཉིད'], ready: false },
  { n: 2, title: '辅音字母（二）与形近字', examples: ['པ', 'མ', 'ལ'], ready: false },
  { n: 3, title: '四个元音', examples: ['མི', 'དུ', 'དེ', 'པོ'], ready: false },
  { n: 4, title: '后加字', examples: ['དང', 'ཆེན', 'ཐུགས'], ready: false },
  { n: 5, title: '再后加字 ས', examples: ['གཟིགས', 'རྣམས', 'དགོངས'], ready: false },
  { n: 6, title: '上加字 ར ལ ས', examples: ['རྗེ', 'ལྷ', 'སྣང'], ready: false },
  { n: 7, title: '下加字 ཡ ར ལ', examples: ['ཕྱག', 'འགྲོ', 'བླ'], ready: false },
  { n: 8, title: '叠加字综合', examples: ['བརྒྱུད', 'སྤྲུལ', 'རྒྱལ'], ready: false },
  { n: 9, title: '前加字', examples: ['བཙུན', 'མཐར', 'འཛིན'], ready: false },
  { n: 10, title: '找基字综合 · འི 等结尾', examples: ['བླ', 'མའི', 'སྐུའི'], ready: false },
  { n: 11, title: '原文：书名与顶礼句', examples: [], ready: true, target: 'title' },
  { n: 12, title: '原文：顶礼偈', examples: [], ready: true, target: 'verse-1' },
]
