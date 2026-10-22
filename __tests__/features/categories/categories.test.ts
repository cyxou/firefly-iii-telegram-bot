import type { TransactionRead } from '#root/lib/firefly/service.js'
import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  getLastRichMarkdown,
  initializeBot,
  setupMockApi,
  testCategory,
  testCategoryTransaction,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

const txnCalls: Array<{ id: string, start: string, end: string }> = []
let deletedIds: string[] = []

async function setup() {
  txnCalls.length = 0
  deletedIds = []
  const base = createTestFireflyService({
    categories: [testCategory('1', 'Groceries'), testCategory('2', 'Utilities'), testCategory('3', 'Clothes')],
    categoryTransactions: {
      1: [
        testCategoryTransaction('Supermarket', { amount: '40.10', date: '2026-10-05T10:00:00+00:00' }),
        testCategoryTransaction('Bakery', { amount: '5.20', date: '2026-10-12T10:00:00+00:00' }),
      ] as TransactionRead[],
    },
    categoryInsights: { 1: [{ currency: 'USD', difference: -45.3 }] },
  })
  // wrap (not shadow): the fake's mutating deleteCategory must still run so the
  // re-rendered list reflects the deletion — we only add call recording on top
  const firefly: typeof base = {
    ...base,
    async listTransactionsByCategory(id, start, end) {
      txnCalls.push({ id, start, end })
      return base.listTransactionsByCategory(id, start, end)
    },
    async deleteCategory(id) {
      deletedIds.push(id)
      await base.deleteCategory(id)
    },
  }
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
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

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

describe('categories feature', () => {
  it('lists categories two per row with Add + Done', async () => {
    const { bot, api } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain(i18n.t('en', 'categories.list').slice(0, 15))
    const rows = (send.payload as any).reply_markup.inline_keyboard as { text: string }[][]
    expect(rows[0].map(b => b.text)).toEqual(['Groceries', 'Utilities'])
    expect(rows[1].map(b => b.text)).toEqual(['Clothes']) // odd count: last one alone (v1 layout)
    expect(rows[2].map(b => b.text)).toEqual([i18n.t('en', 'labels.ADD_CATEGORIES')])
    expect(rows[3].map(b => b.text)).toEqual([i18n.t('en', 'labels.DONE')])
  })

  it('details: rich transaction table + insight sums + month nav', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')

    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(markdown).toContain('*Groceries*')
    expect(markdown).toContain('| Bakery | 5.20 $ |') // newest first (v1 .reverse())
    expect(markdown).toContain('45.3 USD') // Math.abs of insight difference
    expect(markdown).toMatch(/\n\n\|/) // table must start its own block (live bug 8wh)

    // month nav is stateless: prev-month click refetches the previous range
    await click(`<< ${monthLabel(dayjs().subtract(1, 'month'))}`)
    expect(txnCalls.at(-1)!.start).toBe(dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'))
  })

  it('delete: confirm screen, YES deletes with toast, list re-renders without the category', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click(i18n.t('en', 'labels.DELETE'))
    const confirm = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((confirm.payload as any).text).toContain(i18n.t('en', 'categories.confirmDeletion').slice(0, 15))

    await click(i18n.t('en', 'labels.YES'))
    expect(deletedIds).toEqual(['1'])
    const answered = api.getOutgoingRequests().filter(r => r.method === 'answerCallbackQuery').at(-1)!
    expect((answered.payload as any).text).toBe(i18n.t('en', 'categories.deleted'))
    const listReRender = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    const rows = (listReRender.payload as any).reply_markup.inline_keyboard.flat() as { text: string }[]
    expect(rows.some(b => b.text === 'Groceries')).toBe(false)
    expect(rows.some(b => b.text === 'Utilities')).toBe(true)
  })

  it('delete-cancel returns to the details view of the same month', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click(i18n.t('en', 'labels.DELETE'))
    await click(i18n.t('en', 'labels.CANCEL'))
    expect(getLastRichMarkdown(api.getOutgoingRequests())).toContain('*Groceries*')
  })

  it('done deletes the list message', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click(i18n.t('en', 'labels.DONE'))
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
  })
})

describe('categories flows', () => {
  it('add: multi-line input → confirm screen → YES creates each and toasts', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click(i18n.t('en', 'labels.ADD_CATEGORIES'))
    let last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.typeCategories').slice(0, 12))

    await bot.handleUpdate(generateMessageUpdate('Food\nFuel'))
    last = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((last.payload as any).text).toContain('2 new category(s)') // v1 copy, unchanged
    expect((last.payload as any).text).toContain('Food')

    await click(i18n.t('en', 'labels.YES'))
    const answered = api.getOutgoingRequests().filter(r => r.method === 'answerCallbackQuery').at(-1)!
    expect((answered.payload as any).text).toBe(i18n.t('en', 'categories.created'))
    const listReRender = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    const labels = ((listReRender.payload as any).reply_markup.inline_keyboard as { text: string }[][]).flat().map(b => b.text)
    expect(labels).toContain('Food')
    expect(labels).toContain('Fuel')
  })

  it('add: DECLINE re-prompts, CANCEL returns to the list with an empty flow', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click(i18n.t('en', 'labels.ADD_CATEGORIES'))
    await bot.handleUpdate(generateMessageUpdate('Food'))
    await click(i18n.t('en', 'labels.DECLINE_CATEGORIES_LIST'))
    let last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.typeCategories').slice(0, 12))

    await click(i18n.t('en', 'labels.CANCEL'))
    last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.list').slice(0, 12))
    // flow cleared: plain text no longer routes into the add flow
    await bot.handleUpdate(generateMessageUpdate('not categories input'))
    const texts = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').map(r => (r.payload as any).text)
    expect(texts.at(-1)).toContain(i18n.t('en', 'help').slice(0, 8))
  })

  it('rename: from details, new name updates the category and returns to the list', async () => {
    const renamed: Array<{ id: string, name: string }> = []
    const { bot } = createTestBot({
      settings: CONFIGURED,
      firefly: createTestFireflyService(
        { categories: [testCategory('1', 'Groceries')] },
        {
          updateCategory: async (id, name) => {
            renamed.push({ id, name })
          },
        },
      ),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    const click = async (label: string) => {
      const btn = findButton(api.getOutgoingRequests(), label)
      if (!btn)
        throw new Error(`button not found: ${label}`)
      await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
    }
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click(i18n.t('en', 'labels.RENAME_CATEGORY'))
    let last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.typeNewName').slice(0, 8))

    await bot.handleUpdate(generateMessageUpdate('Groceries & Stuff'))
    expect(renamed).toEqual([{ id: '1', name: 'Groceries & Stuff' }])
    last = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.list').slice(0, 12))
    expect((last.payload as any).reply_markup).toBeDefined()
  })
})
