import { useEffect, useMemo, useRef, useState } from 'react'
import { play, playSeq } from './audio.ts'
import {
  FAST_MS, FLUENT_AT, HOOK_PAIRS, LETTER_NOTE, PRON, ROWS, SHAPE_PAIRS, VOWEL_INFO,
  buildRound, cvAudioOf, isFluent, isLookalike, loadStats, optionsFor, record, saveStats, scopeItems,
  type DrillItem, type DrillMode, type Scope, type Stat,
} from './alphabet.ts'
import { letterAudio } from './course.ts'
import './alphabet.css'

export type DrillSpec = { scope: Scope; mode: DrillMode }

/** “字母”页：字母表、元音、形近字，以及看字念音的练习入口 */
export function AlphabetView({ onStart }: { onStart: (d: DrillSpec) => void }) {
  const [stats, setStats] = useState<Record<string, Stat>>({})
  const [hide, setHide] = useState(false)
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6, 7]))
  const [mode, setMode] = useState<DrillMode>(() => (localStorage.getItem('drill-mode') as DrillMode) ?? 'choose')
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    loadStats().then(setStats)
  }, [])
  useEffect(() => {
    localStorage.setItem('drill-mode', mode)
  }, [mode])

  const fluent = ROWS.flat().filter((l) => isFluent(stats['L:' + l])).length
  const tapLetter = (l: string) => {
    play(letterAudio(l))
    setNote(LETTER_NOTE[l] ? `${l}：${LETTER_NOTE[l]}` : null)
    if (hide) setShown(new Set(shown).add(l))
  }
  const toggleRow = (r: number) => {
    const s = new Set(rows)
    if (s.has(r)) s.delete(r)
    else s.add(r)
    setRows(s)
  }
  const start = (scope: Scope) => onStart({ scope, mode })

  return (
    <section className="alpha">
      <h1>字母表</h1>
      <p className="muted small">
        30 个字母，四个一行。每天按行出声念一遍：点 ▶ 连读一整行，点字听单个。一眼认出（3 秒内连续答对 {FLUENT_AT} 次）的字会亮金色，现在 {fluent} / 30。
      </p>
      <div className="toggles">
        <button className={'pill' + (hide ? ' on' : '')} aria-pressed={hide} onClick={() => { setHide(!hide); setShown(new Set()) }}>
          遮住读音自测
        </button>
        <button className="pill play-all" onClick={() => playSeq(ROWS.flat().map(letterAudio))}>
          ▶ 全部
        </button>
      </div>
      <div className="abc">
        {ROWS.map((row, r) => (
          <div className="abc-row" key={r}>
            <button className="play" onClick={() => playSeq(row.map(letterAudio))} aria-label={`连读第 ${r + 1} 行`}>
              ▶
            </button>
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

      <h2>看字念音</h2>
      <p className="muted small">目标是看到字马上反应出读音。答完才放读音，所以要先在心里（或者出声）念出来。</p>
      <div className="chips">
        <button className={mode === 'choose' ? 'on' : ''} onClick={() => setMode('choose')}>
          选读音
        </button>
        <button className={mode === 'say' ? 'on' : ''} onClick={() => setMode('say')}>
          自己念，再对答案
        </button>
      </div>
      <div className="small muted row-label">练哪几行</div>
      <div className="row-pick">
        {ROWS.map((row, r) => (
          <button key={r} className={'tib' + (rows.has(r) ? ' on' : '')} onClick={() => toggleRow(r)} aria-pressed={rows.has(r)}>
            {row.join(' ')}
          </button>
        ))}
      </div>
      <div className="actions col alpha-go">
        <button className="primary" disabled={rows.size === 0} onClick={() => start({ kind: 'rows', rows: [...rows].sort() })}>
          开始 · {rows.size === 8 ? '全部 30 个字母' : `选中的 ${[...rows].reduce((n, r) => n + ROWS[r].length, 0)} 个字母`}
        </button>
        <button onClick={() => start({ kind: 'shape' })}>形近字专练</button>
        <button onClick={() => start({ kind: 'cv' })}>字母 + 元音拼读（书上的例子）</button>
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

const SCOPE_TITLE = (s: Scope) =>
  s.kind === 'cv' ? '拼读例子' : s.kind === 'shape' ? '形近字' : s.rows.length === 8 ? '30 个字母' : `第 ${s.rows.map((r) => r + 1).join('、')} 行`

/** 看字念音：一轮 20 题，答错的字过几题再出一次 */
export function Drill({ spec, onExit }: { spec: DrillSpec; onExit: () => void }) {
  const [stats, setStats] = useState<Record<string, Stat> | null>(null)
  const [queue, setQueue] = useState<DrillItem[]>([])
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<DrillItem | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [ms, setMs] = useState(0)
  const [log, setLog] = useState<{ it: DrillItem; ok: boolean; ms: number }[]>([])
  const shownAt = useRef(0)
  const pool = useRef(scopeItems(spec.scope))

  useEffect(() => {
    loadStats().then((s) => {
      setStats(s)
      setQueue(buildRound(pool.current, s))
    })
  }, [])
  const it = queue[i]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const opts = useMemo(() => (it ? optionsFor(it, pool.current) : []), [i, it?.key])
  useEffect(() => {
    shownAt.current = performance.now()
  }, [i, it?.key])

  if (!stats || !queue.length) return <section className="lesson">载入中…</section>

  if (i >= queue.length) return <DrillSummary spec={spec} log={log} stats={stats} onAgain={() => { setQueue(buildRound(pool.current, stats)); setI(0); setLog([]) }} onExit={onExit} />

  const answer = async (ok: boolean, choice?: DrillItem) => {
    const t = Math.round(performance.now() - shownAt.current)
    setMs(t)
    setPicked(choice ?? null)
    setRevealed(true)
    play(it.audio)
    await save(ok, t)
    if (ok && t <= FAST_MS) setTimeout(go, 700)
  }
  const save = async (ok: boolean, t: number) => {
    const s = { ...stats }
    record(s, it.key, ok, t)
    setStats(s)
    await saveStats(s)
    setLog((l) => [...l, { it, ok, ms: t }])
    // 答错的过 3 题再来一次
    if (!ok) setQueue((q) => [...q.slice(0, i + 4), it, ...q.slice(i + 4)])
  }
  const go = () => {
    setPicked(null)
    setRevealed(false)
    setI((k) => k + 1)
  }

  const ok = !revealed || spec.mode === 'say' ? null : picked?.key === it.key
  const progress = Math.round((i / queue.length) * 100)
  return (
    <section className="lesson drill">
      <div className="lesson-top">
        <button className="link" onClick={onExit}>✕</button>
        <div className="bar"><div style={{ width: progress + '%' }} /></div>
        <span className="small muted">看字念音 · {SCOPE_TITLE(spec.scope)}</span>
      </div>
      <div className={'drill-card' + (ok === true ? ' ok' : ok === false ? ' bad' : '')}>
        <div className="tib huge">{it.tib}</div>
        {revealed && (
          <div className="drill-ans">
            <span className="drill-pron">{it.pron}</span>
            {it.hanzi && <span className="drill-hz">{it.hanzi}</span>}
            <span className="small muted">转写 {it.wylie} · {(ms / 1000).toFixed(1)} 秒</span>
          </div>
        )}
      </div>

      {spec.mode === 'choose' && (
        <div className="options">
          {opts.map((o) => {
            const cls = !revealed ? '' : o.key === it.key ? ' right' : o.key === picked?.key ? ' wrong' : ' dim'
            return (
              <button key={o.key} className={'opt drill-opt' + cls} disabled={revealed} onClick={() => answer(o.key === it.key, o)}>
                <span>{o.pron}{o.hanzi ? ' ' + o.hanzi : ''}</span>
                <span className="small muted">转写 {o.wylie}</span>
              </button>
            )
          })}
        </div>
      )}
      {spec.mode === 'say' && !revealed && (
        <button className="primary" onClick={reveal}>
          念出来了，看答案
        </button>
      )}
      {spec.mode === 'say' && revealed && (
        <div className="options">
          <button className="opt wrong" onClick={() => answerSay(false)}>没念对</button>
          <button className="opt right" onClick={() => answerSay(true)}>念对了</button>
        </div>
      )}

      {revealed && ok === false && picked && (
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
        </div>
      )}
      {revealed && spec.mode === 'choose' && (ok === false || ms > FAST_MS) && (
        <>
          {ok === true && <p className="small muted center">答对了，但用了 {(ms / 1000).toFixed(1)} 秒。3 秒内答对才算一眼认出。</p>}
          <button className="primary" onClick={go}>继续</button>
        </>
      )}
    </section>
  )

  // “自己念”模式：计时到点“看答案”为止，不算后面自评的时间
  function reveal() {
    setMs(Math.round(performance.now() - shownAt.current))
    setRevealed(true)
    play(it.audio)
  }
  async function answerSay(right: boolean) {
    await save(right, ms)
    go()
  }
}

function DrillSummary({ spec, log, stats, onAgain, onExit }: { spec: DrillSpec; log: { it: DrillItem; ok: boolean; ms: number }[]; stats: Record<string, Stat>; onAgain: () => void; onExit: () => void }) {
  const right = log.filter((x) => x.ok)
  const fast = right.filter((x) => x.ms <= FAST_MS)
  const avg = right.length ? right.reduce((n, x) => n + x.ms, 0) / right.length / 1000 : 0
  const slow = [...new Map(log.filter((x) => !x.ok || x.ms > FAST_MS).map((x) => [x.it.key, x.it])).values()]
  const items = scopeItems(spec.scope)
  const fluent = items.filter((x) => isFluent(stats[x.key])).length
  return (
    <section className="lesson summary">
      <h1>看字念音 · {SCOPE_TITLE(spec.scope)}</h1>
      <div className="big-number">
        {fast.length}
        <span className="small muted"> / {log.length} 题 3 秒内答对</span>
      </div>
      <p className="muted">
        答对 {right.length} 题，平均 {avg.toFixed(1)} 秒。这一组一眼认出的：{fluent} / {items.length}
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
      <div className="actions">
        <button className="primary" onClick={onAgain}>再来一轮</button>
        <button onClick={onExit}>返回字母表</button>
      </div>
    </section>
  )
}

