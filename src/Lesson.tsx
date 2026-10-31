import { useEffect, useMemo, useState } from 'react'
import { buildLesson, partsOf, questionFor, UNITS, type Question } from './course.ts'
import { syllableMap } from './content.ts'
import { finishUnit, recordAnswer, weakKCs } from './progress.ts'
import { play } from './audio.ts'
import './lesson.css'

type Props = { unit?: number; questions?: Question[]; title?: string; onExit: () => void }

export default function Lesson({ unit, questions, title, onExit }: Props) {
  const [queue, setQueue] = useState<Question[] | null>(questions ?? null)
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<string | number | null>(null)
  const [firstTry, setFirstTry] = useState<Map<string, boolean>>(new Map())
  const [misses, setMisses] = useState<Map<string, number>>(new Map())
  const [done, setDone] = useState<{ accuracy: number; passed: boolean } | null>(null)

  useEffect(() => {
    if (!questions && unit) weakKCs().then((w) => setQueue(buildLesson(unit, w)))
  }, [unit, questions])

  const q = queue?.[i]
  useEffect(() => {
    if (q && 'audio' in q && q.audio && q.kind === 'listen') play(q.audio)
  }, [q])

  if (!queue) return <section className="lesson">载入中…</section>
  if (done) return <Summary unit={unit} done={done} firstTry={firstTry} onExit={onExit} />
  if (!q) return null

  const isRight = (c: string | number) => c === q.answer
  const answered = chosen !== null

  const choose = async (c: string | number) => {
    if (answered) return
    setChosen(c)
    const ok = isRight(c)
    if (ok && 'audio' in q && q.audio && q.kind !== 'listen') play(q.audio)
    await recordAnswer(q.kc, ok, unit)
    if (!firstTry.has(q.kc + q.kind)) setFirstTry(new Map(firstTry).set(q.kc + q.kind, ok))
    if (!ok) {
      const m = (misses.get(q.kc) ?? 0) + 1
      setMisses(new Map(misses).set(q.kc, m))
      // 补救：同一知识点换一种题型，排到后面再练一次
      if (m <= 2) setQueue([...queue, questionFor(q.kc, m)])
    }
  }

  const next = async () => {
    setChosen(null)
    if (i + 1 < queue.length) return setI(i + 1)
    const vals = [...firstTry.values()]
    const accuracy = vals.filter(Boolean).length / Math.max(1, vals.length)
    const passed = unit ? await finishUnit(unit, accuracy) : accuracy >= 0.8
    setDone({ accuracy, passed })
  }

  const progress = Math.round((i / queue.length) * 100)
  const repeated = (misses.get(q.kc) ?? 0) >= 2

  return (
    <section className="lesson">
      <div className="lesson-top">
        <button className="link" onClick={onExit}>✕</button>
        <div className="bar"><div style={{ width: progress + '%' }} /></div>
        <span className="small muted">{title ?? `单元 ${unit}`}</span>
      </div>
      <Prompt q={q} />
      <Options q={q} chosen={chosen} onChoose={choose} />
      {answered && (
        <div className={'feedback ' + (isRight(chosen) ? 'ok' : 'bad')}>
          <div className="fb-title">{isRight(chosen) ? '答对了' : `正确答案：${labelOf(q, q.answer)}`}</div>
          <div>{q.explain}</div>
          {!isRight(chosen) && repeated && <Basics q={q} />}
          <button className="primary" onClick={next}>继续</button>
        </div>
      )}
    </section>
  )
}

function labelOf(q: Question, a: string | number) {
  return q.kind === 'findRoot' ? q.parts[a as number] : String(a)
}

function Prompt({ q }: { q: Question }) {
  switch (q.kind) {
    case 'glyph2wylie':
      return (
        <div className="prompt">
          <div className="ask">这个怎么转写？</div>
          <div className="tib huge">{q.prompt}</div>
        </div>
      )
    case 'wylie2glyph':
      return (
        <div className="prompt">
          <div className="ask">哪个字母是</div>
          <div className="latin-big">{q.prompt}</div>
        </div>
      )
    case 'findRoot':
      return (
        <div className="prompt">
          <div className="ask">这个音节的基字是哪个？</div>
          <div className="tib huge">{q.prompt}</div>
        </div>
      )
    case 'meaning':
      return (
        <div className="prompt">
          <div className="ask">这个词是什么意思？</div>
          <div className="tib huge">{q.prompt}</div>
        </div>
      )
    case 'listen':
      return (
        <div className="prompt">
          <div className="ask">听音选字</div>
          <button className="play-big" onClick={() => play(q.audio)}>▶</button>
        </div>
      )
  }
}

function Options({ q, chosen, onChoose }: { q: Question; chosen: string | number | null; onChoose: (c: string | number) => void }) {
  const items: (string | number)[] = q.kind === 'findRoot' ? q.parts.map((_, k) => k) : q.options
  const cls = (c: string | number) =>
    chosen === null ? '' : c === q.answer ? ' right' : c === chosen ? ' wrong' : ' dim'
  const tib = q.kind === 'wylie2glyph' || q.kind === 'findRoot' || q.kind === 'listen'
  return (
    <div className={'options' + (q.kind === 'findRoot' ? ' row' : '')}>
      {items.map((c) => (
        <button key={String(c)} className={'opt' + (tib ? ' tib' : q.kind === 'meaning' ? '' : ' latin') + cls(c)} onClick={() => onChoose(c)}>
          {labelOf(q, c)}
        </button>
      ))}
    </div>
  )
}

/** 同一知识点连续答错时，回到结构拆解。 */
function Basics({ q }: { q: Question }) {
  if (!q.kc.startsWith('S:')) return null
  const s = syllableMap.get(q.kc.slice(2))
  if (!s) return null
  return (
    <div className="basics">
      <div className="small muted">拆开来看：</div>
      <div className="parts">
        {partsOf(s).map((p, k) => (
          <div key={k} className={'part' + (p.role === '基字' ? ' root' : '')}>
            <div className="tib">{p.ch}</div>
            <div className="small">{p.role}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Summary({ unit, done, firstTry, onExit }: { unit?: number; done: { accuracy: number; passed: boolean }; firstTry: Map<string, boolean>; onExit: () => void }) {
  const wrong = useMemo(() => [...firstTry.entries()].filter(([, ok]) => !ok).map(([k]) => k.replace(/^[LVSW]:/, '').replace(/(glyph2wylie|wylie2glyph|findRoot|listen|meaning)$/, '')), [firstTry])
  const u = UNITS.find((x) => x.n === unit)
  return (
    <section className="lesson summary">
      <h1>{done.passed ? '本关通过' : '再练一次'}</h1>
      <div className="big-number">{Math.round(done.accuracy * 100)}%</div>
      <p className="muted">首次作答正确率{unit ? `，通过需要 80%` : ''}</p>
      {wrong.length > 0 && (
        <>
          <p>需要加强：</p>
          <div className="tib wrong-list">{[...new Set(wrong)].join('  ')}</div>
          <p className="small muted">这些已加入复习队列。</p>
        </>
      )}
      {done.passed && u && unit! < 10 && <p>下一单元已解锁。</p>}
      <button className="primary" onClick={onExit}>返回</button>
    </section>
  )
}
