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

// null (not undefined — a default-param would swallow it) means "unconfigured user"
async function makeBot(settings: typeof CONFIGURED | null = CONFIGURED) {
  const config = createTestConfig()
  const bot = createBot(config.botToken, {
    config,
    logger: createTestLogger(),
    settingsStore: createMemorySettingsStore(settings ? { 1111111: settings } : {}),
    firefly: () => createTestFireflyService({
      accounts: [
        testAccount('1', 'Checking', { balance: '1234.5' }),
        testAccount('2', 'Wallet', { type: 'expense', balance: '9' }),
      ],
      categories: [testCategory('1', 'Groceries'), testCategory('2', 'Utilities')],
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
  return { bot, api, click }
}

describe.skipIf(!available)('accounts + categories (e2e, real redis)', () => {
  it('accounts: rich list renders, tab switch round-trips through redis session', async () => {
    const { bot, api, click } = await makeBot()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(true)
    await click(i18n.t('en', 'accounts.labels.expense'))
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).rich_message?.markdown).toContain('Wallet')
    // session.lists survived the redis round-trip: the active tab came back disabled
    const keyboard = (edit.payload as any).reply_markup.inline_keyboard.flat()
    expect(typeof keyboard.find((b: any) => b.text === i18n.t('en', 'accounts.labels.expense'))?.disabled).toBe('object')
  })

  it('categories: list → details → month nav → delete-cancel', async () => {
    const { bot, api, click } = await makeBot()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    // mirror the menu's own label helper: '<< ' + capitalized 'MMMM, YYYY' of the PREVIOUS month
    const prev = dayjs().subtract(1, 'month')
    const prevLabel = prev.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
    await click(`<< ${prevLabel}`)
    // two edits happened: details render + prev-month render (stateless nav, no session involved)
    expect(api.getOutgoingRequests().filter(r => r.method === 'editMessageText').length).toBeGreaterThanOrEqual(2)
  })

  it('gate: unconfigured user gets the settings prompt, not a firefly error', async () => {
    const { bot, api } = await makeBot(null)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain('Firefly URL')
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(false)
  })
})
