import { useEffect, useState } from 'react'
import { passages, passageTitles, syllableMap, type Syllable } from './content.ts'
import { audioStatus, onTrack, play, playSeq, stop } from './audio.ts'
import { say } from './sound.ts'
import { Icon } from './icons.tsx'
import PathList from './PathList.tsx'
import { useReaderPrefs } from './readerPrefs.ts'
import { db, exportData, importData, importTranslationPack, resetProgress } from './db.ts'
import { migrate } from './migrate.ts'
import Lesson from './Lesson.tsx'
import Review from './Review.tsx'
import Today from './Today.tsx'
import Practice from './Practice.tsx'
import { AlphabetView, Drill } from './Alphabet.tsx'
import { letterAudio, type Question } from './course.ts'
import { type Session } from './session.ts'
import { linesOf, yitongOf, type Token } from './reading.ts'
import { chapters } from './book.ts'
import { BookChapter, GlossBlock } from './BookReader.tsx'
import { glossOf, loadGloss, type WordGloss } from './gloss.ts'
import AmdoView from './Amdo.tsx'
import { setWylie, wylieOn } from './prefs.ts'

type Tab = 'today' | 'path' | 'reader' | 'library' | 'me'
// 资料库里分两块：字母表、安多会话教材
type Shelf = 'alphabet' | 'amdo'
const TABS: [Tab, string, Parameters<typeof Icon>[0]['name']][] = [
  ['today', '今天', 'today'],
  ['path', '路径', 'path'],
  ['reader', '原文', 'book'],
  ['library', '资料库', 'library'],
  ['me', '我的', 'me'],
]
export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [shelf, setShelf] = useState<Shelf>('alphabet')
  // 第一次打开：先看一屏欢迎页
  const [welcome, setWelcome] = useState(() => localStorage.getItem('welcomed') !== '1')
  const [passageId, setPassageId] = useState('title')
  const [session, setSession] = useState<Session | null>(null)
  // 字母页手动开的字卡。负数表示 150 张全部过一遍
  const [drill, setDrill] = useState(0)
  // 今日练习：清单在首页「今天」上，点按钮进来一步接一步做
  const [practice, setPractice] = useState(false)
  // 首页从练习回来时重新读一遍清单
  const [homeKey, setHomeKey] = useState(0)
  const busy = session !== null || drill !== 0 || practice

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
  const go = (t: Tab) => {
    setTab(t)
    window.scrollTo(0, 0)
  }

  if (welcome)
    return (
      <div className="app">
        <main>
          <Welcome
            onStart={() => {
              localStorage.setItem('welcomed', '1')
              setWelcome(false)
            }}
          />
        </main>
      </div>
    )

  return (
    <div className="app">
      <main>
        {session !== null &&
          ('level' in session ? (
            <Lesson level={session.level} onExit={() => setSession(null)} />
          ) : (
            <Lesson questions={session.questions} title={session.title} onFinish={session.onFinish} onExit={() => setSession(null)} />
          ))}
        {practice && (
          <Practice
            onExit={() => {
              setPractice(false)
              setHomeKey((k) => k + 1)
              go('today')
            }}
            onRead={() => {
              setPractice(false)
              go('reader')
            }}
          />
        )}
        {drill !== 0 && <Drill key={drill} all={drill < 0} onExit={() => setDrill(0)} />}
        {!busy && tab === 'library' && (
          <div className="chips">
            <button className={shelf === 'alphabet' ? 'on' : ''} onClick={() => setShelf('alphabet')}>
              字母表
            </button>
            <button className={shelf === 'amdo' ? 'on' : ''} onClick={() => setShelf('amdo')}>
              安多会话教材
            </button>
          </div>
        )}
        {!busy && tab === 'library' && shelf === 'alphabet' && <AlphabetView key={drill} onStart={(all) => setDrill(all ? -Date.now() : Date.now())} />}
        {!busy && tab === 'today' && <Today key={homeKey} onPractice={() => setPractice(true)} onPath={() => go('path')} />}
        {!busy && tab === 'path' && <PathList onOpen={openPassage} onStart={setSession} />}
        {!busy && tab === 'reader' && (
          <ReaderView passageId={passageId} onSelect={setPassageId} chapterId={chapterId} onChapter={pickChapter} onQuiz={(questions, title) => setSession({ questions, title })} />
        )}
        {!busy && tab === 'library' && shelf === 'amdo' && <AmdoView onStart={setSession} />}
        {!busy && tab === 'me' && <Review onStart={setSession} />}
        {!busy && tab === 'me' && <SettingsView />}
      </main>
      {!busy && (
        <nav className="tabs">
          {TABS.map(([k, label, icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>
              <Icon name={icon} size={24} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

const POS_KEY = 'reader-pos'
/**
 * 原文页：顶上一个标题，点开是目录（开篇各段 + 14 章，写明读到哪）；显示设置收进“Aa”。
 * 正文居中排，每个词下面是注音和意思；有声音在放时底部出一个播放条，可以停。
 */
function ReaderView({ passageId, onSelect, chapterId, onChapter, onQuiz }: { passageId: string; onSelect: (id: string) => void; chapterId: string; onChapter: (id: string) => void; onQuiz: (questions: Question[], title: string) => void }) {
  const info = chapters.find((c) => c.id === chapterId)
  const [picked, setPicked] = useState<Syllable | null>(null)
  const [sheet, setSheet] = useState<'toc' | 'aa' | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => onTrack(setPlaying), [])
  const pi = passages.findIndex((x) => x.id === passageId)
  const title = info ? `第${CN_NUM[Number(info.id)]}章 · ${info.zh}` : passageTitles[passageId] ?? '开篇'
  const sub = info ? `${info.paras} 段 · ${info.sents} 句` : `开篇 · 第 ${pi + 1} / ${passages.length} 段`
  return (
    <section className="reader">
      <header className="reader-head">
        <span className="head-side" />
        <button className="reader-title" onClick={() => setSheet('toc')} aria-haspopup="dialog">
          <span className="rt-main">
            {title} <Icon name="down" size={14} />
          </span>
          <span className="small muted">{sub}</span>
        </button>
        <button className="aa" onClick={() => setSheet('aa')} aria-label="显示设置">
          Aa
        </button>
      </header>
      {info ? (
        <BookChapter key={info.id} info={info} onPick={setPicked} onQuiz={onQuiz} />
      ) : (
        <OpeningReader passageId={passageId} onSelect={onSelect} onPick={setPicked} />
      )}
      {picked && <SyllableCard s={picked} onClose={() => setPicked(null)} />}
      {playing && (
        <div className="player">
          <span className="eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="grow small">正在播放</span>
          <button className="stop" onClick={() => stop()} aria-label="停止播放">
            <Icon name="stop" size={18} />
          </button>
        </div>
      )}
      {sheet === 'toc' && (
        <Toc
          chapterId={info?.id ?? '00'}
          passageId={passageId}
          onClose={() => setSheet(null)}
          onPassage={(id) => {
            onSelect(id)
            onChapter('00')
            setSheet(null)
            window.scrollTo(0, 0)
          }}
          onChapter={(id) => {
            onChapter(id)
            setSheet(null)
            window.scrollTo(0, 0)
          }}
        />
      )}
      {sheet === 'aa' && <DisplaySheet book={!!info} onClose={() => setSheet(null)} />}
    </section>
  )
}

const CN_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四']

/** 目录：开篇各段和 14 章，每章写明多少句、读到第几段 */
function Toc({ chapterId, passageId, onClose, onPassage, onChapter }: { chapterId: string; passageId: string; onClose: () => void; onPassage: (id: string) => void; onChapter: (id: string) => void }) {
  const [pos, setPos] = useState<Record<string, string>>({})
  useEffect(() => {
    db.settings.get(POS_KEY).then((r) => setPos((r?.value ?? {}) as Record<string, string>))
  }, [])
  const progress = (id: string, paras: number) => {
    const at = pos[id]
    return at ? Math.min(1, Number(at.slice(1)) / Math.max(1, paras)) : 0
  }
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card toc" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="目录">
        <div className="grab" />
        <div className="toc-head">
          <h2>目录</h2>
          <button className="link" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="toc-list">
          <div className={'toc-ch' + (chapterId === '00' ? ' on' : '')}>
            <div className="toc-row">
              <span>开篇</span>
              <span className="small muted">{passages.length} 段 · 有逐词注音</span>
            </div>
            {passages.map((x) => (
              <button key={x.id} className={'toc-sub' + (chapterId === '00' && x.id === passageId ? ' on' : '')} onClick={() => onPassage(x.id)}>
                {passageTitles[x.id] ?? x.id}
              </button>
            ))}
          </div>
          {chapters.map((c) => {
            const p = progress(c.id, Number(pos[c.id] ? c.paras : 0) || c.paras)
            return (
              <button key={c.id} className={'toc-ch toc-row' + (chapterId === c.id ? ' on' : '')} onClick={() => onChapter(c.id)}>
                <span className="grow">
                  第{CN_NUM[Number(c.id)]}章 · {c.zh}
                  {p > 0 && (
                    <span className="meter thin">
                      <i style={{ width: `${Math.max(4, p * 100)}%` }} />
                    </span>
                  )}
                </span>
                <span className="small muted">{c.sents} 句</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Aa：显示哪几行 */
function DisplaySheet({ book, onClose }: { book: boolean; onClose: () => void }) {
  const [p, set] = useReaderPrefs()
  const rows: [keyof typeof p, string, string, boolean][] = [
    ['pron', '注音', book ? '只在开篇出现过的音节上有' : '一本通式注音', true],
    ['gloss', '逐词释义', '每个词下面一行小字', book],
    ['zh', '中文', '需要先在“我的”里导入译文包', true],
    ['bySent', '逐句对照', '中文按句子放到对应的藏文下面', book && p.zh],
    ['wylie', 'Wylie 转写', '', !book && wylieOn()],
  ]
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="显示设置">
        <div className="grab" />
        <h2>显示</h2>
        <div className="switches">
          {rows
            .filter((r) => r[3])
            .map(([k, label, note]) => (
              <label key={k} className="switch-row">
                <span className="grow">
                  <span>{label}</span>
                  {note && <span className="small muted">{note}</span>}
                </span>
                <input type="checkbox" role="switch" checked={p[k]} onChange={(e) => set({ [k]: e.target.checked })} />
              </label>
            ))}
        </div>
      </div>
    </div>
  )
}

function OpeningReader({ passageId, onSelect, onPick }: { passageId: string; onSelect: (id: string) => void; onPick: (s: Syllable) => void }) {
  const [prefs] = useReaderPrefs()
  const [word, setWord] = useState<Token | null>(null)
  const pi = Math.max(0, passages.findIndex((x) => x.id === passageId))
  const p = passages[pi]
  const rl = linesOf(p.id)
  const [chinese, setChinese] = useState<string | null>(null)
  useEffect(() => {
    db.translations.get(p.id).then((t) => setChinese(t?.chinese ?? null))
  }, [p.id])
  const zhLines = (chinese ?? '').split(/(?<=[，。！])/).filter(Boolean)
  const prev = passages[pi - 1]
  const next = passages[pi + 1]
  const goto = (id: string) => {
    onSelect(id)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <div className="meta-row">
        <button className="pill small-pill" onClick={() => playSeq(p.lines.map((l) => l.audio))}>
          <Icon name="play" size={14} /> 整段连读
        </button>
      </div>
      <div className="lines reading">
        {p.lines.map((l, i) => (
          <div className="line" key={i}>
            <div className="line-row">
              <button className="play" onClick={() => play(l.audio)} aria-label="播放这一句">
                <Icon name="play" size={16} />
              </button>
              <div className="syls">
                {(rl[i]?.words ?? []).map((w, j, ws) => (
                  <span key={w.id} className={'word' + (word?.id === w.id ? ' on' : '')} onClick={() => setWord(w)}>
                    <span className="tib big">
                      {w.tibetan}
                      {j < ws.length - 1 ? '་' : p.lines.length > 1 ? ' །' : ''}
                    </span>
                    {prefs.pron && <span className="pron">{w.yitong}</span>}
                    {prefs.wylie && wylieOn() && <span className="syl-wylie">{w.tibetan.split('་').map((s) => syllableMap.get(s)?.wylie ?? '').join(' ')}</span>}
                  </span>
                ))}
              </div>
              <span className="play-space" />
            </div>
            {prefs.zh && chinese && p.lines.length === zhLines.length && <div className="zh">{zhLines[i]}</div>}
          </div>
        ))}
        {prefs.zh && chinese && p.lines.length !== zhLines.length && <div className="zh">{chinese}</div>}
        {prefs.zh && !chinese && <p className="muted small center">还没有中文译文。请在“我的”页最下面导入中文译文包。</p>}
      </div>
      <div className="pager">
        {prev ? (
          <button className="link" onClick={() => goto(prev.id)}>
            ‹ {passageTitles[prev.id]}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button className="link" onClick={() => goto(next.id)}>
            {passageTitles[next.id]} ›
          </button>
        )}
      </div>
      <p className="muted small">
        读音为安多音 TTS 自动生成：整句是连读，点词听的是从整句里切出来的那一段。注音是一本通式，按对照表规律推出来，尚未逐个核对。点词看意思和音节结构。
      </p>
      {word && <WordSheet w={word} onPick={onPick} onClose={() => setWord(null)} />}
    </>
  )
}

function WordSheet({ w, onPick, onClose }: { w: Token; onPick: (s: Syllable) => void; onClose: () => void }) {
  useEffect(() => {
    play(w.audio)
  }, [w])
  const [g, setG] = useState<WordGloss | null>(null)
  useEffect(() => {
    loadGloss().then((d) => setG(glossOf(d, w.tibetan)), () => setG({}))
  }, [w])
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="tib huge tap" onClick={() => play(w.audio)}>
          {w.tibetan}
        </div>
        <div className="pron center big-pron">{w.yitong ?? yitongOf(w.tibetan)}</div>
        <GlossBlock g={g ?? {}} loading={!g} />
        <div className="small muted center">点音节看结构</div>
        <div className="parts">
          {w.tibetan.split('་').map((s, k) => (
            <button key={k} className="part" onClick={() => syllableMap.get(s) && onPick(syllableMap.get(s)!)}>
              <div className="tib">{s}</div>
              {wylieOn() && <div className="small">{syllableMap.get(s)?.wylie}</div>}
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
        {wylieOn() && <div className="wylie center">{s.wylie}</div>}
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

function WylieSetting() {
  const [on, setOn] = useState(wylieOn())
  return (
    <>
      <h2>Wylie 转写</h2>
      <p className="small muted">用拉丁字母拼写藏文的方法（如 ཀློང་ཆེན 写成 klong chen）。只学念诵和读懂的话用不上，默认不显示，也不出转写题。</p>
      <label className="small">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setWylie(e.target.checked)
            setOn(e.target.checked)
          }}
        />{' '}
        显示转写、出转写题
      </label>
    </>
  )
}

/** 第一次打开时的欢迎页：一句话说清这个 App 怎么用 */
function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <section className="welcome">
      <div className="tib huge center">ཀུན་བཟང་</div>
      <h1 className="center">普贤上师言教 · 藏文学习</h1>
      <p>从零开始学安多音的藏文拼读，最后能跟着念、读懂《普贤上师言教》的原文。</p>
      <ul>
        <li>
          <b>每天做一次“今日练习”</b>：打开 App 首页就是今天要做的几步，点按钮一步接一步做。字卡、复习、拼读一关，再加一点原文和安多会话，大约 15–20 分钟。字卡做完就算签到。
        </li>
        <li>
          <b>开着声音</b>：读音都靠听。字母、元音和会话是老师的真人录音。
        </li>
        <li>
          <b>答错没关系</b>：第一次选错会给提示再选一次，错过的过几天会再出。
        </li>
        <li>
          <b>记录只存在这台设备上</b>：可以在“我的”里导出备份。
        </li>
      </ul>
      <button className="primary" onClick={onStart}>
        开始第一天
      </button>
    </section>
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
      await migrate()
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
      <WylieSetting />
      <SoundCheck />
      <h2>重新开始</h2>
      <p className="small muted">清空全部学习进度：路径关卡、字卡和复习记录、抽查、签到。中文译文和标记的问题保留。建议先导出一份备份。</p>
      <button
        className="danger"
        onClick={async () => {
          if (!confirm('确定要清空全部学习进度吗？清空后无法撤销，除非从备份恢复。')) return
          await resetProgress()
          location.reload()
        }}
      >
        重置学习进度
      </button>
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
