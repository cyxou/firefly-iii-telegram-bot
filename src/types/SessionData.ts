import { ITransaction } from '../lib/firefly/transactions'
import { ICategory } from '../lib/firefly/categories'
// import { Route } from '../index'
import { Route as SettingsRoute } from '../composers/settings'
import { Route as ClassificationRoute } from '../composers/categories'

export interface SessionData {
  step: 'IDLE' | ClassificationRoute | SettingsRoute
  transaction: ITransaction
  category: any
  newCategories: string[]
}
