import type { I18nContextFlavor } from '@grammyjs/i18n'
import type { MenuFlavor } from '@grammyjs/menu'
import type { Context as DefaultContext, SessionFlavor } from 'grammy'
import type { Config } from '#root/config.js'
import type { FireflyService } from '#root/lib/firefly/service.js'
import type { UserSettings } from '#root/lib/settings-store.js'
import type { Logger } from '#root/logger.js'

export type SettingsFlowStep = 'url' | 'api_url' | 'token'

// One optional field per concurrent flow. NEVER add a shared `step` field
// (lint-tested in __tests__/lint/architecture.test.ts).
export interface SessionData {
  settingsFlow?: { step: SettingsFlowStep }
}

interface ExtendedContextFlavor {
  config: Config
  logger: Logger
  settings: UserSettings | undefined
  firefly: FireflyService
  saveSettings: (settings: UserSettings) => Promise<void>
}

export type Context = DefaultContext
  & ExtendedContextFlavor
  & SessionFlavor<SessionData>
  & MenuFlavor
  & I18nContextFlavor
