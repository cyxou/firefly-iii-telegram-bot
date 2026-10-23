import { describe, expect, it } from 'vitest'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
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

// currencyId drives the foreign-amount branch — EUR wallet must differ from
// the USD accounts' default '1'
const ACCOUNTS = [
  testAccount('1', 'Checking', { type: 'asset' }),
  testAccount('2', 'Savings USD', { type: 'asset', currencySymbol: 'USD' }),
  testAccount('3', 'EUR wallet', { type: 'asset', currencySymbol: 'EUR', currencyId: '2' }),
  testAccount('4', 'Employer', { type: 'revenue' }),
  testAccount('5', 'Loan', { type: 'liability' }),
]

async function setup(accounts = ACCOUNTS) {
  const firefly = createTestFireflyService({ accounts })
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return {
    bot,
    api,
    click,
    firefly,
    sendText: (t: string) => bot.handleUpdate(generateMessageUpdate(t)),
  }
}

describe('deposit flow', () => {
  it('revenue → asset stores a deposit and shows the record', async () => {
    const { api, click, sendText, firefly } = await setup()
    await sendText('100')
    await click('📥 New deposit')
    await click('Employer')
    await click('Checking')
    const created = await firefly.listTransactions('deposit' as never, '2000-01-01', '2999-12-31')
    const split = created[0]!.attributes.transactions![0]!
    expect(split.source_id).toBe('4')
    expect(split.destination_id).toBe('1')
    expect(split.amount).toBe('100')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Employer → Checking')
  })
})

describe('transfer flow', () => {
  it('same currency: asset → asset stores a transfer immediately', async () => {
    const { click, sendText, firefly } = await setup()
    await sendText('50')
    await click('↔️ New transfer')
    await click('Savings USD')
    await click('Checking')
    const created = await firefly.listTransactions('transfer' as never, '2000-01-01', '2999-12-31')
    expect(created).toHaveLength(1)
    expect(created[0]!.attributes.transactions![0]!.destination_id).toBe('1')
  })

  it('skips the chosen source in the destination list', async () => {
    const { api, click, sendText } = await setup()
    await sendText('50')
    await click('↔️ New transfer')
    await click('Savings USD')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    const kb = (edit.payload as any).reply_markup.inline_keyboard as { text: string }[][]
    expect(kb.flat().map(b => b.text)).not.toContain('Savings USD')
    expect(kb.flat().map(b => b.text)).toContain('Checking')
  })

  it('different currencies: foreign-amount prompt → typed amount stores transfer with foreign fields', async () => {
    const { api, bot, click, sendText, firefly } = await setup()
    await sendText('100')
    await click('↔️ New transfer')
    await click('Savings USD')
    await click('EUR wallet')
    const prompt = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((prompt.payload as any).text).toContain('EUR')
    await bot.handleUpdate(generateMessageUpdate('*0.9'))
    const created = await firefly.listTransactions('transfer' as never, '2000-01-01', '2999-12-31')
    const split = created[0]!.attributes.transactions![0]!
    expect(split.foreign_amount).toBe('90')
    expect(split.foreign_currency_id).toBeDefined()
    // the prompt message is deleted after the record lands
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
    const reply = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((reply.payload as any).text).toContain('90')
  })

  it('bad foreign amount → badAmountTyped, flow stays retryable', async () => {
    const { api, bot, click, sendText, firefly } = await setup()
    await sendText('100')
    await click('↔️ New transfer')
    await click('Savings USD')
    await click('EUR wallet')
    await bot.handleUpdate(generateMessageUpdate('not a number'))
    const reply = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((reply.payload as any).text).toContain('amount should be a number')
    await bot.handleUpdate(generateMessageUpdate('88'))
    const created = await firefly.listTransactions('transfer' as never, '2000-01-01', '2999-12-31')
    expect(created[0]!.attributes.transactions![0]!.foreign_amount).toBe('88')
  })
})
