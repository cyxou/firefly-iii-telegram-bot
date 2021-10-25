import debug from 'debug'
import * as dotenv from 'dotenv';
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { Bot, Keyboard, GrammyError, HttpError, session } from 'grammy'

dayjs.locale('ru')
dotenv.config();

import i18n from './lib/i18n'
import config from './config'
import { command } from './lib/constants'
import { requireSettings } from './lib/middlewares'
import { getUserStorage } from './lib/storage'

import settings from './composers/settings'
import addTransaction from './composers/add-transaction'
import categories from './composers/categories'

import type { MyContext } from './types/MyContext'
import type { SessionData } from './types/SessionData'

export const Route = {
  idle: 'IDLE'
}

const rootLog = debug(`bot:root`)

const bot = new Bot<MyContext>(config.botToken)

// Attach a session middleware and specify the initial data
bot.use(
  session({
    initial: (): SessionData => ({
      step: 'IDLE',
      transaction: {},
      category: {},
      newCategories: []
    }),
  })
)
bot.use(i18n.middleware());

bot.command(command.START, startHandler)
bot.command(command.HELP, helpHandler)
bot.hears(i18n.t('en', 'labels.ACCOUNTS'), ctx => ctx.reply('OK'))
bot.hears(i18n.t('en', 'labels.TRANSACTIONS'), ctx => ctx.reply('OK'))
bot.hears(i18n.t('en', 'labels.REPORTS'), ctx => ctx.reply('OK'))
bot.hears(i18n.t('ru', 'labels.ACCOUNTS'), ctx => ctx.reply('OK'))
bot.hears(i18n.t('ru', 'labels.TRANSACTIONS'), ctx => ctx.reply('OK'))
bot.hears(i18n.t('ru', 'labels.REPORTS'), ctx => ctx.reply('OK'))

// Our custom middlewares
bot.use(requireSettings())

bot.use(settings)
bot.use(categories)
bot.use(addTransaction)

bot.start()

bot.catch((err) => {
  const ctx = err.ctx
  console.error(`Error while handling update ${ctx.update.update_id}:`)
  const e = err.error
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description)
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e)
  } else {
    console.error("Unknown error:", e)
  }
})

async function startHandler(ctx: any) {
  const log = rootLog.extend('startHandler')
  log('start: %O', ctx.message)

  await setBotCommands(ctx)

  const userId = ctx.from!.id
  const storage = getUserStorage(userId)
  const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)

  let welcomeMessage: string = ctx.i18n.t('welcome')
  const isConfigured = !!(fireflyUrl && fireflyAccessToken)
  log('isConfigured: %O', isConfigured)

  if (!isConfigured) {
    welcomeMessage = welcomeMessage.concat('\n', ctx.i18n.t('needToSet'))
  }
  if (!fireflyUrl) {
    welcomeMessage = welcomeMessage.concat('\n', ctx.i18n.t('setFireflyUrl'))
  }
  if (!fireflyAccessToken) {
    welcomeMessage = welcomeMessage.concat('\n', ctx.i18n.t('setFireflyAccessToken'))
  }
  if (!isConfigured) {
    welcomeMessage = welcomeMessage.concat('\n\n', ctx.i18n.t('navigateToSettings'))
  }

  return ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: createMainKeyboard(ctx).build(),
      resize_keyboard: true
    }
  })
}

function helpHandler(ctx: any) {
  const log = rootLog.extend('helpHandler')
  log('help: %O', ctx.message)

  return ctx.reply(ctx.i18n.t('help'), {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: createMainKeyboard(ctx).build(),
      resize_keyboard: true
    }
  })
}

function createMainKeyboard(ctx: MyContext) {
  return new Keyboard()
    .text(ctx.i18n.t('labels.TRANSACTIONS')).text(ctx.i18n.t('labels.ACCOUNTS')).row()
    .text(ctx.i18n.t('labels.CATEGORIES')).text(ctx.i18n.t('labels.REPORTS')).row()
    .text(ctx.i18n.t('labels.SETTINGS'))
}

function setBotCommands(ctx: MyContext) {
  const log = rootLog.extend('setBotCommands')
  log('Setting bot commands...')
  const myCommands: {command: string, description: string}[] = []

  for (const val of Object.values(command)) {
    myCommands.push({
      command: val as string,
      description: ctx.i18n.t(`commands.${val}`)
    })
  }
  log('myCommands: %O', myCommands)

  return ctx.api.setMyCommands(myCommands)
}
