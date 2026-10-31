import { useEffect, useState } from 'react'
import { amdoLessons, amdoPages, amdoSets, amdoTables, amdoWordById, sentenceById, TABLE_NOTES, type AmdoLesson } from './amdo.ts'
import { play, playSeq, preload, stop } from './audio.ts'
import { questionFor, shuffle, type Question } from './course.ts'
import type { Session } from './session.ts'
import './amdo.css'

type Part = 'talk' | 'words' | 'spell' | 'lessons'
const PARTS: [Part, string][] = [
  ['talk', '会话 300 句'],
  ['words', '单词'],
  ['spell', '拼读表'],
  ['lessons', '课文'],
]

/** 一组知识点 → 一次练习：每个知识点出两种题，打乱顺序 */
function practice(kcs: string[], title: string): Session {
  const qs: Question[] = shuffle(kcs.flatMap((kc) => [questionFor(kc, 0), questionFor(kc, 1 + Math.floor(Math.random() * 3))]))
  return { questions: qs.slice(0, 20), title }
}

/** 安多会话：《安多方言会话教材》里的会话、单词、拼读表和课文，全部是真人录音 */
export default function AmdoView({ onStart }: { onStart: (s: Session) => void }) {
  const [part, setPart] = useState<Part>(() => (localStorage.getItem('amdo-part') as Part) ?? 'talk')
  useEffect(() => localStorage.setItem('amdo-part', part), [part])
  useEffect(() => () => stop(), [])
  return (
    <section className="amdo">
      <h1>安多会话</h1>
      <p className="muted small">来自阿坝《安多方言会话教材》，每一段都是安多话的真人录音。点藏文就能听。</p>
      <div className="chips">
        {PARTS.map(([k, label]) => (
          <button key={k} className={part === k ? 'on' : ''} onClick={() => setPart(k)}>
            {label}
          </button>
        ))}
      </div>
      {part === 'talk' && <Talk onStart={onStart} />}
      {part === 'words' && <Words onStart={onStart} />}
      {part === 'spell' && <Spell />}
      {part === 'lessons' && <Lessons />}
    </section>
  )
}

function Talk({ onStart }: { onStart: (s: Session) => void }) {
  const [k, setK] = useState(() => Number(localStorage.getItem('amdo-set') ?? 0))
  const set = amdoSets[k] ?? amdoSets[0]
  const items = set.ids.map((id) => sentenceById.get(id)!)
  useEffect(() => {
    localStorage.setItem('amdo-set', String(k))
    preload(items.map((s) => s.audio))
  }, [k]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="chips sets">
        {amdoSets.map((s, i) => (
          <button key={i} className={i === k ? 'on' : ''} onClick={() => setK(i)}>
            {s.title}
          </button>
        ))}
      </div>
      <div className="amdo-actions">
        <button onClick={() => playSeq(items.map((s) => s.audio))}>▶ 全部播放</button>
        <button className="primary" onClick={() => onStart(practice(set.ids.map((id) => 'A:' + id), '会话 · ' + set.title))}>
          练这一组
        </button>
      </div>
      <ol className="talk-list">
        {items.map((s) => (
          <li key={s.id} onClick={() => play(s.audio)}>
            <span className="num">{s.n}</span>
            <div>
              <div className="tib talk-tib">{s.tib}</div>
              <div className="talk-zh">{s.zh}</div>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function Words({ onStart }: { onStart: (s: Session) => void }) {
  const [k, setK] = useState(() => Number(localStorage.getItem('amdo-page') ?? 0))
  const pg = amdoPages[k] ?? amdoPages[0]
  const items = pg.ids.map((id) => amdoWordById.get(id)!)
  useEffect(() => {
    localStorage.setItem('amdo-page', String(k))
    preload(items.map((w) => w.audio))
  }, [k]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="chips sets">
        {amdoPages.map((p, i) => (
          <button key={p.page} className={i === k ? 'on' : ''} onClick={() => setK(i)}>
            第 {p.page} 页
          </button>
        ))}
      </div>
      <div className="amdo-actions">
        <span className="muted small">{items.length} 个词</span>
        <button className="primary" onClick={() => onStart(practice(shuffle(pg.ids).slice(0, 10).map((id) => 'D:' + id), `单词 · 第 ${pg.page} 页`))}>
          练 10 个
        </button>
      </div>
      <div className="word-grid">
        {items.map((w) => (
          <button key={w.id} className="word-cell" onClick={() => play(w.audio)}>
            <span className="tib">{w.tib}</span>
            <span className="small">{w.zh}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function Spell() {
  const [k, setK] = useState(0)
  const t = amdoTables[k]
  return (
    <>
      <div className="chips sets">
        {amdoTables.map((x, i) => (
          <button key={x.part} className={i === k ? 'on' : ''} onClick={() => setK(i)}>
            {x.part}
          </button>
        ))}
      </div>
      <p className="muted small">{TABLE_NOTES[t.part]} 点每行最后的 ▶ 听整行连读。</p>
      <div className="spell-table">
        {t.rows.map((row, r) => (
          <div key={r} className="spell-row">
            {row.map((c, i) =>
              c.all ? (
                <button key={i} className="spell-all" onClick={() => play(c.audio)} aria-label="整行连读">▶</button>
              ) : (
                <button key={i} className="spell-cell tib" onClick={() => play(c.audio)}>
                  {c.tib}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function Lessons() {
  const [n, setN] = useState<number | null>(null)
  const L = amdoLessons.find((l) => l.n === n)
  if (L) return <LessonPage L={L} onBack={() => setN(null)} />
  return (
    <ul className="lesson-list">
      {amdoLessons.map((l) => (
        <li key={l.n}>
          <button onClick={() => setN(l.n)}>
            <b>第 {l.n} 课</b> {l.topic}
            <span className="muted small"> · {l.segs.length} 段</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function LessonPage({ L, onBack }: { L: AmdoLesson; onBack: () => void }) {
  const [cur, setCur] = useState<number | null>(null)
  const playFrom = (i: number) => {
    setCur(i)
    play(L.segs[i].audio, () => (i + 1 < L.segs.length && auto ? playFrom(i + 1) : setCur(null)))
  }
  const [auto, setAuto] = useState(false)
  useEffect(() => preload(L.segs.slice(0, 6).map((s) => s.audio)), [L])
  return (
    <>
      <div className="amdo-actions">
        <button className="link" onClick={onBack}>‹ 课文目录</button>
        <b>第 {L.n} 课 · {L.topic}</b>
      </div>
      <div className="amdo-actions">
        <button className={'pill' + (auto ? ' on' : '')} aria-pressed={auto} onClick={() => setAuto(!auto)}>
          连续播放
        </button>
        <span className="muted small">课本第 {L.page} 页起。点一段听这一段。</span>
      </div>
      <div className="seg-list">
        {L.segs.map((s, i) => (
          <button key={s.img} className={'seg' + (cur === i ? ' on' : '')} onClick={() => playFrom(i)}>
            <img src={`./amdo/${s.img}.jpg`} alt={`第 ${i + 1} 段`} loading="lazy" />
          </button>
        ))}
      </div>
    </>
  )
}
