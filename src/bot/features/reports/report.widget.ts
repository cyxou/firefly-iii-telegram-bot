// Reports as a Bot API 10.4 HTML widget: /widget sends the monthly view, and
// every later interaction is a stateless widget_query with the same payload
// discipline as the reports menu — `v:<view>@<YYYY-MM>` — so the handler needs
// no Redis keying. Data flows: widget request → Firefly (≤12 s guard) →
// answerWidgetQuery (≤1024 B JSON, instant client redraw) → best-effort
// editMessageWidgetData so the message renders fresh without any request.
import type { Context } from '#root/bot/context.js'
import type { WidgetQuery } from '#root/bot/helpers/widget-api.js'
import type { WidgetUiLabels } from './report.widget.html.js'
import dayjs from 'dayjs'
import { monthLabel } from '#root/bot/helpers/date.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import {
  answerWidgetQuery,
  editMessageWidgetData,
  sendWidget,
  widgetQueryOf,
} from '#root/bot/helpers/widget-api.js'
import { buildReportsWidgetHtml } from './report.widget.html.js'

// The four chart-friendly views the widget renders. subs/piggy/audit stay
// menu-only (plain tables — the classic rich-message reports cover them).
export type WidgetView = 'monthly' | 'trend' | 'budgets' | 'networth'
const WIDGET_VIEWS = new Set<WidgetView>(['monthly', 'trend', 'budgets', 'networth'])

// Byte budget carve-up of the ≤1024 B state: caps keep JSON.stringify inside
// the limit for real Firefly data; jsonFit trims defensively on top.
const MAX_STATE_BYTES = 1024
const CAP = { categories: 8, budgets: 10, accounts: 8 }

/** Client contract — the widget's JS reads exactly these fields. */
export interface WidgetState {
  v: WidgetView
  /** Anchor month, YYYY-MM. */
  d: string
  /** Revision (unix seconds): the widget ignores anything not newer. */
  r: number
  /** Localized plain-text title (the client escapes it). */
  T: string
  /** monthly: [currency, income, expense]. */
  s?: [string, number, number][]
  /** monthly: top categories [name, amount], dominant currency only. */
  c?: [string, number][]
  /** trend: [short month label, income, expense] for 6 months, dominant currency. */
  m?: [string, number, number][]
  /** trend: dominant currency code. */
  cur?: string
  /** budgets: [name, spent, limit|null]. */
  b?: [string, number, number | null][]
  /** networth: [currency, net worth]. */
  n?: [string, number][]
  /** networth: top account balances [name, balance]. */
  a?: [string, number][]
}

/** `v:<view>@<YYYY-MM>` — same shape as the reports menu payload. */
export function parseWidgetRequest(data: string): { view: WidgetView; anchor: dayjs.Dayjs } | null {
  const m = /^v:(\w+)@(\d{4}-\d{2})$/.exec(data)
  if (!m || !WIDGET_VIEWS.has(m[1] as WidgetView)) return null
  const anchor = dayjs(`${m[2]}-01`)
  return anchor.isValid() ? { view: m[1] as WidgetView, anchor } : null
}

const n2 = (x: number) => Math.round(x * 100) / 100

/** Currency with the largest total flow — the one charted on mixed-currency data. */
function dominantCurrency(rows: { currency: string; amount: number }[]): string {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + Math.abs(r.amount))
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

const monthStartEnd = (anchor: dayjs.Dayjs) => ({
  start: anchor.startOf('month').format('YYYY-MM-DD'),
  end: anchor.endOf('month').format('YYYY-MM-DD'),
})

