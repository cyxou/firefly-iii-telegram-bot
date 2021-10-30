import dayjs from 'dayjs'
import debug from 'debug'
import { evaluate } from 'mathjs'
import { Composer, InlineKeyboard } from 'grammy'

import type { MyContext } from '../../types/MyContext'
import { getUserStorage } from '../../lib/storage'
import {
  parseAmountInput,
  formatTransaction,
  formatTransactionKeyboard,
  createCategoriesKeyboard
} from './helpers'

import firefly from '../../lib/firefly'
import { TransactionRead } from '../../lib/firefly/model/transaction-read'
import { TransactionStore } from '../../lib/firefly/model/transaction-store'
import { TransactionSplitStore } from '../../lib/firefly/model/transaction-split-store'
import { TransactionSplitStoreTypeEnum } from '../../lib/firefly/model/transaction-split-store'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'

const rootLog = debug(`bot:transactions:add`)

const CANCEL_ADDING      = 'CANCEL_ADDING_TRANSACTION'
const SELECT_CATEGORY    = /^ADD_TO_CATEGORY_ID=(.+)/
const SELECT_ACCOUNT     = /^ADD_TO_ACCOUNT_ID=(.+)/
const DELETE_TRANSACTION = /^DELETE_TRANSACTION_ID=(.+)/
const CREATE_TRANSFER    = /^CREATE_TRANSFER_AMOUNT=(.+)/
const CREATE_DEPOSIT     = /^CREATE_DEPOSIT_AMOUNT=(.+)/

const bot = new Composer<MyContext>()

bot.callbackQuery(CANCEL_ADDING, cancelCbQH)
bot.callbackQuery(CREATE_TRANSFER, createTransferTransaction)
bot.callbackQuery(CREATE_DEPOSIT, createDepositTransaction)
bot.callbackQuery(DELETE_TRANSACTION, deleteTransactionActionHandler)
bot.callbackQuery(SELECT_CATEGORY, newTransactionCategoryCbQH)
bot.callbackQuery(SELECT_ACCOUNT, createDepositTransactionCbQH)

export default bot

