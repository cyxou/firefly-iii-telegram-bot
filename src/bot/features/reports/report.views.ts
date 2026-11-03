import type { Context } from '#root/bot/context.js'
import type { ReportType } from './report.menu.js'
import dayjs from 'dayjs'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'

// moved verbatim from report.menu.ts (monthly view, v1)
export function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, (c) => c.toLocaleUpperCase())
}

export function bare(amount: number): string {
  return Math.abs(amount).toFixed(2)
}

async function reportMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [expenseTotals, incomeTotals, byCategory] = await Promise.all([
    ctx.firefly.insightExpenseTotal(start, end),
    ctx.firefly.insightIncomeTotal(start, end),
    ctx.firefly.insightExpenseByCategory(start, end),
  ])

  const lines = [
    ctx.i18n.t('reports.title', {
      monthName: escapeRichMarkdown(monthLabel(anchor)),
    }),
  ]
  const currencies = [...new Set([...incomeTotals, ...expenseTotals].map((t) => t.currency))]

  if (!currencies.length) {
    lines.push('', ctx.i18n.t('reports.empty'))
    return lines.join('\n')
  }

  // One row per currency; expense amounts arrive signed-negative from the API.
  // Table, not prose lines: in the markdown flavor Telegram renders, consecutive
  // lines form one paragraph and their breaks collapse to spaces.
  const rows = currencies.map((currency) => {
    const income = incomeTotals.find((t) => t.currency === currency)?.amount ?? 0
    const expense = expenseTotals.find((t) => t.currency === currency)?.amount ?? 0
    const net = income + expense
    return [currency, `+${bare(income)}`, `−${bare(expense)}`, `${net >= 0 ? '+' : '−'}${bare(net)}`]
  })
  // leading \n = blank line after the title (GFM tables can't interrupt a paragraph)
  lines.push(
    `\n${markdownTable(
      [
        ctx.i18n.t('tables.currency'),
        ctx.i18n.t('tables.income'),
        ctx.i18n.t('tables.expense'),
        ctx.i18n.t('tables.net'),
      ],
      rows,
      ['left', 'right', 'right', 'right'],
    )}`,
  )

  if (byCategory.length) {
    const rows = [...byCategory]
      .sort((a, b) => b.amount - a.amount)
      .map((c) => [escapeRichMarkdown(c.name), `${bare(c.amount)} ${c.currency}`])
    // leading \n = blank line before the table (GFM tables can't interrupt a paragraph)
    lines.push(
      `\n${markdownTable([ctx.i18n.t('tables.category'), ctx.i18n.t('tables.amount')], rows, [
        'left',
        'right',
      ])}`,
    )
  }
  return lines.join('\n')
}

async function netWorthMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [netWorth, accounts] = await Promise.all([
    ctx.firefly.getNetWorth(start, end),
    ctx.firefly.listAccounts(AccountTypeFilter.Asset, end),
  ])
  const lines = [
    ctx.i18n.t('reports.netWorthTitle', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
  ]
  if (!netWorth.length && !accounts.length) {
    lines.push('', ctx.i18n.t('reports.emptyGeneric'))
    return lines.join('\n')
  }
  if (netWorth.length) {
    const rows = netWorth.map((n) => [
      n.currency,
      `${n.amount >= 0 ? '+' : '−'}${bare(n.amount)}`,
    ])
    // leading \n = blank line after the title (GFM tables can't interrupt a paragraph)
    lines.push(
      `\n${markdownTable([ctx.i18n.t('tables.currency'), ctx.i18n.t('tables.net')], rows, [
        'left',
        'right',
      ])}`,
    )
  }
  const accountRows = accounts.map((a) => [
    escapeRichMarkdown(a.attributes.name ?? ''),
    `${Number(a.attributes.current_balance ?? 0).toFixed(2)} ${a.attributes.currency_code ?? ''}`,
  ])
  if (accountRows.length)
    lines.push(
      `\n${markdownTable([ctx.i18n.t('tables.name'), ctx.i18n.t('tables.balance')], accountRows, [
        'left',
        'right',
      ])}`,
    )
  return lines.join('\n')
}

async function budgetsMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [rows, unbudgeted] = await Promise.all([
    ctx.firefly.listBudgetsWithLimits(start, end),
    ctx.firefly.insightExpenseNoBudget(start, end),
  ])
  const lines = [
    ctx.i18n.t('reports.budgetsTitle', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
  ]
  if (!rows.length) {
    lines.push('', ctx.i18n.t('reports.emptyGeneric'))
    return lines.join('\n')
  }
  const table = [...rows]
    .sort((a, b) => b.spent - a.spent)
    .map((r) => {
      const left = r.limit === null ? null : r.limit - r.spent
      return [
        escapeRichMarkdown(r.name),
        r.currency,
        r.limit === null ? '—' : r.limit.toFixed(2),
        bare(r.spent),
        left === null ? '—' : `${left >= 0 ? '+' : '−'}${bare(left)}`,
      ]
    })
  lines.push(
    `\n${markdownTable(
      [
        ctx.i18n.t('tables.budget'),
        ctx.i18n.t('tables.currency'),
        ctx.i18n.t('tables.limit'),
        ctx.i18n.t('tables.spent'),
        ctx.i18n.t('tables.left'),
      ],
      table,
      ['left', 'left', 'right', 'right', 'right'],
    )}`,
  )
  for (const u of unbudgeted)
    if (u.amount !== 0)
      lines.push('', `${ctx.i18n.t('reports.unbudgeted')}: ${bare(u.amount)} ${u.currency}`)
  return lines.join('\n')
}

async function subsMarkdown(ctx: Context): Promise<string> {
  const subs = await ctx.firefly.listSubscriptions()
  const lines = [ctx.i18n.t('reports.subsTitle')]
  if (!subs.length) {
    lines.push('', ctx.i18n.t('reports.emptyGeneric'))
    return lines.join('\n')
  }
  const rows = subs.map((s) => [
    escapeRichMarkdown(s.name),
    `${bare(s.amount)} ${s.currency}`,
    s.nextExpected ?? '—',
    s.repeatFreq,
  ])
  lines.push(
    `\n${markdownTable(
      [
        ctx.i18n.t('tables.name'),
        ctx.i18n.t('tables.amount'),
        ctx.i18n.t('tables.next'),
        ctx.i18n.t('tables.frequency'),
      ],
      rows,
      ['left', 'right', 'left', 'left'],
    )}`,
  )
  return lines.join('\n')
}

export async function renderReport(
  ctx: Context,
  type: ReportType,
  anchor: dayjs.Dayjs,
): Promise<string> {
  switch (type) {
    case 'networth':
      return netWorthMarkdown(ctx, anchor)
    case 'budgets':
      return budgetsMarkdown(ctx, anchor)
    case 'subs':
      return subsMarkdown(ctx)
    // per-view cases land in Tasks 6–8
    default:
      return reportMarkdown(ctx, anchor)
  }
}
