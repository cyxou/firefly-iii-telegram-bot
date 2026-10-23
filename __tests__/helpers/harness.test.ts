import { Bot } from 'grammy'
import { describe, expect, it } from 'vitest'
import { generateMessageUpdate, initializeBot, setupMockApi } from './bot.js'

describe('mock API harness', () => {
  it('records sendMessage calls', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    bot.on('message:text', (ctx) => ctx.reply(`echo:${ctx.msg.text}`))
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('hi'))
    const last = api.getOutgoingRequests().at(-1)
    expect(last?.method).toBe('sendMessage')
    expect((last?.payload as any).text).toBe('echo:hi')
    expect(last?.resultMessageId).toBeGreaterThan(0)
  })

  it('rejects editing a message the bot never sent, like Telegram', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    setupMockApi(bot)
    await initializeBot(bot)
    await expect(bot.api.editMessageText(1111111, 999, 'x')).rejects.toThrow(
      'message to edit not found',
    )
  })
})