export async function addTransaction(ctx: MyContext) {
  const log = rootLog.extend('textHandler')
  log('Entered text handler')
  try {
    const userId = ctx.from!.id
    const text = ctx.message!.text as string
    log('ctx.message.text: %O', text)

    const validInput = /^(?<amountOnly>\d{1,}(?:[.,]\d+)?([-+/*^]\d{1,}(?:[.,]\d+)?)*)*$|(?<description>.+)\s(?<amount>\d{1,}(?:[.,]\d+)?([-+/*^]\d{1,}(?:[.,]\d+)?)*)$/
    const match = validInput.exec(text)
    log('match: %O', match)

    if (!match) return ctx.reply(ctx.i18n.t('transactions.add.dontUnderstand', {
      parse_mode: 'Markdown'
    }))

    let amount: string | number | null = match.groups!.amount || match.groups!.amountOnly
    amount = parseAmountInput(amount)
    log('amount: ', amount)

    if (!amount) return ctx.reply(ctx.i18n.t('transactions.add.dontUnderstand', {
      parse_mode: 'Markdown'
    }))

    const defaultAssetAccount = await getDefaultAccount(userId)
    log('defaultAssetAccount: %O', defaultAssetAccount)

    // If description is not null, than we'll add transaction in a fast mode
    // without asking a user any additional info
    const description = match.groups!.description
    log('description: ', description)
    if (description) {
      const tr = await createFastTransaction(userId, amount, description, defaultAssetAccount)
      return ctx.reply(
        formatTransaction(ctx, tr),
        formatTransactionKeyboard(ctx, tr)
      )
    }

    ctx.session.transaction = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Withdrawal,
        date: dayjs().toISOString(),
        description: 'N/A',
        source_id: null,
        source_name: defaultAssetAccount,
        amount: amount.toString(),
        category_id: '',
        destination_id: ''
      }]
    }

    const keyboard = await createCategoriesKeyboard(userId, 'ADD_TO_CATEGORY_ID=${categoryId}')
    keyboard
      .text(ctx.i18n.t('labels.TO_DEPOSITS'), `CREATE_DEPOSIT_AMOUNT=${amount}`).row()
      .text(ctx.i18n.t('labels.TO_TRANSFERS'), `CREATE_TRANSFER_AMOUNT=${amount}`).row()
      .text(ctx.i18n.t('labels.CANCEL'), CANCEL_ADDING)

    return ctx.reply(ctx.i18n.t('transactions.add.inWhatCategoryToAdd', {
      amount: amount }
    ), {
      parse_mode: 'Markdown',
      reply_markup:  keyboard
    })
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred handling text message: ', err)
    return ctx.reply(err.message)
  }
}

async function newTransactionCategoryCbQH(ctx: MyContext) {
  const log = rootLog.extend('newTransactionCategoryCbQH')
  log('Entered the newTransactionCategory callback handler...')

  try {
    const userId = ctx.from!.id
    const transaction = ctx.session.transaction as TransactionStore
    const categoryId = ctx.match![1]
    transaction.transactions![0].category_id = categoryId

    const defaultAssetAccount = await getDefaultAccount(userId)
    log('defaultAssetAccount: %O', defaultAssetAccount)

    log('transaction: %O', transaction)
    // const transactionStore = {
    //   transactions: [{
    //     type: TransactionSplitStoreTypeEnum.Withdrawal,
    //     date: dayjs().toISOString(),
    //     amount: transaction.transactions![0].amount.toString(),
    //     description: 'N/A',
    //     source_name: defaultAssetAccount,
    //     source_id: null,
    //     destination_id: null,
    //     destination_name: null,
    //     category_id: transaction.categoryId
    //   }]
    // }
    // log('transactionStore: %O', transactionStore)

    const tr = (await firefly(userId).Transactions.storeTransaction(transaction)).data.data
    log('Created transaction: %O', tr)
    ctx.session.transaction = {}

    await ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

    return ctx.answerCallbackQuery({ text: ctx.i18n.t('transactions.add.created') })
  } catch (err) {
    await ctx.answerCallbackQuery({ text: ctx.i18n.t('common.errorOccurred') })
    console.error('Error occurred in category action handler: ', err)
    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.transactionError', { message: err.message })
    )
  }
}

async function createDepositTransactionCbQH(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransactionCbQH')
  log('Entered the createDepositTransactionCbQH callback hanlder')

  try {
    const destId = ctx.match![1]
    const userId = ctx.from!.id
    const transaction = ctx.session.transaction as TransactionStore

    transaction.transactions![0].destination_id = destId

    // const transactionStore = {
    //   transactions: [{
    //     type: TransactionSplitStoreTypeEnum.Deposit,
    //     date: dayjs().toISOString(),
    //     // amount: transaction.amount.toString(),
    //     // description: 'N/A',
    //     source_name: defaultAssetAccount,
    //     source_id: null,
    //     destination_id: destId
    //   }]
    // }
    // const transactionSplit: TransactionSplitStore = {
    //   date: dayjs().toISOString(),
    //   amount: transaction.amount.toString(),
    //   type: TransactionSplitStoreTypeEnum.Deposit,
    //   source_name: defaultAssetAccount,
    //   destination_id: destId
    // }
    // transaction.transactions = [transactionSplit]
    
    log('transaction: %O', transaction)

    const tr = (await firefly(userId).Transactions.storeTransaction(transaction)).data.data
    log('Created transaction: %O', tr)

    await ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

    return ctx.answerCallbackQuery({ text: ctx.i18n.t('transactions.add.created') })
  } catch (err) {
    await ctx.answerCallbackQuery({ text: ctx.i18n.t('common.errorOccurred') })
    console.error('Error occurred in create deposit transaction action handler: ', err)
    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.transactionError', { message: err.message })
    )
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

async function deleteTransactionActionHandler(ctx: MyContext) {
  const log = rootLog.extend('deleteTransactionActionHandler')
  log('Entered deleteTransaction action handler')
  try {
    const userId = ctx.from!.id
    const trId = parseInt(ctx.match![1], 10)

    if (trId || !isNaN(trId)) await firefly(userId).Transactions.deleteTransaction(trId)
    else return ctx.reply(
      ctx.i18n.t('transactions.add.couldNotDelete', { id: trId })
    )

    await ctx.answerCallbackQuery({ text: ctx.i18n.t('transactions.add.transactionDeleted') })
    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
}

async function createFastTransaction(userId: number, amount: number, description: string, account: string): Promise<TransactionRead> {
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

    // log('res: %O', res)
    const tr = res.attributes.transactions[0]
    log('transaction: %O', tr)

    return res
  } catch (err) {
    console.error('Error occurred creating express transaction: ', err)
    return Promise.reject(err)
  }
}

async function createDepositTransaction(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransaction')
  try {
    const text: string = ctx.match![1] || ''
    const amount = parseAmountInput(text)
    log('amount: ', amount)
    if (!amount) return ctx.reply('ALOHA!')
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id
    const defaultAssetAccount = await getDefaultAccount(userId)

    ctx.session.transaction = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Deposit,
        date: dayjs().toISOString(),
        description: 'N/A',
        source_id: null,
        source_name: null,
        amount: amount.toString(),
        destination_id: '',
        destination_name: defaultAssetAccount
      }]
    }

    const accountsKeyboard = await createAccountsKeyboard(userId)
    accountsKeyboard.text(ctx.i18n.t('labels.CANCEL'), CANCEL_ADDING)

    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.inWhatAccountToAdd', { amount: amount }), {
        parse_mode: 'Markdown',
        reply_markup: accountsKeyboard
      }
    )

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

async function getDefaultAccount(userId: number) {
  const log = rootLog.extend('getDefaultAccount')
  try {
    let { defaultAssetAccount } = getUserStorage(userId)
    if (!defaultAssetAccount) {
      const firstAccount = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data[0]
      log('firstAccount: %O', firstAccount)
      defaultAssetAccount = firstAccount.attributes.name
    }

    return defaultAssetAccount
  } catch (err) {
    console.error('Error occurred getting default asset acount: ', err)
    throw err
  }
}
