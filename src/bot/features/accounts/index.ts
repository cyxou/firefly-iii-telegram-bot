import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { accountsMenu, showAccounts } from './accounts.menu.js'

export const accountsFeature = new Composer<Context>()

accountsFeature.use(accountsMenu)
for (const locale of locales) {
  accountsFeature.hears(i18n.t(locale, 'labels.ACCOUNTS'), async ctx => showAccounts(ctx, false))
}
