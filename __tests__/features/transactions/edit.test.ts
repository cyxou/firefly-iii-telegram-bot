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
  testCategory,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function setupEdit() {
  const firefly = createTestFireflyService({
    accounts: [
      testAccount('1', 'Checking', { type: 'asset', currencyId: '1', currencySymbol: '$' }),
      testAccount('2', 'Cash wallet', { type: 'Cash account' }),
      testAccount('3', 'EUR wallet', { type: 'asset', currencyId: '2', currencySymbol: '€' }),
    ],
    categories: [testCategory('1', 'Food'), testCategory('2', 'Fun')],
    transactions: [],
  })
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  const send = (text: string) => bot.handleUpdate(generateMessageUpdate(text))
  return { bot, api, firefly, click, send }
}

describe('record menu + edit shell', () => {
  it('record reply carries a ✏️ Edit button whose payload is the new transaction id', async () => {
    const { api, send } = await setupEdit()
    await send('Groceries 25')
    const btn = findButton(api.getOutgoingRequests(), '✏️ Edit')
    expect(btn).toBeDefined()
    expect(btn!.data).toContain('200') // fake ids start at 200
  })

  it('edit opens the edit shell; open-in-browser URL points at the transaction', async () => {
    const { api, click, send } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    const last = api.getOutgoingRequests().at(-1)!
    const kb = (last.payload as any).reply_markup.inline_keyboard as { text: string, url?: string }[][]
    expect(kb.flat().find(b => b.url)?.url).toBe('https://ff.example.com/transactions/show/200')
    expect(kb.flat().some(b => b.text === '🔙 Back')).toBe(true)
  })

  it('🔙 Back re-renders the record with the Edit button again', async () => {
    const { api, click, send } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔙 Back')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
    expect(findButton(api.getOutgoingRequests(), '✏️ Edit')).toBeDefined()
  })
})
