import { db } from './db.ts'
import { SPELL_SEQ } from './course.ts'
import { amdoSets } from './amdo.ts'
import { bodyParas, chapters, parasBefore, paraStart } from './book.ts'
import { fwords } from './fwords.ts'
import { coverageOf, learnedF, loadVocab } from './vocab.ts'
import { getProgress, READ_FROM, type Progress } from './practice.ts'

/**
 * 首页“学习进度”用的一份总览：三个阶段各学了多少、还剩多少、下一步是什么，加上并行的安多会话。
 * 一个阶段：done / total 是条子，state 是没开始 / 正在学 / 学完了。
 */
export type StageState = 'todo' | 'now' | 'done'
export type Stage = { key: 'spell' | 'vocab' | 'read'; name: string; done: number; total: number; unit: string; state: StageState; note: string }
export type Overview = { p: Progress; stages: Stage[]; now: number; next: string; coverage: number; talk: { done: number; total: number } }

const CV_TOTAL = 120
const LETTERS = 30
/** 高频词表一共多少个词（下载以后以实际为准） */
const VOCAB_TOTAL = 1500

export async function getOverview(): Promise<Overview> {
  const p = await getProgress()
  await loadVocab().catch(() => {})
  const coverage = coverageOf(await learnedF())
  const ptr = (await db.settings.get('read-pointer'))?.value as { ch: string; para: string } | undefined
  const talkDone = await db.cards.where('kc').startsWith('A:').count()
  const talkTotal = amdoSets.reduce((n, s) => n + s.ids.length, 0)

  const spellTotal = SPELL_SEQ.length + CV_TOTAL
  const spellDone = SPELL_SEQ.length - p.spellLeft.length + (CV_TOTAL - p.cvLeft)
  const lettersDone = [...p.introduced].filter((k) => k.startsWith('L:')).length
  const vocabTotal = fwords.length || VOCAB_TOTAL
  const readDone = ptr ? parasBefore(ptr.para) : 0
  const chName = (id: string) => {
    const c = chapters.find((x) => x.id === id)
    return c ? `第 ${Number(c.id)} 章 ${c.zh}` : ''
  }

  const spellState: StageState = spellDone >= spellTotal ? 'done' : 'now'
  const vocabState: StageState = !p.vocabOn ? 'todo' : p.fLearned >= vocabTotal ? 'done' : 'now'
  const readState: StageState = !p.readOn ? 'todo' : readDone >= bodyParas ? 'done' : 'now'
  const stages: Stage[] = [
    {
      key: 'spell',
      name: '拼读',
      done: spellDone,
      total: spellTotal,
      unit: '项',
      state: spellState,
      note: `字母 ${lettersDone}/${LETTERS} · 组合 ${CV_TOTAL - p.cvLeft}/${CV_TOTAL}`,
    },
    {
      key: 'vocab',
      name: '原文高频词',
      done: p.fLearned,
      total: vocabTotal,
      unit: '词',
      state: vocabState,
      note: vocabState === 'todo' ? `30 个字母学完开始` : `认识原文 ${Math.round(coverage * 100)}% 的词`,
    },
    {
      key: 'read',
      name: '有声精读',
      done: readDone,
      total: bodyParas,
      unit: '段',
      state: readState,
      note: readState === 'todo' ? `学到 ${READ_FROM} 个高频词开始` : ptr ? `读到${chName(ptr.ch)}` : '从第 1 章开始',
    },
  ]
  const now = !p.vocabOn ? 0 : p.readOn ? 2 : 1
  let next: string
  if (!p.vocabOn) next = `再学 ${LETTERS - lettersDone} 个字母，就开始学原文高频词`
  else if (!p.readOn) next = `再学 ${READ_FROM - p.fLearned} 个高频词，就开始每天精读原文`
  else if (coverage < 0.95) next = `认识原文 95% 的词就能比较顺地自己读，现在 ${Math.round(coverage * 100)}%`
  else next = '原文里的词基本都认识了，接着往下读'
  return { p, stages, now, next, coverage, talk: { done: talkDone, total: talkTotal } }
}

/** 一章读到哪（0–1），按段落编号算 */
export function chapterRead(id: string, paraId: string | undefined, paras: number) {
  if (!paraId) return 0
  return Math.min(1, Math.max(0, (Number(paraId.slice(1)) - (paraStart.get(id) ?? 0) + 1) / Math.max(1, paras)))
}
