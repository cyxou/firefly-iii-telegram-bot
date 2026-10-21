import debug from 'debug'
import * as dotenv from 'dotenv';
import { Bot, GrammyError, HttpError, session } from 'grammy'
import { FileAdapter } from '@grammyjs/storage-file'
import { limit } from "@grammyjs/ratelimiter";

dotenv.config();

import i18n from './lib/i18n'
import config from './config'
import { command } from './composers/constants'
import { requireSettings, cleanup } from './lib/middlewares'
import { createMainKeyboard, generateWelcomeMessage } from './composers/helpers'

import settings from './composers/settings'
import addTransaction, { addTransaction as textHandler } from './composers/transactions/add-transaction'
import editTransaction from './composers/transactions/edit-transaction'
import listTransactions from './composers/transactions/list-transactions'
import accounts from './composers/accounts'
import categories from './composers/categories'
import reports from './composers/reports'

import type { MyContext } from './types/MyContext'
import { createInitialSessionData, SessionData } from './types/SessionData'

export const Route = {
  idle: 'IDLE'
}

const rootLog = debug(`bot:root`)

const bot = new Bot<MyContext>(config.botToken)

bot.use(limit())

// Middleware: restrict access to allowed user IDs if configured
bot.use(async (ctx, next) => {
  if (Array.isArray(config.allowedUserIds) && config.allowedUserIds.length > 0) {
    if (!ctx.from || !config.allowedUserIds.includes(ctx.from.id)) {
      if (!config.disableUnauthorizedUserLog) {
        const user = ctx.from
        const userInfo = user
          ? `id=${user.id}` + (user.username ? `, username=@${user.username}` : '')
          : 'unknown user'
        console.log(`[ACCESS DENIED] Unauthorized user attempted to use the bot: ${userInfo}. To allow this user, add their Telegram ID to the ALLOWED_TG_USER_IDS environment variable.`)
      }
      return
    }
  }
  await next()
})


// Attach a session middleware and specify the initial data
bot.use(
  session({
    getSessionKey,
    initial: createInitialSessionData,
    storage: new FileAdapter<SessionData>({
      dirName: 'sessions',
    }),
  })
)
bot.use(i18n.middleware());

// Our custom middlewares
bot.use(requireSettings())
bot.use(cleanup())
bot.use(addTransaction)
bot.use(editTransaction)
bot.use(listTransactions)
bot.use(accounts)
bot.use(settings)
bot.use(categories)
bot.use(reports)

bot.command(command.START, startHandler)
bot.command(command.HELP, helpHandler)
bot.on('message:text', textHandler)

bot.start()
bot.catch(errorHandler)

async function startHandler(ctx: MyContext) {
  const log = rootLog.extend('startHandler')
  log('start: %O', ctx.message)

  await setBotCommands(ctx)

  const welcomeMessage = generateWelcomeMessage(ctx)

  return ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: createMainKeyboard(ctx)
  })
}

function helpHandler(ctx: MyContext) {
  const log = rootLog.extend('helpHandler')
  log('help: %O', ctx.message)

  return ctx.reply(ctx.i18n.t('help'), {
    parse_mode: 'Markdown',
    reply_markup: createMainKeyboard(ctx)
  })
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


function errorHandler(err: any) {
  const ctx = err.ctx
  console.error(`Error while handling update ${ctx.update.update_id}:`)
  const e = err.error
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description)
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e)
  } else {
    console.error('Unknown error:', e)
  }
}

// Stores data per user-chat combination.
function getSessionKey(ctx: any): string | undefined {
  // Give every user their one personal session storage per chat with the bot
  // (an independent session for each group and their private chat)
  return ctx.from === undefined || ctx.chat === undefined
    ? undefined
    : `${ctx.from.id}_${ctx.chat.id}`;
}
