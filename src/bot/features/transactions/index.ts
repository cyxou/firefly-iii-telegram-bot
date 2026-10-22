import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { handleAddText } from './add.js'
import { addTransactionMenu } from './add.menu.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'
import { transactionsRouter } from './router.js'

export const transactionsFeature = new Composer<Context>()

transactionsFeature.use(addTransactionMenu)
transactionsFeature.use(openAssetAccountsMenu)
// router ABOVE the text handler: the foreign-amount text is routed, not parsed
// as a new transaction
transactionsFeature.use(transactionsRouter)
transactionsFeature.on('message:text', handleAddText)
