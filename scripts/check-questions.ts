/**
 * 题库检查：把拼读线 1–10 单元和安多会话的每个知识点、每种题型都生成一遍，按出题规范查：
 *   错误（会让脚本失败）：答案不在选项里、答案出现两次、选项重复、选项少于 2 个、
 *     听音选字里有读音和答案一样又不是书上成对比较的字（听不出来）、拼字某个位置的答案不在选项里、
 *     排序题的块里凑不出答案、找错题不是正好两个“基字”、出题时报错
 *   提醒：选项里用了这个单元还没学到的字母
 *
 * 用法：npm run check:questions
 * 随机出题的地方会重复生成几遍（ROUNDS），尽量把随机分支都走到。
 */
import { LETTERS, UNITS, knownThrough, questionFor, recallFor, type KC, type Scored } from '../src/course.ts'
import { amdoSentences } from '../src/amdo.ts'
import { CV_PRON, PRON, soundMates } from '../src/pron.ts'

const ROUNDS = 3
const errors = new Map<string, string[]>()
const warnings = new Map<string, string[]>()
let total = 0

const add = (m: Map<string, string[]>, rule: string, msg: string) => m.set(rule, [...(m.get(rule) ?? []), msg])
const err = (rule: string, q: { kc: KC; kind?: string }, detail = '') => add(errors, rule, `${q.kc} ${q.kind ?? ''} ${detail}`.trim())
const warn = (rule: string, q: { kc: KC; kind?: string }, detail = '') => add(warnings, rule, `${q.kc} ${q.kind ?? ''} ${detail}`.trim())

const letterSet = new Set(LETTERS.map((l) => l[0]))
const pronOf = (x: string) => PRON[x]?.[0] ?? CV_PRON[x]?.[0]

function check(q: Scored, known: Set<KC>, unit?: number) {
  total++
  if ('options' in q) {
    const opts = q.options
    if (opts.length < 2) err('选项少于 2 个', q, opts.join(' '))
    if (new Set(opts).size !== opts.length) err('选项重复', q, opts.join(' '))
    const hits = opts.filter((o) => o === q.answer).length
    if (hits === 0) err('答案不在选项里', q, `${q.answer} / ${opts.join(' ')}`)
    if (hits > 1) err('答案出现两次', q, String(q.answer))
    // 听音选字：读音一样的字放在一起听不出来，除非是书上专门让比较的
    if (q.kind === 'listen' && pronOf(q.answer)) {
      const base = q.answer[0]
      for (const o of opts)
        if (o !== q.answer && pronOf(o) === pronOf(q.answer) && !soundMates.get(base)?.has(o[0]) && o[0] !== base)
          err('听音选字有读音相同的干扰项', q, `${q.answer} / ${o}`)
    }
    // 选项里的单个字母、字母元音组合，应该是这个单元已经学过的
    if (unit && unit <= 9)
      for (const o of opts)
        if (letterSet.has(o[0]) && (o.length === 1 || (o.length === 2 && !letterSet.has(o[1]))) && !known.has('L:' + o[0])) warn('选项用了还没学的字母', q, `单元 ${unit}：${o}`)
  }
  if (q.kind === 'build')
    for (const s of q.slots) {
      if (!s.options.includes(s.answer)) err('拼字：答案不在选项里', q, `${s.role} ${s.answer}`)
      if (new Set(s.options).size !== s.options.length) err('拼字：选项重复', q, s.role)
      if (s.options.length < 2) err('拼字：选项少于 2 个', q, s.role)
    }
  if (q.kind === 'order') {
    const need = q.answer.split('་')
    const pool = [...q.pieces]
    for (const x of need) {
      const k = pool.indexOf(x)
      if (k < 0) err('排序：块里凑不出答案', q, x)
      else pool.splice(k, 1)
    }
    if ((q.need ?? q.pieces.length) !== need.length) err('排序：need 和答案长度不一致', q)
  }
  if (q.kind === 'findRoot' && !(q.answer >= 0 && q.answer < q.parts.length)) err('找基字：答案下标不对', q)
  if (q.kind === 'spotError') {
    if (q.shown.filter((r) => r === '基字').length !== 2) err('找错：不是正好两个基字', q)
    if (q.roles[q.answer] === '基字') err('找错：答案是真正的基字', q)
  }
}

function gen(kc: KC, known: Set<KC>, unit?: number) {
  for (let r = 0; r < ROUNDS; r++)
    for (const v of [0, 1, 2, 3, 4, 5]) {
      try {
        check(questionFor(kc, v, known), known, unit)
      } catch (e) {
        err('出题时报错', { kc, kind: `variant ${v}` }, (e as Error).message)
      }
    }
  for (let r = 0; r < ROUNDS * 2; r++) {
    try {
      const q = recallFor(kc, known)
      if (q) check(q, known, unit)
    } catch (e) {
      err('出题时报错', { kc, kind: 'recall' }, (e as Error).message)
    }
  }
}

for (const u of UNITS) {
  const known = knownThrough(u.n)
  for (const kc of new Set([...u.kcs, ...u.extra, ...u.oral, ...u.hear])) gen(kc, known, u.n)
}
const all = knownThrough(99)
for (const s of amdoSentences) gen('A:' + s.id, all)

const report = (title: string, m: Map<string, string[]>) => {
  if (!m.size) return console.log(`${title}：无`)
  console.log(`${title}：`)
  for (const [rule, list] of m) {
    const uniq = [...new Set(list)]
    console.log(`  ${rule}（${uniq.length}）`)
    for (const x of uniq.slice(0, 5)) console.log('    ' + x)
    if (uniq.length > 5) console.log(`    … 还有 ${uniq.length - 5} 条`)
  }
}
console.log(`共生成 ${total} 道题`)
report('错误', errors)
report('提醒', warnings)
process.exit(errors.size ? 1 : 0)
