import { db } from './db.ts'
import { ALL_CARDS, CV_MARKS, ROWS, isWarm, loadStats } from './alphabet.ts'
import { SPELL_SEQ, introFor, questionFor, recallFor, recallQuestion, shuffle, writeQuestion, type KC, type Question } from './course.ts'
import { amdoSets } from './amdo.ts'
import { readLines } from './reading.ts'
import { reviveCard } from './progress.ts'
import { dayKey } from './daily.ts'
import { fwords } from './fwords.ts'
import { loadVocab } from './vocab.ts'

/**
 * 今天：一个按钮，大约 15 分钟，按顺序三段：
 * 1. cards 卡片：到期复习和新卡混在一个队列里（字母、组合、规则、词、原文高频词交替出）。做完就算签到。
 * 2. talk  安多会话：3 句新的（听、看、跟读录音）+ 到期的会话句复习。
 * 3. read  原文：高频词学到 300 个以前，听开篇的一句（只听不考）；之后是“今天的一段”有声精读。
 *
 * 学的顺序只有一条线：拼读（字母、元音、组合、加字、简单词）→ 原文高频词（30 个字母都学过以后开始，和拼读并行）→ 有声精读。
 * 不再有关卡、单元小测和定时抽查：FSRS 排的到期复习就是持续的抽查。
 * 新卡当天：介绍 → 选择题 → 过一会儿再一道选择题；以后复习都用回忆卡（先想再翻面，自评）。
 */
export type StepKey = 'cards' | 'talk' | 'read'
export const STEPS: StepKey[] = ['cards', 'talk', 'read']
export type DayPlan = { date: string; steps: StepKey[]; done: StepKey[] }
const KEY = 'practice-day-v2'

/** 卡片一段的大小：复习最多这么多张；新卡按复习多少浮动 */
const REVIEW_CAP = 60
const TARGET = 30
const NEW_MIN = 4
const NEW_MAX = 14
/** 刚开始一周，每天新卡最多这么多 */
const EARLY_NEW = 8
const TALK_NEW = 3
/** 一天最多几张默写字母（写字慢，太多会累） */
const WRITE_MAX = 4
const TALK_REVIEW = 5
/** 学会这么多原文高频词以后，每天的原文从“听一句”换成“精读一段” */
export const READ_FROM = 300

export async function loadPlan(): Promise<DayPlan> {
  const today = dayKey()
  const saved = (await db.settings.get(KEY))?.value as DayPlan | undefined
  if (saved?.date === today) return saved
  const plan: DayPlan = { date: today, steps: [...STEPS], done: [] }
  await db.settings.put({ key: KEY, value: plan })
  return plan
}

export async function markStep(key: StepKey) {
  const plan = await loadPlan()
  if (!plan.done.includes(key)) plan.done.push(key)
  await db.settings.put({ key: KEY, value: plan })
  return plan
}

// ───── 学到哪了 ─────

export type Progress = {
  introduced: Set<KC>
  /** 拼读阶段还没学的（不算组合） */
  spellLeft: KC[]
  /** 能开始学的字母元音组合（字母和 4 个元音都有点熟了），还没学的 */
  cvOpen: KC[]
  cvLeft: number
  /** 30 个字母都学过了：开始学原文高频词 */
  vocabOn: boolean
  fLearned: number
  readOn: boolean
  /** 做卡片的天数（签到天数） */
  days: number
}

export async function getProgress(): Promise<Progress> {
  const introduced = new Set((await db.cards.toCollection().primaryKeys()) as KC[])
  const stats = await loadStats()
  const vowelsWarm = CV_MARKS.every((m) => isWarm(stats['V:' + m]))
  const cvAll = ALL_CARDS.filter((x) => x.key.startsWith('CV:'))
  const cvOpen = vowelsWarm ? cvAll.filter((x) => !introduced.has(x.key) && isWarm(stats['L:' + x.base])).map((x) => x.key) : []
  const letters = ROWS.flat()
  const fLearned = [...introduced].filter((k) => k.startsWith('F:')).length
  return {
    introduced,
    spellLeft: SPELL_SEQ.filter((k) => !introduced.has(k)),
    cvOpen,
    cvLeft: cvAll.filter((x) => !introduced.has(x.key)).length,
    vocabOn: letters.every((l) => introduced.has('L:' + l)),
    fLearned,
    readOn: fLearned >= READ_FROM,
    days: await db.checkins.count(),
  }
}

