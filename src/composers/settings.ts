import debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"
import { ParseMode } from '@grammyjs/types'

import type { MyContext } from '../types/MyContext'
import { keyboardButton as b, text as t, command } from '../lib/constants'
import { getUserStorage } from '../lib/storage'
import firefly from '../lib/firefly'
// import { Route as IndexRoute } from '../index'

export enum Route {
  FIREFLY_URL          = 'SETTINGS|FIREFLY_URL',
  FIREFLY_ACCESS_TOKEN = 'SETTINGS|FIREFLY_ACCESS_TOKEN'
}

const rootLog = debug(`bot:composer:settings`)

const CANCEL                       = 'CANCEL_SETTINGS'
const DONE                         = 'DONE_SETTINGS'
const INPUT_FIREFLY_URL            = 'INPUT_FIREFLY_URL'
const INPUT_FIREFLY_ACCESS_TOKEN   = 'INPUT_FIREFLY_ACCESS_TOKEN'
const SELECT_DEFAULT_ASSET_ACCOUNT = 'SELECT_DEFAULT_ASSET_ACCOUNT'
const TEST_CONNECTION              = 'TEST_CONNECTION'

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

bot.command(command.SETTINGS, settingsCommandHandler)
bot.hears(b.SETTINGS, settingsCommandHandler)
bot.callbackQuery(INPUT_FIREFLY_URL, inputFireflyUrlCbQH)
bot.callbackQuery(INPUT_FIREFLY_ACCESS_TOKEN, inputFireflyAccessTokenCbQH)
bot.callbackQuery(TEST_CONNECTION, testConnectionCbQH)
// bot.callbackQuery(SELECT_DEFAULT_ASSET_ACCOUNT, selectDefaultAssetAccountCbQH)
bot.callbackQuery(/^!defaultAccount=(.+)$/, defaultAccountCbQH)
bot.callbackQuery(DONE, doneCbQH)
bot.callbackQuery(CANCEL, cancelCbQH)

// Local routes and handlers
router.route('IDLE', ( ctx, next ) => next())
router.route(Route.FIREFLY_URL, fireflyUrlRouteHandler)
router.route(Route.FIREFLY_ACCESS_TOKEN, fireflyAccessTokenRouteHandler)
// router.otherwise(ctx => ctx.reply('otherwise'))
bot.use(router)

export default bot

function settingsText(userId: number) {
  const {
    fireflyUrl,
    fireflyAccessToken,
    defaultAssetAccount
  } = getUserStorage(userId)

  // Grab only first 4 and last 4 chars of the token
  const accessToken = fireflyAccessToken?.replace(/(.{4})(.*?)(.{4})$/, '$1...$3')
  return t.whatDoYouWantToChange(fireflyUrl, accessToken, defaultAssetAccount)
}

function settingsInlineKeyboard() {
  const inlineKeyboard = new InlineKeyboard()
    .text(b.FIREFLY_URL_BUTTON, INPUT_FIREFLY_URL).row()
    .text(b.FIREFLY_ACCESS_TOKEN_BUTTON, INPUT_FIREFLY_ACCESS_TOKEN).row()
    .text(b.TEST_CONNECTION, TEST_CONNECTION).row()
    .text(b.DEFAULT_ASSET_ACCOUNT_BUTTON, SELECT_DEFAULT_ASSET_ACCOUNT).row()
    .text(b.DONE, DONE)

  return {
    parse_mode: 'Markdown' as ParseMode,
    reply_markup: inlineKeyboard
  }
}

function settingsCommandHandler(ctx: MyContext) {
  const log = rootLog.extend('settingsCommandHandler')
  // log('ctx: %O', ctx)
  const userId = ctx.from!.id
  log('userId: %O', userId)
  return ctx.reply(
    settingsText(userId),
    settingsInlineKeyboard()
  )
}

async function doneCbQH(ctx: MyContext) {
  ctx.session.step = 'IDLE'
  return ctx.deleteMessage()
}

async function fireflyAccessTokenRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('fireflyAccessTokenRouteHandler')
  log('Entered fireflyAccessTokenRouteHandler...')
  try {
    const userId = ctx.from!.id
    const storage = getUserStorage(userId)
    log('ctx.msg: %O', ctx.msg)
    const text = ctx.msg!.text as string
    log('User entered text: %s', text)
    log('ctx.session: %O', ctx.session)
    log('text.length: %O', text.length)

    if (text.length < 500) {
      return ctx.reply(t.badAccessToken, {
        reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
      })
    }

    storage.fireflyAccessToken = text
    ctx.session.step = 'IDLE'

    return ctx.reply(
      settingsText(userId),
      settingsInlineKeyboard()
    )
  } catch (err) {
    console.error(err)
  }
}
async function fireflyUrlRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('fireflyUrlRouteHandler')
  log('Entered fireflyUrlRouteHandler...')
  try {
    const userId = ctx.from!.id
    const storage = getUserStorage(userId)
    log('ctx.msg: %O', ctx.msg)
    const text = ctx.msg!.text as string
    log('User entered text: %s', text)
    log('ctx.session: %O', ctx.session)
    const r = new RegExp(/^(http|https):\/\/[^ "]+$/i)
    const valid = r.test(text)
    log('URL is valid: %s', valid)

    if (!valid) {
      return ctx.reply(t.badUrl, {
        reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
      })
    }

    storage.fireflyUrl = text
    ctx.session.step = 'IDLE'

    return ctx.reply(
      settingsText(userId),
      settingsInlineKeyboard()
    )

  } catch (err) {
    console.error(err)
  }
}

async function inputFireflyUrlCbQH(ctx: MyContext) {
  const log = rootLog.extend('inputFireflyUrlCbQH')
  log(`Entered the ${INPUT_FIREFLY_URL} action handler`)

  try {
    ctx.session.step = Route.FIREFLY_URL

    await ctx.editMessageText(t.inptuFireflyUrl, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
    })
  } catch (err) {
    console.error(err)
  }
}

