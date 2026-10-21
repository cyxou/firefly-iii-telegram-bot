// Mock Telegram API harness — ported from ~/code/rukevich/bot/__tests__/helpers/bot.ts
// (mock transformer, update generators, request queries) and its e2e/helpers.ts
// (findButton). Prisma-related helpers from the donor are dropped: no database here.
import type { Update } from '@grammyjs/types'
import type { Context, SessionData } from '#root/bot/context.js'
import { createBot } from '#root/bot/index.js'
import type { Bot as TelegramBot } from 'grammy'
import { MemorySessionStorage } from 'grammy'
import { createConfig, type Config } from '#root/config.js'
import type { SettingsStore, UserSettings } from '#root/lib/settings-store.js'
import { createMemorySettingsStore } from '#root/lib/settings-store.js'
import type { FireflyService } from '#root/lib/firefly/service.js'
import type { AccountRead } from '#root/lib/firefly/service.js'
import { ResourceNotFoundError } from '#root/lib/errors.js'
import { pino } from 'pino'

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
const SEND_TEXT_METHODS = new Set(['sendMessage'])
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

    const p = payload as { chat_id?: number, message_id?: number, inline_message_id?: string, text?: string }

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

export function testAccount(id: string, name: string, type = 'asset'): AccountRead {
  return { id, type: 'account', attributes: { name, type, active: true } } as unknown as AccountRead
}

export function createTestFireflyService(
  fixtures: { accounts?: AccountRead[] } = {},
  overrides: Partial<FireflyService> = {},
): FireflyService {
  return {
    async getCurrentUser() {
      return { email: 'test@example.com' }
    },
    async listAccounts(type) {
      return (fixtures.accounts ?? []).filter(a => !type || String(a.attributes.type) === String(type))
    },
    async getAccount(id) {
      const acc = (fixtures.accounts ?? []).find(a => a.id === id)
      if (!acc)
        throw new ResourceNotFoundError('404')
      return acc
    },
    ...overrides,
  }
}

export function createTestBot(options: {
  config?: Partial<Config>
  settingsStore?: SettingsStore
  settings?: UserSettings // convenience: seeds the default test user 1111111
  firefly?: FireflyService
} = {}) {
  const config = { ...createTestConfig(), ...options.config }
  const settingsStore = options.settingsStore
    ?? createMemorySettingsStore(options.settings ? { 1111111: options.settings } : {})
  const bot = createBot(config.botToken, {
    config,
    logger: createTestLogger(),
    settingsStore,
    firefly: () => options.firefly ?? createTestFireflyService(),
    sessionStorage: new MemorySessionStorage<SessionData>(),
  })
  return { bot, config, settingsStore }
}
