// 拿孙宏开词表里夏河（拉卜楞）、泽库两个安多点的读音检验 src/amdoPron.ts 的注音规律。
// 用法：npm run check:pron [-- --list]   （--list 列出对不上的音节）
// 两栏用的不一定是同一个词，所以对不上的不全是规律错，主要看比例的变化。
import fs from 'node:fs'
import { amdoPinyin } from '../src/amdoPron.ts'

const rows = fs
  .readFileSync(new URL('./data/sun-amdo.tsv', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#') && !l.startsWith('concept'))
  .map((l) => l.split('\t'))

const V = 'aeiouəɛɔøyɿʮɪʏɐ'
/** 国际音标的韵母，归并成注音里能分的几类 */
const ipaRhyme = (s: string) => {
  const m = s.match(new RegExp(`[${V}][^${V}]*$`))
  if (!m) return ''
  return m[0].replace(/[ɛɪʏ]/g, 'e').replace(/[øɔ]/g, 'o').replace(/[ɿʮy]/g, 'i').replace('ɐ', 'a').replace('ŋ', 'ng').replace(/[ʔ◦]/g, '')
}
/** 注音的韵母，写成同样的类 */
const pyRhyme = (s: string) => {
  const r = s.replace(/^[ʰⁿ]/, '').replace(/^(hw|zh|ch|sh|ng|ny|lh|[bpmfdtnlgkhjqxzcsrwy])/, '')
  return r.replace(/^i(?=[aeêo])/, '').replace(/ê/g, 'e@').replace(/e(?!@)/g, 'ə').replace(/e@/g, 'e').replace(/^i$/, s.match(/^[ʰⁿ]?(j|q|x|y|n)i$/) ? 'ə' : 'i')
}

const list = process.argv.includes('--list')
const stat = { syl: 0, rhyme: 0, preWords: 0, preHeard: 0, preWritten: 0 }
for (const [concept, tib, lab, zek] of rows) {
  const syls = tib.split('་')
  for (const [name, form] of [['夏河', lab], ['泽库', zek]] as const) {
    const ipa = form.split(' ')
    if (ipa.length !== syls.length) continue
    syls.forEach((s, i) => {
      const py = amdoPinyin(s)
      if (!py) return
      stat.syl++
      const ok = pyRhyme(py) === ipaRhyme(ipa[i]) || (pyRhyme(py) === 'al' && ['e', 'a'].includes(ipaRhyme(ipa[i])))
      if (ok) stat.rhyme++
      else if (list) console.log(`${name}\t${concept}\t${s}\t${py}\t${ipa[i]}`)
      if (i === 0 && /^[ʰⁿ]/.test(py)) {
        stat.preWritten++
        if (/^([hɣrnmḥχ]|w(?=[sʑz]))[^aeiouəɛɔøyɿʮɪʏɐ]/.test(ipa[i]) && !/^(ng|ȵ)/.test(ipa[i])) stat.preHeard++
      }
    })
  }
}
const pct = (a: number, b: number) => `${a} / ${b}（${((a / b) * 100).toFixed(0)}%）`
console.log('韵母对上：', pct(stat.rhyme, stat.syl))
console.log('写了前置音（ʰ ⁿ）的词首音节里，词表也读出前置音的：', pct(stat.preHeard, stat.preWritten))
