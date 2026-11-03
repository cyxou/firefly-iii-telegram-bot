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
    // one summary row per currency, bare amounts (currency is its own column);
    // net = 4200 − 2871.35, minus is U+2212
    expect(md).toContain(`| EUR | +4200.00 | −2871.35 | +1328.65 |`)
    // summary table headers from shared keys
    expect(md).toContain(`| ${i18n.t('en', 'tables.currency')} | ${i18n.t('en', 'tables.income')} | ${i18n.t('en', 'tables.expense')} | ${i18n.t('en', 'tables.net')} |`)
    // category table headers from shared keys
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

  it('renders one summary table row per currency', async () => {
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
    expect(md).toContain(`| EUR | +100.00 | −30.00 | +70.00 |`)
    // USD has no expenses → zero expense keeps the − sign; income and net are both +50
    expect(md).toContain(`| USD | +50.00 | −0.00 | +50.00 |`)
    // no category rows → no category table
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

describe('reports menu v2', () => {
  it('renders the type switcher and Done button; payloads fit Telegram 64-byte limit', async () => {
    const { api, reports } = await setup()
    await reports()
    for (const key of ['VIEW_MONTHLY', 'VIEW_TREND', 'VIEW_AUDIT', 'VIEW_NET_WORTH', 'VIEW_BUDGETS', 'VIEW_SUBSCRIPTIONS', 'VIEW_PIGGY'] as const) {
      const btn = findButton(api.getOutgoingRequests(), i18n.t('en', `labels.${key}`))
      expect(btn, key).toBeDefined()
      expect(btn!.data.length).toBeLessThanOrEqual(64)
    }
    expect(findButton(api.getOutgoingRequests(), i18n.t('en', 'labels.DONE'))).toBeDefined()
  })

  it('month nav row appears for monthly but not for piggy', async () => {
    const { api, click, reports } = await setup()
    await reports()
    expect(api.getOutgoingRequests().some((r) => JSON.stringify(r.payload).includes('<< '))).toBe(true)
    await click(i18n.t('en', 'labels.VIEW_PIGGY'))
    const edits = api.getOutgoingRequests().filter((r) => r.method === 'editMessageText')
    expect(edits).toHaveLength(1)
    expect(JSON.stringify(edits[0]!.payload)).not.toContain('<< ')
  })

  it('nav keeps the current type in the payload', async () => {
    const { api, click, reports } = await setup()
    await reports()
    await click(i18n.t('en', 'labels.VIEW_AUDIT'))
    const prev = dayjs().subtract(1, 'month')
    await click(`<< ${monthLabel(prev)}`)
    // audit is a NAV type: the prev button survived the first edit
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(prev))
  })

  it('Done deletes the report message', async () => {
    const { api, click, reports } = await setup()
    await reports()
    await click(i18n.t('en', 'labels.DONE'))
    expect(api.getOutgoingRequests().some((r) => r.method === 'deleteMessage')).toBe(true)
  })
})

describe('net worth view', () => {
  it('shows per-currency totals and asset account balances as of month end', async () => {
    const accounts = [
      {
        id: '1',
        type: 'account',
        attributes: {
          name: 'Сбер кубышка',
          type: 'asset',
          active: true,
          current_balance: '180424.93',
          currency_code: 'RUB',
        },
      },
    ] as unknown as NonNullable<Parameters<typeof createTestFireflyService>[0]>['accounts']
    const { api, click, reports } = await setup({
      ...MONTH_FIXTURES,
      netWorth: [
        { currency: 'RUB', amount: 880424.93 },
        { currency: 'BYN', amount: -70.87 },
      ],
      accounts,
    })
    await reports()
    await click(i18n.t('en', 'labels.VIEW_NET_WORTH'))
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(i18n.t('en', 'reports.netWorthTitle', { monthName: monthLabel(dayjs()) }))
    expect(md).toContain('| RUB | +880424.93 |')
    expect(md).toContain('| BYN | −70.87 |')
    expect(md).toContain('Сбер кубышка')
    expect(md).toContain('180424.93 RUB')
  })

  it('empty instance renders the generic empty note', async () => {
    const { api, click, reports } = await setup({
      ...MONTH_FIXTURES,
      netWorth: [],
      accounts: [],
    })
    await reports()
    await click(i18n.t('en', 'labels.VIEW_NET_WORTH'))
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(i18n.t('en', 'reports.emptyGeneric'))
  })
})

describe('budgets view', () => {
  it('joins budgets with limits, marks missing limits, footers unbudgeted spend', async () => {
    const { api, click, reports } = await setup({
      ...MONTH_FIXTURES,
      budgetRows: [
        { name: 'Food', currency: 'EUR', limit: 500, spent: 612.4 },
        { name: 'Fun', currency: 'EUR', limit: null, spent: 50 },
      ],
      expenseNoBudget: [{ currency: 'EUR', amount: -30 }],
    })
    await reports()
    await click(i18n.t('en', 'labels.VIEW_BUDGETS'))
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(
      i18n.t('en', 'reports.budgetsTitle', { monthName: monthLabel(dayjs()) }),
    )
    // Food: over limit → negative left with U+2212
    expect(md).toContain('| Food | EUR | 500.00 | 612.40 | −112.40 |')
    // Fun: no limit → em-dashes, still shows spend
    expect(md).toContain('| Fun | EUR | — | 50.00 | — |')
    expect(md).toContain(`${i18n.t('en', 'reports.unbudgeted')}: 30.00 EUR`)
  })

  it('no budgets at all renders the generic empty note', async () => {
    const { api, click, reports } = await setup({ ...MONTH_FIXTURES, budgetRows: [] })
    await reports()
    await click(i18n.t('en', 'labels.VIEW_BUDGETS'))
    expect(getLastRichMarkdown(api.getOutgoingRequests())!).toContain(
      i18n.t('en', 'reports.emptyGeneric'),
    )
  })
})

describe('subscriptions view', () => {
  it('lists active subscriptions sorted by next expected date, nulls last', async () => {
    const { api, click, reports } = await setup({
      ...MONTH_FIXTURES,
      subscriptions: [
        { name: 'Rent', currency: 'EUR', amount: 550, nextExpected: null, repeatFreq: 'monthly' },
        {
          name: 'Netflix',
          currency: 'EUR',
          amount: 12.99,
          nextExpected: '2026-11-15',
          repeatFreq: 'monthly',
        },
        { name: 'Gym', currency: 'EUR', amount: 30, nextExpected: '2026-11-10', repeatFreq: 'weekly' },
      ],
    })
    await reports()
    await click(i18n.t('en', 'labels.VIEW_SUBSCRIPTIONS'))
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(i18n.t('en', 'reports.subsTitle'))
    expect(md).toContain('| Gym | 30.00 EUR | 2026-11-10 | weekly |')
    expect(md).toContain('| Netflix | 12.99 EUR | 2026-11-15 | monthly |')
    expect(md).toContain('| Rent | 550.00 EUR | — | monthly |')
    expect(md.indexOf('Gym')).toBeLessThan(md.indexOf('Rent'))
  })

  it('no subscriptions renders the generic empty note', async () => {
    const { api, click, reports } = await setup({ ...MONTH_FIXTURES, subscriptions: [] })
    await reports()
    await click(i18n.t('en', 'labels.VIEW_SUBSCRIPTIONS'))
    expect(getLastRichMarkdown(api.getOutgoingRequests())!).toContain(
      i18n.t('en', 'reports.emptyGeneric'),
    )
  })
})
