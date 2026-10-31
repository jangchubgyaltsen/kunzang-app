import Dexie, { type Table } from 'dexie'

export type Flag = { id?: number; kind: 'syllable' | 'line'; ref: string; note: string; createdAt: number }
export type Setting = { key: string; value: unknown }
export type Translation = { id: string; chinese: string }

class AppDB extends Dexie {
  flags!: Table<Flag, number>
  settings!: Table<Setting, string>
  translations!: Table<Translation, string>
  constructor() {
    super('kunzang')
    this.version(1).stores({ flags: '++id, kind, ref', settings: 'key' })
    this.version(2).stores({ translations: 'id' })
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
  }
}

export async function importData(data: { app?: string; flags?: Flag[]; settings?: Setting[] }) {
  if (data.app !== 'kunzang') throw new Error('不是本 App 导出的备份文件')
  await db.transaction('rw', db.flags, db.settings, async () => {
    await db.flags.clear()
    await db.settings.clear()
    await db.flags.bulkAdd(data.flags ?? [])
    await db.settings.bulkPut(data.settings ?? [])
  })
}

export async function importTranslationPack(data: { app?: string; passages?: Record<string, string> }) {
  if (data.app !== 'kunzang-zh' || !data.passages) throw new Error('不是中文译文包')
  const rows = Object.entries(data.passages).map(([id, chinese]) => ({ id, chinese }))
  await db.translations.bulkPut(rows)
  return rows.length
}
