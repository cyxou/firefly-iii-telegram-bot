import { describe, expect, it } from 'vitest'
import { redis } from '#root/lib/redis.js'
import { createSessionStorage } from '#root/lib/session.js'

// e2e/setup.ts may already have connected this shared instance — ioredis
// rejects a second connect() while connected, so only connect when needed.
const available = await (async () => {
  try {
    if (redis.status !== 'ready') await redis.connect()
    await redis.ping()
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!available)('redis session storage (e2e)', () => {
  it('writes and reads a session key', async () => {
    const storage = createSessionStorage()
    await storage.write('e2e-key', {
      settingsFlow: { step: 'url' },
    })
    expect(await storage.read('e2e-key')).toEqual({
      settingsFlow: { step: 'url' },
    })
    await storage.delete('e2e-key')
    expect(await storage.read('e2e-key')).toBeUndefined()
  })
})
