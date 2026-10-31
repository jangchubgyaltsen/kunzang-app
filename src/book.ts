import index from './book-index.json'

/** 全书原文（开篇以外）。每章一个 JSON，放在 public/book/ 下，打开那一章时才下载。 */
export type BookWord = [tibetan: string, start?: number, end?: number]
export type BookSent = { id: string; words: BookWord[]; noAudio?: boolean }
export type BookPara = { id: string; sents: BookSent[] }
export type Chapter = { id: string; zh: string; tibetan: string; paras: BookPara[] }
export type ChapterInfo = { id: string; zh: string; tibetan: string; paras: number; sents: number }

/** 第 00 章是开篇，阅读页用原来的逐词版本，这里只列正文各章。 */
export const chapters = (index as ChapterInfo[]).filter((c) => c.id !== '00')

const loaded = new Map<string, Promise<Chapter>>()
export function loadChapter(id: string): Promise<Chapter> {
  let p = loaded.get(id)
  if (!p) {
    p = fetch(`./book/ch${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`第 ${id} 章下载失败（${r.status}）`)
      return r.json() as Promise<Chapter>
    })
    p.catch(() => loaded.delete(id))
    loaded.set(id, p)
  }
  return p
}

export const sentAudio = (s: BookSent) => 'book/' + s.id
export const sentText = (s: BookSent) => s.words.map((w) => w[0]).join('་')

/** 把一章的整句音频全部取一遍，Service Worker 就会存下来，之后没网也能听。 */
export async function downloadChapter(ch: Chapter, onProgress: (done: number, total: number) => void) {
  const ids = ch.paras.flatMap((p) => p.sents.filter((s) => !s.noAudio).map((s) => s.id))
  let done = 0
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      try {
        const r = await fetch(`./book/audio/${id}.m4a`)
        if (r.ok) await r.blob()
      } catch {
        /* 下次再试 */
      }
      onProgress(++done, ids.length)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}
