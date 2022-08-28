import dayjs from 'dayjs'
import debug from 'debug'
import { Composer } from 'grammy'

import type { MyContext } from '../../types/MyContext'
import { getUserStorage } from '../../lib/storage'
import {
  addTransactionsMapper as mapper,
  parseAmountInput,
  formatTransaction,
  formatTransactionKeyboard,
  createCategoriesKeyboard,
  createAccountsKeyboard
} from '../helpers'

import firefly from '../../lib/firefly'
import { TransactionRead } from '../../lib/firefly/model/transaction-read'
import { TransactionSplitStoreTypeEnum } from '../../lib/firefly/model/transaction-split-store'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'

const rootLog = debug(`bot:transactions:add`)

const bot = new Composer<MyContext>()

// Add Withdrawal and common handlers
bot.callbackQuery(mapper.selectCategory.regex(), newTransactionCategoryCbQH)
bot.callbackQuery(mapper.delete.regex(), deleteTransactionActionHandler)
bot.callbackQuery(mapper.cancelAdd.regex(), cancelCbQH)

// Add Deposit transactions handlers
bot.callbackQuery(mapper.addDeposit.regex(), startCreatingDepositTransaction)
bot.callbackQuery(mapper.selectRevenueAccount.regex(), selectAssetAccount)
bot.callbackQuery(mapper.selectAssetAccount.regex(), createDepositTransaction)

