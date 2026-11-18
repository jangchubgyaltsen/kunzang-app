import { db } from './db.ts'
import { ALL_CARDS, CV_MARKS, ROWS, isWarm, loadStats } from './alphabet.ts'
import { SPELL_SEQ, introFor, questionFor, recallFor, recallQuestion, shuffle, writeQuestion, type KC, type Question } from './course.ts'
import { amdoSets } from './amdo.ts'
import { reviveCard } from './progress.ts'
import { dayKey } from './daily.ts'
import { course, lineByKey, loadVerses, maskCard, newLineSteps, pickLines, verseIntro, verseQuestion } from './verses.ts'

/**
 * 今天：一个按钮，大约 15 分钟，按顺序三段：
 * 1. cards 卡片：到期复习和新卡混在一个队列里（字母、组合、规则、简单词，加上学过的偈颂词的复习）。做完就算签到。
 * 2. talk  安多会话：3 句新的（听、看、跟读录音）+ 到期的会话句复习。
 * 3. verse 偈颂：30 个字母学过以前，读一句偈颂（只看不考）；之后每天学 1–3 句新的（拆词 → 整句 → 对照 → 遮字背诵），
 *    加上到期的偈颂句复习（只留首字背）。
 *
 * 学的顺序只有一条线：拼读（字母、元音、组合、加字、简单词）→ 仪轨偈颂（30 个字母都学过以后开始，和拼读并行）。
 * 不再有关卡、单元小测和定时抽查：FSRS 排的到期复习就是持续的抽查。
 * 新卡当天：介绍 → 选择题 → 过一会儿再一道选择题；以后复习都用回忆卡（先想再翻面，自评）。
 */
export type StepKey = 'cards' | 'talk' | 'verse'
export const STEPS: StepKey[] = ['cards', 'talk', 'verse']
export type DayPlan = { date: string; steps: StepKey[]; done: StepKey[] }
// v3：第三段从「原文」换成「偈颂」
const KEY = 'practice-day-v3'

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
/** 偈颂句一天最多复习几句（背一句要一会儿） */
const VERSE_REVIEW = 12

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
  /** 30 个字母都学过了：开始学偈颂 */
  verseOn: boolean
  /** 学过的偈颂词、偈颂句 */
  gLearned: number
  jLearned: number
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
  return {
    introduced,
    spellLeft: SPELL_SEQ.filter((k) => !introduced.has(k)),
    cvOpen,
    cvLeft: cvAll.filter((x) => !introduced.has(x.key)).length,
    verseOn: letters.every((l) => introduced.has('L:' + l)),
    gLearned: [...introduced].filter((k) => k.startsWith('G:')).length,
    jLearned: [...introduced].filter((k) => k.startsWith('J:')).length,
    days: await db.checkins.count(),
  }
}

const endOfToday = () => new Date(new Date().setHours(23, 59, 59, 999)).getTime()

/**
 * 到期的复习。会话句 A: 在会话那段里复习，偈颂句 J: 在偈颂那段里复习。
 * 旧版的原文高频词 F:、全书段落题 B: 已经不学了，不再出。
 */
async function dueList(filter: (k: KC) => boolean, cap: number) {
  const rows = await db.cards.where('due').belowOrEqual(endOfToday()).toArray()
  return rows
    .filter((r) => filter(r.kc))
    .sort((a, b) => a.due - b.due)
    .slice(0, cap)
}

const retired = (k: KC) => k.startsWith('F:') || k.startsWith('B:')
const cardKC = (k: KC) => !k.startsWith('A:') && !k.startsWith('J:') && !retired(k)

