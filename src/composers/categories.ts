import debug from 'debug'
import dayjs from 'dayjs'
import { table, getBorderCharacters } from 'table'
import { Composer, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"

import type { MyContext } from '../types/MyContext'
import { keyboardButton as b, text as t } from '../lib/constants'
import firefly from '../lib/firefly'

export enum Route {
  IDLE            = 'IDLE',
  ADD_CATEGORIES  = 'CATEGORIES|ADD',
  RENAME_CATEGORY = 'CATEGORIES|RENAME'
}

const rootLog = debug(`bot:composer:categories`)

const CANCEL                  = 'CANCEL_CLASSIFICATION'
const DONE                    = 'DONE_CLASSIFICATION'
const ADD_CATEGORIES          = 'ADD_CATEGORIES'
const RENAME_CATEGORY         = /^RENAME_CATEGORY_ID=(.+)/
const DELETE_CATEGORY         = /^DELETE_CATEGORY_ID=(.+)/
const CATEGORY_DETAILS        = /^DETAILS_CATEGORY_ID=(\w+)&START_DATE=(.+)/
const DO_DELETE               = /^DO_DELETE_ID=(.+)/
const CONFIRM_CATEGORIES_LIST = 'CONFIRM_CATEGORIES_LIST'
const DECLINE_CATEGORIES_LIST = 'DECLINE_CATEGORIES_LIST'

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

bot.hears(b.CATEGORIES, listCategoriesCommandHandler)
bot.callbackQuery(CATEGORY_DETAILS, showCategoryDetails)
bot.callbackQuery(ADD_CATEGORIES, addCategoriesCallbackQueryHandler)
bot.callbackQuery(RENAME_CATEGORY, typeNewCategoryName)
bot.callbackQuery(DELETE_CATEGORY, confirmDeletionCategoryCallbackQueryHandler)
bot.callbackQuery(DO_DELETE, doDeleteCategoryCallbackQueryHandler)
bot.callbackQuery(CONFIRM_CATEGORIES_LIST, confirmCategoriesCallbackQueryHandler)
bot.callbackQuery(DECLINE_CATEGORIES_LIST, listCategoriesCommandHandler)
bot.callbackQuery(DONE, doneCallbackQueryHandler)
bot.callbackQuery(CANCEL, cancelCallbackQueryHandler)

router.route(Route.ADD_CATEGORIES, addCategoriesRouteHandler)
router.route(Route.RENAME_CATEGORY, newCategoryNameRouteHandler)
bot.use(router)

export default bot

async function listCategoriesCommandHandler(ctx: MyContext) {
  const log = rootLog.extend('listCategoriesCommandHandler')
  log(`Entered the listCategoriesCommandHandler...`)
  try {
    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error(err)
  }
}

async function addCategoriesCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('addCategoriesCallbackQueryHandler')
  log(`Entered the ${ADD_CATEGORIES} callback query handler`)
  try {
    await ctx.answerCallbackQuery()

    ctx.session.step = Route.ADD_CATEGORIES
    ctx.session.newCategories = []

    return ctx.editMessageText(t.enterCategories, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
    })
  } catch (err) {
    console.error(err)
  }
}

async function typeNewCategoryName(ctx: MyContext) {
  const log = rootLog.extend('typeNewCategoryName')
  log('Entered the typeNewCategoryName...')
  try {
    await ctx.answerCallbackQuery()

    log('ctx.match: %O', ctx.match)
    const categoryId = parseInt(ctx.match![1], 10)
    log('categoryId: %O', categoryId)
    const startDate = ctx.match![2]
    log('startDate: %O', startDate)

    ctx.session.category = { id: categoryId }
    ctx.session.step = Route.RENAME_CATEGORY
    log('ctx.session: %O', ctx.session)

    return ctx.editMessageText(t.typeNewCategoryName, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text(
        b.CANCEL,
        `DETAILS_CATEGORY_ID=${categoryId}&START_DATE=${startDate}`
      )
    })
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred choosing category to rename: ', err)
  }
}

async function confirmDeletionCategoryCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('confirmDeletionCategoryCallbackQueryHandler')
  log('Entered the confirmDeletionCategoryCallbackQueryHandler...')
  try {
    await ctx.answerCallbackQuery()
    log('ctx.match: %O', ctx.match)
    const categoryId = parseInt(ctx.match![1], 10)
    log('categoryId: %O', categoryId)

    const keyboard = new InlineKeyboard()
      .text(b.YES, `DO_DELETE_ID=${categoryId}`)
      .text(b.CANCEL, `DETAILS_CATEGORY_ID=${categoryId}`)

    return ctx.editMessageText(t.confirmToDeleteCategory, {
      reply_markup: keyboard
    })

  } catch (err) {
    log('Error: %O', err)
    console.error(err)
  }
}

