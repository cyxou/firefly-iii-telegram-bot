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
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

const MONTH_FIXTURES = {
  incomeTotals: [{ currency: 'EUR', amount: 4200 }],
  expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
  expenseByCategory: [
    { name: 'Rent', currency: 'EUR', amount: 550 },
    { name: 'Groceries', currency: 'EUR', amount: 612.4 },
  ],
} satisfies Parameters<typeof createTestFireflyService>[0]

async function setup(fixtures: Parameters<typeof createTestFireflyService>[0] = MONTH_FIXTURES) {
  // ONE fake closed over for the whole test (project memory: the bot calls
  // deps.firefly(settings) per update — an inline factory would reset state)
  const firefly = createTestFireflyService(fixtures)
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn) throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  const reports = () => bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.REPORTS')))
  return { bot, api, click, reports }
}

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, (c) => c.toLocaleUpperCase())
}

describe('reports feature', () => {
  it('renders the current-month summary with a descending category table', async () => {
    const { api, reports } = await setup()
    await reports()
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(dayjs()))
    expect(md).toContain('+4200.00 EUR')
    expect(md).toContain('−2871.35 EUR') // U+2212 minus
    expect(md).toContain('+1328.65 EUR') // net = 4200 − 2871.35
    // table headers from shared keys
    expect(md).toContain(i18n.t('en', 'tables.category'))
    expect(md).toContain(i18n.t('en', 'tables.amount'))
    // descending by amount: Groceries (612.40) before Rent (550.00)
    expect(md.indexOf('Groceries')).toBeLessThan(md.indexOf('Rent'))
  })

  it('attaches prev/next month nav and navigates statelessly', async () => {
    const { api, click, reports } = await setup()
    await reports()
    const prev = dayjs().subtract(1, 'month')
    await click(`<< ${monthLabel(prev)}`)
    const edits = api.getOutgoingRequests().filter((r) => r.method === 'editMessageText')
    expect(edits).toHaveLength(1)
    // the nav behavior under test: the message re-rendered for the PREVIOUS month
    // (the fake's insight fixtures are date-blind, so amounts repeat — only the
    // label proves the anchor moved)
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(prev))
    expect(md).not.toContain(monthLabel(dayjs()))
  })

  it('renders one Income/Expense/Net block per currency', async () => {
    const { api, reports } = await setup({
      incomeTotals: [
        { currency: 'EUR', amount: 100 },
        { currency: 'USD', amount: 50 },
      ],
      expenseTotals: [{ currency: 'EUR', amount: -30 }],
      expenseByCategory: [],
    })
    await reports()
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain('+100.00 EUR')
    expect(md).toContain('+70.00 EUR') // EUR net
    expect(md).toContain('+50.00 USD') // USD income and net are both +50 (no USD expenses)
    // no category rows → no table
    expect(md).not.toContain(`| ${i18n.t('en', 'tables.category')}`)
  })

  it('fully empty month renders the empty note', async () => {
    const { api, reports } = await setup({
      incomeTotals: [],
      expenseTotals: [],
      expenseByCategory: [],
    })
    await reports()
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(dayjs()))
    expect(md).toContain(i18n.t('en', 'reports.empty'))
  })

  it('gate: unconfigured user gets the settings prompt, not a report', async () => {
    const firefly = createTestFireflyService(MONTH_FIXTURES)
    const { bot } = createTestBot({ firefly }) // no settings seeded → unconfigured
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.REPORTS')))
    const send = api.getOutgoingRequests().find((r) => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain('Firefly URL')
    expect(api.getOutgoingRequests().some((r) => r.method === 'sendRichMessage')).toBe(false)
  })
})
