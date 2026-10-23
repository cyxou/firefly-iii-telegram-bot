import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

function gateTexts(api: ReturnType<typeof setupMockApi>) {
  return api
    .getOutgoingRequests()
    .filter((r) => r.method === 'sendMessage')
    .map((r) => (r.payload as { text: string }).text)
}

describe('requireSettings gate', () => {
  it('blocks unconfigured users with the firefly-url prompt + main keyboard', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find((r) => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain('Firefly URL')
    expect((send.payload as any).reply_markup?.keyboard).toBeDefined()
  })

  it('asks for the access token when only the url is set', async () => {
    const { bot } = createTestBot({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api' }),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    expect(gateTexts(api).at(-1)).toContain('Access Token')
  })

  it('lets configured users through to the transactions add flow', async () => {
    const { bot } = createTestBot({ settings: CONFIGURED })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('blah'))
    expect(gateTexts(api).at(-1)).toContain(
      i18n.t('en', 'transactions.add.dontUnderstand').slice(0, 10),
    )
  })

  it('lets env-provided credentials through when nothing is stored', async () => {
    const { bot } = createTestBot({
      config: {
        fireflyUrl: 'https://ff.example.com',
        fireflyApiUrl: 'https://ff.example.com/api',
        fireflyAccessToken: 'x'.repeat(500),
      },
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('blah'))
    expect(gateTexts(api).at(-1)).not.toContain('To work with the bot')
    expect(gateTexts(api).at(-1)).toContain(
      i18n.t('en', 'transactions.add.dontUnderstand').slice(0, 10),
    )
  })

  it('never gates /start, /settings, or callback queries', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    await bot.handleUpdate(generateMessageUpdate('/settings', { isCommand: true }))
    await bot.handleUpdate(generateCallbackQueryUpdate('settings:anything'))
    const texts = gateTexts(api)
    expect(texts[0]).toContain(i18n.t('en', 'welcome').slice(0, 10))
    expect(texts[1]).toContain(i18n.t('en', 'settings.notSpecified').slice(0, 8))
    // no GATE prompt anywhere — 'To work with the bot' is the gate copy's stable
    // fragment ('Firefly URL' alone collides with the settings screen's own display)
    expect(texts.some((t) => t.includes('To work with the bot'))).toBe(false)
  })
})
