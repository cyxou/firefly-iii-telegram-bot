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
    if (!btn) throw new Error(`button not found: ${label}`)
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
    const kb = (last.payload as any).reply_markup.inline_keyboard as {
      text: string
      url?: string
    }[][]
    expect(kb.flat().find((b) => b.url)?.url).toBe('https://ff.example.com/transactions/show/200')
    expect(kb.flat().some((b) => b.text === '🔙 Back')).toBe(true)
  })

  it('🔙 Back re-renders the record with the Edit button again', async () => {
    const { api, click, send } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔙 Back')
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
    expect(findButton(api.getOutgoingRequests(), '✏️ Edit')).toBeDefined()
  })

  it('localhost fireflyUrl: edit shell renders without the URL button (Telegram vetoes dotless hosts)', async () => {
    const firefly = createTestFireflyService({
      accounts: [
        testAccount('1', 'Checking', { type: 'asset' }),
        testAccount('2', 'Cash wallet', { type: 'Cash account' }),
      ],
      transactions: [],
    })
    const { bot } = createTestBot({
      settings: defaultSettings({
        fireflyUrl: 'http://localhost:8888',
        fireflyApiUrl: 'http://localhost:8888/api',
        fireflyAccessToken: 'x'.repeat(500),
      }),
      firefly,
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('Groceries 25'))
    const btn = findButton(api.getOutgoingRequests(), '✏️ Edit')!
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
    // no error-boundary reply — the menu opened, minus the unusable URL button
    expect(
      api
        .getOutgoingRequests()
        .some(
          (r) => r.method === 'sendMessage' && (r.payload as any).text === 'An error occurred!',
        ),
    ).toBe(false)
    expect(findButton(api.getOutgoingRequests(), '🔖 Category')).toBeDefined()
    expect(api.getOutgoingRequests().slice(-1)[0]!.method).toBe('editMessageReplyMarkup')
    const kb = (api.getOutgoingRequests().at(-1)!.payload as any).reply_markup.inline_keyboard as {
      url?: string
    }[][]
    expect(kb.flat().some((b) => b.url !== undefined)).toBe(false)
  })
})

describe('edit category', () => {
  it('picker lists categories; picking one updates and re-renders the record', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔖 Category')
    await click('Food')
    const updated = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!
    expect(updated.attributes.transactions![0]!.category_id).toBe('1')
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((edit.payload as any).text).toContain('Food')
  })

  it('🔙 from the picker returns to the record without updating', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔖 Category')
    await click('🔙')
    const updated = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!
    // buildSplit sent category_id: '' (v1: Firefly treats '' as absent) — the
    // untouched stored value IS that empty string, i.e. no category was set
    expect(updated.attributes.transactions![0]!.category_id).toBe('')
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
  })
})

describe('edit accounts', () => {
  it('source picker skips the current destination; picking EUR wallet also syncs currency', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25') // withdrawal: source=1 Checking, dest inferred (Cash wallet)
    await click('✏️ Edit')
    await click('📤 Source account')
    // the prompt text swaps in (v1 chooseNewSourceAccount)
    const prompt = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((prompt.payload as any).text).toContain('source account')
    await click('EUR wallet')
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    expect(split.source_id).toBe('3')
    expect(split.currency_id).toBe('2') // v1: transaction follows the new source's currency
  })

  it('destination picker lists cash accounts; picking one updates destination', async () => {
    const { click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('📥 Destination account')
    await click('Cash wallet')
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    expect(split.destination_id).toBe('2')
  })
})

