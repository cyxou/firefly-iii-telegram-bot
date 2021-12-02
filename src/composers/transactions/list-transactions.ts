import dayjs from 'dayjs'
import Debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'
import { table, getBorderCharacters } from 'table'

import type { MyContext } from '../../types/MyContext'
import i18n from '../../lib/i18n'
import {
  listTransactionsMapper as mapper
} from '../helpers'

import firefly from '../../lib/firefly'
import { TransactionRead } from '../../lib/firefly/model/transaction-read'
import { TransactionSplitTypeEnum } from '../../lib/firefly/model/transaction-split'
import { TransactionTypeFilter } from '../../lib/firefly/model/transaction-type-filter'

const debug = Debug(`bot:transactions:list`)

const bot = new Composer<MyContext>()

// List transactions
bot.hears(i18n.t('en', 'labels.TRANSACTIONS'), showTransactions)
bot.hears(i18n.t('ru', 'labels.TRANSACTIONS'), showTransactions)
bot.callbackQuery(mapper.list.regex(), showTransactions)
bot.callbackQuery(mapper.close.regex(), closeHandler)

export default bot

async function showTransactions(ctx: MyContext) {
  const log = debug.extend('showTransactions')
  log(`Entered showTransactions callback handler...`)
  try {
    // await ctx.answerCallbackQuery()
    const userId = ctx.from!.id
    const isRegularMessage = !!ctx.update.message
    log('isRegularMessage: %O', isRegularMessage)
    log('ctx.match: %O', ctx.match)

    const page = 1
    let trType: TransactionTypeFilter
    let start: string = dayjs().format('YYYY-MM-DD')
    let end: string = dayjs().format('YYYY-MM-DD')

    // Check if it is a callback query handler massage or a regular one
    if (isRegularMessage) {
      trType = TransactionTypeFilter.Withdrawal
      start = dayjs().format('YYYY-MM-DD')
      end = dayjs().format('YYYY-MM-DD')
    } else {
      await ctx.answerCallbackQuery()
      trType = ctx.match![1] as TransactionTypeFilter
      start = ctx.match![2]
      end = start
    }
    log('trType: %O', trType)
    log('start: %O', start)
    log('end: %O', end)

    const transactions = (await firefly(userId).Transactions.listTransaction(
      page,
      start,
      end,
      trType
    )).data.data
    log('transactions: %O', transactions)

    const keyboard = createTransactionsNavigationKeyboard(ctx, start, trType)
    const text = formatTransactionMessage(ctx, start, trType, transactions)

    if (isRegularMessage) {
      return ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    } else {
      return ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    }
  } catch (err) {
    console.error(err)
  }
}

async function closeHandler(ctx: MyContext) {
  const log = debug.extend('closeHandler')
  log('ctx.session: %O', ctx.session)
  await ctx.answerCallbackQuery()
  ctx.session.deleteKeyboardMenuMessage &&
    await ctx.session.deleteKeyboardMenuMessage()
  return ctx.deleteMessage()
}

function formatTransactions(ctx: MyContext, transactions: TransactionRead[]) {
  const log = debug.extend('formatTransactions')
  if (transactions.length === 0) return ctx.i18n.t('transactions.list.noTransactions')
  const transferIcon = '↔️'
  const depositIcon = '📥'
  const withdrawalIcon = '📤'

  const data = [
    ...transactions.map(item => {
      const tr = item.attributes.transactions[0]
      if (!tr) return []

      let typeIcon
      log('tr.type: %O', tr.type)
      switch (tr.type) {
        case TransactionSplitTypeEnum.Withdrawal:
          typeIcon = withdrawalIcon
          break
        case TransactionSplitTypeEnum.Deposit:
          typeIcon = depositIcon
          break
        case TransactionSplitTypeEnum.Transfer:
          typeIcon = transferIcon
          break
        default:
          typeIcon = '❔'
      }
      log('typeIcon: %O', typeIcon)

      const date = dayjs(tr.date).format('LT')
      const amount = parseFloat(tr.amount).toFixed(2)
      const currency = tr.currency_symbol
      const desc = tr.description
      return [ typeIcon, `${date}:`, desc, `${amount} ${currency}` ]
    })
  ].reverse()

  const config = {
    border: getBorderCharacters('void'),
    columnDefault: {
        paddingLeft: 0,
        paddingRight: 1
    },
    drawHorizontalLine: () => false
  }

  log(table(data, config))
  return table(data, config)
}

