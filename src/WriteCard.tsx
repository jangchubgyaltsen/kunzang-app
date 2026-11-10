import { useEffect, useRef, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import type { SelfRated } from './course.ts'
import { play } from './audio.ts'

/**
 * 写字卡。手写比只看、只点选项更能记住新文字的字形（学新字母时，手写组学得更快，读和拼也更好）。
 * trace：标准字淡淡地垫在下面，照着描两遍，不记分。
 * 否则：听读音，凭记忆写；写完把标准字叠上来对照，自己判断写对没有。
 */
export default function WriteCard({ q, onRate }: { q: Extract<SelfRated, { kind: 'write' }>; onRate: (r: Grade | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [inked, setInked] = useState(false)
  const [shown, setShown] = useState(false)
  const [round, setRound] = useState(1)

  useEffect(() => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = r.width * dpr
    c.height = r.height * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.lineWidth = 9
    g.strokeStyle = getComputedStyle(c).color
  }, [])

  const clear = () => {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setInked(false)
  }
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const down = (e: React.PointerEvent) => {
    if (shown) return
    canvas.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    const g = canvas.current!.getContext('2d')!
    const [x, y] = pos(e)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 0.1, y)
    g.stroke()
    setInked(true)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const g = canvas.current!.getContext('2d')!
    const [x, y] = pos(e)
    g.lineTo(x, y)
    g.stroke()
  }
  const up = () => (drawing.current = false)

  const guide = q.trace || shown
  return (
    <>
      <div className="intro-card write">
        <div className="intro-label">{q.trace ? `照着描 · 第 ${round} / 2 遍` : '听读音，凭记忆写出这个字母'}</div>
        <button className="link small" onClick={() => play(q.audio)}>
          ▶ {q.trace || shown ? `${q.glyph} ${q.pron}` : '再听一遍'}
        </button>
        <div className="write-pad">
          <div className={'tib write-guide' + (guide ? '' : ' hidden') + (shown ? ' compare' : '')}>{q.glyph}</div>
          <canvas ref={canvas} className="write-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        </div>
        {shown && <p className="small muted">标准字叠在你写的上面。笔画多一点少一点没关系，主要看样子对不对。</p>}
      </div>
      {q.trace ? (
        <div className="two">
          <button onClick={clear}>擦掉</button>
          <button
            className="primary"
            disabled={!inked}
            onClick={() => {
              if (round < 2) {
                clear()
                setRound(2)
              } else onRate(null)
            }}
          >
            {round < 2 ? '再描一遍' : '描好了'}
          </button>
        </div>
      ) : shown ? (
        <div className="rate3">
          <button className="rate-again" onClick={() => onRate(Rating.Again)}>写错了</button>
          <button className="rate-hard" onClick={() => onRate(Rating.Hard)}>差不多</button>
          <button className="rate-good primary" onClick={() => onRate(Rating.Good)}>写对了</button>
        </div>
      ) : (
        <div className="two">
          <button onClick={clear}>擦掉</button>
          <button className="primary" disabled={!inked} onClick={() => setShown(true)}>
            写好了，对照
          </button>
        </div>
      )}
    </>
  )
}
