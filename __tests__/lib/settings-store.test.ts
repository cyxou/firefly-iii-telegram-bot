import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createFileSettingsStore,
  createMemorySettingsStore,
  defaultSettings,
} from '#root/lib/settings-store.js'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
  dirs.length = 0
})

describe('settings store', () => {
  it('round-trips settings through a JSON file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ffbot-'))
    dirs.push(dir)
    const file = path.join(dir, 'settings.json')
    const store = createFileSettingsStore(file)

    const s = defaultSettings({
      fireflyUrl: 'https://ff.example.com',
      fireflyApiUrl: 'https://ff.example.com/api',
    })
    await store.save(1111111, s)

    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    expect(onDisk['1111111'].fireflyUrl).toBe('https://ff.example.com')
    expect((await store.get(1111111))?.fireflyUrl).toBe('https://ff.example.com')
  })

  it('returns undefined for unknown users and tolerates missing file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ffbot-'))
    dirs.push(dir)
    const store = createFileSettingsStore(path.join(dir, 'absent.json'))
    await expect(store.get(42)).resolves.toBeUndefined()
  })

  it('defaultSettings seeds language en and empty account refs', () => {
    const s = defaultSettings()
    expect(s.language).toBe('en')
    expect(s.defaultSourceAccount).toEqual({ id: '', type: '', name: '' })
    expect(s.fireflyAccessToken).toBe('')
  })

  it('memory store is independent per instance', async () => {
    const a = createMemorySettingsStore()
    const b = createMemorySettingsStore()
    await a.save(1, defaultSettings({ fireflyUrl: 'u' }))
    expect(await b.get(1)).toBeUndefined()
  })
})
