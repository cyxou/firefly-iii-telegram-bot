import dayjs from 'dayjs'
import debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'
import flatten from 'lodash.flatten'

import type { MyContext } from '../../types/MyContext'
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
import { TransactionTypeProperty } from '../../lib/firefly/model/transaction-type-property'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'
import { AccountAttributes } from '../../types/SessionData'

const rootLog = debug(`bot:transactions:add`)

const bot = new Composer<MyContext>()

// Add Withdrawal and common handlers
bot.callbackQuery(mapper.selectCategory.regex(), newTransactionCategoryCbQH)
bot.callbackQuery(mapper.confirmWithoutCategory.regex(), newTransactionCategoryCbQH)
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
  const log = rootLog.extend('addTransaction')
  log('Entered text handler')
  try {
    const text = ctx.message!.text as string
    const { fireflyUrl } = ctx.session.userSettings
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

    const defaultSourceAccount = await getDefaultSourceAccount(ctx)
    log('defaultSourceAccount: %O', defaultSourceAccount)

    if (!defaultSourceAccount) {
      const kb = new InlineKeyboard()
        .url(ctx.i18n.t('labels.OPEN_ASSET_ACCOUNTS_IN_BROWSER'), `${fireflyUrl}/accounts/asset`).row()

      return ctx.reply(ctx.i18n.t('common.noDefaultSourceAccountExist'), {
        reply_markup: kb
      })
    }

    const defaultDestinationAccount = await getDefaultDestinationAccount(ctx)
    log('defaultDestinationAccount: %O', defaultDestinationAccount)

    // If description is not null, than we'll add transaction in a fast mode
    // without asking a user any additional info
    const description = match.groups!.description
    log('description: ', description)

    if (description) {
      log('Creating quick transaction...')
      const tr = await createQuickTransaction({
        ctx,
        // Telegram message date is a Unix timestamp (10 digits, seconds since the Unix Epoch)
        date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
        amount,
        description,
        sourceAccountId: defaultSourceAccount.id.toString(),
        destinationAccountId: defaultDestinationAccount ? defaultDestinationAccount.id.toString() : ''
      })

      return ctx.reply(
        formatTransaction(ctx, tr),
        formatTransactionKeyboard(ctx, tr)
      )
    }

    ctx.session.newTransaction = {
      type: TransactionTypeProperty.Withdrawal,
      date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
      description: 'N/A',
      sourceAccount: defaultSourceAccount,
      amount: amount.toString(),
      categoryId: null,
      destAccount: null,
    }

    const keyboard = await createCategoriesKeyboard(
      ctx,
      mapper.selectCategory
    )
    log('Got a partial categories keyboard: %O', keyboard.inline_keyboard)

    // If inline_keyboard array does not contain anything, than user has no categories yet
    if (!flatten(keyboard.inline_keyboard).length) {
      keyboard.text(ctx.i18n.t('labels.DONE'), mapper.confirmWithoutCategory.template())

      return ctx.reply(ctx.i18n.t('transactions.add.noCategoriesYet'), {
        parse_mode: 'Markdown',
        reply_markup:  keyboard
      })
    }

    keyboard
      .text(ctx.i18n.t('labels.TO_DEPOSITS'), mapper.addDeposit.template({ amount })).row()
      .text(ctx.i18n.t('labels.TO_TRANSFERS'), mapper.addTransfer.template({ amount })).row()
      .text(ctx.i18n.t('labels.CANCEL'), mapper.cancelAdd.template())
    log('Full keyboard: %O', keyboard.inline_keyboard)

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
    const categoryId = ctx.match![1]
    log('categoryId: %s', categoryId)
    const defaultSourceAccount = await getDefaultSourceAccount(ctx)
    log('defaultSourceAccount: %O', defaultSourceAccount)
    const defaultDestinationAccount = await getDefaultDestinationAccount(ctx)
    log('defaultDestinationAccount: %O', defaultDestinationAccount)

    const payload = {
      transactions: [{
        type: TransactionTypeProperty.Withdrawal,
        date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
        description: 'N/A',
        source_id: defaultSourceAccount!.id.toString(),
        amount: ctx.session.newTransaction.amount || '',
        category_id: categoryId || '',
        destination_id: defaultDestinationAccount ? defaultDestinationAccount.id.toString() : null
      }]
    }

    log('Transaction payload: %O', payload)

    const tr = (await firefly(ctx.session.userSettings).Transactions.storeTransaction(payload)).data.data
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
    const trId = ctx.match![1]

    if (trId) await firefly(ctx.session.userSettings).Transactions.deleteTransaction(trId)
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
  ctx: MyContext
  amount: number
  description: string
  sourceAccountId: string
  destinationAccountId: string
  date: string | undefined
}

