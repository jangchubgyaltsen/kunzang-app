import { useEffect, useRef, useState } from 'react'
import { PATH, introFor, type KC, type Level, type PathUnit, type Track } from './course.ts'
import { ensureChecks, getPathState, type LevelState, type UnitState } from './progress.ts'
import { db } from './db.ts'
import { play } from './audio.ts'
import { say } from './sound.ts'
import { type Session } from './session.ts'
import { Icon, StateDot } from './icons.tsx'

type PathState = Awaited<ReturnType<typeof getPathState>>
const TRACKS: [Track, string][] = [
  ['spell', '拼读'],
  ['read', '诵读开篇'],
  ['talk', '安多会话'],
]
const TRACK_KEY = 'path-track'

/** 每种关是做什么的：路径清单和关卡预览里用 */
function levelWhat(l: Level) {
  if (l.optional) return '可以反复做，不挡后面的关'
  if (l.kind === 'learn') return `学 ${l.kcs.length} 个新东西`
  if (l.kind === 'practice') return '把前面几关一起练'
  if (l.kind === 'read') return `读开篇里能拼出来的 ${l.kcs.length} 个音节`
  if (l.kind === 'line') return '先认这句里的词，最后听整句、排词序、跟读'
  if (l.kind === 'test') return '通过才能往下走（80% 算过）'
  if (l.stage === 'hear') return `听录音选意思 · ${l.kcs.length} 句`
  if (l.stage === 'read') return '看藏文选意思、看中文选藏文'
  return '排音节、听音选句'
}
const levelMinutes = (l: Level) => Math.max(2, Math.round((l.kind === 'test' ? 20 : l.kcs.length * 3) / 5))

function shortTitle(u: PathUnit) {
  return u.title.replace(/^原文：/, '').replace(/^会话 \d+ · /, '')
}

/**
 * 路径：三条线（拼读、诵读开篇、安多会话）用顶上的切换各看各的，每关一行写清楚学什么。
 * 正在学的单元展开，通过的单元收成一行（显示下次抽查），没开的单元灰着收起来。
 * 点一关先弹出预览（学什么、能先听、大约几分钟），再开始；点锁住的关说明要先做哪一关。
 */
