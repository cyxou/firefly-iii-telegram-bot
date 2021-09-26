import debug from 'debug'
import dayjs from 'dayjs'
import { Scenes, Markup, Types, Context } from 'telegraf'

import firefly, { ITransaction } from '../firefly'
import { getToken } from '../auth'
import { scene as c, keyboardButton as b, text as t } from '../constants'
import { getUserStorage, getDataFromUserStorage } from '../storage'

const log = debug(`bot:${c.BOT_SETTINGS_SCENE}`)

const { enter, leave } = Scenes.Stage

const CANCEL                       = 'CANCEL'
const DONE                         = 'DONE'
const INPUT_FIREFLY_URL            = 'INPUT_FIREFLY_URL'
const INPUT_FIREFLY_ACCESS_TOKEN   = 'INPUT_FIREFLY_ACCESS_TOKEN'
const SELECT_DEFAULT_ASSET_ACCOUNT = 'SELECT_DEFAULT_ASSET_ACCOUNT'
const TEST_CONNECTION              = 'TEST_CONNECTION'

interface MySceneSession extends Scenes.SceneSessionData {
  // Will be available under `ctx.scene.session.inputFor`
  inputFor?: string,
  userId?: number,
  match?: any
}

type MyContext = Scenes.SceneContext<MySceneSession>

const scene = new Scenes.BaseScene<MyContext>(
  c.BOT_SETTINGS_SCENE,
  {
    // ttl: 20,
    handlers: [],
    enterHandlers: [],
    leaveHandlers: [],
  }
)

scene.enter(sceneEnterHandler)
scene.leave((ctx) => console.log('Exiting scene....'))
scene.action(DONE, doneActionHandler)
scene.action(CANCEL, cancelActionHandler)
scene.action(INPUT_FIREFLY_URL, inputFireflyUrlActionHandler)
scene.action(INPUT_FIREFLY_ACCESS_TOKEN, inputFireflyAccessTokenActionHandler)
scene.action(SELECT_DEFAULT_ASSET_ACCOUNT, selectDefaultAssetAccountActionHandler)
scene.action(TEST_CONNECTION, testConnectionActionHandler)
scene.action(/^!defaultAccount=(.+)$/, defaultAccountActionHandler)
scene.on('text', textHandler)
// scene.use((ctx: any, next: () => Promise<void>) => {
//   log('SEXYYYY: %O', ctx)
//   return next()
// })

// scene.on('callback_query', async (ctx, next) => {
//   log('callback_query - ALOHA')
//   await ctx.answerCbQuery()
//   return next()
// })

export default scene

function settingsText(userId: number) {
  const {
    fireflyUrl,
    fireflyAccessToken,
    defaultAssetAccount
  } = getDataFromUserStorage(userId)

  // Grab only first 4 and last 4 chars of the token
  const accessToken = fireflyAccessToken?.replace(/(.{4})(.*?)(.{4})$/, '$1...$3')
  return t.whatDoYouWantToChange(fireflyUrl, accessToken, defaultAssetAccount)
}

function settingsInlineKeyboard(userId: number) {
  const storage = getUserStorage(userId)
  let firstRow = [];

  return {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [ Markup.button.callback(b.FIREFLY_URL_BUTTON, INPUT_FIREFLY_URL),
        Markup.button.callback(b.FIREFLY_ACCESS_TOKEN_BUTTON, INPUT_FIREFLY_ACCESS_TOKEN)
      ],
      [ Markup.button.callback(b.TEST_CONNECTION, TEST_CONNECTION) ],
      [ Markup.button.callback(b.DEFAULT_ASSET_ACCOUNT_BUTTON,
          SELECT_DEFAULT_ASSET_ACCOUNT)
      ],
      [ Markup.button.callback(b.DONE, DONE) ],
    ])
  }
}

function sceneEnterHandler(ctx: MyContext) {
  const userId = ctx.scene.session.userId!
  return ctx.replyWithMarkdown(
    settingsText(userId),
    settingsInlineKeyboard(userId) as any
  )
}

async function doneActionHandler(ctx: Scenes.SceneContext) {
  await ctx.deleteMessage()
  return ctx.scene.leave()
}

