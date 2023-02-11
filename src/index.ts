import debug from 'debug'
import * as dotenv from 'dotenv';
import { Bot, GrammyError, HttpError, session } from 'grammy'
import { FileAdapter } from '@grammyjs/storage-file';

dotenv.config();

import i18n from './lib/i18n'
import config from './config'
import { command } from './lib/constants'
import { requireSettings, cleanup } from './lib/middlewares'
import { createMainKeyboard, generateWelcomeMessage } from './composers/helpers'

import settings from './composers/settings'
import addTransaction, { addTransaction as textHandler } from './composers/transactions/add-transaction'
import editTransaction from './composers/transactions/edit-transaction'
import listTransactions from './composers/transactions/list-transactions'
import accounts from './composers/accounts'
import categories from './composers/categories'

import type { MyContext } from './types/MyContext'
import type { SessionData } from './types/SessionData'
import { initialSessionData } from './types/SessionData'

export const Route = {
  idle: 'IDLE'
}

const rootLog = debug(`bot:root`)

const bot = new Bot<MyContext>(config.botToken)

// Attach a session middleware and specify the initial data
bot.use(
  session({
    getSessionKey,
    initial: (): SessionData => ({ ...initialSessionData }),
    storage: new FileAdapter({
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
    reply_markup: {
      keyboard: createMainKeyboard(ctx).build(),
      resize_keyboard: true
    }
  })
}

function helpHandler(ctx: MyContext) {
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

// // Stores data per user.
// function getSessionKey(ctx: any): string | undefined {
//   // Give every user their personal session storage
//   // (will be shared across groups and in their private chat)
//   return ctx.from?.id.toString();
// }

// Stores data per user-chat combination.
function getSessionKey(ctx: any): string | undefined {
  // Give every user their one personal session storage per chat with the bot
  // (an independent session for each group and their private chat)
  return ctx.from === undefined || ctx.chat === undefined
    ? undefined
    : `${ctx.from.id}_${ctx.chat.id}`;
}
