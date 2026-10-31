const player = new Audio()
player.preload = 'auto'
player.setAttribute('playsinline', '')

// iOS 17+：声明这是“播放”类的声音，静音键打开时也照常出声
const nav = navigator as Navigator & { audioSession?: { type: string } }
if (nav.audioSession) nav.audioSession.type = 'playback'

// 音频由 Service Worker 预缓存。iOS Safari 播放音频时会发 Range 请求，
// 而预缓存只返回完整的 200 响应，Safari 就不播放。所以先整个取回来，
// 转成 blob 地址再交给播放器。
const blobs = new Map<string, Promise<string>>()
// 已经取好的 blob 地址，点击时可以直接同步播放
const ready = new Map<string, string>()
// 开篇逐词和整句的新音频在 op/ 下，是 mp3；其余是 m4a
const urlOf = (id: string) => `./audio/${id}.${id.startsWith('op/') ? 'mp3' : 'm4a'}`
function blobUrl(id: string) {
  let p = blobs.get(id)
  if (!p) {
    p = fetch(urlOf(id))
      .then((r) => {
        if (!r.ok) throw new Error(`audio ${id}: ${r.status}`)
        return r.blob()
      })
      .then((b) => {
        const u = URL.createObjectURL(b)
        ready.set(id, u)
        return u
      })
    p.catch(() => blobs.delete(id))
    blobs.set(id, p)
  }
  return p
}

/** 提前把几段音频取好，之后点击时能马上同步播放。 */
export function preload(ids: (string | undefined)[]) {
  for (const id of ids) if (id) void blobUrl(id).catch(() => {})
}

// iOS 只允许在用户手势里第一次调用 play()，之后这个播放器才能在异步回调里出声。
// 注意 iOS 上 pointerdown/touchstart 不算手势，只有 touchend、click、keydown 才算，
// 所以在这几个事件里解锁；play() 真正成功之前一直保留监听，失败了下次触摸再试。
// 解锁前被拦下的那段音频，在解锁时补放。
const SILENCE = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

let unlocked = false
let pending: (() => void) | undefined
const GESTURES = ['touchend', 'click', 'keydown'] as const
function unlock() {
  if (unlocked) return
  if (pending) {
    // 有一段刚才没放出来的，直接在手势里放它
    const f = pending
    pending = undefined
    f()
    return
  }
  if (!player.paused) return
  player.src = SILENCE
  player.play().then(markUnlocked, () => {})
}
function markUnlocked() {
  if (unlocked) return
  unlocked = true
  for (const g of GESTURES) document.removeEventListener(g, unlock, true)
}
for (const g of GESTURES) document.addEventListener(g, unlock, true)

let latest = 0
let queue: string[] = []
let afterAll: (() => void) | undefined
player.addEventListener('ended', () => {
  if (player.src === SILENCE) return
  const next = queue.shift()
  if (next) return start(next)
  const f = afterAll
  afterAll = undefined
  f?.()
})

/** 播放一段音频；正在播的（包括连播队列）会被打断。onEnd 在正常播完时调用。 */
export function play(id: string, onEnd?: () => void) {
  queue = []
  afterAll = onEnd
  start(id)
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
  ++latest
  player.pause()
}

function start(id: string) {
  const n = ++latest
  player.pause()
  const now = ready.get(id)
  // 取好的直接同步播放，这样仍在用户点击之内，iOS 不会拦
  if (now) return go(n, now, () => start(id))
  blobUrl(id)
    .catch(() => urlOf(id))
    .then((src) => go(n, src, () => start(id)))
}

/** 用同一个播放器放任意地址的声音，例如自己的录音。 */
export function playUrl(src: string, onEnd?: () => void) {
  queue = []
  afterAll = onEnd
  const n = ++latest
  player.pause()
  go(n, src, () => playUrl(src, onEnd))
}

function go(n: number, src: string, retry: () => void) {
  if (n !== latest) return
  player.src = src
  player.currentTime = 0
  player.play().then(markUnlocked, (e: unknown) => {
    // 还没解锁被 iOS 拦下：记住它，用户下一次触摸时补放
    if (n === latest && (e as Error)?.name === 'NotAllowedError') pending = retry
    else if ((e as Error)?.name !== 'AbortError') console.warn('play failed', src, e)
  })
}
