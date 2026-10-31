import Dexie, { type Table } from 'dexie'

export type Flag = { id?: number; kind: 'syllable' | 'line'; ref: string; note: string; createdAt: number }
export type Setting = { key: string; value: unknown }
export type Translation = { id: string; chinese: string }
export type Attempt = { id?: number; kc: string; ok: boolean; at: number; unit?: number }
export type CardRow = { kc: string; due: number; card: unknown }
export type UnitResult = { n: number; passedAt?: number; best: number }

class AppDB extends Dexie {
  flags!: Table<Flag, number>
  settings!: Table<Setting, string>
  translations!: Table<Translation, string>
  attempts!: Table<Attempt, number>
  cards!: Table<CardRow, string>
  units!: Table<UnitResult, number>
  constructor() {
    super('kunzang')
    this.version(1).stores({ flags: '++id, kind, ref', settings: 'key' })
    this.version(2).stores({ translations: 'id' })
    this.version(3).stores({ attempts: '++id, kc, at', cards: 'kc, due', units: 'n' })
    // 课程改成字母和词混合练习后，单元编号的含义变了，旧的通关记录作废。
    this.version(4).stores({}).upgrade((tx) => tx.table('units').clear())
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
  }
}

export async function importData(data: {
  app?: string
  flags?: Flag[]
  settings?: Setting[]
  attempts?: Attempt[]
  cards?: CardRow[]
  units?: UnitResult[]
}) {
  if (data.app !== 'kunzang') throw new Error('不是本 App 导出的备份文件')
  await db.transaction('rw', [db.flags, db.settings, db.attempts, db.cards, db.units], async () => {
    await Promise.all([db.flags.clear(), db.settings.clear(), db.attempts.clear(), db.cards.clear(), db.units.clear()])
    await db.flags.bulkAdd(data.flags ?? [])
    await db.settings.bulkPut(data.settings ?? [])
    await db.attempts.bulkAdd(data.attempts ?? [])
    await db.cards.bulkPut(data.cards ?? [])
    await db.units.bulkPut(data.units ?? [])
  })
}

export async function importTranslationPack(data: { app?: string; passages?: Record<string, string> }) {
  if (data.app !== 'kunzang-zh' || !data.passages) throw new Error('不是中文译文包')
  const rows = Object.entries(data.passages).map(([id, chinese]) => ({ id, chinese }))
  await db.translations.bulkPut(rows)
  return rows.length
}
