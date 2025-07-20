import dayjs from 'dayjs'
import debug from 'debug'
import flatten from 'lodash.flatten'

import { Menu, MenuRange } from '@grammyjs/menu'

import type { MyContext } from '../../types/MyContext'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'
import { AccountRead } from '../../lib/firefly/model/account-read'
import { TransactionTypeProperty } from '../../lib/firefly/model/transaction-type-property'
import { createMenuDatePicker, MenuDatePicker } from '../../lib/menu-date-picker'
import { Route as AddRoute } from './add-transaction'
import { Route as EditRoute } from './edit-transaction'
import { MENUS, CATEGORIES_PAGE_LIMIT } from '../constants'
import firefly from '../../lib/firefly'

import {
  formatTransaction,
  createPaginationRange,
  createFireflyTransaction,
  cleanupSessionData,
  getFireflyAccounts,
} from '../helpers'

const rootLog = debug(`transactions:add:menus`)

type NextFunction = () => Promise<void>;
type MaybePromise<T> = T | Promise<T>;
type MenuMiddleware<MyContext> = (ctx: MyContext) => MaybePromise<unknown>;
type TransactionUpdate = {
  sourceAccountId?: string
  destinationAccountId?: string
  categoryId?: string
  description?: string
  amount?: string
  currencyId?: string
  date?: string
}


// This is the main Add New Transaction menu generation
export const addTransactionMenu = new Menu<MyContext>(MENUS.ADD_TRANSACTION)
  .dynamic(createCategoriesRange(newTransactionSelectCategoryHandler))
  .append(createNewDepositSubmenu()).row()
  .append(createNewTransferSubmenu()).row()
  .text('🔙', ctx => ctx.deleteMessage())

addTransactionMenu.register([
  createNewDepositMenu(),
  createNewTransferMenu()
])

// This is the menu for every transaction created
// NOTE: Make sure to set `ctx.session.currentTransaction = tr` everytime you
// call the transactionMenu
export const transactionRecordMenu = new Menu<MyContext>(MENUS.TRANSACTION_RECORD)
  .dynamic(createTransactionRecordMenu)

const editTransactionMenu = new Menu<MyContext>(MENUS.EDIT_TRANSACTION)
  .dynamic(createEditTransactionMenu)