async function monthlyState(ctx: Context, anchor: dayjs.Dayjs): Promise<WidgetState> {
  const { start, end } = monthStartEnd(anchor)
  const [expenseTotals, incomeTotals, byCategory] = await Promise.all([
    ctx.firefly.insightExpenseTotal(start, end),
    ctx.firefly.insightIncomeTotal(start, end),
    ctx.firefly.insightExpenseByCategory(start, end),
  ])
  const currencies = [...new Set([...incomeTotals, ...expenseTotals].map((t) => t.currency))]
  const state: WidgetState = {
    v: 'monthly',
    d: anchor.format('YYYY-MM'),
    r: revision(),
    T: ctx.i18n.t('reports.title', { monthName: monthLabel(anchor) }),
    s: currencies.map((currency) => {
      const income = incomeTotals.find((t) => t.currency === currency)?.amount ?? 0
      const expense = Math.abs(expenseTotals.find((t) => t.currency === currency)?.amount ?? 0)
      return [currency, n2(income), n2(expense)]
    }),
  }
  const cur = dominantCurrency([...incomeTotals, ...expenseTotals])
  state.c = byCategory
    .filter((c) => c.currency === cur && c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, CAP.categories)
    .map((c) => [c.name, n2(c.amount)])
  return state
}

async function trendState(ctx: Context, anchor: dayjs.Dayjs): Promise<WidgetState> {
  // Same fixed 6-month window as trendMarkdown (its design constant).
  const months = Array.from({ length: 6 }, (_, i) => anchor.subtract(5 - i, 'month'))
  const ranges = months.map((m) => monthStartEnd(m))
  const [allExpense, allIncome] = await Promise.all([
    Promise.all(ranges.map((r) => ctx.firefly.insightExpenseTotal(r.start, r.end))),
    Promise.all(ranges.map((r) => ctx.firefly.insightIncomeTotal(r.start, r.end))),
  ])
  const flat = [...allExpense.flat(), ...allIncome.flat()]
  const cur = dominantCurrency(flat)
  const state: WidgetState = {
    v: 'trend',
    d: anchor.format('YYYY-MM'),
    r: revision(),
    T: ctx.i18n.t('reports.trendTitle', { monthName: monthLabel(anchor) }),
    cur,
    m: months.map((m, i) => {
      const income = allIncome[i]!.find((t) => t.currency === cur)?.amount ?? 0
      const expense = allExpense[i]!.find((t) => t.currency === cur)?.amount ?? 0
      return [m.format('MMM'), n2(income), n2(Math.abs(expense))]
    }),
  }
  return state
}

async function budgetsState(ctx: Context, anchor: dayjs.Dayjs): Promise<WidgetState> {
  const { start, end } = monthStartEnd(anchor)
  const rows = await ctx.firefly.listBudgetsWithLimits(start, end)
  return {
    v: 'budgets',
    d: anchor.format('YYYY-MM'),
    r: revision(),
    T: ctx.i18n.t('reports.budgetsTitle', { monthName: monthLabel(anchor) }),
    b: rows
      .filter((r) => r.spent > 0 || r.limit !== null)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, CAP.budgets)
      .map((r) => [r.name, n2(r.spent), r.limit === null ? null : n2(r.limit)]),
  }
}

async function networthState(ctx: Context, anchor: dayjs.Dayjs): Promise<WidgetState> {
  const { start, end } = monthStartEnd(anchor)
  const [netWorth, accounts] = await Promise.all([
    ctx.firefly.getNetWorth(start, end),
    ctx.firefly.listAccounts(AccountTypeFilter.Asset, end),
  ])
  return {
    v: 'networth',
    d: anchor.format('YYYY-MM'),
    r: revision(),
    T: ctx.i18n.t('reports.netWorthTitle', { monthName: monthLabel(anchor) }),
    n: netWorth.map((n) => [n.currency, n2(n.amount)]),
    a: [...accounts]
      .sort(
        (a, b) =>
          Math.abs(Number(b.attributes.current_balance ?? 0)) -
          Math.abs(Number(a.attributes.current_balance ?? 0)),
      )
      .slice(0, CAP.accounts)
      .map((a) => [a.attributes.name ?? '', n2(Number(a.attributes.current_balance ?? 0))]),
  }
}

function revision() {
  return Math.floor(Date.now() / 1000)
}

