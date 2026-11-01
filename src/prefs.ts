// 本机的显示偏好，存在 localStorage 里（出题时要同步读，所以不放 IndexedDB）

const WYLIE_KEY = 'show-wylie'

/** 显示 Wylie 转写、出转写题。默认关：只学念诵和读懂的话，用不上第三套符号 */
export const wylieOn = () => typeof localStorage !== 'undefined' && localStorage.getItem(WYLIE_KEY) === '1'
export const setWylie = (on: boolean) => localStorage.setItem(WYLIE_KEY, on ? '1' : '0')
