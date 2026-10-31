import { useEffect, useMemo, useState } from 'react'
import { buildLevel, kcLabel, levelById, partsOf, questionFor, unitByN, type Intro, type KC, type Question, type Scored, type Shadow } from './course.ts'
import { syllableMap } from './content.ts'
import { finishLevel, recordAnswer, seenKCs, weakKCs } from './progress.ts'
import { play } from './audio.ts'
import { say } from './sound.ts'
import ShadowCard from './Shadow.tsx'
import { cvPron } from './alphabet.ts'
import './lesson.css'

type Result = { passed: boolean; unitDone?: boolean }
type Props = {
  /** 关卡 id；不传就用 questions（复习、抽查） */
  level?: string
  questions?: Question[]
  title?: string
  onExit: () => void
  /** 自定义结算（例如抽查），返回是否通过 */
  onFinish?: (accuracy: number) => Promise<Result>
}
type Done = { accuracy: number } & Result

export default function Lesson({ level, questions, title, onExit, onFinish }: Props) {
  const lv = level ? levelById.get(level) : undefined
  const unit = lv?.unit
  const [queue, setQueue] = useState<Question[] | null>(questions ?? null)
  const [known, setKnown] = useState<Set<KC> | undefined>()
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<string | number | null>(null)
  const [firstTry, setFirstTry] = useState<Map<string, boolean>>(new Map())
  const [misses, setMisses] = useState<Map<string, number>>(new Map())
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    if (!questions && level)
      Promise.all([seenKCs(), weakKCs()]).then(([seen, weak]) => {
        const l = buildLevel(level, seen, weak)
        setQueue(l.questions)
        setKnown(l.known)
      })
  }, [level, questions])

  const q = queue?.[i]
  useEffect(() => {
    if (q && (q.kind === 'listen' || q.kind === 'intro') && q.audio) play(q.audio)
  }, [q])

  if (!queue) return <section className="lesson">载入中…</section>
  if (done) return <Summary level={level} done={done} firstTry={firstTry} onExit={onExit} />
  if (!q) return null

  const next = async () => {
    setChosen(null)
    if (i + 1 < queue.length) return setI(i + 1)
    const vals = [...firstTry.values()]
    const accuracy = vals.filter(Boolean).length / Math.max(1, vals.length)
    const r = onFinish ? await onFinish(accuracy) : level ? await finishLevel(level, accuracy) : { passed: accuracy >= 0.8 }
    setDone({ accuracy, ...r })
  }

  const progress = Math.round((i / queue.length) * 100)
  const top = (
    <div className="lesson-top">
      <button className="link" onClick={onExit}>✕</button>
      <div className="bar"><div style={{ width: progress + '%' }} /></div>
      <span className="small muted">{title ?? (lv ? `单元 ${unit} · ${lv.title}` : '')}</span>
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

  if (q.kind === 'shadow')
    return (
      <section className="lesson">
        {top}
        <ShadowCard q={q as Shadow} />
        <button className="primary" onClick={next}>跟读完了</button>
      </section>
    )

  const isRight = (c: string | number) => c === q.answer
  const answered = chosen !== null

  const choose = async (c: string | number) => {
    if (answered) return
    setChosen(c)
    const ok = isRight(c)
    // 答对读题目本身，答错读你选的那个，让耳朵也记住区别（自评题刚听过答案，不再读）
    if (q.kind === 'sayit') {
      if (!ok) play(q.audio)
    } else if (ok && q.audio) play(q.audio)
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
      {q.kind === 'order' ? (
        <OrderPieces key={i} q={q} locked={answered} onDone={choose} />
      ) : q.kind === 'sayit' ? (
        <SayIt key={i} q={q} chosen={chosen} onChoose={choose} />
      ) : (
        <Options q={q} chosen={chosen} onChoose={choose} />
      )}
      {answered && (
        <div className={'feedback ' + (isRight(chosen) ? 'ok' : 'bad')}>
          <div className="fb-title">
            {q.kind === 'sayit' ? (isRight(chosen) ? '好，记下了' : '再跟着念一遍，后面还会再练') : isRight(chosen) ? '答对了' : `正确答案：${labelOf(q, q.answer)}`}
          </div>
          <div className="explain">{q.explain}</div>
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

/** 自评题：自己先念，点开听答案，再说念对没有 */
function SayIt({ q, chosen, onChoose }: { q: Extract<Scored, { kind: 'sayit' }>; chosen: string | number | null; onChoose: (c: string) => void }) {
  const [heard, setHeard] = useState(false)
  const pron = cvPron(q.prompt)
  return (
    <div className="sayit">
      <button
        className={heard ? '' : 'primary'}
        onClick={() => {
          play(q.audio)
          setHeard(true)
        }}
      >
        {heard ? '▶ 再听一遍' : '念完了，听答案'}
      </button>
      {heard && pron && <div className="pron center">一本通注音：{pron}</div>}
      {heard && (
        <div className="options">
          {q.options.map((c) => (
            <button key={c} className={'opt' + (chosen === null ? '' : c === chosen ? (c === q.answer ? ' right' : ' wrong') : ' dim')} onClick={() => onChoose(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IntroCard({ q }: { q: Intro }) {
  const pron = q.pron ?? (q.kc.startsWith('C:') ? cvPron(q.kc.slice(2)) : undefined)
  return (
    <div className="intro-card">
      <div className="intro-label">{q.label}</div>
      <div className="tib huge tap" onClick={() => (q.audio ? play(q.audio) : say(q.big))}>{q.big}</div>
      {q.sub && <div className="latin-mid">{q.sub}</div>}
      {pron && (
        <div className="pron" title="一本通式注音，尚未逐个核对">
          {pron}
        </div>
      )}
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
    case 'sayit':
      return (
        <div className="prompt">
          <div className="ask">先自己大声念一遍</div>
          <div className="tib huge">{q.prompt}</div>
        </div>
      )
    case 'order':
      return (
        <div className="prompt">
          <div className="ask">听整句，按顺序点出词语</div>
          <button className="play-big" onClick={() => play(q.audio)}>▶</button>
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

/** 排词序：点下面的词放进句子，点句子里的词放回去，放满了自动判对错 */
function OrderPieces({ q, locked, onDone }: { q: Extract<Scored, { kind: 'order' }>; locked: boolean; onDone: (joined: string) => void }) {
  const [placed, setPlaced] = useState<number[]>([])
  const put = (k: number) => {
    if (locked) return
    say(q.pieces[k])
    const p = [...placed, k]
    setPlaced(p)
    if (p.length === q.pieces.length) onDone(p.map((x) => q.pieces[x]).join('་'))
  }
  return (
    <div className="order">
      <div className={'order-line tib' + (locked ? (placed.map((x) => q.pieces[x]).join('་') === q.answer ? ' right' : ' wrong') : '')}>
        {placed.map((k) => (
          <button key={k} className="piece" onClick={() => !locked && setPlaced(placed.filter((x) => x !== k))}>
            {q.pieces[k]}
          </button>
        ))}
      </div>
      <div className="order-bank tib">
        {q.pieces.map((p, k) => (
          <button key={k} className={'piece' + (placed.includes(k) ? ' used' : '')} disabled={placed.includes(k)} onClick={() => put(k)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function Options({ q, chosen, onChoose }: { q: Exclude<Scored, { kind: 'order' | 'sayit' }>; chosen: string | number | null; onChoose: (c: string | number) => void }) {
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
  if (q.kind === 'order') return null
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

function Summary({ level, done, firstTry, onExit }: { level?: string; done: Done; firstTry: Map<string, boolean>; onExit: () => void }) {
  const wrong = useMemo(
    () => [...new Set([...firstTry.entries()].filter(([, ok]) => !ok).map(([k]) => kcLabel(k.replace(/(glyph2wylie|wylie2glyph|findRoot|listen|meaning2word|meaning|order|sayit)$/, ''))))],
    [firstTry],
  )
  const lv = level ? levelById.get(level) : undefined
  const u = lv ? unitByN.get(lv.unit) : undefined
  return (
    <section className="lesson summary">
      <h1>{done.unitDone ? '本单元通过' : done.passed ? (lv ? '本关通过' : '完成') : '再练一次'}</h1>
      <div className="big-number">{Math.round(done.accuracy * 100)}%</div>
      <p className="muted">首次作答正确率，通过需要 80%</p>
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
      {done.unitDone && u && <p>明天会有第一次抽查，之后第 3、7、14、30 天各抽查一次，帮你把这个单元记牢。</p>}
      {lv && done.passed && !done.unitDone && <p>下一关已解锁。</p>}
      <button className="primary" onClick={onExit}>返回</button>
    </section>
  )
}
