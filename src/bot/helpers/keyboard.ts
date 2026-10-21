import type { Context } from '#root/bot/context.js'
import { Keyboard } from 'grammy'
import { defaultSettings } from '#root/lib/settings-store.js'

// Ported from legacy/composers/helpers.ts (createMainKeyboard /
// generateWelcomeMessage) — layout and hint order are muscle memory for v1
// users; do not reshuffle.
export function createMainKeyboard(ctx: Context) {
  return new Keyboard()
    .text(ctx.i18n.t('labels.ACCOUNTS'))
    .text(ctx.i18n.t('labels.TRANSACTIONS'))
    .row()
    .text(ctx.i18n.t('labels.REPORTS'))
    .text(ctx.i18n.t('labels.CATEGORIES'))
    .row()
    .text(ctx.i18n.t('labels.SETTINGS'))
    .resized()
}

export function generateWelcomeMessage(ctx: Context) {
  const { fireflyUrl, fireflyAccessToken } = ctx.settings ?? defaultSettings()
  const isConfigured = !!(fireflyUrl && fireflyAccessToken)

  let msg = ctx.i18n.t('welcome')
  if (!isConfigured)
    msg += `\n${ctx.i18n.t('needToSet')}`
  if (!fireflyUrl)
    msg += `\n${ctx.i18n.t('setFireflyUrl')}`
  if (!fireflyAccessToken)
    msg += `\n${ctx.i18n.t('setFireflyAccessToken')}`
  if (!isConfigured)
    msg += `\n\n${ctx.i18n.t('navigateToSettings')}`
  return msg
}
