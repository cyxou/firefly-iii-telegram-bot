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
  testAccount,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function setup() {
  const { bot } = createTestBot({
    settings: CONFIGURED,
    firefly: createTestFireflyService({
      accounts: [
        testAccount('1', 'Checking', {
          balance: '1234.5',
          currencySymbol: 'USD',
          decimalPlaces: 2,
        }),
        testAccount('2', 'Savings', {
          balance: '980.004',
          currencySymbol: 'USD',
          decimalPlaces: 2,
        }),
        testAccount('3', 'Cash', { balance: '55.2', currencySymbol: 'EUR', decimalPlaces: 2 }),
        testAccount('4', 'Hidden', { active: false }),
        testAccount('5', 'Wallet', { type: 'expense', balance: '10', currencySymbol: 'USD' }),
      ],
    }),
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

describe('accounts feature', () => {
  it('renders the asset list as a rich table with per-currency sums', async () => {
    const { bot, api } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find((r) => r.method === 'sendRichMessage')!
    expect(send).toBeDefined()
    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(markdown).toContain('| Checking | 1234.50 | USD |')
    expect(markdown).toContain('| Cash | 55.20 | EUR |')
    expect(markdown).not.toContain('Hidden') // inactive accounts filtered (service parity)
    expect(markdown).not.toContain('Wallet') // expense account not in the asset view
    expect(markdown).toContain('SUM:')
    // blank-line-before-table is enforced globally by the harness validator
    // (rich-validate.ts + setup afterEach) — no per-test assertion needed
  })

  it('sums use the v1 running-ceil quirk (USD 1234.5 + 980.004 → 2216)', async () => {
    const { bot, api } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    // ceil applied to the RUNNING sum after each addition: ceil(1234.5)=1235, ceil(1235+980.004)=2216
    expect(markdown).toContain('2216 USD')
    expect(markdown).toContain('56 EUR') // ceil(55.2)
  })

  it('shows all four tabs with the active one disabled, and switching edits the message', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find((r) => r.method === 'sendRichMessage')!
    const keyboard = (send.payload as any).reply_markup.inline_keyboard.flat() as any[]
    const assetButton = keyboard.find((b) => b.text === i18n.t('en', 'accounts.labels.asset'))
    // Bot API disabled flag is an empty OBJECT (DisabledButton), not `true`
    expect(typeof assetButton?.disabled).toBe('object')

    await click(i18n.t('en', 'accounts.labels.expense'))
    const edit = api
      .getOutgoingRequests()
      .filter((r) => r.method === 'editMessageText')
      .at(-1)!
    expect((edit.payload as any).rich_message?.markdown).toContain('Wallet')
    const editKeyboard = (edit.payload as any).reply_markup.inline_keyboard.flat() as any[]
    expect(
      typeof editKeyboard.find((b: any) => b.text === i18n.t('en', 'accounts.labels.expense'))
        ?.disabled,
    ).toBe('object')
    expect(
      editKeyboard.find((b: any) => b.text === i18n.t('en', 'accounts.labels.asset'))
        ?.callback_data,
    ).toBeDefined()
  })

  it('done deletes the list message', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find((r) => r.method === 'sendRichMessage')!
    await click(i18n.t('en', 'labels.DONE'))
    const del = api.getOutgoingRequests().find((r) => r.method === 'deleteMessage')!
    expect(del).toBeDefined()
    expect((del.payload as any).message_id).toBe(send.resultMessageId)
  })
})
