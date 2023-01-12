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
bot.callbackQuery(mapper.selectRevenueAccount.regex(), selectDestAccount)
bot.callbackQuery(mapper.selectAssetAccount.regex(), createTransaction)

// Add Transfer transactions handlers
bot.callbackQuery(mapper.addTransfer.regex(), startCreatingTransferTransaction)
bot.callbackQuery(mapper.selectSourceAccount.regex(), selectDestAccount)
bot.callbackQuery(mapper.selectDestAccount.regex(), createTransaction)

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

    const defaultSourceAccount = await getDefaultSourceAccount(userId)
    log('defaultSourceAccount: %O', defaultSourceAccount)

    const defaultDestinationAccount = await getDefaultDestinationAccount(userId)
    log('defaultDestinationAccount: %O', defaultDestinationAccount)

    // If description is not null, than we'll add transaction in a fast mode
    // without asking a user any additional info
    const description = match.groups!.description
    log('description: ', description)

    if (description) {
      log('Creating quick transaction...')
      const tr = await createQuickTransaction({
        userId,
        // Telegram message date is a Unix timestamp (10 digits, seconds since the Unix Epoch)
        date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
        amount,
        description,
        sourceAccountId: defaultSourceAccount.id.toString(),
        destinationAccountId: defaultDestinationAccount.id.toString()
      })

      return ctx.reply(
        formatTransaction(ctx, tr),
        formatTransactionKeyboard(ctx, tr)
      )
    }

    ctx.session.newTransaction = {
      type: TransactionSplitStoreTypeEnum.Withdrawal,
      date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
      description: 'N/A',
      sourceAccount: defaultSourceAccount,
      amount: amount.toString(),
      categoryId: null,
      destAccount: null,
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
    const categoryId = ctx.match![1]
    log('categoryId: %s', categoryId)
    const defaultSourceAccount = await getDefaultSourceAccount(userId)
    log('defaultSourceAccount: %O', defaultSourceAccount)
    const defaultDestinationAccount = await getDefaultDestinationAccount(userId)
    log('defaultDestinationAccount: %O', defaultDestinationAccount)

    const payload = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Withdrawal,
        date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
        description: 'N/A',
        source_id: defaultSourceAccount.id.toString(),
        amount: ctx.session.newTransaction.amount || '',
        category_id: categoryId,
        destination_id: defaultDestinationAccount.id.toString()
      }]
    }

    log('Transaction payload: %O', payload)

    const tr = (await firefly(userId).Transactions.storeTransaction(payload)).data.data
    log('Created transaction: %O', tr)
    ctx.session.newTransaction = {}

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

interface ICreateFastTransactionPayload {
  userId: number
  amount: number
  description: string
  sourceAccountId: string
  destinationAccountId: string
  date: string | undefined
}

async function createQuickTransaction({ userId, amount, description, sourceAccountId, destinationAccountId, date }: ICreateFastTransactionPayload): Promise<TransactionRead> {
  const log = rootLog.extend('createFastTransaction')
  try {
    const transactionStore = {
      transactions: [{
        type: TransactionSplitStoreTypeEnum.Withdrawal,
        date: dayjs(date || Date.now()).toISOString(),
        amount: amount.toString(),
        description,
        source_id: sourceAccountId,
        destination_id: destinationAccountId,
      }]
    }
    const res = (await firefly(userId).Transactions.storeTransaction(transactionStore)).data.data

    log('Created transaction: %O', res)
    log('Created transaction splits: %O', res.attributes.transactions)

    return res
  } catch (err) {
    console.error('Error occurred creating express transaction: ', err)
    return Promise.reject(err)
  }
}

async function getDefaultSourceAccount(userId: number) {
  const log = rootLog.extend('getDefaultSourceAccount')
  try {
    let { defaultSourceAccount } = getUserStorage(userId)

    if (!defaultSourceAccount.name) {
      const firstAccount = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data[0]
      log('firstAccount: %O', firstAccount)
      defaultSourceAccount = {
        id: firstAccount.id,
        name: firstAccount.attributes.name,
        type: firstAccount.attributes.type
      }
    }

    return defaultSourceAccount
  } catch (err) {
    console.error('Error occurred getting default source acount: ', err)
    throw err
  }
}

