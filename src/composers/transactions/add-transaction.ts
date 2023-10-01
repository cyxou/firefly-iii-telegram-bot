import dayjs from 'dayjs'
import debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'

import type { MyContext } from '../../types/MyContext'
import {
  addTransactionsMapper as mapper,
  parseAmountInput,
  formatTransaction,
  formatTransactionKeyboard,
} from '../helpers'

import { addTransactionMenu } from './add-transactions-menus'

import firefly from '../../lib/firefly'
import { TransactionRead } from '../../lib/firefly/model/transaction-read'
import { TransactionTypeProperty } from '../../lib/firefly/model/transaction-type-property'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'
import { AccountAttributes } from '../../types/SessionData'

const rootLog = debug(`bot:transactions:add`)

const bot = new Composer<MyContext>()

bot.use(addTransactionMenu)

// Add Withdrawal and common handlers
bot.callbackQuery(mapper.delete.regex(), deleteTransactionActionHandler)

export default bot

export async function addTransaction(ctx: MyContext) {
  const log = rootLog.extend('addTransaction')
  log('Entered text handler')
  try {
    const text = ctx.message!.text as string
    const { userSettings } = ctx.session
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
      const kb = new InlineKeyboard().url(
        ctx.i18n.t('labels.OPEN_ASSET_ACCOUNTS_IN_BROWSER'),
        `${userSettings.fireflyUrl}/accounts/asset`
      ).row()

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
      type: undefined, // will be assigned based on the type of operation
      date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
      description: 'N/A',
      sourceAccount: defaultSourceAccount,
      amount: amount.toString(),
      categoryId: null,
      destAccount: null,
    }

    const page = 1
    const resData = (await firefly(userSettings).Categories.listCategory(page)).data
    log('resData.meta: %O', resData.meta)

    ctx.session.categories = resData.data
    ctx.session.pagination = resData.meta.pagination

    return ctx.reply(ctx.i18n.t('transactions.add.selectCategory', { amount: amount }), {
      parse_mode: 'Markdown',
      reply_markup: addTransactionMenu
    })
  } catch (err: any) {
    log('Error: %O', err)
    console.error('Error occurred handling text message: ', err)
    return ctx.reply(err.message)
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
