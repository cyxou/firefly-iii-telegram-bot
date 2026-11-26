import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { command } from '#root/bot/constants.js'
import { i18n, locales } from '#root/bot/i18n.js'
import { reportsMenu, showCurrentReport } from './report.menu.js'
import { sendReportsWidget, widgetQueryMiddleware } from './report.widget.js'

export const reportsFeature = new Composer<Context>()

// widget_query updates first: they carry no message, so nothing below (menus,
// label hears) would match them anyway — consuming them here keeps the
// answer path short (15 s Telegram deadline).
reportsFeature.use(widgetQueryMiddleware())
reportsFeature.command(command.WIDGET, (ctx) => sendReportsWidget(ctx))
reportsFeature.use(reportsMenu)
for (const locale of locales) {
  reportsFeature.hears(i18n.t(locale, 'labels.REPORTS'), async (ctx) => showCurrentReport(ctx))
}
