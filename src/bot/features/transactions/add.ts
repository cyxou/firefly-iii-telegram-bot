import type { NextFunction } from 'grammy'
import type { Context } from '#root/bot/context.js'
import dayjs from 'dayjs'
import { parseAmountInput, parseTransactionMessage } from '#root/bot/helpers/amount.js'
import { TransactionTypeProperty } from '#root/lib/firefly/service.js'
import { buildSplit, resolveDefaultAccounts } from './create.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'
import { showRecord } from './record.js'

// Port of v1 addTransaction (legacy add-transaction.ts). Quick mode only here;
// the amount-only (slow) branch arrives with the category picker (Task 5).
export async function handleAddText(ctx: Context, next: NextFunction) {
  const parsed = parseTransactionMessage(ctx.msg!.text!)
  if (!parsed)
    return ctx.reply(ctx.i18n.t('transactions.add.dontUnderstand'), { parse_mode: 'Markdown' })

  const amount = parseAmountInput(parsed.amount)
  if (!amount)
    return ctx.reply(ctx.i18n.t('transactions.add.dontUnderstand'), { parse_mode: 'Markdown' })

  const { source, destination } = await resolveDefaultAccounts(ctx.settings, ctx.firefly)
  if (!source)
    return ctx.reply(ctx.i18n.t('common.noDefaultSourceAccountExist'), { reply_markup: openAssetAccountsMenu })

  if (!parsed.description)
    return next() // Task 5: slow-mode entry (picker menu)

  const tr = await ctx.firefly.storeTransaction(buildSplit({
    amount: String(amount),
    date: dayjs.unix(ctx.msg!.date).toISOString(),
    description: parsed.description,
    sourceAccount: source,
    destAccount: destination,
    categoryId: null,
  }, TransactionTypeProperty.Withdrawal))
  // Drop any half-finished flow, else its menu message can later resume with a
  // stale amount/date (v1 session-cleanup semantics, scoped to our field)
  ctx.session.txnFlow = undefined
  return showRecord(ctx, tr, false)
}
