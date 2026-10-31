import { syllables } from './content.ts'
import { LETTERS, VOWELS, cvAudio, letterAudio, letterWylie, words } from './course.ts'
import { play } from './audio.ts'

// 藏文、Wylie 或中文释义 → 音频编号，用于“点什么就读什么”
const byText = new Map<string, string>()
for (const s of syllables) byText.set(s.tibetan, s.audio).set(s.wylie, s.audio)
for (const w of words) byText.set(w.tibetan, w.audio).set(w.wylie, w.audio).set(w.gloss, w.audio)
for (const [l, wy] of LETTERS) {
  byText.set(l, letterAudio(l)).set(wy, letterAudio(l))
  for (const [mark, v] of VOWELS) byText.set(l + mark, cvAudio(l, mark)).set(wy.slice(0, -1) + v, cvAudio(l, mark))
}

export function audioFor(text: string): string | undefined {
  const t = text.trim().replace(/[་།\s]+$/, '')
  if (byText.has(t)) return byText.get(t)
  // 下加形式（ྱ ྲ ླ 等）按对应的字母读
  if (t.length === 1) {
    const base = String.fromCharCode(t.charCodeAt(0) - 0x50)
    if (letterWylie.has(base)) return letterAudio(base)
  }
}

/** 读出一段藏文（或它的转写、释义），找不到读音就不出声。 */
export function say(text: string) {
  const a = audioFor(text)
  if (a) play(a)
  return !!a
}

let ctx: AudioContext | null = null

/** 答对、答错的提示音，用 Web Audio 合成，不占读音的播放器。 */
export function chime(ok: boolean) {
  try {
    ctx ??= new AudioContext()
    const notes = ok ? [660, 990] : [220, 180]
    notes.forEach((f, k) => {
      const t = ctx!.currentTime + k * 0.09
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = ok ? 'sine' : 'triangle'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.connect(g).connect(ctx!.destination)
      o.start(t)
      o.stop(t + 0.18)
    })
  } catch {
    // 不支持 Web Audio 时静音
  }
}
