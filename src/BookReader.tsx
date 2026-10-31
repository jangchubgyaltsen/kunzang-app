import { useEffect, useRef, useState } from 'react'
import { onTrack, play, playRange, playSeq, stop } from './audio.ts'
import { db } from './db.ts'
import { downloadChapter, loadChapter, sentAudio, type BookSent, type BookWord, type Chapter, type ChapterInfo } from './book.ts'
import { yitongOf } from './reading.ts'
import { wordMap } from './course.ts'
import { syllableMap, type Syllable } from './content.ts'

const PAGE = 20 // 一次排出来的段落数，往下翻再接着排
const POS_KEY = 'reader-pos'

/** 正文一章：逐句播放、整段连读、点词听这个词（整句音频里切那一段）。 */
export function BookChapter({ info, onPick }: { info: ChapterInfo; onPick: (s: Syllable) => void }) {
  const [ch, setCh] = useState<Chapter | null>(null)
  const [err, setErr] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [showPron, setShowPron] = useState(false)
  const [showZh, setShowZh] = useState(true)
  const [zh, setZh] = useState<Map<string, string>>(new Map())
  const [playing, setPlaying] = useState<string | null>(null)
  const [word, setWord] = useState<{ w: BookWord; s: BookSent } | null>(null)
  const [dl, setDl] = useState<string>('')
  const [resume, setResume] = useState<string | null>(null)
  const more = useRef<HTMLDivElement>(null)

  useEffect(() => onTrack(setPlaying), [])
  useEffect(() => () => stop(), [info.id])

  useEffect(() => {
    // 换章时组件会按章重建（key），这里不用清旧状态
    let live = true
    loadChapter(info.id)
      .then(async (c) => {
        if (!live) return
        setCh(c)
        const ids = c.paras.map((p) => p.id)
        const rows = await db.translations.bulkGet(ids)
        if (live) setZh(new Map(rows.flatMap((r) => (r ? [[r.id, r.chinese] as [string, string]] : []))))
        const pos = ((await db.settings.get(POS_KEY))?.value ?? {}) as Record<string, string>
        const at = pos[info.id]
        const k = at ? ids.indexOf(at) : -1
        if (live && k > 0) setResume(at)
      })
      .catch((e) => live && setErr((e as Error).message))
    return () => {
      live = false
    }
  }, [info.id])

  // 滚到底部附近时再多排一些段落
  useEffect(() => {
    const el = more.current
    if (!el || !ch) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setShown((n) => n + PAGE), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ch, shown])

  const remember = async (paraId: string) => {
    const pos = ((await db.settings.get(POS_KEY))?.value ?? {}) as Record<string, string>
    await db.settings.put({ key: POS_KEY, value: { ...pos, [info.id]: paraId } })
  }

  const jumpTo = (paraId: string) => {
    if (!ch) return
    const k = ch.paras.findIndex((p) => p.id === paraId)
    setShown(Math.max(shown, k + PAGE))
    setResume(null)
    requestAnimationFrame(() => document.getElementById('para-' + paraId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const download = async () => {
    if (!ch) return
    setDl('0%')
    await downloadChapter(ch, (d, t) => setDl(d === t ? '本章音频已存到这台设备' : `${Math.floor((d / t) * 100)}%`))
  }

  if (err) return <p className="warn">{err}。请检查网络后重新打开这一章。</p>
  if (!ch) return <p className="muted">正在下载第 {Number(info.id)} 章…</p>

  return (
    <>
      <div className="toggles">
        <button className={'pill' + (showPron ? ' on' : '')} aria-pressed={showPron} onClick={() => setShowPron(!showPron)}>
          注音
        </button>
        <button className={'pill' + (showZh ? ' on' : '')} aria-pressed={showZh} onClick={() => setShowZh(!showZh)}>
          中文
        </button>
        <button className="pill play-all" onClick={download} disabled={dl.endsWith('%')}>
          {dl === '' ? '⤓ 离线听本章' : dl}
        </button>
      </div>
      <p className="muted small">
        <span className="tib">{info.tibetan}</span> · {ch.paras.length} 段 · {info.sents} 句
      </p>
      {resume && (
        <button className="resume" onClick={() => jumpTo(resume)}>
          接着上次读的地方 →
        </button>
      )}
      {showZh && zh.size === 0 && <p className="muted small">还没有这部分的中文译文。请在“设置”里导入全书中文译文包。</p>}
      <div className="lines book">
        {ch.paras.slice(0, shown).map((p) => {
          const withAudio = p.sents.filter((s) => !s.noAudio)
          return (
            <div className="para" key={p.id} id={'para-' + p.id}>
              <div className="para-head">
                <span className="muted small">{Number(p.id.slice(1))}</span>
                {withAudio.length > 1 && (
                  <button
                    className="pill small-pill"
                    onClick={() => {
                      remember(p.id)
                      playSeq(withAudio.map(sentAudio))
                    }}
                  >
                    ▶ 整段
                  </button>
                )}
              </div>
              {p.sents.map((s) => (
                <div className={'line' + (playing === sentAudio(s) ? ' now' : '')} key={s.id}>
                  <div className="line-row">
                    <button
                      className="play"
                      disabled={s.noAudio}
                      onClick={() => {
                        remember(p.id)
                        play(sentAudio(s))
                      }}
                      aria-label="播放这一句"
                    >
                      ▶
                    </button>
                    <div className="syls">
                      {s.words.map((w, j) => (
                        <span key={j} className={'word' + (word?.s === s && word.w === w ? ' on' : '')} onClick={() => setWord({ w, s })}>
                          <span className="tib big">
                            {w[0]}
                            {j < s.words.length - 1 ? '་' : ' །'}
                          </span>
                          {showPron && <span className="pron">{yitongOf(w[0]) ?? ''}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {showZh && zh.get(p.id) && <div className="zh para-zh">{zh.get(p.id)}</div>}
            </div>
          )
        })}
        <div ref={more} />
      </div>
      {shown < ch.paras.length && <p className="muted small center">往下翻继续…</p>}
      <p className="muted small">
        读音为安多音 TTS 自动生成，尚未人工校对：整句是连读，点词听的是整句里那个词的一段。注音只在开篇出现过的音节上有，其余还没有做。
      </p>
      {word && <BookWordSheet w={word.w} s={word.s} onPick={onPick} onClose={() => setWord(null)} />}
    </>
  )
}

function playWord(w: BookWord, s: BookSent) {
  if (s.noAudio) return
  if (w[1] !== undefined && w[2] !== undefined) playRange(sentAudio(s), w[1], w[2] + 0.05)
  else play(sentAudio(s))
}

function BookWordSheet({ w, s, onPick, onClose }: { w: BookWord; s: BookSent; onPick: (s: Syllable) => void; onClose: () => void }) {
  useEffect(() => {
    playWord(w, s)
  }, [w, s])
  const tib = w[0]
  const gloss = wordMap.get(tib)?.gloss
  const yitong = yitongOf(tib)
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="tib huge tap" onClick={() => playWord(w, s)}>
          {tib}
        </div>
        {yitong && <div className="pron center big-pron">{yitong}</div>}
        {gloss && <p className="center gloss-big">{gloss}</p>}
        <div className="parts">
          {tib.split('་').map((x, k) => {
            const syl = syllableMap.get(x)
            return (
              <button key={k} className="part" disabled={!syl} onClick={() => syl && onPick(syl)}>
                <div className="tib">{x}</div>
                <div className="small">{syl?.wylie ?? ''}</div>
              </button>
            )
          })}
        </div>
        <div className="actions">
          <button onClick={() => playWord(w, s)}>▶ 再听这个词</button>
          <button onClick={() => play(sentAudio(s))} disabled={s.noAudio}>
            ▶ 听整句
          </button>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
