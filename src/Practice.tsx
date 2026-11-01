import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './db.ts'
import { Drill } from './Alphabet.tsx'
import Lesson from './Lesson.tsx'
import { introFor, questionFor, type KC, type Question, type Track } from './course.ts'
import { dueKCs } from './progress.ts'
import { spotCheckSession } from './session.ts'
import { play } from './audio.ts'
import { dayKey } from './daily.ts'
import { Icon, StateDot } from './icons.tsx'
import { PER_DAY, REVIEW_SIZE, addExtra, levelFor, loadPlan, markStep, stepHasWork, stepInfo, stepLabel, type DayPlan, type StepInfo, type StepKey } from './practice.ts'

type Running =
  | { key: StepKey; kind: 'drill' }
  | { key: StepKey; kind: 'level'; level: string }
  | { key: StepKey; kind: 'questions'; questions: Question[]; title: string; onFinish?: (acc: number) => Promise<{ passed: boolean }> }

/**
 * 今日练习：今天的清单在首页上，这里只管做。
 * 每做完一步，小结页底部告诉你下一步是什么：可以“继续”，也可以“先到这里”回首页。
 * 中途点 ✕ 直接回首页，下次从退出的地方接着做。全部做完显示今天的总结。
 */
export default function Practice({ onExit, onRead }: { onExit: () => void; onRead: () => void }) {
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [run, setRun] = useState<Running | null>(null)
  const [next, setNext] = useState<{ key: StepKey; info: StepInfo } | null>(null)
  const [finished, setFinished] = useState(false)
  const completed = useRef(false)
  // 刚做完的这一关过没过
  const lastPassed = useRef(true)
  // 这一步里已经做完几关（PER_DAY 可以让一条线一步连着做几关）
  const levelsDone = useRef(0)

  /** 找到下一步还有事可做的；没事可做的（复习没到期之类）直接记成做完 */
  const nextStep = useCallback(async (skip?: StepKey) => {
    let p = await loadPlan()
    for (const key of p.steps) {
      if (p.done.includes(key) || key === skip) continue
      if (await stepHasWork(key)) return { plan: p, key }
      p = await markStep(key)
    }
    return { plan: p, key: undefined }
  }, [])

  const start = useCallback(async (key: StepKey) => {
    completed.current = false
    levelsDone.current = 0
    setNext(null)
    if (key === 'drill') return setRun({ key, kind: 'drill' })
    if (key === 'review') {
      const due = await dueKCs(REVIEW_SIZE)
      return setRun({ key, kind: 'questions', questions: due.map((k) => questionFor(k)), title: '今日练习 · 到期复习' })
    }
    if (key.startsWith('check:')) {
      const c = (await db.checks.get(key.slice(6)))!
      return setRun({ key, kind: 'questions', ...(await spotCheckSession(c)) } as Running)
    }
    const level = (await levelFor(key))!
    setRun({ key, kind: 'level', level })
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

  // 一步刚做完：先算好下一步，小结页底部显示
  const onComplete = async (passed = true) => {
    completed.current = true
    lastPassed.current = passed
    const r = run!
    const { key } = await nextStep(r.key)
    setNext(key ? { key, info: await stepInfo(key) } : null)
  }

  /** 这一步做完了。go：接着做下一步；否则回首页 */
  const finishStep = async (go: boolean) => {
    const r = run!
    if (!completed.current) return onExit() // 中途退出：回首页，下次接着做
    if (r.kind === 'level' && go) {
      // 这条线今天还能再做一关，并且刚才那关过了（下一关已经换了）：同一步里接着做
      levelsDone.current++
      const lv = await levelFor(r.key)
      if (lv && lv !== r.level && levelsDone.current < PER_DAY[r.key.split(':')[1] as Track]) {
        completed.current = false
        return setRun({ key: r.key, kind: 'level', level: lv })
      }
    }
    const p = await markStep(r.key, r.kind === 'level' && !lastPassed.current)
    setPlan(p)
    if (!go) return onExit()
    setRun(null)
    const { key } = await nextStep()
    if (key) await start(key)
    else setFinished(true)
  }

  const footer = run && plan && (
    <NextStep
      sealed={run.key === 'drill'}
      next={next}
      index={plan.steps.indexOf(next?.key ?? '') + 1}
      total={plan.steps.length}
      onGo={() => finishStep(true)}
      onStop={() => finishStep(false)}
    />
  )

  if (run?.kind === 'drill') return <Drill onExit={() => finishStep(false)} onComplete={() => void onComplete()} footer={footer} />
  if (run?.kind === 'level')
    return <Lesson key={run.level} level={run.level} onExit={() => finishStep(false)} onComplete={(p) => void onComplete(p)} resumeKey={run.key} footer={footer} />
  if (run?.kind === 'questions')
    return <Lesson questions={run.questions} title={run.title} onFinish={run.onFinish} onExit={() => finishStep(false)} onComplete={(p) => void onComplete(p)} resumeKey={run.key} footer={footer} />
  if (finished && plan)
    return (
      <DaySummary
        plan={plan}
        onExit={onExit}
        onRead={onRead}
        onMore={async () => {
          setFinished(false)
          const p = await addExtra()
          setPlan(p)
          await begin()
        }}
      />
    )
  return <section className="lesson">载入中…</section>
}

/** 每步小结页的底部：下一步是什么、继续 / 先到这里。字卡做完时盖一个“已签”章。 */
function NextStep({ sealed, next, index, total, onGo, onStop }: { sealed: boolean; next: { key: StepKey; info: StepInfo } | null; index: number; total: number; onGo: () => void; onStop: () => void }) {
  return (
    <div className="next-step">
      {sealed && (
        <div className="seal-row">
          <span className="stamp">已签</span>
          <span className="muted">字卡做完，今天已签到</span>
        </div>
      )}
      {next ? (
        <>
          <div className="next-card">
            <div className="small muted">
              下一步 · {index} / {total}
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

/** 今天全部做完：答了多少、新学了什么（点一下再听）、哪些明天会再练；有省掉的新内容可以“再学一点” */
function DaySummary({ plan, onExit, onRead, onMore }: { plan: DayPlan; onExit: () => void; onRead: () => void; onMore: () => void }) {
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
        {!!plan.extra?.length && <button onClick={onMore}>再学一点：{stepLabel(plan.extra[0])}</button>}
        <button onClick={onRead}>读一段原文</button>
      </div>
      <button className="link" onClick={onExit}>
        回首页
      </button>
    </section>
  )
}
