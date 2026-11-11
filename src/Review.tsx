import { useEffect, useState } from 'react'
import { db, type Flag } from './db.ts'
import { todayStats } from './progress.ts'
import { questionFor, recallQuestion } from './course.ts'
import { type Session } from './session.ts'
import { say } from './sound.ts'
import { loadVocab } from './vocab.ts'

export default function Review({ onStart }: { onStart: (s: Session) => void }) {
  const [due, setDue] = useState<string[]>([])
  const [stats, setStats] = useState({ answered: 0, correct: 0 })
  const [flags, setFlags] = useState<Flag[]>([])

  useEffect(() => {
    // 现在就到期的（今天的卡片做完以后又到期的，比如刚才答错的）
    db.cards.where('due').belowOrEqual(Date.now()).primaryKeys().then((ks) => setDue((ks as string[]).filter((k) => !k.startsWith('B:'))))
    todayStats().then(setStats)
    db.flags.orderBy('id').reverse().toArray().then(setFlags)
  }, [])

  return (
    <section>
      <h2>多复习一次</h2>
      <div className="row-card">
        <div className="grow">
          <div>
            现在到期 <b>{due.length}</b> 张
          </div>
          <div className="small muted">
            每天的卡片会自动复习。今天已答 {stats.answered} 题，答对 {stats.correct} 题。
          </div>
        </div>
        <button
          className="primary"
          disabled={!due.length}
          onClick={async () => {
            await loadVocab().catch(() => {})
            onStart({ questions: due.slice(0, 20).map((k) => recallQuestion(k) ?? questionFor(k)), title: '复习' })
          }}
        >
          复习
        </button>
      </div>

      {flags.length > 0 && <h2>标记过的问题</h2>}
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