// Add Transfer transactions handlers
bot.callbackQuery(mapper.addTransfer.regex(), startCreatingTransferTransaction)
bot.callbackQuery(mapper.selectSourceAccount.regex(), selectDestAccount)
bot.callbackQuery(mapper.selectDestAccount.regex(), createTransferTransaction)

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

    const defaultAssetAccountId = await getDefaultAccountId(userId)
    log('defaultAssetAccountId: %O', defaultAssetAccountId)

    // If description is not null, than we'll add transaction in a fast mode
    // without asking a user any additional info
    const description = match.groups!.description
    log('description: ', description)

    if (description) {
      const tr = await createFastTransaction(
        userId,
        amount,
        description,
        defaultAssetAccountId.toString()
      )

      return ctx.reply(
        formatTransaction(ctx, tr),
        formatTransactionKeyboard(ctx, tr)
      )
    }

    ctx.session.newTransaction = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Withdrawal,
        date: dayjs().toISOString(),
        description: 'N/A',
        source_id: defaultAssetAccountId.toString(),
        amount: amount.toString(),
        category_id: '',
        destination_id: ''
      }]
    }

    const keyboard = await createCategoriesKeyboard(
      userId,
      mapper.selectCategory
    )
    keyboard
      .text(ctx.i18n.t('labels.TO_DEPOSITS'), mapper.addDeposit.template({ amount })).row()
      .text(ctx.i18n.t('labels.TO_TRANSFERS'), mapper.addTransfer.template({ amount })).row()
      .text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('keyboard: %O', keyboard.inline_keyboard)

    return ctx.reply(ctx.i18n.t('transactions.add.selectCategory', { amount: amount }), {
      parse_mode: 'Markdown',
      reply_markup:  keyboard
    })
  } catch (err: any) {
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
    const transaction = ctx.session.newTransaction
    const categoryId = ctx.match![1]
    transaction.transactions![0].category_id = categoryId

    const defaultAssetAccount = await getDefaultAccountId(userId)
    log('defaultAssetAccount: %O', defaultAssetAccount)

    log('transaction: %O', transaction)

    const tr = (await firefly(userId).Transactions.storeTransaction(transaction)).data.data
    log('Created transaction: %O', tr)
    ctx.session.newTransaction = { transactions: [] }

    await ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

    return ctx.answerCallbackQuery({ text: ctx.i18n.t('transactions.add.created') })
  } catch (err: any) {
    await ctx.answerCallbackQuery({ text: ctx.i18n.t('common.errorOccurred') })
    console.error('Error occurred in category action handler: ', err)
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

async function createFastTransaction(userId: number, amount: number, description: string, accountId: string): Promise<TransactionRead> {
  const log = rootLog.extend('createFastTransaction')
  try {
    const transactionStore = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Withdrawal,
        date: dayjs().toISOString(),
        amount: amount.toString(),
        description,
        source_id: accountId,
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

async function startCreatingDepositTransaction(ctx: MyContext) {
  const log = rootLog.extend('startCreatingDepositTransaction')
  try {
    const text: string = ctx.match![1] || ''
    const amount = parseAmountInput(text)
    log('amount: ', amount)
    if (!amount) return ctx.reply('ALOHA!')
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    ctx.session.newTransaction = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Deposit,
        date: dayjs().toISOString(),
        description: 'N/A',
        source_id: null,
        amount: amount.toString(),
        destination_id: null
      }]
    }

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      AccountTypeFilter.Revenue,
      mapper.selectRevenueAccount
    )
    accountsKeyboard.text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('accountsKeyboard: %O', accountsKeyboard)

    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectRevenueAccount', { amount: amount }), {
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

async function selectAssetAccount(ctx: MyContext) {
  const log = rootLog.extend('selectAssetAccount')
  try {
    const revenueAccountId: string = ctx.match![1] || ''
    log('revenueAccountId: ', revenueAccountId)
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    const amount = ctx.session.newTransaction.transactions![0].amount
    ctx.session.newTransaction.transactions![0].source_id = revenueAccountId

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      AccountTypeFilter.Asset,
      mapper.selectAssetAccount
    )
    accountsKeyboard.text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('accountsKeyboard: %O', accountsKeyboard)

    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectAssetAccount', { amount: amount }), {
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

async function selectDestAccount(ctx: MyContext) {
  const log = rootLog.extend('selectSourceAccount')
  try {
    const sourceId: string = ctx.match![1] || ''
    log('sourceId: ', sourceId)
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    const transaction = ctx.session.newTransaction.transactions[0]
    const amount = transaction.amount
    transaction.source_id = sourceId

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      AccountTypeFilter.Asset,
      mapper.selectDestAccount,
      { skipAccountId: transaction.source_id }
    )
    accountsKeyboard.text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('accountsKeyboard: %O', accountsKeyboard)

    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectDestAccount', { amount: amount }), {
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

async function createDepositTransaction(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransaction')
  try {
    const assetAccountId: string = ctx.match![1] || ''
    log('assetAccountId: ', assetAccountId)
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    const transaction = ctx.session.newTransaction
    transaction.transactions[0].destination_id = assetAccountId

    const tr = (await firefly(userId).Transactions.storeTransaction(transaction)).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured creating deposit transaction: ', err)
    throw err
  }
}

async function startCreatingTransferTransaction(ctx: MyContext) {
  const log = rootLog.extend('startCreatingTransferTransaction')
  log('Entered the startCreatingTransferTransaction query handler...')
  try {
    const text: string = ctx.match![1] || ''
    const amount = parseAmountInput(text)
    log('amount: ', amount)
    if (!amount) return ctx.reply('No amount specified')
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    ctx.session.newTransaction = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Transfer,
        date: dayjs().toISOString(),
        description: 'N/A',
        source_id: null,
        amount: amount.toString(),
        destination_id: null
      }]
    }

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      AccountTypeFilter.Asset,
      mapper.selectSourceAccount
    )
    accountsKeyboard.text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('accountsKeyboard: %O', accountsKeyboard)

    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectSourceAccount', { amount: amount }), {
        parse_mode: 'Markdown',
        reply_markup: accountsKeyboard
      }
    )

  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured creating transfer transaction: ', err)
    throw err
  }
}

async function createTransferTransaction(ctx: MyContext) {
  const log = rootLog.extend('createTransferTransaction')
  try {
    const destId: string = ctx.match![1] || ''
    log('destId: ', destId)
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    const transaction = ctx.session.newTransaction
    transaction.transactions[0].destination_id = destId

    const tr = (await firefly(userId).Transactions.storeTransaction(transaction)).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured creating deposit transaction: ', err)
    throw err
  }
}

async function getDefaultAccountId(userId: number) {
  const log = rootLog.extend('getDefaultAccountId')
  try {
    let { defaultAssetAccountId } = getUserStorage(userId)

    if (!defaultAssetAccountId) {
      const firstAccount = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data[0]
      log('firstAccount: %O', firstAccount)
      defaultAssetAccountId = parseInt(firstAccount.id, 10)
    }

    return defaultAssetAccountId
  } catch (err) {
    console.error('Error occurred getting default asset acount: ', err)
    throw err
  }
}
