import dayjs from 'dayjs'
import Debug from 'debug'
import { evaluate } from 'mathjs'
import { ParseMode } from '@grammyjs/types'
import { InlineKeyboard } from 'grammy'

import firefly from '../../lib/firefly'
import type { MyContext } from '../../types/MyContext'
import { TransactionRead } from '../../lib/firefly/model/transaction-read'
import { TransactionSplitTypeEnum } from '../../lib/firefly/model/transaction-split'
import { TransactionSplit } from '../../lib/firefly/model/transaction-split'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'

const debug = Debug('bot:transactions:helpers')

export {
  editMapper,
  parseAmountInput,
  formatTransaction,
  formatTransactionUpdate,
  formatTransactionKeyboard,
  createCategoriesKeyboard,
  createAccountsKeyboard,
  createExpenseAccountsKeyboard,
  // createEditWithdrawalTransactionKeyboard,
  // createEditDepositTransactionKeyboard,
  // createEditTransferTransactionKeyboard
  createEditMenuKeyboard
}

class Mapper {
  cbDataTemplate: string
  constructor(template: string, ) {
    this.cbDataTemplate = template
  }
  regex() {
    // Replace all occurencies of ${whatever} in template with supplied parameter
    // TODO Think about how to solve this in case of multiple different ids
    // needed to be supplied, i.e.
    // SET_TRANSACTION|ID=${trId}&CATEGORY_ID=${categoryId}
    const s = this.cbDataTemplate.replace(/\$\{.+\}/, '(.+)').trim()
    return new RegExp(`^${s}$`)
  }
  cbData(trId: string) {
    const s = this.cbDataTemplate.replace(/\$\{.+\}/, trId)
    // console.log('cbData: ', s)
    return s
  }
}

const editMapper = {
  editMenu: new Mapper('EDIT_TRANSACTION_ID=${trId}'),
  done: new Mapper('DONE_EDIT_TRANSACTION_ID=${trId}'),
  editDate: new Mapper('CHANGE_TRANSACTION_DATE_ID=${trId}'),
  editAmount: new Mapper('CHANGE_TRANSACTION_AMOUNT_ID=${trId}'),
  editDesc: new Mapper('CHANGE_TRANSACTION_DESCRIPTION_ID=(.+)'),
  editCategory: new Mapper('CHANGE_TRANSACTION_CATEGORY_ID=${trId}'),
  setCategory: new Mapper('SET_TRANSACTION_CATEGORY_ID=${categoryId}'),
  editAssetAccount: new Mapper('CHANGE_TRANSACTION_SOURCE_ID=${trId}'),
  setAssetAccount: new Mapper('SET_TRANSACTION_ASSET_ID=${accountId}'),
  editDepositAssetAccount: new Mapper('CHANGE_DEPOSIT_TRANSACTION_SOURCE_ID=${trId}'),
  setDepositAssetAccount: new Mapper('SET_DEPOSIT_TRANSACTION_ASSET_ID=${accountId}'),
  editExpenseAccount: new Mapper('CHANGE_TRANSACTION_EXPENSE_ID=${trId}'),
  setExpenseAccount: new Mapper('SET_TRANSACTION_EXPENSE_ID=${accountId}'),
  editRevenueAccount: new Mapper('CHANGE_TRANSACTION_REVENUE_ID=${trId}'),
  setRevenueAccount: new Mapper('SET_TRANSACTION_REVENUE_ID=${accountId}'),
  editSourceAccount: new Mapper('CHANGE_SOURCE_ASSET_ACCOUNT_ID=${trId}'),
  setSourceAccount: new Mapper('SET_SOURCE_ASSET_ACCOUNT_ID=${accountId}'),
  editDestinationAccount: new Mapper('CHANGE_DESTINATION_ASSET_ACCOUNT_ID=${trId}'),
  setDestinationAccount: new Mapper('SET_DESTINATION_ASSET_ACCOUNT_ID=${accountId}'),
}

