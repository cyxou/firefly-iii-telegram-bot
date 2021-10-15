import { ITransaction, ICategory } from '../lib/firefly'
// import { Route } from '../index'
import { Route as SettingsRoute } from '../composers/settings'
import { Route as ClassificationRoute } from '../composers/categories'

export interface SessionData {
  step: 'IDLE' | ClassificationRoute | SettingsRoute
  transaction: ITransaction
  category: any
  newCategories: string[]
}
