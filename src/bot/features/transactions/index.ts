import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { handleAddText } from './add.js'
import { addTransactionMenu } from './add.menu.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'

export const transactionsFeature = new Composer<Context>()

transactionsFeature.use(addTransactionMenu)
transactionsFeature.use(openAssetAccountsMenu)
transactionsFeature.on('message:text', handleAddText)