export default function PathList({ onStart, onOpen }: { onStart: (s: Session) => void; onOpen: (passage: string) => void }) {
  const [st, setSt] = useState<PathState | null>(null)
  const [track, setTrack] = useState<Track>(() => (localStorage.getItem(TRACK_KEY) as Track) || 'spell')
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Level | null>(null)
  const [checks, setChecks] = useState<Map<number, number>>(new Map())
  const curRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    getPathState().then(async (s) => {
      setSt(s)
      await ensureChecks(s.units)
      const rows = await db.checks.toArray()
      const m = new Map<number, number>()
      for (const c of rows) if (!c.doneAt && (!m.has(c.unit) || c.due < m.get(c.unit)!)) m.set(c.unit, c.due)
      setChecks(m)
    })
  }, [])
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'center' })
  }, [st, track])

  const pick = (t: Track) => {
    setTrack(t)
    localStorage.setItem(TRACK_KEY, t)
  }
  const units = PATH.filter((u) => u.track === track)
  const us = new Map<number, UnitState>(st?.units.map((u) => [u.n, u]))
  const ls = (l: Level) => st?.levels.get(l.id)
  const avail = st ? units.flatMap((u) => u.levels).filter((l) => ls(l)?.status === 'available') : []
  const current = avail.find((l) => !ls(l)?.optional) ?? avail[0]
  const counts = (t: Track) => {
    const all = PATH.filter((u) => u.track === t).flatMap((u) => u.levels.filter((l) => !l.optional))
    return `${all.filter((l) => st?.levels.get(l.id)?.status === 'passed').length}/${all.length}`
  }

  return (
    <section className="path-list">
      <h1>路径</h1>
      <div className="seg" role="tablist">
        {TRACKS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={track === t} className={track === t ? 'on' : ''} onClick={() => pick(t)}>
            {label}
            <span className="seg-n">{st ? counts(t) : ''}</span>
          </button>
        ))}
      </div>
      {track !== 'spell' && <p className="small muted">每天的今日练习会带你学一关；想多学，可以直接在这里点。</p>}
      {units.map((u) => {
        const s = us.get(u.n)
        const done = s?.status === 'passed' || s?.status === 'mastered'
        const locked = !s || s.status === 'locked'
        const main = u.levels.filter((l) => !l.optional)
        const passed = main.filter((l) => ls(l)?.status === 'passed').length
        const isCur = !!current && current.unit === u.n
        const expanded = isCur || open.has(u.n)
        const toggle = () => {
          const e = new Set(open)
          if (e.has(u.n)) e.delete(u.n)
          else e.add(u.n)
          setOpen(e)
        }
        const label = u.track === 'spell' ? `单元 ${u.n}` : u.track === 'talk' ? u.title.split(' · ')[0] : '开篇'
        if (!expanded)
          return (
            <button key={u.n} className={'unit-row' + (locked ? ' locked' : '')} onClick={toggle} aria-expanded={false}>
              <StateDot state={done ? 'done' : locked ? 'lock' : 'todo'} />
              <span className="grow">
                <span className="small muted">
                  {label} · {done ? (s?.status === 'mastered' ? '已掌握' : '已通过') : `${passed} / ${main.length} 关`}
                </span>
                <span className={'unit-name' + (u.track === 'spell' ? ' tibmix' : '')}>{shortTitle(u)}</span>
                {done && checks.get(u.n) && <span className="small accent">下次抽查 {new Date(checks.get(u.n)!).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span>}
              </span>
              <Icon name="chevron" size={18} className="muted" />
            </button>
          )
        return (
          <div key={u.n} className="unit-card">
            <div className="unit-card-head" onClick={isCur ? undefined : toggle}>
              <div className="grow">
                <div className="small muted">
                  {label} · {passed} / {main.length} 关
                </div>
                <div className={'unit-name big' + (u.track === 'spell' ? ' tibmix' : '')}>{shortTitle(u)}</div>
              </div>
              {u.passage && (
                <button className="link small" onClick={() => onOpen(u.passage!)}>
                  读原文
                </button>
              )}
            </div>
            {u.examples.length > 0 && (
              <div className="tib examples">
                {u.examples.map((x) => (
                  <span key={x} className="tap" onClick={() => say(x)}>
                    {x}
                  </span>
                ))}
              </div>
            )}
            <div className="meter">
              <i style={{ width: `${(passed / Math.max(1, main.length)) * 100}%` }} />
            </div>
            <ol className="levels">
              {u.levels.map((l) => {
                const x = ls(l)
                const state = x?.status === 'passed' ? 'done' : l.id === current?.id ? 'now' : !x || x.status === 'locked' ? 'lock' : 'todo'
                return (
                  <li key={l.id} ref={state === 'now' ? curRef : undefined} className={state + (l.optional ? ' optional' : '')}>
                    <button className="level-row" onClick={() => setPreview(l)}>
                      <StateDot state={state} />
                      <span className="grow">
                        <span className="level-name tibmix">{x?.optional && !l.optional ? '补课：' + l.title : l.title}</span>
                        <span className="small muted">{levelWhat(l)}</span>
                      </span>
                      {state === 'now' && <span className="go">开始</span>}
                      {state === 'done' && x?.best !== undefined && <span className="small muted">{Math.round(x.best * 100)}%</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
      {preview && (
        <LevelPreview
          l={preview}
          state={ls(preview)}
          blocker={blockerOf(preview, units, st)}
          onClose={() => setPreview(null)}
          onStart={() => {
            setPreview(null)
            onStart({ level: preview.id })
          }}
        />
      )}
    </section>
  )
}

/** 锁住的关：要先做完哪一关 */
function blockerOf(l: Level, units: PathUnit[], st: PathState | null) {
  if (!st) return undefined
  const all = units.flatMap((u) => u.levels).filter((x) => !x.optional)
  return all.find((x) => st.levels.get(x.id)?.status === 'available' && all.indexOf(x) < all.indexOf(l))
}

function safeIntro(kc: KC) {
  try {
    return introFor(kc)
  } catch {
    return undefined
  }
}

function LevelPreview({ l, state, blocker, onClose, onStart }: { l: Level; state?: LevelState; blocker?: Level; onClose: () => void; onStart: () => void }) {
  const u = PATH.find((x) => x.n === l.unit)!
  const locked = !state || state.status === 'locked'
  // 新内容关、听懂关：把要学的东西先摆出来，点一下就听
  const items = l.kind === 'learn' || l.stage === 'hear' || l.kind === 'line' ? l.kcs.map(safeIntro).filter((x): x is NonNullable<typeof x> => !!x && !x.kc.startsWith('X:')).slice(0, 6) : []
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card preview" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={l.title}>
        <div className="grab" />
        <div className="small muted">{u.track === 'spell' ? `单元 ${u.n} · ${u.title}` : u.title}</div>
        <h2 className="tibmix">{l.title}</h2>
        <p className="small muted">
          {levelWhat(l)} · 约 {levelMinutes(l)} 分钟
          {state?.best !== undefined ? ` · 上次 ${Math.round(state.best * 100)}%` : ''}
        </p>
        {items.length > 0 && (
          <>
            <div className={'preview-items' + (l.stage === 'hear' ? ' sentences' : '')}>
              {items.map((x) => (
                <button key={x.kc} className="preview-item" onClick={() => x.audio && play(x.audio)}>
                  <span className="tib">{x.big}</span>
                  {(x.pron ?? x.sub) && <span className="small">{x.pron ?? x.sub}</span>}
                  {l.stage !== 'hear' && x.note && x.kc.startsWith('W:') && <span className="small muted">{x.note}</span>}
                  {x.audio && (
                    <span className="accent">
                      <Icon name="play" size={16} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="small muted">点一下先听。</p>
          </>
        )}
        {l.kind !== 'learn' && !items.length && <p className="small">{u.intro}</p>}
        {locked ? (
          <p className="locked-note">
            <Icon name="lock" size={16} /> 先做完「{blocker?.title ?? '前面的关'}」才能开始这一关。
          </p>
        ) : (
          <button className="primary block" onClick={onStart}>
            {state?.status === 'passed' ? '再做一次' : '开始这一关'}
          </button>
        )}
      </div>
    </div>
  )
}
