/**
 * 把一段中文译文按句对到这一段的藏文句子上（自动对齐，可能有偏差）。
 *
 * 译文是按段落给的，藏文一段又按 ། 切成几句。中文先按 ，。；：！？ 切成分句，再用动态规划把
 * 连续的几个藏文句子对到连续的几个中文分句上，分数看两样：
 *   1. 长度：中文汉字数大约是藏文音节数的 1.3 倍（全书统计）；
 *   2. 词义：藏文句里的词，释义在这几个中文分句里出现的，算对上一个。
 * 译文顺序和藏文不完全一致（藏文动词在后），所以只做到“这几句藏文 ≈ 这几句中文”，不保证逐字。
 */
export type AlignGroup = { from: number; to: number; zh: string }

const RATIO = 1.3
const BREAK = '，。；：！？'
const CLOSE = '”’」』）)》'

export function splitClauses(zh: string): string[] {
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < zh.length; i++) {
    buf += zh[i]
    if (BREAK.includes(zh[i])) {
      while (i + 1 < zh.length && (CLOSE.includes(zh[i + 1]) || BREAK.includes(zh[i + 1]))) buf += zh[++i]
      out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}

const han = (s: string) => (s.match(/[一-鿿]/g) ?? []).length

/**
 * @param sents 每句藏文：音节数，和句里每个词可拿来在中文里找的词（见 glossTerms）
 * @returns 每组：藏文第 from..to 句（含）对应的中文
 */
export function alignPara(sents: { syls: number; terms: string[][] }[], zh: string): AlignGroup[] {
  const n = sents.length
  const clauses = splitClauses(zh)
  const m = clauses.length
  if (n === 0) return []
  if (n === 1 || m <= 1) return [{ from: 0, to: n - 1, zh }]

  const cz = clauses.map(han)
  // 前缀和，方便算一段的长度
  const ts = [0]
  for (const s of sents) ts.push(ts[ts.length - 1] + s.syls)
  const zs = [0]
  for (const c of cz) zs.push(zs[zs.length - 1] + c)

  const lenCost = (i0: number, i1: number, j0: number, j1: number) => {
    const t = ts[i1] - ts[i0]
    const z = zs[j1] - zs[j0]
    const d = (z - RATIO * t) / Math.sqrt(RATIO * t + 4)
    return (d * d) / 2
  }
  const lexBonus = (i0: number, i1: number, j0: number, j1: number) => {
    const text = clauses.slice(j0, j1).join('')
    let hit = 0
    for (let i = i0; i < i1; i++) for (const terms of sents[i].terms) if (terms.some((t) => text.includes(t))) hit++
    return hit
  }

  const MAX_T = 4
  const MAX_Z = 8
  const INF = 1e9
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF))
  const back: [number, number][][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill([0, 0]))
  dp[0][0] = 0
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (dp[i][j] >= INF) continue
      for (let a = 1; a <= MAX_T && i + a <= n; a++)
        for (let b = 1; b <= MAX_Z && j + b <= m; b++) {
          const c = dp[i][j] + lenCost(i, i + a, j, j + b) + (a - 1) * 2.5 - 1.5 * lexBonus(i, i + a, j, j + b)
          if (c < dp[i + a][j + b]) {
            dp[i + a][j + b] = c
            back[i + a][j + b] = [a, b]
          }
        }
    }
  if (dp[n][m] >= INF) return [{ from: 0, to: n - 1, zh }]
  const groups: AlignGroup[] = []
  let i = n
  let j = m
  while (i > 0) {
    const [a, b] = back[i][j]
    groups.unshift({ from: i - a, to: i - 1, zh: clauses.slice(j - b, j).join('') })
    i -= a
    j -= b
  }
  return groups
}

/** 在中文里找出释义对应的那几个字，用来高亮 */
export function findTerm(zh: string, terms: string[]): [number, number] | null {
  let best: [number, number] | null = null
  for (const t of terms) {
    const k = zh.indexOf(t)
    if (k >= 0 && (!best || t.length > best[1] - best[0])) best = [k, k + t.length]
  }
  return best
}
