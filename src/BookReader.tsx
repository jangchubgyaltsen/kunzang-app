import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { wylieOn } from './prefs.ts'
import { buildChapterQuiz } from './bookQuiz.ts'
import type { Question } from './course.ts'
import { onTrack, play, playRange, playSeq, stop } from './audio.ts'
import { db } from './db.ts'
import { downloadChapter, loadChapter, sentAudio, type BookSent, type BookWord, type Chapter, type ChapterInfo } from './book.ts'
import { yitongOf } from './reading.ts'
import { syllableMap, type Syllable } from './content.ts'
import { glossOf, glossTerms, loadGloss, shortGloss, type WordGloss } from './gloss.ts'
import { alignPara, findTerm, type AlignGroup } from './align.ts'

const PAGE = 20 // 一次排出来的段落数，往下翻再接着排
const POS_KEY = 'reader-pos'

type Dict = Map<string, string>

/** 中文里把释义对应的那几个字标出来 */
function Highlight({ zh, terms }: { zh: string; terms?: string[] }) {
  const at = terms && findTerm(zh, terms)
  if (!at) return <>{zh}</>
  return (
    <>
      {zh.slice(0, at[0])}
      <mark>{zh.slice(at[0], at[1])}</mark>
      {zh.slice(at[1])}
    </>
  )
}

/** 正文一章：逐句播放、整段连读、点词听这个词（整句音频里切那一段）。 */
export function BookChapter({ info, onPick, onQuiz }: { info: ChapterInfo; onPick: (s: Syllable) => void; onQuiz?: (questions: Question[], title: string) => void }) {
  const [ch, setCh] = useState<Chapter | null>(null)
  const [err, setErr] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [showPron, setShowPron] = useState(false)
  const [showZh, setShowZh] = useState(true)
  const [bySent, setBySent] = useState(true)
  const [showGloss, setShowGloss] = useState(true)
  const [dict, setDict] = useState<Dict | null>(null)
  const [zh, setZh] = useState<Map<string, string>>(new Map())
  const [playing, setPlaying] = useState<string | null>(null)
  const [word, setWord] = useState<{ w: BookWord; s: BookSent; zh: string } | null>(null)
  const [dl, setDl] = useState<string>('')
  const [resume, setResume] = useState<string | null>(null)
  const more = useRef<HTMLDivElement>(null)

  useEffect(() => onTrack(setPlaying), [])
  useEffect(() => {
    loadGloss().then(setDict, () => setDict(new Map()))
  }, [])
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

  // 每个词的释义、每段的逐句对照（词表下载好、译文导入了才有）
  const glosses = useMemo(() => {
    const m = new Map<BookSent, WordGloss[]>()
    if (!ch || !dict) return m
    for (const p of ch.paras) for (const s of p.sents) m.set(s, s.words.map((w) => glossOf(dict, w[0])))
    return m
  }, [ch, dict])
  const aligned = useMemo(() => {
    const m = new Map<string, AlignGroup[]>()
    if (!ch || !dict) return m
    for (const p of ch.paras) {
      const z = zh.get(p.id)
      if (!z) continue
      m.set(
        p.id,
        alignPara(
          p.sents.map((s) => ({ syls: s.words.reduce((n, w) => n + w[0].split('་').length, 0), terms: (glosses.get(s) ?? []).map(glossTerms) })),
          z,
        ),
      )
    }
    return m
  }, [ch, dict, zh, glosses])

  if (err) return <p className="warn">{err}。请检查网络后重新打开这一章。</p>
  if (!ch) return <p className="muted">正在下载第 {Number(info.id)} 章…</p>

  return (
    <>
      <div className="toggles">
        <button className={'pill' + (showPron ? ' on' : '')} aria-pressed={showPron} onClick={() => setShowPron(!showPron)}>
          注音
        </button>
        <button className={'pill' + (showGloss ? ' on' : '')} aria-pressed={showGloss} onClick={() => setShowGloss(!showGloss)}>
          释义
        </button>
        <button className={'pill' + (showZh ? ' on' : '')} aria-pressed={showZh} onClick={() => setShowZh(!showZh)}>
          中文
        </button>
        {showZh && zh.size > 0 && (
          <button className={'pill' + (bySent ? ' on' : '')} aria-pressed={bySent} onClick={() => setBySent(!bySent)}>
            逐句对照
          </button>
        )}
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
              {((showZh && bySent && aligned.get(p.id)) || [{ from: 0, to: p.sents.length - 1, zh: '' }]).map((g) => (
                <Fragment key={g.from}>
                  {p.sents.slice(g.from, g.to + 1).map((s) => (
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
                            <span key={j} className={'word' + (word?.s === s && word.w === w ? ' on' : '')} onClick={() => setWord({ w, s, zh: g.zh })}>
                              <span className="tib big">
                                {w[0]}
                                {j < s.words.length - 1 ? '་' : ' །'}
                              </span>
                              {showPron && <span className="pron">{yitongOf(w[0]) ?? ''}</span>}
                              {showGloss && dict && <span className="wgloss">{shortGloss(glosses.get(s)?.[j] ?? {})}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {g.zh && (
                    <div className="zh sent-zh">
                      <Highlight zh={g.zh} terms={word && p.sents.indexOf(word.s) >= g.from && p.sents.indexOf(word.s) <= g.to ? glossTerms(glossOf(dict!, word.w[0])) : undefined} />
                    </div>
                  )}
                </Fragment>
              ))}
              {showZh && !(bySent && aligned.get(p.id)) && zh.get(p.id) && <div className="zh para-zh">{zh.get(p.id)}</div>}
            </div>
          )
        })}
        <div ref={more} />
      </div>
      {shown < ch.paras.length && <p className="muted small center">往下翻继续…</p>}
      {onQuiz && (
        <div className="actions col">
          <button className="primary" onClick={() => onQuiz(buildChapterQuiz(ch, zh), `第 ${Number(info.id)} 章 · 练习`)}>
            做本章练习
          </button>
          <p className="muted small">
            认本章出现的学过的词、在句子里找词{zh.size ? '、选段落的中文意思' : '（导入中文译文后还会考段落意思）'}。
          </p>
        </div>
      )}
      <p className="muted small">
        读音为安多音 TTS 自动生成，尚未人工校对：整句是连读，点词听的是整句里那个词的一段。注音只在开篇出现过的音节上有，其余还没有做。词下面的释义是按全书词表自动查的，标“推测”的还没核对；逐句对照是按长度和词义自动对齐的，译文语序和藏文不同，可能对偏一两句。
      </p>
      {word && <BookWordSheet w={word.w} s={word.s} zh={showZh ? word.zh : ''} dict={dict} onPick={onPick} onClose={() => setWord(null)} />}
    </>
  )
}

