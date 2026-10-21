export const command = {
  START:    'start',
  SETTINGS: 'settings',
  HELP:     'help',
}

export const MENUS = {
  TRANSACTION_RECORD: 'transaction-record',
  ADD_TRANSACTION: 'add-transaction',
  NEW_DEPOSIT: 'new-deposit',
  NEW_DEPOSIT__SELECT_TARGET_ACC: 'new-deposit--target-acc',
  NEW_TRANSFER: 'new-transfer',
  NEW_TRANSFER__SELECT_TARGET_ACC: 'new-transfer--target-acc',
  NEW_TRANSFER__TYPE_FOREIGN_AMOUNT: 'new-transfer--foreign-amount',
  EDIT_TRANSACTION: 'edit-transaction',
  EDIT_TRANSACTION__EDIT_CATEGORY: 'edit-transaction--select-category',
  EDIT_TRANSACTION__EDIT_SOURCE: 'edit-transaction--edit-source-account',
  EDIT_TRANSACTION__EDIT_DESTINATION: 'edit-transaction--edit-destination-account',
  EDIT_TRANSACTION__EDIT_AMOUNT: 'edit-transaction--edit-amount',
  EDIT_TRANSACTION__EDIT_DESCRIPTION: 'edit-transaction--edit-description',
  EDIT_TRANSACTION__EDIT_DATE: 'edit-transaction--edit-date',
}

export const CATEGORIES_PAGE_LIMIT = 20
export const ACCOUNTS_PAGE_LIMIT = 100 // no pagination thus far
export const TRANSACTIONS_PAGE_LIMIT = 100 // no pagination thus far
