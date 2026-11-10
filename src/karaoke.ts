import { useEffect, useState } from 'react'
import { playhead } from './audio.ts'
import type { BookWord } from './book.ts'

/**
 * 跟着声音逐词高亮：正在放 id 这一句时，返回正在读的是第几个词（按整句音频里每个词的时间）；没在放返回 -1。
 * 边听边看文字，比只读或只听记住的词更多，也帮着把字形和读音连起来。
 */
export function useSaying(id: string | null, words: BookWord[] | undefined) {
  const [k, setK] = useState(-1)
  useEffect(() => {
    if (!id || !words) return setK(-1)
    let raf = 0
    let last = -2
    const tick = () => {
      const t = playhead()
      const j = t < 0 ? -1 : words.findIndex((w) => w[1] !== undefined && w[2] !== undefined && t >= w[1] - 0.02 && t < w[2])
      if (j !== last) setK((last = j))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [id, words])
  return k
}
