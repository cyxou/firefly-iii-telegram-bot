import type { Context } from '#root/bot/context.js'
import type { ReportType } from './report.menu.js'
import dayjs from 'dayjs'
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

export async function renderReport(
  ctx: Context,
  type: ReportType,
  anchor: dayjs.Dayjs,
): Promise<string> {
  switch (type) {
    // per-view cases land in Tasks 3–8
    default:
      return reportMarkdown(ctx, anchor)
  }
}
