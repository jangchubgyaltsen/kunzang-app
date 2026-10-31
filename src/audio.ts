const player = new Audio()
player.preload = 'auto'

// 音频由 Service Worker 预缓存。iOS Safari 播放音频时会发 Range 请求，
// 而预缓存只返回完整的 200 响应，Safari 就不播放。所以先整个取回来，
// 转成 blob 地址再交给播放器。
const blobs = new Map<string, Promise<string>>()
// 开篇逐词和整句的新音频在 op/ 下，是 mp3；全书整句在 book/audio/ 下；其余是 m4a
const urlOf = (id: string) =>
  id.startsWith('book/') ? `./book/audio/${id.slice(5)}.m4a` : `./audio/${id}.${id.startsWith('op/') ? 'mp3' : 'm4a'}`
// 全书有一万多句，只留最近听过的几十句的 blob，其余释放
const recentBook: string[] = []
function blobUrl(id: string) {
  let p = blobs.get(id)
  if (!p && id.startsWith('book/')) {
    recentBook.push(id)
    if (recentBook.length > 40) {
      const old = recentBook.shift()!
      blobs.get(old)?.then((u) => URL.revokeObjectURL(u)).catch(() => {})
      blobs.delete(old)
    }
  }
  if (!p) {
    p = fetch(urlOf(id))
      .then((r) => {
        if (!r.ok) throw new Error(`audio ${id}: ${r.status}`)
        return r.blob()
      })
      .then((b) => URL.createObjectURL(b))
    p.catch(() => blobs.delete(id))
    blobs.set(id, p)
  }
  return p
}

// iOS 只允许在用户点击里第一次调用 play()。第一次触摸时用一段静音解锁播放器，
// 之后取完音频再异步播放就不会被拦下。
const SILENCE = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
function unlock() {
  document.removeEventListener('pointerdown', unlock, true)
  document.removeEventListener('touchend', unlock, true)
  if (player.src) return
  player.src = SILENCE
  void player.play().catch(() => {})
}
document.addEventListener('pointerdown', unlock, true)
document.addEventListener('touchend', unlock, true)

let latest = 0
let queue: string[] = []
let afterAll: (() => void) | undefined
let stopAt = Infinity
function finished() {
  const next = queue.shift()
  if (next) return start(next)
  const f = afterAll
  afterAll = undefined
  current = null
  notify()
  f?.()
}
player.addEventListener('ended', finished)

// 正在播哪一段：原文页用来高亮正在读的句子
let current: string | null = null
const listeners = new Set<(id: string | null) => void>()
const notify = () => listeners.forEach((f) => f(current))
export function onTrack(f: (id: string | null) => void) {
  listeners.add(f)
  return () => void listeners.delete(f)
}

// 只播整句里的一段（点全书里的词）：到点就停
function watchStop() {
  if (stopAt === Infinity) return
  if (player.currentTime >= stopAt) {
    player.pause()
    stopAt = Infinity
    finished()
    return
  }
  requestAnimationFrame(watchStop)
}

/** 播放一段音频；正在播的（包括连播队列）会被打断。onEnd 在正常播完时调用。 */
export function play(id: string, onEnd?: () => void) {
  queue = []
  afterAll = onEnd
  start(id)
}

/** 播放一段音频里从 from 到 to 秒的部分。 */
export function playRange(id: string, from: number, to: number) {
  queue = []
  afterAll = undefined
  start(id, from, to)
}

/** 依次连播几段，例如整段原文一句接一句。 */
export function playSeq(ids: string[]) {
  queue = ids.slice(1)
  afterAll = undefined
  if (ids[0]) start(ids[0])
}

export function stop() {
  queue = []
  afterAll = undefined
  stopAt = Infinity
  ++latest
  player.pause()
  current = null
  notify()
}

function start(id: string, from = 0, to = Infinity) {
  const n = ++latest
  player.pause()
  stopAt = Infinity
  current = id
  notify()
  blobUrl(id)
    .catch(() => urlOf(id))
    .then(async (src) => {
      if (n !== latest) return
      player.src = src
      if (from > 0) {
        // 要等元数据读出来才能跳到中间
        await new Promise((r) => player.addEventListener('loadedmetadata', r, { once: true }))
        if (n !== latest) return
      }
      player.currentTime = from
      await player.play()
      if (n !== latest) return
      stopAt = to
      if (to !== Infinity) requestAnimationFrame(watchStop)
    })
    .catch((e) => console.warn('play failed', id, e))
}
