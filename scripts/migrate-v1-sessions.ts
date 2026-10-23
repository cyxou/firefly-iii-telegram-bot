import type { UserSettings } from '#root/lib/settings-store.js'
// One-time migration: v1 stored Firefly credentials inside file-based sessions
// (sessions/<shard>/<userId>_<chatId>.json → userSettings). v2 keeps credentials
// in data/settings.json. Usage:
//   bun run scripts/migrate-v1-sessions.ts [sessionsDir] [outputFile]
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createFileSettingsStore, defaultSettings } from '#root/lib/settings-store.js'

export async function migrateV1Sessions(sessionsDir: string, outputFile: string) {
  const store = createFileSettingsStore(outputFile)
  const best = new Map<number, UserSettings>()
  let skipped = 0

  for (const entry of await readdir(sessionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    for (const file of await readdir(path.join(sessionsDir, entry.name))) {
      const match = /^(\d+)_\d+\.json$/.exec(file)
      if (!match) {
        skipped++
        continue
      }
      let session: any
      try {
        session = JSON.parse(await readFile(path.join(sessionsDir, entry.name, file), 'utf8'))
      }
      catch {
        skipped++
        continue
      }
      const raw = session?.userSettings
      if (!raw) {
        skipped++
        continue
      }
      const userId = Number(match[1])
      const candidate = defaultSettings({
        fireflyUrl: raw.fireflyUrl ?? '',
        fireflyApiUrl: raw.fireflyApiUrl ?? '',
        fireflyAccessToken: raw.fireflyAccessToken ?? '',
        defaultSourceAccount: raw.defaultSourceAccount,
        defaultDestinationAccount: raw.defaultDestinationAccount,
        language: raw.language ?? 'en',
      })
      const existing = best.get(userId)
      // a user with sessions in several chats: keep the one that can actually talk to Firefly
      if (!existing || (!existing.fireflyAccessToken && candidate.fireflyAccessToken))
        best.set(userId, candidate)
    }
  }

  for (const [userId, settings] of best)
    await store.save(userId, settings)
  return { users: best.size, skipped }
}

if (import.meta.main) {
  const sessionsDir = process.argv[2] ?? 'sessions'
  const outputFile = process.argv[3] ?? 'data/settings.json'
  const result = await migrateV1Sessions(sessionsDir, outputFile)
  console.log(`migrated ${result.users} user(s), skipped ${result.skipped} file(s) → ${outputFile}`)
}
