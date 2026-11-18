import { useEffect, useState } from 'react'
import { audioStatus, play } from './audio.ts'
import { Icon } from './icons.tsx'
import ProgressView from './Progress.tsx'
import { db, exportData, importData, resetProgress } from './db.ts'
import { migrate } from './migrate.ts'
import Lesson from './Lesson.tsx'
import Review from './Review.tsx'
import Today from './Today.tsx'
import Practice from './Practice.tsx'
import { AlphabetView, Drill } from './Alphabet.tsx'
import { letterAudio } from './course.ts'
import { type Session } from './session.ts'
import AmdoView, { type Part as AmdoPart } from './Amdo.tsx'
import { retention, RETENTION_LEVELS, setRetention, setWylie, wylieOn } from './prefs.ts'
import PronGuide from './PronGuide.tsx'
import RitualView from './Rituals.tsx'

/**
 * 界面最多三层：
 * 第一层是底部三个页签：今天（练习 + 学习进度）、仪轨（偈颂逐句逐词）、资料。
 * 第二层是从页签点进去的一页（详细进度、设置、资料里的一项、目录），顶上有返回。
 * 第三层是在第二层里打开的东西（一课课文、一次练习、流利度测验）。
 */
type Tab = 'today' | 'reader' | 'library'
type Page = 'progress' | 'settings' | 'alphabet' | 'pron' | AmdoPart
const TABS: [Tab, string, Parameters<typeof Icon>[0]['name']][] = [
  ['today', '今天', 'today'],
  ['reader', '仪轨', 'book'],
  ['library', '资料', 'library'],
]
const PAGE_TITLE: Record<Page, string> = {
  progress: '详细进度',
  settings: '设置',
  alphabet: '字母表',
  pron: '注音怎么读',
  talk: '安多会话 300 句',
  words: '单词',
  spell: '拼读表',
  lessons: '课文',
}
/** 资料页：一张清单，每项点进去是第二层 */
const SHELF: [Page, string, string][] = [
  ['alphabet', '字母表', '30 个字母、元音、形近字、字母元音组合表'],
  ['talk', '安多会话 300 句', '按组听真人录音，可以单独练一组'],
  ['words', '单词', '教材单词表，按页翻看'],
  ['spell', '拼读表', '教材的拼读表，点格子听录音'],
  ['lessons', '课文', '第 11–36 课，课本页面点哪段播哪段'],
  ['pron', '注音怎么读', '安多拼音和普通话拼音不一样的几处'],
]

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [page, setPage] = useState<Page | null>(null)
  // 第一次打开：先看一屏欢迎页
  const [welcome, setWelcome] = useState(() => localStorage.getItem('welcomed') !== '1')
  const [session, setSession] = useState<Session | null>(null)
  // 字母页手动开的字卡。负数表示 150 张全部过一遍
  const [drill, setDrill] = useState(0)
  // 今日练习：清单在首页「今天」上，点按钮进来一步接一步做
  const [practice, setPractice] = useState(false)
  // 首页从练习回来时重新读一遍清单
  const [homeKey, setHomeKey] = useState(0)
  const busy = session !== null || drill !== 0 || practice

  // 仪轨页打开的是哪一部（null 是列表）
  const [ritualId, setRitualId] = useState<string | null>(null)
  useEffect(() => {
    db.settings.get('ritual-open').then((r) => r && setRitualId((r.value as string | null) ?? null))
  }, [])
  const openRitual = (id: string | null) => {
    setRitualId(id)
    db.settings.put({ key: 'ritual-open', value: id })
    window.scrollTo(0, 0)
  }

  const go = (t: Tab) => {
    setTab(t)
    setPage(null)
    window.scrollTo(0, 0)
  }
  const open = (p: Page) => {
    setPage(p)
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

  const show = !busy
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

        {show && page && (
          <header className="sub-head">
            <button className="back" onClick={() => setPage(null)} aria-label="返回">
              <Icon name="back" size={22} />
              <span>{tab === 'today' ? '今天' : '资料'}</span>
            </button>
            <h1>{PAGE_TITLE[page]}</h1>
          </header>
        )}
        {show && page === 'progress' && (
          <ProgressView
            onRead={(id) => {
              openRitual(id)
              go('reader')
            }}
          />
        )}
        {show && page === 'settings' && <SettingsView onStart={setSession} />}
        {show && page === 'alphabet' && <AlphabetView key={drill} onStart={(all) => setDrill(all ? -Date.now() : Date.now())} />}
        {show && page === 'pron' && <PronGuide open />}
        {show && (page === 'talk' || page === 'words' || page === 'spell' || page === 'lessons') && <AmdoView part={page} onStart={setSession} />}

        {show && !page && tab === 'today' && <Today key={homeKey} onPractice={() => setPractice(true)} onDetail={() => open('progress')} onSettings={() => open('settings')} />}
        {show && !page && tab === 'reader' && <RitualView ritualId={ritualId} onOpen={openRitual} />}
        {show && !page && tab === 'library' && <Library onOpen={open} />}
      </main>
      {show && (
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

/** 资料（第一层）：一张清单。具体内容都在第二层 */
function Library({ onOpen }: { onOpen: (p: Page) => void }) {
  return (
    <section className="library">
      <h1>资料</h1>
      <p className="small muted">每天的练习会按进度学到这些。这里用来单独翻看、多练。字母、元音和会话都是安多话真人录音。</p>
      <ul className="shelf">
        {SHELF.map(([k, name, note]) => (
          <li key={k}>
            <button onClick={() => onOpen(k)}>
              <span className="grow">
                <span className="shelf-name">{name}</span>
                <span className="small muted">{note}</span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function WylieSetting() {
  const [on, setOn] = useState(wylieOn())
  return (
    <>
      <h2>Wylie 转写</h2>
      <p className="small muted">用拉丁字母逐个字母拼写藏文的方法（如 ཀློང་ཆེན 写成 klong chen），写的是字怎么拼，不是安多话怎么念。读音看藏文下面的类拼音注音就行（见“资料 · 注音怎么读”）。Wylie 默认不显示，也不出转写题；查词典、对照别的资料时可以打开。</p>
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
      <h1 className="center">仪轨偈颂 · 藏文学习</h1>
      <p>从零开始学安多音的藏文拼读，然后一句一句学常念的仪轨偈颂：每句先把词一个个拆开学，再看整句的意思，最后背下来。也能说几句安多话。</p>
      <ul>
        <li>
          <b>每天点一次“开始”</b>：大约 15 分钟，三段——卡片（复习和新内容混在一起）、安多会话 3 句、偈颂 1–3 句。卡片做完就算签到。
        </li>
        <li>
          <b>开着声音</b>：读音都靠听。字母、元音和会话是老师的真人录音。
        </li>
        <li>
          <b>先想，再看答案</b>：复习时多数卡片不给选项，先自己想意思、念出来，再翻面对照，自己打分。想不起来的会早点再出。
        </li>
        <li>
          <b>记录只存在这台设备上</b>：可以在设置里导出备份。
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

/** 记忆强度：FSRS 的目标记住率 */
function RetentionSetting() {
  const [ret, setRet] = useState(retention())
  return (
    <>
      <h2>记忆强度</h2>
      <p className="small muted">复习间隔按这个目标排：要求越高，每天复习越多，忘得越少。</p>
      <div className="ret-seg">
        {RETENTION_LEVELS.map(([r, name, desc]) => (
          <button
            key={r}
            className={ret === r ? 'on' : ''}
            onClick={() => {
              setRetention(r)
              setRet(r)
            }}
          >
            <b>{name}</b>
            <span className="small muted">{desc}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** 设置（第二层，首页右上角进来）：多复习一次、记忆强度、显示、数据、标记过的问题 */
function SettingsView({ onStart }: { onStart: (s: Session) => void }) {
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
    <section className="settings">
      <Review onStart={onStart} />
      <RetentionSetting />
      <WylieSetting />
      <SoundCheck />
      <h2>学习数据</h2>
      <p className="small muted">学习记录只保存在这台设备上。{persisted === false && '浏览器尚未允许长期保存，建议把 App 添加到主屏幕，并定期导出备份。'}</p>
      <div className="actions col">
        <button onClick={doExport}>导出学习数据</button>
        <label className="button">
          从备份恢复
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </label>
      </div>
      {msg && <p>{msg}</p>}
      <h2>重新开始</h2>
      <p className="small muted">清空全部学习进度：卡片和复习记录、签到。标记的问题保留。建议先导出一份备份。</p>
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
      <h2>关于内容</h2>
      <p className="small muted">
        仪轨偈颂：藏文、汉译和课诵本音译来自喇荣课诵（2024-05-02 版），逐词释义取自「藏汉课诵阅读器」的颂词库，是草稿、还在校对，仅供个人学习。偈颂词的读音：Meta MMS 安多藏语 TTS（mms-tts-adx）合成，按词挑选过。字母、元音和会话是《安多方言会话教材》的真人录音。
      </p>
    </section>
  )
}
