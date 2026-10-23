import type { Middleware } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { createMainKeyboard } from '#root/bot/helpers/keyboard.js'

// Gate for every Firefly-dependent feature. Mounted ONCE in createBot, after
// the start+settings features (which must stay reachable unconfigured) and
// before accounts/categories/unhandled — keeping this the only mount is what
// fixes v1's duplicate-requireSettings bug (spec "Bugs folded into the port" #2).
// Callback queries pass through (v1 semantics): menus only ever rendered for
// configured users, so a stale keyboard fails into the error boundary like v1.
export function requireSettings(): Middleware<Context> {
  return async (ctx, next) => {
    if (ctx.callbackQuery) return next()
    if (!ctx.settings?.fireflyUrl) {
      return ctx.reply(ctx.i18n.t('mdlwr.noFireflyURLFound'), {
        parse_mode: 'Markdown',
        reply_markup: createMainKeyboard(ctx),
      })
    }
    if (!ctx.settings?.fireflyAccessToken) {
      return ctx.reply(ctx.i18n.t('mdlwr.noFireflyAccessTokenFound'), {
        parse_mode: 'Markdown',
        reply_markup: createMainKeyboard(ctx),
      })
    }
    return next()
  }
}
