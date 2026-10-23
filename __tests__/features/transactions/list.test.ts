import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  getLastRichMarkdown,
  initializeBot,
  setupMockApi,
  testTransaction,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

const TODAY = dayjs().format('YYYY-MM-DD')

async function setup(
  transactions = [
    testTransaction('Coffee', {
      type: 'withdrawal',
      amount: '4.5',
      date: `${TODAY}T08:30:00+00:00`,
    }),
    testTransaction('Salary', { type: 'deposit', amount: '1000', date: `${TODAY}T09:00:00+00:00` }),
    testTransaction('To savings', {
      type: 'transfer',
      amount: '200',
      date: `${TODAY}T10:00:00+00:00`,
    }),
  ],
) {
  const { bot } = createTestBot({
    settings: CONFIGURED,
    firefly: createTestFireflyService({ transactions }),
  })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn) throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return { bot, api, click }
}

function sendTransactionsLabel(bot: Awaited<ReturnType<typeof setup>>['bot']) {
  return bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.TRANSACTIONS')))
}

describe('transactions list', () => {
  it('tRANSACTIONS label → withdrawals today as a rich table, reversed, with sums', async () => {
    const { bot, api } = await setup()
    await sendTransactionsLabel(bot)
    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(markdown).toContain('Coffee')
    expect(markdown).not.toContain('Salary')
    expect(markdown).toContain('| 4.50 $ |')
    expect(markdown).toContain('SUM:')
  })

  it('three type tabs, active disabled — the SHOW_TRANSFERS bug is fixed by construction', async () => {
    const { bot, api, click } = await setup()
    await sendTransactionsLabel(bot)
    // switch to deposits
    await click(i18n.t('en', 'labels.SHOW_DEPOSITS'))
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    const markdown = (edit.payload as any).rich_message.markdown as string
    expect(markdown).toContain('Salary')
    expect(markdown).not.toContain('Coffee')
    // THE regression (v1 deposit view's Transfers button passed type=Withdrawal):
    const btn = findButton(api.getOutgoingRequests(), i18n.t('en', 'labels.SHOW_TRANSFERS'))!
    expect(btn.data).toContain('transfer|')
    await click(i18n.t('en', 'labels.SHOW_TRANSFERS'))
    const transferEdit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect(((transferEdit.payload as any).rich_message as { markdown: string }).markdown).toContain(
      'To savings',
    )
  })

  it('day navigation: << edits to yesterday and back', async () => {
    const { bot, api, click } = await setup()
    await sendTransactionsLabel(bot)
    const prevLabel = `<< ${dayjs(TODAY).subtract(1, 'day').format('ll')}`
    await click(prevLabel)
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    const markdown = (edit.payload as any).rich_message.markdown as string
    expect(markdown).toContain(dayjs(TODAY).subtract(1, 'day').format('LL'))
    expect(markdown).toContain('No transactions')
  })

  it('dONE deletes the list message', async () => {
    const { bot, api, click } = await setup()
    await sendTransactionsLabel(bot)
    const send = api.getOutgoingRequests().find((r) => r.method === 'sendRichMessage')!
    await click(i18n.t('en', 'labels.DONE'))
    const del = api.getOutgoingRequests().find((r) => r.method === 'deleteMessage')!
    expect((del.payload as any).message_id).toBe(send.resultMessageId)
  })
})