async function doDeleteCategoryCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('doDeleteCategoryCallbackQueryHandler')
  log('Entered the doDeleteCategoryCallbackQueryHandler...')
  try {
    const userId = ctx.from!.id
    log('ctx.match: %O', ctx.match)
    const categoryId = parseInt(ctx.match![1], 10)
    log('categoryId: %O', categoryId)

    await firefly.deleteCategory(categoryId, userId)
    await ctx.answerCallbackQuery({ text: t.categoryDeleted })

    return replyWithListOfCategories(ctx)

  } catch (err) {
    log('Error: %O', err)
    console.error(err)
  }
}

function addCategoriesRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('addCategoriesRouteHandler')
  log('Entered addCategoriesRouteHandler...')
  try {
    const text = ctx.msg!.text || ''
    log('text: %O', text)
    const categories = parseCategoriesInput(text)
    log('categories: %O', categories)

    ctx.session.newCategories = categories
    ctx.session.step = Route.IDLE

    return ctx.reply(`
Будет создано ${categories.length} новых категорий:

${categories.join('\n')}

Все правильно?
    `, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text(b.YES, CONFIRM_CATEGORIES_LIST).row()
        .text(b.DECLINE_CATEGORIES_LIST, DECLINE_CATEGORIES_LIST).row()
        .text(b.CANCEL, CANCEL).row()
    })
  } catch (err) {
    console.error('Error occurred in addCategoriesRouteHandler: ', err)
  }
}

async function newCategoryNameRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('newCategoryNameRouteHandler')
  log('Entered newCategoryNameRouteHandler...')
  try {
    const userId = ctx.from!.id
    log('ctx.session: %O', ctx.session)
    const text = ctx.msg?.text || ''

    const categoryId = ctx.session.category.id

    await firefly.editCategory(categoryId, { name: text }, userId)
    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error(err)
  }
}

async function cancelCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('cancelCallbackQueryHandler')
  try {
    log('Cancelling...: ')
    ctx.session.step = Route.IDLE

    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error(err)
  }
}

async function doneCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('doneCallbackQueryHandler')
  log('Entered the doneCallbackQueryHandler')
  try {
    ctx.session.step = Route.IDLE
    await ctx.answerCallbackQuery()
    log('Deleting the messsage...')
    return ctx.deleteMessage()
  } catch (err) {
    log('err: %O', err)
    console.error('Error occurred in doneCallbackQueryHandler: ', err)
  }
}

function parseCategoriesInput(input: string) {
  const splitted = input.split('\n')
  // Remove all the empty strings from the array
  return splitted.filter(e => String(e).trim())
}

async function confirmCategoriesCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('confirmCategoriesCallbackQueryHandler')
  try {
    log('Creating categories in Firefly: %O', ctx.session.newCategories)
    const userId = ctx.from!.id

    for (const category of ctx.session.newCategories) {
      await firefly.createCategory({ name: category }, userId)
    }

    await ctx.answerCallbackQuery({ text: 'Категории созданы!' })
    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error('Error occurred in confirmCategoriesCallbackQueryHandler: ', err)
  }
}

async function replyWithListOfCategories(ctx: MyContext) {
  const log = rootLog.extend('replyWithListOfCategories')
  log('ctx: %O', ctx)
  try {
    const userId = ctx.from!.id
    const categories = await firefly.getCategories(userId)
    const categoriesNames = categories.map((c: any) => c.attributes.name)
    // log('categories: %O', categories)

    const inlineKeyboard = await createCategoriesInlineKeyboard(ctx)
    inlineKeyboard
      .text(b.ADD_CATEGORIES, ADD_CATEGORIES).row()
      .text(b.DONE, DONE).row()

    const shouldReply = !!ctx.update.message

    if (shouldReply) {
      return ctx.reply(t.listCategories(categoriesNames), {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      })
    } else {
      return ctx.editMessageText(t.listCategories(categoriesNames), {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      })
    }
  } catch (err) {
    console.error(err)
  }
}

export async function createCategoriesInlineKeyboard(ctx: MyContext): Promise<InlineKeyboard> {
  const log = rootLog.extend('createCategoriesInlineKeyboard')
  try {
    const userId = ctx.from!.id
    const categories = await firefly.getCategories(userId)
    const keyboard = new InlineKeyboard()
    const nowDate = dayjs().format('YYYY-MM-DD')

    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]
      const last = categories.length - 1
      const callbackData = `DETAILS_CATEGORY_ID=${c.id}&START_DATE=${nowDate}`
      // Callback data should not exceed 64 bytes
      log('Number of bytes in the callback_data: %O', Buffer.byteLength(callbackData))
      keyboard.text(c.attributes.name, callbackData)
      // Split categories keyboard into two columns so that every odd indexed
      // category starts from new row as well as the last category in the list.
      if (i % 2 !== 0 || i === last) keyboard.row()
    }

    log('keyboard: %O', keyboard.inline_keyboard)

    return keyboard
  } catch (err) {
    log('Error occurred: ', err)
    console.error('Error occurred creating categories inline keyboard: ', err)
    throw err
  }
}

