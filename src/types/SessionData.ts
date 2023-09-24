import config from '../config'

import { Route as SettingsRoute } from '../composers/settings'
import { Route as CategoriesRoute } from '../composers/categories'
import { Route as EditTransactionRoute } from '../composers/transactions/edit-transaction'
import { TransactionRead } from '../lib/firefly/model/transaction-read'
import { TransactionTypeProperty } from '../lib/firefly/model/transaction-type-property'

type Step = 'IDLE' | CategoriesRoute | SettingsRoute | EditTransactionRoute

export interface SessionData {
  step: Step
  userSettings: {
    fireflyUrl: string
    fireflyApiUrl: string
    fireflyAccessToken: string
    defaultSourceAccount: { id: string, type: string, name: string }
    defaultDestinationAccount: { id: string, type: string, name: string }
    language: string
  },
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
  currencyId?: string
  currencySymbol?: string
}

export function createInitialSessionData() {
  return  {
    userSettings: {
      fireflyUrl: config.fireflyUrl || '',
      fireflyApiUrl: config.fireflyApiUrl || '',
      fireflyAccessToken: '',
      defaultSourceAccount: { id: '', type: '', name: '' },
      defaultDestinationAccount: { id: '', type: '', name: '' },
      language: 'en'
    },
    step: 'IDLE' as Step,
    newTransaction: {},
    editTransaction: {},
    category: {},
    newCategories: [],
  }
}
