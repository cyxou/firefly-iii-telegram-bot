import dayjs from 'dayjs'
import debug from 'debug'
import { Scenes, Markup } from 'telegraf'

import firefly, { ITransaction } from '../firefly'
import { getDataFromUserStorage } from '../storage'
import {
  scene as c,
  text as t,
  mainKeyboard,
  keyboardButton as kb,
  keyboardToScenesMap as k2sMap
} from '../constants'

const log = debug(`bot:${c.ADD_TRANSACTION_SCENE}`)

const { enter, leave } = Scenes.Stage

const CHOOSE_CATEGORY    = 'CHOOSE_CATEGORY'
const CHOOSE_ACCOUNT     = 'CHOOSE_ACCOUNT'
const CANCEL             = 'CANCEL'
const EDIT_TRANSACTION   = 'EDIT_TRANSACTION'

interface MySceneSession extends Scenes.SceneSessionData {
  // Will be available under `ctx.scene.session.transaction`
  userId?: number,
  transaction?: ITransaction
}

type MyContext = Scenes.SceneContext<MySceneSession>

const scene = new Scenes.BaseScene<MyContext>(c.ADD_TRANSACTION_SCENE)

scene.enter(textHandler)
scene.leave((ctx) => console.log('Exiting scene....'))
scene.action(CANCEL, cancelActionHandler)
scene.action(EDIT_TRANSACTION, editTransactionHandler)
scene.action(/^!deleteTransactionId=(.+)$/, deleteTransactionActionHandler)
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
    mainKeyboard
  )
}

async function textHandler (ctx: any) {
  log('Entered text handler')

  try {
    // Since this is the default scene, we need to watch out for the keyboard
    // commands a users clicks on:
    handleBotActionsFromKeyboard(ctx)

    const userId = ctx.message.from.id
    const text = ctx.message.text
    log('ctx.message.text: %O', text)

    const validInput = /^(?<amountOnly>\d{1,}(:[.,]\d+)?)$|(?<description>.+)\s(?<amount>\d{1,}(:[.,]\d+)?)$/gi
    const match = validInput.exec(text)
    log('match: %O', match)

    if (!match) return ctx.reply(`
Я пока такое не понимаю! 🤖
Введите сумму транзакции (это должно быть число 😉):`)

    let amount: string | number = match.groups!.amount || match.groups!.amountOnly
    amount = parseFloat(amount.replace(',', ''))
    const description = match.groups!.description
    log('amount: ', amount)
    log('description: ', description)

    let { defaultAssetAccount } = getDataFromUserStorage(userId)
    if (!defaultAssetAccount) {
      const firstAccount = (await firefly.getAccounts('asset', userId))[0]
      defaultAssetAccount = firstAccount.attributes.name
    }
    log('defaultAssetAccount: %O', defaultAssetAccount)

    // If description is not null, than we'll add transaction in a fast mode
    // without asking a user any additional info
    if (description) {
      const t = await createExpressTransaction(userId, amount, description, defaultAssetAccount)
      // log('t: %O', t)
      return ctx.replyWithHTML(formatTransactionMessage(t), {
        ...Markup.inlineKeyboard([
          Markup.button.callback(kb.MODIFY_DATE, EDIT_TRANSACTION),
          Markup.button.callback(kb.DELETE, `!deleteTransactionId=${t.id}`),
        ], { columns: 2})
      })
    }

    ctx.scene.session.transaction = {
      amount,
      categoryName: '',
      sourceName: defaultAssetAccount
      // destinationId: expenseAccount.id
    }

    const keyboard = await createCategoriesKeyboard(userId)
    return ctx.reply(`В какую категорию добавить ${ctx.message.text}?`, keyboard)
  } catch (err) {
    console.error('Error occurred handling text message: ', err)
    return ctx.reply(err.message)
  }
}

async function categoryActionHandler(ctx: any) {
  log('Entered the categoryActionHandler action hanlder')

  try {
    const categoryName = ctx.match[1]
    ctx.scene.session.transaction!.categoryName = categoryName

    const formatedDate = dayjs().format('DD MMM YYYY г.')
    const { userId } = ctx.scene.session
    const { transaction } = ctx.scene.session

    const tr = await firefly.createTransaction(transaction, userId)

    await ctx.editMessageText(
      `Добавлено *${ctx.scene.session.transaction!.amount}* в категорию расходов: *${categoryName}*\n${formatedDate}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback(kb.MODIFY_DATE, EDIT_TRANSACTION),
        Markup.button.callback(kb.DELETE, `!deleteTransactionId=${tr.id}`),
      ], { columns: 2})
    })

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

async function deleteTransactionActionHandler(ctx: any) {
  log('Entered deleteTransactionActionHandler action handler')

  try {
    const { userId } = ctx.scene.session
    const trId = ctx.match[1]

    if (trId) await firefly.deleteTransaction(trId, userId)
    else return ctx.reply('Could not delete this transaction: ', trId)

    await ctx.answerCbQuery('Транзакция удалена!')
    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
}

function handleBotActionsFromKeyboard(ctx: any) {
  log('Entered handleBotActionsFromKeyboard function')
  const text = ctx.message.text
  const scene = k2sMap.get(text)

  if (scene) {
    log('Moving to scene: ', k2sMap.get(text))
    ctx.scene.enter(scene)
  }
}

async function createExpressTransaction(userId: number, amount: number, description: string, account: string): Promise<ICreatedTransaction> {
  try {
    const res = await firefly.createTransaction({
      amount,
      description,
      sourceName: account
    }, userId)

    log('res: %O', res)
    log('res.attributes.transaction: %O', res.attributes.transactions)
    const t = res.attributes.transactions[0]

    return {
      id: res.id,
      amount: parseFloat(t.amount),
      date: t.date,
      type: t.type,
      currencySymbol: t.currency_symbol,
      description: t.description,
      category: t.category_name,
    }
  } catch (err) {
    console.error('Error occurred creating express transaction: ', err)
    return Promise.reject(err)
  }
}

function formatTransactionMessage(t: ICreatedTransaction) {
//   return `
// Добавлено *${t.description}* *${t.amount}* *${t.currencySymbol}* в категорию *${t.category}*\n${dayjs(t.date).format('DD MMM YYYY г.')}`
  return `${dayjs(t.date).format('DD MMM YYYY г.')}
<pre>
| Tables   |      Are      |  Cool |  Cool |  Cool |
|----------|:-------------:|------:|------:|------:|
| col 1 is |  left-aligned | $1600 | $1600 | $1600 |
| col 2 is |    centered   |   $12 |   $12 |   $12 |
| col 3 is | right-aligned |    $1 |    $1 |    $1 |
</pre>`
}

async function createCategoriesKeyboard(userId: number) {
  try {
    const categories = await firefly.getCategories(userId)
    const catNames = categories.map((c: any) => c.attributes.name)

    const keyboard = categories.map((c: any) => Markup.button.callback(
      c.attributes.name,
      `!category=${c.attributes.name}`
    ))
    keyboard.push(Markup.button.callback(kb.CANCEL, CANCEL))
    return {
      ...Markup.inlineKeyboard(keyboard, { columns: 1})
    }
  } catch (err) {
    console.error('Error occurred creating categories keyboard: ', err)
    throw err
  }
}

type ICreatedTransaction = {
  id: number,
  type: string,
  amount: number,
  date: string,
  currencySymbol: string,
  description: string,
  category: string
}
