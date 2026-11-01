import { useEffect, useMemo, useRef, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import { TALK_BASE, buildLevel, kcLabel, levelById, partsOf, questionFor, unitByN, type Intro, type KC, type Question, type Scored, type Shadow } from './course.ts'
import { syllableMap } from './content.ts'
import { finishLevel, recordAnswer, seenKCs, speedMedians, speedRating, weakKCs } from './progress.ts'
import { hintFor, type Hint } from './hints.ts'
import { play, playSeq } from './audio.ts'
import { say } from './sound.ts'
import ShadowCard from './Shadow.tsx'
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
  /** 做完最后一题时调用（中途 ✕ 退出不调用） */
  onComplete?: () => void
  /** 结算页按钮的字，默认“返回” */
  exitLabel?: string
}
type Done = { accuracy: number } & Result

export default function Lesson({ level, questions, title, onExit, onFinish, onComplete, exitLabel }: Props) {
  const lv = level ? levelById.get(level) : undefined
  const unit = lv?.unit
  const [queue, setQueue] = useState<Question[] | null>(questions ?? null)
  const [known, setKnown] = useState<Set<KC> | undefined>()
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<string | number | null>(null)
  const [firstTry, setFirstTry] = useState<Map<string, boolean>>(new Map())
  const [misses, setMisses] = useState<Map<string, number>>(new Map())
  const [done, setDone] = useState<Done | null>(null)
  /** 第一次答错后划掉的选项和给的提示；再选一次 */
  const [struck, setStruck] = useState<(string | number)[]>([])
  const [hint, setHint] = useState<Hint | null>(null)
  const [guessed, setGuessed] = useState(false)
  const medians = useRef<Map<string, number>>(new Map())
  const shownAt = useRef(0)
  /** 一次就答对的那题先不写进记录，等点“继续”（中途可以改成“是猜的”） */
  const pending = useRef<{ kc: KC; ok: boolean; rating: Grade; src?: string; kind: string; ms: number } | null>(null)
  const flush = async () => {
    const p = pending.current
    pending.current = null
    if (p) await recordAnswer(p.kc, p.ok, unit, p.src, p.rating, { kind: p.kind, ms: p.ms })
  }
  useEffect(() => {
    speedMedians().then((m) => (medians.current = m))
    // 中途退出也把最后一题记上
    return () => void flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    shownAt.current = performance.now()
    if (q && (q.kind === 'listen' || q.kind === 'intro') && q.audio) play(q.audio)
  }, [q])

  if (!queue) return <section className="lesson">载入中…</section>
  if (done) return <Summary level={level} done={done} firstTry={firstTry} onExit={onExit} exitLabel={exitLabel} />
  if (!q) return null

  const next = async () => {
    await flush()
    setChosen(null)
    setStruck([])
    setHint(null)
    setGuessed(false)
    if (i + 1 < queue.length) return setI(i + 1)
    const vals = [...firstTry.values()]
    const accuracy = vals.filter(Boolean).length / Math.max(1, vals.length)
    const r = onFinish ? await onFinish(accuracy) : level ? await finishLevel(level, accuracy) : { passed: accuracy >= 0.8 }
    setDone({ accuracy, ...r })
    onComplete?.()
  }

  const progress = Math.round((i / queue.length) * 100)
  const top = (
    <div className="lesson-top">
      <button className="link" onClick={onExit}>✕</button>
      <div className="bar"><div style={{ width: progress + '%' }} /></div>
      <span className="small muted">{title ?? (lv ? `${unit && unit >= TALK_BASE ? unitByN.get(unit)!.title : '单元 ' + unit} · ${lv.title}` : '')}</span>
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

  const miss = () => {
    const m = (misses.get(q.kc) ?? 0) + 1
    setMisses(new Map(misses).set(q.kc, m))
    // 补救：同一知识点换一种题型，排到后面再练一次
    if (m <= 2) setQueue([...queue, questionFor(q.kc, m, known)])
  }

  const choose = async (c: string | number) => {
    if (answered || struck.includes(c)) return
    const ok = isRight(c)
    const ms = Math.round(performance.now() - shownAt.current)
    const optionCount = q.kind === 'findRoot' ? q.parts.length : q.kind === 'order' ? 0 : q.options.length
    // 第一次答错：给一句针对这个错项的提示，划掉它，再选一次（剩的选项不到两个、排序题就直接给答案）
    if (!ok && !struck.length && optionCount - 1 >= 2) {
      const h = hintFor(q, c)
      setStruck([c])
      setHint(h)
      setFirstTry(new Map(firstTry).set(q.kc + q.kind, false))
      say(labelOf(q, c))
      if (h.audio?.length) setTimeout(() => playSeq(h.audio!), 700)
      return
    }
    setChosen(c)
    // 答对读题目本身，答错读你选的那个，让耳朵也记住区别
    if (ok && q.kind === 'glyph2wylie' && q.seq) playSeq(q.seq)
    else if (ok && q.audio) play(q.audio)
    else say(labelOf(q, c))
    if (!firstTry.has(q.kc + q.kind)) setFirstTry(new Map(firstTry).set(q.kc + q.kind, ok))
    // 记下第一个选错的选项和它的误区类别，以后统计哪类错误最多
    const first = struck.length ? { pick: String(labelOf(q, struck[0])), miss: hint?.cat } : ok ? {} : { pick: String(labelOf(q, c)), miss: hintFor(q, c).cat }
    const extra = { kind: q.kind, ms, ...first }
    if (struck.length) {
      // 提示后才答对：算没答对，但比完全不会好一点，记 Hard
      await recordAnswer(q.kc, false, unit, 'hint', ok ? Rating.Hard : Rating.Again, extra)
      miss()
    } else if (ok) {
      pending.current = { kc: q.kc, ok: true, rating: speedRating(ms, medians.current.get(q.kind)), kind: q.kind, ms }
    } else {
      await recordAnswer(q.kc, false, unit, undefined, Rating.Again, extra)
      miss()
    }
  }

  const markGuess = () => {
    if (!pending.current) return
    // 猜对的不算会：记 Hard，作答记录算没答对，过不久再考
    pending.current = { ...pending.current, ok: false, rating: Rating.Hard, src: 'guess' }
    setGuessed(true)
  }

  const repeated = (misses.get(q.kc) ?? 0) >= 2

  return (
    <section className="lesson">
      {top}
      <Prompt q={q} />
      {q.kind === 'order' ? <OrderPieces key={i} q={q} locked={answered} onDone={choose} /> : <Options q={q} chosen={chosen} struck={struck} onChoose={choose} />}
      {hint && !answered && (
        <div className="feedback hint">
          <div className="fb-title">再选一次</div>
          <div className="explain">{withTib(hint.text)}</div>
        </div>
      )}
      {answered && (
        <div className={'feedback ' + (isRight(chosen) ? 'ok' : 'bad')}>
          <div className="fb-title">{isRight(chosen) ? (struck.length ? '对了，看了提示才选对' : '答对了') : `正确答案：${labelOf(q, q.answer)}`}</div>
          <div className="explain">{q.explain}</div>
          {!isRight(chosen) && repeated && <Basics q={q} />}
          {isRight(chosen) && !struck.length && (
            <button className="link small" disabled={guessed} onClick={markGuess}>
              {guessed ? '记下了：这题过不久再考' : '其实是猜的'}
            </button>
          )}
          <button className="primary" onClick={next}>继续</button>
        </div>
      )}
    </section>
  )
}

/** 提示里夹着的藏文用藏文字体显示，不然在中文里太小 */
function withTib(t: string) {
  return t.split(/([\u0F00-\u0FFF]+)/).map((x, k) => (k % 2 ? <span key={k} className="tib">{x}</span> : x))
}

// 会话整句：字号小一点，选项一行一个
const long = (q: Scored) => q.kc.startsWith('A:')

function labelOf(q: Scored, a: string | number) {
  return q.kind === 'findRoot' ? q.parts[a as number] : String(a)
}

function IntroCard({ q }: { q: Intro }) {
  return (
    <div className="intro-card">
      <div className="intro-label">{q.label}</div>
      <div className={'tib tap ' + (q.kc.startsWith('A:') ? 'big center' : 'huge')} onClick={() => (q.audio ? play(q.audio) : say(q.big))}>{q.big}</div>
      {q.sub && <div className="latin-mid">{q.sub}</div>}
      {q.pron && (
        <div className="pron" title="一本通式注音，尚未逐个核对">
          {q.pron}
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
          <div className="ask">{q.ask ?? '这个怎么转写？'}</div>
          <div className={'tib tap ' + (q.seq ? 'big center' : 'huge')} onClick={() => (q.seq ? playSeq(q.seq) : q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
        </div>
      )
    case 'wylie2glyph':
      return (
        <div className="prompt">
          <div className="ask">{q.ask ?? '哪个字母是'}</div>
          <div className="latin-big tap" onClick={() => (q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
        </div>
      )
    case 'findRoot':
      return (
        <div className="prompt">
          <div className="ask">这个音节的基字是哪个？</div>
          <div className="tib huge tap" onClick={() => (q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
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
          <div className="ask">{q.ask ?? (q.zh ? '听这句话，选出意思' : q.kc.startsWith('A:') ? '听这句话，选出藏文' : '听音选字')}</div>
          <button className="play-big" onClick={() => play(q.audio)}>▶</button>
        </div>
      )
    case 'meaning':
      return (
        <div className="prompt">
          <div className="ask">{q.kc.startsWith('A:') ? '这句话是什么意思？' : '这个词是什么意思？'}</div>
          <div className={'tib tap ' + (long(q) ? 'big center' : 'huge')} onClick={() => (q.audio ? play(q.audio) : say(q.prompt))}>{q.prompt}</div>
        </div>
      )
    case 'meaning2word':
      return (
        <div className="prompt">
          <div className="ask">{q.kc.startsWith('A:') ? '哪一句的意思是' : '哪个词的意思是'}</div>
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

function Options({ q, chosen, struck, onChoose }: { q: Exclude<Scored, { kind: 'order' }>; chosen: string | number | null; struck: (string | number)[]; onChoose: (c: string | number) => void }) {
  const items: (string | number)[] = q.kind === 'findRoot' ? q.parts.map((_, k) => k) : q.options
  const cls = (c: string | number) =>
    chosen === null ? (struck.includes(c) ? ' struck' : '') : c === q.answer ? ' right' : c === chosen || struck.includes(c) ? ' wrong' : ' dim'
  const style = (q.kind === 'meaning' || (q.kind === 'listen' && q.zh) ? ' gloss' : q.kind === 'glyph2wylie' ? ' latin' : ' tib') + (long(q) ? ' long' : '')
  return (
    <div className={'options' + (q.kind === 'findRoot' ? ' row' : '') + (long(q) ? ' one' : '')}>
      {items.map((c) => (
        <button key={String(c)} className={'opt' + style + cls(c)} disabled={chosen === null && struck.includes(c)} onClick={() => onChoose(c)}>
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

function Summary({ level, done, firstTry, onExit, exitLabel = '返回' }: { level?: string; done: Done; firstTry: Map<string, boolean>; onExit: () => void; exitLabel?: string }) {
  const wrong = useMemo(
    () => [...new Set([...firstTry.entries()].filter(([, ok]) => !ok).map(([k]) => kcLabel(k.replace(/(glyph2wylie|wylie2glyph|findRoot|listen|meaning2word|meaning|order)$/, ''))))],
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
      <button className="primary" onClick={onExit}>{exitLabel}</button>
    </section>
  )
}