const endOfToday = () => new Date(new Date().setHours(23, 59, 59, 999)).getTime()

/** 到期的复习（会话句 A: 在会话那段里复习；全书段落题 B: 不进复习） */
async function dueList(filter: (k: KC) => boolean, cap: number) {
  const rows = await db.cards.where('due').belowOrEqual(endOfToday()).toArray()
  return rows
    .filter((r) => filter(r.kc))
    .sort((a, b) => a.due - b.due)
    .slice(0, cap)
}

/** 今天的新卡：拼读的和高频词各占多少 */
async function pickNew(p: Progress, dueCount: number): Promise<KC[]> {
  let n = Math.max(NEW_MIN, Math.min(NEW_MAX, TARGET - dueCount))
  if (p.days < 7) n = Math.min(n, EARLY_NEW)
  const spell = [...p.spellLeft.slice(0, 6), ...p.cvOpen]
  const vocab = p.vocabOn ? fwords.filter((f) => !p.introduced.has('F:' + f.w)).map((f) => 'F:' + f.w) : []
  if (!vocab.length) return spell.slice(0, n)
  if (!spell.length) return vocab.slice(0, n)
  const half = Math.ceil(n / 2)
  return [...spell.slice(0, half), ...vocab.slice(0, n - Math.min(half, spell.length))]
}

/** 复习用哪种卡：大多是回忆卡；字母每隔几次凭记忆写一次；加字规则用原来的题；音节有时听音拼字 */
async function reviewQuestion(kc: KC, writes = { n: 0 }): Promise<Question> {
  if (kc.startsWith('L:') && writes.n < WRITE_MAX) {
    const row = await db.cards.get(kc)
    const reps = row ? reviveCard(row.card).reps : 0
    if (reps % 3 === 2) {
      writes.n++
      return writeQuestion(kc.slice(2), false)
    }
  }
  if ((kc.startsWith('S:') || kc.startsWith('P:')) && Math.random() < 1 / 3) {
    const r = recallFor(kc)
    if (r) return r
  }
  const listen = /^[FWDT]:/.test(kc) && Math.random() < 1 / 4
  return recallQuestion(kc, listen) ?? questionFor(kc)
}

const shuffleInPlace = <T,>(a: T[]) => a.splice(0, a.length, ...shuffle(a))

/** 把 b 均匀地插进 a */
function interleave<T>(a: T[], b: T[]) {
  if (!a.length) return b
  if (!b.length) return a
  const out: T[] = []
  const step = a.length / b.length
  let j = 0
  for (let i = 0; i < a.length; i++) {
    while (j < b.length && j * step <= i) out.push(b[j++])
    out.push(a[i])
  }
  return [...out, ...b.slice(j)]
}

/**
 * 卡片这一段：
 * 新卡 4 张一组：先看介绍（新字母后面接两遍描字），马上每张考一道选择题；全部组做完以后，每张新卡再换个问法考一次。
 * 到期复习打散，插在各组之间。
 */
