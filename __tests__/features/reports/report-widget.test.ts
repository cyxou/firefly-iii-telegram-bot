// /widget end to end through the real middleware chain: the send, the
// stateless widget_query flow (answer → persist), and the never-leave-a-
// query-unanswered rule (Telegram times the widget out after 15 s).
import type { BotError } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { randomBytes } from 'node:crypto'
import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { errorHandler } from '#root/bot/handlers/error.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import type { OutgoingRequest } from '../../helpers/bot.js'
import {
  createTestBot,
  createTestFireflyService,
  generateMessageUpdate,
  generateWidgetQueryUpdate,
  initializeBot,
  setupMockApi,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

const MONTH_FIXTURES = {
  incomeTotals: [{ currency: 'EUR', amount: 4200 }],
  expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
  expenseByCategory: [
    { name: 'Rent', currency: 'EUR', amount: 550 },
    { name: 'Groceries', currency: 'EUR', amount: 612.4 },
  ],
  netWorth: [{ currency: 'EUR', amount: 1328.65 }],
  budgetRows: [
    { name: 'Groceries', currency: 'EUR', limit: 700, spent: 612.4 },
    { name: 'Fun', currency: 'EUR', limit: null, spent: 90 },
  ],
} satisfies Parameters<typeof createTestFireflyService>[0]

async function setup(
  fixtures: Parameters<typeof createTestFireflyService>[0] = MONTH_FIXTURES,
  overrides: Parameters<typeof createTestFireflyService>[1] = {},
) {
  // ONE fake closed over the whole test (project memory: the bot calls
  // deps.firefly(settings) per update — an inline factory would reset state)
  const firefly = createTestFireflyService(fixtures, overrides)
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const requests = () => api.getOutgoingRequests()
  const sendWidgetRequest = () =>
    requests().find((r) => r.method === 'sendWidget') as
      | (OutgoingRequest & {
          payload: {
            html: string
            caption?: string
            chat_data?: string
            allow_queries?: boolean
          }
          resultMessageId?: number
        })
      | undefined
  const widget = async () => {
    await bot.handleUpdate(generateMessageUpdate('/widget', { isCommand: true }))
    const sent = sendWidgetRequest()
    if (!sent) throw new Error('sendWidget was not called')
    return sent
  }
  const tap = (data: string, messageId: number) =>
    bot.handleUpdate(generateWidgetQueryUpdate(data, { messageId }))
  const answers = () => requests().filter((r) => r.method === 'answerWidgetQuery')
  return { bot, requests, widget, tap, answers }
}

describe('reports widget', () => {
  it('/widget sends a querying widget with a valid ≤1024 B state and a caption', async () => {
    const { widget } = await setup()
    const sent = await widget()
    expect(sent.payload.allow_queries).toBe(true)
    expect(sent.payload.caption).toBeTypeOf('string')
    expect(sent.payload.html).toContain('TelegramWidget')
    const state = JSON.parse(sent.payload.chat_data!)
    expect(state.v).toBe('monthly')
    expect(state.d).toBe(dayjs().format('YYYY-MM'))
    expect(state.s).toEqual([['EUR', 4200, 2871.35]])
    // descending category cap, byte budget
    expect(state.c[0]).toEqual(['Groceries', 612.4])
    expect(Buffer.byteLength(sent.payload.chat_data!, 'utf8')).toBeLessThanOrEqual(1024)
  })

  it('caps categories at 8 so the state stays inside its byte budget', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `Cat ${i}`,
      currency: 'EUR',
      amount: 100 + i,
    }))
    const { widget } = await setup({ ...MONTH_FIXTURES, expenseByCategory: many })
    const sent = await widget()
    const state = JSON.parse(sent.payload.chat_data!)
    expect(state.c).toHaveLength(8)
    expect(state.c[0]).toEqual(['Cat 29', 129])
    expect(Buffer.byteLength(sent.payload.chat_data!, 'utf8')).toBeLessThanOrEqual(1024)
  })

  it('answers a view request with fresh data, then persists the state (in order)', async () => {
    const { requests, widget, tap, answers } = await setup()
    const sent = await widget()
    await tap(`v:trend@${dayjs().format('YYYY-MM')}`, sent.resultMessageId!)

    expect(answers()).toHaveLength(1)
    const answerPayload = answers()[0]!.payload as { widget_query_id: string; data?: string }
    const state = JSON.parse(answerPayload.data!)
    expect(state.v).toBe('trend')
    expect(state.m).toHaveLength(6) // fixed 6-month window
    expect(state.cur).toBe('EUR')

    const edit = requests().find((r) => r.method === 'editMessageWidgetData')
    expect(edit).toBeDefined()
    expect((edit!.payload as { chat_data?: string }).chat_data).toBe(answerPayload.data)
    // the guide's rule: answer first (instant redraw), commit the state after
    expect(requests().indexOf(answers()[0]!)).toBeLessThan(requests().indexOf(edit!))
  })

  it('answers with {e:…} when Firefly fails — never leaves a query unanswered', async () => {
    // break only the networth view (getNetWorth/listAccounts) so the monthly
    // /widget send itself still succeeds
    const { widget, tap, answers } = await setup(MONTH_FIXTURES, {
      getNetWorth: async () => {
        throw new Error('boom')
      },
    })
    const sent = await widget()
    await tap(`v:networth@${dayjs().format('YYYY-MM')}`, sent.resultMessageId!)
    expect(answers()).toHaveLength(1)
    expect((answers()[0]!.payload as { data?: string }).data).toContain('"e"')
  })

  it('answers garbage request data with an error payload', async () => {
    const { widget, tap, answers } = await setup()
    const sent = await widget()
    await tap('not-a-widget-payload', sent.resultMessageId!)
    expect(answers()).toHaveLength(1)
    expect((answers()[0]!.payload as { data?: string }).data).toContain('"e"')
  })

  it('trims per-currency rows when many currencies push the state over budget', async () => {
    const incomeTotals = Array.from({ length: 60 }, (_, i) => ({
      currency: `CUR${String(i).padStart(2, '0')}`,
      amount: 1000 + i,
    }))
    const expenseTotals = incomeTotals.map((t, i) => ({
      currency: t.currency,
      amount: -(500 + i),
    }))
    const { widget } = await setup({ ...MONTH_FIXTURES, incomeTotals, expenseTotals })
    const sent = await widget()
    const state = JSON.parse(sent.payload.chat_data!)
    expect(state.s.length).toBeLessThan(60) // trimmed, not capped upstream
    expect(Buffer.byteLength(sent.payload.chat_data!, 'utf8')).toBeLessThanOrEqual(1024)
  })

  it('caps list names so long Firefly names cannot bust the state budget', async () => {
    const { widget } = await setup({
      ...MONTH_FIXTURES,
      expenseByCategory: [{ name: 'N'.repeat(300), currency: 'EUR', amount: 100 }],
    })
    const sent = await widget()
    const state = JSON.parse(sent.payload.chat_data!)
    expect(state.c[0]![0]).toHaveLength(24)
    expect(Buffer.byteLength(sent.payload.chat_data!, 'utf8')).toBeLessThanOrEqual(1024)
  })

  it('refuses to send a widget whose html busts the size budget (huge fireflyUrl)', async () => {
    // random hex ≈ incompressible under zlib-9: a 10 KB URL clears the raw
    // budget but busts the 4096 B compressed one
    const fireflyUrl = `https://ff.example.com/${randomBytes(5200).toString('hex')}`
    const { bot } = createTestBot({
      settings: { ...CONFIGURED, fireflyUrl },
      firefly: createTestFireflyService(MONTH_FIXTURES),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/widget', { isCommand: true }))
    const methods = api.getOutgoingRequests().map((r) => r.method)
    expect(methods).not.toContain('sendWidget')
    expect(methods).toContain('sendMessage') // errorOccurred reply, not a Telegram rejection
  })

  it('answers a widget query even when the failure predates the reports feature', async () => {
    // errorHandler is the last line of defense for the 15 s answer rule —
    // unit-drive it with a widget_query update that blew up mid-middleware
    const answers: { method: string; payload: unknown }[] = []
    const replies: string[] = []
    const fakeCtx = {
      update: generateWidgetQueryUpdate('v:monthly@2026-01'),
      api: {
        raw: {
          answerWidgetQuery: async (p: unknown) => {
            answers.push({ method: 'answerWidgetQuery', payload: p })
            return { ok: true }
          },
        },
      },
      logger: { error: () => {}, warn: () => {}, debug: () => {} },
      reply: async (text: string) => {
        replies.push(text)
        return {}
      },
      i18n: { t: (key: string) => `t:${key}` },
    }
    await errorHandler({ ctx: fakeCtx, error: new Error('redis down') } as unknown as BotError<Context>)
    expect(answers).toHaveLength(1)
    expect((answers[0]!.payload as { data?: string }).data).toContain('"e"')
    expect(replies).toEqual(['t:common.errorOccurred'])
  })
})
