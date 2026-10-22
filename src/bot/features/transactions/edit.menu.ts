import type { Context } from '#root/bot/context.js'
import type { AccountRead, CategoryRead, TransactionRead, TransactionSplitUpdate } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { twoColumnRange } from '#root/bot/helpers/menu.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import { CATEGORIES_PER_PAGE } from './add.menu.js'
import { showRecord } from './record.js'
import { pickAccounts } from './transfer.menu.js'

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
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_CATEGORY'), payload: trId }, 'edit-category', enterEditFlow)
      .row()
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_SOURCE_ACCOUNT'), payload: trId }, 'edit-source', async (c) => {
        await enterEditFlow(c)
        // markup-less edit: navInstaller injects edit-source
        return c.editMessageText(c.i18n.t('transactions.edit.chooseNewSourceAccount'))
      })
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_DEST_ACCOUNT'), payload: trId }, 'edit-dest', async (c) => {
        await enterEditFlow(c)
        return c.editMessageText(c.i18n.t('transactions.edit.chooseNewDestinationAccount'))
      })
      .row()
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_DESCRIPTION'), payload: trId }, 'edit-description', async (c) => {
        c.session.editFlow = { transactionId: trId, step: 'description', promptMessage: promptOf(c) }
        // markup-less edit: navInstaller injects edit-description (the 🔙 prompt keyboard)
        return c.editMessageText(c.i18n.t('transactions.edit.typeNewDescription'))
      })
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_AMOUNT'), payload: trId }, 'edit-amount', async (c) => {
        c.session.editFlow = { transactionId: trId, step: 'amount', promptMessage: promptOf(c) }
        return c.editMessageText(c.i18n.t('transactions.edit.typeNewAmount'))
      })
      .row()
      .url(ctx.i18n.t('labels.OPEN_IN_BROWSER'), `${ctx.settings!.fireflyUrl}/transactions/show/${trId}`)
      .row()
      .text({ text: () => ctx.i18n.t('labels.CLOSE'), payload: trId }, async c => showRecordFromId(c, trId))
    return range
  })

// Edit category picker: same shape as the add-flow picker, but the page
// counter and trId live in editFlow (render reads session, handlers mutate).
export const editCategoryMenu = new Menu<Context>('edit-category')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.editFlow
    if (!flow)
      return range // rendered outside a live flow (stale attach): empty grid
    let categories: CategoryRead[] = []
    try {
      categories = await ctx.firefly.listCategories()
    }
    catch (err) {
      ctx.logger.warn({ err }, 'edit category picker render failed') // dead range, live nav row
    }
    const page = flow.categoryPage ?? 1
    const totalPages = Math.max(1, Math.ceil(categories.length / CATEGORIES_PER_PAGE))
    const slice = categories.slice((page - 1) * CATEGORIES_PER_PAGE, page * CATEGORIES_PER_PAGE)
    twoColumnRange(range, slice, (r, cat) => {
      r.text({ text: () => cat.attributes.name, payload: cat.id }, onEditCategorySelected)
    })
    if (page > 1) {
      range.text('<<', async (c) => {
        c.session.editFlow!.categoryPage = page - 1
        c.menu.update() // menu@1.5: lazy void — no await needed
      })
    }
    if (page < totalPages) {
      range.text('>>', async (c) => {
        c.session.editFlow!.categoryPage = page + 1
        c.menu.update()
      })
    }
    return range.row()
  })
  .text('🔙', cancelTextPrompt) // v1: every edit submenu's 🔙 = back to record

async function onEditCategorySelected(ctx: Context) {
  const flow = ctx.session.editFlow
  const categoryId = String(ctx.match ?? '')
  if (!flow || !categoryId)
    return staleExit(ctx)
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, { category_id: categoryId })
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, true)
}

// v1: skip the transaction's current destination — a transfer must not be
// re-pointed onto itself (fetched fresh here; no session copy).
export const editSourceMenu = new Menu<Context>('edit-source')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.editFlow
    if (!flow)
      return range
    const cur = (await ctx.firefly.getTransaction(flow.transactionId)).attributes.transactions![0]!
    const accounts = await pickAccounts(ctx, [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities], cur.destination_id ?? undefined)
    twoColumnRange(range, accounts, (r, acc) => {
      r.text({ text: () => acc.attributes.name, payload: acc.id }, onEditSourceSelected)
    })
    return range
  })
  .text('🔙', cancelTextPrompt)

async function onEditSourceSelected(ctx: Context) {
  const flow = ctx.session.editFlow
  const accId = String(ctx.match ?? '')
  if (!flow || !accId)
    return staleExit(ctx)
  // v1: the transaction follows the new source account's currency
  const account = await ctx.firefly.getAccount(accId)
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, {
    source_id: accId,
    currency_id: account.attributes.currency_id,
  })
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, true)
}

// v1 destination trio verbatim: cash + liabilities + expense; no skip.
export const editDestMenu = new Menu<Context>('edit-dest')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.editFlow
    if (!flow)
      return range
    const accounts: AccountRead[] = await pickAccounts(ctx, [AccountTypeFilter.CashAccount, AccountTypeFilter.Liabilities, AccountTypeFilter.Expense])
    twoColumnRange(range, accounts, (r, acc) => {
      r.text({ text: () => acc.attributes.name, payload: acc.id }, onEditDestSelected)
    })
    return range
  })
  .text('🔙', cancelTextPrompt)

async function onEditDestSelected(ctx: Context) {
  const flow = ctx.session.editFlow
  const accId = String(ctx.match ?? '')
  if (!flow || !accId)
    return staleExit(ctx)
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, { destination_id: accId })
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, true)
}

function promptOf(ctx: Context) {
  // the prompt IS the edited menu message (v1 deleteBotsMessage, as plain ids)
  return { chatId: ctx.chat!.id, messageId: ctx.msg!.message_id }
}

// Prompt keyboards while waiting for text (v1 stub menus: 🔙 only).
export const editAmountMenu = new Menu<Context>('edit-amount')
  .text('🔙', cancelTextPrompt)

export const editDescriptionMenu = new Menu<Context>('edit-description')
  .text('🔙', cancelTextPrompt)

editTransactionMenu.register([editCategoryMenu, editSourceMenu, editDestMenu, editAmountMenu, editDescriptionMenu])
