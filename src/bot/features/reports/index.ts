import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { reportsMenu, showCurrentReport } from './report.menu.js'

export const reportsFeature = new Composer<Context>()

reportsFeature.use(reportsMenu)
for (const locale of locales) {
  reportsFeature.hears(i18n.t(locale, 'labels.REPORTS'), async ctx => showCurrentReport(ctx))
}
