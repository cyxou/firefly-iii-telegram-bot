import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { createTestBot, generateMessageUpdate, initializeBot, setupMockApi } from '../helpers/bot.js'

describe('updateLogger middleware', () => {
  it('traces update, bot API calls, and elapsed at debug level', async () => {
    const lines: string[] = []
    const logger = pino({ level: 'debug' }, { write: (line: string) => lines.push(line) })

    const { bot } = createTestBot({ logger })
    setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))

    const msgs = lines.map(l => JSON.parse(l).msg)
    expect(msgs).toContain('Update received')
    expect(msgs).toContain('Update processed')
    // the /start reply went through the traced api
    expect(lines.some(l => l.includes('"method":"sendMessage"'))).toBe(true)
    // update payload is included (message text)
    expect(lines.find(l => l.includes('Update received'))).toContain('/start')
  })
})
