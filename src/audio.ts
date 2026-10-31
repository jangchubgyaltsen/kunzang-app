const player = new Audio()
player.preload = 'auto'

// 音频由 Service Worker 预缓存。iOS Safari 播放音频时会发 Range 请求，
// 而预缓存只返回完整的 200 响应，Safari 就不播放。所以先整个取回来，
// 转成 blob 地址再交给播放器。
const blobs = new Map<string, Promise<string>>()
function blobUrl(id: string) {
  let p = blobs.get(id)
  if (!p) {
    p = fetch(`./audio/${id}.m4a`)
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
export function play(id: string) {
  const n = ++latest
  player.pause()
  blobUrl(id)
    .catch(() => `./audio/${id}.m4a`)
    .then((src) => {
      if (n !== latest) return
      player.src = src
      player.currentTime = 0
      return player.play()
    })
    .catch((e) => console.warn('play failed', id, e))
}
