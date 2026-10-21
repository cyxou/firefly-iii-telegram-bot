import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { command } from '#root/bot/constants.js'
import { i18n, locales } from '#root/bot/i18n.js'
import { cancelMenu, defaultAccountMenu, langMenu, settingsMenu, settingsText } from './settings.menu.js'
import { settingsRouter } from './settings.router.js'

export const settingsFeature = new Composer<Context>()

settingsMenu.register(langMenu)
settingsMenu.register(defaultAccountMenu)
settingsMenu.register(cancelMenu)

settingsFeature.use(settingsMenu)

function settingsCommandHandler(ctx: Context) {
  return ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
}

for (const locale of locales) {
  settingsFeature.hears(i18n.t(locale, 'labels.SETTINGS'), settingsCommandHandler)
}
settingsFeature.command(command.SETTINGS, settingsCommandHandler)

// Router last inside the feature (v1 order): commands and menu buttons keep
// working while a text-input flow is active.
settingsFeature.use(settingsRouter)