async function createQuickTransaction({ ctx, amount, description, sourceAccountId, destinationAccountId, date }: ICreateFastTransactionPayload): Promise<TransactionRead> {
  const log = rootLog.extend('createFastTransaction')
  try {
    const transactionStore = {
      transactions: [{
        type: TransactionTypeProperty.Withdrawal,
        date: dayjs(date || Date.now()).toISOString(),
        amount: amount.toString(),
        description,
        source_id: sourceAccountId,
        destination_id: destinationAccountId,
      }]
    }
    const res = (await firefly(ctx.session.userSettings).Transactions.storeTransaction(transactionStore)).data.data

    log('Created transaction: %O', res)
    log('Created transaction splits: %O', res.attributes.transactions)

    return res
  } catch (err) {
    console.error('Error occurred creating express transaction: ', err)
    return Promise.reject(err)
  }
}

async function getDefaultSourceAccount(ctx: MyContext): Promise<null | AccountAttributes> {
  const log = rootLog.extend('getDefaultSourceAccount')
  try {
    let { defaultSourceAccount } = ctx.session.userSettings

    if (!defaultSourceAccount.name) {
      const firstAccount = (await firefly(ctx.session.userSettings).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data[0]
      log('firstAccount: %O', firstAccount)

      // Looks like that a user has not created any Asset accounts yet
      if (!firstAccount) return null

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

async function getDefaultDestinationAccount(ctx: MyContext) {
  const log = rootLog.extend('getDefaultDestinationAccount')
  try {
    let { defaultDestinationAccount } = ctx.session.userSettings

    if (!defaultDestinationAccount.name) {
      const cashAccount = (await firefly(ctx.session.userSettings).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.CashAccount)).data.data[0]
      log('cashAccount: %O', cashAccount)

      // For new user accounts there is no default CashAccount created.
      // It is created by Firefly automatically upon creation of first
      // transaction through UI
      if (!cashAccount) {
        log('No cash account found. Returning null...')
        return null
      }

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
    const sourceId = ctx.match![1]
    log('sourceId: ', sourceId)

    if (!sourceId) throw new Error('Source Account ID is bad!')

    log('ctx.session: %O', ctx.session)

    const sourceAccountData = (await firefly(ctx.session.userSettings).Accounts.getAccount(sourceId)).data.data
    log('sourceAccountData: %O', sourceAccountData)

    const tr = ctx.session.newTransaction
    tr.sourceAccount = {
      id: sourceId,
      name: sourceAccountData.attributes.name,
      type: sourceAccountData.attributes.type
    }

    const accountsKeyboard = await createAccountsKeyboard(
      ctx,
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

    ctx.session.newTransaction = {
      type: TransactionTypeProperty.Transfer,
      date: dayjs((ctx.message?.date || Date.now())).toISOString(),
      description: 'N/A',
      sourceAccount: { id: '', name: '', type: '' },
      amount: amount.toString(),
      destAccount: { id: '', name: '', type: '' }
    }

    const accountsKeyboard = await createAccountsKeyboard(
      ctx,
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
    const destAccountId = ctx.match![1]
    log('destAccountId: ', destAccountId)
    log('ctx.session: %O', ctx.session)

    let transactionType: TransactionTypeProperty
    const sourceAccountType = ctx.session.newTransaction.sourceAccount!.type 
    const destAccountData = (await firefly(ctx.session.userSettings).Accounts.getAccount(destAccountId)).data.data
    log('destAccountData: %O', destAccountData)

    if (sourceAccountType === 'liabilities' || sourceAccountType === 'revenue') {
      transactionType = TransactionTypeProperty.Deposit
    } 
    else if (sourceAccountType === 'asset' || destAccountData.attributes.type === 'asset') {
      transactionType = TransactionTypeProperty.Transfer
    }
    else {
      transactionType = TransactionTypeProperty.Withdrawal
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

    const tr = (await firefly(ctx.session.userSettings).Transactions.storeTransaction(payload)).data.data

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

    ctx.session.newTransaction = {
      type: TransactionTypeProperty.Deposit,
      date: dayjs().toISOString(),
      description: 'N/A',
      amount: amount!.toString(),
    }

    const accountsKeyboard = await createAccountsKeyboard(
      ctx,
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
