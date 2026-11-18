import { db } from './db.ts'
import { SPELL_SEQ } from './course.ts'
import { amdoSets } from './amdo.ts'
import { course, loadVerses, wordByT } from './verses.ts'
import { getProgress, type Progress } from './practice.ts'

/**
 * 首页“学习进度”用的一份总览：两个阶段（拼读 → 仪轨偈颂）各学了多少、还剩多少，加上并行的安多会话。
 * 一个阶段：done / total 是条子，state 是没开始 / 正在学 / 学完了。
 * 偈颂按句算，另外写学过多少个词。
 */
export type StageState = 'todo' | 'now' | 'done'
export type Stage = { key: 'spell' | 'verse'; name: string; done: number; total: number; unit: string; state: StageState; extra?: string }
export type Overview = { p: Progress; stages: Stage[]; now: number; talk: { done: number; total: number } }

const CV_TOTAL = 120
/** 偈颂学习线一共多少句、多少词（下载以后以实际为准） */
const VERSE_TOTAL = 1580
const WORD_TOTAL = 3451

export async function getOverview(): Promise<Overview> {
  const p = await getProgress()
  await loadVerses().catch(() => {})
  const talkDone = await db.cards.where('kc').startsWith('A:').count()
  const talkTotal = amdoSets.reduce((n, s) => n + s.ids.length, 0)

  const spellTotal = SPELL_SEQ.length + CV_TOTAL
  const spellDone = SPELL_SEQ.length - p.spellLeft.length + (CV_TOTAL - p.cvLeft)
  const verseTotal = course.length || VERSE_TOTAL
  const wordTotal = wordByT.size || WORD_TOTAL

  const spellState: StageState = spellDone >= spellTotal ? 'done' : 'now'
  const verseState: StageState = !p.verseOn ? 'todo' : p.jLearned >= verseTotal ? 'done' : 'now'
  const stages: Stage[] = [
    { key: 'spell', name: '拼读', done: spellDone, total: spellTotal, unit: '项', state: spellState },
    { key: 'verse', name: '仪轨偈颂', done: p.jLearned, total: verseTotal, unit: '句', state: verseState, extra: `词 ${p.gLearned} / ${wordTotal}` },
  ]
  return { p, stages, now: p.verseOn ? 1 : 0, talk: { done: talkDone, total: talkTotal } }
}
