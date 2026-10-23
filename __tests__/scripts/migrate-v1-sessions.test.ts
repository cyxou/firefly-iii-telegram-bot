import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateV1Sessions } from '../../scripts/migrate-v1-sessions.js'

describe('migrateV1Sessions', () => {
  it('extracts userSettings, prefers credentialed sessions per user', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'ffmig-'))
    const sessionsDir = path.join(base, 'sessions')
    await mkdir(path.join(sessionsDir, '35'), { recursive: true })
    await writeFile(path.join(sessionsDir, '35', '111_111.json'), JSON.stringify({
      userSettings: { fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: '', defaultSourceAccount: { id: '', type: '', name: '' }, defaultDestinationAccount: { id: '', type: '', name: '' }, language: 'en' },
    }))
    await writeFile(path.join(sessionsDir, '35', '111_222.json'), JSON.stringify({
      userSettings: { fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500), defaultSourceAccount: { id: '7', type: 'asset', name: 'Cash' }, defaultDestinationAccount: { id: '', type: '', name: '' }, language: 'ru' },
    }))
    await writeFile(path.join(sessionsDir, '35', 'garbage.json'), JSON.stringify({ nope: 1 }))

    const out = path.join(base, 'settings.json')
    const result = await migrateV1Sessions(sessionsDir, out)

    expect(result).toEqual({ users: 1, skipped: 1 })
    const disk = JSON.parse(await readFile(out, 'utf8'))
    expect(disk['111'].fireflyAccessToken).toBe('x'.repeat(500))
    expect(disk['111'].defaultSourceAccount.name).toBe('Cash')
    expect(disk['111'].language).toBe('ru')
  })
})
