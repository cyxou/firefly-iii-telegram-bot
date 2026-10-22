import type { Context } from '#root/bot/context.js'
import { Router } from '@grammyjs/router'
import { parseAmountInput } from '#root/bot/helpers/amount.js'
import { buildSplit } from './create.js'
import { showRecord } from './record.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other.
export const transactionsRouter = new Router<Context>(ctx => ctx.session.txnFlow?.step)

transactionsRouter.route('foreign_amount', async (ctx) => {
  const flow = ctx.session.txnFlow!
  const foreignAmount = parseAmountInput(ctx.msg?.text ?? '', flow.draft.amount)
  if (!foreignAmount)
    return ctx.reply(ctx.i18n.t('transactions.edit.badAmountTyped')) // stay in flow, retry
  flow.draft.foreignAmount = String(foreignAmount)
  const tr = await ctx.firefly.storeTransaction(buildSplit(flow.draft))
  if (flow.promptMessage)
    await ctx.api.deleteMessage(flow.promptMessage.chatId, flow.promptMessage.messageId)
  ctx.session.txnFlow = undefined
  return showRecord(ctx, tr, false)
})

transactionsRouter.otherwise((_ctx, next) => next())
