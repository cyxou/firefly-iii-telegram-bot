import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
  testAccount,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function setupReal(fixtures: { accounts?: ReturnType<typeof testAccount>[] } = {}) {
  const firefly = createTestFireflyService({
    accounts: fixtures.accounts ?? [
      testAccount('1', 'Checking', { type: 'asset' }),
      testAccount('2', 'Cash wallet', { type: 'Cash account' }),
    ],
  })
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  return { bot, api, firefly }
}

describe('quick add (description + amount)', () => {
  it('stores a withdrawal via default accounts and replies the record', async () => {
    const { bot, firefly } = await setupReal()
    await bot.handleUpdate(generateMessageUpdate('Groceries 25'))
    // the fake's storeTransaction appends to the array listTransactions filters,
    // so a list call doubles as the assertion on what was stored
    const created = await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    expect(created).toHaveLength(1)
    const split = created[0]!.attributes.transactions![0]!
    expect(split.type).toBe('withdrawal')
    expect(split.amount).toBe('25')
    expect(split.description).toBe('Groceries')
    expect(split.source_id).toBe('1')
    expect(split.destination_id).toBe('2')
    expect(dayjs(split.date).format('YYYY-MM-DD')).toBe(dayjs().format('YYYY-MM-DD'))
  })

  it('record reply carries description, amount and account names (Markdown)', async () => {
    const { bot, api } = await setupReal()
    await bot.handleUpdate(generateMessageUpdate('Groceries 25'))
    const send = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((send.payload as any).parse_mode).toBe('Markdown')
    expect((send.payload as any).text).toContain('Groceries')
    expect((send.payload as any).text).toContain('Checking → Cash wallet')
  })

  it('arithmetic amount is evaluated (Lunch 10+5)', async () => {
    const { bot, firefly } = await setupReal()
    await bot.handleUpdate(generateMessageUpdate('Lunch 10+5'))
    const created = await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    expect(created[0]!.attributes.transactions![0]!.amount).toBe('15')
  })

  it('no asset accounts → guidance reply with an open-in-browser url button', async () => {
    const { bot, api } = await setupReal({ accounts: [] })
    await bot.handleUpdate(generateMessageUpdate('Groceries 25'))
    const send = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((send.payload as any).text).toContain('Asset accounts')
    const kb = (send.payload as any).reply_markup.inline_keyboard as { text: string, url?: string }[][]
    expect(kb.flat().find(b => b.url)?.url).toBe('https://ff.example.com/accounts/asset')
  })

  it('garbage text → dontUnderstand', async () => {
    const { bot, api } = await setupReal()
    await bot.handleUpdate(generateMessageUpdate('hello world'))
    const send = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((send.payload as any).text).toContain('don\'t understand')
  })
})
