import config from '../config'

import { Route as SettingsRoute } from '../composers/settings'
import { Route as CategoriesRoute } from '../composers/categories'
import { Route as AddTransactionRoute } from '../composers/transactions/add-transaction'
import { Route as EditTransactionRoute } from '../composers/transactions/edit-transaction'
import { TransactionRead } from '../lib/firefly/model/transaction-read'
import { TransactionTypeProperty } from '../lib/firefly/model/transaction-type-property'
import { CategoryRead } from '../lib/firefly/model/category-read'
import { MetaPagination } from '../lib/firefly/model/meta-pagination'
import { AccountRead } from '../lib/firefly/model/account-read'
import { DatePickerState } from '../lib/menu-date-picker'

type Step = 'IDLE' | CategoriesRoute | SettingsRoute | AddTransactionRoute | EditTransactionRoute

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
    id?: string
    type?: TransactionTypeProperty
    date?: string
    description?: string
    sourceAccount?: AccountAttributes
    amount?: string
    foreignAmount?: string
    categoryId?: string | null
    destAccount?: AccountAttributes | null
  }
  categories: CategoryRead[]
  accounts: AccountRead[]
  pagination: MetaPagination | undefined
  // editTransaction: Partial<TransactionRead>
  currentTransaction: Partial<TransactionRead> | null
  editTransactions: Partial<TransactionRead>[]
  category: any // TODO set proper type
  newCategories: string[]
  // deleteBotsMessage?: () => Promise<boolean>,
  deleteBotsMessage?: { chatId?: number, messageId?: number }
  deleteKeyboardMenuMessage?: () => Promise<boolean>
  datePickerState?: DatePickerState
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
    // editTransaction: {},
    currentTransaction: null,
    editTransactions: [],
    category: {},
    newCategories: [],
    categories: [],
    accounts: [],
    pagination: {
      total: 0,
      count: 0,
      per_page: 0,
      total_pages: 0,
      current_page: 0
    }
  }
}
