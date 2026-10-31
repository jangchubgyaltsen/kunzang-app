import { useEffect, useMemo, useRef, useState } from 'react'
import { play } from './audio.ts'
import {
  FAST_MS, FLUENT_AT, HOOK_PAIRS, LETTER_NOTE, PRON, ROWS, SHAPE_PAIRS, VOWEL_INFO,
  buildDaily, cvAudioOf, isFluent, isLookalike, loadStats, optionsFor, record, saveStats,
  type DrillItem, type Stat, type Step,
} from './alphabet.ts'
import { letterAudio } from './course.ts'
import './alphabet.css'

/** “字母”页：字母表、元音、形近字，以及看字念音的练习入口 */
export function AlphabetView({ onStart }: { onStart: () => void }) {
  const [stats, setStats] = useState<Record<string, Stat>>({})
  const [hide, setHide] = useState(false)
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    loadStats().then(setStats)
  }, [])

  const fluent = ROWS.flat().filter((l) => isFluent(stats['L:' + l])).length
  const tapLetter = (l: string) => {
    play(letterAudio(l))
    setNote(LETTER_NOTE[l] ? `${l}：${LETTER_NOTE[l]}` : null)
    if (hide) setShown(new Set(shown).add(l))
  }
  return (
    <section className="alpha">
      <h1>字母表</h1>
      <p className="muted small">
        30 个字母，四个一行。按行出声念，点字听读音。一眼认出（3 秒内连续答对 {FLUENT_AT} 次）的字会亮金色，现在 {fluent} / 30。
      </p>
      <div className="toggles">
        <button className={'pill' + (hide ? ' on' : '')} aria-pressed={hide} onClick={() => { setHide(!hide); setShown(new Set()) }}>
          遮住读音自测
        </button>
      </div>
      <div className="abc">
        {ROWS.map((row, r) => (
          <div className="abc-row" key={r}>
            {row.map((l) => (
              <button key={l} className={'abc-cell' + (isFluent(stats['L:' + l]) ? ' fluent' : '') + (LETTER_NOTE[l] ? ' noted' : '')} onClick={() => tapLetter(l)}>
                <span className="tib">{l}</span>
                <span className="abc-pron">{hide && !shown.has(l) ? '?' : PRON[l][0]}</span>
                <span className="abc-hz">{hide && !shown.has(l) ? ' ' : PRON[l][1]}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {note && <p className="alpha-note small">{note}</p>}
      <div className="alpha-tip small">
        <b>前四行是同一个模子：</b>不送气 · 送气 · 浊音 · 鼻音。第五行前三个也一样（ཙ ཚ ཛ），第四个是 ཝ。
        书上 ཀ 和 ག、ཏ 和 ད 注音相同，但读音不同，要靠音频听出来。带小点的字是和直觉不一样的地方，点一下看说明。
      </div>

      <h2>每日认字</h2>
      <p className="muted small">每天第一次打开 App 会自动弹出一组：没记牢的字多考几次，新字先看一遍再考，熟的字隔几天复习一下。看到字马上在心里念出来，再点读音。</p>
      <div className="actions col alpha-go">
        <button className="primary" onClick={onStart}>再练一组</button>
      </div>

      <h2>形近字</h2>
      <p className="muted small">《一本通》练习里成对比较的字。点字听音，注意看哪一笔不一样。</p>
      <div className="pairs">
        {SHAPE_PAIRS.map(([a, b]) => (
          <Pair key={a + b} a={a} b={b} />
        ))}
      </div>
      <p className="muted small">ཅ ཆ ཇ 右上角加一个小钩，就是 ཙ ཚ ཛ，读音也一一对应：</p>
      <div className="pairs">
        {HOOK_PAIRS.map(([a, b]) => (
          <Pair key={a + b} a={a} b={b} />
        ))}
      </div>

      <h2>元音</h2>
      <p className="muted small">
        四个元音符号，三个写在字母上面，一个写在下面。安多话里元音和字母拼起来读音变化很大（ཀི 和 ཀུ 书上都注 ge），所以先记形状和位置，读音跟着音频学。
      </p>
      <div className="vowels">
        {VOWEL_INFO.map((v) => (
          <div key={v.mark} className="vowel">
            <div className="tib vowel-mark">◌{v.mark}</div>
            <div className="small">
              写在<b>{v.pos}面</b> · <span className="tib">{v.name}</span>
            </div>
            <div className="vowel-ex">
              {v.examples.map(([s, p]) => (
                <button key={s} onClick={() => play(cvAudioOf(s))}>
                  <span className="tib">{s}</span>
                  <span className="small muted">{p}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">注音和汉字近音照《安多藏语一本通》第一章抄录，读音是安多音 TTS，没有逐个人工核对。</p>
    </section>
  )
}

function Pair({ a, b }: { a: string; b: string }) {
  return (
    <div className="pair">
      {[a, b].map((l) => (
        <button key={l} onClick={() => play(letterAudio(l))}>
          <span className="tib">{l}</span>
          <span className="small muted">{PRON[l][0]}</span>
        </button>
      ))}
    </div>
  )
}

const LETTER_POOL = ROWS.flat()

type Log = { it: DrillItem; ok: boolean; ms: number }[]

/** 每日认字：新字先认识，再看字选读音；答错的过 3 题再来一次 */
export function Drill({ onExit }: { onExit: () => void }) {
  const [stats, setStats] = useState<Record<string, Stat> | null>(null)
  const [queue, setQueue] = useState<Step[]>([])
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<DrillItem | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [ms, setMs] = useState(0)
  const [log, setLog] = useState<Log>([])
  const shownAt = useRef(0)

  useEffect(() => {
    loadStats().then((s) => {
      setStats(s)
      setQueue(buildDaily(s))
    })
  }, [])
  const step = queue[i]
  const it = step?.it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const opts = useMemo(() => (it && !step.intro ? optionsFor(it, []) : []), [i, it?.key])
  useEffect(() => {
    shownAt.current = performance.now()
    if (step?.intro) play(step.it.audio)
  }, [i, step])

  if (!stats || !queue.length) return <section className="lesson">载入中…</section>
  if (i >= queue.length) return <DrillSummary log={log} stats={stats} onExit={onExit} />

  const go = () => {
    setPicked(null)
    setRevealed(false)
    setI((k) => k + 1)
  }
  const answer = async (choice: DrillItem) => {
    const ok = choice.key === it.key
    const t = Math.round(performance.now() - shownAt.current)
    setMs(t)
    setPicked(choice)
    setRevealed(true)
    play(it.audio)
    const s = { ...stats }
    record(s, it.key, ok, t)
    setStats(s)
    await saveStats(s)
    setLog((l) => [...l, { it, ok, ms: t }])
    if (!ok) setQueue((q) => [...q.slice(0, i + 4), { it }, ...q.slice(i + 4)])
    if (ok && t <= FAST_MS) setTimeout(go, 700)
  }

  const ok = revealed ? picked?.key === it.key : null
  const progress = Math.round((i / queue.length) * 100)
  const top = (
    <div className="lesson-top">
      <button className="link" onClick={onExit}>✕</button>
      <div className="bar"><div style={{ width: progress + '%' }} /></div>
      <span className="small muted">每日认字</span>
    </div>
  )

  if (step.intro)
    return (
      <section className="lesson drill">
        {top}
        <div className="intro-label center">新字</div>
        <div className="drill-card tap" onClick={() => play(it.audio)}>
          <div className="tib huge">{it.tib}</div>
          <div className="drill-ans">
            <span className="drill-pron">{it.pron}</span>
            {it.hanzi && <span className="drill-hz">{it.hanzi}</span>}
            {LETTER_NOTE[it.tib] && <span className="small muted">{LETTER_NOTE[it.tib]}</span>}
          </div>
        </div>
        <p className="small muted center">点字再听一遍。记住它的样子，等一下就考。</p>
        <button className="primary" onClick={go}>记住了</button>
      </section>
    )

  return (
    <section className="lesson drill">
      {top}
      <div className={'drill-card' + (ok === true ? ' ok' : ok === false ? ' bad' : '')}>
        <div className="tib huge">{it.tib}</div>
        {revealed && (
          <div className="drill-ans">
            <span className="drill-pron">{it.pron}</span>
            {it.hanzi && <span className="drill-hz">{it.hanzi}</span>}
            <span className="small muted">{(ms / 1000).toFixed(1)} 秒</span>
          </div>
        )}
      </div>
      {!revealed && <p className="small muted center">先在心里念出来，再点读音</p>}
      <div className="options">
        {opts.map((o) => {
          const cls = !revealed ? '' : o.key === it.key ? ' right' : o.key === picked?.key ? ' wrong' : ' dim'
          return (
            <button key={o.key} className={'opt drill-opt' + cls} disabled={revealed} onClick={() => answer(o)}>
              <span>{o.pron}{o.hanzi ? ' ' + o.hanzi : ''}</span>
              {opts.some((x) => x !== o && x.pron === o.pron) && <span className="small muted">转写 {o.wylie}</span>}
            </button>
          )
        })}
      </div>
      {ok === false && picked && (
        <div className="feedback bad">
          <div className="fb-title">{isLookalike(it.base, picked.base) ? '这两个字长得像，对比一下' : '再看一眼'}</div>
          <div className="pair big">
            {[it, picked].map((x) => (
              <button key={x.key} onClick={() => play(x.audio)}>
                <span className="tib">{x.tib}</span>
                <span>{x.pron}</span>
                <span className="small muted">{x === it ? '这一题' : '你选的'}</span>
              </button>
            ))}
          </div>
          <div className="small">过几题还会再考这个字。</div>
        </div>
      )}
      {revealed && (ok === false || ms > FAST_MS) && (
        <>
          {ok === true && <p className="small muted center">答对了，但用了 {(ms / 1000).toFixed(1)} 秒。3 秒内答对才算一眼认出。</p>}
          <button className="primary" onClick={go}>继续</button>
        </>
      )}
    </section>
  )
}

function DrillSummary({ log, stats, onExit }: { log: Log; stats: Record<string, Stat>; onExit: () => void }) {
  const right = log.filter((x) => x.ok)
  const fast = right.filter((x) => x.ms <= FAST_MS)
  const avg = right.length ? right.reduce((n, x) => n + x.ms, 0) / right.length / 1000 : 0
  const slow = [...new Map(log.filter((x) => !x.ok || x.ms > FAST_MS).map((x) => [x.it.key, x.it])).values()]
  const fluent = LETTER_POOL.filter((l) => isFluent(stats['L:' + l])).length
  return (
    <section className="lesson summary">
      <h1>每日认字</h1>
      <div className="big-number">
        {fluent}
        <span className="small muted"> / 30 个字母一眼认出</span>
      </div>
      <p className="muted">
        这一组 {log.length} 题，3 秒内答对 {fast.length} 题，答对的平均 {avg.toFixed(1)} 秒。明天打开 App 会自动出下一组。
      </p>
      {slow.length > 0 && (
        <>
          <p>还要多看几眼：</p>
          <div className="missed">
            {slow.map((m) => (
              <button key={m.key} onClick={() => play(m.audio)}>
                <span className="tib">{m.tib}</span>
                <span className="small muted">{m.pron}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button className="primary" onClick={onExit}>好</button>
    </section>
  )
}
