import { useEffect, useRef, useState } from 'react'
import type { Shadow } from './course.ts'
import { play, stop } from './audio.ts'

/**
 * 跟读：听整句连读，自己读一遍。能录音的话录下来，和原音前后对比着听。
 * 录音只留在内存里，离开这一页就丢掉。
 */
export default function ShadowCard({ q }: { q: Shadow }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [mine, setMine] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const mineAudio = useRef<HTMLAudioElement | null>(null)
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    play(q.line.audio)
    return () => {
      mineAudio.current?.pause()
    }
  }, [q])
  useEffect(() => () => void (mine && URL.revokeObjectURL(mine)), [mine])

  const start = async () => {
    setErr('')
    stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setMine(URL.createObjectURL(new Blob(chunks, { type: r.mimeType })))
        setRec(null)
      }
      r.start()
      setRec(r)
    } catch {
      setErr('没能打开麦克风。可以不录音，直接跟着读。')
    }
  }

  const playMine = (then?: () => void) => {
    if (!mine) return
    stop()
    mineAudio.current?.pause()
    const a = new Audio(mine)
    mineAudio.current = a
    if (then) a.onended = then
    void a.play()
  }

  // 先放原音，原音放完再放自己的
  const compare = () => {
    mineAudio.current?.pause()
    play(q.line.audio, () => playMine())
  }

  return (
    <div className="intro-card shadow">
      <div className="intro-label">跟读</div>
      <div className="shadow-words">
        {q.line.words.map((w) => (
          <span key={w.id} className="shadow-word tap" onClick={() => play(w.audio)}>
            <span className="tib">{w.tibetan}</span>
            <span className="pron">{w.yitong}</span>
          </span>
        ))}
      </div>
      <p className="small muted">先听整句，再自己大声读一遍。点单个词可以听这个词。</p>
      <div className="actions">
        <button onClick={() => play(q.line.audio)}>▶ 听整句</button>
        {canRecord && !rec && <button onClick={start}>● {mine ? '重录' : '录我读的'}</button>}
        {rec && (
          <button className="recording" onClick={() => rec.stop()}>
            ■ 停止录音
          </button>
        )}
        {mine && !rec && <button onClick={() => playMine()}>▶ 听我读的</button>}
        {mine && !rec && <button onClick={compare}>▶ 原音 → 我的</button>}
      </div>
      {err && <p className="small warn">{err}</p>}
      <p className="small muted">注音是一本通式，按规律推出来的，还没逐个核对；以音频为准。</p>
    </div>
  )
}
