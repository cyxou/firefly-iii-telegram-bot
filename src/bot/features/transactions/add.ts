import type { Context } from '#root/bot/context.js'
import dayjs from 'dayjs'
import { parseAmountInput, parseTransactionMessage } from '#root/bot/helpers/amount.js'
import { TransactionTypeProperty } from '#root/lib/firefly/service.js'
import { addTransactionMenu } from './add.menu.js'
import { buildSplit, resolveDefaultAccounts } from './create.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'
import { showRecord } from './record.js'

// Port of v1 addTransaction (legacy add-transaction.ts): quick mode
// ('description amount') stores at once; amount-only opens the slow flow
// (category picker, then deposit/transfer submenus).
export async function handleAddText(ctx: Context) {
  const parsed = parseTransactionMessage(ctx.msg!.text!)
  if (!parsed)
    return ctx.reply(ctx.i18n.t('transactions.add.dontUnderstand'), { parse_mode: 'Markdown' })

  const amount = parseAmountInput(parsed.amount)
  if (!amount)
    return ctx.reply(ctx.i18n.t('transactions.add.dontUnderstand'), { parse_mode: 'Markdown' })

  const { source, destination } = await resolveDefaultAccounts(ctx.settings, ctx.firefly)
  if (!source)
    return ctx.reply(ctx.i18n.t('common.noDefaultSourceAccountExist'), {
      reply_markup: openAssetAccountsMenu,
    })

  if (!parsed.description) {
    ctx.session.txnFlow = {
      draft: {
        amount: String(amount),
        date: dayjs.unix(ctx.msg!.date).toISOString(),
        description: 'N/A',
        sourceAccount: source,
        destAccount: null, // v1: slow mode sends no destination; Firefly infers it
        categoryId: null,
      },
      categoryPage: 1,
    }
    ctx.session.editFlow = undefined // a new add wins over a half-finished edit prompt
    return ctx.reply(ctx.i18n.t('transactions.add.selectCategory', { amount }), {
      parse_mode: 'Markdown',
      reply_markup: addTransactionMenu,
    })
  }

  const tr = await ctx.firefly.storeTransaction(
    buildSplit(
      {
        amount: String(amount),
        date: dayjs.unix(ctx.msg!.date).toISOString(),
        description: parsed.description,
        sourceAccount: source,
        destAccount: destination,
        categoryId: null,
      },
      TransactionTypeProperty.Withdrawal,
    ),
  )
  // Drop any half-finished flow, else its menu message can later resume with a
  // stale amount/date (v1 session-cleanup semantics, scoped to our field)
  ctx.session.txnFlow = undefined
  ctx.session.editFlow = undefined // a new add wins over a half-finished edit prompt
  return showRecord(ctx, tr, false)
}