describe('edit amount/description text flows', () => {
  it('amount: prompt → text → update, prompt deleted, fresh record', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    const prompt = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((prompt.payload as any).text).toContain('amount')
    await send('30')
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    expect(split.amount).toBe('30')
    expect(api.getOutgoingRequests().some((r) => r.method === 'deleteMessage')).toBe(true)
    const reply = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'sendMessage')
      .at(-1)!
    expect((reply.payload as any).text).toContain('30')
  })

  it('amount composes with current (v1): "+5" on 25 → 30', async () => {
    const { click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await send('+5')
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    expect(split.amount).toBe('30')
  })

  it('bad amount stays in the flow and retries', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await send('abc')
    const err = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'sendMessage')
      .at(-1)!
    expect((err.payload as any).text).toContain('amount')
    await send('40')
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    expect(split.amount).toBe('40')
  })

  it('description: prompt → text → update', async () => {
    const { click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('📝 Description')
    await send('Beer')
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    expect(split.description).toBe('Beer')
  })

  it('🔙 on the prompt cancels: editFlow cleared, record re-rendered, next text is a NEW add', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await click('🔙')
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
    await send('Cinema 9')
    const all = await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    expect(all).toHaveLength(2) // second text was parsed as a new quick add, not an edit
  })
})

describe('edit date (stateless calendar)', () => {
  async function openCalendar(
    click: (l: string) => Promise<void>,
    send: (t: string) => Promise<unknown>,
  ) {
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('📆 Date')
  }

  it('renders the current month with a day button per date', async () => {
    const { api, click, send } = await setupEdit()
    await openCalendar(click, send)
    const day10 =
      findButton(api.getOutgoingRequests(), '10') ?? findButton(api.getOutgoingRequests(), '10*') // today renders '10*'
    expect(day10).toBeDefined()
    expect(findButton(api.getOutgoingRequests(), '‹')).toBeDefined()
  })

  it('‹ navigates to the previous month (payload-driven, no session)', async () => {
    const { api, bot, click, send } = await setupEdit()
    await openCalendar(click, send)
    const btn = findButton(api.getOutgoingRequests(), '‹')!
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
    // the re-rendered keyboard shows the previous month's label
    const dayjs = (await import('dayjs')).default
    const prevLabel = dayjs().subtract(1, 'month').format('MMMM YYYY')
    const kb = (api.getOutgoingRequests().at(-1)!.payload as any).reply_markup.inline_keyboard as {
      text: string
    }[][]
    expect(kb.flat().some((b) => b.text === prevLabel)).toBe(true)
  })

  it('picking a day updates the transaction date', async () => {
    const { api, bot, click, send, firefly } = await setupEdit()
    await openCalendar(click, send)
    const day15 =
      findButton(api.getOutgoingRequests(), '15') ?? findButton(api.getOutgoingRequests(), '15*')
    await bot.handleUpdate(
      generateCallbackQueryUpdate(day15!.data, { messageId: day15!.messageId }),
    )
    const split = (
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    )[0]!.attributes.transactions![0]!
    const dayjs = (await import('dayjs')).default
    expect(dayjs(split.date).format('D')).toBe('15')
    expect(dayjs(split.date).format('YYYY-MM')).toBe(dayjs().format('YYYY-MM'))
  })

  it('month label opens the year view; picking a year returns to months', async () => {
    const { api, bot, click, send } = await setupEdit()
    await openCalendar(click, send)
    const dayjs = (await import('dayjs')).default
    const label = findButton(api.getOutgoingRequests(), dayjs().format('MMMM YYYY'))!
    await bot.handleUpdate(generateCallbackQueryUpdate(label.data, { messageId: label.messageId }))
    const yearBtn = findButton(api.getOutgoingRequests(), `[${dayjs().year()}]`)
    expect(yearBtn).toBeDefined() // the active year renders bracketed (v1 [YYYY])
    await bot.handleUpdate(
      generateCallbackQueryUpdate(yearBtn!.data, { messageId: yearBtn!.messageId }),
    )
    expect(findButton(api.getOutgoingRequests(), '‹')).toBeDefined() // back in month view
  })
})

describe('delete confirmation', () => {
  it('delete asks for confirmation; CANCEL returns to the record', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('❌ Delete')
    const confirm = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((confirm.payload as any).text).toContain('Are you sure')
    await click('✖ Cancel')
    expect(
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'),
    ).toHaveLength(1)
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
  })

  it('confirming deletes the transaction and removes the message', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('❌ Delete')
    await click('✅ Yes')
    expect(
      await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'),
    ).toHaveLength(0)
    expect(api.getOutgoingRequests().some((r) => r.method === 'deleteMessage')).toBe(true)
  })
})
