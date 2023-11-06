import dayjs from 'dayjs'
import Debug from 'debug'
import { Composer } from 'grammy'
import { table, getBorderCharacters } from 'table'
import type { Alignment } from 'table'

import type { MyContext } from '../types/MyContext'
import i18n, { locales } from '../lib/i18n'
import {
  listAccountsMapper as mapper,
  createAccountsMenuKeyboard
} from './helpers'

import firefly from '../lib/firefly'
import { handleCallbackQueryError } from '../lib/errorHandler'
import { AccountTypeFilter } from '../lib/firefly/model/account-type-filter'
import { AccountRead } from '../lib/firefly/model/account-read'
import { ACCOUNTS_PAGE_LIMIT } from './constants'

const debug = Debug(`bot:accounts`)

const bot = new Composer<MyContext>()

// List transactions
for (const locale of locales) {
  bot.hears(i18n.t(locale, 'labels.ACCOUNTS'), showAccounts)
}
bot.callbackQuery(mapper.list.regex(), showAccounts)
bot.callbackQuery(mapper.close.regex(), closeHandler)

export default bot

async function showAccounts(ctx: MyContext) {
  const log = debug.extend('showAccounts')
  log(`Entered showAccounts callback handler...`)
  try {
    log('ctx: %O', ctx)
    const userSettings = ctx.session.userSettings
    const isRegularMessage = !!ctx.update.message
    log('isRegularMessage: %O', isRegularMessage)
    log('ctx.match: %O', ctx.match)

    const page = 1
    let accType: AccountTypeFilter
    const balanceToDate = dayjs().format('YYYY-MM-DD')

    // Check if it is a callback query handler massage or a regular one
    if (isRegularMessage) {
      accType = AccountTypeFilter.Asset // by default use Asset account type
    } else {
      await ctx.answerCallbackQuery()
      accType = ctx.match![1] as AccountTypeFilter
    }
    log('accType: %O', accType)

    const accounts = (await firefly(userSettings).Accounts.listAccount(
      undefined, ACCOUNTS_PAGE_LIMIT, page, balanceToDate, accType as AccountTypeFilter)).data.data
    log('accounts: %O', accounts)

    const keyboard = createAccountsMenuKeyboard(ctx, accType as AccountTypeFilter)
    const text = formatAccountsMessage(ctx, accType as AccountTypeFilter, accounts)

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
  } catch (err: any) {
    return handleCallbackQueryError(err, ctx)
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

// Assumed that accounts is a list of only one particular account type
function formatAccountsMessage(
  ctx: MyContext, accType: AccountTypeFilter, accounts: AccountRead[]
) {
  const log = debug.extend('formatAccountsMessage')
  const sumsObject = accounts.reduce((res, acc) => {
    const currency = acc.attributes.currency_symbol || '💲'
    log('currency: %O', currency)
    if (!res[currency]) {
      res[currency] = +parseFloat(acc.attributes.current_balance || '')
    } else {
      res[currency] += parseFloat(acc.attributes.current_balance || '')
    }
    res[currency] = Math.ceil(res[currency])
    log('res[currency]: %O', res[currency])
    return res
  }, {} as { [key: string]: number })
  log('sumsObject: %O', sumsObject)

  const sums = Object.entries(sumsObject).map(entry => {
    const [currency, sum] = entry
    return `${sum} ${currency}`
  }).join('\n       ').replace(/\n$/, '')

  return ctx.i18n.t(`accounts.list.${accType}`, {
    sums,
    accounts: formatAccounts(ctx, accounts),
  })
}

function formatAccounts(ctx: MyContext, accounts: AccountRead[]) {
  const log = debug.extend('formatAccounts')
  if (accounts.length === 0) return ctx.i18n.t('accounts.list.noAccounts')

  const data = [
    ...accounts.map(acc => {
      const balance = parseFloat(acc.attributes.current_balance || '')
        .toFixed(acc.attributes.currency_decimal_places)
      const currency = acc.attributes.currency_symbol
      const name = acc.attributes.name
      return [ name, balance, currency ]
    })
  ]

  const config = {
    border: getBorderCharacters('void'),
    columnDefault: {
        paddingLeft: 0,
        paddingRight: 0
    },
    drawHorizontalLine: () => false,
    columns: [
      { alignment: 'left' as Alignment },
      { alignment: 'right' as Alignment },
      { paddingLeft: 1, alignment: 'left' as Alignment }
    ]
  }

  log(table(data, config))
  return table(data, config)
}
