import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
  testAccount,
} from '../../helpers/bot.js'

const URL_BUTTON = '🔗 Firefly URL'
const TOKEN_BUTTON = '🔑 Access Token'
const CHECK_BUTTON = '🔌 Check connection'

async function setup(opts: Parameters<typeof createTestBot>[0] = {}) {
  const { bot, settingsStore } = createTestBot(opts)
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const send = (text: string) => bot.handleUpdate(generateMessageUpdate(text, { isCommand: true }))
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return { bot, settingsStore, api, send, click }
}

describe('settings feature', () => {
  it('shows NOT SPECIFIED markers for a fresh user', async () => {
    const { api, send } = await setup()
    await send('/settings')
    const text = (api.getOutgoingRequests().find(r => r.method === 'sendMessage')?.payload as any).text
    expect(text).toContain(i18n.t('en', 'settings.notSpecified'))
  })

  it('firefly url flow: rejects bad url, accepts good one, persists to the store', async () => {
    const { api, send, click, settingsStore } = await setup()
    await send('/settings')
    await click(URL_BUTTON)
    await send('not a url')
    let replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain(i18n.t('en', 'settings.badUrl'))

    await send('https://ff.example.com')
    const saved = await settingsStore.get(1111111)
    expect(saved?.fireflyUrl).toBe('https://ff.example.com')
    expect(saved?.fireflyApiUrl).toBe('https://ff.example.com/api')
    replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain('ff.example.com')
  })

  it('token flow rejects a short token and stores a long one', async () => {
    const { api, send, click, settingsStore } = await setup()
    await send('/settings')
    await click(TOKEN_BUTTON)
    await send('short')
    let replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain(i18n.t('en', 'settings.badAccessToken'))

    const longToken = 't'.repeat(500)
    await send(longToken)
    expect((await settingsStore.get(1111111))?.fireflyAccessToken).toBe(longToken)
    replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain('t...')
  })

  // Regression: token tail "r_cs" made Telegram reject the whole settings screen
  // with "can't parse entities" — legacy Markdown read _ as an italic opener.
  it('escapes Markdown metachars in stored values (token tail, URL)', async () => {
    const { api, send } = await setup({
      settings: defaultSettings({
        fireflyUrl: 'http://my_host:8888',
        fireflyApiUrl: 'http://my_host:8888/api',
        fireflyAccessToken: `ey${'A'.repeat(600)}r_cs`,
      }),
    })
    await send('/settings')
    const text = (api.getOutgoingRequests().find(r => r.method === 'sendMessage')?.payload as any).text
    expect(text).toContain('r\\_cs')
    expect(text).toContain('my\\_host')
  })

  it('check connection reports the firefly user email', async () => {
    const { api, send, click } = await setup({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500) }),
    })
    await send('/settings')
    await click(CHECK_BUTTON)
    const replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text)
      .toContain(i18n.t('en', 'settings.connectionSuccess', { email: 'test@example.com' }))
  })

  it('default asset account selection persists to the store', async () => {
    const { send, click, settingsStore } = await setup({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500) }),
      firefly: createTestFireflyService({ accounts: [testAccount('1', 'Checking'), testAccount('2', 'Savings')] }),
    })
    await send('/settings')
    await click('💳 Default asset account')
    await click('Checking')
    expect((await settingsStore.get(1111111))?.defaultSourceAccount?.name).toBe('Checking')
  })

  // Regression: back handlers passed reply_markup explicitly, so @grammyjs/menu's
  // markup injection never consumed the nav and the library fired a redundant
  // editMessageReplyMarkup — Telegram 400 "message is not modified" on live.
  it('navigating back from the account menu renders settings without a redundant markup edit', async () => {
    const { api, send, click } = await setup({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500) }),
      firefly: createTestFireflyService({ accounts: [testAccount('1', 'Checking'), testAccount('2', 'Savings')] }),
    })
    await send('/settings')
    await click('💳 Default asset account')
    await click('Checking')
    await click('🔙')
    const edits = api.getOutgoingRequests().filter(r => r.method === 'editMessageText')
    expect((edits.at(-1)!.payload as any).text).toContain('*Settings*')
    expect((edits.at(-1)!.payload as any).reply_markup?.inline_keyboard).toBeDefined()
    expect(api.getOutgoingRequests().some(r => r.method === 'editMessageReplyMarkup')).toBe(false)
  })

  it('language switch persists to the store', async () => {
    const { send, click, settingsStore } = await setup()
    await send('/settings')
    await click('🌐 Language')
    await click('🇪🇸 Spanish')
    expect((await settingsStore.get(1111111))?.language).toBe('es')
  })

  // v3 deployment story: env credentials must stay a live layer, never get
  // baked into the per-user store by a non-credential save.
  describe('env-seeded credentials', () => {
    const envConfig = {
      fireflyUrl: 'https://env-firefly.example.com',
      fireflyApiUrl: 'https://env-firefly.example.com/api',
      fireflyAccessToken: 'e'.repeat(500),
    }

    it('a language switch does not persist env credentials to the store', async () => {
      const { api, send, click, settingsStore } = await setup({ config: envConfig })
      await send('/settings')
      await click('🌐 Language')
      await click('🇪🇸 Spanish')
      const saved = await settingsStore.get(1111111)
      expect(saved?.language).toBe('es')
      expect(saved?.fireflyUrl).toBeUndefined()
      expect(saved?.fireflyApiUrl).toBeUndefined()
      expect(saved?.fireflyAccessToken).toBeUndefined()

      // env credentials still backfill the user after the partial save, so
      // rotating the env token keeps reaching them
      await send('/settings')
      const text = (api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!.payload as any).text
      expect(text).toContain('env-firefly.example.com')
    })

    it('user-saved credentials win over env credentials', async () => {
      const { api, send } = await setup({
        settings: defaultSettings({
          fireflyUrl: 'https://my-firefly.example.com',
          fireflyApiUrl: 'https://my-firefly.example.com/api',
          fireflyAccessToken: 'm'.repeat(500),
        }),
        config: envConfig,
      })
      await send('/settings')
      const text = (api.getOutgoingRequests().find(r => r.method === 'sendMessage')?.payload as any).text
      expect(text).toContain('my-firefly.example.com')
      expect(text).not.toContain('env-firefly.example.com')
    })
  })
})
