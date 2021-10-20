import dayjs from 'dayjs'
import debug from 'debug'
import { Composer, Keyboard, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"
import { ParseMode } from '@grammyjs/types'

import type { MyContext } from '../types/MyContext'
import firefly from '../lib/firefly'
import { ICreatedTransaction } from '../lib/firefly/transactions'
import { getUserStorage } from '../lib/storage'
import {
  text as t,
  keyboardButton as b
} from '../lib/constants'
import { createCategoriesInlineKeyboard } from './categories'

const rootLog = debug(`bot:composer:addTransaction`)

const SELECT_CATEGORY    = /^ADD_TO_CATEGORY_ID=(.+)/
const SELECT_ACCOUNT     = /^ADD_TO_ACCOUNT_ID=(.+)/
const CHOOSE_CATEGORY    = 'CHOOSE_CATEGORY'
const CHOOSE_ACCOUNT     = 'CHOOSE_ACCOUNT'
const CANCEL             = 'CANCEL_TRANSACTIONS'
const EDIT_TRANSACTION   = 'EDIT_TRANSACTION'
const DELETE_TRANSACTION = /^DELETE_TRANSACTION_ID=(.+)/
const CREATE_TRANSFER    = /^CREATE_TRANSFER_AMOUNT=(.+)/
const CREATE_DEPOSIT     = /^CREATE_DEPOSIT_AMOUNT=(.+)/

const bot = new Composer<MyContext>()
bot.callbackQuery(CANCEL, cancelCallbackQueryHandler)
bot.callbackQuery(EDIT_TRANSACTION, editTransactionHandler)
bot.callbackQuery(CREATE_TRANSFER, createTransferTransaction)
bot.callbackQuery(CREATE_DEPOSIT, createDepositTransaction)
bot.callbackQuery(DELETE_TRANSACTION, deleteTransactionActionHandler)
bot.callbackQuery(SELECT_CATEGORY, categoryCallbackQueryHandler)
bot.callbackQuery(SELECT_ACCOUNT, accountCallbackQueryHandler)
const router = new Router<MyContext>((ctx) => ctx.session.step)

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
      const tr = await createFastTransaction(userId, amount, description, defaultAssetAccount)
      return ctx.reply(
        t.withdrawalAddedMessage(tr),
        formatTransactionKeyboard(tr)
      )
    }

    ctx.session.transaction = {
      type: 'withdrawal',
      amount,
      categoryId: '',
      // destinationId: expenseAccount.id
    }

    const keyboard = await createCategoriesKeyboard(userId)
    keyboard
      .text(b.TO_DEPOSITS, `CREATE_DEPOSIT_AMOUNT=${amount}`)
      .text(b.TO_TRANSFERS, `CREATE_TRANSFER_AMOUNT=${amount}`).row()
      .text(b.CANCEL, CANCEL)

    return ctx.reply(t.inWhatCategoryToAdd(text), {
      parse_mode: 'Markdown',
      reply_markup:  keyboard
    })
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred handling text message: ', err)
    return ctx.reply(err.message)
  }
}

async function categoryCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('categoryCallbackQueryHandler')
  log('Entered the categoryCallbackQueryHandler callback hanlder')

  try {
    const categoryId = ctx.match![1]
    ctx.session.transaction.categoryId = categoryId

    const userId = ctx.from!.id
    const { transaction } = ctx.session

    const res = await firefly.createTransaction(transaction, userId)
    const tr = res.attributes.transactions[0]

    await ctx.editMessageText(
      t.withdrawalAddedMessage(tr),
      formatTransactionKeyboard(tr)
    )

    return ctx.answerCallbackQuery({ text: 'Транзакция создана!' })
  } catch (err) {
    await ctx.answerCallbackQuery({ text: 'Произошла ошибка!' })
    console.error('Error occurred in category action handler: ', err)
    return ctx.editMessageText(`❗😰 Произошла ошибка при создании транзакции: ${err.message}`)
  }
}

async function accountCallbackQueryHandler(ctx: MyContext) {
  const log = rootLog.extend('accountCallbackQueryHandler')
  log('Entered the accountCallbackQueryHandler callback hanlder')

  try {
    const accountId = ctx.match![1]
    const userId = ctx.from!.id
    const { defaultAssetAccount } = getUserStorage(userId)
    const { transaction } = ctx.session
    transaction.type = 'deposit'
    transaction.sourceName = defaultAssetAccount
    transaction.destinationId = accountId
    // FUCK
    // transaction.sourceId = 64

    log('transaction: %O', transaction)

    const res = await firefly.createTransaction(transaction, userId)
    const tr = res.attributes.transactions[0]

    await ctx.editMessageText(
      t.depositAddedMessage(tr),
      formatTransactionKeyboard(tr)
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
      type: 'withdrawal',
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

function formatTransactionKeyboard(t: ICreatedTransaction) {
  const inlineKeyboard = new InlineKeyboard()
    .text(b.MODIFY_DATE, EDIT_TRANSACTION)
    .text(b.DELETE, `DELETE_TRANSACTION_ID=${t.transaction_journal_id}`)

  return {
    parse_mode: 'Markdown' as ParseMode,
    reply_markup: inlineKeyboard
  }
}

async function createCategoriesKeyboard(userId: number) {
  const log = rootLog.extend('createCategoriesKeyboard')
  try {
    const categories = await firefly.getCategories(userId)
    log('categories: %O', categories)
    const keyboard = new InlineKeyboard()

    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]
      const last = categories.length - 1
      keyboard.text(c.attributes.name, `ADD_TO_CATEGORY_ID=${c.id}`)
      // Split categories keyboard into two columns so that every odd indexed
      // category starts from new row as well as the last category in the list.
      if (i % 2 !== 0 || i === last) keyboard.row()
    }

    return keyboard
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred creating categories keyboard: ', err)
    throw err
  }
}

async function createDepositTransaction(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransaction')
  try {
    const amount = ctx.match![1]
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    const accountsKeyboard = await createAccountsKeyboard(userId)
    accountsKeyboard.text(b.CANCEL, CANCEL)

    return ctx.editMessageText(t.inWhatAccountToAdd(amount), {
      parse_mode: 'Markdown',
      reply_markup: accountsKeyboard
    })

  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured creating deposit transaction: ', err)
    throw err
  }
}

async function createTransferTransaction(ctx: MyContext) {
  const log = rootLog.extend('createTransferTransaction')
  try {

  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured creating transfer transaction: ', err)
    throw err
  }
}


async function createAccountsKeyboard(userId: number) {
  const log = rootLog.extend('createAccountsKeyboard')
  try {
    const accounts = await firefly.getAccounts('asset', userId)
    log('accounts: %O', accounts)
    const keyboard = new InlineKeyboard()

    for (let i = 0; i < accounts.length; i++) {
      const c = accounts[i]
      const last = accounts.length - 1
      const name = c.attributes.name
      const currencySymbol = c.attributes.currency_symbol
      keyboard.text(
        `${name}${name.includes(currencySymbol) ? '' : ` (${currencySymbol})`}`,
        `ADD_TO_ACCOUNT_ID=${c.id}`
      )
      // Split accounts keyboard into two columns so that every odd indexed
      // category starts from new row as well as the last account in the list.
      if (i % 2 !== 0 || i === last) keyboard.row()
    }

    return keyboard
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred creating categories keyboard: ', err)
    throw err
  }
}
