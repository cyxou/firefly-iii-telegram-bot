import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { createMainKeyboard } from '#root/bot/helpers/keyboard.js'

// Interim fallback: v1 routed unknown text into the add-transaction flow; that
// feature lands in Phase 3 and replaces this handler.
export const unhandledFeature = new Composer<Context>()

unhandledFeature.on('message:text', ctx =>
  ctx.reply(ctx.i18n.t('help'), { parse_mode: 'Markdown', reply_markup: createMainKeyboard(ctx) }))
