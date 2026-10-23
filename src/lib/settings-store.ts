import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface AccountRef {
  id: string
  type: string
  name: string
}

export interface UserSettings {
  fireflyUrl: string
  fireflyApiUrl: string
  fireflyAccessToken: string
  defaultSourceAccount: AccountRef
  defaultDestinationAccount: AccountRef
  language: string
}

// The store holds only what the user set themselves — env-seeded credentials
// are merged in at read time (bot/index.ts), never persisted, so rotating the
// deployment's env keeps reaching users who never chose their own.
export interface SettingsStore {
  get: (userId: number) => Promise<Partial<UserSettings> | undefined>
  save: (userId: number, settings: Partial<UserSettings>) => Promise<void>
}

export function defaultSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    fireflyUrl: '',
    fireflyApiUrl: '',
    fireflyAccessToken: '',
    defaultSourceAccount: { id: '', type: '', name: '' },
    defaultDestinationAccount: { id: '', type: '', name: '' },
    language: 'en',
    ...overrides,
  }
}

export function createFileSettingsStore(filePath: string): SettingsStore {
  async function readAll(): Promise<Record<string, Partial<UserSettings>>> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      return {}
    }
  }
  return {
    async get(userId) {
      return (await readAll())[String(userId)]
    },
    async save(userId, settings) {
      const all = await readAll()
      all[String(userId)] = settings
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`)
    },
  }
}

export function createMemorySettingsStore(seed: Record<number, UserSettings> = {}): SettingsStore {
  const db = new Map<number, Partial<UserSettings>>(
    Object.entries(seed).map(([k, v]) => [Number(k), v]),
  )
  return {
    async get(userId) {
      return db.get(userId)
    },
    async save(userId, settings) {
      db.set(userId, settings)
    },
  }
}
