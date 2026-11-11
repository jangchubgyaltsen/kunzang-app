import { useEffect, useState } from 'react'
import { AUSPICIOUS, dayKey, streakInfo } from './daily.ts'
import { loadPlan, stepInfo, type DayPlan, type StepInfo, type StepKey } from './practice.ts'
import { getOverview, type Overview, type StageState } from './overview.ts'
import { Icon, StateDot } from './icons.tsx'
// 签到印章和日历的样式在 games.css 里（小游戏收起来了，样式还在用）
import './games.css'

type Info = Awaited<ReturnType<typeof streakInfo>>

/**
 * 首页「学习」（第一层）：上面是今天的三段，一个按钮接着做；下面是学习进度：
 * 一条全程的条子分三段（拼读 → 原文高频词 → 有声精读），每段写明学了多少、还剩多少，再一句下一步是什么。
 * 详细进度和设置是第二层，从这里点进去。
 */
export default function Today({ onPractice, onDetail, onSettings }: { onPractice: () => void; onDetail: () => void; onSettings: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [steps, setSteps] = useState<Partial<Record<StepKey, StepInfo>>>({})
  const [ov, setOv] = useState<Overview | null>(null)
  const [showCal, setShowCal] = useState(false)

  useEffect(() => {
    streakInfo().then(setInfo)
    loadPlan().then(async (p) => {
      setPlan(p)
      const all = await Promise.all(p.steps.map(async (k) => [k, await stepInfo(k)] as const))
      setSteps(Object.fromEntries(all))
    })
    getOverview().then(setOv)
  }, [])

  const left = plan ? plan.steps.filter((k) => !plan.done.includes(k)) : []
  const minutes = plan ? left.reduce((n, k) => n + (steps[k]?.minutes ?? 0), 0) : 0
  const next = left[0]
  return (
    <div className="home">
      <div className="home-top">
        <span className="small muted">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
        <button className="icon-btn" onClick={onSettings} aria-label="设置">
          <Icon name="gear" size={22} />
        </button>
      </div>
      <div className="home-title">
        <h1>今天</h1>
        {info && (
          <button className="streak" onClick={() => setShowCal(!showCal)} aria-expanded={showCal}>
            连续 <b>{info.streak}</b> 天 · 累计 {info.total} 天
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
            <b>今天的练习</b>
            <span className="small muted">
              {plan.done.length} / {plan.steps.length} 段{left.length ? ` · 还要约 ${minutes} 分钟` : ' · 做完了'}
            </span>
          </div>
          <ol className="plan-steps">
            {plan.steps.map((k) => {
              const s = plan.done.includes(k) ? 'done' : k === next ? 'now' : 'todo'
              return (
                <li key={k} className={s}>
                  <StateDot state={s} />
                  <div className="grow">
                    <div className="step-name">{steps[k]?.label ?? '…'}</div>
                    <div className="small muted">{k === 'cards' && s === 'done' ? '已签到' : steps[k]?.detail}</div>
                  </div>
                  {s !== 'done' && steps[k] && <span className="small muted nowrap">{steps[k].minutes} 分钟</span>}
                </li>
              )
            })}
          </ol>
          <button className="primary block" onClick={onPractice}>
            {next ? `${plan.done.length ? '继续' : '开始'} · ${steps[next]?.label ?? ''}` : '今天做完了 · 看总结'}
          </button>
        </div>
      )}

      {ov && <Journey ov={ov} onDetail={onDetail} />}
    </div>
  )
}

const STATE_LABEL: Record<StageState, string> = { todo: '未开始', now: '正在学', done: '学完了' }

/** 学习进度：全程一条分三段的条子，下面每个阶段一行：学了多少 / 一共多少、还剩多少 */
function Journey({ ov, onDetail }: { ov: Overview; onDetail: () => void }) {
  const cur = ov.stages[ov.now]
  return (
    <section className="plan-card journey">
      <div className="plan-head">
        <b>学习进度</b>
        <button className="link small" onClick={onDetail}>
          详细 <Icon name="chevron" size={14} />
        </button>
      </div>
      <div className="here">
        <span className="small muted">现在在第 {ov.now + 1} 阶段</span>
        <span className="here-name">{cur.name}</span>
      </div>
      <div className="track" aria-hidden="true">
        {ov.stages.map((s) => (
          <span key={s.key} className={'seg ' + s.state}>
            <i style={{ width: `${pct(s.done, s.total)}%` }} />
          </span>
        ))}
      </div>
      <ol className="stage-rows">
        {ov.stages.map((s, k) => (
          <li key={s.key} className={s.state}>
            <span className="stage-n">{k + 1}</span>
            <div className="grow">
              <div className="stage-line">
                <span className="stage-name">{s.name}</span>
                <span className="stage-num">
                  {s.done.toLocaleString()} <span className="muted">/ {s.total.toLocaleString()} {s.unit}</span>
                </span>
              </div>
              <div className="small muted">
                {STATE_LABEL[s.state]} · {s.note}
                {s.state === 'now' && s.total > s.done ? ` · 还剩 ${(s.total - s.done).toLocaleString()} ${s.unit}` : ''}
              </div>
            </div>
          </li>
        ))}
        <li className={'side ' + (ov.talk.done ? 'now' : 'todo')}>
          <span className="stage-n">+</span>
          <div className="grow">
            <div className="stage-line">
              <span className="stage-name">安多会话</span>
              <span className="stage-num">
                {ov.talk.done} <span className="muted">/ {ov.talk.total} 句</span>
              </span>
            </div>
            <div className="meter thin">
              <i style={{ width: `${pct(ov.talk.done, ov.talk.total)}%` }} />
            </div>
          </div>
        </li>
      </ol>
      <p className="next-tip small">
        <b>下一步</b> {ov.next}
      </p>
    </section>
  )
}

const pct = (a: number, b: number) => (b ? Math.min(100, (a / b) * 100) : 0)

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
