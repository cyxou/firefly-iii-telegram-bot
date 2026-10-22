import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { handleAddText } from './add.js'
import { addTransactionMenu } from './add.menu.js'
import { showTransactions, transactionsMenu } from './list.menu.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'
import { transactionsRouter } from './router.js'

export const transactionsFeature = new Composer<Context>()

transactionsFeature.use(addTransactionMenu)
transactionsFeature.use(transactionsMenu)
transactionsFeature.use(openAssetAccountsMenu)
// router ABOVE the text handler: the foreign-amount text is routed, not parsed
// as a new transaction
transactionsFeature.use(transactionsRouter)

// hears ABOVE on('message:text') — the main-keyboard label must not be parsed
// as a transaction amount
for (const locale of locales) {
  transactionsFeature.hears(i18n.t(locale, 'labels.TRANSACTIONS'), async ctx => showTransactions(ctx, false))
}

transactionsFeature.on('message:text', handleAddText)