function parseAmountInput(amount: string): number | null {
  const validInput = /^\d{1,}(?:[.,]\d+)?([-+/*^]\d{1,}(?:[.,]\d+)?)*$/
  if (validInput.exec(amount)) return Math.abs(evaluate(amount))
  else return null
}

function formatTransactionKeyboard(ctx: MyContext, tr: TransactionRead) {
  const trSplit = tr.attributes.transactions[0]
  const inlineKeyboard = new InlineKeyboard()
    .text(ctx.i18n.t('labels.EDIT_TRANSACTION'), editMapper.editMenu.cbData(trSplit.transaction_journal_id as string))
    .text(ctx.i18n.t('labels.DELETE'), `DELETE_TRANSACTION_ID=${trSplit.transaction_journal_id}`)

  return {
    parse_mode: 'Markdown' as ParseMode,
    reply_markup: inlineKeyboard
  }
}

function formatTransaction(ctx: MyContext, tr: Partial<TransactionRead>){
  const trSplit = tr.attributes!.transactions[0]
  const baseProps = {
    amount: parseFloat(trSplit.amount),
    source: trSplit.source_name,
    destination: trSplit.destination_name,
    description: trSplit.description,
    category: trSplit.category_name,
    currency: trSplit.currency_symbol,
    date: dayjs(trSplit.date).format('DD MMM YYYY г.')
  }

  let translationString: string
  switch (trSplit.type) {
    case TransactionSplitTypeEnum.Withdrawal:
      translationString = 'transactions.add.withdrawalMessage'
      break
    case TransactionSplitTypeEnum.Deposit:
      translationString = 'transactions.add.depositMessage'
      break
    case TransactionSplitTypeEnum.Transfer:
      translationString = 'transactions.add.transferMessage'
      break
    default:
      translationString = '👻 Unexpected transaction type'
  }
  return ctx.i18n.t(translationString, { ...baseProps })
}

async function createCategoriesKeyboard(userId: number, cbDataTemplate: string) {
  const log = debug.extend('createCategoriesKeyboard')
  try {
    const categories = (await firefly(userId).Categories.listCategory()).data.data
    log('categories: %O', categories)
    const keyboard = new InlineKeyboard()

    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]
      const last = categories.length - 1
      const cbData = cbDataTemplate.replace('${categoryId}', c.id)

      keyboard.text(c.attributes.name, cbData)
      // Split categories keyboard into two columns so that every odd indexed
      // category starts from new row as well as the last category in the list.
      if (i % 2 !== 0 || i === last) keyboard.row()
    }

    return keyboard
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred creating categories keyboard: ', err)
    throw err
  }
}

async function createAccountsKeyboard(
  userId: number,
  accountType: AccountTypeFilter,
  cbDataTemplate: string
) {
  const log = debug.extend('createAccountKeyboard')
  try {
    const accounts = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), accountType)).data.data
    // log('accounts: %O', accounts)
    const keyboard = new InlineKeyboard()

    for (let i = 0; i < accounts.length; i++) {
      const c = accounts[i]
      const last = accounts.length - 1
      const cbData = cbDataTemplate.replace('${accountId}', c.id)

      keyboard.text(c.attributes.name, cbData)
      // Split accounts keyboard into two columns so that every odd indexed
      // account starts from new row as well as the last account in the list.
      if (i % 2 !== 0 || i === last) keyboard.row()
    }

    return keyboard
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred creating acounts keyboard: ', err)
    throw err
  }
}

async function createExpenseAccountsKeyboard(userId: number) {
  const log = debug.extend('createAssetsAccountKeyboard')
  try {
    const accounts = (await firefly(userId).Accounts.listAccount(
        1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Expense)).data.data
    // log('accounts: %O', accounts)
    const keyboard = new InlineKeyboard()

    for (let i = 0; i < accounts.length; i++) {
      const c = accounts[i]
      const last = accounts.length - 1
      const cbData = `SET_TRANSACTION_EXPENSE_ID=${c.id}`

      keyboard.text(c.attributes.name, cbData)
      // Split accounts keyboard into two columns so that every odd indexed
      // account starts from new row as well as the last account in the list.
      if (i % 2 !== 0 || i === last) keyboard.row()
    }

    return keyboard
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occurred creating acounts keyboard: ', err)
    throw err
  }
}

function formatTransactionUpdate(
  ctx: MyContext,
  trRead: Partial<TransactionRead>,
  trSplit: Partial<TransactionSplit>
): string {
  const log = debug.extend('formatTransactionUpdate')
  try {
    log('trRead: %O', trRead)
    log('trSplit: %O', trSplit)
    const oldTransaction = trRead.attributes!.transactions[0]

    const oldAmount = parseFloat(oldTransaction.amount).toString()
    const newAmount = trSplit.amount!.toString()
    const oldCategory = oldTransaction.category_name
    const newCategory = trSplit.category_name
    const oldDescr = oldTransaction.description
    const newDescr = trSplit.description
    const oldDest = oldTransaction.destination_name
    const newDest = trSplit.destination_name
    const oldDate = oldTransaction.date
    const newDate = trSplit.date
    let diffPart = '<b>Ваши изменения</b>:'

    if (newCategory && newCategory !== oldCategory)
    diffPart = `<s>${oldCategory}</s> ${newCategory}`

    if (newAmount && newAmount !== oldAmount)
    diffPart = `${diffPart}\nСумма: <s>${oldAmount}</s> <b>${newAmount}</b>`

    if (newDescr && newDescr !== oldDescr)
    diffPart = `${diffPart}\n<s>${oldDescr}</s> <b>${newDescr}</b>`

    if (newDest && newDest !== oldDest)
    diffPart = `${diffPart}\n<s>${oldDest}</s> <b>${newDest}</b>`

    if (newDate && newDate !== oldDate)
    diffPart = `${diffPart}\n<s>${oldDate}</s> <b>${newDate}</b>`

    return `${formatTransaction(ctx, trRead)}\n${diffPart}`

  } catch (err) {
    console.error(err)
    return err.message
  }
}

function createEditWithdrawalTransactionKeyboard(ctx: MyContext, trId: string | number) {
  const id = trId.toString()
  return new InlineKeyboard()
    .text(ctx.i18n.t('labels.CHANGE_DESCRIPTION'), editMapper.editDesc.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_CATEGORY'), editMapper.editCategory.cbData(id)).row()
    .text(ctx.i18n.t('labels.CHANGE_ASSET_ACCOUNT'), editMapper.editAssetAccount.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_EXPENSE_ACCOUNT'), editMapper.editExpenseAccount.cbData(id)).row()
    .text(ctx.i18n.t('labels.CHANGE_DATE'), editMapper.editDate.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_AMOUNT'), editMapper.editAmount.cbData(id)).row()
    .text(ctx.i18n.t('labels.DONE'), editMapper.done.cbData(id)).row()
}

function createEditDepositTransactionKeyboard(ctx: MyContext, trId: string | number) {
  const id = trId.toString()
  return new InlineKeyboard()
    .text(ctx.i18n.t('labels.CHANGE_DESCRIPTION'), editMapper.editDesc.cbData(id)).row()
    .text(ctx.i18n.t('labels.CHANGE_REVENUE_ACCOUNT'), editMapper.editRevenueAccount.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_ASSET_ACCOUNT'), editMapper.editDepositAssetAccount.cbData(id)).row()
    .text(ctx.i18n.t('labels.CHANGE_DATE'), editMapper.editDate.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_AMOUNT'), editMapper.editAmount.cbData(id)).row()
    .text(ctx.i18n.t('labels.DONE'), editMapper.done.cbData(id)).row()
}

function createEditTransferTransactionKeyboard(ctx: MyContext, trId: string | number) {
  const id = trId.toString()
  return new InlineKeyboard()
    .text(ctx.i18n.t('labels.CHANGE_DESCRIPTION'), editMapper.editDesc.cbData(id)).row()
    .text(ctx.i18n.t('labels.CHANGE_ASSET_ACCOUNT'), editMapper.editSourceAccount.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_ASSET_ACCOUNT'), editMapper.editDestinationAccount.cbData(id)).row()
    .text(ctx.i18n.t('labels.CHANGE_DATE'), editMapper.editDate.cbData(id))
    .text(ctx.i18n.t('labels.CHANGE_AMOUNT'), editMapper.editAmount.cbData(id)).row()
    .text(ctx.i18n.t('labels.DONE'), editMapper.done.cbData(id)).row()
}

function createEditMenuKeyboard(ctx: MyContext, tr: TransactionRead) {
  switch (tr.attributes.transactions[0].type) {
    case 'withdrawal':
      return createEditWithdrawalTransactionKeyboard(ctx, tr.id)
    case 'deposit':
      return createEditDepositTransactionKeyboard(ctx, tr.id)
    case 'transfer':
      return createEditTransferTransactionKeyboard(ctx, tr.id)
    default:
      return new InlineKeyboard().text('👻 Unexpected transaction type')
  }
}
