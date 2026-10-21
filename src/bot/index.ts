import type { Context, SessionData } from '#root/bot/context.js'
import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { FireflyServiceFactory } from '#root/lib/firefly/service.js'
import { defaultSettings, type SettingsStore } from '#root/lib/settings-store.js'
import { settingsFeature } from '#root/bot/features/settings/index.js'
import { startFeature } from '#root/bot/features/start/index.js'
import { unhandledFeature } from '#root/bot/features/unhandled/index.js'
import { errorHandler } from '#root/bot/handlers/error.js'
import { i18n } from '#root/bot/i18n.js'
import { registerCoreMenus } from '#root/bot/menus/index.js'
import { accessControl } from '#root/bot/middlewares/access-control.js'
import { setLocaleFromSettings } from '#root/bot/middlewares/locale.js'
import { session } from '#root/bot/middlewares/session.js'
import { sequentialize } from '@grammyjs/runner'
import { Bot as TelegramBot, type BotConfig, type StorageAdapter } from 'grammy'

export interface Dependencies {
  config: Config
  logger: Logger
  settingsStore: SettingsStore
  firefly: FireflyServiceFactory
  sessionStorage: StorageAdapter<SessionData>
}

function getSessionKey(ctx: Omit<Context, 'session'>) {
  return ctx.chat?.id.toString()
}

export function createBot(token: string, deps: Dependencies, botConfig?: BotConfig<Context>) {
  const bot = new TelegramBot<Context>(token, botConfig)

  // DI seam: everything a handler touches arrives here — tests swap these, never module-mock.
  bot.use(async (ctx, next) => {
    ctx.config = deps.config
    ctx.logger = deps.logger.child({ update_id: ctx.update.update_id })
    ctx.settings = ctx.from ? await deps.settingsStore.get(ctx.from.id) : undefined
    ctx.firefly = deps.firefly(ctx.settings ?? defaultSettings())
    ctx.saveSettings = async (settings) => {
      await deps.settingsStore.save(ctx.from!.id, settings)
      ctx.settings = settings
    }
    await next()
  })

  const protectedBot = bot.errorBoundary(errorHandler)

  // Load-bearing order (spec §1): accessControl → sequentialize → session →
  // i18n → locale-from-settings → core menus → features → unhandled (last).
  protectedBot.use(accessControl(deps.config))
  protectedBot.use(sequentialize(getSessionKey))
  protectedBot.use(session({ getSessionKey, storage: deps.sessionStorage }))
  protectedBot.use(i18n.middleware())
  protectedBot.use(setLocaleFromSettings())
  registerCoreMenus(protectedBot)
  protectedBot.use(startFeature)
  protectedBot.use(settingsFeature)
  protectedBot.use(unhandledFeature) // must stay last

  return bot
}

export type Bot = ReturnType<typeof createBot>
