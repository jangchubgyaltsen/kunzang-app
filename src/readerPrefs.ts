import { useEffect, useState } from 'react'

/** 原文页的显示设置（注音、释义、中文、逐句对照），开篇和各章共用一份，存在这台设备上 */
export type ReaderPrefs = { pron: boolean; gloss: boolean; zh: boolean; bySent: boolean; wylie: boolean }
const KEY = 'reader-prefs'
const DEFAULT: ReaderPrefs = { pron: true, gloss: true, zh: true, bySent: true, wylie: false }
const EVENT = 'reader-prefs'

function load(): ReaderPrefs {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT
  }
}

export function useReaderPrefs(): [ReaderPrefs, (p: Partial<ReaderPrefs>) => void] {
  const [p, setP] = useState(load)
  useEffect(() => {
    const f = () => setP(load())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  const set = (x: Partial<ReaderPrefs>) => {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...x }))
    window.dispatchEvent(new Event(EVENT))
  }
  return [p, set]
}
