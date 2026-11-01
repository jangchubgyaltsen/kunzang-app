import { useEffect, useState } from 'react'
import { AUSPICIOUS, dayKey, streakInfo } from './daily.ts'
import { loadPlan, stepLabel, type DayPlan } from './practice.ts'
// 首页卡片、签到印章和日历的样式在 games.css 里（小游戏收起来了，样式还在用）
import './games.css'

type Info = Awaited<ReturnType<typeof streakInfo>>

/** 首页顶部的「今日」卡片：签到天数和今日练习的进度。字卡做完就算签到。 */
export default function Today({ onPractice }: { onPractice: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [showCal, setShowCal] = useState(false)

  useEffect(() => {
    streakInfo().then(setInfo)
    loadPlan().then(setPlan)
  }, [])

  const left = plan ? plan.steps.filter((k) => !plan.done.includes(k)) : []
  return (
    <div className="today">
      <div className="today-head">
        <div>
          <div className="today-date">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
          {info && (
            <button className="link small" onClick={() => setShowCal(!showCal)}>
              已连续 {info.streak} 天 · 累计 {info.total} 天 {showCal ? '▴' : '▾'}
            </button>
          )}
        </div>
        <div className={'seal' + (info?.today ? ' on' : '')}>{info?.today ? '已签' : '未签'}</div>
      </div>
      {showCal && info && <Calendar done={info.done} rest={info.rest} />}
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
        <button className="primary today-go" onClick={onPractice}>
          {left.length ? `今日练习${plan.done.length ? ' · 继续' : ''}` : '今日练习 · 已做完'}
          <span className="small">
            {left.length ? `下一步：${stepLabel(left[0])} · 还剩 ${left.length} 步` : '可以再看看清单，或在下面的路径上接着学'}
            {!info?.today && left.length ? ' · 字卡做完即签到' : ''}
          </span>
        </button>
      )}
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
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
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
