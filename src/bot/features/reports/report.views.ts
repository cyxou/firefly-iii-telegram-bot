import type { Context } from '#root/bot/context.js'
import type { ReportType } from './report.menu.js'
import dayjs from 'dayjs'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import { monthLabel } from '#root/bot/helpers/date.js'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'

function bare(amount: number): string {
  return Math.abs(amount).toFixed(2)
}

/**
 * Title + body sections. A section is `\n` + a table or note, so joining with
 * '\n' yields the blank line GFM tables need before/after them. No non-empty
 * sections → the empty note (tables, not prose lines: in the markdown flavor
 * Telegram renders, consecutive lines form one paragraph and their breaks
 * collapse to spaces).
 */
function layout(
  ctx: Context,
  title: string,
  sections: string[],
  emptyNote = ctx.i18n.t('reports.emptyGeneric'),
): string {
  const body = sections.filter(Boolean).join('\n')
  return body ? `${title}\n${body}` : `${title}\n\n${emptyNote}`
}

async function reportMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [expenseTotals, incomeTotals, byCategory] = await Promise.all([
    ctx.firefly.insightExpenseTotal(start, end),
    ctx.firefly.insightIncomeTotal(start, end),
    ctx.firefly.insightExpenseByCategory(start, end),
  ])
  const currencies = [...new Set([...incomeTotals, ...expenseTotals].map((t) => t.currency))]
  // One row per currency; expense amounts arrive signed-negative from the API.
  const summary = currencies.length
    ? `\n${markdownTable(
        [
          ctx.i18n.t('tables.currency'),
          ctx.i18n.t('tables.income'),
          ctx.i18n.t('tables.expense'),
          ctx.i18n.t('tables.net'),
        ],
        currencies.map((currency) => {
          const income = incomeTotals.find((t) => t.currency === currency)?.amount ?? 0
          const expense = expenseTotals.find((t) => t.currency === currency)?.amount ?? 0
          const net = income + expense
          return [
            currency,
            `+${bare(income)}`,
            `−${bare(expense)}`,
            `${net >= 0 ? '+' : '−'}${bare(net)}`,
          ]
        }),
        ['left', 'right', 'right', 'right'],
      )}`
    : ''
  const category = byCategory.length
    ? `\n${markdownTable(
        [ctx.i18n.t('tables.category'), ctx.i18n.t('tables.amount')],
        [...byCategory]
          .sort((a, b) => b.amount - a.amount)
          .map((c) => [escapeRichMarkdown(c.name), `${bare(c.amount)} ${c.currency}`]),
        ['left', 'right'],
      )}`
    : ''
  return layout(
    ctx,
    ctx.i18n.t('reports.title', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
    [summary, category],
    ctx.i18n.t('reports.empty'),
  )
}

async function netWorthMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [netWorth, accounts] = await Promise.all([
    ctx.firefly.getNetWorth(start, end),
    ctx.firefly.listAccounts(AccountTypeFilter.Asset, end),
  ])
  const totals = netWorth.length
    ? `\n${markdownTable(
        [ctx.i18n.t('tables.currency'), ctx.i18n.t('tables.net')],
        netWorth.map((n) => [n.currency, `${n.amount >= 0 ? '+' : '−'}${bare(n.amount)}`]),
        ['left', 'right'],
      )}`
    : ''
  const balances = accounts.length
    ? `\n${markdownTable(
        [ctx.i18n.t('tables.name'), ctx.i18n.t('tables.balance')],
        accounts.map((a) => [
          escapeRichMarkdown(a.attributes.name ?? ''),
          `${Number(a.attributes.current_balance ?? 0).toFixed(2)} ${a.attributes.currency_code ?? ''}`,
        ]),
        ['left', 'right'],
      )}`
    : ''
  return layout(
    ctx,
    ctx.i18n.t('reports.netWorthTitle', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
    [totals, balances],
  )
}

async function budgetsMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [rows, unbudgeted] = await Promise.all([
    ctx.firefly.listBudgetsWithLimits(start, end),
    ctx.firefly.insightExpenseNoBudget(start, end),
  ])
  const table = rows.length
    ? `\n${markdownTable(
        [
          ctx.i18n.t('tables.budget'),
          ctx.i18n.t('tables.currency'),
          ctx.i18n.t('tables.limit'),
          ctx.i18n.t('tables.spent'),
          ctx.i18n.t('tables.left'),
        ],
        [...rows]
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
          }),
        ['left', 'left', 'right', 'right', 'right'],
      )}`
    : ''
  const footers = unbudgeted
    .filter((u) => u.amount !== 0)
    .map((u) => `\n${ctx.i18n.t('reports.unbudgeted')}: ${bare(u.amount)} ${u.currency}`)
  return layout(
    ctx,
    ctx.i18n.t('reports.budgetsTitle', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
    [table, ...footers],
  )
}

