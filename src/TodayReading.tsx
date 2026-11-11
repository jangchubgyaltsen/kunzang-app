import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Rating } from 'ts-fsrs'
import { chapters, loadChapter, sentAudio, type BookPara } from './book.ts'
import { onTrack, play, playSeq, stop } from './audio.ts'
import { db } from './db.ts'
import { fwordMap, fwords } from './fwords.ts'
import { learnedF, loadVocab } from './vocab.ts'
import { glossOf, loadGloss, shortGloss } from './gloss.ts'
import { recordAnswer } from './progress.ts'
import { useSaying } from './karaoke.ts'
import { shuffle } from './course.ts'
import { Icon } from './icons.tsx'
import { dayKey } from './daily.ts'

/**
 * 今天的一段：有声精读原文，固定五步。
 * 1 听：放整段，屏幕上逐词高亮；2 自己读：点不认识的词，看释义，常见的词自动加进卡片；
 * 3 跟读：再听一遍，跟着小声读；4 看中文（导入了译文才有）；5 一道题。
 * 段落按全书顺序往下走（每段 2–8 句），也可以换成“认识的词最多”的一段。
 */
type Pick = { date: string; ch: string; para: string }
const PICK_KEY = 'today-para'
const POINTER_KEY = 'read-pointer'
const STEPS = ['听', '自己读', '跟读', '中文', '一道题']

const okPara = (p: BookPara) => p.sents.length >= 1 && p.sents.length <= 8 && p.sents.every((s) => !s.noAudio)

async function nextPara(fromCh: string, fromPara?: string): Promise<{ ch: string; para: BookPara } | undefined> {
  const start = Math.max(0, chapters.findIndex((c) => c.id === fromCh))
  for (const info of chapters.slice(start)) {
    const c = await loadChapter(info.id)
    const k = info.id === fromCh && fromPara ? c.paras.findIndex((p) => p.id === fromPara) + 1 : 0
    const p = c.paras.slice(k).find(okPara)
    if (p) return { ch: info.id, para: p }
  }
}

const knownShare = (p: BookPara, known: Set<string>) => {
  const ws = p.sents.flatMap((s) => s.words.map((w) => w[0]))
  return ws.filter((w) => known.has(w)).length / Math.max(1, ws.length)
}

