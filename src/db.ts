import Dexie, { type Table } from 'dexie'
import { unitByN } from './course.ts'

export type Flag = { id?: number; kind: 'syllable' | 'line'; ref: string; note: string; createdAt: number }
export type Setting = { key: string; value: unknown }
export type Translation = { id: string; chinese: string }
export type Attempt = { id?: number; kc: string; ok: boolean; at: number; unit?: number; src?: string }
export type CardRow = { kc: string; due: number; card: unknown }
export type UnitResult = { n: number; passedAt?: number; best: number }
export type Checkin = { date: string; game: string; score: number; total: number; at: number }
export type LevelResult = { id: string; unit: number; passedAt?: number; best: number; plays: number }
/** 定时抽查：单元通过后第 1、3、7、14、30 天各抽查一次 */
export type SpotCheck = { id: string; unit: number; step: number; due: number; doneAt?: number; score?: number; tries: number }

class AppDB extends Dexie {
  flags!: Table<Flag, number>
  settings!: Table<Setting, string>
  translations!: Table<Translation, string>
  attempts!: Table<Attempt, number>
  cards!: Table<CardRow, string>
  units!: Table<UnitResult, number>
  checkins!: Table<Checkin, string>
  levels!: Table<LevelResult, string>
  checks!: Table<SpotCheck, string>
  constructor() {
    super('kunzang')
    this.version(1).stores({ flags: '++id, kind, ref', settings: 'key' })
    this.version(2).stores({ translations: 'id' })
    this.version(3).stores({ attempts: '++id, kc, at', cards: 'kc, due', units: 'n' })
    // 课程改成字母和词混合练习后，单元编号的含义变了，旧的通关记录作废。
    this.version(4).stores({}).upgrade((tx) => tx.table('units').clear())
    this.version(5).stores({ checkins: 'date' })
    // 单元拆成小关卡。已经通过的单元，它的关卡全部算通过，不用重学。
    this.version(6)
      .stores({ levels: 'id, unit', checks: 'id, unit, due' })
      .upgrade(async (tx) => {
        const units = (await tx.table('units').toArray()) as UnitResult[]
        for (const r of units) {
          if (!r.passedAt) continue
          for (const l of unitByN.get(r.n)?.levels ?? []) await tx.table('levels').put({ id: l.id, unit: r.n, passedAt: r.passedAt, best: r.best, plays: 1 })
        }
      })
  }
}

export const db = new AppDB()

export async function requestPersistence() {
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist()
    } catch {
      /* not supported */
    }
  }
}

export async function exportData() {
  return {
    app: 'kunzang',
    version: 1,
    exportedAt: new Date().toISOString(),
    flags: await db.flags.toArray(),
    settings: await db.settings.toArray(),
    attempts: await db.attempts.toArray(),
    cards: await db.cards.toArray(),
    units: await db.units.toArray(),
    checkins: await db.checkins.toArray(),
    levels: await db.levels.toArray(),
    checks: await db.checks.toArray(),
  }
}

export async function importData(data: {
  app?: string
  flags?: Flag[]
  settings?: Setting[]
  attempts?: Attempt[]
  cards?: CardRow[]
  units?: UnitResult[]
  checkins?: Checkin[]
  levels?: LevelResult[]
  checks?: SpotCheck[]
}) {
  if (data.app !== 'kunzang') throw new Error('不是本 App 导出的备份文件')
  await db.transaction('rw', [db.flags, db.settings, db.attempts, db.cards, db.units, db.checkins, db.levels, db.checks], async () => {
    await Promise.all([db.flags.clear(), db.settings.clear(), db.attempts.clear(), db.cards.clear(), db.units.clear(), db.checkins.clear(), db.levels.clear(), db.checks.clear()])
    await db.flags.bulkAdd(data.flags ?? [])
    await db.settings.bulkPut(data.settings ?? [])
    await db.attempts.bulkAdd(data.attempts ?? [])
    await db.cards.bulkPut(data.cards ?? [])
    await db.units.bulkPut(data.units ?? [])
    await db.checkins.bulkPut(data.checkins ?? [])
    // 旧备份没有关卡记录：按通过的单元补上
    const levels = data.levels ?? (data.units ?? []).filter((r) => r.passedAt).flatMap((r) => (unitByN.get(r.n)?.levels ?? []).map((l) => ({ id: l.id, unit: r.n, passedAt: r.passedAt, best: r.best, plays: 1 })))
    await db.levels.bulkPut(levels)
    await db.checks.bulkPut(data.checks ?? [])
  })
}

export async function importTranslationPack(data: { app?: string; passages?: Record<string, string> }) {
  if (data.app !== 'kunzang-zh' || !data.passages) throw new Error('不是中文译文包')
  const rows = Object.entries(data.passages).map(([id, chinese]) => ({ id, chinese }))
  await db.translations.bulkPut(rows)
  return rows.length
}
