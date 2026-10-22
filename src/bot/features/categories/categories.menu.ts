import type { Context } from '#root/bot/context.js'
import type { CategoryRead, TransactionRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { twoColumnRange } from '#root/bot/helpers/menu.js'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'

function parseDetailsMatch(match: string | undefined): { id: string, date: string } {
  const [id, dateInput] = String(match ?? '').split('|')
  return { id, date: dateInput || dayjs().format('YYYY-MM-DD') }
}

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

// ---- flow cancel (referenced by the Add button; the rename route lands in Task 8) ----

export async function cancelCategoryFlow(ctx: Context) {
  ctx.session.categoryFlow = undefined
  await showCategoriesList(ctx, true)
}

export const categoryFlowCancelMenu = new Menu<Context>('category-flow-cancel')
  .text(c => c.i18n.t('labels.CANCEL'), cancelCategoryFlow)

// ---- add-flow confirm (Task 8) ----

async function createCategories(ctx: Context) {
  const names = ctx.session.categoryFlow?.names ?? []
  for (const name of names)
    await ctx.firefly.storeCategory(name)
  ctx.session.categoryFlow = undefined
  await ctx.answerCallbackQuery({ text: ctx.i18n.t('categories.created') })
  await showCategoriesList(ctx, true)
}

async function rePromptAddCategories(ctx: Context) {
  await ctx.editMessageText(ctx.i18n.t('categories.typeCategories'), { parse_mode: 'Markdown', reply_markup: categoryFlowCancelMenu })
}

export const categoriesConfirmMenu = new Menu<Context>('categories-confirm')
  .text(c => c.i18n.t('labels.YES'), createCategories)
  .row()
  .text(c => c.i18n.t('labels.DECLINE_CATEGORIES_LIST'), rePromptAddCategories)
  .row()
  .text(c => c.i18n.t('labels.CANCEL'), cancelCategoryFlow)

// ---- delete confirm ----

export const categoryDeleteMenu = new Menu<Context>('category-delete')
  .dynamic((ctx) => {
    // ctx.match here is the DETAILS delete button's payload 'id|date'
    const { id, date } = parseDetailsMatch(ctx.match)
    if (!id)
      return new MenuRange<Context>()
    const range = new MenuRange<Context>()
    range
      .text({ text: c => c.i18n.t('labels.YES'), payload: id }, async (c) => {
        await c.firefly.deleteCategory(id)
        await c.answerCallbackQuery({ text: c.i18n.t('categories.deleted') })
        await showCategoriesList(c, true)
      })
      .danger() // menu@1.5 destructive styling
    range.text({ text: c => c.i18n.t('labels.CANCEL'), payload: `${id}|${date}` }, showCategoryDetails)
    return range
  })

async function askDeleteConfirm(ctx: Context) {
  await ctx.editMessageText(ctx.i18n.t('categories.confirmDeletion'), { parse_mode: 'Markdown', reply_markup: categoryDeleteMenu })
}

// ---- details (month view) — stateless: the clicked payload carries all state ----

// onMenuOutdated: false — REQUIRED for stateless nav. menu@1.5's staleness hash
// covers button LABELS, and these labels derive from ctx.match, so a payload
// click always re-renders different labels → hash self-invalidates → "Menu was
// outdated" toast, handler never runs. The layout here is fixed (nav / delete /
// back rows), every button has a handler, so the checks this skips cannot trip.
export const categoryDetailsMenu = new Menu<Context>('category-details', { onMenuOutdated: false })
  .dynamic((ctx) => {
    const { id, date } = parseDetailsMatch(ctx.match)
    if (!id)
      return new MenuRange<Context>() // rendered outside a details click: empty
    const prev = dayjs(date).subtract(1, 'month')
    const next = dayjs(date).add(1, 'month')
    const range = new MenuRange<Context>()
    range.text({ text: () => `<< ${monthLabel(prev)}`, payload: `${id}|${prev.format('YYYY-MM-DD')}` }, showCategoryDetails)
    range.text({ text: () => `${monthLabel(next)} >>`, payload: `${id}|${next.format('YYYY-MM-DD')}` }, showCategoryDetails).row()
    // rename row (Task 8) — payload id keeps ctx.match non-empty for the re-render
    range.text({ text: () => ctx.i18n.t('labels.RENAME_CATEGORY'), payload: id }, async (c) => {
      c.session.categoryFlow = { step: 'rename', categoryId: parseDetailsMatch(c.match).id }
      await c.editMessageText(c.i18n.t('categories.typeNewName'), { reply_markup: categoryFlowCancelMenu })
    }).row()
    // DELETE carries the id|date payload: at click AND at the confirm-menu attach
    // render, ctx.match is this payload — it is what bakes YES/CANCEL correctly.
    range.text({ text: () => ctx.i18n.t('labels.DELETE'), payload: `${id}|${date}` }, (c) => {
      void askDeleteConfirm(c)
    }).row()
    range.text(() => ctx.i18n.t('labels.CLOSE'), async (c) => {
      await showCategoriesList(c, true)
    })
    return range
  })

export async function showCategoryDetails(ctx: Context) {
  const { id, date } = parseDetailsMatch(ctx.match)
  const start = dayjs(date).startOf('month').format('YYYY-MM-DD')
  const end = dayjs(date).endOf('month').format('YYYY-MM-DD')
  const [category, transactions, insights] = await Promise.all([
    ctx.firefly.getCategory(id),
    ctx.firefly.listTransactionsByCategory(id, start, end),
    ctx.firefly.insightExpenseCategory(start, end, Number(id)),
  ])
  const sums = insights.map(s => `${Math.abs(s.difference)} ${s.currency}`).join('\n')
  const markdown = ctx.i18n.t('categories.transactionsList', {
    categoryName: escapeRichMarkdown(category.attributes.name),
    monthName: escapeRichMarkdown(monthLabel(dayjs(date))),
    transactions: transactionsMarkdown(ctx, transactions),
    sums,
  })
  await ctx.editMessageText({ markdown }, { reply_markup: categoryDetailsMenu })
}

function transactionsMarkdown(ctx: Context, transactions: TransactionRead[]): string {
  if (!transactions.length)
    return ctx.i18n.t('categories.noTransactions')
  const rows = [...transactions].reverse().flatMap((item) => {
    const tr = item.attributes.transactions?.[0]
    if (!tr)
      return []
    return [[
      dayjs(tr.date).format('DD MMM'),
      tr.description,
      `${Number.parseFloat(tr.amount).toFixed(2)} ${tr.currency_symbol ?? ''}`,
    ]]
  })
  return markdownTable(
    [ctx.i18n.t('tables.date'), ctx.i18n.t('tables.description'), ctx.i18n.t('tables.amount')],
    rows,
    ['left', 'left', 'right'],
  )
}

// ---- list ----

export const categoriesMenu = new Menu<Context>('categories')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    try {
      // ponytail: fetch-per-render (v1 parity). The range must bake id payloads,
      // and session writes are forbidden in dynamic callbacks — so refetch it is.
      const categories = await ctx.firefly.listCategories()
      twoColumnRange(range, categories, (r, category: CategoryRead) => {
        r.text({ text: () => category.attributes.name, payload: category.id }, showCategoryDetails)
      })
    }
    catch (err) {
      ctx.logger.warn({ err }, 'category list render failed') // dead range, live Add/Done buttons
    }
    range.text(() => ctx.i18n.t('labels.ADD_CATEGORIES'), async (c) => {
      c.session.categoryFlow = { step: 'add' }
      await c.editMessageText(c.i18n.t('categories.typeCategories'), { parse_mode: 'Markdown', reply_markup: categoryFlowCancelMenu })
    }).row()
    range.text(() => ctx.i18n.t('labels.DONE'), async (c) => {
      await c.deleteMessage()
    })
    return range
  })

export async function showCategoriesList(ctx: Context, edit: boolean) {
  const categories = await ctx.firefly.listCategories()
  const text = categories.length ? ctx.i18n.t('categories.list') : ctx.i18n.t('categories.listEmpty')
  if (edit) {
    await ctx.editMessageText(text, { reply_markup: categoriesMenu })
  }
  else {
    await ctx.reply(text, { reply_markup: categoriesMenu })
  }
}
