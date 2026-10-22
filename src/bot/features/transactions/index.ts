import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { handleAddText } from './add.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'

export const transactionsFeature = new Composer<Context>()

transactionsFeature.use(openAssetAccountsMenu)
// Task 5–7 register the picker/list menus and the foreign-amount router ABOVE
// this handler.
transactionsFeature.on('message:text', handleAddText)
