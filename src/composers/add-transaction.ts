import dayjs from 'dayjs'
import debug from 'debug'
import { Composer, Keyboard, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"
import { ParseMode } from '@grammyjs/types'

import type { MyContext } from '../types/MyContext'
import { getUserStorage } from '../lib/storage'
import {
  text as t,
  keyboardButton as b
} from '../lib/constants'
import { createCategoriesInlineKeyboard } from './categories'

import firefly from '../lib/firefly'
import { TransactionSplit } from '../lib/firefly/model/transaction-split'
import { TransactionSplitStoreTypeEnum } from '../lib/firefly/model/transaction-split-store'
import { AccountTypeFilter } from '../lib/firefly/model/account-type-filter'

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
bot.callbackQuery(CANCEL, cancelCbQH)
bot.callbackQuery(EDIT_TRANSACTION, editTransactionHandler)
bot.callbackQuery(CREATE_TRANSFER, createTransferTransaction)
bot.callbackQuery(CREATE_DEPOSIT, createDepositTransaction)
bot.callbackQuery(DELETE_TRANSACTION, deleteTransactionActionHandler)
bot.callbackQuery(SELECT_CATEGORY, categoryCbQH)
bot.callbackQuery(SELECT_ACCOUNT, createDepositTransactionCbQH)
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
      const firstAccount = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data[0]
      log('firstAccount: %O', firstAccount)
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

async function categoryCbQH(ctx: MyContext) {
  const log = rootLog.extend('categoryCbQH')
  log('Entered the categoryCbQH callback hanlder')

  try {
    const categoryId = ctx.match![1]
    ctx.session.transaction.categoryId = categoryId

    const userId = ctx.from!.id
    const { transaction } = ctx.session

    const res = (await firefly(userId).Transactions.storeTransaction(transaction)).data.data
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

async function createDepositTransactionCbQH(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransactionCbQH')
  log('Entered the createDepositTransactionCbQH callback hanlder')

  try {
    const accountId = ctx.match![1]
    const userId = ctx.from!.id
    const { defaultAssetAccount } = getUserStorage(userId)
    const { transaction } = ctx.session

    log('transaction: %O', transaction)
    const transactionStore = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Deposit,
        date: dayjs().toISOString(),
        amount: transaction.amount.toString(),
        description: 'N/A',
        source_name: defaultAssetAccount,
        source_id: null,
        destination_id: accountId
      }]
    }

    const res = (await firefly(userId).Transactions.storeTransaction(transactionStore)).data.data
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

async function cancelCbQH(ctx: MyContext) {
  const log = rootLog.extend('cancelCbQH')
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
    const trId = parseInt(ctx.match![1], 10)

    if (trId || !isNaN(trId)) await firefly(userId).Transactions.deleteTransaction(trId)
    else return ctx.reply(t.couldNotDeleteTransaction(trId))

    await ctx.answerCallbackQuery({ text: t.transactionDeleted })
    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
}

async function createFastTransaction(userId: number, amount: number, description: string, account: string): Promise<TransactionSplit> {
  const log = rootLog.extend('createFastTransaction')
  try {
    const transactionStore = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Withdrawal,
        date: dayjs().toISOString(),
        amount: amount.toString(),
        description,
        source_name: account,
        source_id: null,
        destination_id: null,
      }]
    }
    const res = (await firefly(userId).Transactions.storeTransaction(transactionStore)).data.data

    log('res: %O', res)
    const t = res.attributes.transactions[0]
    log('t: %O', t)

    return t
  } catch (err) {
    console.error('Error occurred creating express transaction: ', err)
    return Promise.reject(err)
  }
}

function formatTransactionKeyboard(t: TransactionSplit) {
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
    const categories = (await firefly(userId).Categories.listCategory()).data.data
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
    const accounts = (await firefly(userId).Accounts.listAccount(1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data
    log('accounts: %O', accounts)
    const keyboard = new InlineKeyboard()

    for (let i = 0; i < accounts.length; i++) {
      const c = accounts[i]
      const last = accounts.length - 1
      const name = c.attributes.name
      const currencySymbol = c.attributes.currency_symbol || ''
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