async function textHandler(ctx: any) {
  try {
    const userId = ctx.scene.session.userId!
    const storage = getUserStorage(userId)
    const { text } = ctx.message
    log('User entered text: %s', text)
    log('ctx.scene.session: %O', ctx.scene.session)

    if (ctx.scene.session.inputFor === INPUT_FIREFLY_URL) {
      const r = new RegExp(/^(http|https):\/\/[^ "]+$/i)
      const valid = r.test(text)
      log('URL is valid: %s', valid)

      if (!valid) {
        return ctx.replyWithMarkdown(`
Введеный текст не похож на URL. Проверьте, возможно опечатались.
Введите URL-адрес вашего сервера Firefly III, например https://firefly.example.com:`,
          Markup.inlineKeyboard([
            Markup.button.callback(b.CANCEL, CANCEL)
          ])
        )
      }
      storage.set('FIREFLY_URL', text.replace(/\/\/$/, '').toLowerCase())
      ctx.scene.session.inputFor = null
    }

    if (ctx.scene.session.inputFor === INPUT_FIREFLY_ACCESS_TOKEN) {
      log('text.length: %O', text.length)
      if (text.length < 500) {
        return ctx.replyWithMarkdown(`
Введеный текст не похож на Access Token. Попробуйте еще раз, пожалуйста:`,
          Markup.inlineKeyboard([
            Markup.button.callback(b.CANCEL, CANCEL)
          ])
        )
      }
      storage.set('FIREFLY_ACCESS_TOKEN', text)
      ctx.scene.session.inputFor = null
    }

    return ctx.replyWithMarkdown(
      settingsText(userId),
      settingsInlineKeyboard(userId) as any
    )
  } catch (err) {
    console.error(err)
    ctx.reply('Error occurred handling text: ', err.message)
  }
}

async function inputFireflyUrlActionHandler(ctx: MyContext) {
  log(`Entred the ${INPUT_FIREFLY_URL} action handler`)

  try {
    ctx.scene.session.inputFor = INPUT_FIREFLY_URL

    await ctx.editMessageText(t.inptuFireflyUrl, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback(b.CANCEL, CANCEL)
      ])
    })
  } catch (err) {
    console.error(err)
  }
}

async function inputFireflyAccessTokenActionHandler(ctx: MyContext) {
  log(`Entred the ${INPUT_FIREFLY_ACCESS_TOKEN} action handler`)

  try {
    ctx.scene.session.inputFor = INPUT_FIREFLY_ACCESS_TOKEN
    return ctx.editMessageText(t.inputFireflyAccessToken, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback(CANCEL, CANCEL)
      ])
    })
  } catch (err) {
    console.error(err)
  }
}

async function selectDefaultAssetAccountActionHandler(ctx: any) {
  log(`Entered the ${SELECT_DEFAULT_ASSET_ACCOUNT} action handler`)

  try {
    const userId = ctx.scene.session.userId
    // log('userId: %s', userId)
    const { fireflyAccessToken } = getDataFromUserStorage(userId)

    const accounts = await firefly.getAccounts('asset', userId)
    // log('accounts: %O', accounts)

    const accKeyboard = accounts.map((acc: any) => {
      return Markup.button.callback(
      `${acc.attributes.name} ${acc.attributes.currency_symbol}${acc.attributes.current_balance}`,
      `!defaultAccount=${acc.attributes.name}`
      )
    })
    accKeyboard.push(Markup.button.callback(b.CANCEL, CANCEL))
    // log('accKeyboard: %O', accKeyboard)

    return ctx.editMessageText(t.selectDefaultAssetAccount, {
      ...Markup.inlineKeyboard(accKeyboard, { columns: 1})
    })
  } catch (err) {
    console.error(err)
  }
}

async function defaultAccountActionHandler(ctx: any) {
  log(`Entered the ${SELECT_DEFAULT_ASSET_ACCOUNT} command handler`)

  try {
    const userId = ctx.scene.session.userId!
    const storage = getUserStorage(userId)
    const accountName = ctx.match[1]

    storage.set('DEFAULT_ASSET_ACCOUNT', accountName)

    await ctx.answerCbQuery('Счет по умолчанию установлен!')

    return ctx.editMessageText(
      settingsText(userId),
      settingsInlineKeyboard(userId)
    )
  } catch (err) {
    console.error(err)
  }
}

async function cancelActionHandler(ctx: MyContext) {
  try {
    log('Cancelling...: ')
    await ctx.deleteMessage()
    return ctx.scene.leave()
  } catch (err) {
    console.error(err)
  }
}

async function testConnectionActionHandler(ctx: MyContext) {
  log('Entered testConnectionActionHandler action handler')

  try {
    const userId = ctx.scene.session.userId!
    const storage = getUserStorage(userId)
    const { fireflyUrl, fireflyAccessToken } = getDataFromUserStorage(userId)

    if (!fireflyUrl) {
      return ctx.answerCbQuery(`Сперва укажите ${b.FIREFLY_URL_BUTTON}`)
    }

    if (!fireflyAccessToken) {
      return ctx.answerCbQuery(`Сперва укажите ${b.FIREFLY_ACCESS_TOKEN_BUTTON}`)
    }

    const sysInfo = await firefly.getSystemInfo(userId)
    log('sysInfo: %O', sysInfo)
    if (!sysInfo) return ctx.answerCbQuery('Соединение НЕ установлено!')
    await ctx.answerCbQuery('Соединение установлено!')
  } catch (err) {
    console.error(err)
  }
}