async function showCategoryDetails(ctx: MyContext) {
  const log = rootLog.extend('showCategoryDetails')
  try {
    await ctx.answerCallbackQuery()
    const userId = ctx.from!.id
    const categoryId = parseInt(ctx.match![1], 10)
    const startDate = ctx.match![2]
    log('ctx.match: %O', ctx.match)
    log('categoryId: %O', categoryId)
    log('startDate: %O', startDate)

    const start = dayjs(startDate).startOf('month') as any
    const end = dayjs(startDate).endOf('month') as any
    log('start: %O', start)
    log('end: %O', end)

    const categoryPromise = firefly.getCategory(categoryId, userId)
    const categoryTransactionsPromise = firefly.getCategoryTransactions(
      categoryId, { page: 1, start, end }, userId
    )
    const expenseCategoriesPromise = firefly.getInsightExpenseCategory(
      { start, end, categories: [categoryId] }, userId
    )

    // Resolve all the promises
    const [ category, categoryTransactions, expenseCategories ] =
      await Promise.all([
        categoryPromise,
        categoryTransactionsPromise,
        expenseCategoriesPromise
      ])
    // log('category: %O', category)
    // log('categoryTransactions: %O', categoryTransactions)
    // log('expenseCategoriesInsight: %O', expenseCategories)
    const categoryName = category.attributes.name
    const sums = expenseCategories.map((item: any) => {
      return { currency: item.currency_code, value: item.difference_float }
    })
    log('sums: %O', sums)
    const inlineKeyboard = createSingleCategoryKeyboard(startDate, categoryId)

    const text = t.categoryTransactions(
      categoryName,
      getMonthNameCapitalized(dayjs(startDate)),
      formatTransactions(categoryTransactions),
      sums
    )

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard
    })

  } catch (err) {
    log('Error occurred: ', err)
    console.error('Error occurred showing category details: ', err)
  }
}

function formatTransactions(transactions: any[]) {
  const log = rootLog.extend('formatTransactions')
  if (transactions.length === 0) return t.noTransactions
  log('transactions: %O', transactions[0].attributes)
  const data = [
    ...transactions.map(item => {
      const tr = item.attributes.transactions[0]
      if (!tr) return []
      const date = dayjs(tr.date).format('DD MMM')
      const amount = parseFloat(tr.amount).toFixed(2)
      const currency = tr.currency_symbol
      const desc = tr.description
      return [ `${date}:`, desc, `${amount} ${currency}` ]
    })
  ].reverse()

  const config = {
    border: getBorderCharacters('void'),
    columnDefault: {
        paddingLeft: 0,
        paddingRight: 1
    },
    drawHorizontalLine: () => false
  }

  log(table(data, config))
  return table(data, config)
}

function createSingleCategoryKeyboard(curMonth: string, categoryId: string | number): InlineKeyboard {
  const log = rootLog.extend('createSingleCategoryKeyboard')
  const thisMonthName = getMonthNameCapitalized(dayjs(curMonth))
  log('thisMonthName: %O', thisMonthName)

  const prevMonth = dayjs(curMonth).subtract(1, 'month')
  const prevMonthName = getMonthNameCapitalized(prevMonth)
  log('prevMonthName: %O', prevMonthName)
  const nextMonth = dayjs(curMonth).add(1, 'month')
  const nextMonthName = getMonthNameCapitalized(nextMonth)
  log('nextMonthName: %O', nextMonthName)

  const inlineKeyboard = new InlineKeyboard()
    .text(`<< ${prevMonthName}`, `DETAILS_CATEGORY_ID=${categoryId}&START_DATE=${prevMonth}`)
    .text(`${nextMonthName} >>`, `DETAILS_CATEGORY_ID=${categoryId}&START_DATE=${nextMonth}`).row()
    .text(b.RENAME_CATEGORY, `RENAME_CATEGORY_ID=${categoryId}`).row()
    .text(b.DELETE, `DELETE_CATEGORY_ID=${categoryId}`).row()
    .text(b.CLOSE, CANCEL)

  return inlineKeyboard
}

function getMonthNameCapitalized(date: any) {
  return dayjs(date).format('MMMM YYYY').replace(/^./, c => c.toLocaleUpperCase())
}
