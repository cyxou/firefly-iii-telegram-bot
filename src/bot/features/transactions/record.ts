import type { Context } from '#root/bot/context.js'
import type { TransactionRead } from '#root/lib/firefly/service.js'
import dayjs from 'dayjs'
import { escapeMarkdown } from '#root/bot/helpers/markdown.js'
import { recordMenu } from './record.menu.js'

type Translate = (key: string, params?: Record<string, unknown>) => string

// Port of v1 formatTransactionText. Legacy Markdown prose (not list content —
// rich/GFM is for tables per the Phase 2 standard), so EVERY user value goes
// through escapeMarkdown: '_' in a description/account name is legal and
// otherwise Telegram-400s the whole message.
export function formatTransaction(tr: TransactionRead, t: Translate): string {
  const split = tr.attributes.transactions![0]!
  const key =
    split.type === 'withdrawal'
      ? 'transactions.add.withdrawalMessage'
      : split.type === 'deposit'
        ? 'transactions.add.depositMessage'
        : 'transactions.add.transferMessage'
  return t(key, {
    amount: Number.parseFloat(split.amount),
    foreignAmount: split.foreign_amount ? Number.parseFloat(split.foreign_amount) : '',
    foreignCurrencySymbol: split.foreign_currency_symbol ?? '',
    source: escapeMarkdown(split.source_name ?? ''),
    destination: escapeMarkdown(split.destination_name ?? ''),
    description: escapeMarkdown(split.description ?? ''),
    currency: split.currency_symbol ?? '',
    date: dayjs(split.date).format('LLL'),
    trId: tr.id,
    category: split.category_name ? escapeMarkdown(split.category_name) : '',
  })
}

/** Stale keyboard after the flow ended — explicit empty keyboard: a markup-less edit would re-inject this menu. */
export function staleFlowExit(ctx: Context) {
  return ctx.editMessageText(ctx.i18n.t('common.errorOccurred'), {
    reply_markup: { inline_keyboard: [] },
  })
}

/**
 * Show a created/updated transaction with the record menu (Phase 4: ✏️ Edit).
 * `edit` swaps the flow's menu message into the record. recordTrId feeds the
 * Edit button's payload (v1 currentTransaction parity — skipped when absent).
 */
export async function showRecord(ctx: Context, tr: TransactionRead, edit: boolean) {
  ctx.session.recordTrId = tr.id
  const text = formatTransaction(tr, (key, params) => ctx.i18n.t(key, params as never))
  return edit
    ? ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: recordMenu })
    : ctx.reply(text, { parse_mode: 'Markdown', reply_markup: recordMenu })
}
