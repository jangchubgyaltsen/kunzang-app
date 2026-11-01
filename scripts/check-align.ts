/**
 * 看看自动对齐和逐词释义的效果：读本地的全书中文译文包，打印几段藏汉逐句对照，并统计词义命中率。
 * 用法：npx tsx scripts/check-align.ts <中文译文包.json> [段落编号…]
 */
import { readFileSync } from 'node:fs'
import { alignPara } from '../src/align.ts'
import { glossOf, glossTerms } from '../src/gloss.ts'
import type { Chapter } from '../src/book.ts'

const [pack, ...want] = process.argv.slice(2)
const zh: Record<string, string> = JSON.parse(readFileSync(pack, 'utf8')).book
const dict = new Map(Object.entries(JSON.parse(readFileSync('public/book/gloss.json', 'utf8')) as Record<string, string>))

let words = 0
let glossed = 0
let parts = 0
let sents = 0
let groups = 0
let merged = 0
let printed = 0
let anywhere = 0
let inGroup = 0
for (let c = 0; c <= 14; c++) {
  const ch: Chapter = JSON.parse(readFileSync(`public/book/ch${String(c).padStart(2, '0')}.json`, 'utf8'))
  for (const p of ch.paras) {
    const input = p.sents.map((s) => {
      const terms = s.words.map((w) => {
        words++
        const g = glossOf(dict, w[0])
        if (g.gloss) glossed++
        else if (g.parts?.some((x) => x.gloss)) parts++
        return glossTerms(g)
      })
      return { syls: s.words.reduce((n, w) => n + w[0].split('་').length, 0), terms }
    })
    const z = zh[p.id]
    if (!z) continue
    const gs = alignPara(input, z)
    for (const g of gs)
      for (let i = g.from; i <= g.to; i++)
        for (const terms of input[i].terms)
          if (terms.some((t) => z.includes(t))) {
            anywhere++
            if (terms.some((t) => g.zh.includes(t))) inGroup++
          }
    sents += p.sents.length
    groups += gs.length
    merged += gs.filter((g) => g.to > g.from).length
    if ((want.length ? want.includes(p.id) : c === 2 && printed < 6 && p.sents.length > 3) && printed++ < 20) {
      console.log(`\n== ${p.id}`)
      for (const g of gs) {
        console.log('  ' + p.sents.slice(g.from, g.to + 1).map((s) => s.words.map((w) => w[0]).join('་')).join(' ། '))
        console.log('    → ' + g.zh)
      }
    }
  }
}
console.log(`\n词：${words}，整词有释义 ${((glossed / words) * 100).toFixed(1)}%，拆开有释义 ${((parts / words) * 100).toFixed(1)}%`)
console.log(`释义能在本段译文里找到的词，${((inGroup / anywhere) * 100).toFixed(1)}% 落在对上的那几句中文里`)
console.log(`句：${sents}，对成 ${groups} 组，其中几句藏文合成一组的 ${merged} 组`)
