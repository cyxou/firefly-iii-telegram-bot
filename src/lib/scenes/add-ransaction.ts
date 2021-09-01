import dayjs from 'dayjs'
import debug from 'debug'
import { Scenes, Markup } from 'telegraf'

import firefly, { ITransaction } from '../firefly'
import { getUserStorage } from '../storage'
import {
  scene as c,
  text as t,
  // mainKeyboard,
  keyboardButton as kb,
  keyboardToScenesMap as k2sMap
} from '../constants'

const log = debug(`bot:${c.ADD_TRANSACTION_SCENE}`)

const { enter, leave } = Scenes.Stage

const CHOOSE_CATEGORY    = 'CHOOSE_CATEGORY'
const CHOOSE_ACCOUNT     = 'CHOOSE_ACCOUNT'
const CANCEL             = 'CANCEL'
const DELETE_TRANSACTION = 'DELETE_TRANSACTION'
const EDIT_TRANSACTION   = 'EDIT_TRANSACTION'

interface MySceneSession extends Scenes.SceneSessionData {
  // Will be available under `ctx.scene.session.transaction`
  userId?: number,
  transaction?: ITransaction
  authToken?: string
}

type MyContext = Scenes.SceneContext<MySceneSession>

const scene = new Scenes.BaseScene<MyContext>(c.ADD_TRANSACTION_SCENE)

scene.enter(textHandler)
scene.leave((ctx) => console.log('Exiting scene....'))
scene.action(CANCEL, cancelActionHandler)
scene.action(EDIT_TRANSACTION, editTransactionHandler)
scene.action(DELETE_TRANSACTION, deleteTransactionActionHandler)
scene.action(/^!category=(.+)$/, categoryActionHandler)
// scene.on('message', (ctx) => ctx.reply(t.onlyTextMessages))
scene.on('text', textHandler)

scene.on('callback_query', async ( ctx, next ) => {
  log('Entered callback_query handler')
  await ctx.answerCbQuery()
  return next()
})

export default scene

async function sceneEnterHandler(ctx: Scenes.SceneContext) {
  log('ctx.message: ', ctx.message)
  return ctx.reply(
    'Введите сумму транзакции, либо несколько значений через пробел',
    // mainKeyboard
  )
}

async function textHandler (ctx: any) {
  log('Entered text handler')
  try {
    // Since this is the default scene, we need to watch out for the keyboard
    // commands a users clicks on:
    handleBotActionsFromKeyboard(ctx)

    const storage = getUserStorage(ctx.message.from.id)
    const authToken = storage.get('FIREFLY_ACCESS_TOKEN')
    ctx.scene.session.authToken = authToken

    const amount = parseFloat(ctx.message.text)
    if (isNaN(amount)) {
      return ctx.reply('Введите сумму транзакции - это должно быть число.')
    }

    let defaultAssetAccount = storage.get('DEFAULT_ASSET_ACCOUNT')
    if (defaultAssetAccount === 'N/A') {
      defaultAssetAccount = (await firefly.getAccounts('asset', authToken))[0]
    }
    log('defaultAssetAccount: %O', defaultAssetAccount)

    ctx.scene.session.transaction = {
      amount,
      categoryName: '',
      sourceName: defaultAssetAccount.attributes.name
      // destinationId: expenseAccount.id
    }

    const categories = await firefly.getCategories(authToken)
    const catNames = categories.map((c: any) => c.attributes.name)

    const catKb = categories.map((c: any) => Markup.button.callback(
      c.attributes.name,
      `!category=${c.attributes.name}`
    ))
    catKb.push(Markup.button.callback(kb.CANCEL, CANCEL))

    ctx.reply(`В какую категорию добавить ${ctx.message.text}?`, {
      ...Markup.inlineKeyboard(catKb, { columns: 1})
    })
  } catch (err) {
    console.error(err)
  }
}

async function categoryActionHandler(ctx: any) {
  try {
    log('ALOHA from category action')
    const categoryName = ctx.match[1]
    const { authToken } = ctx.scene.session
    ctx.scene.session.transaction!.categoryName = categoryName

    const formatedDate = dayjs().format('DD MMM YYYY г.')

    const { transaction } = ctx.scene.session
    await firefly.createTransaction(transaction!, authToken)
    await ctx.editMessageText(
      `Добавлено *${ctx.scene.session.transaction!.amount}* в категорию расходов: *${categoryName}*\n${formatedDate}`,
      Markup.inlineKeyboard([
        Markup.button.callback(kb.MODIFY_DATE, EDIT_TRANSACTION),
        Markup.button.callback(kb.DELETE, DELETE_TRANSACTION),
      ], { columns: 2})
    )
    return ctx.answerCbQuery('Транзакция создана!')
  } catch (err) {
    await ctx.answerCbQuery('Произошла ошибка!')
    console.error('Error occurred in category action handler: ', err)
    return ctx.editMessageText(`❗😰 Произошла ошибка при создании транзакции: ${err.message}`)
  }
}

async function cancelActionHandler (ctx: Scenes.SceneContext) {
  try {
    log('Cancelling...: ')
    await ctx.deleteMessage()
    return ctx.scene.leave()
  } catch (err) {
    console.error(err)
  }
}

function editTransactionHandler (ctx: Scenes.SceneContext) {
  try {
    log('@TODO Edit transaction...: ')
    // add note to transaction with telegram message Id
    // Then search for this message id by `notes_contain:query` and edit transaction
    return ctx.reply('Not implemented')
  } catch (err) {
    console.error(err)
  }
}

function deleteTransactionActionHandler(ctx: Scenes.SceneContext) {
  try {
    log('@TODO Removing transaction...: ')
    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
}

function handleBotActionsFromKeyboard(ctx: any) {
  const text = ctx.message.text
  const scene = k2sMap.get(text)
  if (scene) {
    log('Moving to scene: ', k2sMap.get(text))
    ctx.scene.enter(scene)
  }
}
