// Mock Telegram API harness — ported from ~/code/rukevich/bot/__tests__/helpers/bot.ts
// (mock transformer, update generators, request queries) and its e2e/helpers.ts
// (findButton). Prisma-related helpers from the donor are dropped: no database here.
import type { Update } from '@grammyjs/types'
import type { Bot as TelegramBot } from 'grammy'
import type { Context, SessionData } from '#root/bot/context.js'
import type { Config } from '#root/config.js'
import type { AccountRead, CategoryExpenseSummary, CategoryRead, FireflyService, TransactionRead } from '#root/lib/firefly/service.js'
import type { SettingsStore, UserSettings } from '#root/lib/settings-store.js'
import type { Logger } from '#root/logger.js'
import dayjs from 'dayjs'
import { MemorySessionStorage } from 'grammy'
import { pino } from 'pino'
import { createBot } from '#root/bot/index.js'
import { createConfig } from '#root/config.js'
import { ResourceNotFoundError } from '#root/lib/errors.js'
import { createMemorySettingsStore } from '#root/lib/settings-store.js'
import { noteRichMarkdown } from './rich-validate.js'

// Type for API call function
type ApiCallFn = ReturnType<typeof TelegramBot.prototype.api.call>
type ResultType = Awaited<ReturnType<ApiCallFn>>
type Params = Parameters<ApiCallFn>
type PayloadType = Params[1]

// Outgoing requests tracker
export interface OutgoingRequest {
  method: string
  payload: PayloadType
  /** For send methods: the message id the mock assigned (undefined for others) */
  resultMessageId?: number
}

// Telegram-shaped error thrown by the mock API for calls the real API would reject
export class MockApiError extends Error {
  constructor(readonly error_code: number, description: string) {
    super(description)
    this.name = 'MockApiError'
  }
}

type SentMessageKind = 'text' | 'media'

interface SentMessage {
  id: number
  chatId: number
  kind: SentMessageKind
}

// Send methods that create a message the real API would later allow editing.
// Reply-keyboard-only methods (sendChatAction etc.) are not messages.
// Rich sends count as text: Bot API editMessageText edits "text, rich and game
// messages" — same edit semantics.
const SEND_TEXT_METHODS = new Set(['sendMessage', 'sendRichMessage'])
const SEND_MEDIA_METHODS = new Set([
  'sendPhoto',
  'sendVideo',
  'sendAnimation',
  'sendDocument',
  'sendAudio',
])

// Which content an edit method requires the target message to have
const EDIT_METHODS: Record<string, SentMessageKind | 'any'> = {
  editMessageText: 'text',
  editMessageCaption: 'media',
  editMessageMedia: 'media',
  editMessageReplyMarkup: 'any',
}

// Setup mock API for a bot instance - captures all outgoing API calls.
// Mirrors Telegram's edit semantics: messages the bot never sent (or of the
// wrong kind) cannot be edited, so flows that only work against a permissive
// mock fail here instead of in production.
export function setupMockApi(bot: TelegramBot<Context>) {
  const outgoingRequests: OutgoingRequest[] = []
  const sentMessages = new Map<string, SentMessage>()
  let nextMessageId = 5000

  const trackSent = (chatId: number, kind: SentMessageKind) => {
    const id = nextMessageId++
    sentMessages.set(`${chatId}:${id}`, { id, chatId, kind })
    return id
  }

  bot.api.config.use(async (_prev, method, payload) => {
    outgoingRequests.push({
      method,
      payload,
    })

    // structural GFM check (see rich-validate.ts) — records violations; the
    // shared setup's afterEach fails the test that produced them
    const richMarkdown = (payload as { rich_message?: { markdown?: string } })?.rich_message?.markdown
    if (typeof richMarkdown === 'string')
      noteRichMarkdown(richMarkdown)

    const p = payload as {
      chat_id?: number
      message_id?: number
      inline_message_id?: string
      text?: string
      rich_message?: { markdown?: string }
    }

    if (SEND_TEXT_METHODS.has(method) && p.chat_id !== undefined) {
      const id = trackSent(p.chat_id, 'text')
      outgoingRequests[outgoingRequests.length - 1].resultMessageId = id
      return {
        ok: true,
        result: {
          message_id: id,
          date: Math.floor(Date.now() / 1000),
          chat: { id: p.chat_id, type: 'private', first_name: 'Mock' },
          text: p.text,
          ...(p.rich_message ? { rich_message: p.rich_message } : {}),
        } as ResultType,
      }
    }

    if (SEND_MEDIA_METHODS.has(method) && p.chat_id !== undefined) {
      const id = trackSent(p.chat_id, 'media')
      outgoingRequests[outgoingRequests.length - 1].resultMessageId = id
      return {
        ok: true,
        result: {
          message_id: id,
          date: Math.floor(Date.now() / 1000),
          chat: { id: p.chat_id, type: 'private', first_name: 'Mock' },
        } as ResultType,
      }
    }

    const requiredKind = EDIT_METHODS[method]
    if (requiredKind !== undefined) {
      // Inline-mode edits are untrackable here; the real API validates them itself
      if (p.inline_message_id !== undefined)
        return { ok: true, result: true as ResultType }

      const target = p.chat_id !== undefined && p.message_id !== undefined
        ? sentMessages.get(`${p.chat_id}:${p.message_id}`)
        : undefined
      if (!target)
        throw new MockApiError(400, 'Bad Request: message to edit not found')
      if (requiredKind !== 'any' && target.kind !== requiredKind) {
        throw new MockApiError(
          400,
          requiredKind === 'text'
            ? 'Bad Request: there is no text in the message to edit'
            : 'Bad Request: there is no media in the message to edit',
        )
      }
    }

    return { ok: true, result: true as ResultType }
  })

  return {
    bot,
    getOutgoingRequests: () => outgoingRequests,
    getSentMessages: () => [...sentMessages.values()],
    clearOutgoingRequests: () => {
      outgoingRequests.length = 0
      sentMessages.clear()
    },
  }
}

