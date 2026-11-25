import type { Context } from '#root/bot/context.js'
import type { TransactionRead } from '#root/lib/firefly/service.js'
import { Router } from '@grammyjs/router'
import { parseAmountInput } from '#root/bot/helpers/amount.js'
import { ResourceNotFoundError } from '#root/lib/errors.js'
import { buildSplit } from './create.js'
import { applyTransactionUpdate } from './edit.menu.js'
import { showRecord } from './record.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other.
export const transactionsRouter = new Router<Context>((ctx) => ctx.session.txnFlow?.step)

transactionsRouter.route('foreign_amount', async (ctx) => {
  const flow = ctx.session.txnFlow!
  const foreignAmount = parseAmountInput(ctx.msg?.text ?? '', flow.draft.amount)
  if (!foreignAmount) return ctx.reply(ctx.i18n.t('transactions.edit.badAmountTyped')) // stay in flow, retry
  flow.draft.foreignAmount = String(foreignAmount)
  const tr = await ctx.firefly.storeTransaction(buildSplit(flow.draft))
  if (flow.promptMessage)
    await ctx.api.deleteMessage(flow.promptMessage.chatId, flow.promptMessage.messageId)
  ctx.session.txnFlow = undefined
  return showRecord(ctx, tr, false)
})

transactionsRouter.otherwise((_ctx, next) => next())

// Keyed on this flow's OWN session field — flows cannot re-point each other.
export const editRouter = new Router<Context>((ctx) => ctx.session.editFlow?.step)

async function finishTextEdit(ctx: Context, updated: TransactionRead) {
  const flow = ctx.session.editFlow!
  if (flow.promptMessage)
    await ctx.api.deleteMessage(flow.promptMessage.chatId, flow.promptMessage.messageId)
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, false) // fresh reply (foreign-amount precedent)
}

// The prompt can outlive its transaction: Firefly's web-UI convert deletes +
// recreates with a new id, and a straight delete removes it. A 404 here used
// to throw with editFlow still set — and this router sits ABOVE the add/hears
// text handlers, so the dead flow permanently claimed ALL text input.
// ResourceNotFoundError (permanent) drops the flow; transient errors rethrow
// and leave it retryable.
async function dropStaleEditFlow(ctx: Context): Promise<void> {
  const flow = ctx.session.editFlow!
  ctx.session.editFlow = undefined
  if (flow.promptMessage)
    await ctx.api
      .deleteMessage(flow.promptMessage.chatId, flow.promptMessage.messageId)
      .catch(() => {}) // stale prompt may already be gone
  await ctx.reply(
    ctx.i18n.t('transactions.edit.noSuchTransactionAnymore', { id: flow.transactionId }),
  )
}

editRouter.route('amount', async (ctx) => {
  const flow = ctx.session.editFlow!
  let current: string
  try {
    current = (await ctx.firefly.getTransaction(flow.transactionId)).attributes.transactions![0]!
      .amount
  } catch (err) {
    if (err instanceof ResourceNotFoundError) return dropStaleEditFlow(ctx)
    throw err
  }
  // v1: '+50'/'-20' composes with the current amount; garbage → retry in-flow
  const amount = parseAmountInput(ctx.msg?.text ?? '', current)
  if (!amount) return ctx.reply(ctx.i18n.t('transactions.edit.badAmountTyped'))
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, {
    amount: String(amount),
  })
  return finishTextEdit(ctx, updated)
})

editRouter.route('description', async (ctx) => {
  const flow = ctx.session.editFlow!
  const description = (ctx.msg?.text ?? '').trim()
  if (!description) return ctx.reply(ctx.i18n.t('transactions.edit.badDescriptionTyped'))
  let updated: TransactionRead
  try {
    updated = await applyTransactionUpdate(ctx, flow.transactionId, { description })
  } catch (err) {
    if (err instanceof ResourceNotFoundError) return dropStaleEditFlow(ctx)
    throw err
  }
  return finishTextEdit(ctx, updated)
})

editRouter.otherwise((_ctx, next) => next())