export async function buildCards(): Promise<{ questions: Question[]; known: Set<KC> }> {
  await loadVocab().catch(() => {})
  const p = await getProgress()
  const due = await dueList((k) => !k.startsWith('A:') && !k.startsWith('B:') && (!k.startsWith('F:') || fwords.length > 0), REVIEW_CAP)
  const fresh = await pickNew(p, due.length)
  const known = new Set([...p.introduced, ...fresh])
  const writes = { n: 0 }
  const reviews: Question[] = []
  for (const r of due) reviews.push(await reviewQuestion(r.kc, writes))
  shuffleInPlace(reviews)
  const blocks: Question[][] = []
  for (let k = 0; k < fresh.length; k += 4) {
    const g = fresh.slice(k, k + 4)
    const intro: Question[] = g.flatMap((kc) => (kc.startsWith('L:') ? [introFor(kc), writeQuestion(kc.slice(2), true)] : [introFor(kc)]))
    const first = shuffle(g).map((kc) => questionFor(kc, 0, known))
    // 刚看完介绍的那张不紧接着考
    if (first.length > 1 && first[0].kc === g[g.length - 1]) first.push(first.shift()!)
    blocks.push([...intro, ...first])
  }
  const second = shuffle(fresh).map((kc) => questionFor(kc, 1, known))
  const share = Math.ceil(reviews.length / (blocks.length + 1))
  const out: Question[] = []
  blocks.forEach((b, k) => out.push(...reviews.slice(k * share, (k + 1) * share), ...b))
  const tail = reviews.slice(blocks.length * share)
  // 新卡的第二次放在最后一段复习里，和第一次隔开
  return { questions: [...out, ...interleave(tail, second)], known }
}

/** 安多会话：按教材顺序 3 句新的（听 → 跟读录音），到期的会话句听音回忆；最后新句子各听一遍选意思 */
export async function buildTalk(): Promise<{ questions: Question[]; known: Set<KC> }> {
  const introduced = new Set((await db.cards.where('kc').startsWith('A:').primaryKeys()) as KC[])
  const order = amdoSets.flatMap((s) => s.ids).map((id) => 'A:' + id)
  const fresh = order.filter((k) => !introduced.has(k)).slice(0, TALK_NEW)
  const due = await dueList((k) => k.startsWith('A:'), TALK_REVIEW)
  const known = new Set([...introduced, ...fresh])
  const out: Question[] = []
  for (const kc of fresh) {
    const intro = introFor(kc)
    out.push(intro, { kind: 'shadow', kc, text: intro.big, audio: intro.audio!, note: intro.note, label: '跟读 · 录下来对比' })
  }
  out.push(...shuffle(await Promise.all(due.map((r) => reviewQuestion(r.kc)))))
  out.push(...shuffle(fresh).map((kc) => questionFor(kc, 0, known)))
  return { questions: out, known }
}

/** 高频词还不够时：开篇里的一句，只听、跟读，不考。按天轮换 */
export function lineOfToday() {
  const d = new Date()
  const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
  return readLines[n % readLines.length]
}

/** 今天这几段的说明（首页清单用） */
export type StepInfo = { label: string; detail: string; minutes: number }
export async function stepInfo(key: StepKey, p?: Progress): Promise<StepInfo> {
  p ??= await getProgress()
  if (key === 'cards') {
    const n = (await dueList((k) => !k.startsWith('A:') && !k.startsWith('B:'), REVIEW_CAP)).length
    const stage = p.spellLeft.length || p.cvLeft ? (p.vocabOn ? '拼读收尾 + 原文高频词' : '拼读：字母、元音、加字') : '原文高频词'
    return { label: '卡片', detail: `${stage} · 复习 ${n} 张 · 做完就签到`, minutes: Math.max(5, Math.round((n * 8 + 10 * 30) / 60)) }
  }
  if (key === 'talk') {
    const done = (await db.cards.where('kc').startsWith('A:').count())
    return { label: '安多会话', detail: `第 ${done + 1}–${done + TALK_NEW} 句 · 听、跟读`, minutes: 3 }
  }
  if (p.readOn) return { label: '原文', detail: '今天的一段：听着读、自己读、跟读', minutes: 5 }
  return { label: '原文', detail: `听开篇的一句，只听不考 · 高频词学到 ${READ_FROM} 个后开始精读`, minutes: 1 }
}