/** 今天的新卡（拼读）。偈颂词不在这里学，在偈颂那段里跟着句子学 */
async function pickNew(p: Progress, dueCount: number): Promise<KC[]> {
  let n = Math.max(NEW_MIN, Math.min(NEW_MAX, TARGET - dueCount))
  if (p.days < 7) n = Math.min(n, EARLY_NEW)
  // 已经在学偈颂了：拼读的新卡少一点，留出时间
  if (p.verseOn) n = Math.min(n, 8)
  return [...p.spellLeft.slice(0, 6), ...p.cvOpen].slice(0, n)
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
  const listen = /^[GWDT]:/.test(kc) && Math.random() < 1 / 4
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
  const ok = await loadVerses().then(() => true, () => false)
  const p = await getProgress()
  const due = await dueList((k) => cardKC(k) && (ok || !k.startsWith('G:')), REVIEW_CAP)
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

/**
 * 偈颂这一段（照「科判颂词背诵器」）：
 * 新句：这句里没学过的词，一个个介绍（藏文、安多拼音、释义、发音、这一句做例句），介绍完每个词考一道选意思；
 * 然后整句（逐词释义、汉义）→ 对照（看藏文选汉义、看汉义选藏文）→ 遮字背诵（通读 → 遮三分之二 → 只留首字）。
 * 到期的旧句：只留首字背一遍，自评。旧句复习放在新句前面，先热身。
 */
export async function buildVerse(): Promise<{ questions: Question[]; known: Set<KC> }> {
  await loadVerses()
  const introduced = new Set((await db.cards.toCollection().primaryKeys()) as KC[])
  const due = await dueList((k) => k.startsWith('J:') && lineByKey.has(k.slice(2)), VERSE_REVIEW)
  const out: Question[] = shuffle(due.map((r) => maskCard(r.kc, 3)))
  const known = new Set(introduced)
  for (const key of pickLines(introduced)) {
    const { words, steps, wordQs } = newLineSteps(key, known)
    words.forEach((w) => known.add(w))
    known.add('J:' + key)
    const k = words.length
    // 词的介绍都看完了再一个个考（打乱），然后才是整句
    out.push(...steps.slice(0, k), ...shuffle(wordQs), ...steps.slice(k))
  }
  return { questions: out, known }
}

/** 字母还没学完时：今天读一句偈颂（学习线上的第一句还没学的），只看不考 */
export async function verseOfToday(): Promise<Question[]> {
  await loadVerses()
  const introduced = new Set((await db.cards.where('kc').startsWith('J:').primaryKeys()) as KC[])
  const key = course.find((k) => !introduced.has('J:' + k)) ?? course[0]
  return [verseIntro('J:' + key)]
}

/** 偈颂句的复习题（复习页用）：大多只留首字背，有时对照 */
export function verseReview(kc: KC): Question {
  return Math.random() < 0.25 ? verseQuestion(kc) : maskCard(kc, 3)
}

/** 今天这几段的说明（首页清单用） */
export type StepInfo = { label: string; detail: string; minutes: number }
export async function stepInfo(key: StepKey, p?: Progress): Promise<StepInfo> {
  p ??= await getProgress()
  if (key === 'cards') {
    const n = (await dueList(cardKC, REVIEW_CAP)).length
    const stage = p.spellLeft.length || p.cvLeft ? (p.verseOn ? '拼读收尾 + 偈颂词复习' : '拼读：字母、元音、加字') : '偈颂词复习'
    return { label: '卡片', detail: `${stage} · 复习 ${n} 张 · 做完就签到`, minutes: Math.max(5, Math.round((n * 8 + 10 * 30) / 60)) }
  }
  if (key === 'talk') {
    const done = (await db.cards.where('kc').startsWith('A:').count())
    return { label: '安多会话', detail: `第 ${done + 1}–${done + TALK_NEW} 句 · 听、跟读`, minutes: 3 }
  }
  if (!p.verseOn) return { label: '偈颂', detail: '读一句偈颂，只看不考 · 30 个字母学完后开始逐词学', minutes: 1 }
  const due = (await dueList((k) => k.startsWith('J:'), VERSE_REVIEW)).length
  return { label: '偈颂', detail: `新学 1–3 句，拆词学 · 复习 ${due} 句`, minutes: 6 + Math.round(due / 2) }
}
