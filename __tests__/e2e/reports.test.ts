import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
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

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

async function makeBot() {
  const config = createTestConfig()
  // ONE fake for the bot's lifetime — deps.firefly(settings) runs per update;
  // an inline factory would reset fixtures between updates (project memory)
  const firefly = createTestFireflyService({
    incomeTotals: [{ currency: 'EUR', amount: 4200 }],
    expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
    expenseByCategory: [
      { name: 'Groceries', currency: 'EUR', amount: 612.4 },
      { name: 'Rent', currency: 'EUR', amount: 550 },
    ],
  })
  const bot = createBot(config.botToken, {
    config,
    logger: createTestLogger(),
    settingsStore: createMemorySettingsStore({ 1111111: CONFIGURED }),
    firefly: () => firefly,
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
  return { bot, api, click }
}

describe.skipIf(!available)('reports (e2e, real redis)', () => {
  it('reports label renders the summary; month nav round-trips without session', async () => {
    const { bot, api, click } = await makeBot()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.REPORTS')))
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(true)
    const prev = dayjs().subtract(1, 'month')
    await click(`<< ${monthLabel(prev)}`)
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).rich_message?.markdown).toContain(monthLabel(prev))
    expect((edit.payload as any).rich_message?.markdown).not.toContain(monthLabel(dayjs()))
  })
})
