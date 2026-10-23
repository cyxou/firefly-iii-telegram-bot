import type { Context } from '#root/bot/context.js'
import type { CategoryRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { twoColumnRange } from '#root/bot/helpers/menu.js'
import { TransactionTypeProperty } from '#root/lib/firefly/service.js'
import { buildSplit } from './create.js'
import { showRecord, staleFlowExit } from './record.js'
import { newDepositMenu, newDepositTargetMenu, newTransferMenu, newTransferTargetMenu, txnForeignMenu } from './transfer.menu.js'

export const CATEGORIES_PER_PAGE = 20 // v1 CATEGORIES_PAGE_LIMIT

/**
 * Category-picker grid + `<<`/`>>` pager shared by the add and edit flows
 * (v1 addTransactionMenu / updateTransactionMenu pickers). Categories re-fetch
 * per render (render callbacks re-run on every click and must not write
 * session); the page counter lives in the flow state and only `onPage` mutates it.
 */
export async function appendCategoryPicker(
  ctx: Context,
  range: MenuRange<Context>,
  page: number | undefined,
  onPick: (ctx: Context) => unknown,
  onPage: (ctx: Context, page: number) => void,
): Promise<void> {
  let categories: CategoryRead[] = []
  try {
    categories = await ctx.firefly.listCategories()
  }
  catch (err) {
    ctx.logger.warn({ err }, 'category picker render failed') // dead range, live nav rows
  }
  const current = page ?? 1
  const totalPages = Math.max(1, Math.ceil(categories.length / CATEGORIES_PER_PAGE))
  const slice = categories.slice((current - 1) * CATEGORIES_PER_PAGE, current * CATEGORIES_PER_PAGE)
  twoColumnRange(range, slice, (r, category) => {
    r.text({ text: () => category.attributes.name, payload: category.id }, onPick)
  })
  if (current > 1) {
    range.text('<<', async (c) => {
      onPage(c, current - 1)
      c.menu.update() // menu@1.5: lazy void — no await needed
    })
  }
  if (current < totalPages) {
    range.text('>>', async (c) => {
      onPage(c, current + 1)
      c.menu.update()
    })
  }
  range.row()
}

// Category picker for the amount-only flow (v1 addTransactionMenu).
export const addTransactionMenu = new Menu<Context>('add-transaction')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.txnFlow
    if (!flow)
      return range // rendered outside a live flow (stale attach): empty grid
    await appendCategoryPicker(ctx, range, flow.categoryPage, onCategorySelected, (c, page) => {
      c.session.txnFlow!.categoryPage = page
    })
    return range
  })
  .submenu(c => c.i18n.t('labels.TO_DEPOSITS'), 'new-deposit', async (c) => {
    // markup-less edit injects new-deposit
    return c.editMessageText(c.i18n.t('transactions.add.selectRevenueAccount', { amount: c.session.txnFlow?.draft.amount ?? '' }), { parse_mode: 'Markdown' })
  })
  .row()
  .submenu(c => c.i18n.t('labels.TO_TRANSFERS'), 'new-transfer', async (c) => {
    return c.editMessageText(c.i18n.t('transactions.add.selectSourceAccount', { amount: c.session.txnFlow?.draft.amount ?? '' }), { parse_mode: 'Markdown' })
  })
  .row()
  .text('🔙', ctx => ctx.deleteMessage())

async function onCategorySelected(ctx: Context) {
  const flow = ctx.session.txnFlow
  const categoryId = String(ctx.match ?? '')
  // stale keyboard after the flow ended (finished elsewhere, or 24h TTL)
  if (!flow || !categoryId)
    return staleFlowExit(ctx)
  flow.draft.categoryId = categoryId
  const tr = await ctx.firefly.storeTransaction(buildSplit(flow.draft, TransactionTypeProperty.Withdrawal))
  ctx.session.txnFlow = undefined
  return showRecord(ctx, tr, true)
}

addTransactionMenu.register([newDepositMenu, newTransferMenu])
newDepositMenu.register(newDepositTargetMenu)
newTransferMenu.register(newTransferTargetMenu)
newTransferTargetMenu.register(txnForeignMenu)
