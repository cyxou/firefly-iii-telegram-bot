import dayjs from 'dayjs'
import debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"
import { ParseMode } from '@grammyjs/types'

import type { MyContext } from '../types/MyContext'
import firefly, { ICreatedTransaction } from '../lib/firefly'
import { getUserStorage } from '../lib/storage'
import {
  text as t,
  keyboardButton as kb
} from '../lib/constants'

const rootLog = debug(`bot:composer:addTransaction`)

const CHOOSE_CATEGORY  = 'CHOOSE_CATEGORY'
const CHOOSE_ACCOUNT   = 'CHOOSE_ACCOUNT'
const CANCEL           = 'CANCEL_TRANSACTIONS'
const EDIT_TRANSACTION = 'EDIT_TRANSACTION'

const bot = new Composer<MyContext>()
bot.callbackQuery(CANCEL, cancelCallbackQueryHandler)
bot.callbackQuery(EDIT_TRANSACTION, editTransactionHandler)
bot.callbackQuery(/^!deleteTransactionId=(.+)$/, deleteTransactionActionHandler)
bot.callbackQuery(/^!category=(.+)$/, categoryCallbackQueryHandler)
const router = new Router<MyContext>((ctx) => ctx.session.transactionsStep)

router.route('idle', ctx => ctx.reply('transaction idle'))

export default bot

bot.on('message:text', textHandler)

async function textHandler(ctx: MyContext) {
  const log = rootLog.extend('textHandler')
  log('Entered text handler')
  try {
    const userId = ctx.from!.id
    const text = ctx.message!.text as string
    log('ctx.message.text: %O', text)

    const validInput = /^(?<amountOnly>\d{1,}(?:[.,]\d+)?)$|(?<description>.+)\s(?<amount>\d{1,}(?:[.,]\d+)?)$/gi
    const match = validInput.exec(text)
    log('match: %O', match)

    if (!match) return ctx.reply(t.dontUnderstand)

    let amount: string | number = match.groups!.amount || match.groups!.amountOnly
    amount = parseFloat(amount.replace(',', '.'))
    const description = match.groups!.description
    log('amount: ', amount)
    log('description: ', description)

    let { defaultAssetAccount } = getUserStorage(userId)
    if (!defaultAssetAccount) {
      const firstAccount = (await firefly.getAccounts('asset', userId))[0]
      defaultAssetAccount = firstAccount.attributes.name
    }
    log('defaultAssetAccount: %O', defaultAssetAccount)

    // If description is not null, than we'll add transaction in a fast mode
    // without asking a user any additional info
    if (description) {
      const t = await createFastTransaction(userId, amount, description, defaultAssetAccount)
      return ctx.reply(
        formatTransactionMessage(t),
        formatTransactionKeyboard(t)
      )
    }

    ctx.session.transaction = {
      amount,
      categoryName: '',
      sourceName: defaultAssetAccount
      // destinationId: expenseAccount.id
    }

    const categories = await createCategoriesKeyboard(userId)
    return ctx.reply(`В какую категорию добавить ${text}?`, categories)
  } catch (err) {
    console.error('Error occurred handling text message: ', err)
    return ctx.reply(err.message)
  }
}

async function categoryCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('categoryCallbackQueryHandler')
  log('Entered the categoryCallbackQueryHandler callback hanlder')

  try {
    const categoryName = ctx.match![1]
    ctx.session.transaction.categoryName = categoryName

    const userId = ctx.from!.id
    const { transaction } = ctx.session

    const res = await firefly.createTransaction(transaction, userId)
    const t = res.attributes.transactions[0]

    await ctx.editMessageText(
      formatTransactionMessage(t),
      formatTransactionKeyboard(t)
    )

    return ctx.answerCallbackQuery({ text: 'Транзакция создана!' })
  } catch (err) {
    await ctx.answerCallbackQuery({ text: 'Произошла ошибка!' })
    console.error('Error occurred in category action handler: ', err)
    return ctx.editMessageText(`❗😰 Произошла ошибка при создании транзакции: ${err.message}`)
  }
}

async function cancelCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('cancelCallbackQueryHandler')
  try {
    log('Cancelling...: ')
    const userId = ctx.from!.id
    log('userId: %O', userId)
    ctx.session.transactionsStep = 'idle'
    await ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
}

function editTransactionHandler(ctx: MyContext) {
  const log = rootLog.extend('editTransactionHandler')
  try {
    log('@TODO Edit transaction...: ')
    // add note to transaction with telegram message Id
    // Then search for this message id by `notes_contain:query` and edit transaction
    return ctx.reply('Not implemented')
  } catch (err) {
    console.error(err)
  }
}

async function deleteTransactionActionHandler(ctx: MyContext) {
  const log = rootLog.extend('deleteTransactionActionHandler')
  log('Entered deleteTransactionActionHandler action handler')
  try {
    const userId = ctx.from!.id
    const trId = ctx.match![1]

    if (trId) await firefly.deleteTransaction(trId, userId)
    else return ctx.reply(`Could not delete this transaction: ${trId}`)

    await ctx.answerCallbackQuery({ text: 'Транзакция удалена!' })
    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
}

async function createFastTransaction(userId: number, amount: number, description: string, account: string): Promise<ICreatedTransaction> {
  const log = rootLog.extend('createFastTransaction')
  try {
    const res = await firefly.createTransaction({
      amount,
      description,
      sourceName: account
    }, userId)

    log('res: %O', res)
    const t = res.attributes.transactions[0]
    log('t: %O', t)

    return t
  } catch (err) {
    console.error('Error occurred creating express transaction: ', err)
    return Promise.reject(err)
  }
}

function formatTransactionMessage(t: ICreatedTransaction) {
  const log = rootLog.extend('formatTransactionMessage')
  log('t: %O', t)
  const date = dayjs(t.date).format('DD MMM YYYY г.')
  return `
Добавлено ${t.description === 'N/A' ? '' : '*' + t.description + '* '}*${parseFloat(t.amount)}* *${t.currency_symbol}*${t.category_name ? ' в категорию *' + t.category_name + '*' : ''}
${date}`
}

function formatTransactionKeyboard(t: ICreatedTransaction) {
  const inlineKeyboard = new InlineKeyboard()
    .text(kb.MODIFY_DATE, EDIT_TRANSACTION)
    .text(kb.DELETE, `!deleteTransactionId=${t.transaction_journal_id}`)

  return {
    parse_mode: 'Markdown' as ParseMode,
    reply_markup: inlineKeyboard
  }
}

async function createCategoriesKeyboard(userId: number) {
  try {
    const categories = await firefly.getCategories(userId)
    const keyboard = new InlineKeyboard()
    categories.forEach((c: any) => keyboard.text(
      c.attributes.name, `!category=${c.attributes.name}`).row()
    )

    keyboard.text(kb.CANCEL, CANCEL)

    return { reply_markup: keyboard }
  } catch (err) {
    console.error('Error occurred creating categories keyboard: ', err)
    throw err
  }
}
