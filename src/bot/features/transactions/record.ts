import type { Context } from '#root/bot/context.js'
import type { TransactionRead } from '#root/lib/firefly/service.js'
import dayjs from 'dayjs'
import { escapeMarkdown } from '#root/bot/helpers/markdown.js'

type Translate = (key: string, params?: Record<string, unknown>) => string

// Port of v1 formatTransactionText. Legacy Markdown prose (not list content —
// rich/GFM is for tables per the Phase 2 standard), so EVERY user value goes
// through escapeMarkdown: '_' in a description/account name is legal and
// otherwise Telegram-400s the whole message.
export function formatTransaction(tr: TransactionRead, t: Translate): string {
  const split = tr.attributes.transactions![0]!
  const key = split.type === 'withdrawal'
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

/**
 * Show a created transaction. `edit` swaps the flow's menu message into the
 * record. Phase 4 attaches the edit menu here; for now the edit passes an
 * EXPLICIT empty keyboard — a markup-less edit would get the flow menu
 * re-injected by @grammyjs/menu's navInstaller.
 */
export async function showRecord(ctx: Context, tr: TransactionRead, edit: boolean) {
  const text = formatTransaction(tr, (key, params) => ctx.i18n.t(key, params as never))
  return edit
    ? ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } })
    : ctx.reply(text, { parse_mode: 'Markdown' })
}
