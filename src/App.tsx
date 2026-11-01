import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { passages, passageTitles, syllableMap, type Syllable } from './content.ts'
import { audioStatus, play, playSeq } from './audio.ts'
import { say } from './sound.ts'
import { db, exportData, importData, importTranslationPack } from './db.ts'
import Lesson from './Lesson.tsx'
import Review from './Review.tsx'
import Today from './Today.tsx'
import Practice from './Practice.tsx'
import { AlphabetView, Drill } from './Alphabet.tsx'
import { loadPlan } from './practice.ts'
import { ensureChecks, getPathState, type LevelState, type UnitState } from './progress.ts'
import { PATH, letterAudio, wordMap, type Level, type Track } from './course.ts'
import { type Session } from './session.ts'
import { linesOf, yitongOf, type Token } from './reading.ts'
import { chapters } from './book.ts'
import { BookChapter } from './BookReader.tsx'
import AmdoView from './Amdo.tsx'

type Tab = 'path' | 'alphabet' | 'amdo' | 'reader' | 'review' | 'settings'
export default function App() {
  const [tab, setTab] = useState<Tab>('path')
  const [passageId, setPassageId] = useState('title')
  const [session, setSession] = useState<Session | null>(null)
  // 字母页手动开的字卡。负数表示 150 张全部过一遍
  const [drill, setDrill] = useState(0)
  // 今日练习：每天打开 App 先自动进这个（字卡 → 复习 → 拼读 → 开篇 → 会话），全部做完之前每次打开都会弹出
  const [practice, setPractice] = useState<{ auto: boolean } | null>(null)
  useEffect(() => {
    loadPlan().then((p) => p.done.length < p.steps.length && setPractice((x) => x ?? { auto: true }))
  }, [])
  const busy = session !== null || drill !== 0 || practice !== null

  // 原文页看的是哪一章：'00' 是开篇（逐词版），其余是正文各章
  const [chapterId, setChapterId] = useState('00')
  useEffect(() => {
    db.settings.get('reader-chapter').then((r) => r && setChapterId(String(r.value)))
  }, [])
  const pickChapter = (id: string) => {
    setChapterId(id)
    db.settings.put({ key: 'reader-chapter', value: id })
  }

  const openPassage = (id: string) => {
    setPassageId(id)
    pickChapter('00')
    setTab('reader')
  }

  return (
    <div className="app">
      <main>
        {session !== null &&
          ('level' in session ? (
            <Lesson level={session.level} onExit={() => setSession(null)} />
          ) : (
            <Lesson questions={session.questions} title={session.title} onFinish={session.onFinish} onExit={() => setSession(null)} />
          ))}
        {practice !== null && <Practice auto={practice.auto} onExit={() => setPractice(null)} />}
        {drill !== 0 && <Drill key={drill} all={drill < 0} onExit={() => setDrill(0)} />}
        {!busy && tab === 'alphabet' && <AlphabetView key={drill} onStart={(all) => setDrill(all ? -Date.now() : Date.now())} />}
        {!busy && tab === 'path' && (
          <PathView onOpen={openPassage} onStart={setSession} onPractice={() => setPractice({ auto: false })} />
        )}
        {!busy && tab === 'reader' && <ReaderView passageId={passageId} onSelect={setPassageId} chapterId={chapterId} onChapter={pickChapter} />}
        {!busy && tab === 'amdo' && <AmdoView onStart={setSession} />}
        {!busy && tab === 'review' && <Review onStart={setSession} />}
        {!busy && tab === 'settings' && <SettingsView />}
      </main>
      {!busy && (
        <nav className="tabs">
          {(
            [
              ['path', '路径'],
              ['alphabet', '字母'],
              ['amdo', '资料库'],
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

type PathState = Awaited<ReturnType<typeof getPathState>>
// 路径上只显示拼读线；诵读开篇和安多会话每天排进今日练习
const SIDE_TRACKS: [Track, string][] = [
  ['read', '诵读开篇'],
  ['talk', '安多会话'],
]

function PathView({ onOpen, onStart, onPractice }: { onOpen: (id: string) => void; onStart: (s: Session) => void; onPractice: () => void }) {
  const [st, setSt] = useState<PathState | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const currentRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    getPathState().then(async (s) => {
      setSt(s)
      await ensureChecks(s.units)
    })
  }, [])
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
  }, [st])

  const units = PATH.filter((u) => u.track === 'spell')
  const unitState = new Map(st?.units.map((u) => [u.n, u]))
  // 当前关：优先主线上的下一关；补课关（单元已通过后才加进来的）排在后面
  const open = st ? units.flatMap((u) => u.levels).filter((l) => st.levels.get(l.id)?.status === 'available') : []
  const current = open.find((l) => !st?.levels.get(l.id)?.optional) ?? open[0]

  return (
    <section>
      <Today onPractice={onPractice} />
      <p className="muted small">拼读路径：字母、元音和加字，一关只学两三个新东西。每天的今日练习会带你走一关，想多学可以在这里接着往下点。</p>
      {st && (
        <div className="side-tracks small muted">
          {SIDE_TRACKS.map(([t, label]) => {
            const ls = PATH.filter((u) => u.track === t).flatMap((u) => u.levels)
            const done = ls.filter((l) => st.levels.get(l.id)?.status === 'passed').length
            return (
              <div key={t}>
                {label}：{done} / {ls.length} 关 · 每天在今日练习里学一点
              </div>
            )
          })}
        </div>
      )}
      {units.map((u) => {
        const us = unitState.get(u.n)
        const done = us?.status === 'passed' || us?.status === 'mastered'
        const show = !done || expanded.has(u.n)
        return (
          <div key={u.n} className={'unit-block' + (us?.status === 'locked' ? ' locked' : '')}>
            <div className="unit-head">
              <div>
                <div className="small">单元 {u.n}</div>
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
                <UnitNote st={us} n={u.levels.filter((l) => st?.levels.get(l.id)?.status === 'passed').length} total={u.levels.length} />
              </div>
              <div className="unit-actions">
                {u.passage && (
                  <button className="link small" onClick={() => onOpen(u.passage!)}>
                    读原文
                  </button>
                )}
                {done && (
                  <button
                    className="link small"
                    onClick={() => {
                      const e = new Set(expanded)
                      if (e.has(u.n)) e.delete(u.n)
                      else e.add(u.n)
                      setExpanded(e)
                    }}
                  >
                    {show ? '收起' : '展开'}
                  </button>
                )}
              </div>
            </div>
            {show && (
              <ol className="path">
                {u.levels.map((l, i) => {
                  const ls = st?.levels.get(l.id)
                  const isCur = current?.id === l.id
                  return (
                    <li
                      key={l.id}
                      ref={isCur ? currentRef : undefined}
                      className={nodeClass(ls) + (isCur ? ' current' : '') + (l.kind === 'test' ? ' test' : '')}
                      style={{ '--x': ZIGZAG[i % ZIGZAG.length] } as CSSProperties}
                    >
                      <button className="node" disabled={!ls || ls.status === 'locked'} onClick={() => onStart({ level: l.id })} aria-label={l.title}>
                        {ls?.status === 'locked' ? '🔒' : nodeIcon(l, i)}
                      </button>
                      {(isCur || l.kind === 'test' || ls?.optional) && (
                        <div className="small node-label">{isCur ? `开始：${l.title}` : ls?.optional ? `补课：${l.title}` : l.title}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )
      })}
    </section>
  )
}

const ICON: Record<Level['kind'], string> = { learn: '', practice: '↻', read: '读', line: '句', test: '测', talk: '' }
const STAGE_ICON = { hear: '听', read: '认', say: '说' }
function nodeIcon(l: Level, i: number) {
  if (l.kind === 'talk') return STAGE_ICON[l.stage ?? 'hear']
  if (l.title.endsWith('真人录音')) return l.kind === 'learn' ? '词' : '听'
  return l.kind === 'learn' ? String(i + 1) : ICON[l.kind]
}

function nodeClass(ls?: LevelState) {
  if (!ls) return 'locked'
  return { locked: 'locked', available: 'ready', passed: 'ready passed' }[ls.status]
}

function UnitNote({ st, n, total }: { st?: UnitState; n: number; total: number }) {
  if (!st) return null
  const text = {
    locked: `${total} 关 · 完成前面的关卡后解锁`,
    available: `${n} / ${total} 关`,
    passed: `已通过 · 小测 ${Math.round((st.accuracy ?? 0) * 100)}%`,
    mastered: '已掌握',
  }[st.status]
  return <div className="muted small">{text}</div>
}

// 节点左右错落的偏移量（相对节点宽度）
const ZIGZAG = [0, 0.8, 1.2, 0.8, 0, -0.8, -1.2, -0.8]

function ReaderView({ passageId, onSelect, chapterId, onChapter }: { passageId: string; onSelect: (id: string) => void; chapterId: string; onChapter: (id: string) => void }) {
  const info = chapters.find((c) => c.id === chapterId)
  const [picked, setPicked] = useState<Syllable | null>(null)
  return (
    <section>
      <div className="chips chapters">
        <button className={!info ? 'on' : ''} onClick={() => onChapter('00')}>
          开篇
        </button>
        {chapters.map((c) => (
          <button key={c.id} className={info?.id === c.id ? 'on' : ''} onClick={() => onChapter(c.id)}>
            {Number(c.id)} · {c.zh}
          </button>
        ))}
      </div>
      {info ? <BookChapter key={info.id} info={info} onPick={setPicked} /> : <OpeningReader passageId={passageId} onSelect={onSelect} />}
      {picked && <SyllableCard s={picked} onClose={() => setPicked(null)} />}
    </section>
  )
}

function OpeningReader({ passageId, onSelect }: { passageId: string; onSelect: (id: string) => void }) {
  const [showWylie, setShowWylie] = useState(false)
  const [showPron, setShowPron] = useState(true)
  const [showZh, setShowZh] = useState(true)
  const [picked, setPicked] = useState<Syllable | null>(null)
  const [word, setWord] = useState<Token | null>(null)
  const p = passages.find((x) => x.id === passageId) ?? passages[0]
  const rl = linesOf(p.id)
  const [chinese, setChinese] = useState<string | null>(null)
  useEffect(() => {
    db.translations.get(p.id).then((t) => setChinese(t?.chinese ?? null))
  }, [p.id])
  const zhLines = (chinese ?? '').split(/(?<=[，。！])/).filter(Boolean)

  return (
    <>
      <div className="chips">
        {passages.map((x) => (
          <button key={x.id} className={x.id === p.id ? 'on' : ''} onClick={() => onSelect(x.id)}>
            {passageTitles[x.id] ?? x.id}
          </button>
        ))}
      </div>
      <div className="toggles">
        <button className={'pill' + (showPron ? ' on' : '')} aria-pressed={showPron} onClick={() => setShowPron(!showPron)}>
          注音
        </button>
        <button className={'pill' + (showWylie ? ' on' : '')} aria-pressed={showWylie} onClick={() => setShowWylie(!showWylie)}>
          Wylie
        </button>
        <button className={'pill' + (showZh ? ' on' : '')} aria-pressed={showZh} onClick={() => setShowZh(!showZh)}>
          中文
        </button>
        <button className="pill play-all" onClick={() => playSeq(p.lines.map((l) => l.audio))}>
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
                {(rl[i]?.words ?? []).map((w, j, ws) => (
                  <span key={w.id} className={'word' + (word?.id === w.id ? ' on' : '')} onClick={() => setWord(w)}>
                    <span className="tib big">
                      {w.tibetan}
                      {j < ws.length - 1 ? '་' : p.lines.length > 1 ? ' །' : ''}
                    </span>
                    {showPron && <span className="pron">{w.yitong}</span>}
                    {showWylie && <span className="syl-wylie">{w.tibetan.split('་').map((s) => syllableMap.get(s)?.wylie ?? '').join(' ')}</span>}
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
      <p className="muted small">
        读音为安多音 TTS 自动生成：整句是连读，点词听的是从整句里切出来的那一段。注音是一本通式，按对照表规律推出来，尚未逐个核对。点词看意思和音节结构。
      </p>
      {word && !picked && <WordSheet w={word} onPick={setPicked} onClose={() => setWord(null)} />}
      {picked && <SyllableCard s={picked} onClose={() => setPicked(null)} />}
    </>
  )
}

function WordSheet({ w, onPick, onClose }: { w: Token; onPick: (s: Syllable) => void; onClose: () => void }) {
  useEffect(() => {
    play(w.audio)
  }, [w])
  const gloss = wordMap.get(w.tibetan)?.gloss
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="tib huge tap" onClick={() => play(w.audio)}>
          {w.tibetan}
        </div>
        <div className="pron center big-pron">{w.yitong ?? yitongOf(w.tibetan)}</div>
        {gloss && <p className="center gloss-big">{gloss}</p>}
        <div className="small muted center">点音节看结构</div>
        <div className="parts">
          {w.tibetan.split('་').map((s, k) => (
            <button key={k} className="part" onClick={() => syllableMap.get(s) && onPick(syllableMap.get(s)!)}>
              <div className="tib">{s}</div>
              <div className="small">{syllableMap.get(s)?.wylie}</div>
            </button>
          ))}
        </div>
        <div className="actions">
          <button onClick={() => play(w.audio)}>▶ 再听一遍</button>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
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

// 没声音时用来排查：确认是不是新版本、点一下能不能出声、失败的原因
function SoundCheck() {
  const [res, setRes] = useState('')
  const test = () => {
    setRes('正在播放…')
    play(letterAudio('ཀ'), () => setRes(audioStatus()))
    setTimeout(() => setRes(audioStatus()), 1500)
  }
  return (
    <>
      <h2>声音</h2>
      <p className="small muted">版本 {__BUILD__}。听不到声音时，先确认侧面静音键没打开、音量不是 0，再点下面的按钮。</p>
      <button onClick={test}>声音测试：读 ཀ</button>
      {res && <p className="small">{res}</p>}
    </>
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
      <SoundCheck />
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