async function inputFireflyAccessTokenCbQH(ctx: MyContext) {
  const log = rootLog.extend('inputFireflyAccessTokenCbQH')
  log(`Entered the ${INPUT_FIREFLY_ACCESS_TOKEN} action handler`)
  try {
    ctx.session.step = Route.FIREFLY_ACCESS_TOKEN
    return ctx.editMessageText(t.inputFireflyAccessToken, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
    })
  } catch (err) {
    console.error(err)
  }
}

/*
async function selectDefaultAssetAccountCbQH(ctx: MyContext) {
  const log = rootLog.extend('selectDefaultAssetAccountCbQH')
  log(`Entered the ${SELECT_DEFAULT_ASSET_ACCOUNT} callback query handler`)
  try {
    const userId = ctx.from!.id
    log('userId: %s', userId)

    const accounts = await firefly(userId).getAccounts('asset')
    // log('accounts: %O', accounts)

    const accKeyboard = new InlineKeyboard()
    accounts.forEach((acc: any) => {
      return accKeyboard.text(
        `${acc.attributes.name} ${acc.attributes.currency_symbol}${acc.attributes.current_balance}`,
        `!defaultAccount=${acc.attributes.name}`
      ).row()
    })
    accKeyboard.text(b.CANCEL, CANCEL)
    // log('accKeyboard: %O', accKeyboard)

    return ctx.editMessageText(t.selectDefaultAssetAccount, {
      reply_markup: accKeyboard
    })
  } catch (err) {
    console.error(err)
  }
}
*/

async function defaultAccountCbQH(ctx: MyContext) {
  const log = rootLog.extend('defaultAccountCbQH')
  log(`Entered the ${SELECT_DEFAULT_ASSET_ACCOUNT} query handler`)
  try {
    log('ctx: %O', ctx)
    const userId = ctx.from!.id
    const storage = getUserStorage(userId)
    const accountName = ctx.match![1]

    storage.defaultAssetAccount = accountName

    await ctx.answerCallbackQuery({text: t.defaultAssetAccountSet})

    return ctx.editMessageText(
      settingsText(userId),
      settingsInlineKeyboard()
    )
  } catch (err) {
    console.error(err)
  }
}

async function cancelCbQH(ctx: MyContext) {
  const log = rootLog.extend('cancelCbQH')
  try {
    log('Cancelling...: ')
    const userId = ctx.from!.id
    log('userId: %O', userId)

    ctx.session.step = 'IDLE'

    await ctx.deleteMessage()
    return ctx.reply(
      settingsText(userId),
      settingsInlineKeyboard()
    )
  } catch (err) {
    console.error(err)
  }
}

async function testConnectionCbQH(ctx: MyContext) {
  const log = rootLog.extend('testConnectionCbQH')
  log('Entered testConnectionCbQH action handler')
  log('ctx: %O', ctx)
  try {
    const userId  = ctx.from!.id
    const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)

    if (!fireflyUrl) {
      return ctx.answerCallbackQuery({
        text: t.specifySmthFirst(b.FIREFLY_URL_BUTTON),
        show_alert: true
      })
    }

    if (!fireflyAccessToken) {
      return ctx.answerCallbackQuery({
        text: t.specifySmthFirst(b.FIREFLY_ACCESS_TOKEN_BUTTON),
        show_alert: true
      })
    }

    const userInfo = (await firefly(userId).About.getCurrentUser()).data.data
    log('Firefly user info: %O', userInfo)

    if (!userInfo) return ctx.answerCallbackQuery({
      text: t.connectionFailed,
      show_alert: true
    })

    return ctx.answerCallbackQuery({
      text: t.connectionSuccess(userInfo.attributes.email),
      show_alert: true
    })
  } catch (err) {
    console.error(err)
  }
}

/*
async function textHandler(ctx: MyContext) {
  const log = rootLog.extend('textHandler')
  log('Entered textHandler command action...')
  try {
    // log('ctx: %O', ctx)
    const userId = ctx.from!.id
    const storage = getUserStorage(userId)
    const { text } = ctx.msg
    log('User entered text: %s', text)
    log('ctx.scene.session: %O', ctx.scene.session)

    if (ctx.scene.session.inputFor === INPUT_FIREFLY_URL) {
      const r = new RegExp(/^(http|https):\/\/[^ "]+$/i)
      const valid = r.test(text)
      log('URL is valid: %s', valid)

      if (!valid) {
        return ctx.reply(t.badUrl, {
          reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
        })
      }
      storage.set('FIREFLY_URL', text.replace(/\/\/$/, '').toLowerCase())
      ctx.scene.session.inputFor = null
    }

    if (ctx.scene.session.inputFor === INPUT_FIREFLY_ACCESS_TOKEN) {
      log('text.length: %O', text.length)
      if (text.length < 500) {
        return ctx.reply(t.badAccessToken, {
          reply_markup: new InlineKeyboard().text(b.CANCEL, CANCEL)
        })
      }
      storage.set('FIREFLY_ACCESS_TOKEN', text)
      ctx.scene.session.inputFor = null
    }

    return ctx.replyWithMarkdown(
      settingsText(userId),
      settingsInlineKeyboard()
    )
  } catch (err) {
    console.error(err)
    ctx.reply('Error occurred handling text: ', err.message)
  }
}
*/