export default function TodayReading({ onExit, onComplete, footer }: { onExit: () => void; onComplete: () => void; footer?: ReactNode }) {
  const [para, setPara] = useState<BookPara | null>(null)
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [dict, setDict] = useState<Map<string, string> | null>(null)
  const [zh, setZh] = useState<string | undefined>()
  const [step, setStep] = useState(0)
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [peek, setPeek] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => onTrack(setPlaying), [])
  useEffect(() => () => stop(), [])
  useEffect(() => {
    ;(async () => {
      try {
        await loadVocab()
        setDict(await loadGloss())
        setKnown(await learnedF())
        const saved = (await db.settings.get(PICK_KEY))?.value as Pick | undefined
        let pick: { ch: string; para: BookPara } | undefined
        if (saved?.date === dayKey()) {
          const c = await loadChapter(saved.ch)
          const p = c.paras.find((x) => x.id === saved.para)
          if (p) pick = { ch: saved.ch, para: p }
        }
        if (!pick) {
          const ptr = (await db.settings.get(POINTER_KEY))?.value as { ch: string; para: string } | undefined
          pick = await nextPara(ptr?.ch ?? chapters[0].id, ptr?.para)
          if (!pick) pick = await nextPara(chapters[0].id)
          if (pick) await db.settings.put({ key: PICK_KEY, value: { date: dayKey(), ch: pick.ch, para: pick.para.id } satisfies Pick })
        }
        if (!pick) return setErr('没找到合适的段落')
        setPara(pick.para)
        setZh((await db.translations.get(pick.para.id))?.chinese)
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [])

  /** 换成同一章里接下来 40 段中认识的词最多的一段 */
  const easier = async () => {
    const saved = (await db.settings.get(PICK_KEY))?.value as Pick
    const c = await loadChapter(saved.ch)
    const k = c.paras.findIndex((p) => p.id === saved.para)
    const cands = c.paras.slice(k, k + 40).filter(okPara)
    const best = cands.sort((a, b) => knownShare(b, known) - knownShare(a, known))[0]
    if (!best || best.id === para?.id) return
    await db.settings.put({ key: PICK_KEY, value: { ...saved, para: best.id } })
    setPara(best)
    setZh((await db.translations.get(best.id))?.chinese)
    setStep(0)
  }

  const quiz = useMemo(() => {
    if (!para) return null
    const ws = [...new Set(para.sents.flatMap((s) => s.words.map((w) => w[0])))].filter((w) => fwordMap.has(w) && fwordMap.get(w)!.short !== '（虚词）')
    const pool = ws.filter((w) => known.has(w))
    const w = shuffle(pool.length ? pool : ws)[0]
    if (!w) return null
    const f = fwordMap.get(w)!
    const others = shuffle(fwords.filter((x) => x.w !== w && x.short !== f.short && x.short !== '（虚词）').slice(0, 300)).slice(0, 3)
    return { w, answer: f.short, options: shuffle([f.short, ...others.map((x) => x.short)]) }
  }, [para, known])
  const [chosen, setChosen] = useState<string | null>(null)

  if (err) return <section className="lesson"><p className="warn">{err}。请检查网络后再试。</p><button onClick={onComplete}>跳过</button></section>
  if (!para || !dict) return <section className="lesson">载入今天的一段…</section>

  const all = para.sents.flatMap((s) => s.words.map((w) => w[0]))
  const share = knownShare(para, known)
  const playAll = () => playSeq(para.sents.map(sentAudio))

  const finish = async () => {
    // 点过“不认识”的常见词，加进卡片（明天开始复习）
    for (const w of marked) if (fwordMap.has(w)) await recordAnswer('F:' + w, false, undefined, 'read', Rating.Again, { kind: 'read' })
    const saved = (await db.settings.get(PICK_KEY))?.value as Pick
    await db.settings.put({ key: POINTER_KEY, value: { ch: saved.ch, para: saved.para } })
    setFinished(true)
    onComplete()
  }

  if (finished)
    return (
      <section className="lesson summary">
        <h1>今天的一段读完了</h1>
        <p className="muted">{marked.size ? `点过的 ${[...marked].filter((w) => fwordMap.has(w)).length} 个常见词已经加进卡片。` : '明天接着读下一段。'}</p>
        {footer}
      </section>
    )

  return (
    <section className="lesson today-read">
      <div className="lesson-top">
        <button className="link" onClick={onExit} aria-label="先到这里">✕</button>
        <div className="steps-dots">
          {STEPS.map((x, k) => (
            <span key={x} className={k === step ? 'on' : k < step ? 'done' : ''}>{x}</span>
          ))}
        </div>
      </div>
      <div className="small muted">
        今天的一段 · 第 {Number(para.id.slice(1))} 段 · 你认识其中 {Math.round(share * 100)}% 的词
        {step === 0 && (
          <button className="link small" onClick={easier}>
            换一段认识得多的
          </button>
        )}
      </div>

      <div className="lines book reading">
        {para.sents.map((s) => (
          <Sent key={s.id} s={s} playing={playing} dict={dict} showGloss={step >= 3} marked={marked} known={known} markMode={step === 1}
            onWord={(w) => {
              if (step !== 1) return
              setPeek(w)
              setMarked((m) => {
                const n = new Set(m)
                if (n.has(w)) n.delete(w)
                else n.add(w)
                return n
              })
            }}
          />
        ))}
      </div>

      {step === 0 && (
        <>
          <p className="small muted">先听整段，眼睛跟着高亮的词走。可以多听几遍。</p>
          <div className="two">
            <button onClick={playAll}><Icon name="play" size={16} /> 听整段</button>
            <button className="primary" onClick={() => { stop(); setStep(1) }}>听完了</button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <p className="small muted">不放声音，自己从头读一遍。不认识的词点一下（再点取消），会显示意思；常见的词读完后加进卡片。</p>
          {peek && (
            <div className="feedback hint">
              <span className="tib">{peek}</span>　{shortGloss(glossOf(dict, peek)) || '（词表里没有）'}
              {!fwordMap.has(peek) && <span className="small muted">　不常见，不加卡</span>}
            </div>
          )}
          <button className="primary" onClick={() => setStep(2)}>读完了{marked.size ? `（点了 ${marked.size} 个）` : ''}</button>
        </>
      )}
      {step === 2 && (
        <>
          <p className="small muted">再听一遍，这次跟着小声读出来，尽量跟上声音。</p>
          <div className="two">
            <button onClick={playAll}><Icon name="play" size={16} /> 再听一遍</button>
            <button className="primary" onClick={() => { stop(); setStep(3) }}>跟读完了</button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          {zh ? <div className="zh sent-zh">{zh}</div> : <p className="small muted">还没有中文译文（首页右上角“设置”里可以导入全书译文包）。词下面的小字是释义。</p>}
          <button className="primary" onClick={() => setStep(quiz ? 4 : 5)}>下一步</button>
        </>
      )}
      {step === 4 && quiz && (
        <>
          <div className="prompt">
            <div className="ask">这一段里的 <span className="tib">{quiz.w}</span> 是什么意思？</div>
          </div>
          <div className="options one">
            {quiz.options.map((o) => (
              <button key={o} className={'opt gloss' + (chosen ? (o === quiz.answer ? ' right' : o === chosen ? ' wrong' : ' dim') : '')}
                onClick={async () => {
                  if (chosen) return
                  setChosen(o)
                  if (known.has(quiz.w)) await recordAnswer('F:' + quiz.w, o === quiz.answer, undefined, 'read', o === quiz.answer ? Rating.Good : Rating.Again, { kind: 'meaning' })
                }}
              >
                {o}
              </button>
            ))}
          </div>
          {chosen && <button className="primary" onClick={finish}>完成</button>}
        </>
      )}
      {step === 5 && <button className="primary" onClick={finish}>完成</button>}
      <p className="small muted">{all.length} 个词 · {para.sents.length} 句</p>
    </section>
  )
}

function Sent({ s, playing, dict, showGloss, marked, known, markMode, onWord }: {
  s: BookPara['sents'][number]; playing: string | null; dict: Map<string, string>; showGloss: boolean; marked: Set<string>; known: Set<string>; markMode: boolean; onWord: (w: string) => void
}) {
  const id = sentAudio(s)
  const saying = useSaying(playing === id ? id : null, s.words)
  return (
    <div className={'line' + (playing === id ? ' now' : '')}>
      <div className="line-row">
        <button className="play" onClick={() => play(id)} aria-label="播放这一句"><Icon name="play" size={16} /></button>
        <div className="syls">
          {s.words.map((w, j) => (
            <span key={j} className={'word' + (saying === j ? ' say' : '') + (marked.has(w[0]) ? ' marked' : '') + (markMode && known.has(w[0]) ? ' known' : '')} onClick={() => onWord(w[0])}>
              <span className="tib big">{w[0]}{j < s.words.length - 1 ? '་' : ' །'}</span>
              {showGloss && <span className="wgloss">{shortGloss(glossOf(dict, w[0]))}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
