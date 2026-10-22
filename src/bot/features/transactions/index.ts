import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { handleAddText } from './add.js'
import { addTransactionMenu } from './add.menu.js'
import { editTransactionMenu, txnDeleteConfirmMenu } from './edit.menu.js'
import { showTransactions, transactionsMenu } from './list.menu.js'
import { openAssetAccountsMenu } from './open-accounts.menu.js'
import { recordMenu } from './record.menu.js'
import { editRouter, transactionsRouter } from './router.js'

export const transactionsFeature = new Composer<Context>()

// Registered at the composition root (categories-feature precedent): nothing
// else imports edit.menu.ts, so a registration living there would never run.
recordMenu.register([editTransactionMenu, txnDeleteConfirmMenu])

transactionsFeature.use(recordMenu)
transactionsFeature.use(addTransactionMenu)
transactionsFeature.use(transactionsMenu)
transactionsFeature.use(openAssetAccountsMenu)
// routers ABOVE the text handler: the foreign-amount / edit-prompt texts are
// routed, not parsed as new transactions
transactionsFeature.use(transactionsRouter)
transactionsFeature.use(editRouter)

// hears ABOVE on('message:text') — the main-keyboard label must not be parsed
// as a transaction amount
for (const locale of locales) {
  transactionsFeature.hears(i18n.t(locale, 'labels.TRANSACTIONS'), async ctx => showTransactions(ctx, false))
}

transactionsFeature.on('message:text', handleAddText)
