import { useEffect, useState } from 'react'
import { db, type Flag, type SpotCheck } from './db.ts'
import { CHECK_DAYS, dueChecks, dueKCs, todayStats, upcomingChecks } from './progress.ts'
import { questionFor, unitByN } from './course.ts'
import { spotCheckSession, type Session } from './session.ts'
import { say } from './sound.ts'

const fmt = (t: number) => new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })

export default function Review({ onStart }: { onStart: (s: Session) => void }) {
  const [due, setDue] = useState<string[]>([])
  const [stats, setStats] = useState({ answered: 0, correct: 0 })
  const [flags, setFlags] = useState<Flag[]>([])
  const [checks, setChecks] = useState<SpotCheck[]>([])
  const [upcoming, setUpcoming] = useState<SpotCheck[]>([])

  useEffect(() => {
    dueKCs(50).then(setDue)
    todayStats().then(setStats)
    dueChecks().then(setChecks)
    upcomingChecks().then((xs) => setUpcoming(xs.filter((c) => c.due > Date.now())))
    db.flags.orderBy('id').reverse().toArray().then(setFlags)
  }, [])

  return (
    <section>
      <h1>复习</h1>
      <p>
        今天已答 {stats.answered} 题，答对 {stats.correct} 题。
      </p>
      <div className="review-box">
        <div className="big-number">{due.length}</div>
        <div className="muted">个知识点到期需要复习（按遗忘曲线排的）</div>
        <button className="primary" disabled={!due.length} onClick={() => onStart({ questions: due.slice(0, 15).map((k) => questionFor(k)), title: '复习' })}>
          开始复习
        </button>
      </div>

      <h2>定时抽查</h2>
      <p className="small muted">每个单元通过以后，第 {CHECK_DAYS.join('、')} 天各抽查一次，每次 10 题。没到 80% 就明天再抽一次，答错的内容也会提前进复习。</p>
      {checks.map((c) => (
        <button key={c.id} className="primary due-go" onClick={async () => onStart(await spotCheckSession(c))}>
          现在抽查：{unitByN.get(c.unit)!.title}
          <span className="small">第 {CHECK_DAYS[c.step]} 天{c.tries > 0 ? ` · 上次 ${Math.round((c.score ?? 0) * 100)}%` : ''}</span>
        </button>
      ))}
      {upcoming.length > 0 ? (
        <ul className="checks">
          {upcoming.map((c) => (
              <li key={c.id}>
                <span>{fmt(c.due)}</span>
                <span className="small">{unitByN.get(c.unit)!.title} · 第 {CHECK_DAYS[c.step]} 天</span>
              </li>
            ))}
        </ul>
      ) : (
        !checks.length && <p className="muted small">通过第一个单元以后，这里会列出抽查日程。</p>
      )}

      <h2>标记过的问题</h2>
      {flags.length === 0 && <p className="muted">还没有标记。</p>}
      <ul className="flags">
        {flags.map((f) => (
          <li key={f.id}>
            <span className="tib tap" onClick={() => say(f.ref)}>{f.ref}</span>
            <span className="small">{f.note || '（未填写说明）'}</span>
            <button
              className="link"
              onClick={async () => {
                await db.flags.delete(f.id!)
                setFlags(flags.filter((x) => x.id !== f.id))
              }}
            >
              删除
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