// Initialize bot with required botInfo
export async function initializeBot(bot: TelegramBot<Context>) {
  bot.botInfo = {
    id: 42,
    first_name: 'Test Bot',
    is_bot: true,
    username: 'test_bot',
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  }
  await bot.init()
}

// Generate a test message update
export function generateMessageUpdate(
  text: string,
  options: {
    userId?: number
    chatId?: number
    chatType?: 'private' | 'group' | 'supergroup' | 'channel'
    username?: string
    firstName?: string
    lastName?: string
    isCommand?: boolean
  } = {},
): Update {
  const {
    userId = 1111111,
    chatId = 1111111,
    chatType = 'private',
    username = 'test_user',
    firstName = 'Test',
    lastName = 'User',
    isCommand = false,
  } = options

  // For commands, we need to add proper entities
  const entities = isCommand
    ? [
        {
          type: 'bot_command' as const,
          offset: 0,
          length: text.length,
        },
      ]
    : undefined

  return {
    update_id: 10000,
    message: {
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: chatId,
        type: chatType as 'private' | 'group' | 'supergroup',
        ...(chatType === 'private' && {
          first_name: firstName,
          last_name: lastName,
          username,
        }),
        ...(chatType !== 'private' && {
          title: `${chatType === 'supergroup' ? 'Super' : chatType === 'group' ? 'Test' : ''} Group`,
        }),
      } as NonNullable<Update['message']>['chat'],
      message_id: 1365,
      from: {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        username,
        is_bot: false,
      },
      text,
      entities,
    },
  }
}

// Generate a test callback query update
export function generateCallbackQueryUpdate(
  data: string,
  options: {
    userId?: number
    chatId?: number
    messageId?: number
    username?: string
    firstName?: string
    lastName?: string
  } = {},
): Update {
  const {
    userId = 1111111,
    chatId = 1111111,
    messageId = 1365,
    username = 'test_user',
    firstName = 'Test',
    lastName = 'User',
  } = options

  return {
    update_id: 10000,
    callback_query: {
      id: '123456789',
      from: {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        username,
        is_bot: false,
      },
      message: {
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: chatId,
          type: 'private',
          first_name: firstName,
          last_name: lastName,
          username,
        },
        message_id: messageId,
        from: {
          id: userId,
          first_name: firstName,
          last_name: lastName,
          username,
          is_bot: false,
        },
        text: 'Previous message',
      },
      data,
      chat_instance: 'test_instance',
    },
  }
}

// Helper to check if payload has text property
export function isTextPayload(payload: PayloadType): payload is { text: string, parse_mode?: string } {
  return typeof payload === 'object' && payload !== null && 'text' in payload
}

