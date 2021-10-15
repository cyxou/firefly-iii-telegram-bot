import debug from 'debug'
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
const RENAME_CATEGORY         = /RENAME_CATEGORY_ID=(.+)/
const DELETE_CATEGORY         = /DELETE_CATEGORY_ID=(.+)/
const CATEGORY_DETAILS        = /DETAILS_CATEGORY_ID=(.+)/
const DO_DELETE               = /!DO_DELETE_ID=(.+)/
const CONFIRM_CATEGORIES_LIST = 'CONFIRM_CATEGORIES_LIST'
const DECLINE_CATEGORIES_LIST = 'DECLINE_CATEGORIES_LIST'

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

bot.hears(b.CATEGORIES, listCategoriesCommandHandler)
bot.callbackQuery(ADD_CATEGORIES, addCategoriesCallbackQueryHandler)
bot.callbackQuery(RENAME_CATEGORY, typeNewCategoryName)
bot.callbackQuery(DELETE_CATEGORY, confirmDeletionCategoryCallbackQueryHandler)
bot.callbackQuery(DO_DELETE, doDeleteCategoryCallbackQueryHandler)
bot.callbackQuery(CONFIRM_CATEGORIES_LIST, confirmCategoriesCallbackQueryHandler)
bot.callbackQuery(DECLINE_CATEGORIES_LIST, listCategoriesCommandHandler)
bot.callbackQuery(CATEGORY_DETAILS, showCategoryDetails)
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
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    ctx.session.category = { id: categoryId }
    ctx.session.step = Route.RENAME_CATEGORY
    log('ctx.session: %O', ctx.session)

    return ctx.editMessageText(t.typeNewCategoryName, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text(b.CANCEL, `DETAILS_CATEGORY_ID=${categoryId}`)
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
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    const keyboard = new InlineKeyboard()
      .text(b.YES, `!DO_DELETE_ID=${categoryId}`)
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
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    await firefly.deleteCategory(categoryId, userId)
    await ctx.answerCallbackQuery({ text: t.categoryDeleted })

    return replyWithListOfCategories(ctx)

  } catch (err) {
    log('Error: %O', err)
    console.error(err)
  }
}

/*
async function typeNewNameForChosenCategory(ctx: MyContext) {
  const log = rootLog.extend('typeNewNameForChosenCategory')
  log('Entered the typeNewNameForChosenCategory...')
  try {
    await ctx.answerCallbackQuery()

    const userId = ctx.from!.id
    log('ctx.match: %O', ctx.match)
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    if (ctx.session.step !== Route.RENAME_CATEGORY) {
    }

    ctx.session.category = { id: categoryId }

    return ctx.editMessageText(t.typeNewName, { parse_mode: 'Markdown'})

  } catch (err) {
    console.error(err)
  }
}
*/

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

async function createCategoriesInlineKeyboard(ctx: MyContext) {
  const log = rootLog.extend('createCategoriesInlineKeyboard')
  try {
    const userId = ctx.from!.id
    const categories = await firefly.getCategories(userId)
    const keyboard = new InlineKeyboard()

    categories.forEach((c: any) => {
      const callbackData = `DETAILS_CATEGORY_ID=${c.id}`
      // Callback data should not exceed 64 bytes
      log('Number of bytes in the callback_data: %O', Buffer.byteLength(callbackData))
      return keyboard.text(c.attributes.name, callbackData).row()
    })

    keyboard
      .text(b.ADD_CATEGORIES, ADD_CATEGORIES).row()
      .text(b.DONE, DONE).row()

    log('keyboard: %O', keyboard.inline_keyboard)

    return keyboard
  } catch (err) {
    log('Error occurred: ', err)
    console.error('Error occurred creating categories inline keyboard: ', err)
  }
}

async function showCategoryDetails(ctx: MyContext) {
  const log = rootLog.extend('showCategortDetails')
  try {
    await ctx.answerCallbackQuery()
    const userId = ctx.from!.id
    log('ctx.match: %O', ctx.match)
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    const category = await firefly.getCategory(categoryId, userId)
    log('category: %O', category)
    const categoryName = category.attributes.name

    const inlineKeyboard = new InlineKeyboard()
      .text(b.RENAME_CATEGORY, `RENAME_CATEGORY_ID=${categoryId}`).row()
      .text(b.DELETE, `DELETE_CATEGORY_ID=${categoryId}`).row()
      .text(b.CLOSE, CANCEL)

    ctx.editMessageText(t.categoryDetails(categoryName), {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    })

  } catch (err) {
    log('Error occurred: ', err)
    console.error('Error occurred showing category details: ', err)
  }
}
