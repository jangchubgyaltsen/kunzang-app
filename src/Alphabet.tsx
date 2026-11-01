import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { play } from './audio.ts'
import {
  ALL_CARDS, CV_MARKS, CV_PRON, CV_SOURCE, EARLY_DAYS, EARLY_NEW, FAST_MS, FLUENT_DAYS, HOOK_PAIRS, LETTER_NOTE, PRON, ROWS, SHAPE_PAIRS, SOUND_PAIRS, VOWEL_INFO,
  buildDaily, cardCounts, modeFor, letterUnlocked, loadSession, saveSession, splitOf, cvAudioOf, isFluent, isLookalike, isSoundPair, loadStats, markDailyDone, optionsFor, record,
  type DrillItem, type Stat, type Step,
} from './alphabet.ts'
import { letterAudio } from './course.ts'
import { db } from './db.ts'
import './alphabet.css'

const LETTER_POOL = ROWS.flat()
/** 安多会话教材拼读表“元音”一节的真人录音，每个元音一段 */
const VOWEL_AUDIO: Record<string, string> = { 'ི': 'amdo/t/040', 'ུ': 'amdo/t/041', 'ེ': 'amdo/t/042', 'ོ': 'amdo/t/043' }

/** “字母”页：字母表、元音、形近字，以及看字念音的练习入口 */
export function AlphabetView({ onStart }: { onStart: (all?: boolean) => void }) {
  const [stats, setStats] = useState<Record<string, Stat>>({})
  const [hide, setHide] = useState(false)
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    loadStats().then(setStats)
  }, [])

  const fluent = ROWS.flat().filter((l) => isFluent(stats['L:' + l])).length
  const counts = cardCounts(stats)
  const tapLetter = (l: string) => {
    play(letterAudio(l))
    setNote(LETTER_NOTE[l] ? `${l}：${LETTER_NOTE[l]}` : null)
    if (hide) setShown(new Set(shown).add(l))
  }
  return (
    <section className="alpha">
      <h1>字母表</h1>
      <p className="muted small">
        30 个字母，四个一行。按行出声念，点字听读音。记牢了的字（字卡和路径里都算，复习间隔到了 {FLUENT_DAYS} 天以上）会亮金色，现在 {fluent} / 30。
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

      <h2>每日字卡</h2>
      <p className="muted small">
        30 个字母、4 个元音，加上 120 个字母 + 元音组合，一共 {ALL_CARDS.length} 张卡。循序渐进：先只考 30 个字母和 4 个元音；
        一个字母和 4 个元音都有点熟了（至少答过两次、最近没答错），才开始考这个字母的 4 个组合。每天第一次打开 App 先考这个：到期的卡看字选注音、听音选字轮着考，
        选项里放的是书上成对比较的形近字和发音相近的字；答错的当天再考，答得越快越稳，隔的天数越长。每天一组 15 张：到期的优先，剩下的按顺序带新卡（每天至少 5 张新卡）。拼读路径也按这个顺序学字母，两边共用一份记录。
      </p>
      <p className="small">
        现在能考 <b>{counts.open}</b> / {ALL_CARDS.length} 张 · 今天到期 <b>{counts.due}</b> 张 · 能考的里还没见过 <b>{counts.freshOpen}</b> 张 · 已经记牢 <b>{counts.fluent}</b> 张
      </p>
      <div className="actions col alpha-go">
        <button className="primary" onClick={() => onStart()}>开始今天的字卡</button>
        <button onClick={() => onStart(true)}>能考的 {counts.open} 张全部过一遍</button>
      </div>

      <h2>比较发音</h2>
      <p className="muted small">《一本通》练习：比较下列成对字母的发音。书上很多对注音一样，读音不一样，点字听真人录音。</p>
      <div className="pairs">
        {SOUND_PAIRS.map(([a, b]) => (
          <Pair key={a + b} a={a} b={b} />
        ))}
      </div>

      <h2>形近字</h2>
      <p className="muted small">《一本通》练习：比较下列成对字母的形体差异。点字听音，注意看哪一笔不一样。</p>
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
        四个元音符号，三个写在字母上面，一个写在下面。安多话里元音和字母拼起来读音变化很大（ཀི 和 ཀུ 书上都注 ge），所以先记形状和位置，读音跟着音频学。点元音符号听教材里单独念这个元音的真人录音。
      </p>
      <div className="vowels">
        {VOWEL_INFO.map((v) => (
          <div key={v.mark} className="vowel">
            <button className="tib vowel-mark" onClick={() => play(VOWEL_AUDIO[v.mark])} aria-label="听这个元音">◌{v.mark} <span className="small muted">▶</span></button>
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
      <h2>字母 + 元音组合表</h2>
      <p className="muted small">
        第一列是 30 个字母本身，后面四列是每个字母配四个元音的 120 个组合。灰色的行还没开始考：这个字母和 4 个元音都有点熟了才考它的组合；记牢了的亮金色。点格子听真人录音。黑字是《一本通》上的注音，红字是书上例词里出现过的，
        灰色斜体是按书上的规律推出来的，以录音为准。
      </p>
      <div className="cv-table">
        <div className="cv-row cv-head">
          {['ཨ', ...CV_MARKS].map((m, k) => (
            <div key={m} className="tib">{k === 0 ? '—' : '◌' + m}</div>
          ))}
        </div>
        {LETTER_POOL.map((l) => (
          <div key={l} className={'cv-row' + (letterUnlocked(stats, l) || CV_MARKS.some((m) => stats['CV:' + l + m]?.seen) ? '' : ' locked')}>
            {[l, ...CV_MARKS.map((m) => l + m)].map((x, k) => (
              <button
                key={x}
                className={'cv-cell' + (isFluent(stats[(k > 0 ? 'CV:' : 'L:') + x]) ? ' fluent' : '') + (k === 0 ? ' base' : '')}
                onClick={() => play(k === 0 ? letterAudio(l) : cvAudioOf(x))}
              >
                <span className="tib">{x}</span>
                <span className={'cv-pron' + (k > 0 ? ' src' + CV_PRON[x][1] : '')} title={k > 0 ? CV_SOURCE[CV_PRON[x][1]] : undefined}>
                  {k === 0 ? PRON[l][0] : CV_PRON[x][0]}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="muted small">注音和汉字近音照《安多藏语一本通》第一章；读音是安多会话教材里的真人录音。</p>
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


type Log = { it: DrillItem; ok: boolean; ms: number }[]

/** 每日字卡：新卡先看一遍，再看字选注音、听音选字；答错的过 3 题再来一次 */
export function Drill({ onExit, onComplete, all = false, footer }: { onExit: () => void; onComplete?: () => void; all?: boolean; footer?: ReactNode }) {
  const [stats, setStats] = useState<Record<string, Stat> | null>(null)
  const [queue, setQueue] = useState<Step[]>([])
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<DrillItem | null>(null)
  const [ms, setMs] = useState(0)
  // 第一次选错的那个：先给提示、划掉，再选一次
  const [struck, setStruck] = useState<DrillItem | null>(null)
  const [log, setLog] = useState<Log>([])
  const shownAt = useRef(0)

  useEffect(() => {
    ;(async () => {
      const s = await loadStats()
      // 今天这一组做到一半退出过：接着做，不重新开始
      const saved = all ? undefined : await loadSession()
      setStats(s)
      if (saved) {
        setQueue(saved.steps)
        setI(saved.i)
        setLog(saved.log.map((x) => ({ it: saved.steps.find((st) => st.it.key === x.key)?.it ?? saved.steps[0].it, ok: x.ok, ms: x.ms })))
      } else {
        // 刚开始的几天每天新卡少一点
        const days = await db.checkins.count()
        setQueue(buildDaily(s, all, days < EARLY_DAYS ? EARLY_NEW : Infinity))
      }
    })()
  }, [all])
  // 每走一步记下进度
  useEffect(() => {
    if (!all && queue.length) void saveSession(queue, i, log.map((x) => ({ key: x.it.key, ok: x.ok, ms: x.ms })))
  }, [all, queue, i, log])
  const step = queue[i]
  const it = step?.it
  const done = !!stats && queue.length > 0 && i >= queue.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // 已经见过的卡：以前答过的，加上今天这一组里已经看过介绍的
  const known = useMemo(() => {
    const k = new Set(Object.keys(stats ?? {}).filter((x) => stats![x].seen))
    queue.slice(0, i).forEach((x) => x.intro && k.add(x.it.key))
    return k
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, queue.length, !!stats])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const opts = useMemo(() => (it && !step.intro ? optionsFor(it, step.mode, all ? undefined : known) : []), [i, it?.key])
  useEffect(() => {
    shownAt.current = performance.now()
    if (step && (step.intro || step.mode === 'hear')) play(step.it.audio)
  }, [i, step])
  useEffect(() => {
    if (!done) return
    onComplete?.()
    // 每天的字卡做完就算签到
    if (!all) void markDailyDone(log.filter((x) => x.ok).length, log.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, all])

  if (!stats || !queue.length) return <section className="lesson">载入中…</section>
  if (done) return <DrillSummary log={log} stats={stats} onExit={onExit} footer={footer} />

  const go = () => {
    setPicked(null)
    setStruck(null)
    setI((k) => k + 1)
  }
  const answer = async (choice: DrillItem) => {
    const ok = choice.key === it.key
    const t = Math.round(performance.now() - shownAt.current)
    // 第一次选错：不揭晓，给一句提示、划掉这个，再选一次（和关卡里一样）；只剩两个选项时直接揭晓
    // 答错的过 3 题再来一次，换一种考法；同一张卡今天最多补练两次
    const requeue = () =>
      setQueue((q) =>
        q.filter((x) => x.retry && x.it.key === it.key).length >= 2
          ? q
          : [...q.slice(0, i + 4), { it, mode: modeFor(it, step.mode === 'read' ? 'hear' : 'read'), retry: true }, ...q.slice(i + 4)],
      )
    if (!ok && !struck && opts.length >= 3) {
      setStruck(choice)
      play(choice.audio)
      requeue()
      return
    }
    setMs(t)
    setPicked(choice)
    if (step.mode === 'read' || !ok) play(it.audio)
    const st = await record(it.key, ok, t, !!struck)
    setStats((s) => ({ ...s, [it.key]: st }))
    setLog((l) => [...l, { it, ok: ok && !struck, ms: t }])
    // 看了提示的已经在上面排过补练了
    if (!ok && !struck) requeue()
    if (ok && !struck && t <= FAST_MS) setTimeout(go, 800)
  }

  const revealed = picked !== null
  const ok = revealed ? picked.key === it.key : null
  // 进度只算今天这一组本来的题；答错加的补练不算，免得越答越长
  const total = queue.filter((x) => !x.retry).length
  const passed = queue.slice(0, i).filter((x) => !x.retry).length
  const progress = Math.round((passed / total) * 100)
  const top = (
    <div className="lesson-top">
      <button className="link" onClick={onExit}>✕</button>
      <div className="bar"><div style={{ width: progress + '%' }} /></div>
      <span className="small muted">{step.retry ? '补练' : `${passed + 1} / ${total}`}</span>
    </div>
  )
  const ans = (x: DrillItem) => (
    <div className="drill-ans">
      <span className={'drill-pron' + (x.key.startsWith('V:') ? ' tib' : '') + (x.src === 2 ? ' guessed' : '')}>{x.pron}</span>
      {x.hanzi && <span className={'drill-hz' + (x.key.startsWith('V:') ? ' tib' : '')}>{x.hanzi}</span>}
      {x.src !== undefined && <span className="small muted">{CV_SOURCE[x.src]}</span>}
      {LETTER_NOTE[x.tib] && <span className="small muted">{LETTER_NOTE[x.tib]}</span>}
      {x.note && <span className="small muted">{x.note}</span>}
      <Split it={x} />
    </div>
  )

  if (step.intro)
    return (
      <section className="lesson drill">
        {top}
        <div className="intro-label center">新卡</div>
        <div className="drill-card tap" onClick={() => play(it.audio)}>
          <div className={"tib huge" + (it.key.startsWith("V:") ? " vowel-big" : "")}>{it.tib}</div>
          {ans(it)}
        </div>
        <p className="small muted center">点字再听一遍。记住它的样子和读音，等一下就考。</p>
        <button className="primary" onClick={go}>记住了</button>
      </section>
    )

  const hear = step.mode === 'hear'
  const whyOf = (x: DrillItem) =>
    isSoundPair(it.base, x.base) && it.base !== x.base
      ? '书上专门比较这两个字的发音，再听一遍'
      : isLookalike(it.base, x.base)
        ? '这两个字长得像，对比一下'
        : it.base === x.base
          ? '同一个字母，元音不一样'
          : '再看一眼'
  const why = picked && !ok ? whyOf(picked) : ''
  return (
    <section className="lesson drill">
      {top}
      <div className="intro-label center">{hear ? '听音选字' : it.key.startsWith('V:') ? '看符号选名称' : '看字选读音'}</div>
      {hear ? (
        <div className={'drill-card tap' + (ok === true ? ' ok' : ok === false ? ' bad' : '')} onClick={() => play(it.audio)}>
          {revealed ? <div className={"tib huge" + (it.key.startsWith("V:") ? " vowel-big" : "")}>{it.tib}</div> : <button className="play-big">▶</button>}
          {revealed && ans(it)}
        </div>
      ) : (
        <div className={'drill-card' + (revealed ? ' tap' : '') + (ok === true ? ' ok' : ok === false ? ' bad' : '')} onClick={() => revealed && play(it.audio)}>
          <div className={"tib huge" + (it.key.startsWith("V:") ? " vowel-big" : "")}>{it.tib}</div>
          {revealed && ans(it)}
        </div>
      )}
      {!revealed && <p className="small muted center">{hear ? '听到的是哪个字？点上面可以再听' : '先在心里念出来，再点读音'}</p>}
      {revealed && <p className="small muted center">{(ms / 1000).toFixed(1)} 秒</p>}
      <div className="options">
        {opts.map((o) => {
          const cls = !revealed ? '' : o.key === it.key ? ' right' : o.key === picked?.key ? ' wrong' : ' dim'
          return (
            <button key={o.key} className={'opt drill-opt' + cls + (hear ? ' tib-opt' : '') + (struck?.key === o.key && !revealed ? ' struck' : '')} disabled={revealed || struck?.key === o.key} onClick={() => answer(o)}>
              {hear ? <span className="tib">{o.tib}</span> : <span className={o.key.startsWith('V:') ? 'tib' : ''}>{o.pron}{o.hanzi ? <> <span>{o.hanzi}</span></> : ''}</span>}
            </button>
          )
        })}
      </div>
      {struck && !revealed && (
        <div className="feedback hint">
          <div className="fb-title">
            不是 <span className="tib">{struck.tib}</span>（{struck.pron}）。{whyOf(struck).replace('对比一下', '再看看').replace('再听一遍', '再听一遍题目')}，再选一次。
          </div>
        </div>
      )}
      {ok === false && picked && (
        <div className="feedback bad">
          <div className="fb-title">{why}</div>
          <div className="pair big">
            {[it, picked].map((x) => (
              <button key={x.key} onClick={() => play(x.audio)}>
                <span className="tib">{x.tib}</span>
                <span>{x.pron}</span>
                <span className="small muted">{x === it ? '这一题' : '你选的'}</span>
              </button>
            ))}
          </div>
          {splitOf(picked) && (
            <div className="small split-row">
              你选的拆开读：<Split it={picked} />
            </div>
          )}
          <div className="small">过几题还会再考这张卡。</div>
        </div>
      )}
      {revealed && (ok === false || ms > FAST_MS || struck) && (
        <>
          {ok === true && struck && <p className="small muted center">看了提示才选对，过几题再考一次。</p>}
          {ok === true && !struck && <p className="small muted center">答对了，但用了 {(ms / 1000).toFixed(1)} 秒。3 秒内答对才算一眼认出。</p>}
          <button className="primary sticky-go" onClick={go}>继续</button>
        </>
      )}
    </section>
  )
}

/** 组合拆开读：ཀ ga + ◌ི i · གི་གུ → ge */
function Split({ it }: { it: DrillItem }) {
  const sp = splitOf(it)
  if (!sp) return null
  return (
    <span className="split">
      {sp.parts.map(([t, p], k) => (
        <span key={t}>
          {k > 0 && ' + '}
          <span className="tib">{t}</span> <span className="muted">{p}</span>
        </span>
      ))}
      {' → '}<b>{sp.result}</b>
    </span>
  )
}

function DrillSummary({ log, stats, onExit, footer }: { log: Log; stats: Record<string, Stat>; onExit: () => void; footer?: ReactNode }) {
  const right = log.filter((x) => x.ok)
  const fast = right.filter((x) => x.ms <= FAST_MS)
  const avg = right.length ? right.reduce((n, x) => n + x.ms, 0) / right.length / 1000 : 0
  const slow = [...new Map(log.filter((x) => !x.ok || x.ms > FAST_MS).map((x) => [x.it.key, x.it])).values()]
  const fluent = ALL_CARDS.filter((x) => isFluent(stats[x.key])).length
  const letters = LETTER_POOL.filter((l) => isFluent(stats['L:' + l])).length
  const { fresh } = cardCounts(stats)
  return (
    <section className="lesson summary">
      <h1>每日字卡</h1>
      <div className="big-number">
        {fluent}
        <span className="small muted"> / {ALL_CARDS.length} 张记牢了</span>
      </div>
      <p className="muted">其中字母 {letters} / 30 个；还有 {fresh} 张新卡没见过。</p>
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
      {footer ?? <button className="primary" onClick={onExit}>好</button>}
    </section>
  )
}
