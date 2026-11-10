import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './db.ts'
import Lesson from './Lesson.tsx'
import TodayReading from './TodayReading.tsx'
import { introFor, type KC, type Question } from './course.ts'
import { todayStats } from './progress.ts'
import { loadVocab } from './vocab.ts'
import { markDailyDone } from './alphabet.ts'
import { play } from './audio.ts'
import { dayKey } from './daily.ts'
import { Icon, StateDot } from './icons.tsx'
import { buildCards, buildTalk, getProgress, lineOfToday, loadPlan, markStep, stepInfo, type DayPlan, type StepInfo, type StepKey } from './practice.ts'

type Running = { key: StepKey; kind: 'questions'; questions: Question[]; title: string; known?: Set<KC> } | { key: StepKey; kind: 'reading' }

const TITLES: Record<StepKey, string> = { cards: '今天 · 卡片', talk: '今天 · 安多会话', read: '今天 · 原文' }

/**
 * 今天：卡片 → 安多会话 → 原文，一段接一段做。
 * 每段做完，小结页底部告诉你下一段是什么：可以“继续”，也可以“先到这里”。
 * 中途点 ✕ 回首页，下次从退出的地方接着做（每段的题当天排好就不变）。全部做完显示今天的总结。
 */
export default function Practice({ onExit, onRead }: { onExit: () => void; onRead: () => void }) {
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [run, setRun] = useState<Running | null>(null)
  const [next, setNext] = useState<{ key: StepKey; info: StepInfo } | null>(null)
  const [finished, setFinished] = useState(false)
  const completed = useRef(false)

  const nextStep = useCallback(async (skip?: StepKey) => {
    const p = await loadPlan()
    return { plan: p, key: p.steps.find((k) => !p.done.includes(k) && k !== skip) }
  }, [])

  const start = useCallback(async (key: StepKey) => {
    completed.current = false
    setNext(null)
    if (key === 'read') {
      const pr = await getProgress()
      if (pr.readOn) return setRun({ key, kind: 'reading' })
      const line = lineOfToday()
      return setRun({ key, kind: 'questions', title: TITLES.read, questions: [{ kind: 'shadow', kc: 'X:' + line.id, line }] })
    }
    // 高频词卡出题要用词表（接着做时，答错补练也要现出题）
    await loadVocab().catch(() => {})
    // 当天第一次进这一段时排好题；中途退出再进来，Lesson 按 resumeKey 接着做
    const saved = (await db.settings.get('lesson-resume:' + key))?.value as { day: string } | undefined
    if (saved?.day === new Date().toLocaleDateString('sv')) return setRun({ key, kind: 'questions', questions: [], title: TITLES[key] })
    const built = key === 'cards' ? await buildCards() : await buildTalk()
    setRun({ key, kind: 'questions', ...built, title: TITLES[key] })
  }, [])

  const begin = useCallback(async () => {
    const { plan: p, key } = await nextStep()
    setPlan(p)
    if (key) await start(key)
    else setFinished(true)
  }, [nextStep, start])

  useEffect(() => {
    void begin()
  }, [begin])

  // 一段刚做完：卡片做完算签到；先算好下一段，小结页底部显示
  const onComplete = async () => {
    completed.current = true
    const r = run!
    if (r.key === 'cards') {
      const st = await todayStats()
      await markDailyDone(st.correct, st.answered)
    }
    const { key } = await nextStep(r.key)
    setNext(key ? { key, info: await stepInfo(key) } : null)
  }

  /** 这一段做完了。go：接着做下一段；否则回首页 */
  const finishStep = async (go: boolean) => {
    const r = run!
    if (!completed.current) return onExit() // 中途退出：回首页，下次接着做
    const p = await markStep(r.key)
    setPlan(p)
    if (!go) return onExit()
    setRun(null)
    const { key } = await nextStep()
    if (key) await start(key)
    else setFinished(true)
  }

  const footer = run && plan && (
    <NextStep
      sealed={run.key === 'cards'}
      next={next}
      index={plan.steps.indexOf(next?.key ?? 'cards') + 1}
      total={plan.steps.length}
      onGo={() => finishStep(true)}
      onStop={() => finishStep(false)}
    />
  )

  if (run?.kind === 'reading') return <TodayReading onExit={() => finishStep(false)} onComplete={() => void onComplete()} footer={footer} />
  if (run?.kind === 'questions')
    return (
      <Lesson
        key={run.key}
        questions={run.questions}
        title={run.title}
        onFinish={async () => ({ passed: true })}
        onExit={() => finishStep(false)}
        onComplete={() => void onComplete()}
        resumeKey={run.key}
        footer={footer}
        known={run.known}
      />
    )
  if (finished && plan) return <DaySummary plan={plan} onExit={onExit} onRead={onRead} />
  return <section className="lesson">载入中…</section>
}

