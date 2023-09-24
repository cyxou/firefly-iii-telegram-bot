import dayjs from 'dayjs'
import debug from 'debug'
import flatten from 'lodash.flatten'

import { Menu, MenuRange } from '@grammyjs/menu'
import type { MyContext } from '../../types/MyContext'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'
import { AccountRead } from '../../lib/firefly/model/account-read'
import { TransactionTypeProperty } from '../../lib/firefly/model/transaction-type-property'

import {
  formatTransaction,
  formatTransactionKeyboard,
} from '../helpers'

import firefly from '../../lib/firefly'

const rootLog = debug(`transactions:add:menus`)

const MENUS = {
  NEW_TRANSACTION: 'new-transaction',
  NEW_DEPOSIT: 'new-deposit',
  NEW_DEPOSIT__SELECT_TARGET_ACC: 'new-deposit--target-acc',
  NEW_TRANSFER: 'new-transfer',
  NEW_TRANSFER__SELECT_TARGET_ACC: 'new-deposit-target-acc',
  // SELECT_SOURCE_ACCOUNT: 'select-source-account',
  // SELECT_DEST_ACCOUNT: 'select-dest-account'
}


// This is the main Add New Transaction menu generation
export const addTransactionMenu = new Menu<MyContext>(MENUS.NEW_TRANSACTION)
  // .append(createCategoriesRange())
  .append(createNewDepositSubmenu())
  // .append(createNewTransferSubmenu())
  .text('🔙', ctx => ctx.deleteMessage())

addTransactionMenu.register([
  createNewDepositMenu(),
  // createNewTransferMenu()
])


////////////////////////////////////////////////////////////////////////////////////

function createNewDepositSubmenu() {
  return new MenuRange<MyContext>().submenu(
    ctx => ctx.i18n.t('labels.TO_DEPOSITS'),
    MENUS.NEW_DEPOSIT,
    ctx => ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectRevenueAccount', { amount: ctx.session.newTransaction.amount }),
      { parse_mode: 'Markdown' }
    )
  ).row()
}

function createNewDepositMenu() {
  const menuLogger = rootLog.extend('createNewDepositMenu:🔢')

  const newDepositMenu = new Menu<MyContext>(MENUS.NEW_DEPOSIT)
    .dynamic(async ctx => {
      const log = menuLogger.extend('1')
      log(' Starting creation of deposit transaction')
      log(' Preparing accounts menu to select one as a source of deposit transaction...')

      ctx.session.newTransaction.type = TransactionTypeProperty.Deposit

      const accounts = await getAccounts(ctx, AccountTypeFilter.Revenue)

      const range = new MenuRange<MyContext>()

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i]
        const last = accounts.length - 1
        range.submenu(
          { text: acc.attributes.name, payload: acc.id },
          MENUS.NEW_DEPOSIT__SELECT_TARGET_ACC,
          async ctx => {
            log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

            // ctx.reply(`Source account ID is *${acc.attributes.name}*`, { parse_mode: 'Markdown' })

            ctx.session.newTransaction.sourceAccount = {
              id: acc.id,
              name: acc.attributes.name,
              type: acc.attributes.type
            }

            return ctx.editMessageText(
              ctx.i18n.t('transactions.add.selectDestAccount', { amount: ctx.session.newTransaction.amount }), {
              parse_mode: 'Markdown',
            })
          }
        )
        // Split categories keyboard into two columns so that every odd indexed
        // category starts from new row as well as the last category in the list.
        if (i % 2 !== 0 || i === last) range.row()
      }

      return range
    })
    .back('🔙')

  const newDepositSelectTargetAccountMenu = new Menu<MyContext>(MENUS.NEW_DEPOSIT__SELECT_TARGET_ACC)
    .dynamic(async ctx => {
      const log = menuLogger.extend('1:2')
      log(' Continue creating of deposit transaction')
      log(' Having obtained source account, lets select the destination one...')

      const accounts = await getAccounts(ctx, [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities])

      const range = new MenuRange<MyContext>()

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i]
        const last = accounts.length - 1
        range.text(
          { text: acc.attributes.name, payload: acc.id },
          async ctx => {
            ctx.session.newTransaction.destAccount = {
              id: acc.id,
              name: acc.attributes.name,
              type: acc.attributes.type
            }

            log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

            // ctx.reply(`Destination account ID is *${acc.attributes.name}*`, { parse_mode: 'Markdown' })

            const tr = await createDepositTransaction(ctx)

            return ctx.editMessageText(
              formatTransaction(ctx, tr),
              formatTransactionKeyboard(ctx, tr)
            )
          }
        )
        // Split categories keyboard into two columns so that every odd indexed
        // category starts from new row as well as the last category in the list.
        if (i % 2 !== 0 || i === last) range.row()
      }

      return range
    })
    .back('🔙')

  newDepositMenu.register(newDepositSelectTargetAccountMenu)
  return newDepositMenu
}

