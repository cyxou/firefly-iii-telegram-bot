import type { I18nContextFlavor } from '@grammyjs/i18n'
import type { MenuFlavor } from '@grammyjs/menu'
import type { Context as DefaultContext, SessionFlavor } from 'grammy'
import type { Config } from '#root/config.js'
import type { FireflyService } from '#root/lib/firefly/service.js'
import type { UserSettings } from '#root/lib/settings-store.js'
import type { Logger } from '#root/logger.js'

export type SettingsFlowStep = 'url' | 'api_url' | 'token'

export interface TxnAccount { id: string, name: string, type: string, currencyId?: string, currencySymbol?: string }
export interface TxnDraft {
  amount: string
  date: string // ISO — captured from the text message that started the flow
  description: string
  sourceAccount?: TxnAccount
  destAccount?: TxnAccount | null
  categoryId?: string | null
  foreignAmount?: string
}
export interface TxnFlowState {
  step?: 'foreign_amount'
  draft: TxnDraft
  categoryPage?: number
  /** foreign-amount prompt to delete once the text lands (plain ids, never a closure) */
  promptMessage?: { chatId: number, messageId: number }
}

// One optional field per concurrent flow. NEVER add a shared `step` field
// (lint-tested in __tests__/lint/architecture.test.ts).
export interface SessionData {
  settingsFlow?: { step: SettingsFlowStep }
  categoryFlow?: { step: 'add' | 'rename', names?: string[], categoryId?: string }
  txnFlow?: TxnFlowState
  // Per-list view state — the list/pagination standard shape (Phase 3 fills the page counter in)
  lists?: Record<string, { page: number, view?: string, date?: string }>
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