function createTransactionsNavigationKeyboard(
  ctx: MyContext, curDay: string, trType: TransactionTypeFilter
): InlineKeyboard {
  const log = debug.extend('createTransactionsNavigationKeyboard')
  const prevDay = dayjs(curDay).subtract(1, 'day')
  const prevDayName = prevDay.format('ll')
  log('prevDayName: %O', prevDayName)
  const nextDay = dayjs(curDay).add(1, 'day')
  const nextDayName = nextDay.format('ll')
  log('nextDayName: %O', nextDayName)

  const keyboard = new InlineKeyboard()
    .text(
      `<< ${prevDayName}`,
      mapper.list.template({ type: trType, start: prevDay.format('YYYY-MM-DD') })
    )
    .text(
      `${nextDayName} >>`,
      mapper.list.template({ type: trType, start: nextDay.format('YYYY-MM-DD') })
    ).row()

  // Dynamically add only relevant transactin type buttons
  switch (trType) {
    case TransactionTypeFilter.Withdrawal:
      keyboard
        .text(ctx.i18n.t('labels.TO_DEPOSITS'),
          mapper.list.template({ type: TransactionTypeFilter.Deposit, start: curDay })).row()
        .text(ctx.i18n.t('labels.TO_TRANSFERS'),
          mapper.list.template({ type: TransactionTypeFilter.Transfer, start: curDay })).row()
      break
    case TransactionTypeFilter.Deposit:
      keyboard
        .text(ctx.i18n.t('labels.TO_WITHDRAWALS'),
          mapper.list.template({ type: TransactionTypeFilter.Withdrawal, start: curDay })).row()
        .text(ctx.i18n.t('labels.TO_TRANSFERS'),
          mapper.list.template({ type: TransactionTypeFilter.Withdrawal, start: curDay })).row()
      break
    case TransactionTypeFilter.Transfer:
      keyboard
        .text(ctx.i18n.t('labels.TO_DEPOSITS'),
          mapper.list.template({ type: TransactionTypeFilter.Deposit, start: curDay })).row()
        .text(ctx.i18n.t('labels.TO_WITHDRAWALS'),
          mapper.list.template({ type: TransactionTypeFilter.Withdrawal, start: curDay })).row()
      break
  }
  keyboard.text(ctx.i18n.t('labels.DONE'), mapper.close.template())

  return keyboard
}

// Assumed that transactions is a list of only one particular transaction type
function formatTransactionMessage(
  ctx: MyContext, day: string, trType: TransactionTypeFilter, transactions: TransactionRead[]
) {
  const log = debug.extend('formatTransactionMessage')
  const sumsObject = transactions.reduce((res, t) => {
    const trSplit = t.attributes.transactions[0]
    const currency = trSplit.currency_symbol || '💲'
    log('currency: %O', currency)
    if (!res[currency]) res[currency] = +parseFloat(trSplit.amount)
    else res[currency] += parseFloat(trSplit.amount)
    log('res[currency]: %O', res[currency])
    return res
  }, {} as { [key: string]: number })
  log('sumsObject: %O', sumsObject)

  const sums = Object.entries(sumsObject).map(entry => {
    const [currency, sum] = entry
    return `${Math.abs(sum)} ${currency}`
  }).join('\n       ').replace(/\n$/, '')

  return ctx.i18n.t(`transactions.list.${trType}`, {
    day: dayjs(day).format('LL'),
    transactions: formatTransactions(ctx, transactions),
    sums: sums
  })
}