export async function buildWidgetState(
  ctx: Context,
  view: WidgetView,
  anchor: dayjs.Dayjs,
): Promise<WidgetState> {
  switch (view) {
    case 'trend':
      return trendState(ctx, anchor)
    case 'budgets':
      return budgetsState(ctx, anchor)
    case 'networth':
      return networthState(ctx, anchor)
    default:
      return monthlyState(ctx, anchor)
  }
}

/** Serialize within the 1024 B state budget: trim list tails if ever over. */
export function widgetStateJson(state: WidgetState): string {
  let json = JSON.stringify(state)
  for (const key of ['c', 'b', 'a'] as const) {
    const list = state[key]
    while (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES && list && list.length > 3) {
      list.pop()
      json = JSON.stringify(state)
    }
  }
  return json
}

function uiLabels(ctx: Context): WidgetUiLabels {
  return {
    tb: (
      [
        ['monthly', ctx.i18n.t('labels.VIEW_MONTHLY')],
        ['trend', ctx.i18n.t('labels.VIEW_TREND')],
        ['budgets', ctx.i18n.t('labels.VIEW_BUDGETS')],
        ['networth', ctx.i18n.t('labels.VIEW_NET_WORTH')],
      ] as [WidgetView, string][]
    ).map(([v, label]) => [v, label.replace(/^\S+\s/, '')]) as WidgetUiLabels['tb'],
    i: ctx.i18n.t('tables.income'),
    e: ctx.i18n.t('tables.expense'),
    n: ctx.i18n.t('tables.net'),
    em: ctx.i18n.t('reports.emptyGeneric'),
    er: ctx.i18n.t('reports.widget.error'),
  }
}

/** /widget — send the monthly report as an interactive widget. */
export async function sendReportsWidget(ctx: Context) {
  const state = await buildWidgetState(ctx, 'monthly', dayjs())
  await sendWidget(ctx.api, {
    chat_id: ctx.chat!.id,
    html: buildReportsWidgetHtml(uiLabels(ctx), ctx.settings!.fireflyUrl!),
    caption: state.T,
    allow_queries: true,
    chat_data: widgetStateJson(state),
  })
}

// Answer first (instant redraw), then persist the state for the next open.
// The 15 s answer window is Telegram's hard rule — the timeout guard keeps a
// hung Firefly from eating it; failures still answer with {e:…}.
const ANSWER_DEADLINE_MS = 12_000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('widget data timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function handleWidgetQuery(ctx: Context, query: WidgetQuery) {
  const fail = async (reason: string) =>
    answerWidgetQuery(ctx.api, query.id, JSON.stringify({ e: reason }))

  if (!ctx.settings?.fireflyUrl || !ctx.settings.fireflyAccessToken) return fail('settings')
  const parsed = parseWidgetRequest(query.data)
  if (!parsed) return fail('bad-request')
  try {
    const state = await withTimeout(
      buildWidgetState(ctx, parsed.view, parsed.anchor),
      ANSWER_DEADLINE_MS,
    )
    const json = widgetStateJson(state)
    await answerWidgetQuery(ctx.api, query.id, json)
    if (query.chat && query.message_id !== undefined) {
      try {
        await editMessageWidgetData(ctx.api, {
          chat_id: query.chat.id,
          message_id: query.message_id,
          chat_data: json,
        })
      } catch (error) {
        // "message is not modified" on identical state — same tolerance as
        // editMessageText. Anything else logs at debug; the answer already
        // reached the widget, so the user saw fresh data regardless.
        ctx.logger.debug(error, 'editMessageWidgetData failed')
      }
    }
  } catch (error) {
    ctx.logger.debug(error, 'widget query failed')
    return fail('firefly')
  }
}

/** Mounted inside reportsFeature: consumes widget_query updates, nothing else. */
export function widgetQueryMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const query = widgetQueryOf(ctx.update)
    if (!query) return next()
    await handleWidgetQuery(ctx, query)
  }
}