async function subsMarkdown(ctx: Context): Promise<string> {
  const subs = await ctx.firefly.listSubscriptions()
  const table = subs.length
    ? `\n${markdownTable(
        [
          ctx.i18n.t('tables.name'),
          ctx.i18n.t('tables.amount'),
          ctx.i18n.t('tables.next'),
          ctx.i18n.t('tables.frequency'),
        ],
        subs.map((s) => [
          escapeRichMarkdown(s.name),
          `${bare(s.amount)} ${s.currency}`,
          s.nextExpected ?? '—',
          s.repeatFreq,
        ]),
        ['left', 'right', 'left', 'left'],
      )}`
    : ''
  return layout(ctx, ctx.i18n.t('reports.subsTitle'), [table])
}

async function piggyMarkdown(ctx: Context): Promise<string> {
  const piggies = await ctx.firefly.listPiggyBanks()
  const table = piggies.length
    ? `\n${markdownTable(
        [
          ctx.i18n.t('tables.name'),
          ctx.i18n.t('tables.saved'),
          ctx.i18n.t('tables.target'),
          ctx.i18n.t('tables.share'),
        ],
        piggies.map((p) => [
          escapeRichMarkdown(p.name),
          `${p.saved.toFixed(2)} ${p.currency}`,
          `${p.target.toFixed(2)} ${p.currency}`,
          p.target > 0 ? `${Math.round((p.saved / p.target) * 100)}%` : '—',
        ]),
        ['left', 'right', 'right', 'right'],
      )}`
    : ''
  return layout(ctx, ctx.i18n.t('reports.piggyTitle'), [table])
}

async function auditMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [noCategory, noBudget, totals] = await Promise.all([
    ctx.firefly.insightExpenseNoCategory(start, end),
    ctx.firefly.insightExpenseNoBudget(start, end),
    ctx.firefly.insightExpenseTotal(start, end),
  ])
  const leaks = [
    { label: ctx.i18n.t('reports.leak.budget'), list: noBudget },
    { label: ctx.i18n.t('reports.leak.category'), list: noCategory },
  ].flatMap((leak) =>
    leak.list
      .filter((l) => l.amount !== 0)
      .map((l) => {
        const total = Math.abs(totals.find((t) => t.currency === l.currency)?.amount ?? 0)
        return {
          label: leak.label,
          currency: l.currency,
          amount: Math.abs(l.amount),
          share: total > 0 ? `${Math.round((Math.abs(l.amount) / total) * 100)}%` : '—',
        }
      }),
  )
  const table = leaks.length
    ? `\n${markdownTable(
        [ctx.i18n.t('tables.untracked'), ctx.i18n.t('tables.amount'), ctx.i18n.t('tables.share')],
        leaks
          .sort((a, b) => b.amount - a.amount)
          .map((l) => [l.label, `${l.amount.toFixed(2)} ${l.currency}`, l.share]),
        ['left', 'right', 'right'],
      )}`
    : ''
  return layout(
    ctx,
    ctx.i18n.t('reports.auditTitle', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
    [table],
  )
}

async function trendMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  // ponytail: fixed 6-month window (design constant); make it a setting if a
  // longer horizon is ever requested.
  const months = Array.from({ length: 6 }, (_, i) => anchor.subtract(5 - i, 'month'))
  const ranges = months.map((m) => ({
    start: m.startOf('month').format('YYYY-MM-DD'),
    end: m.endOf('month').format('YYYY-MM-DD'),
  }))
  const [allExpense, allIncome] = await Promise.all([
    Promise.all(ranges.map((r) => ctx.firefly.insightExpenseTotal(r.start, r.end))),
    Promise.all(ranges.map((r) => ctx.firefly.insightIncomeTotal(r.start, r.end))),
  ])
  const currencies = [
    ...new Set([...allExpense.flat(), ...allIncome.flat()].map((t) => t.currency)),
  ]
  const sections = currencies.map((currency) => {
    const rows = months.map((m, i) => {
      const income = allIncome[i]!.find((t) => t.currency === currency)?.amount ?? 0
      const expense = allExpense[i]!.find((t) => t.currency === currency)?.amount ?? 0
      const net = income + expense
      return [
        m.format('MMM YYYY'),
        `+${bare(income)}`,
        `−${bare(expense)}`,
        `${net >= 0 ? '+' : '−'}${bare(net)}`,
      ]
    })
    return `\n**${escapeRichMarkdown(currency)}**\n\n${markdownTable(
      [
        ctx.i18n.t('tables.month'),
        ctx.i18n.t('tables.income'),
        ctx.i18n.t('tables.expense'),
        ctx.i18n.t('tables.net'),
      ],
      rows,
      ['left', 'right', 'right', 'right'],
    )}`
  })
  return layout(
    ctx,
    ctx.i18n.t('reports.trendTitle', { monthName: escapeRichMarkdown(monthLabel(anchor)) }),
    sections,
  )
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
    case 'piggy':
      return piggyMarkdown(ctx)
    case 'audit':
      return auditMarkdown(ctx, anchor)
    case 'trend':
      return trendMarkdown(ctx, anchor)
    default:
      return reportMarkdown(ctx, anchor)
  }
}
