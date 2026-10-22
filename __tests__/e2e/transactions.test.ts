import { describe, expect, it } from 'vitest'
import { createBot } from '#root/bot/index.js'
import { redis } from '#root/lib/redis.js'
import { createSessionStorage } from '#root/lib/session.js'
import { createMemorySettingsStore, defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestConfig,
  createTestFireflyService,
  createTestLogger,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
  testAccount,
  testCategory,
} from '../helpers/bot.js'

// e2e/setup.ts may already have connected this shared instance — ioredis
// rejects a second connect() while connected, so only connect when needed.
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

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function makeBot() {
  const config = createTestConfig()
  const bot = createBot(config.botToken, {
    config,
    logger: createTestLogger(),
    settingsStore: createMemorySettingsStore({ 1111111: CONFIGURED }),
    firefly: () => createTestFireflyService({
      accounts: [
        testAccount('1', 'Checking', { type: 'asset', currencyId: '1', currencySymbol: 'USD' }),
        testAccount('2', 'Cash wallet', { type: 'Cash account', currencyId: '1', currencySymbol: 'USD' }),
        testAccount('3', 'EUR wallet', { type: 'asset', currencyId: '2', currencySymbol: 'EUR' }),
        testAccount('4', 'Employer', { type: 'revenue' }),
      ],
      categories: [testCategory('1', 'Food')],
      transactions: [],
    }),
    sessionStorage: createSessionStorage(),
  })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  const send = (text: string) => bot.handleUpdate(generateMessageUpdate(text))
  return { bot, api, click, send }
}

describe.skipIf(!available)('transactions (e2e, real redis)', () => {
  it('quick add: "Groceries 25" → withdrawal record; session survives (no flow leak)', async () => {
    const { api, send } = await makeBot()
    await send('Groceries 25')
    const reply = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((reply.payload as any).text).toContain('Groceries')
  })

  it('slow add round-trip through redis: amount → picker → category → record', async () => {
    const { api, click, send } = await makeBot()
    await send('12')
    await click('Food')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Food')
  })

  it('transfer with foreign amount: full submenu walk + typed amount + prompt deletion', async () => {
    const { api, bot, click, send } = await makeBot()
    await send('100')
    await click('↔️ New transfer')
    await click('Checking')
    await click('EUR wallet')
    await bot.handleUpdate(generateMessageUpdate('90'))
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
    const reply = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((reply.payload as any).text).toContain('90')
  })

  it('list: tabs + day nav re-render through redis-backed menus', async () => {
    const { api, click, send } = await makeBot()
    await send('🔀 Transactions')
    const first = api.getOutgoingRequests().find(r => r.method === 'sendRichMessage')
    expect(first).toBeDefined()
    await click('📥 Deposits')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).rich_message).toBeDefined()
  })
})
