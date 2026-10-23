import { Bot } from 'grammy'
import { describe, expect, it } from 'vitest'
import { initializeBot, setupMockApi } from './bot.js'
import { expectNoRichViolations, validateRichMarkdown } from './rich-validate.js'

describe('validateRichMarkdown', () => {
  it('accepts a table at message start', () => {
    expect(validateRichMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toEqual([])
  })

  it('accepts a table after a blank line', () => {
    expect(
      validateRichMarkdown('Heading:\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nSUM: 1'),
    ).toEqual([])
  })

  it('flags a table interrupting a paragraph (live bug 8wh)', () => {
    const violations = validateRichMarkdown('Heading:\n| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('blank line')
  })

  it('flags a pipe row without a separator row', () => {
    const violations = validateRichMarkdown('\n| a | b |\n| 1 | 2 |')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('separator')
  })
})

describe('rich-violations registry', () => {
  it('records what the mock transformer sees and expectNoRichViolations throws on it', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    setupMockApi(bot)
    await initializeBot(bot)
    await bot.api.sendRichMessage(1111111, { markdown: 'Heading:\n| a |\n| --- |\n| 1 |' }) // invalid
    expect(() => expectNoRichViolations()).toThrow(/invalid rich markdown.*blank line/s)

    expectNoRichViolations() // drained — does not throw
    await bot.api.sendRichMessage(1111111, { markdown: '\n| a |\n| --- |\n| 1 |' }) // valid
    expectNoRichViolations()
  })
})
