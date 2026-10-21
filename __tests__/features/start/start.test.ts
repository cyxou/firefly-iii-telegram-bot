import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { generateMessageUpdate, initializeBot, setupMockApi, createTestBot } from '../../helpers/bot.js'
import { defaultSettings } from '#root/lib/settings-store.js'

describe('bot core', () => {
  it('drops updates from users not on the allowlist', async () => {
    const { bot } = createTestBot({ config: { allowedUserIds: [2222222] } })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    expect(api.getOutgoingRequests().filter(r => r.method === 'sendMessage')).toHaveLength(0)
  })

  it('answers /start with welcome + main keyboard + registers commands', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')
    expect((send?.payload as any).text).toContain(i18n.t('en', 'welcome').slice(0, 20))
    expect((send?.payload as any).reply_markup?.keyboard).toBeDefined()
    expect(api.getOutgoingRequests().some(r => r.method === 'setMyCommands')).toBe(true)
  })

  it('appends setup hints when firefly is unconfigured', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')
    expect((send?.payload as any).text).toContain(i18n.t('en', 'navigateToSettings').slice(0, 10))
  })

  it('greets in the stored language', async () => {
    const { bot } = createTestBot({ settings: defaultSettings({ language: 'ru' }) })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')
    expect((send?.payload as any).text).toContain(i18n.t('ru', 'welcome').slice(0, 10))
  })

  it('answers /help and unknown text (interim unhandled)', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/help', { isCommand: true }))
    await bot.handleUpdate(generateMessageUpdate('blah'))
    const texts = api.getOutgoingRequests()
      .filter(r => r.method === 'sendMessage')
      .map(r => (r.payload as any).text)
    expect(texts[0]).toContain(i18n.t('en', 'help').slice(0, 10))
    expect(texts[1]).toContain(i18n.t('en', 'help').slice(0, 10))
  })
})
