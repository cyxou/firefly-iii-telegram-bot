import debug from 'debug'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { table, getBorderCharacters } from 'table'
import { Composer, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"

import type { MyContext } from '../types/MyContext'
import i18n from '../lib/i18n';
import firefly from '../lib/firefly'
import { TransactionRead } from '../lib/firefly/model/transaction-read'

export enum Route {
  IDLE            = 'IDLE',
  ADD_CATEGORIES  = 'CATEGORIES|ADD',
  RENAME_CATEGORY = 'CATEGORIES|RENAME'
}

const rootLog = debug(`bot:categories`)

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

bot.hears(i18n.t('ru', 'labels.CATEGORIES'), listCategoriesCommandHandler)
bot.hears(i18n.t('en', 'labels.CATEGORIES'), listCategoriesCommandHandler)
bot.callbackQuery(CATEGORY_DETAILS, showCategoryDetails)
bot.callbackQuery(ADD_CATEGORIES, addCategoriesCbQH)
bot.callbackQuery(RENAME_CATEGORY, typeNewCategoryName)
bot.callbackQuery(DELETE_CATEGORY, confirmDeletionCategoryCbQH)
bot.callbackQuery(DO_DELETE, doDeleteCategoryCbQH)
bot.callbackQuery(CONFIRM_CATEGORIES_LIST, confirmCategoriesCbQH)
bot.callbackQuery(DECLINE_CATEGORIES_LIST, listCategoriesCommandHandler)
bot.callbackQuery(DONE, closeHandler)
bot.callbackQuery(CANCEL, cancelCbQH)

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

async function addCategoriesCbQH(ctx: MyContext) {
  const log = rootLog.extend('addCategoriesCbQH')
  log(`Entered the ${ADD_CATEGORIES} callback query handler`)
  try {
    await ctx.answerCallbackQuery()

    ctx.session.step = Route.ADD_CATEGORIES
    ctx.session.newCategories = []

    return ctx.editMessageText(ctx.i18n.t('categories.typeCategories'), {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text(ctx.i18n.t('labels.CANCEL'), CANCEL)
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

    return ctx.editMessageText(ctx.i18n.t('categories.typeNewName'), {
      reply_markup: new InlineKeyboard().text(
        ctx.i18n.t('labels.CANCEL'),
        `DETAILS_CATEGORY_ID=${categoryId}&START_DATE=${startDate}`
      )
    })
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred choosing category to rename: ', err)
  }
}

async function confirmDeletionCategoryCbQH(ctx: MyContext) {
  const log = rootLog.extend('confirmDeletionCategoryCbQH')
  log('Entered the confirmDeletionCategoryCbQH...')
  try {
    await ctx.answerCallbackQuery()
    log('ctx.match: %O', ctx.match)
    const categoryId = parseInt(ctx.match![1], 10)
    log('categoryId: %O', categoryId)

    const keyboard = new InlineKeyboard()
      .text(ctx.i18n.t('labels.YES'), `DO_DELETE_ID=${categoryId}`)
      .text(ctx.i18n.t('labels.CANCEL'), `DETAILS_CATEGORY_ID=${categoryId}`)

    return ctx.editMessageText(ctx.i18n.t('categories.confirmDeletion'), {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })

  } catch (err) {
    log('Error: %O', err)
    console.error(err)
  }
}

async function doDeleteCategoryCbQH(ctx: MyContext) {
  const log = rootLog.extend('doDeleteCategoryCbQH')
  log('Entered the doDeleteCategoryCbQH...')
  try {
    const userId = ctx.from!.id
    log('ctx.match: %O', ctx.match)
    const categoryId = parseInt(ctx.match![1], 10)
    log('categoryId: %O', categoryId)

    await firefly(userId).Categories.deleteCategory(categoryId)
    await ctx.answerCallbackQuery({ text: ctx.i18n.t('categories.deleted') })

    return replyWithListOfCategories(ctx)

  } catch (err) {
    log('Error: %O', err)
    console.error(err)
    ctx.reply('Error occurred deleting a category: ', err.message)
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
        .text(ctx.i18n.t('labels.YES'), CONFIRM_CATEGORIES_LIST).row()
        .text(ctx.i18n.t('labels.DECLINE_CATEGORIES_LIST'), DECLINE_CATEGORIES_LIST).row()
        .text(ctx.i18n.t('labels.CANCEL'), CANCEL).row()
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

    await firefly(userId).Categories.updateCategory(categoryId, { name: text })
    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error(err)
  }
}

async function cancelCbQH(ctx: MyContext) {
  const log = rootLog.extend('cancelCbQH')
  try {
    log('Cancelling...: ')
    ctx.session.step = Route.IDLE

    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error(err)
  }
}

async function closeHandler(ctx: MyContext) {
  const log = rootLog.extend('closeHandler')
  log('ctx.session: %O', ctx.session)
  ctx.session.step = Route.IDLE
  await ctx.answerCallbackQuery()
  ctx.session.deleteKeyboardMenuMessage &&
    await ctx.session.deleteKeyboardMenuMessage()
  return ctx.deleteMessage()
}

function parseCategoriesInput(input: string) {
  const splitted = input.split('\n')
  // Remove all the empty strings from the array
  return splitted.filter(e => String(e).trim())
}

async function confirmCategoriesCbQH(ctx: MyContext) {
  const log = rootLog.extend('confirmCategoriesCbQH')
  try {
    log('Creating categories in firefly(userId): %O', ctx.session.newCategories)
    const userId = ctx.from!.id

    for (const category of ctx.session.newCategories) {
      await firefly(userId).Categories.storeCategory({ name: category })
    }

    await ctx.answerCallbackQuery({ text: 'Категории созданы!' })
    return replyWithListOfCategories(ctx)
  } catch (err) {
    console.error('Error occurred in confirmCategoriesCbQH: ', err)
  }
}

async function replyWithListOfCategories(ctx: MyContext) {
  const log = rootLog.extend('replyWithListOfCategories')
  log('ctx: %O', ctx)
  try {
    const userId = ctx.from!.id
    const categories = (await firefly(userId).Categories.listCategory()).data.data
    const categoriesNames = categories.map((c: any) => c.attributes.name)
    // log('categories: %O', categories)

    const inlineKeyboard = await createCategoriesInlineKeyboard(ctx)
    inlineKeyboard
      .text(ctx.i18n.t('labels.ADD_CATEGORIES'), ADD_CATEGORIES).row()
      .text(ctx.i18n.t('labels.DONE'), DONE).row()

    const shouldReply = !!ctx.update.message

    if (shouldReply) {
      return ctx.reply(
        !categoriesNames.length
          ? ctx.i18n.t('categories.listEmpty')
          : ctx.i18n.t('categories.list'), {
        reply_markup: inlineKeyboard
      })
    } else {
      return ctx.editMessageText(ctx.i18n.t('categories.list'), {
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
    const categories = (await firefly(userId).Categories.listCategory()).data.data
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

    const categoryPromise = firefly(userId).Categories.getCategory(categoryId)
    const categoryTransactionsPromise = firefly(userId).Categories
      .listTransactionByCategory(categoryId, 1, start, end)
    const expenseCategoriesPromise = firefly(userId).Insight
      .insightExpenseCategory(start, end, [categoryId])

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
    const categoryName = category.data.data.attributes.name
    const sumsObjects = expenseCategories.data.map(item => {
      return { currency: item.currency_code, value: item.difference_float }
    })
    log('sumsObjects: %O', sumsObjects)
    const inlineKeyboard = createSingleCategoryKeyboard(
      ctx, startDate, categoryId
    )
    const sums = sumsObjects.map((sum: any) => `${Math.abs(sum.value)} ${sum.currency}`)
      .join('\n       ').replace(/\n$/, '')

    const text = ctx.i18n.t('categories.transactionsList', {
      categoryName: categoryName,
      monthName: getMonthNameCapitalized(dayjs(startDate)),
      transactions: formatTransactions(ctx, categoryTransactions.data.data),
      sums: sums
    })

    return ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard
    })

  } catch (err) {
    log('Error occurred: ', err)
    console.error('Error occurred showing category details: ', err)
  }
}

function formatTransactions(ctx: MyContext, transactions: TransactionRead[]) {
  const log = rootLog.extend('formatTransactions')
  if (transactions.length === 0) return ctx.i18n.t('categories.noTransactions')
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

function createSingleCategoryKeyboard(
  ctx: MyContext,
  curMonth: string,
  categoryId: string | number
): InlineKeyboard {
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
    .text(ctx.i18n.t('labels.RENAME_CATEGORY'), `RENAME_CATEGORY_ID=${categoryId}`).row()
    .text(ctx.i18n.t('labels.DELETE'), `DELETE_CATEGORY_ID=${categoryId}`).row()
    .text(ctx.i18n.t('labels.CLOSE'), CANCEL)

  return inlineKeyboard
}

function getMonthNameCapitalized(date: Dayjs) {
  return dayjs(date).format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}
