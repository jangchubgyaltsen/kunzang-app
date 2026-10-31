import raw from './opening.json'
import { tokenMap } from './reading.ts'
import realAudio from './real-audio.json'

// 教材里有真人录音（安多方言会话教材）的音节、词：用真人录音，不用 TTS
export const realAudioOf = (t: string) => (realAudio as Record<string, string>)[t]

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

// 新音频：每句用整句连读；单独成词的音节（如 ལ、དང、མི）用从整句里切出来的那个词，
// 不再用孤立合成的单音节。
for (const p of passages) p.lines.forEach((l, i) => (l.audio = `op/${p.id}-${i + 1}`))
for (const s of syllables) {
  const t = tokenMap.get(s.tibetan)
  if (t) s.audio = t.audio
  const r = realAudioOf(s.tibetan)
  if (r) {
    s.audio = r
    s.audioStatus = 'human'
  }
}
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
  { n: 1, title: '5 个字母 · 后加字', examples: ['ལམ', 'ནང', 'མན་ངག'], ready: true },
  { n: 2, title: '元音 ི · 5 个字母', examples: ['མི', 'ཟབ', 'ཐར་ལམ'], ready: true },
  { n: 3, title: '元音 ུ · 3 个字母', examples: ['ཞིང', 'དམ་པ', 'ཞལ་ལུང'], ready: true },
  { n: 4, title: '元音 ེ ོ', examples: ['ཆོས', 'ཆེན་པོ', 'འོད་ཟེར'], ready: true },
  { n: 5, title: '前加字', examples: ['བདག', 'གསལ', 'ཀུན་བཟང'], ready: true },
  { n: 6, title: '上加字', examples: ['སྣང', 'སྙིང་པོ', 'རྩ་བ'], ready: true },
  { n: 7, title: '下加字', examples: ['བླ་མ', 'ཕྱག་འཚལ', 'རྒྱལ་བ'], ready: true },
  { n: 8, title: '再后加字 ས', examples: ['སངས་རྒྱས', 'རིག་འཛིན', 'ཐུགས་རྗེ'], ready: true },
  { n: 9, title: '最后 4 个字母', examples: ['ལྷ', 'ཚེ་གཅིག'], ready: true },
  { n: 10, title: '综合：开篇全部音节和词', examples: ['བླ', 'མའི', 'སྐུའི'], ready: true },
  { n: 11, title: '原文：书名与顶礼句', examples: [], ready: true, target: 'title' },
  { n: 12, title: '原文：顶礼偈', examples: [], ready: true, target: 'verse-1' },
]
