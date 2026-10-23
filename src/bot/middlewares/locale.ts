import type { Middleware } from 'grammy'
import type { Context } from '#root/bot/context.js'
import dayjs from 'dayjs'
import { defaultLanguage, locales } from '#root/bot/i18n.js'

// The language of record lives in the durable settings store, not the session
// (v1 kept it in session.userSettings.language).
export function setLocaleFromSettings(): Middleware<Context> {
  return async (ctx, next) => {
    const locale = ctx.settings?.language ?? defaultLanguage
    ctx.i18n.locale(locales.includes(locale as any) ? locale : defaultLanguage)
    dayjs.locale(ctx.i18n.locale())
    await next()
  }
}
