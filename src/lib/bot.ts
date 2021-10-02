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
import addTransactionScene from './scenes/add-transaction'
import { setUserIdToSceneSession } from './middlewares'
import botSettingsScene from './scenes/bot-settings'
import classificationScene from './scenes/classificationScene'
import { getDataFromUserStorage } from './storage'

const log = debug(`bot:bot`)

const token = config.botToken

// Handler factories
const { enter, leave } = Scenes.Stage

const bot = new Telegraf<any>(token)

export interface MySceneSession extends Scenes.SceneSessionData {
  // Will be available under `ctx.scene.session.*
  inputFor: string | null,
  transaction: any
}

// interface MySession extends Scenes.SceneSession<MySceneSession> {
//   // will be available under `ctx.session.mySessionProp`
//   userId: number,
// }

export interface MyContext extends Context {
  message: any,
  match: any,
  userId: number,
  // declare session type
  // session: MySession
  // declare scene type
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>
}

const stage = new Scenes.Stage<MyContext>(
  [
    addTransactionScene,
    botSettingsScene,
    // classificationScene,
  ]
  //, { ttl: 30 }
  // { default: scene.ADD_TRANSACTION_SCENE }
)

bot.use(session())
bot.use(setUserIdToSceneSession())
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
bot.catch((err) => {
	console.error('Error in bot:', err);
})

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
