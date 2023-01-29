// import { ITransaction } from '../lib/firefly/transactions'
// import { ICategory } from '../lib/firefly/categories'
// import { Route } from '../index'
import { Route as SettingsRoute } from '../composers/settings'
import { Route as CategoriesRoute } from '../composers/categories'
import { Route as EditTransactionRoute } from '../composers/transactions/edit-transaction'
import { TransactionRead } from '../lib/firefly/model/transaction-read'
import { TransactionTypeProperty } from '../lib/firefly/model/transaction-type-property'

export interface SessionData {
  step: 'IDLE' | CategoriesRoute | SettingsRoute | EditTransactionRoute
  // transaction: Partial<TransactionStore> & Partial<TransactionRead>
  newTransaction: {
    type?: TransactionTypeProperty
    date?: string
    description?: string
    sourceAccount?: AccountAttributes
    amount?: string
    categoryId?: string | null
    destAccount?: AccountAttributes | null
  }
  editTransaction: Partial<TransactionRead>
  category: any // TODO set proper type
  newCategories: string[]
  deleteBotsMessage?: () => Promise<boolean>,
  deleteKeyboardMenuMessage?: () => Promise<boolean>
}

export interface AccountAttributes {
  name: string
  type: string
  id: string
}