/** 每段小结页的底部：下一段是什么、继续 / 先到这里。卡片做完时盖一个“已签”章。 */
function NextStep({ sealed, next, index, total, onGo, onStop }: { sealed: boolean; next: { key: StepKey; info: StepInfo } | null; index: number; total: number; onGo: () => void; onStop: () => void }) {
  return (
    <div className="next-step">
      {sealed && (
        <div className="seal-row">
          <span className="stamp">已签</span>
          <span className="muted">卡片做完，今天已签到</span>
        </div>
      )}
      {next ? (
        <>
          <div className="next-card">
            <div className="small muted">
              下一段 · {index} / {total}
            </div>
            <div className="next-row">
              <StateDot state="now" />
              <div className="grow">
                <div className="step-name">{next.info.label}</div>
                <div className="small muted">
                  {next.info.detail} · 约 {next.info.minutes} 分钟
                </div>
              </div>
            </div>
          </div>
          <button className="primary block" onClick={onGo}>
            继续
          </button>
          <button className="link" onClick={onStop}>
            先到这里，晚点再做
          </button>
        </>
      ) : (
        <button className="primary block" onClick={onGo}>
          看今天的总结
        </button>
      )}
    </div>
  )
}

type DayStats = { total: number; right: number; minutes: number; fresh: KC[]; again: number }
async function dayStats(): Promise<DayStats> {
  const start = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  const rows = await db.attempts.where('at').aboveOrEqual(start).toArray()
  const kcs = [...new Set(rows.map((r) => r.kc))]
  // 今天第一次见到的：最早一次作答就是今天
  const firsts = await Promise.all(kcs.map((k) => db.attempts.where('kc').equals(k).first()))
  const fresh = kcs.filter((_, i) => (firsts[i]?.at ?? 0) >= start)
  const missed = new Set(rows.filter((r) => !r.ok).map((r) => r.kc))
  return {
    total: rows.length,
    right: rows.filter((r) => r.ok).length,
    minutes: Math.max(1, Math.round(rows.reduce((n, r) => n + Math.min(r.ms ?? 0, 60000), 0) / 60000)),
    fresh,
    again: missed.size,
  }
}

function safeIntro(kc: KC) {
  try {
    return introFor(kc)
  } catch {
    return undefined
  }
}

/** 今天全部做完：答了多少、新学了什么（点一下再听）、哪些明天会再练 */
function DaySummary({ plan, onExit, onRead }: { plan: DayPlan; onExit: () => void; onRead: () => void }) {
  const [st, setSt] = useState<DayStats | null>(null)
  useEffect(() => {
    dayStats().then(setSt)
  }, [])
  const fresh = (st?.fresh ?? []).map(safeIntro).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 6)
  return (
    <section className="lesson day-summary">
      <div className="lesson-top">
        <button className="link" onClick={onExit} aria-label="回首页">
          <Icon name="close" />
        </button>
      </div>
      <div className="center">
        <h1>今天的练习做完了</h1>
        <p className="muted">{dayKey() === plan.date && st ? `大约用了 ${st.minutes} 分钟` : ''}</p>
      </div>
      {st && (
        <div className="stat-row">
          <div>
            <b>{st.right}</b>
            <span className="small muted">答对 / {st.total} 题</span>
          </div>
          <div>
            <b>{st.fresh.length}</b>
            <span className="small muted">今天新学</span>
          </div>
          <div>
            <b>{st.again}</b>
            <span className="small muted">答错过，会再练</span>
          </div>
        </div>
      )}
      {fresh.length > 0 && (
        <>
          <div className="small muted">今天新学的</div>
          <div className="list-card">
            {fresh.map((x) => (
              <button key={x.kc} className="list-row" onClick={() => x.audio && play(x.audio)}>
                <span className="tib row-tib">{x.big}</span>
                <span className="grow">
                  <span className="row-main">{x.pron ?? x.sub ?? x.label}</span>
                  {x.note && <span className="small muted row-sub">{x.note}</span>}
                </span>
                {x.audio && (
                  <span className="accent">
                    <Icon name="play" size={18} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="two">
        <button onClick={onRead}>读一段原文</button>
      </div>
      <button className="link" onClick={onExit}>
        回首页
      </button>
    </section>
  )
}
