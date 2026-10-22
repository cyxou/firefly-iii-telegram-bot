import type { Context } from '#root/bot/context.js'
import type { TransactionRead, TransactionSplitUpdate } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { showRecord } from './record.js'

// v1 updateFireflyTransaction port: fetch fresh, re-send the FULL split
// (source/dest/category/currency/date filled from current) — never rely on the
// API merging absent fields.
export async function applyTransactionUpdate(
  ctx: Context,
  trId: string,
  changes: Partial<TransactionSplitUpdate>,
): Promise<TransactionRead> {
  const cur = (await ctx.firefly.getTransaction(trId)).attributes.transactions![0]!
  return ctx.firefly.updateTransaction(trId, {
    source_id: cur.source_id,
    destination_id: cur.destination_id,
    category_id: cur.category_id ?? '',
    currency_id: cur.currency_id,
    date: cur.date,
    ...changes,
  })
}

/** v1 closeEditTransactionMenu: fetch by id and edit the message back into the record. */
export async function showRecordFromId(ctx: Context, trId: string) {
  const tr = await ctx.firefly.getTransaction(trId)
  return showRecord(ctx, tr, true)
}

/** Stale keyboard after the flow ended — explicit empty keyboard: a markup-less edit would re-inject this menu. */
export function staleExit(ctx: Context) {
  return ctx.editMessageText(ctx.i18n.t('common.errorOccurred'), { reply_markup: { inline_keyboard: [] } })
}

/** Cancel a picker/prompt and return to the record (v1 🔙 on every edit submenu). */
export async function cancelTextPrompt(ctx: Context) {
  const trId = ctx.session.editFlow?.transactionId
  ctx.session.editFlow = undefined
  if (!trId)
    return ctx.deleteMessage()
  return showRecordFromId(ctx, trId)
}

/** Submenu-attach middleware: point editFlow at the payload's transaction. */
export async function enterEditFlow(ctx: Context) {
  const trId = typeof ctx.match === 'string' && ctx.match ? ctx.match : ''
  if (trId)
    ctx.session.editFlow = { transactionId: trId, categoryPage: 1 }
}

export const editTransactionMenu = new Menu<Context>('edit-transaction')
  .dynamic((ctx) => {
    // ctx.match is the payload of the button that opened/re-rendered this menu
    // (always the trId here) — payload is the source of truth, no session copy.
    const trId = typeof ctx.match === 'string' && ctx.match ? ctx.match : undefined
    const range = new MenuRange<Context>()
    if (!trId)
      return range // rendered outside an edit click (stale keyboard): empty
    range
      .url(ctx.i18n.t('labels.OPEN_IN_BROWSER'), `${ctx.settings!.fireflyUrl}/transactions/show/${trId}`)
      .row()
      .text({ text: () => ctx.i18n.t('labels.CLOSE'), payload: trId }, async c => showRecordFromId(c, trId))
    return range
  })
