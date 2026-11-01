import { questionFor, shuffle, wordMap, type Question, type KC } from './course.ts'
import { amdoWords } from './amdo.ts'
import { sentAudio, sentText, type Chapter } from './book.ts'

/**
 * 全书原文每章的一组练习（约 10 题），按布鲁姆层级分三类：
 *   记忆：本章出现的、词表或安多教材里有的词，看词选意思（4 题）
 *   应用：给一句原文，选出句子里出现的那个学过的词（3 题）
 *   理解：给一段原文，选出它的中文意思（3 题；只有导入了中文译文才出，题目在本地即时生成，不进仓库）
 * 前两类用词的知识点（W: / D:），会进复习；段落题用 B:段落编号，只记作答，不进复习。
 */
const amdoByTib = new Map(amdoWords.map((w) => [w.tib.replace(/[།་\s]+$/, ''), w]))

/** 原文里的一个词对应的已有知识点：开篇词表优先，其次安多教材口语词 */
function kcOf(t: string): { kc: KC; gloss: string } | undefined {
  const w = wordMap.get(t)
  if (w) return { kc: 'W:' + t, gloss: w.gloss }
  const d = amdoByTib.get(t)
  if (d) return { kc: 'D:' + d.id, gloss: d.zh }
}

const cut = (s: string, n = 48) => (s.length > n ? s.slice(0, n) + '…' : s)

export function buildChapterQuiz(ch: Chapter, zh: Map<string, string>): Question[] {
  const sents = ch.paras.flatMap((p) => p.sents)
  const known = new Map<string, { kc: KC; gloss: string }>()
  for (const s of sents) for (const [t] of s.words) if (!known.has(t)) { const k = kcOf(t); if (k) known.set(t, k) }
  const vocab = [...known.keys()]
  const qs: Question[] = []

  // 记忆：看词选意思
  for (const t of shuffle(vocab).slice(0, 4)) qs.push(questionFor(known.get(t)!.kc, 0))

  // 应用：这句里有哪个学过的词
  const usable = shuffle(sents.filter((s) => s.words.length >= 4 && s.words.length <= 25 && s.words.some(([t]) => known.has(t))))
  for (const s of usable.slice(0, 3)) {
    const inSent = new Set(s.words.map(([t]) => t))
    const target = shuffle(s.words.map(([t]) => t).filter((t) => known.has(t)))[0]
    const others = shuffle(vocab.filter((t) => !inSent.has(t))).slice(0, 3)
    if (others.length < 2) continue
    const k = known.get(target)!
    qs.push({
      kind: 'pickWord', kc: k.kc, prompt: sentText(s), audio: s.noAudio ? undefined : sentAudio(s),
      options: shuffle([target, ...others]), answer: target, explain: `${target}：${k.gloss}`,
    })
  }

  // 理解：这段话说的是什么（要有译文）
  const paras = ch.paras.filter((p) => zh.get(p.id) && p.sents.reduce((n, s) => n + s.words.length, 0) <= 40)
  if (paras.length >= 4)
    for (const p of shuffle(paras).slice(0, 3)) {
      const answer = cut(zh.get(p.id)!)
      const others = shuffle(paras.filter((x) => x !== p)).slice(0, 3).map((x) => cut(zh.get(x.id)!))
      qs.push({ kind: 'meaning', kc: 'B:' + p.id, prompt: p.sents.map(sentText).join(' ། '), answer, options: shuffle([answer, ...others]), explain: zh.get(p.id)! })
    }

  return shuffle(qs)
}
