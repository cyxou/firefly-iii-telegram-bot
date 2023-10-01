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

type MaybePromise<T> = T | Promise<T>;
type MenuMiddleware<MyContext> = (ctx: MyContext) => MaybePromise<unknown>;

const MENUS = {
  NEW_TRANSACTION: 'new-transaction',
  NEW_TRANSACTION__SELECT_CATEGORY: 'new-transaction--select-category',
  NEW_DEPOSIT: 'new-deposit',
  NEW_DEPOSIT__SELECT_TARGET_ACC: 'new-deposit--target-acc',
  NEW_TRANSFER: 'new-transfer',
  NEW_TRANSFER__SELECT_TARGET_ACC: 'new-deposit--target-acc',
}

// This is the main Add New Transaction menu generation
export const addTransactionMenu = new Menu<MyContext>(MENUS.NEW_TRANSACTION)
  .dynamic(createCategoriesRange)
  .append(createNewDepositSubmenu())
  .append(createNewTransferSubmenu())
  .text('🔙', ctx => ctx.deleteMessage())

addTransactionMenu.register([
  createSelectCategoryMenu(),
  createNewDepositMenu(),
  createNewTransferMenu()
])

export const call = new Menu<MyContext>("call").dynamic((_, range) => {
  range.submenu({ text: "go", payload: "1" }, "callsub", (ctx1) => ctx1.editMessageText("ran"));
});

const callsub = new Menu<MyContext>("callsub")
  .dynamic(ctx => {
    console.log(`Payload in callsub:: ${ctx.match!.toString()}`);
    return new MenuRange<MyContext>()
      .text({
        text: ctx.match!.toString(),
        payload: `${ctx.match!.toString()}_1`
      }, (ctx1) => ctx1.editMessageText("ran."));
  });

call.register(callsub)


////////////////////////////////////////////////////////////////////////////////////

// TODO: Refactor the functions bellow in order to generalize them, because for
// deposit and for transfer transactions the flow looks pretty much the same.