transactionRecordMenu.register([
  editTransactionMenu,
  createEditCategoryMenu(),
  createEditAmountMenu(),
  createEditDescriptionMenu(),
  createEditDateMenu(),
  createEditSourceAccountMenu(),
  createEditDestinationAccountMenu(),
  // createDeleteTransactionmenu(),
  // createEditTagsMenu(),
])

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

      const accounts = await getAccounts(ctx, AccountTypeFilter.Revenue)

      const range = new MenuRange<MyContext>()

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i]
        const last = accounts.length - 1
        range.submenu(
          { text: acc.attributes.name, payload: acc.id },
          MENUS.NEW_DEPOSIT__SELECT_TARGET_ACC,
          async ctx => {
            // ctx.reply(`Source account ID is *${acc.attributes.name}*`, { parse_mode: 'Markdown' })

            ctx.session.newTransaction.sourceAccount = {
              id: acc.id,
              name: acc.attributes.name,
              type: acc.attributes.type,
              currencyId: acc.attributes.currency_id,
              currencySymbol: acc.attributes.currency_symbol
            }

            log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

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

            cleanupSessionData(ctx)

            ctx.session.newTransaction.id = tr.id

            return ctx.editMessageText(
              formatTransaction(ctx, tr),
              {
                parse_mode: 'Markdown',
                reply_markup: transactionRecordMenu
              }
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
          ctx => {
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

  const newTransferSelectTargetAccountMenu = new Menu<MyContext>(MENUS.NEW_TRANSFER__SELECT_TARGET_ACC)
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
        range.submenu(
          { text: acc.attributes.name, payload: acc.id },
          MENUS.NEW_TRANSFER__TYPE_FOREIGN_AMOUNT,
          async ctx => {
            const newTransaction = ctx.session.newTransaction
            newTransaction.destAccount = {
              id: acc.id,
              name: acc.attributes.name,
              type: acc.attributes.type,
              currencyId: acc.attributes.currency_id,
              currencySymbol: acc.attributes.currency_symbol
            }

            log('ctx.session.newTransaction: %O', ctx.session.newTransaction)

            // If we have different currencies between account, ask a user for a foreign amount
            if (newTransaction.sourceAccount?.currencyId != newTransaction.destAccount.currencyId) {
              log('Source and destination accounts currencies are different')

              ctx.session.step = AddRoute.SET_FOREIGN_AMOUNT

              const messageId = ctx.update?.callback_query?.message!.message_id || 0
              const chatId = ctx.update?.callback_query?.message!.chat.id || 0
              log('deleteMessage: messageId: %s', messageId)
              log('deleteMessage: chatId: %s', chatId)
              ctx.session.deleteBotsMessage = { chatId, messageId }

              return ctx.editMessageText(ctx.i18n.t('transactions.add.typeForeignAmount', {
                destCurrency: newTransaction.destAccount.currencySymbol,
                sourceCurrency: newTransaction.sourceAccount?.currencySymbol
              }), { parse_mode: 'Markdown' })
            }

            const tr = await createFireflyTransaction(ctx)

            cleanupSessionData(ctx)

            ctx.session.currentTransaction = tr
            log('Looks like transaction got created. Returning transaction menu...')

            return ctx.editMessageText(
              formatTransaction(ctx, tr),
              {
                parse_mode: 'Markdown',
                reply_markup: transactionRecordMenu
              }
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

  const newTransferTypeForeignAmountMenu = new Menu<MyContext>(MENUS.NEW_TRANSFER__TYPE_FOREIGN_AMOUNT)
    .text('🔙', ctx => {
      const log = rootLog.extend('typeForeignAmountBackButton')
      log('Setting step back to idle...')
      ctx.session.step = 'IDLE'
      log('Returning newTransferSelectTargetAccountMenu menu...')
      return ctx.editMessageText(
        ctx.i18n.t('transactions.add.selectDestAccount', { amount: ctx.session.newTransaction.amount }), {
        parse_mode: 'Markdown',
        reply_markup: newTransferSelectTargetAccountMenu
      })
    })

  newTransferMenu.register([
    newTransferSelectTargetAccountMenu,
    newTransferTypeForeignAmountMenu
  ])
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
      accountType.forEach(accType => promises.push(firefly(ctx.session.userSettings).Accounts.listAccount(undefined, 100, 1, now, accType)))
      const responses = await Promise.all(promises)

      log('Responses length: %s', responses.length)

      accounts = flatten(responses.map(r => {
        return r.data.data
      }))

    } else {
      accounts = (await firefly(ctx.session.userSettings).Accounts.listAccount(undefined, 100, 1, now, accountType)).data.data
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

function createCategoriesRange(onCategorySelectedHandler: MenuMiddleware<MyContext>) {
  return function() {
    const log = rootLog.extend('createCategoriesRange')
    log(' Creating categories range...')
    return new MenuRange<MyContext>().dynamic(async (ctx, range) => {
      const categories = ctx.session.categories
      const transactionId = ctx.match
      log('Transaction ID: %s', transactionId)

      // User might not have any categories yet
      // TODO: Implement the case when a user has no categories.
      //
      // HINT: ctx.editMessageText(ctx.i18n.t('transactions.add.noCategoriesYet'))

      for (let i = 0; i < categories.length; i++) {
        const c = categories[i]
        range.text(
          { text: c.attributes.name, payload: c.id },
          onCategorySelectedHandler
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
          async (ctx: MyContext) => {
            const userSettings = ctx.session.userSettings
            const resData = (await firefly(userSettings).Categories.listCategory(
              undefined,
              CATEGORIES_PAGE_LIMIT,
              ctx.session.pagination?.current_page! - 1
            )).data
            log('resData.meta: %O', resData.meta)
            ctx.session.pagination = resData.meta.pagination
            ctx.session.categories = resData.data
            await ctx.menu.update()
          },
          // Next page handler
          async (ctx: MyContext) => {
            const userSettings = ctx.session.userSettings
            const resData = (await firefly(userSettings).Categories.listCategory(
              undefined,
              CATEGORIES_PAGE_LIMIT,
              ctx.session.pagination?.current_page! + 1
            )).data
            log('resData.meta: %O', resData.meta)
            ctx.session.pagination = resData.meta.pagination
            ctx.session.categories = resData.data
            await ctx.menu.update()
          }
        )
      )

      return range.row()
    })
  }
}

function createTransactionRecordMenu() {
  return new MenuRange<MyContext>().dynamic((ctx, range) => {
    const log = rootLog.extend('createTransactionMenu')

    const currentTransaction: any = ctx.session.newTransaction.id
      ? ctx.session.newTransaction
      : ctx.session.currentTransaction

    log('currentTransaction: %O', currentTransaction)

    // FIXME: If transaction does not have a category, show button to specify one
    // This is currently not working as expected
    //
    // if (currentTransaction && (!currentTransaction.categoryId || !currentTransaction.attributes!.transactions[0].category_id )) {
    //   log('No category for the transaction. Adding category button to menu...')
    //   range.submenu(
    //     {
    //       text: ctx.i18n.t('labels.CHANGE_CATEGORY'),
    //       payload: currentTransaction!.id
    //     },
    //     MENUS.EDIT_TRANSACTION__EDIT_CATEGORY,
    //     augmentSessionWithCurrentTransaction,
    //     augmentSessionWithCategories,
    //   )
    // }

    log('Adding edit transaction button to menu...')
    range.submenu(
      {
        text: ctx => ctx.i18n.t('labels.EDIT_TRANSACTION'),
        payload: currentTransaction!.id
      },
      MENUS.EDIT_TRANSACTION,
      augmentSessionWithCurrentTransaction
    )

    ctx.session.newTransaction = {}
    return range
  })
}

function createEditTransactionMenu(ctx: MyContext) {
  const { fireflyUrl } = ctx.session.userSettings
  const transactionId = ctx.match
  if (typeof transactionId !== 'string') throw new Error('No transactionId supplied!')

  return new MenuRange<MyContext>()
    .append(createEditCategorySubmenu(transactionId))
    .append(createEditDateSubmenu(transactionId)).row()
    .row()
    .append(createEditSourceAccountSubmenu(transactionId))
    .append(createEditDestinationAccountSubmenu(transactionId))
    .row()
    .submenu(
      {
        text: ctx => ctx.i18n.t('labels.CHANGE_DESCRIPTION'),
        payload: transactionId
      }, MENUS.EDIT_TRANSACTION__EDIT_DESCRIPTION, changeTransactionDescriptionMiddleware)
    .submenu(
      {
        text: ctx => ctx.i18n.t('labels.CHANGE_AMOUNT'),
        payload: transactionId
      }, MENUS.EDIT_TRANSACTION__EDIT_AMOUNT, changeTransactionAmountMiddleware).row()
    .url(ctx.i18n.t('labels.OPEN_IN_BROWSER'), `${fireflyUrl}/transactions/show/${transactionId}`).row()
    .text({ text: ctx => ctx.i18n.t('labels.DELETE'), payload: transactionId }, deleteTransactionMiddleware)
    .text({ text: '🔙', payload: transactionId }, closeEditTransactionMenu).row()
}

function createEditCategoryMenu() {
  return new Menu<MyContext>(MENUS.EDIT_TRANSACTION__EDIT_CATEGORY)
    .dynamic(createCategoriesRange(editTransactionSelectCategoryHandler))
    .text({ text: '🔙' }, closeEditTransactionMenu).row()
}

function createEditAmountMenu() {
  return new Menu<MyContext>(MENUS.EDIT_TRANSACTION__EDIT_AMOUNT)
    .text({ text: '🔙' }, closeEditTransactionMenu).row()
}

function createEditDescriptionMenu() {
  return new Menu<MyContext>(MENUS.EDIT_TRANSACTION__EDIT_DESCRIPTION)
    .text({ text: '🔙' }, closeEditTransactionMenu).row()
}

function createEditDateMenu() {
  return new Menu<MyContext>(MENUS.EDIT_TRANSACTION__EDIT_DATE)
    .dynamic(async (ctx, range) => {
      // Get or create date picker state
      const state = ctx.session.datePickerState || MenuDatePicker.createDefaultState();
      
      // Create date picker
      const picker = createMenuDatePicker({
        language: ctx.i18n.languageCode
      });
      
      // Return the date picker range
      return picker.createDatePicker(
        state,
        async (selectedDate) => {
          // Handle date selection for transaction editing
          if (ctx.session.currentTransaction) {
            // Update the transaction date
            const updatedTr = await updateFireflyTransaction(ctx, {
              date: selectedDate
            });
            ctx.session.currentTransaction = updatedTr;
            
            // Clear picker state and return to transaction menu
            delete ctx.session.datePickerState;
            
            await ctx.editMessageText(
              formatTransaction(ctx, updatedTr),
              {
                parse_mode: 'Markdown',
                reply_markup: transactionRecordMenu
              }
            );
          }
        },
        ctx
      );
    })
    .text({ text: '🔙' }, closeEditTransactionMenu).row()
}

function createNewTransferSubmenu() {
  return new MenuRange<MyContext>().submenu(
    ctx => ctx.i18n.t('labels.TO_TRANSFERS'),
    MENUS.NEW_TRANSFER,
    ctx => ctx.editMessageText(
      ctx.i18n.t('transactions.add.selectSourceAccount', { amount: ctx.session.newTransaction.amount }),
      { parse_mode: 'Markdown' }
    )
  )
}

function createEditSourceAccountMenu() {
  return new Menu<MyContext>(MENUS.EDIT_TRANSACTION__EDIT_SOURCE)
    .dynamic(createAccountsRange(editTransactionSelectSourceAccountHandler))
    .text({ text: '🔙' }, closeEditTransactionMenu).row()
}

function createEditDestinationAccountMenu() {
  return new Menu<MyContext>(MENUS.EDIT_TRANSACTION__EDIT_DESTINATION)
    .dynamic(createAccountsRange(editTransactionSelectDestinationAccountHandler))
    .text({ text: '🔙' }, closeEditTransactionMenu).row()
}

function createEditSourceAccountSubmenu(transactionId: string) {
  return new MenuRange<MyContext>().submenu(
    {
      text: ctx => ctx.i18n.t('labels.CHANGE_SOURCE_ACCOUNT'),
      payload: transactionId
    },
    MENUS.EDIT_TRANSACTION__EDIT_SOURCE,
    async ctx => {
      const log = rootLog.extend('setNewSourceAccountMiddleware')
      log('Entered setNewSourceAccountMiddleware action handler')
      try {
        log('Transacrion ID: %s', transactionId)
        if (typeof transactionId !== 'string') throw new Error('No transactionId supplied!')

        log('Current transaction: %O', ctx.session.currentTransaction)

        ctx.session.accounts = await getFireflyAccounts(
          ctx,
          [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
          { skipAccountId: ctx.session.currentTransaction?.id! }
        )

        ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewSourceAccount'))
      } catch (err) {
        // TODO: Handle error properly
        console.error(err)
        throw err
      }
    }
  )
}

function createEditDestinationAccountSubmenu(transactionId: string) {
  return new MenuRange<MyContext>().submenu(
    {
      text: ctx => ctx.i18n.t('labels.CHANGE_DEST_ACCOUNT'),
      payload: transactionId
    },
    MENUS.EDIT_TRANSACTION__EDIT_DESTINATION,
    async ctx => {
      const log = rootLog.extend('setNewDestinationAccountMiddleware')
      log('Entered setNewDestinationAccountMiddleware action handler')
      try {
        log('Transacrion ID: %s', transactionId)
        if (typeof transactionId !== 'string') throw new Error('No transactionId supplied!')

        log('Current transaction: %O', ctx.session.currentTransaction)

        ctx.session.accounts = await getFireflyAccounts(
          ctx,
          [AccountTypeFilter.CashAccount, AccountTypeFilter.Liabilities, AccountTypeFilter.Expense]
        )

        ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewSourceAccount'))
      } catch (err) {
        // TODO: Handle error properly
        console.error(err)
        throw err
      }
    }
  )
}


async function closeEditTransactionMenu(ctx: MyContext) {
  const log = rootLog.extend('closeEditTransactionMenu')
  try {
    log(' Closing edit menu...')
    const userSettings = ctx.session.userSettings
    const trId = ctx.session.currentTransaction?.id
    log('trId: %O', trId)
    if (typeof trId !== 'string') throw new Error('No transactionId supplied!')

    log(' Getting transaction with ID: %s', trId)
    const tr = (await firefly(userSettings).Transactions.getTransaction(trId)).data.data
    log(' Got transaction data for transaction %s', tr.id)
    ctx.session.currentTransaction = tr

    cleanupSessionData(ctx)

    log(' Formatting transaction menu...')
    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured cancelling edit transaction: ', err)
    throw err
  }
}

async function deleteTransactionMiddleware(ctx: MyContext) {
  const log = rootLog.extend('deleteTransactionMiddleware')
  log('Entered deleteTransaction middleware')
  try {
    const trId = ctx.match
    if (typeof trId !== 'string') throw new Error('No transactionId supplied!')
    log('transaction id: %O', trId)

    await firefly(ctx.session.userSettings).Transactions.deleteTransaction(trId)

    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
    return ctx.reply(
      ctx.i18n.t('transactions.add.couldNotDelete', { id: ctx.match })
    )
  }
}

async function newTransactionSelectCategoryHandler(ctx: MyContext) {
  const log = rootLog.extend('newTransactionSelectCategoryHandler')
  try {
    const categoryId = ctx.match
    log('categoryId: %s', categoryId)
    if (typeof categoryId !== 'string') throw new Error('No categoryId supplied!')
    ctx.session.newTransaction.categoryId = categoryId
    ctx.session.newTransaction.type = TransactionTypeProperty.Withdrawal
    log('Setting new category id: %s', categoryId)

    const tr = await createFireflyTransaction(ctx)
    log('Got new transaction created: %O', tr.id)

    ctx.session.currentTransaction = tr

    cleanupSessionData(ctx)

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err) {
    console.error(err)
    log('Error occured handling category selection: %O', err)
    return ctx.reply((err as Error).toString())
  }
}

async function editTransactionSelectCategoryHandler(ctx: MyContext) {
  const log = rootLog.extend('editTransactionSelectCategoryHandler')
  try {
    const categoryId = ctx.match
    log('categoryId: %s', categoryId)
    if (typeof categoryId !== 'string') throw new Error('No categoryId supplied!')
    if (!ctx.session.currentTransaction) throw new Error('No transaction supplied!')

    const tr = ctx.session.currentTransaction
    log('Transaction ID: %s', tr?.id)
    log('New category ID: %s', categoryId)

    const update = { categoryId }

    const updatedTr = await updateFireflyTransaction(ctx, update)
    ctx.session.currentTransaction = updatedTr

    return ctx.editMessageText(
      formatTransaction(ctx, updatedTr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err) {
    console.error(err)
    log('Error occured handling category selection: %O', err)
    return ctx.reply((err as Error).toString())
  }
}

async function editTransactionSelectSourceAccountHandler(ctx: MyContext) {
  const log = rootLog.extend('editTransactionSelectSourceAccountHandler')
  try {
    const { userSettings } = ctx.session
    const sourceAccountId = ctx.match
    log('sourceAccountId: %s', sourceAccountId)
    if (typeof sourceAccountId !== 'string') throw new Error('No sourceAccountId supplied!')
    if (!ctx.session.currentTransaction) throw new Error('No transaction supplied!')

    const tr = ctx.session.currentTransaction
    log('Transaction ID: %s', tr?.id)
    log('New source account ID: %s', sourceAccountId)

    // When we change the source account of the transaction, we also want to change the
    // currency of the transaction to match the newly set source account. Otherwise
    // the transaction would have the original account's currency.
    const sourceAccountData = (await firefly(userSettings).Accounts.getAccount(sourceAccountId)).data.data
    log('sourceAccountData: %O', sourceAccountData)

    const update = { sourceAccountId, currencyId: sourceAccountData.attributes.currency_id }

    const updatedTr = await updateFireflyTransaction(ctx, update)

    return ctx.editMessageText(
      formatTransaction(ctx, updatedTr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err) {
    console.error(err)
    log('Error occured handling source account selection: %O', err)
    return ctx.reply((err as Error).toString())
  }
}

async function editTransactionSelectDestinationAccountHandler(ctx: MyContext) {
  const log = rootLog.extend('editTransactionSelectDestAccountHandler')
  try {
    const destinationAccountId = ctx.match
    log('destinationAccountId: %s', destinationAccountId)
    if (typeof destinationAccountId !== 'string') throw new Error('No destinationAccountId supplied!')
    if (!ctx.session.currentTransaction) throw new Error('No transaction supplied!')

    const tr = ctx.session.currentTransaction
    log('Transaction ID: %s', tr?.id)
    log('New dest account ID: %s', destinationAccountId)

    // TODO: Handle a case when destination account currency differs from the
    // source account currency. In this case we'd want to ask a user to type it
    // amount in destination account currency.

    const update = { destinationAccountId }

    const updatedTr = await updateFireflyTransaction(ctx, update)

    return ctx.editMessageText(
      formatTransaction(ctx, updatedTr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err) {
    console.error(err)
    log('Error occured handling source account selection: %O', err)
    return ctx.reply((err as Error).toString())
  }
}

async function updateFireflyTransaction(ctx: MyContext, update: TransactionUpdate) {
  const log = rootLog.extend('updateFireflyTransaction')
  try {
    const userSettings = ctx.session.userSettings

    const tr = ctx.session.currentTransaction
    if (!tr) throw new Error('No transaction in session!')

    log('Transaction ID: %s', tr?.id)
    log('Transaction update: %O', update)

    const payload = {
      transactions: [{
        source_id: update.sourceAccountId || tr.attributes?.transactions[0].source_id,
        destination_id: update.destinationAccountId || tr.attributes?.transactions[0].destination_id,
        category_id: update.categoryId || tr?.attributes?.transactions[0].category_id,
        currency_id: update.currencyId || tr?.attributes?.transactions[0].currency_id,
        date: update.date || tr?.attributes?.transactions[0].date,
      }]
    }
    log('Update payload: %O', payload)

    return (await firefly(userSettings).Transactions.updateTransaction(tr.id!, payload)).data.data
  } catch (err) {
    console.error(err)
    log('Error occured handling category selection: %O', err)
    throw err
  }
}

async function changeTransactionAmountMiddleware(ctx: MyContext) {
  const log = rootLog.extend('changeTransactionAmount')
  log('Entered changeTransactionAmount action handler')
  try {
    const trId = ctx.match
    log('Transaction ID: %s', trId)

    log('Setting route to %s...', EditRoute.CHANGE_AMOUNT)
    ctx.session.step = EditRoute.CHANGE_AMOUNT

    const messageId = ctx.update?.callback_query?.message!.message_id || 0
    const chatId = ctx.update?.callback_query?.message!.chat.id || 0
    log('deleteMessage: messageId: %s', messageId)
    log('deleteMessage: chatId: %s', chatId)
    ctx.session.deleteBotsMessage = { chatId, messageId }

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.typeNewAmount'))
  } catch (err) {
    console.error(err)
  }
}

async function changeTransactionDescriptionMiddleware(ctx: MyContext) {
  const log = rootLog.extend('changeTransactionDescription')
  log('Entered changeTransactionDescription action handler')
  try {
    const trId = ctx.match
    log('Transaction ID: %s', trId)

    log('Setting route to %s...', EditRoute.CHANGE_DESCRIPTION)
    ctx.session.step = EditRoute.CHANGE_DESCRIPTION

    const messageId = ctx.update?.callback_query?.message!.message_id || 0
    const chatId = ctx.update?.callback_query?.message!.chat.id || 0
    log('deleteMessage: messageId: %s', messageId)
    log('deleteMessage: chatId: %s', chatId)
    ctx.session.deleteBotsMessage = { chatId, messageId }

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.typeNewDescription'))
  } catch (err) {
    console.error(err)
  }
}

function createEditDateSubmenu(transactionId: string) {
  return new MenuRange<MyContext>().submenu(
    {
      text: ctx => ctx.i18n.t('labels.CHANGE_DATE'),
      payload: transactionId
    },
    MENUS.EDIT_TRANSACTION__EDIT_DATE,
    changeTransactionDateMiddleware
  )
}

async function changeTransactionDateMiddleware(ctx: MyContext) {
  const log = rootLog.extend('changeTransactionDate')
  log('Entered changeTransactionDate action handler')
  try {
    const trId = ctx.match
    log('Transaction ID: %s', trId)

    const messageId = ctx.update?.callback_query?.message!.message_id || 0
    const chatId = ctx.update?.callback_query?.message!.chat.id || 0
    log('deleteMessage: messageId: %s', messageId)
    log('deleteMessage: chatId: %s', chatId)
    ctx.session.deleteBotsMessage = { chatId, messageId }

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.typeNewDate'))
  } catch (err) {
    console.error(err)
    return ctx.reply('Error setting up date change: ' + (err as Error).message)
  }
}

function createEditCategorySubmenu(transactionId: string) {
  return new MenuRange<MyContext>().submenu(
    {
      text: ctx => ctx.i18n.t('labels.CHANGE_CATEGORY'),
      payload: transactionId
    },
    MENUS.EDIT_TRANSACTION__EDIT_CATEGORY,
    augmentSessionWithCategories
  )
}

async function augmentSessionWithCategories(ctx: MyContext) {
  const log = rootLog.extend('augmentSessionWithCategories')
  log('Augmenting session with categories property...')
  try {
    const trId = ctx.match
    log('Transacrion ID: %s', trId)
    const userSettings = ctx.session.userSettings
    if (typeof trId !== 'string') throw new Error('No transactionId supplied!')

    const page = 1
    const catResData = (await firefly(userSettings).Categories.listCategory(undefined, CATEGORIES_PAGE_LIMIT, page)).data
    log('Got categories data: %O', catResData)
    ctx.session.categories = catResData.data
    ctx.session.pagination = catResData.meta.pagination

    // TODO: Handle a case when a user got no categories yet
    ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewCategory'))
  } catch (err) {
    // TODO: Handle error properly
    console.error(err)
  }
}

async function augmentSessionWithCurrentTransaction(ctx: MyContext, next: NextFunction) {
  const log = rootLog.extend('augmentSessionWithCurrentTransaction')
  log('Augmenting session with currentTransaction property...')
  try {
    const userSettings = ctx.session.userSettings
    const trId = ctx.match
    if (typeof trId !== 'string') throw new Error('No transactionId supplied!')
    log('Transaction ID: %s', trId)
    const resData = (await firefly(userSettings).Transactions.getTransaction(trId)).data
    log('Got transaction data: %O', resData)
    ctx.session.currentTransaction = resData.data
    await next()
  } catch (err) {
    console.error(err)
    log('Error occured handling menu click: %O', err)
    ctx.reply((err as Error).toString())
  }
}

function createAccountsRange(onAccountSelectedHandler: MenuMiddleware<MyContext>) {
  return function() {
    const log = rootLog.extend('createAccountsRange')
    log(' Creating accounts range...')
    return new MenuRange<MyContext>().dynamic(async (ctx, range) => {
      const accounts = ctx.session.accounts
      const transactionId = ctx.match
      log('Transaction ID: %s', transactionId)

      for (let i = 0; i < accounts.length; i++) {
        const c = accounts[i]
        range.text(
          { text: c.attributes.name, payload: c.id },
          onAccountSelectedHandler
        )
        const last = accounts.length - 1
        // Split categories keyboard into two columns so that every odd indexed
        // category starts from new row as well as the last category in the list.
        if (i % 2 !== 0 || i === last) range.row()
      }

      return range.row()
    })
  }
}
