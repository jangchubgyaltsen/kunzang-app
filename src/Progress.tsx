import { useEffect, useRef, useState } from 'react'
import { db } from './db.ts'
import { play } from './audio.ts'
import { shuffle, SPELL_SEQ, RULES } from './course.ts'
import { course, loadVerses, ritualById, wordAudio, wordByT } from './verses.ts'
import { getProgress, type Progress } from './practice.ts'

/**
 * 详细进度（第二层，从首页“学习进度 · 详细”进来）：
 * 仪轨偈颂学到哪了（每部仪轨学了几句，点一部去仪轨页看）；拼读学到哪了、拼读流利度测验。
 * 阶段总览在首页，记忆强度在设置里。
 */
const FLUENCY_KEY = 'fluency-test'
const FLUENCY_N = 20
const FLUENCY_MS = 3000
type FluencyResult = { at: number; score: number; total: number }
type RitualRow = { id: string; title: string; done: number; total: number }

export default function ProgressView({ onRead }: { onRead: (ritual: string) => void }) {
  const [p, setP] = useState<Progress | null>(null)
  const [rows, setRows] = useState<RitualRow[]>([])
  const [fluency, setFluency] = useState<FluencyResult | null>(null)
  const [testing, setTesting] = useState(false)

  const load = async () => {
    const pr = await getProgress()
    setP(pr)
    setFluency(((await db.settings.get(FLUENCY_KEY))?.value as FluencyResult | undefined) ?? null)
    await loadVerses().catch(() => {})
    const by = new Map<string, RitualRow>()
    for (const k of course) {
      const rid = k.split('/')[0]
      const row = by.get(rid) ?? { id: rid, title: ritualById.get(rid)?.title ?? rid, done: 0, total: 0 }
      row.total++
      if (pr.introduced.has('J:' + k)) row.done++
      by.set(rid, row)
    }
    setRows([...by.values()])
  }
  useEffect(() => {
    void load()
  }, [])

  if (testing) return <FluencyTest onDone={() => { setTesting(false); void load() }} />
  if (!p) return <p className="muted">载入中…</p>

  const intro = (pre: string) => [...p.introduced].filter((k) => k.startsWith(pre)).length
  const rulesDone = Object.keys(RULES).filter((k) => p.introduced.has(k)).length
  const spellDone = SPELL_SEQ.length - p.spellLeft.length
  const passed = fluency && fluency.score / fluency.total >= 0.9
  // 学过的仪轨，加上正在学的下一部，再往后列三部
  const cur = rows.findIndex((r) => r.done < r.total)
  const shown = rows.slice(0, cur < 0 ? rows.length : cur + 4)

  return (
    <div className="progress-page">
      <section className="plan-card">
        <div className="plan-head">
          <b>仪轨偈颂</b>
          <span className="small muted">{p.jLearned} / {course.length} 句 · 词 {p.gLearned} / {wordByT.size}</span>
        </div>
        <p className="small muted">
          照背诵器的学法：每天新学 1–3 句，先把句里没学过的词一个个学，再看整句、对照意思，最后遮字背诵。词在全 App 只学一次，别的仪轨里再出现就只复习。
          {!p.verseOn && ' 30 个字母都学过以后开始。'}
        </p>
        {shown.length > 0 && (
          <div className="ch-grid">
            {shown.map((r) => (
              <button key={r.id} className="ch-cell" onClick={() => onRead(r.id)}>
                <span className="small">{r.title}</span>
                <span className="meter"><i style={{ width: `${(r.done / r.total) * 100}%` }} /></span>
                <span className="small muted">{r.done} / {r.total}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="plan-card">
        <div className="plan-head">
          <b>拼读</b>
          <span className="small muted">{spellDone} / {SPELL_SEQ.length} 项 · 组合 {120 - p.cvLeft} / 120</span>
        </div>
        <ul className="facts small">
          <li>字母 {intro('L:')} / 30 · 元音 {intro('V:')} / 4 · 加字规则 {rulesDone} / {Object.keys(RULES).length}</li>
          <li>字母元音组合：一个字母和 4 个元音都有点熟了，才开始学这个字母的组合。</li>
        </ul>
        <div className="fluency">
          <div>
            <b>拼读流利度测验</b>
            <p className="small muted">
              从偈颂里最常见的 200 个词里随机抽 {FLUENCY_N} 个，每个 3 秒内念出来，念完听发音自己对照。对 90% 算拼读过关。
            </p>
            {fluency && (
              <p className="small">
                上次：{fluency.score} / {fluency.total}（{new Date(fluency.at).toLocaleDateString('zh-CN')}）{passed ? ' · 已过关' : ''}
              </p>
            )}
          </div>
          <button onClick={() => setTesting(true)}>{fluency ? '再测一次' : '开始测验'}</button>
        </div>
      </section>

    </div>
  )
}

/** 偈颂里最常见、有发音的词（流利度测验用） */
function topWords() {
  return [...wordByT.entries()]
    .filter(([, w]) => w.a)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 200)
    .map(([t, w]) => ({ s: t, audio: wordAudio(w.a)! }))
}

/** 拼读流利度：看到词，3 秒内念出来，点“念了”，听发音自己判断对不对 */
function FluencyTest({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<{ s: string; audio: string }[]>([])
  const [i, setI] = useState(0)
  const [ms, setMs] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const shown = useRef(0)

  useEffect(() => {
    loadVerses().then(() => setItems(shuffle(topWords()).slice(0, FLUENCY_N)))
  }, [])
  useEffect(() => {
    shown.current = performance.now()
    setMs(null)
  }, [i, items])

  if (!items.length) return <section className="lesson">载入中…</section>
  if (i >= items.length) {
    const pass = score / items.length >= 0.9
    return (
      <section className="lesson summary">
        <h1>{pass ? '拼读过关' : '再练练'}</h1>
        <div className="big-number">
          {score} / {items.length}
        </div>
        <p className="muted">3 秒内念对的个数，90% 算过关。{pass ? '' : '每天的卡片会接着练拼读，过几天再测。'}</p>
        <button className="primary" onClick={onDone}>回进度</button>
      </section>
    )
  }
  const it = items[i]
  const clip = it.audio
  const answer = async (ok: boolean) => {
    const s = score + (ok && (ms ?? Infinity) <= FLUENCY_MS ? 1 : 0)
    setScore(s)
    if (i + 1 >= items.length) await db.settings.put({ key: FLUENCY_KEY, value: { at: Date.now(), score: s, total: items.length } satisfies FluencyResult })
    setI(i + 1)
  }
  return (
    <section className="lesson">
      <div className="lesson-top">
        <button className="link" onClick={onDone}>✕</button>
        <div className="bar"><div style={{ width: `${(i / items.length) * 100}%` }} /></div>
        <span className="small muted">拼读流利度 · {i + 1} / {items.length}</span>
      </div>
      <div className="intro-card">
        <div className="intro-label">{ms === null ? '马上念出来' : ms <= FLUENCY_MS ? `${(ms / 1000).toFixed(1)} 秒` : `${(ms / 1000).toFixed(1)} 秒，超过 3 秒`}</div>
        <div className="tib huge">{it.s}</div>
        {ms !== null && <button className="intro-play" onClick={() => play(clip)}>▶ 再听一遍录音</button>}
      </div>
      {ms === null ? (
        <button className="primary" onClick={() => { setMs(Math.round(performance.now() - shown.current)); play(clip) }}>念了</button>
      ) : (
        <div className="two">
          <button onClick={() => answer(false)}>念错了</button>
          <button className="primary" onClick={() => answer(true)}>念对了</button>
        </div>
      )}
    </section>
  )
}
