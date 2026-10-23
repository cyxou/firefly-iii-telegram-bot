import type { Context } from '#root/bot/context.js'
import type { TransactionRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { markdownTable } from '#root/bot/helpers/rich.js'
import { TransactionTypeFilter } from '#root/lib/firefly/service.js'

const VIEWS = [
  { type: TransactionTypeFilter.Withdrawal, labelKey: 'labels.SHOW_WITHDRAWALS' },
  { type: TransactionTypeFilter.Deposit, labelKey: 'labels.SHOW_DEPOSITS' },
  { type: TransactionTypeFilter.Transfer, labelKey: 'labels.SHOW_TRANSFERS' },
] as const

type ViewType = (typeof VIEWS)[number]['type']

// Session-driven view state (the accounts pattern), NOT ctx.match-driven:
// menu@1.5 re-renders at click time and requires the clicked position to land
// on a handler-backed button — a match-driven render would promote the clicked
// tab to the DISABLED active tab at that position and throw "outdated".
// Payloads stay on the buttons for debuggability; handlers read closures.
function listState(ctx: Context): { type: ViewType; date: string } {
  const state = ctx.session.lists?.transactions
  return {
    type:
      VIEWS.find((v) => String(v.type) === state?.view)?.type ?? TransactionTypeFilter.Withdrawal,
    date: state?.date || dayjs().format('YYYY-MM-DD'),
  }
}

function setListState(ctx: Context, type: ViewType, date: string) {
  ctx.session.lists = {
    ...ctx.session.lists,
    transactions: {
      view: String(type),
      date,
    },
  }
}

export const transactionsMenu = new Menu<Context>('transactions-list').dynamic((ctx) => {
  const { type, date } = listState(ctx)
  const day = dayjs(date)
  const prev = day.subtract(1, 'day')
  const next = day.add(1, 'day')
  const range = new MenuRange<Context>()
  for (const view of VIEWS) {
    const label = (c: Context) => c.i18n.t(view.labelKey)
    if (view.type === type) {
      range.disabled(label).row()
    } // active tab (Phase 2 accounts pattern)
    else {
      range
        .text({ text: label, payload: `${view.type}|${date}` }, async (c) => {
          setListState(c, view.type, date)
          await showTransactions(c, true)
        })
        .row()
    }
  }
  range.text(
    {
      text: () => `<< ${prev.format('ll')}`,
      payload: `${type}|${prev.format('YYYY-MM-DD')}`,
    },
    async (c) => {
      setListState(c, type, prev.format('YYYY-MM-DD'))
      await showTransactions(c, true)
    },
  )
  range
    .text(
      {
        text: () => `${next.format('ll')} >>`,
        payload: `${type}|${next.format('YYYY-MM-DD')}`,
      },
      async (c) => {
        setListState(c, type, next.format('YYYY-MM-DD'))
        await showTransactions(c, true)
      },
    )
    .row()
  range.text(
    (c) => c.i18n.t('labels.DONE'),
    async (c) => {
      await c.deleteMessage() // v1's session-stored closure deleted; ids-free by construction
    },
  )
  return range
})

/** Render the transactions day view. `edit` = swap an existing list message (tab/day click). */
export async function showTransactions(ctx: Context, edit: boolean) {
  const { type, date } = listState(ctx)
  setListState(ctx, type, date)
  const transactions = await ctx.firefly.listTransactions(type, date, date)
  const markdown = listMarkdown(ctx, type, date, transactions)
  if (edit) return ctx.editMessageText({ markdown }, { reply_markup: transactionsMenu })
  return ctx.replyWithRichMessage({ markdown }, { reply_markup: transactionsMenu })
}

function listMarkdown(
  ctx: Context,
  type: TransactionTypeFilter,
  date: string,
  transactions: TransactionRead[],
): string {
  const rows = [...transactions].reverse().flatMap((item) => {
    const split = item.attributes.transactions?.[0]
    return split
      ? [
          [
            dayjs(split.date).format('LT'),
            split.description ?? '',
            `${Number.parseFloat(split.amount).toFixed(2)} ${split.currency_symbol ?? ''}`,
          ],
        ]
      : []
  })
  // GFM tables cannot interrupt a paragraph — the blank line comes from this
  // \n...\n wrap, not the folded-YAML template
  const table = rows.length
    ? `\n${markdownTable(
        [ctx.i18n.t('tables.time'), ctx.i18n.t('tables.description'), ctx.i18n.t('tables.amount')],
        rows,
        ['left', 'left', 'right'],
      )}\n`
    : ctx.i18n.t('transactions.list.noTransactions')
  // v1: per-currency plain running sum, |x| on display; transfer view shows none
  const sums = Object.entries(
    transactions.reduce(
      (acc, item) => {
        const split = item.attributes.transactions?.[0]
        if (!split) return acc
        const currency = split.currency_symbol || '💲'
        acc[currency] = (acc[currency] ?? 0) + Number.parseFloat(split.amount)
        return acc
      },
      {} as Record<string, number>,
    ),
  )
    .map(([currency, sum]) => `${Math.abs(sum)} ${currency}`)
    .join('\n')
  // TransactionTypeFilter values ('withdrawal'|'deposit'|'transfer') double as
  // the locale-key suffix — same strings, no mapping table
  return ctx.i18n.t(`transactions.list.${String(type)}`, {
    day: dayjs(date).format('LL'),
    transactions: table,
    sums,
  })
}
