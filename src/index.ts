import debug from 'debug'
import * as dotenv from 'dotenv';
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { Bot, GrammyError, HttpError, session } from 'grammy'

dayjs.locale('ru')
dotenv.config();

import config from './config'
import {
  commandDescription,
  keyboardButton as b,
  mainKeyboard,
  text as t
} from './lib/constants'
import { requireSettings } from './lib/middlewares'
import { ITransaction, ICategory } from './lib/firefly'

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
      transaction: {} as ITransaction,
      category: {} as ICategory,
      newCategories: []
    }),
  })
)

bot.command('start', startHandler)
bot.command('help', helpHandler)
bot.hears(b.ACCOUNTS, ctx => ctx.reply('OK'))
bot.hears(b.TRANSACTIONS, ctx => ctx.reply('OK'))
bot.hears(b.REPORTS, ctx => ctx.reply('OK'))

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
  return ctx.reply(t.welcome, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: mainKeyboard.build(),
      resize_keyboard: true
    }
  })
}

function helpHandler(ctx: any) {
  const log = rootLog.extend('helpHandler')
  log('help: %O', ctx.message)
  return ctx.reply(t.help, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: mainKeyboard.build(),
      resize_keyboard: true
    }
  })
}

function setBotCommands(ctx: MyContext) {
  const log = rootLog.extend('setBotCommands')
  log('Setting bot commands...')
  const myCommands: {command: string, description: string}[] = []
  for (const [key, val] of Object.entries(commandDescription)) {
    myCommands.push({
      command: key,
      description: val
    })
  }
  log('myCommands: %O', myCommands)

  return ctx.api.setMyCommands(myCommands)
}
