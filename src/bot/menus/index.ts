import type { Context } from '#root/bot/context.js'
import type { Composer } from 'grammy'

// Core (cross-feature) root menus attach here — AFTER i18n, BEFORE features.
// No core menus exist until Phase 2; the guard is in place so double registration
// across test bots can never happen (donor: rukevich/bot/src/bot/menus/index.ts).
let menusRegistered = false

export function registerCoreMenus(bot: Composer<Context>) {
  if (menusRegistered)
    return
  menusRegistered = true
  // Phase 2+: bot.use(mainMenu) etc.
}