function playWord(w: BookWord, s: BookSent) {
  if (s.noAudio) return
  if (w[1] !== undefined && w[2] !== undefined) playRange(sentAudio(s), w[1], w[2] + 0.05)
  else play(sentAudio(s))
}

function BookWordSheet({ w, s, zh, dict, onPick, onClose }: { w: BookWord; s: BookSent; zh: string; dict: Dict | null; onPick: (s: Syllable) => void; onClose: () => void }) {
  useEffect(() => {
    playWord(w, s)
  }, [w, s])
  const tib = w[0]
  const g = dict ? glossOf(dict, tib) : {}
  const yitong = yitongOf(tib)
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="tib huge tap" onClick={() => playWord(w, s)}>
          {tib}
        </div>
        {yitong && <div className="pron center big-pron">{yitong}</div>}
        <GlossBlock g={g} loading={!dict} />
        {zh && (
          <div className="sheet-zh">
            <div className="muted small">这句的中文（自动对齐）</div>
            <Highlight zh={zh} terms={glossTerms(g)} />
          </div>
        )}
        <div className="parts">
          {tib.split('་').map((x, k) => {
            const syl = syllableMap.get(x)
            return (
              <button key={k} className="part" disabled={!syl} onClick={() => syl && onPick(syl)}>
                <div className="tib">{x}</div>
                {wylieOn() && <div className="small">{syl?.wylie ?? ''}</div>}
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

/** 词卡上的释义：词义、原形和助词、或者拆开的几段 */
export function GlossBlock({ g, loading }: { g: WordGloss; loading?: boolean }) {
  if (loading) return <p className="center muted small">正在下载词表…</p>
  return (
    <div className="gloss-block">
      {g.base && (
        <p className="center small">
          <span className="tib">{g.base}</span> + <span className="tib">{g.particle?.tibetan}</span>
        </p>
      )}
      {g.gloss && (
        <p className="center gloss-big">
          {g.gloss}
          {g.uncertain && <span className="tag-unsure">推测</span>}
        </p>
      )}
      {!g.gloss && g.parts && (
        <div className="gloss-parts">
          {g.parts.map((p, k) => (
            <div key={k}>
              <span className="tib">{p.tibetan}</span>　{p.gloss ?? '（词表里还没有）'}
              {p.uncertain && <span className="tag-unsure">推测</span>}
            </div>
          ))}
        </div>
      )}
      {g.particle && <p className="center small muted">词尾 {g.particle.tibetan}：{g.particle.note}</p>}
      {!g.gloss && !g.parts?.some((p) => p.gloss) && <p className="center muted small">词表里还没有这个词，可以看下面这句的中文。</p>}
    </div>
  )
}
