import { glossOf, loadGloss, shortGloss } from './gloss.ts'
import { chapterCounts, fwords, setVocab, vocabTotal, type ChapterCount, type FWord, type TopSyl, type BookWordT } from './fwords.ts'
import { db } from './db.ts'

type Raw = { total: number; words: { w: string; n: number; ex?: { s: string; t: BookWordT[]; i: number } }[]; syls: TopSyl[]; chs?: ChapterCount[] }

let loading: Promise<void> | null = null
/** 下载高频词表和释义，放进 fwords.ts。只下载一次。 */
export function loadVocab(): Promise<void> {
  if (fwords.length) return Promise.resolve()
  if (!loading) {
    loading = Promise.all([
      fetch('./book/vocab.json').then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Raw>
      }),
      loadGloss(),
    ]).then(([raw, d]) => {
      const list: FWord[] = raw.words.map((x, rank) => {
        const g = glossOf(d, x.w)
        const full = g.gloss ?? (g.parts ?? []).map((p) => `${p.tibetan} ${p.gloss ?? '…'}`).join('；')
        const extra = g.particle ? `（${g.base} + ${g.particle.tibetan}：${g.particle.note}）` : ''
        return { w: x.w, n: x.n, rank, short: shortGloss(g) || '（虚词）', gloss: (full || '（还没有释义）') + extra, uncertain: !!g.uncertain, ex: x.ex }
      })
      setVocab(list, raw.syls, raw.total, raw.chs)
    })
    loading.catch(() => (loading = null))
  }
  return loading
}

/** 学过的高频词（有复习卡片的 F:） */
export async function learnedF(): Promise<Set<string>> {
  const keys = (await db.cards.where('kc').startsWith('F:').primaryKeys()) as string[]
  return new Set(keys.map((k) => k.slice(2)))
}

/** 学过的这些词，在全书里占多少词次（0–1） */
export function coverageOf(known: Set<string>) {
  if (!vocabTotal.n) return 0
  let n = 0
  for (const f of fwords) if (known.has(f.w)) n += f.n
  return n / vocabTotal.n
}

/** 每一章里，学过的词占多少词次 */
export function chapterCoverage(known: Set<string>): Map<string, number> {
  const m = new Map<string, number>()
  for (const ch of chapterCounts) {
    let n = 0
    for (let k = 0; k < ch.c.length; k += 2) if (known.has(fwords[ch.c[k]]?.w)) n += ch.c[k + 1]
    m.set(ch.id, n / Math.max(1, ch.total))
  }
  return m
}
