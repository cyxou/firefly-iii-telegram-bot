import { describe, expect, it } from 'vitest'
import { createBot } from '#root/bot/index.js'
import { redis } from '#root/lib/redis.js'
import { createSessionStorage } from '#root/lib/session.js'
import { createMemorySettingsStore } from '#root/lib/settings-store.js'
import {
  createTestConfig,
  createTestFireflyService,
  createTestLogger,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
} from '../helpers/bot.js'

// Same shared-redis probe discipline as session-storage.test.ts: setup.ts may
// already have connected; a second connect() throws and must not self-skip us.
const available = await (async () => {
  try {
    if (redis.status !== 'ready')
      await redis.connect()
    await redis.ping()
    return true
  }
  catch {
    return false
  }
})()

describe.skipIf(!available)('settings flow (e2e, real redis)', () => {
  it('persists the firefly url through a redis-backed session', async () => {
    const settingsStore = createMemorySettingsStore()
    const bot = createBot(createTestConfig().botToken, {
      config: createTestConfig(),
      logger: createTestLogger(),
      settingsStore,
      firefly: () => createTestFireflyService(),
      sessionStorage: createSessionStorage(),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/settings', { isCommand: true }))
    const btn = findButton(api.getOutgoingRequests(), '🔗 Firefly URL')
    await bot.handleUpdate(generateCallbackQueryUpdate(btn!.data, { messageId: btn!.messageId }))
    await bot.handleUpdate(generateMessageUpdate('https://ff.example.com'))
    expect((await settingsStore.get(1111111))?.fireflyUrl).toBe('https://ff.example.com')
  })
})
