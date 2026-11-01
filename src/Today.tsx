import { useEffect, useState } from 'react'
import { AUSPICIOUS, dayKey, streakInfo } from './daily.ts'
import { loadPlan, stepInfo, type DayPlan, type StepInfo, type StepKey } from './practice.ts'
import { getPathState } from './progress.ts'
import { PATH } from './course.ts'
import { Icon, StateDot } from './icons.tsx'
// 签到印章和日历的样式在 games.css 里（小游戏收起来了，样式还在用）
import './games.css'

type Info = Awaited<ReturnType<typeof streakInfo>>
type Current = { unit: string; title: string; done: number; total: number }

/**
 * 首页「今天」：今天要做的几步直接列出来（做完打勾、现在这步高亮、每步大约几分钟），
 * 按钮写明下一步是什么。不再每次打开弹提醒框。下面一张「正在学」的卡通往路径。
 */
export default function Today({ onPractice, onPath }: { onPractice: () => void; onPath: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [steps, setSteps] = useState<Record<StepKey, StepInfo>>({})
  const [cur, setCur] = useState<Current | null>(null)
  const [showCal, setShowCal] = useState(false)

  useEffect(() => {
    streakInfo().then(setInfo)
    loadPlan().then(async (p) => {
      setPlan(p)
      const all = await Promise.all(p.steps.map(async (k) => [k, await stepInfo(k)] as const))
      setSteps(Object.fromEntries(all))
    })
    getPathState().then((st) => {
      const units = PATH.filter((u) => u.track === 'spell')
      const u = units.find((x) => x.levels.some((l) => st.levels.get(l.id)?.status === 'available' && !st.levels.get(l.id)?.optional)) ?? units[0]
      const main = u.levels.filter((l) => !l.optional)
      setCur({ unit: `单元 ${u.n}`, title: u.title, done: main.filter((l) => st.levels.get(l.id)?.status === 'passed').length, total: main.length })
    })
  }, [])

  const left = plan ? plan.steps.filter((k) => !plan.done.includes(k)) : []
  const minutes = plan ? plan.steps.reduce((n, k) => n + (steps[k]?.minutes ?? 0), 0) : 0
  const next = left[0]
  return (
    <div className="home">
      <div className="home-date small muted">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
      <div className="home-title">
        <h1>今天</h1>
        {info && (
          <button className="link small" onClick={() => setShowCal(!showCal)} aria-expanded={showCal}>
            连续 {info.streak} 天 · 累计 {info.total} 天
          </button>
        )}
      </div>
      {info && (showCal ? <Calendar done={info.done} rest={info.rest} /> : <Week done={info.done} rest={info.rest} />)}
      {showCal && info && (
        <div>
          <div className="small muted">八吉祥 · 累计签到点亮</div>
          <div className="badges">
            {AUSPICIOUS.map(([n, name]) => (
              <span key={n} className={'badge' + (info.total >= n ? ' on' : '')} title={`累计 ${n} 天`}>
                {info.total >= n ? name : `${n} 天`}
              </span>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="plan-card">
          <div className="plan-head">
            <b>今日练习</b>
            <span className="small muted">
              {plan.done.length} / {plan.steps.length}
              {left.length ? ` · 约 ${minutes} 分钟` : ''}
            </span>
          </div>
          <ol className="plan-steps">
            {plan.steps.map((k) => {
              const s = plan.failed?.includes(k) ? 'fail' : plan.done.includes(k) ? 'done' : k === next ? 'now' : 'todo'
              return (
                <li key={k} className={s}>
                  <StateDot state={s} />
                  <div className="grow">
                    <div className="step-name">{steps[k]?.label ?? '…'}</div>
                    <div className="small muted">{s === 'fail' ? '这关没过，明天接着练' : k === 'drill' && s === 'done' ? '已签到' : steps[k]?.detail}</div>
                  </div>
                  {s !== 'done' && s !== 'fail' && steps[k] && <span className="small muted">{steps[k].minutes} 分钟</span>}
                </li>
              )
            })}
          </ol>
          <button className="primary block" onClick={onPractice}>
            {next ? `${plan.done.length ? '继续' : '开始'} · ${steps[next]?.label ?? ''}` : '今天做完了 · 看总结'}
          </button>
        </div>
      )}

      {cur && (
        <button className="now-card" onClick={onPath}>
          <div className="grow">
            <div className="small muted">
              正在学 · {cur.unit} · {cur.done} / {cur.total} 关
            </div>
            <div className="now-title">{cur.title}</div>
            <div className="meter">
              <i style={{ width: `${(cur.done / Math.max(1, cur.total)) * 100}%` }} />
            </div>
          </div>
          <span className="link small">
            路径 <Icon name="chevron" size={14} />
          </span>
        </button>
      )}
    </div>
  )
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
/** 这一周的签到：实心是签了，虚线圈是休息日（每周可以歇一天），描边是今天 */
function Week({ done, rest }: { done: Set<string>; rest: Set<string> }) {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  return (
    <div className="week">
      {WEEK.map((w, i) => {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
        const k = dayKey(d)
        const cls = done.has(k) ? 'done' : rest.has(k) ? 'rest' : k === dayKey(now) ? 'now' : d > now ? 'later' : ''
        return (
          <div key={w}>
            <div className="small muted">{w}</div>
            <div className={'wd ' + cls}>{d.getDate()}</div>
          </div>
        )
      })}
    </div>
  )
}

function Calendar({ done, rest }: { done: Set<string>; rest: Set<string> }) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, k) => new Date(now.getFullYear(), now.getMonth(), k + 1))]
  return (
    <div className="cal">
      <div className="cal-title small muted">{now.getMonth() + 1} 月 · 空心圈是休息日（每周可以歇一天）</div>
      <div className="cal-grid">
        {WEEK.map((w) => (
          <div key={w} className="cal-w small muted">
            {w}
          </div>
        ))}
        {cells.map((d, k) =>
          d ? (
            <div key={k} className={'cal-d' + (done.has(dayKey(d)) ? ' done' : rest.has(dayKey(d)) ? ' rest' : '') + (dayKey(d) === dayKey(now) ? ' now' : '')}>
              {d.getDate()}
            </div>
          ) : (
            <div key={k} />
          ),
        )}
      </div>
    </div>
  )
}
