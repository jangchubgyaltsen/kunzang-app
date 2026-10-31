import { useEffect, useMemo, useState } from 'react'
import { buildLesson, kcLabel, partsOf, questionFor, UNITS, type Intro, type KC, type Question, type Scored } from './course.ts'
import { syllableMap } from './content.ts'
import { finishUnit, recordAnswer, seenKCs, weakKCs } from './progress.ts'
import { play } from './audio.ts'
import { say } from './sound.ts'
import './lesson.css'

type Props = { unit?: number; questions?: Question[]; title?: string; onExit: () => void }
type Done = { accuracy: number; passed: boolean; remaining: number }

export default function Lesson({ unit, questions, title, onExit }: Props) {
  const [queue, setQueue] = useState<Question[] | null>(questions ?? null)
  const [known, setKnown] = useState<Set<KC> | undefined>()
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<string | number | null>(null)
  const [firstTry, setFirstTry] = useState<Map<string, boolean>>(new Map())
  const [misses, setMisses] = useState<Map<string, number>>(new Map())
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    if (!questions && unit)
      Promise.all([seenKCs(), weakKCs()]).then(([seen, weak]) => {
        const l = buildLesson(unit, seen, weak)
        setQueue(l.questions)
        setKnown(l.known)
      })
  }, [unit, questions])

  const q = queue?.[i]
  useEffect(() => {
    if (q && (q.kind === 'listen' || q.kind === 'intro') && q.audio) play(q.audio)
  }, [q])

  if (!queue) return <section className="lesson">载入中…</section>
  if (done) return <Summary unit={unit} done={done} firstTry={firstTry} onExit={onExit} />
  if (!q) return null

  const next = async () => {
    setChosen(null)
    if (i + 1 < queue.length) return setI(i + 1)
    const vals = [...firstTry.values()]
    const accuracy = vals.filter(Boolean).length / Math.max(1, vals.length)
    const r = unit ? await finishUnit(unit, accuracy) : { passed: accuracy >= 0.8, remaining: 0 }
    setDone({ accuracy, ...r })
  }

  const progress = Math.round((i / queue.length) * 100)
  const top = (
    <div className="lesson-top">
      <button className="link" onClick={onExit}>✕</button>
      <div className="bar"><div style={{ width: progress + '%' }} /></div>
      <span className="small muted">{title ?? `单元 ${unit}`}</span>
    </div>
  )

  if (q.kind === 'intro')
    return (
      <section className="lesson">
        {top}
        <IntroCard q={q} />
        <button className="primary" onClick={next}>知道了</button>
      </section>
    )

  const isRight = (c: string | number) => c === q.answer
  const answered = chosen !== null

  const choose = async (c: string | number) => {
    if (answered) return
    setChosen(c)
    const ok = isRight(c)
    // 答对读题目本身，答错读你选的那个，让耳朵也记住区别
    if (ok && q.audio) play(q.audio)
    else say(labelOf(q, c))
    await recordAnswer(q.kc, ok, unit)
    if (!firstTry.has(q.kc + q.kind)) setFirstTry(new Map(firstTry).set(q.kc + q.kind, ok))
    if (!ok) {
      const m = (misses.get(q.kc) ?? 0) + 1
      setMisses(new Map(misses).set(q.kc, m))
      // 补救：同一知识点换一种题型，排到后面再练一次
      if (m <= 2) setQueue([...queue, questionFor(q.kc, m, known)])
    }
  }

  const repeated = (misses.get(q.kc) ?? 0) >= 2

  return (
    <section className="lesson">
      {top}
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

function labelOf(q: Scored, a: string | number) {
  return q.kind === 'findRoot' ? q.parts[a as number] : String(a)
}

function IntroCard({ q }: { q: Intro }) {
  return (
    <div className="intro-card">
      <div className="intro-label">{q.label}</div>
      <div className="tib huge tap" onClick={() => (q.audio ? play(q.audio) : say(q.big))}>{q.big}</div>
      {q.sub && <div className="latin-mid">{q.sub}</div>}
      {q.audio && <button className="intro-play" onClick={() => play(q.audio!)}>▶ 听一遍</button>}
      {q.parts && (
        <div className="parts">
          {q.parts.map((p, k) => (
            <div key={k} className={'part tap' + (p.role === '基字' ? ' root' : '')} onClick={() => say(p.ch)}>
              <div className="tib">{p.ch}</div>
              <div className="small">{p.role}</div>
            </div>
          ))}
        </div>
      )}
      {q.note && <p className={'intro-note' + (q.kc.startsWith('W:') ? ' gloss-big' : '')}>{q.note}</p>}
    </div>
  )
}

function Prompt({ q }: { q: Scored }) {
  switch (q.kind) {
    case 'glyph2wylie':
      return (
        <div className="prompt">
          <div className="ask">这个怎么转写？</div>
          <div className="tib huge tap" onClick={() => (q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
        </div>
      )
    case 'wylie2glyph':
      return (
        <div className="prompt">
          <div className="ask">哪个字母是</div>
          <div className="latin-big tap" onClick={() => say(q.prompt)}>{q.prompt}</div>
        </div>
      )
    case 'findRoot':
      return (
        <div className="prompt">
          <div className="ask">这个音节的基字是哪个？</div>
          <div className="tib huge tap" onClick={() => (q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
        </div>
      )
    case 'listen':
      return (
        <div className="prompt">
          <div className="ask">听音选字</div>
          <button className="play-big" onClick={() => play(q.audio)}>▶</button>
        </div>
      )
    case 'meaning':
      return (
        <div className="prompt">
          <div className="ask">这个词是什么意思？</div>
          <div className="tib huge tap" onClick={() => (q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
        </div>
      )
    case 'meaning2word':
      return (
        <div className="prompt">
          <div className="ask">哪个词的意思是</div>
          <div className="zh-big">{q.prompt}</div>
        </div>
      )
  }
}

function Options({ q, chosen, onChoose }: { q: Scored; chosen: string | number | null; onChoose: (c: string | number) => void }) {
  const items: (string | number)[] = q.kind === 'findRoot' ? q.parts.map((_, k) => k) : q.options
  const cls = (c: string | number) =>
    chosen === null ? '' : c === q.answer ? ' right' : c === chosen ? ' wrong' : ' dim'
  const style = q.kind === 'meaning' ? ' gloss' : q.kind === 'glyph2wylie' ? ' latin' : ' tib'
  return (
    <div className={'options' + (q.kind === 'findRoot' ? ' row' : '')}>
      {items.map((c) => (
        <button key={String(c)} className={'opt' + style + cls(c)} onClick={() => onChoose(c)}>
          {labelOf(q, c)}
        </button>
      ))}
    </div>
  )
}

/** 同一知识点连续答错时，回到结构拆解。 */
function Basics({ q }: { q: Scored }) {
  const t = q.kind === 'findRoot' ? q.prompt : q.kc.startsWith('S:') ? q.kc.slice(2) : null
  const s = t ? syllableMap.get(t) : undefined
  if (q.kind !== 'findRoot' && !s) return null
  const parts = s ? partsOf(s) : (q as Extract<Scored, { kind: 'findRoot' }>).parts.map((ch, k) => ({ ch, role: k === q.answer ? '基字' : '' }))
  return (
    <div className="basics">
      <div className="small muted">拆开来看：</div>
      <div className="parts">
        {parts.map((p, k) => (
          <div key={k} className={'part tap' + (p.role === '基字' ? ' root' : '')} onClick={() => say(p.ch)}>
            <div className="tib">{p.ch}</div>
            <div className="small">{p.role}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Summary({ unit, done, firstTry, onExit }: { unit?: number; done: Done; firstTry: Map<string, boolean>; onExit: () => void }) {
  const wrong = useMemo(
    () => [...new Set([...firstTry.entries()].filter(([, ok]) => !ok).map(([k]) => kcLabel(k.replace(/(glyph2wylie|wylie2glyph|findRoot|listen|meaning2word|meaning)$/, ''))))],
    [firstTry],
  )
  const u = UNITS.find((x) => x.n === unit)
  const goodEnough = done.accuracy >= 0.8
  return (
    <section className="lesson summary">
      <h1>{done.passed ? '本单元通过' : goodEnough ? '这节课完成' : '再练一次'}</h1>
      <div className="big-number">{Math.round(done.accuracy * 100)}%</div>
      <p className="muted">首次作答正确率{unit ? '，通过需要 80%' : ''}</p>
      {unit && done.remaining > 0 && <p>本单元还有 {done.remaining} 个新内容，再上一节课继续学。</p>}
      {wrong.length > 0 && (
        <>
          <p>需要加强：</p>
          <div className="tib wrong-list">
            {wrong.map((w) => (
              <span key={w} className="tap" onClick={() => say(w)}>
                {w}{'  '}
              </span>
            ))}
          </div>
          <p className="small muted">这些已加入复习队列。</p>
        </>
      )}
      {done.passed && u && unit! < 10 && <p>下一单元已解锁。</p>}
      <button className="primary" onClick={onExit}>返回</button>
    </section>
  )
}
