import type { SpotCheck } from './db.ts'
import { CHECK_DAYS, finishCheck, weakKCs } from './progress.ts'
import { buildSpotCheck, unitByN, type Question } from './course.ts'

/** 一次练习：要么是路径上的一关，要么是一组现成的题（复习、抽查） */
export type Session = { level: string } | { questions: Question[]; title: string; onFinish?: (acc: number) => Promise<{ passed: boolean }> }

/** 开始一次定时抽查 */
export async function spotCheckSession(c: SpotCheck): Promise<Session> {
  const u = unitByN.get(c.unit)!
  return {
    questions: buildSpotCheck(c.unit, await weakKCs()),
    title: `抽查 · ${u.title} · 第 ${CHECK_DAYS[c.step]} 天`,
    onFinish: async (acc) => ({ passed: await finishCheck(c.id, acc) }),
  }
}