// TODO: Implement additional step when source currency differs from the
// destination currency. In this case we want to ask a user to provide a
// foreign amount value.

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

      // ctx.session.newTransaction.type = TransactionTypeProperty.Deposit

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
              type: acc.attributes.type,
              currencyId: acc.attributes.currency_id,
              currencySymbol: acc.attributes.currency_symbol
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
      log(' Continue creating a deposit transaction')
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

            const tr = await createFireflyTransaction(ctx)

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
  const menuLogger = rootLog.extend('createNewTransferMenu:🔢')

  const newTransferMenu = new Menu<MyContext>(MENUS.NEW_TRANSFER)
    .dynamic(async ctx => {
      const log = menuLogger.extend('1')
      log(' Starting creation of transfer transaction')
      log(' Preparing accounts menu to select one as a source of transfer transaction...')

      // ctx.session.newTransaction.type = TransactionTypeProperty.Transfer

      const accounts = await getAccounts(
        ctx,
        [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
      )

      const range = new MenuRange<MyContext>()

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i]
        const last = accounts.length - 1
        range.submenu(
          { text: acc.attributes.name, payload: acc.id },
          MENUS.NEW_TRANSFER__SELECT_TARGET_ACC,
          async ctx => {
            log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

            ctx.reply(`Source account ID is *${acc.attributes.name}*`, { parse_mode: 'Markdown' })

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

  const newTransferSelectTargetAccountMenu = new Menu<MyContext>(MENUS.NEW_DEPOSIT__SELECT_TARGET_ACC)
    .dynamic(async ctx => {
      const log = menuLogger.extend('1:2')
      log(' Continue creating a transfer transaction')
      log(' Having obtained source account, lets select the destination one...')

      const accounts = await getAccounts(
        ctx,
        [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
        { skipAccountId: ctx.session.newTransaction.sourceAccount?.id! }
      )
      log('Got accounts: %O', accounts)

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

            const tr = await createFireflyTransaction(ctx)

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

  newTransferMenu.register(newTransferSelectTargetAccountMenu)
  return newTransferMenu
}

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

async function createFireflyTransaction(ctx: MyContext) {
  const log = rootLog.extend('createDepositTransaction')
  log(' Preparing payload to send to Firefly API...')

  try {
    log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

    let transactionType = ctx.session.newTransaction.type!
    const sourceAccountType = ctx.session.newTransaction.sourceAccount!.type
    const destAccountType = ctx.session.newTransaction.destAccount?.type

    if (!ctx.session.newTransaction.type) {
      // Firefly has some weird rules of setting transaction type based on
      // the account types used in transaction. Try to mimick them here:
      if (sourceAccountType === 'asset' && destAccountType === 'liabilities') {
        transactionType = TransactionTypeProperty.Withdrawal
      }
      else if (sourceAccountType === 'liabilities' || sourceAccountType === 'revenue') {
        transactionType = TransactionTypeProperty.Deposit
      }
      else if (sourceAccountType === 'asset' || destAccountType === 'asset') {
        transactionType = TransactionTypeProperty.Transfer
      }
      else {
        transactionType = TransactionTypeProperty.Withdrawal
      }
    }
    log('transactionType: %s', transactionType)

    const payload = {
      transactions: [{
        type: transactionType,
        date: (ctx.message?.date ? dayjs.unix(ctx.message.date) : dayjs()).toISOString(),
        description: 'N/A',
        source_id: ctx.session.newTransaction.sourceAccount!.id || '',
        amount: ctx.session.newTransaction.amount || '',
        category_id: ctx.session.newTransaction.categoryId || '',
        destination_id: ctx.session.newTransaction.destAccount?.id
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

function createCategoriesRange() {
  const log = rootLog.extend('createCategoriesRange')
  log(' Creating categories range...')
  return new MenuRange<MyContext>().dynamic(async (ctx, range) => {
    const log = rootLog.extend('1')
    const categories = ctx.session.categories

    // User might not have any categories yet
    // TODO: Implement the case when a user has no categories.
    //
    // HINT: ctx.editMessageText(ctx.i18n.t('transactions.add.noCategoriesYet'))

    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]
      range.text(
        { text: c.attributes.name },
        async ctx => {

          ctx.session.newTransaction.categoryId = c.id
          ctx.session.newTransaction.type = TransactionTypeProperty.Withdrawal
          log('Setting new category id: %s', c.id)

          // ctx.reply(`Selected category is *${c.attributes.name}*`, { parse_mode: 'Markdown' })

          const tr = await createFireflyTransaction(ctx)

          return ctx.editMessageText(
            formatTransaction(ctx, tr),
            formatTransactionKeyboard(ctx, tr)
          )
        }
      )
      const last = categories.length - 1
      // Split categories keyboard into two columns so that every odd indexed
      // category starts from new row as well as the last category in the list.
      if (i % 2 !== 0 || i === last) range.row()
    }

    range.append(
      createPaginationRange(
        ctx,
        // Previous page handler
        async ctx => {
          const userSettings = ctx.session.userSettings
          const resData = (await firefly(userSettings).Categories.listCategory(ctx.session.pagination?.current_page! - 1)).data
          log('resData.meta: %O', resData.meta)
          ctx.session.pagination = resData.meta.pagination
          ctx.session.categories = resData.data
        },
        // Next page handler
        async ctx => {
          const userSettings = ctx.session.userSettings
          const resData = (await firefly(userSettings).Categories.listCategory(ctx.session.pagination?.current_page! + 1)).data
          log('resData.meta: %O', resData.meta)
          ctx.session.pagination = resData.meta.pagination
          ctx.session.categories = resData.data
        }
      )
    )

    return range.row()
  })
}

function createSelectCategoryMenu() {
  const log = rootLog.extend('createSelectCategoryMenu:🔢')
  log(' Creating categories menu...')
  const selectCategoryMenu = new Menu<MyContext>(MENUS.NEW_TRANSACTION__SELECT_CATEGORY)
    .dynamic(async (ctx, range) => {
      const log = rootLog.extend('1')
      const categories = ctx.session.categories

      // User might not have any categories yet
      // TODO: Implement the case when a user has no categories.
      //
      // HINT: ctx.editMessageText(ctx.i18n.t('transactions.add.noCategoriesYet'))

      for (let i = 0; i < categories.length; i++) {
        const c = categories[i]
        range.text(
          { text: c.attributes.name },
          async ctx => {

            ctx.session.newTransaction.categoryId = c.id
            ctx.session.newTransaction.type = TransactionTypeProperty.Withdrawal
            log('Setting new category id: %s', c.id)

            const tr = await createFireflyTransaction(ctx)

            return ctx.editMessageText(
              formatTransaction(ctx, tr),
              formatTransactionKeyboard(ctx, tr)
            )
          }
        )
        const last = categories.length - 1
        // Split categories keyboard into two columns so that every odd indexed
        // category starts from new row as well as the last category in the list.
        if (i % 2 !== 0 || i === last) range.row()
      }

      range.append(
        createPaginationRange(
          ctx,
          // Previous page handler
          async ctx => {
            const userSettings = ctx.session.userSettings
            const resData = (await firefly(userSettings).Categories.listCategory(ctx.session.pagination?.current_page! - 1)).data
            log('resData.meta: %O', resData.meta)
            ctx.session.pagination = resData.meta.pagination
            ctx.session.categories = resData.data
          },
          // Next page handler
          async ctx => {
            const userSettings = ctx.session.userSettings
            const resData = (await firefly(userSettings).Categories.listCategory(ctx.session.pagination?.current_page! + 1)).data
            log('resData.meta: %O', resData.meta)
            ctx.session.pagination = resData.meta.pagination
            ctx.session.categories = resData.data
          }
        )
      )

      return range
    })

  return selectCategoryMenu
}

function createPaginationRange(
  ctx: MyContext,
  prevPageHandler: MenuMiddleware<MyContext>,
  nextPageHandler: MenuMiddleware<MyContext>
): MenuRange<MyContext> {
  const log = rootLog.extend('createPaginationRange')
  const range = new MenuRange<MyContext>()

  const pagination = ctx.session.pagination

  if (!pagination) return range

  if (pagination.total_pages! > 0) {
    const prevPage = pagination.current_page! - 1
    const nextPage = pagination.current_page! + 1
    const hasNext = nextPage <= pagination.total_pages!
    const hasPrev = prevPage > 0

    log('prevPage: %s', prevPage)
    log('hasPrev: %s', hasPrev)
    log('nextPage: %s', nextPage)
    log('hasNext: %s', hasNext)

    if (hasPrev) {
      range.submenu(
        { text: '⏪', payload: prevPage.toString() },
        MENUS.NEW_TRANSACTION__SELECT_CATEGORY,
        prevPageHandler
      )
    }

    if (hasNext) {
      range.submenu(
        { text: '⏩', payload: nextPage.toString() },
        MENUS.NEW_TRANSACTION__SELECT_CATEGORY,
        nextPageHandler
      )
    }

    range.row()
  }
  return range
}