async function getDefaultDestinationAccount(userId: number) {
  const log = rootLog.extend('getDefaultDestinationAccount')
  try {
    let { defaultDestinationAccount } = getUserStorage(userId)

    if (!defaultDestinationAccount.name) {
      const cashAccount = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.CashAccount)).data.data[0]
      log('cashAccount: %O', cashAccount)
      defaultDestinationAccount = {
        id: cashAccount.id,
        name: cashAccount.attributes.name,
        type: cashAccount.attributes.type
      }
    }

    return defaultDestinationAccount
  } catch (err) {
    console.error('Error occurred getting Cash Account: ', err)
    throw err
  }
}

async function selectDestAccount(ctx: MyContext) {
  const log = rootLog.extend('selectDestAccount')
  try {
    const sourceId = parseInt(ctx.match![1], 10)
    log('sourceId: ', sourceId)

    if (isNaN(sourceId)) throw new Error('Source Account ID is bad!')

    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    const sourceAccountData = (await firefly(userId).Accounts.getAccount(sourceId)).data.data
    log('sourceAccountData: %O', sourceAccountData)

    const tr = ctx.session.newTransaction
    tr.sourceAccount = {
      id: sourceId.toString(),
      name: sourceAccountData.attributes.name,
      type: sourceAccountData.attributes.type
    }

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
      mapper.selectDestAccount,
      { skipAccountId: tr.sourceAccount!.id }
    )
    accountsKeyboard.text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('accountsKeyboard: %O', accountsKeyboard)

    return ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectDestAccount', { amount: tr.amount }), {
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
      type: TransactionSplitStoreTypeEnum.Transfer,
      date: dayjs((ctx.message?.date || Date.now())).toISOString(),
      description: 'N/A',
      sourceAccount: { id: '', name: '', type: '' },
      amount: amount.toString(),
      destAccount: { id: '', name: '', type: '' }
    }

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
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

async function createTransaction(ctx: MyContext) {
  const log = rootLog.extend('createTransaction')
  try {
    const destAccountId = parseInt(ctx.match![1], 10)
    log('destAccountId: ', destAccountId)
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    let transactionType: TransactionSplitStoreTypeEnum
    const sourceAccountType = ctx.session.newTransaction.sourceAccount!.type 
    const destAccountData = (await firefly(userId).Accounts.getAccount(destAccountId)).data.data
    log('destAccountData: %O', destAccountData)

    if (sourceAccountType === 'liabilities' || sourceAccountType === 'revenue') {
      transactionType = TransactionSplitStoreTypeEnum.Deposit
    } 
    else if (sourceAccountType === 'asset' || destAccountData.attributes.type === 'asset') {
      transactionType = TransactionSplitStoreTypeEnum.Transfer
    }
    else {
      transactionType = TransactionSplitStoreTypeEnum.Withdrawal
    }
    log('transactionType: %s', transactionType)

    const payload = {
      transactions: [{
        type: transactionType,
        date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
        description: 'N/A',
        source_id: ctx.session.newTransaction.sourceAccount!.id || '',
        amount: ctx.session.newTransaction.amount || '',
        destination_id: destAccountId.toString()
      }]
    }
    log('Transaction to create: %O', payload)

    const tr = (await firefly(userId).Transactions.storeTransaction(payload)).data.data

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

async function startCreatingDepositTransaction(ctx: MyContext) {
  const log = rootLog.extend('startCreatingDepositTransaction')
  try {
    const text: string = ctx.match![1] || ''
    const amount = parseAmountInput(text)
    log('amount: ', amount)
    log('ctx.session: %O', ctx.session)

    const userId = ctx.from!.id

    ctx.session.newTransaction = {
      type: TransactionSplitStoreTypeEnum.Deposit,
      date: dayjs().toISOString(),
      description: 'N/A',
      amount: amount!.toString(),
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
