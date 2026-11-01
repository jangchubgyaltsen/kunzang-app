import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './db.ts'
import { Drill } from './Alphabet.tsx'
import Lesson from './Lesson.tsx'
import { levelById, questionFor, unitByN, type Question, type Track } from './course.ts'
import { dueKCs } from './progress.ts'
import { spotCheckSession } from './session.ts'
import { PER_DAY, REVIEW_SIZE, levelFor, loadPlan, markStep, stepHasWork, stepLabel, type DayPlan, type StepKey } from './practice.ts'

type Running =
  | { key: StepKey; kind: 'drill' }
  | { key: StepKey; kind: 'level'; level: string }
  | { key: StepKey; kind: 'questions'; questions: Question[]; title: string; onFinish?: (acc: number) => Promise<{ passed: boolean }> }

/**
 * 今日练习：一步做完自动进下一步。中途退出回到这一页的清单，点“继续”接着做。
 * auto：每天第一次打开 App 时直接进第一步，不先停在清单上。
 */
export default function Practice({ auto, onExit }: { auto: boolean; onExit: () => void }) {
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [run, setRun] = useState<Running | null>(null)
  const [what, setWhat] = useState<Record<StepKey, string>>({})
  const completed = useRef(false)
  // 这一步里已经做完几关（PER_DAY 可以让一条线一步连着做几关）
  const levelsDone = useRef(0)

  /** 找到下一步还有事可做的；没事可做的（复习没到期之类）直接记成做完 */
  const nextStep = useCallback(async () => {
    let p = await loadPlan()
    for (const key of p.steps) {
      if (p.done.includes(key)) continue
      if (await stepHasWork(key)) return { plan: p, key }
      p = await markStep(key)
    }
    return { plan: p, key: undefined }
  }, [])

  const start = useCallback(async (key: StepKey) => {
    completed.current = false
    levelsDone.current = 0
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
    setWhat((w) => ({ ...w, [key]: levelTitle(level) }))
    setRun({ key, kind: 'level', level })
  }, [])

  const advance = useCallback(
    async (go: boolean) => {
      const { plan: p, key } = await nextStep()
      setPlan(p)
      if (go && key) await start(key)
    },
    [nextStep, start],
  )

  useEffect(() => {
    void advance(auto)
  }, [advance, auto])

  const finishStep = async () => {
    const r = run!
    setRun(null)
    if (!completed.current) return advance(false) // 中途退出：回到清单
    if (r.kind === 'level') {
      // 这条线今天还能再做一关，并且刚才那关过了（下一关已经换了）：同一步里接着做
      levelsDone.current++
      const next = await levelFor(r.key)
      if (next && next !== r.level && levelsDone.current < PER_DAY[r.key.split(':')[1] as Track]) {
        completed.current = false
        setWhat((w) => ({ ...w, [r.key]: levelTitle(next) }))
        return setRun({ key: r.key, kind: 'level', level: next })
      }
    }
    await markStep(r.key)
    await advance(true)
  }
  const onComplete = () => {
    completed.current = true
  }

  if (run?.kind === 'drill') return <Drill onExit={finishStep} onComplete={onComplete} />
  if (run?.kind === 'level') return <Lesson key={run.level} level={run.level} onExit={finishStep} onComplete={onComplete} exitLabel="继续" resumeKey={run.key} />
  if (run?.kind === 'questions')
    return <Lesson questions={run.questions} title={run.title} onFinish={run.onFinish} onExit={finishStep} onComplete={onComplete} exitLabel="继续" resumeKey={run.key} />
  if (!plan) return <section className="lesson">载入中…</section>

  const left = plan.steps.filter((k) => !plan.done.includes(k))
  return (
    <section className="practice">
      <h1>今日练习</h1>
      <p className="muted small">一步接一步做完。字卡做完就算今天签到；后面是复习，再往下是拼读、开篇和会话各一小段。</p>
      <ol className="practice-steps">
        {plan.steps.map((k) => (
          <li key={k} className={plan.done.includes(k) ? 'done' : k === left[0] ? 'now' : ''}>
            <span className="mark">{plan.done.includes(k) ? '✓' : k === left[0] ? '▸' : '·'}</span>
            <span>{stepLabel(k)}</span>
            {what[k] && <span className="small muted"> · {what[k]}</span>}
          </li>
        ))}
      </ol>
      {left.length > 0 ? (
        <button className="primary" onClick={() => start(left[0])}>
          {plan.done.length ? '继续' : '开始'}：{stepLabel(left[0])}
        </button>
      ) : (
        <p className="practice-done">今天的练习都做完了。想多学，可以在路径上接着往下走。</p>
      )}
      <button className="link" onClick={onExit}>
        回首页
      </button>
    </section>
  )
}

function levelTitle(id: string) {
  const l = levelById.get(id)!
  const u = unitByN.get(l.unit)!
  return `${u.title} · ${l.title}`
}
