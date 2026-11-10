// 本机的显示偏好，存在 localStorage 里（出题时要同步读，所以不放 IndexedDB）

const WYLIE_KEY = 'show-wylie'

/** 显示 Wylie 转写、出转写题。默认关：只学念诵和读懂的话，用不上第三套符号 */
export const wylieOn = () => typeof localStorage !== 'undefined' && localStorage.getItem(WYLIE_KEY) === '1'
export const setWylie = (on: boolean) => localStorage.setItem(WYLIE_KEY, on ? '1' : '0')

const RETENTION_KEY = 'retention'
/** 记忆强度：FSRS 的目标记住率。轻松 0.85、标准 0.9、牢固 0.95；越高复习越多 */
export const RETENTION_LEVELS: [number, string, string][] = [
  [0.85, '轻松', '复习最少，偶尔会忘'],
  [0.9, '标准', '大约记住九成'],
  [0.95, '牢固', '复习多一些，很少忘'],
]
export const retention = () => {
  const v = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(RETENTION_KEY)) : 0
  return RETENTION_LEVELS.some(([r]) => r === v) ? v : 0.9
}
export const setRetention = (r: number) => localStorage.setItem(RETENTION_KEY, String(r))
