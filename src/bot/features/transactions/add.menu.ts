import type { Context } from '#root/bot/context.js'
import type { CategoryRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { twoColumnRange } from '#root/bot/helpers/menu.js'
import { TransactionTypeProperty } from '#root/lib/firefly/service.js'
import { buildSplit } from './create.js'
import { showRecord } from './record.js'

const CATEGORIES_PER_PAGE = 20 // v1 CATEGORIES_PAGE_LIMIT

// Category picker for the amount-only flow (v1 addTransactionMenu). Categories
// re-fetch per render (render callbacks re-run on every click and must not
// write session); the page counter lives in txnFlow and only handlers mutate it.
export const addTransactionMenu = new Menu<Context>('add-transaction')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.txnFlow
    if (!flow)
      return range // rendered outside a live flow (stale attach): empty grid
    let categories: CategoryRead[] = []
    try {
      categories = await ctx.firefly.listCategories()
    }
    catch (err) {
      ctx.logger.warn({ err }, 'category picker render failed') // dead range, live nav rows
    }
    const page = flow.categoryPage ?? 1
    const totalPages = Math.max(1, Math.ceil(categories.length / CATEGORIES_PER_PAGE))
    const slice = categories.slice((page - 1) * CATEGORIES_PER_PAGE, page * CATEGORIES_PER_PAGE)
    twoColumnRange(range, slice, (r, category) => {
      r.text({ text: () => category.attributes.name, payload: category.id }, onCategorySelected)
    })
    if (page > 1) {
      range.text('<<', async (c) => {
        c.session.txnFlow!.categoryPage = page - 1
        c.menu.update() // menu@1.5: lazy void — no await needed
      })
    }
    if (page < totalPages) {
      range.text('>>', async (c) => {
        c.session.txnFlow!.categoryPage = page + 1
        c.menu.update() // menu@1.5: lazy void — no await needed
      })
    }
    return range.row()
  })
  // Task 6 appends the TO_DEPOSITS / TO_TRANSFERS submenu rows here, then:
  .text('🔙', ctx => ctx.deleteMessage())

async function onCategorySelected(ctx: Context) {
  const flow = ctx.session.txnFlow
  const categoryId = String(ctx.match ?? '')
  if (!flow || !categoryId) {
    // stale keyboard after the flow ended (finished elsewhere, or 24h TTL) —
    // explicit empty keyboard: a markup-less edit would re-inject this menu
    return ctx.editMessageText(ctx.i18n.t('common.errorOccurred'), { reply_markup: { inline_keyboard: [] } })
  }
  flow.draft.categoryId = categoryId
  const tr = await ctx.firefly.storeTransaction(buildSplit(flow.draft, TransactionTypeProperty.Withdrawal))
  ctx.session.txnFlow = undefined
  return showRecord(ctx, tr, true)
}
