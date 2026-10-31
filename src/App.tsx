import { useEffect, useState, type CSSProperties } from 'react'
import { passages, passageTitles, syllableMap, units, type Syllable } from './content.ts'
import { play } from './audio.ts'
import { say } from './sound.ts'
import { db, exportData, importData, importTranslationPack } from './db.ts'
import Lesson from './Lesson.tsx'
import Review from './Review.tsx'
import Game from './Games.tsx'
import Today from './Today.tsx'
import type { GameKind } from './daily.ts'
import { getUnitStates, type UnitState } from './progress.ts'

type Tab = 'path' | 'reader' | 'review' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('path')
  const [passageId, setPassageId] = useState('title')
  const [lesson, setLesson] = useState<number | null>(null)
  const [game, setGame] = useState<{ kind?: GameKind; daily: boolean } | null>(null)
  const busy = lesson !== null || game !== null

  const openPassage = (id: string) => {
    setPassageId(id)
    setTab('reader')
  }

  return (
    <div className="app">
      <main>
        {lesson !== null && <Lesson unit={lesson} onExit={() => setLesson(null)} />}
        {game !== null && <Game kind={game.kind} daily={game.daily} onExit={() => setGame(null)} />}
        {!busy && tab === 'path' && <PathView onOpen={openPassage} onStartLesson={setLesson} onPlay={(kind, daily) => setGame({ kind, daily })} />}
        {!busy && tab === 'reader' && <ReaderView passageId={passageId} onSelect={setPassageId} />}
        {!busy && tab === 'review' && <Review />}
        {!busy && tab === 'settings' && <SettingsView />}
      </main>
      {!busy && (
      <nav className="tabs">
        {(
          [
            ['path', '路径'],
            ['reader', '原文'],
            ['review', '复习'],
            ['settings', '设置'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      )}
    </div>
  )
}

function PathView({ onOpen, onStartLesson, onPlay }: { onOpen: (id: string) => void; onStartLesson: (n: number) => void; onPlay: (kind: GameKind | undefined, daily: boolean) => void }) {
  const [states, setStates] = useState<Map<number, UnitState>>(new Map())
  useEffect(() => {
    getUnitStates().then((xs) => setStates(new Map(xs.map((x) => [x.n, x]))))
  }, [])
  // 原文单元（有 target）的阅读器随时可以打开；拼读单元按掌握度解锁
  const open = (n: number, target?: string) => (target ? true : states.get(n)?.status !== 'locked' && states.size > 0)
  const current = units.find((u) => !u.target && states.get(u.n)?.status === 'available')?.n
  return (
    <section>
      <Today onPlay={onPlay} />
      <h1>今日路径</h1>
      <p className="muted">第一部分：拼读 → 开篇原文</p>
      <ol className="path">
        {units.map((u, i) => (
          <li key={u.n} className={statusClass(u.target ? undefined : states.get(u.n)?.status, open(u.n, u.target)) + (u.n === current ? ' current' : '')} style={{ '--x': ZIGZAG[i % ZIGZAG.length] } as CSSProperties}>
            <button className="node" disabled={!open(u.n, u.target)} onClick={() => (u.target ? onOpen(u.target) : onStartLesson(u.n))} aria-label={u.title}>
              {open(u.n, u.target) ? u.n : '🔒'}
            </button>
            <div className="unit-title">{u.title}</div>
            {u.examples.length > 0 && (
              <div className="tib small">
                {u.examples.map((x) => (
                  <span key={x} className="tap example" onClick={() => say(x)}>
                    {x}
                  </span>
                ))}
              </div>
            )}
            {!u.target && <UnitNote st={states.get(u.n)} />}
          </li>
        ))}
      </ol>
    </section>
  )
}

function statusClass(st: UnitState['status'] | undefined, open: boolean) {
  if (!st) return open ? 'ready' : 'locked'
  return { locked: 'locked', available: 'ready', passed: 'ready passed', mastered: 'ready mastered' }[st]
}

function UnitNote({ st }: { st?: UnitState }) {
  if (!st) return null
  const text = {
    locked: '完成上一单元后解锁',
    available: '点圆圈开始练习',
    passed: `已通过 · 最好 ${Math.round((st.accuracy ?? 0) * 100)}%`,
    mastered: '已掌握',
  }[st.status]
  return <div className="muted small">{text}</div>
}

// 节点左右错落的偏移量（相对节点宽度）
const ZIGZAG = [0, 0.8, 1.2, 0.8, 0, -0.8, -1.2, -0.8]

function ReaderView({ passageId, onSelect }: { passageId: string; onSelect: (id: string) => void }) {
  const [showWylie, setShowWylie] = useState(true)
  const [showZh, setShowZh] = useState(true)
  const [picked, setPicked] = useState<Syllable | null>(null)
  const p = passages.find((x) => x.id === passageId) ?? passages[0]
  const [chinese, setChinese] = useState<string | null>(null)
  useEffect(() => {
    db.translations.get(p.id).then((t) => setChinese(t?.chinese ?? null))
  }, [p.id])
  const zhLines = (chinese ?? '').split(/(?<=[，。！])/).filter(Boolean)

  return (
    <section>
      <div className="chips">
        {passages.map((x) => (
          <button key={x.id} className={x.id === p.id ? 'on' : ''} onClick={() => onSelect(x.id)}>
            {passageTitles[x.id] ?? x.id}
          </button>
        ))}
      </div>
      <div className="toggles">
        <button className={'pill' + (showWylie ? ' on' : '')} aria-pressed={showWylie} onClick={() => setShowWylie(!showWylie)}>
          Wylie
        </button>
        <button className={'pill' + (showZh ? ' on' : '')} aria-pressed={showZh} onClick={() => setShowZh(!showZh)}>
          中文
        </button>
        <button className="pill play-all" onClick={() => play(p.audio)}>
          ▶ 整段
        </button>
      </div>
      <div className="lines">
        {p.lines.map((l, i) => (
          <div className="line" key={i}>
            <div className="line-row">
              <button className="play" onClick={() => play(l.audio)} aria-label="播放这一句">
                ▶
              </button>
              <div className="syls">
                {l.syllables.map((s, j) => (
                  <span key={j} className={'syl' + (picked?.tibetan === s ? ' on' : '')} onClick={() => setPicked(syllableMap.get(s) ?? null)}>
                    <span className="tib big">
                      {s}
                      {j < l.syllables.length - 1 ? '་' : p.lines.length > 1 ? ' །' : ''}
                    </span>
                    {showWylie && <span className="syl-wylie">{syllableMap.get(s)?.wylie ?? ''}</span>}
                  </span>
                ))}
              </div>
            </div>
            {showZh && chinese && p.lines.length === zhLines.length && <div className="zh">{zhLines[i]}</div>}
          </div>
        ))}
        {showZh && chinese && p.lines.length !== zhLines.length && <div className="zh">{chinese}</div>}
        {showZh && !chinese && <p className="muted small">还没有中文译文。请在“设置”里导入中文译文包。</p>}
      </div>
      <p className="muted small">读音为安多音 TTS 自动生成，尚未经人校对。点任一音节查看结构。</p>
      {picked && <SyllableCard s={picked} onClose={() => setPicked(null)} />}
    </section>
  )
}

const PARTS: [keyof Syllable, string][] = [
  ['prefix', '前加字'],
  ['superscript', '上加字'],
  ['root', '基字'],
  ['subscript', '下加字'],
  ['vowel', '元音'],
  ['suffix', '后加字'],
  ['postSuffix', '再后加字'],
  ['particle', '结尾'],
]

function SyllableCard({ s, onClose }: { s: Syllable; onClose: () => void }) {
  const [flagged, setFlagged] = useState(false)
  useEffect(() => {
    play(s.audio)
    db.flags.where({ ref: s.tibetan }).count().then((n) => setFlagged(n > 0))
  }, [s])

  const flag = async () => {
    const note = prompt('哪里有问题？（读音、拼写、结构拆分……）', '') ?? ''
    await db.flags.add({ kind: 'syllable', ref: s.tibetan, note, createdAt: Date.now() })
    setFlagged(true)
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="tib huge tap" onClick={() => play(s.audio)}>{s.tibetan}</div>
        <div className="wylie center">{s.wylie}</div>
        <div className="parts">
          {PARTS.filter(([k]) => s[k]).map(([k, label]) => (
            <div key={k} className={'part tap' + (k === 'root' ? ' root' : '')} onClick={() => k !== 'vowel' && say(String(s[k]))}>
              <div className="tib">{k === 'vowel' ? '◌' + s.vowel : String(s[k])}</div>
              <div className="small">{label}</div>
            </div>
          ))}
        </div>
        {s.needsCheck && <p className="warn small">这个音节的基字判断需要人工确认。</p>}
        <p className="muted small">开篇中出现 {s.count} 次</p>
        <div className="actions">
          <button onClick={() => play(s.audio)}>▶ 再听一遍</button>
          <button onClick={flag}>{flagged ? '已标记 · 再标一次' : '标记有问题'}</button>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

function SettingsView() {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const doExport = async () => {
    const blob = new Blob([JSON.stringify(await exportData(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kunzang-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setMsg('已导出备份文件。')
  }

  const doImport = async (file: File) => {
    try {
      await importData(JSON.parse(await file.text()))
      setMsg('已恢复备份。')
    } catch (e) {
      setMsg('恢复失败：' + (e as Error).message)
    }
  }

  return (
    <section>
      <h1>设置与数据</h1>
      <p>学习记录只保存在这台设备上。{persisted === false && '浏览器尚未允许长期保存，建议把 App 添加到主屏幕，并定期导出备份。'}</p>
      <div className="actions col">
        <button onClick={doExport}>导出学习数据</button>
        <label className="button">
          从备份恢复
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </label>
      </div>
      {msg && <p>{msg}</p>}
      <h2>中文译文</h2>
      <p className="small muted">中文译文有版权，不随网站发布。导入一次后只保存在这台设备上。</p>
      <label className="button">
        导入中文译文包
        <input
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              setMsg(`已导入 ${await importTranslationPack(JSON.parse(await f.text()))} 段译文。`)
            } catch (err) {
              setMsg('导入失败：' + (err as Error).message)
            }
          }}
        />
      </label>
      <h2>关于内容</h2>
      <p className="small muted">
        原文与译文：《大圆满前行·普贤上师言教》，华智仁波切著，索达吉堪布译，德钦·曲美多吉编排藏汉对照版，仅供个人学习。读音：Meta MMS 安多藏语 TTS（mms-tts-adx）生成，未经人工校对。
      </p>
    </section>
  )
}
