import { useEffect, useState } from 'react'
import { db, type Flag } from './db.ts'
import { dueKCs, todayStats } from './progress.ts'
import { questionFor, type Question } from './course.ts'
import Lesson from './Lesson.tsx'

export default function Review() {
  const [due, setDue] = useState<string[]>([])
  const [stats, setStats] = useState({ answered: 0, correct: 0 })
  const [flags, setFlags] = useState<Flag[]>([])
  const [session, setSession] = useState<Question[] | null>(null)

  const load = () => {
    dueKCs(50).then(setDue)
    todayStats().then(setStats)
    db.flags.orderBy('id').reverse().toArray().then(setFlags)
  }
  useEffect(load, [])

  if (session)
    return (
      <Lesson
        questions={session}
        title="复习"
        onExit={() => {
          setSession(null)
          load()
        }}
      />
    )

  return (
    <section>
      <h1>复习</h1>
      <p>
        今天已答 {stats.answered} 题，答对 {stats.correct} 题。
      </p>
      <div className="review-box">
        <div className="big-number">{due.length}</div>
        <div className="muted">个知识点到期需要复习</div>
        <button className="primary" disabled={!due.length} onClick={() => setSession(due.slice(0, 15).map((k) => questionFor(k)))}>
          开始复习
        </button>
      </div>
      <h2>标记过的问题</h2>
      {flags.length === 0 && <p className="muted">还没有标记。</p>}
      <ul className="flags">
        {flags.map((f) => (
          <li key={f.id}>
            <span className="tib">{f.ref}</span>
            <span className="small">{f.note || '（未填写说明）'}</span>
            <button
              className="link"
              onClick={async () => {
                await db.flags.delete(f.id!)
                load()
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
