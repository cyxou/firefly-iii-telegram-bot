// import { ITransaction } from '../lib/firefly/transactions'
// import { ICategory } from '../lib/firefly/categories'
// import { Route } from '../index'
import { Route as SettingsRoute } from '../composers/settings'
import { Route as CategoriesRoute } from '../composers/categories'
import { Route as EditTransactionRoute } from '../composers/transactions/edit-transaction'
import { TransactionStore } from '../lib/firefly/model/transaction-store'
import { TransactionRead } from '../lib/firefly/model/transaction-read'

export interface SessionData {
  step: 'IDLE' | CategoriesRoute | SettingsRoute | EditTransactionRoute
  // transaction: Partial<TransactionStore> & Partial<TransactionRead>
  newTransaction: TransactionStore
  editTransaction: Partial<TransactionRead>
  category: any // TODO set proper type
  newCategories: string[]
  deleteBotsMessage?: () => Promise<boolean>,
  deleteKeyboardMenuMessage?: () => Promise<boolean>
}