// Helper to get last message from outgoing requests
export function getLastMessage(outgoingRequests: OutgoingRequest[]): { text: string } | null {
  const lastRequest = outgoingRequests[outgoingRequests.length - 1]
  if (!lastRequest || !isTextPayload(lastRequest.payload))
    return null
  return lastRequest.payload
}

/** Markdown of the most recent rich send/edit, if any. */
export function getLastRichMarkdown(requests: OutgoingRequest[]): string | undefined {
  for (const request of [...requests].reverse()) {
    const markdown = (request.payload as { rich_message?: { markdown?: string } })?.rich_message?.markdown
    if (markdown !== undefined)
      return markdown
  }
  return undefined
}

// Helper to check if payload is a sendPhoto call
// Photos can have caption, reply_markup, or both
export function isPhotoPayload(payload: unknown): payload is { caption?: string, reply_markup?: unknown } {
  return typeof payload === 'object' && payload !== null && 'photo' in payload
}

// Helper to find sendPhoto request
export function findPhotoRequest(outgoingRequests: OutgoingRequest[]): OutgoingRequest | undefined {
  return outgoingRequests.find(req => req.method === 'sendPhoto')
}

/** Find the newest keyboard button whose label matches; returns its callback data and the message it lives on. (Ported from donor e2e/helpers.ts.) */
export function findButton(
  requests: { method: string, payload: unknown, resultMessageId?: number }[],
  label: string,
  match: 'exact' | 'prefix' = 'exact',
): { data: string, messageId: number } | undefined {
  for (const request of [...requests].reverse()) {
    const keyboard = (request.payload as { reply_markup?: { inline_keyboard?: { text: string, callback_data?: string }[][] } })
      ?.reply_markup
      ?.inline_keyboard
    if (!keyboard)
      continue
    for (const row of keyboard) {
      for (const button of row) {
        const hit = match === 'exact' ? button.text === label : button.text.startsWith(label)
        if (hit && button.callback_data !== undefined) {
          return {
            data: button.callback_data,
            messageId: request.resultMessageId
              ?? (request.payload as { message_id?: number }).message_id!,
          }
        }
      }
    }
  }
  return undefined
}

// --- Project fakes (firefly at the service boundary, config, logger) ---