/*
function createNewTransferSubmenu() {
  return new MenuRange<MyContext>().submenu(
    ctx => ctx.i18n.t('labels.TO_TRANSFERS'),
    MENUS.NEW_TRANSFER,
    ctx => ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectSourceAccount', { amount: ctx.session.newTransaction.amount }),
      { parse_mode: 'Markdown' }
    )
  ).row()
}
function createNewTransferMenu() {
  return new Menu<MyContext>(MENUS.NEW_TRANSFER).dynamic(async ctx => {
    const log = rootLog.extend('createSelectDestAccountMenu:dynamic')
    return createAccountsRange(
      ctx,
      [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
      async (ctx: MyContext) => {
        await ctx.reply(`You selected ${ctx.match}!`)
      }
    )
  })
    .back('🔙')
}
*/

async function getAccounts(
  ctx: MyContext,
  accountType: AccountTypeFilter | AccountTypeFilter[],
  opts?: { skipAccountId: string }
) {
  const log = rootLog.extend('getAccounts')
  try {
    let accounts: AccountRead[] = []
    const now = dayjs().format('YYYY-MM-DD')

    if (Array.isArray(accountType)) {
      const promises: any = []
      accountType.forEach(accType => promises.push(firefly(ctx.session.userSettings).Accounts.listAccount(1, now, accType)))
      const responses = await Promise.all(promises)

      log('Responses length: %s', responses.length)

      accounts = flatten(responses.map(r => {
        return r.data.data
      }))

    } else {
      accounts = (await firefly(ctx.session.userSettings).Accounts.listAccount(1, now, accountType)).data.data
    }

    log('accounts: %O', accounts)

    // Prevent from choosing same account when doing transfers
    if (opts) accounts = accounts.filter(acc => opts.skipAccountId !== acc.id.toString())

    accounts = accounts.reverse() // we want top accounts be closer to the bottom of the screen

    return accounts

  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred creating acounts keyboard: ', err)
    throw err
  }
}

async function createDepositTransaction(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransaction')
  log(' Preparing payload to send to Firefly API...')

  try {
    log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

    let transactionType: TransactionTypeProperty
    const sourceAccountType = ctx.session.newTransaction.sourceAccount!.type
    const destAccountType = ctx.session.newTransaction.destAccount!.type

    if (sourceAccountType === 'liabilities' || sourceAccountType === 'revenue') {
      transactionType = TransactionTypeProperty.Deposit
    }
    else if (sourceAccountType === 'asset' || destAccountType === 'asset') {
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
        destination_id: ctx.session.newTransaction.destAccount!.id
      }]
    }
    log('Transaction payload to send: %O', payload)

    return (await firefly(ctx.session.userSettings).Transactions.storeTransaction(payload)).data.data


  } catch (err: any) {
    log('Error: %O', err)
    console.error('Error occured creating deposit transaction: ', err)
    ctx.reply(err.message)
    throw err
  }
}
