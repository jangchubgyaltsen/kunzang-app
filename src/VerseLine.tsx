import { useEffect, useRef, useState } from 'react'
import { onTrack, play, playSeq } from './audio.ts'
import { maskedSyl, pronOf, wordAudio, type VLine } from './verses.ts'
import { say } from './sound.ts'
import { Icon } from './icons.tsx'
import './verse.css'

/**
 * 一句偈颂：逐词排，每个词下面是安多拼音和这句里的释义（「科判颂词背诵器」的逐词对照）。
 * 点词听这个词的发音；「逐词听」把这句的词一个接一个放，正在放的词高亮。
 * mask：遮字背诵，遮住的音节字是透明的（位置还在），点一下偷看这个音节。
 */
export type Show = { pron: boolean; gloss: boolean }

/** 这句的词：没有逐词数据的句子（咒语）就一个音节一组 */
function groups(l: VLine) {
  if (l.w.length) return l.w
  return l.syl.map((t, i) => ({ t, g: '', s: i, n: 1, a: undefined as string | undefined }))
}

export function useSayingWord(l: VLine) {
  const [on, setOn] = useState(-1)
  const last = useRef(-1)
  useEffect(
    () =>
      onTrack((id) => {
        if (!id) {
          last.current = -1
          return setOn(-1)
        }
        const ws = groups(l)
        // 同一个词在一句里出现两次：从上一个高亮的后面找
        let i = ws.findIndex((w, k) => k > last.current && wordAudio(w.a) === id)
        if (i < 0) i = ws.findIndex((w) => wordAudio(w.a) === id)
        last.current = i
        setOn(i)
      }),
    [l],
  )
  return on
}

export function playLine(l: VLine) {
  const ids = groups(l)
    .map((w) => wordAudio(w.a))
    .filter((x): x is string => !!x)
  if (ids.length) playSeq(ids)
}

export default function VerseLine({ line, show = { pron: true, gloss: true }, mask, big, onWord }: { line: VLine; show?: Show; mask?: 0 | 2 | 3; big?: boolean; onWord?: (i: number) => void }) {
  const on = useSayingWord(line)
  const hid = mask !== undefined ? maskedSyl(line, mask) : null
  const [peek, setPeek] = useState<Set<number>>(new Set())
  useEffect(() => setPeek(new Set()), [line, mask])
  const ws = groups(line)
  return (
    <div className={'vline' + (big ? ' big' : '') + (hid ? ' masking' : '')}>
      {ws.map((w, k) => {
        const syls = line.syl.slice(w.s, w.s + w.n)
        return (
          <span
            key={k}
            className={'vword' + (on === k ? ' on' : '')}
            onClick={() => {
              if (hid) return
              onWord?.(k)
              const a = wordAudio(w.a)
              if (a) play(a)
              else say(w.t)
            }}
          >
            <span className="tib vbo">
              {syls.map((s, j) => {
                const i = w.s + j
                const masked = hid?.[i] && !peek.has(i)
                return (
                  <span key={j} className={masked ? 'hid' : ''} onClick={() => masked && setPeek(new Set(peek).add(i))}>
                    {s}
                    {i < line.syl.length - 1 ? '་' : ''}
                  </span>
                )
              })}
            </span>
            {!hid && show.pron && <span className="pron">{pronOf(w.t) || ' '}</span>}
            {!hid && show.gloss && <span className="vgloss">{w.g && w.g !== '…' ? w.g : ' '}</span>}
          </span>
        )
      })}
    </div>
  )
}

/** 逐词听这一句 */
export function PlayLineButton({ line, label = '逐词听' }: { line: VLine; label?: string }) {
  const has = line.w.some((w) => w.a)
  if (!has) return null
  return (
    <button className="pill small-pill" onClick={() => playLine(line)}>
      <Icon name="play" size={14} /> {label}
    </button>
  )
}