export function createTestConfig(): Config {
  return createConfig({ BOT_TOKEN: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz' })
}

export function createTestLogger() {
  return pino({ level: 'silent' })
}

export function testAccount(id: string, name: string, options: {
  type?: string
  active?: boolean
  balance?: string
  currencyId?: string
  currencySymbol?: string
  decimalPlaces?: number
} = {}): AccountRead {
  const { type = 'asset', active = true, balance = '100.00', currencyId = '1', currencySymbol = 'USD', decimalPlaces = 2 } = options
  return {
    id,
    type: 'account',
    attributes: { name, type, active, current_balance: balance, currency_id: currencyId, currency_symbol: currencySymbol, currency_decimal_places: decimalPlaces },
  } as unknown as AccountRead
}

export function testCategory(id: string, name: string): CategoryRead {
  return { id, type: 'category', attributes: { name } } as unknown as CategoryRead
}

export function testCategoryTransaction(description: string, options: {
  amount?: string
  currencySymbol?: string
  date?: string
} = {}): TransactionRead {
  const { amount = '12.34', currencySymbol = '$', date = '2026-10-01T12:00:00+00:00' } = options
  return {
    type: 'transaction',
    attributes: { transactions: [{ description, amount, currency_symbol: currencySymbol, date }] },
  } as unknown as TransactionRead
}

export function testTransaction(description: string, options: {
  type?: string
  amount?: string
  currencySymbol?: string
  date?: string
} = {}): TransactionRead {
  const { type = 'withdrawal', amount = '12.34', currencySymbol = '$', date = '2026-10-01T12:00:00+00:00' } = options
  return {
    id: String(Math.random()).slice(2, 10),
    type: 'transaction',
    attributes: { transactions: [{ description, type, amount, currency_symbol: currencySymbol, date }] },
  } as unknown as TransactionRead
}

export function createTestFireflyService(
  fixtures: {
    accounts?: AccountRead[]
    categories?: CategoryRead[]
    transactions?: TransactionRead[]
    categoryTransactions?: Record<string, TransactionRead[]>
    categoryInsights?: Record<string, CategoryExpenseSummary[]>
  } = {},
  overrides: Partial<FireflyService> = {},
): FireflyService {
  const categories = [...(fixtures.categories ?? [])] // mutable copy: store/update/delete are observable in re-renders
  let nextCategoryId = 100
  const transactions = [...(fixtures.transactions ?? [])] // store appends here — assertable
  let nextTransactionId = 200
  return {
    async getCurrentUser() {
      return { email: 'test@example.com' }
    },
    async listAccounts(type) {
      return (fixtures.accounts ?? [])
        .filter(a => a.attributes.active !== false) // service parity: filterActiveAccounts
        .filter(a => !type || String(a.attributes.type) === String(type))
    },
    async getAccount(id) {
      const acc = (fixtures.accounts ?? []).find(a => a.id === id)
      if (!acc)
        throw new ResourceNotFoundError('404')
      return acc
    },
    async listCategories() {
      return [...categories]
    },
    async getCategory(id) {
      const found = categories.find(c => c.id === id)
      if (!found)
        throw new ResourceNotFoundError('404')
      return found
    },
    async storeCategory(name) {
      categories.push(testCategory(String(nextCategoryId++), name))
    },
    async updateCategory(id, name) {
      const found = categories.find(c => c.id === id)
      if (found)
        (found.attributes as { name: string }).name = name
    },
    async deleteCategory(id) {
      const idx = categories.findIndex(c => c.id === id)
      if (idx !== -1)
        categories.splice(idx, 1)
    },
    async listTransactionsByCategory(id) {
      return fixtures.categoryTransactions?.[id] ?? []
    },
    async listTransactions(type, start, end) {
      return transactions.filter((t) => {
        const split = t.attributes.transactions?.[0]
        if (!split)
          return false
        if (String(split.type) !== String(type))
          return false
        const day = dayjs(split.date).format('YYYY-MM-DD')
        return day >= start && day <= end
      })
    },
    async storeTransaction(split) {
      const accounts = fixtures.accounts ?? []
      const nameOf = (id?: string | null) => accounts.find(a => a.id === id)?.attributes.name ?? ''
      // the real API resolves names on the stored transaction — model it
      const categoryName = (id?: string | null) => fixtures.categories?.find(c => c.id === id)?.attributes.name
      const read = {
        id: String(nextTransactionId++),
        type: 'transaction',
        attributes: {
          transactions: [{
            ...split,
            source_name: nameOf(split.source_id),
            destination_name: nameOf(split.destination_id),
            category_name: categoryName(split.category_id),
            currency_symbol: '$',
          }],
        },
      } as unknown as TransactionRead
      transactions.push(read)
      return read
    },
    async getTransaction(id) {
      const found = transactions.find(t => t.id === id)
      if (!found)
        throw new ResourceNotFoundError('404')
      return found
    },
    async updateTransaction(id, split) {
      const found = transactions.find(t => t.id === id)
      if (!found)
        throw new ResourceNotFoundError('404')
      const cur = found.attributes.transactions![0]!
      Object.assign(cur, split)
      const accounts = fixtures.accounts ?? []
      if (split.source_id)
        cur.source_name = accounts.find(a => a.id === split.source_id)?.attributes.name ?? cur.source_name
      if (split.destination_id)
        cur.destination_name = accounts.find(a => a.id === split.destination_id)?.attributes.name ?? cur.destination_name
      if (split.category_id !== undefined && split.category_id !== null)
        cur.category_name = fixtures.categories?.find(c => c.id === split.category_id)?.attributes.name
      return found
    },
    async deleteTransaction(id) {
      const idx = transactions.findIndex(t => t.id === id)
      if (idx !== -1)
        transactions.splice(idx, 1)
    },
    async insightExpenseCategory(_start, _end, categoryId) {
      return fixtures.categoryInsights?.[String(categoryId)] ?? []
    },
    ...overrides,
  }
}

export function createTestBot(options: {
  config?: Partial<Config>
  logger?: Logger
  settingsStore?: SettingsStore
  settings?: UserSettings // convenience: seeds the default test user 1111111
  firefly?: FireflyService
} = {}) {
  const config = { ...createTestConfig(), ...options.config }
  const settingsStore = options.settingsStore
    ?? createMemorySettingsStore(options.settings ? { 1111111: options.settings } : {})
  const bot = createBot(config.botToken, {
    config,
    logger: options.logger ?? createTestLogger(),
    settingsStore,
    firefly: () => options.firefly ?? createTestFireflyService(),
    sessionStorage: new MemorySessionStorage<SessionData>(),
  })
  return { bot, config, settingsStore }
}
