import type { Context } from '#root/bot/context.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'

// Local 2-liner, same as categories.menu.ts — extracting a shared month-label
// helper for two users is not worth a new module.
function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, (c) => c.toLocaleUpperCase())
}

function money(amount: number, currency: string): string {
  return `${Math.abs(amount).toFixed(2)} ${currency}`
}

function parseAnchor(match: unknown): dayjs.Dayjs {
  const d = typeof match === 'string' ? dayjs(match) : undefined
  return d?.isValid() ? d : dayjs()
}

// Stateless month nav — categories details pattern: the payload carries the
// whole view state (`YYYY-MM-DD` month anchor), labels derive from ctx.match →
// onMenuOutdated: false + fixed layout + every button handler-backed.
// Hears-entry attach renders with no payload → parseAnchor falls back to the
// current month, so the fresh message gets a nav row too.
export const reportsMenu = new Menu<Context>('reports', { onMenuOutdated: false }).dynamic(
  (ctx) => {
    const anchor = parseAnchor(ctx.match)
    const prev = anchor.subtract(1, 'month')
    const next = anchor.add(1, 'month')
    return new MenuRange<Context>()
      .text(
        {
          text: () => `<< ${monthLabel(prev)}`,
          payload: prev.format('YYYY-MM-DD'),
        },
        showReportFor,
      )
      .text(
        {
          text: () => `${monthLabel(next)} >>`,
          payload: next.format('YYYY-MM-DD'),
        },
        showReportFor,
      )
  },
)

export async function showCurrentReport(ctx: Context) {
  const markdown = await reportMarkdown(ctx, dayjs())
  await ctx.replyWithRichMessage({ markdown }, { reply_markup: reportsMenu })
}

async function showReportFor(ctx: Context) {
  const markdown = await reportMarkdown(ctx, parseAnchor(ctx.match))
  await ctx.editMessageText({ markdown }, { reply_markup: reportsMenu })
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

  // One block per currency; expense amounts arrive signed-negative from the API.
  for (const currency of currencies) {
    const income = incomeTotals.find((t) => t.currency === currency)?.amount ?? 0
    const expense = expenseTotals.find((t) => t.currency === currency)?.amount ?? 0
    const net = income + expense
    lines.push(
      '',
      ctx.i18n.t('reports.income', { amount: `+${money(income, currency)}` }),
      ctx.i18n.t('reports.expense', { amount: `−${money(expense, currency)}` }),
      ctx.i18n.t('reports.net', { amount: `${net >= 0 ? '+' : '−'}${money(net, currency)}` }),
    )
  }

  if (byCategory.length) {
    const rows = [...byCategory]
      .sort((a, b) => b.amount - a.amount)
      .map((c) => [escapeRichMarkdown(c.name), money(c.amount, c.currency)])
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
