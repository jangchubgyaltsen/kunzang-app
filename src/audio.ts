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
// 开篇逐词和整句的新音频在 op/ 下，是 mp3；全书整句在 book/audio/ 下；其余是 m4a
// 安多会话教材的真人录音在 amdo/ 下
const urlOf = (id: string) =>
  id.startsWith('book/') ? `./book/audio/${id.slice(5)}.m4a` : id.startsWith('amdo/') ? `./${id}.m4a` : `./audio/${id}.${id.startsWith('op/') ? 'mp3' : 'm4a'}`
// 全书有一万多句，只留最近听过的几十句的 blob，其余释放
const recentBook: string[] = []
function blobUrl(id: string) {
  let p = blobs.get(id)
  if (!p && id.startsWith('book/')) {
    recentBook.push(id)
    if (recentBook.length > 40) {
      const old = recentBook.shift()!
      const u = ready.get(old)
      if (u) URL.revokeObjectURL(u)
      ready.delete(old)
      blobs.delete(old)
    }
  }
  if (!p) {
    p = fetch(urlOf(id))
      .then((r) => {
        if (!r.ok) throw new Error(`audio ${id}: ${r.status}`)
        return r.blob()
      })
      .then((b) => {
        // 明确标上类型：Safari 播 blob 地址时不看扩展名，类型为空就可能放不出来
        const type = urlOf(id).endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4'
        const u = URL.createObjectURL(b.type === type ? b : new Blob([b], { type }))
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
// 只播整句里的一段（点全书里的词）：from 秒开始，到 stopAt 秒停
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
player.addEventListener('ended', () => {
  if (player.src === SILENCE) return
  finished()
})
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

// 正在播哪一段：原文页用来高亮正在读的句子
let current: string | null = null
const listeners = new Set<(id: string | null) => void>()
const notify = () => listeners.forEach((f) => f(current))
export function onTrack(f: (id: string | null) => void) {
  listeners.add(f)
  return () => void listeners.delete(f)
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
  const now = ready.get(id)
  const retry = () => start(id, from, to)
  // 取好的直接同步播放，这样仍在用户点击之内，iOS 不会拦
  if (now) return go(n, now, retry, from, to, urlOf(id))
  blobUrl(id)
    .catch(() => urlOf(id))
    .then((src) => go(n, src, retry, from, to, urlOf(id)))
}

/** 用同一个播放器放任意地址的声音，例如自己的录音。 */
export function playUrl(src: string, onEnd?: () => void) {
  queue = []
  afterAll = onEnd
  const n = ++latest
  player.pause()
  go(n, src, () => playUrl(src, onEnd))
}

// 最近一次播放的结果，设置页的“声音测试”显示它，方便排查
let status = '还没有播放过'
export const audioStatus = () => `${status}；${unlocked ? '已解锁' : '未解锁'}`

function go(n: number, src: string, retry: () => void, from = 0, to = Infinity, direct?: string) {
  if (n !== latest) return
  stopAt = Infinity
  player.src = src
  if (from > 0) {
    // 要等元数据读出来才能跳到中间；play() 仍在手势里同步调用
    player.addEventListener('loadedmetadata', () => n === latest && (player.currentTime = from), { once: true })
  } else player.currentTime = 0
  player.play().then(() => {
    status = '播放成功'
    markUnlocked()
    if (n !== latest || to === Infinity) return
    stopAt = to
    requestAnimationFrame(watchStop)
  }, (e: unknown) => {
    const name = (e as Error)?.name
    if (name !== 'AbortError') status = `播放失败（${name}）`
    // 还没解锁被 iOS 拦下：记住它，用户下一次触摸时补放
    if (n === latest && name === 'NotAllowedError') pending = retry
    // blob 放不了就直接用原地址再试一次
    else if (n === latest && name !== 'AbortError' && direct && src.startsWith('blob:')) go(n, direct, retry, from, to)
    else if (name !== 'AbortError') console.warn('play failed', src, e)
  })
}
