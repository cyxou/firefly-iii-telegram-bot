import type { Context } from '#root/bot/context.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { monthLabel } from '#root/bot/helpers/date.js'
import { renderReport } from './report.views.js'

export type ReportType = 'monthly' | 'trend' | 'audit' | 'networth' | 'budgets' | 'subs' | 'piggy'

// Row 1 (first three): month-anchored analytics; row 2 (last four): lists.
// `nav` = month-anchored view that gets the ‹ › nav row; subs/piggy are undated.
const TYPES: { type: ReportType; label: string; nav?: boolean }[] = [
  { type: 'monthly', label: 'labels.VIEW_MONTHLY', nav: true },
  { type: 'trend', label: 'labels.VIEW_TREND', nav: true },
  { type: 'audit', label: 'labels.VIEW_AUDIT', nav: true },
  { type: 'networth', label: 'labels.VIEW_NET_WORTH', nav: true },
  { type: 'budgets', label: 'labels.VIEW_BUDGETS', nav: true },
  { type: 'subs', label: 'labels.VIEW_SUBSCRIPTIONS' },
  { type: 'piggy', label: 'labels.VIEW_PIGGY' },
]
const ALL_TYPES = new Set(TYPES.map((t) => t.type))

function parseReportState(match: unknown): { type: ReportType; anchor: dayjs.Dayjs } {
  const raw = typeof match === 'string' ? match : ''
  // '@' not '/': grammY menu callback data is `menuId/row/col/payload/` — the
  // payload segment must not contain the structural '/' separator.
  const [typePart, datePart] = raw.split('@')
  const type = ALL_TYPES.has(typePart as ReportType) ? (typePart as ReportType) : 'monthly'
  // bare-date payloads from v1 buttons still land on the monthly view
  const d = dayjs(datePart ?? typePart)
  return { type, anchor: d.isValid() ? d : dayjs() }
}

// Stateless nav (v1 pattern, now two-dimensional): the payload carries the
// whole view state (`<type>@<YYYY-MM-DD>`), labels derive from ctx.match →
// onMenuOutdated: false + fixed layout + every button handler-backed.
export const reportsMenu = new Menu<Context>('reports', { onMenuOutdated: false }).dynamic(
  (ctx) => {
    const { type, anchor } = parseReportState(ctx.match)
    const range = new MenuRange<Context>()
    for (const row of [TYPES.slice(0, 3), TYPES.slice(3)]) {
      range.row()
      for (const t of row)
        range.text(
          { text: () => ctx.i18n.t(t.label), payload: `${t.type}@${anchor.format('YYYY-MM-DD')}` },
          showReport,
        )
    }
    if (TYPES.find((t) => t.type === type)?.nav) {
      const prev = anchor.subtract(1, 'month')
      const next = anchor.add(1, 'month')
      range
        .row()
        .text(
          { text: () => `<< ${monthLabel(prev)}`, payload: `${type}@${prev.format('YYYY-MM-DD')}` },
          showReport,
        )
        .text(
          { text: () => `${monthLabel(next)} >>`, payload: `${type}@${next.format('YYYY-MM-DD')}` },
          showReport,
        )
    }
    range.row().text(
      (c) => c.i18n.t('labels.DONE'),
      async (c) => {
        await c.deleteMessage()
      },
    )
    return range
  },
)

export async function showCurrentReport(ctx: Context) {
  const markdown = await renderReport(ctx, 'monthly', dayjs())
  await ctx.replyWithRichMessage({ markdown }, { reply_markup: reportsMenu })
}

async function showReport(ctx: Context) {
  const { type, anchor } = parseReportState(ctx.match)
  const markdown = await renderReport(ctx, type, anchor)
  await ctx.editMessageText({ markdown }, { reply_markup: reportsMenu })
}
