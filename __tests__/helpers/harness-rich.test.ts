import { Bot } from 'grammy'
import { describe, expect, it } from 'vitest'
import { generateMessageUpdate, getLastRichMarkdown, initializeBot, setupMockApi } from './bot.js'

describe('mock API rich messages', () => {
  it('records sendRichMessage with a message id, and edits target it', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    const api = setupMockApi(bot)
    await initializeBot(bot)
    const sent = await bot.api.sendRichMessage(1111111, { markdown: '| a |\n| --- |\n| 1 |' })
    const last = api.getOutgoingRequests().at(-1)!
    expect(last.method).toBe('sendRichMessage')
    expect(last.resultMessageId).toBeGreaterThan(0)
    expect(sent.message_id).toBe(last.resultMessageId)
    expect(getLastRichMarkdown(api.getOutgoingRequests())).toContain('| a |')

    await bot.api.editMessageText(1111111, sent.message_id, { markdown: '| b |\n| --- |' })
    expect(getLastRichMarkdown(api.getOutgoingRequests())).toContain('| b |')
  })

  it('keeps findButton working on rich-message keyboards', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    bot.on('message:text', async (ctx) => {
      await ctx.api.sendRichMessage(
        ctx.chat.id,
        { markdown: 'x' },
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Tab', callback_data: 'tab:1' }]],
          },
        },
      )
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('go'))
    const { findButton } = await import('./bot.js')
    expect(findButton(api.getOutgoingRequests(), 'Tab')?.data).toBe('tab:1')
  })
})
