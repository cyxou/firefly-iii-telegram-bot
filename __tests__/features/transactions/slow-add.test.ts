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

async function setup(categories = [testCategory('1', 'Food'), testCategory('2', 'Rent'), testCategory('3', 'Fun')]) {
  const firefly = createTestFireflyService({
    accounts: [testAccount('1', 'Checking', { type: 'asset' })],
    categories,
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
  const sendText = async (text: string) => bot.handleUpdate(generateMessageUpdate(text))
  return { bot, api, click, sendText, firefly }
}

describe('slow add (amount only → category picker)', () => {
  it('amount-only replies selectCategory with the picker keyboard', async () => {
    const { api, sendText } = await setup()
    await sendText('25')
    const send = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((send.payload as any).text).toContain('25')
    const kb = (send.payload as any).reply_markup.inline_keyboard as { text: string }[][]
    for (const c of ['Food', 'Rent', 'Fun'])
      expect(kb.flat().map(b => b.text)).toContain(c)
  })

  it('category click stores the withdrawal and edits the message into the record', async () => {
    const { api, click, sendText, firefly } = await setup()
    await sendText('25')
    await click('Food')
    const created = await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    const split = created[0]!.attributes.transactions![0]!
    expect(split.category_id).toBe('1')
    expect(split.amount).toBe('25')
    expect(split.source_id).toBe('1')
    expect(split.destination_id).toBeUndefined() // v1: slow mode sends no destination
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).parse_mode).toBe('Markdown')
    expect((edit.payload as any).text).toContain('Food')
  })

  it('picker paginates client-side: 25 categories → 20 on page 1, >> shows the rest', async () => {
    const many = Array.from({ length: 25 }, (_, i) => testCategory(String(i + 1), `Cat ${String(i + 1).padStart(2, '0')}`))
    const { api, click, sendText } = await setup(many)
    await sendText('25')
    let kb = lastKeyboard(api)
    expect(kb.map(b => b.text)).toContain('Cat 20')
    expect(kb.map(b => b.text)).not.toContain('Cat 21')
    expect(kb.map(b => b.text)).toContain('>>')
    await click('>>')
    kb = lastKeyboard(api)
    expect(kb.map(b => b.text)).toContain('Cat 21')
    expect(kb.map(b => b.text)).toContain('Cat 25')
    expect(kb.map(b => b.text)).toContain('<<')
    expect(kb.map(b => b.text)).not.toContain('>>') // last page: no next
  })

  it('stale picker click after the flow ended → clean error edit, no store', async () => {
    const { api, bot, sendText, firefly } = await setup()
    await sendText('25')
    const btn = findButton(api.getOutgoingRequests(), 'Food')!
    // a later quick transaction clears txnFlow, then the old keyboard is clicked
    await bot.handleUpdate(generateMessageUpdate('Stuff 9'))
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
    const created = await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    expect(created).toHaveLength(1) // only the quick one
  })
})

function lastKeyboard(api: ReturnType<typeof setupMockApi>) {
  // menu.update() re-renders via editMessageReplyMarkup — include it
  const req = api.getOutgoingRequests()
    .filter(r => ['sendMessage', 'editMessageText', 'editMessageReplyMarkup'].includes(r.method))
    .at(-1)!
  return ((req.payload as any).reply_markup.inline_keyboard as { text: string }[][]).flat() as { text: string }[]
}
