import { useEffect, useRef, useState } from 'react'
import { db } from './db.ts'
import { chapters } from './book.ts'
import { play } from './audio.ts'
import { shuffle, SPELL_SEQ, RULES } from './course.ts'
import { topSyls } from './fwords.ts'
import { chapterCoverage, coverageOf, learnedF, loadVocab } from './vocab.ts'
import { getProgress, READ_FROM, type Progress } from './practice.ts'

/**
 * 详细进度（第二层，从首页“学习进度 · 详细”进来）：
 * 原文里认识的词占多少（全书和每一章，点一章去读）；拼读学到哪了、拼读流利度测验。
 * 三个阶段的总览在首页，记忆强度在设置里。
 */
const FLUENCY_KEY = 'fluency-test'
const FLUENCY_N = 20
const FLUENCY_MS = 3000
type FluencyResult = { at: number; score: number; total: number }

/** 认词率曲线上的几个点：学会前 N 个高频词，大约认识全书多少 */
const MILESTONES: [number, string][] = [
  [100, '43%'],
  [300, '58%'],
  [1000, '76%'],
  [1500, '82%'],
]

export default function ProgressView({ onRead }: { onRead: (chapter: string) => void }) {
  const [p, setP] = useState<Progress | null>(null)
  const [cov, setCov] = useState(0)
  const [chs, setChs] = useState<Map<string, number>>(new Map())
  const [fluency, setFluency] = useState<FluencyResult | null>(null)
  const [testing, setTesting] = useState(false)

  const load = async () => {
    setP(await getProgress())
    setFluency(((await db.settings.get(FLUENCY_KEY))?.value as FluencyResult | undefined) ?? null)
    await loadVocab().catch(() => {})
    const known = await learnedF()
    setCov(coverageOf(known))
    setChs(chapterCoverage(known))
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

  return (
    <div className="progress-page">
      <section className="plan-card">
        <div className="plan-head">
          <b>原文里认识的词</b>
          <span className="big-pct">{Math.round(cov * 100)}%</span>
        </div>
        <div className="meter tall">
          <i style={{ width: `${cov * 100}%` }} />
          {MILESTONES.map(([n, pct]) => (
            <span key={n} className="tick" style={{ left: pct }} title={`前 ${n} 个词`} />
          ))}
        </div>
        <p className="small muted">
          已学 {p.fLearned} 个原文高频词。按词频学：前 300 个词约占全书 58%，前 1000 个约 76%，前 1500 个约 82%。认识 95% 以上就能比较顺地自己读。
          {!p.vocabOn && ' 30 个字母都学过以后，每天的卡片里开始带高频词。'}
          {p.vocabOn && !p.readOn && ` 学到 ${READ_FROM} 个以后，每天开始精读一段原文。`}
        </p>
        {chs.size > 0 && (
          <div className="ch-grid">
            {chapters.map((c) => {
              const v = chs.get(c.id) ?? 0
              return (
                <button key={c.id} className="ch-cell" onClick={() => onRead(c.id)} title={c.zh}>
                  <span className="small">{Number(c.id)} · {c.zh}</span>
                  <span className="meter"><i style={{ width: `${v * 100}%` }} /></span>
                  <span className="small muted">{Math.round(v * 100)}%</span>
                </button>
              )
            })}
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
              从原文最常见的 200 个音节里随机抽 {FLUENCY_N} 个，每个 3 秒内念出来，念完听录音自己对照。对 90% 算拼读过关。
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

/** 拼读流利度：看到音节，3 秒内念出来，点“念了”，听录音自己判断对不对 */
function FluencyTest({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<typeof topSyls>([])
  const [i, setI] = useState(0)
  const [ms, setMs] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const shown = useRef(0)

  useEffect(() => {
    loadVocab().then(() => setItems(shuffle(topSyls).slice(0, FLUENCY_N)))
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
  const clip = `book/${it.clip[0]}#${it.clip[1]}-${it.clip[2]}`
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
