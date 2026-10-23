import type { Context } from '#root/bot/context.js'
import { Router } from '@grammyjs/router'
import { categoriesConfirmMenu, showCategoriesList } from './categories.menu.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other
// (the v1 shared `step` router corruption mode, structurally impossible here).
export const categoriesRouter = new Router<Context>((ctx) => ctx.session.categoryFlow?.step)

categoriesRouter.route('add', async (ctx) => {
  const names = (ctx.msg?.text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  ctx.session.categoryFlow = { step: 'add', names }
  await ctx.reply(ctx.i18n.t('categories.confirmCreation', { categories: names }), {
    parse_mode: 'Markdown',
    reply_markup: categoriesConfirmMenu,
  })
})

categoriesRouter.route('rename', async (ctx) => {
  const name = ctx.msg?.text ?? ''
  // routed here only when categoryFlow.step === 'rename', so the field exists
  const categoryId = ctx.session.categoryFlow!.categoryId!
  await ctx.firefly.updateCategory(categoryId, name)
  ctx.session.categoryFlow = undefined
  await showCategoriesList(ctx, false)
})

categoriesRouter.otherwise((_ctx, next) => next())
