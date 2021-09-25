import debug from 'debug'
import {
  Context,
  Composer,
  Markup,
  Scenes,
  session,
  Telegraf
} from 'telegraf'

import config from '../config'
import {
  command,
  commandDescription,
  keyboardButton as kb,
  mainKeyboard,
  scene,
  text as t
} from './constants'
import addTransactionScene from './scenes/add-ransaction'
import botSettingsScene from './scenes/bot-settings'
import classificationScene from './scenes/classificationScene'
import { getDataFromUserStorage } from './storage'

const log = debug(`bot:bot`)

const token = config.botToken

// Handler factories
const { enter, leave } = Scenes.Stage

const bot = new Telegraf<any>(token)

const stage = new Scenes.Stage<Scenes.SceneContext>(
  [
    addTransactionScene,
    botSettingsScene,
    classificationScene,
  ]
  //, { ttl: 30 }
  // { default: scene.ADD_TRANSACTION_SCENE }
)

bot.use(requireSettingsToBeSetMiddleware())
bot.use(session())
bot.use(stage.middleware())

bot.start(startHandler)
bot.help(helpHandler)

bot.command(command.SETTINGS, settingsCommandHandler)
// bot.command(command.ADD_TRANSACTION, addTransactionCommandHandler)

bot.hears(kb.ACCOUNTS, ctx => ctx.reply('OK'))
bot.hears(kb.TRANSACTIONS, ctx => ctx.reply('OK'))
bot.hears(kb.REPORTS, ctx => ctx.reply('OK'))
bot.hears(kb.CLASSIFICATION, ctx => ctx.reply('OK'))
bot.hears(kb.SETTINGS, ctx => ctx.scene.enter(scene.BOT_SETTINGS_SCENE))
bot.on('text', textHandler)

export default bot

async function startHandler(ctx: any) {
  log('start: %O', ctx.message)
  await setBotCommands(ctx)
  return ctx.replyWithMarkdown(t.welcome, mainKeyboard)
}

function helpHandler(ctx: any) {
  log('help: %O', ctx.message)
  return ctx.replyWithMarkdown(t.help, mainKeyboard)
}

function settingsCommandHandler(ctx: any) {
  ctx.scene.enter(scene.BOT_SETTINGS_SCENE, { userId: ctx.message.from.id })
}

function addTransactionCommandHandler(ctx: any) {
  ctx.scene.enter(scene.ADD_TRANSACTION_SCENE, { userId: ctx.message.from.id })
}

function textHandler (ctx: any) {
  ctx.scene.enter(scene.ADD_TRANSACTION_SCENE, { userId: ctx.message.from.id })
}

function requireSettingsToBeSetMiddleware() {
  return async (ctx: any, next: () => Promise<void>) => {
    log('Entered the requireSettingsToBeSetMiddleware middleware')
    // log('ctx: %O', ctx)
    try {
      // We allow only the commands routes to enter if Firefly URL or Firefly
      // Token are not set
      const whiteList = [ kb.SETTINGS, ...Object.values(command) ]
      const isCallbackQuery = !!ctx.callbackQuery

      if (isCallbackQuery || whiteList.includes(ctx.update?.message?.text)
        || ctx.scene?.session?.inputFor) return next()

      const userId = ctx.message!.from.id
      const { fireflyAccessToken, fireflyUrl } = getDataFromUserStorage(userId)

      if (!fireflyUrl || !fireflyAccessToken) {
        return await ctx.replyWithMarkdown(t.addUrlAndAccessToken)
      }

      return next()
    } catch (err) {
      console.error('Error occurred in requireSettingsToBeSetMiddleware: ', err)
    }
  }
}

function setBotCommands(ctx: Context) {
  log('Setting bot commands...')
  const myCommands: {command: string, description: string}[] = []
  for (const [key, val] of Object.entries(commandDescription)) {
    myCommands.push({
      command: key,
      description: val
    })
  }
  // log('myCommands: %O', myCommands)

  return ctx.setMyCommands(myCommands)
}
