import { useEffect, useState } from 'react'
import { db } from './db.ts'
import { onTrack, play, stop } from './audio.ts'
import { Icon } from './icons.tsx'
import { useReaderPrefs } from './readerPrefs.ts'
import { say } from './sound.ts'
import VerseLine, { playLine } from './VerseLine.tsx'
import { lineKC, loadVerses, pronOf, ritualById, verseData, wordAudio, wordByT, type Ritual, type VLine, type VWord } from './verses.ts'

/**
 * 仪轨页（第一层页签「仪轨」）：颂词库里的仪轨，按课诵阅读器的分类排。
 * 点进一部：逐句排，每句逐词（藏文、安多拼音、这句里的释义），下面是汉义。点词听发音、看释义；
 * 每句前面的圆点：学过了是实心，在学习线上还没学是空心，不在学习线上（咒语等）不画。
 * 显示哪几行收在“Aa”里，和原来的原文页共用一份设置。
 */
export default function RitualView({ ritualId, onOpen }: { ritualId: string | null; onOpen: (id: string | null) => void }) {
  const [ready, setReady] = useState(!!verseData)
  const [err, setErr] = useState(false)
  useEffect(() => {
    loadVerses().then(() => setReady(true), () => setErr(true))
  }, [])
  if (err) return <p className="muted">仪轨数据没下载下来，连上网再打开一次。</p>
  if (!ready) return <p className="muted">载入中…</p>
  const r = ritualId ? ritualById.get(ritualId) : undefined
  return r ? <RitualPage r={r} onBack={() => onOpen(null)} /> : <RitualList onOpen={onOpen} />
}

function RitualList({ onOpen }: { onOpen: (id: string) => void }) {
  const cats = verseData!.cats.filter((c) => verseData!.rituals.some((r) => r.cats.includes(c)))
  const [cat, setCat] = useState(() => localStorage.getItem('ritual-cat') ?? cats[0])
  const [learned, setLearned] = useState<Set<string>>(new Set())
  useEffect(() => {
    db.cards.where('kc').startsWith('J:').primaryKeys().then((ks) => setLearned(new Set(ks as string[])))
  }, [])
  const list = verseData!.rituals.filter((r) => r.cats.includes(cat))
  return (
    <section className="rituals">
      <h1>仪轨</h1>
      <div className="chips">
        {cats.map((c) => (
          <button
            key={c}
            className={c === cat ? 'on' : ''}
            onClick={() => {
              setCat(c)
              localStorage.setItem('ritual-cat', c)
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="shelf">
        {list.map((r) => {
          const lines = r.sections.flatMap((s) => s.lines)
          const kcs = [...new Set(lines.map((l) => lineKC(r.id, l)).filter(Boolean))] as string[]
          const done = kcs.filter((k) => learned.has(k)).length
          return (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)}>
                <span className="grow">
                  <span className="shelf-name">{r.title}</span>
                  <span className="small muted">
                    {lines.length} 句{kcs.length ? ` · 学过 ${done} / ${kcs.length}` : ' · 只读'}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          )
        })}
      </ul>
      <p className="small muted">颂词、汉义、课诵本音译来自喇荣课诵；逐词释义是课诵阅读器里起草的，标“草稿”的还没校对完。词的发音是安多 TTS 合成的。</p>
    </section>
  )
}

function RitualPage({ r, onBack }: { r: Ritual; onBack: () => void }) {
  const [prefs] = useReaderPrefs()
  const [sheet, setSheet] = useState(false)
  const [word, setWord] = useState<{ l: VLine; w: VWord } | null>(null)
  const [learned, setLearned] = useState<Set<string>>(new Set())
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => onTrack(setPlaying), [])
  useEffect(() => {
    db.cards.where('kc').startsWith('J:').primaryKeys().then((ks) => setLearned(new Set(ks as string[])))
    window.scrollTo(0, 0)
  }, [r])
  const multi = r.sections.length > 1
  return (
    <section className="reader">
      <header className="reader-head">
        <button className="back" onClick={onBack} aria-label="返回仪轨列表">
          <Icon name="back" size={22} />
        </button>
        <div className="reader-title">
          <span className="rt-main">{r.title}</span>
          <span className="small muted tib">{r.titleBo}</span>
        </div>
        <button className="aa" onClick={() => setSheet(true)} aria-label="显示设置">
          Aa
        </button>
      </header>
      {r.gloss === 'draft' && <p className="small muted center">逐词释义是草稿，还没校对完</p>}
      <div className="lines reading verse-lines">
        {r.sections.map((s, si) => (
          <div key={si}>
            {multi && s.title && <h3 className="verse-sec">{s.title}</h3>}
            {s.lines.map((l) => {
              const kc = lineKC(r.id, l)
              return (
                <div className="line" key={l.id}>
                  <div className="line-row">
                    <button className="play" onClick={() => playLine(l)} aria-label="逐词听这一句" disabled={!l.w.some((w) => w.a)}>
                      <Icon name="play" size={16} />
                    </button>
                    <VerseLine line={l} show={{ pron: prefs.pron, gloss: prefs.gloss }} onWord={(k) => l.w[k] && setWord({ l, w: l.w[k] })} />
                    <span className={'ldot' + (kc ? (learned.has(kc) ? ' on' : '') : ' none')} title={kc ? (learned.has(kc) ? '学过了' : '还没学') : '不在学习线上'} />
                  </div>
                  {prefs.zh && l.zh && <div className="zh">{l.zh}</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {r.source && <p className="small muted center">出处：{r.source}</p>}
      {word && <WordSheet l={word.l} w={word.w} onClose={() => setWord(null)} />}
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
      {sheet && <DisplaySheet onClose={() => setSheet(false)} />}
    </section>
  )
}

/** 点词：藏文、注音、这句里的意思（和常见的意思不同时也写上）、学过没有、在偈颂里出现几次 */
function WordSheet({ l, w, onClose }: { l: VLine; w: VWord; onClose: () => void }) {
  const info = wordByT.get(w.t)
  const [known, setKnown] = useState<boolean | null>(null)
  useEffect(() => {
    db.cards.get('G:' + w.t).then((c) => setKnown(!!c))
  }, [w])
  const sayIt = () => {
    const a = wordAudio(w.a)
    if (a) play(a)
    else say(w.t)
  }
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="tib huge tap center" onClick={sayIt}>
          {w.t}
        </div>
        <div className="pron center big-pron">{pronOf(w.t)}</div>
        <p className="gloss-big center">{w.g && w.g !== '…' ? w.g : '（没有释义）'}</p>
        {info && info.g !== w.g && <p className="small muted center">常见的意思：{info.g}</p>}
        <p className="small muted center">
          {info ? `偈颂学习线上出现 ${info.n} 次` : '不在学习线上'}
          {known === null ? '' : known ? ' · 已经学过' : info ? ' · 还没学' : ''}
          {!w.a && ' · 这个词还没有发音'}
        </p>
        <div className="sheet-zh">{l.zh}</div>
        <div className="actions">
          {w.a && <button onClick={sayIt}>▶ 再听一遍</button>}
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

/** Aa：显示哪几行 */
function DisplaySheet({ onClose }: { onClose: () => void }) {
  const [p, set] = useReaderPrefs()
  const rows: [keyof typeof p, string, string][] = [
    ['pron', '注音', '安多拼音，按规律推出来，以发音为准'],
    ['gloss', '逐词释义', '每个词下面一行小字'],
    ['zh', '汉义', '课诵本的汉译'],
  ]
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="显示设置">
        <div className="grab" />
        <h2>显示</h2>
        <div className="switches">
          {rows.map(([k, label, note]) => (
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
