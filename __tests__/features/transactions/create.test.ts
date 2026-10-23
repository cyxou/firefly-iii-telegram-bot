import type { TxnDraft } from '#root/bot/context.js'
import { describe, expect, it } from 'vitest'
import { buildSplit, resolveDefaultAccounts } from '#root/bot/features/transactions/create.js'
import { TransactionTypeProperty } from '#root/lib/firefly/service.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import { createTestFireflyService, testAccount } from '../../helpers/bot.js'

const ACCOUNTS = [
  testAccount('1', 'Checking', { type: 'asset' }),
  testAccount('2', 'Cash wallet', { type: 'Cash account' }), // AccountTypeFilter.CashAccount, v1's discovery filter
  testAccount('3', 'Employer', { type: 'revenue' }),
  testAccount('4', 'Loan', { type: 'liability' }),
]

function draft(over: Partial<TxnDraft> = {}): TxnDraft {
  return {
    amount: '25',
    date: '2026-10-22T10:00:00.000Z',
    description: 'N/A',
    sourceAccount: { id: '1', name: 'Checking', type: 'asset' },
    destAccount: null,
    categoryId: null,
    ...over,
  }
}

describe('buildSplit', () => {
  it('explicit type wins; description defaults to N/A; category empty string (v1 parity)', () => {
    const split = buildSplit(draft(), TransactionTypeProperty.Withdrawal)
    expect(split.type).toBe(TransactionTypeProperty.Withdrawal)
    expect(split.description).toBe('N/A')
    expect(split.category_id).toBe('')
    expect(split.date).toBe('2026-10-22T10:00:00.000Z')
    expect(split.amount).toBe('25')
  })

  it('mimics Firefly type rules (v1 verbatim): asset→liability = withdrawal', () => {
    const split = buildSplit(draft({ destAccount: { id: '4', name: 'Loan', type: 'liability' } }))
    expect(split.type).toBe(TransactionTypeProperty.Withdrawal)
  })

  it('revenue or liability source = deposit', () => {
    expect(buildSplit(draft({ sourceAccount: { id: '3', name: 'Employer', type: 'revenue' } })).type)
      .toBe(TransactionTypeProperty.Deposit)
    expect(buildSplit(draft({ sourceAccount: { id: '4', name: 'Loan', type: 'liability' } })).type)
      .toBe(TransactionTypeProperty.Deposit)
  })

  it('asset on either side otherwise = transfer; foreign fields only then', () => {
    const split = buildSplit(draft({
      destAccount: { id: '2', name: 'Wallet', type: 'asset', currencyId: '5' },
      foreignAmount: '30',
    }))
    expect(split.type).toBe(TransactionTypeProperty.Transfer)
    expect(split.foreign_amount).toBe('30')
    expect(split.foreign_currency_id).toBe('5')
  })

  it('no foreign fields without foreignAmount', () => {
    const split = buildSplit(draft({ destAccount: { id: '2', name: 'Wallet', type: 'asset' } }))
    expect(split.foreign_amount).toBeUndefined()
    expect(split.foreign_currency_id).toBeUndefined()
  })

  it('fallback type is withdrawal', () => {
    expect(buildSplit(draft({
      sourceAccount: { id: '9', name: 'X', type: 'expense' },
      destAccount: { id: '8', name: 'Y', type: 'expense' },
    })).type).toBe(TransactionTypeProperty.Withdrawal)
  })
})

describe('resolveDefaultAccounts', () => {
  it('stored defaults win without API calls', async () => {
    const firefly = createTestFireflyService({ accounts: ACCOUNTS })
    const { source, destination } = await resolveDefaultAccounts(defaultSettings({
      defaultSourceAccount: { id: '1', type: 'asset', name: 'Checking' },
      defaultDestinationAccount: { id: '2', type: 'cash_account', name: 'Cash wallet' },
    }), firefly)
    expect(source).toMatchObject({ id: '1' })
    expect(destination).toMatchObject({ id: '2' })
  })

  it('falls back to first active asset / first cash account', async () => {
    const { source, destination } = await resolveDefaultAccounts(defaultSettings(), createTestFireflyService({ accounts: ACCOUNTS }))
    expect(source).toMatchObject({ id: '1' })
    expect(destination).toMatchObject({ id: '2' })
  })

  it('no asset accounts → source null (error path)', async () => {
    const { source } = await resolveDefaultAccounts(defaultSettings(), createTestFireflyService({
      accounts: [testAccount('2', 'Cash wallet', { type: 'Cash account' })],
    }))
    expect(source).toBeNull()
  })

  it('no cash account → destination null (quick mode sends destination_id undefined)', async () => {
    const { destination } = await resolveDefaultAccounts(defaultSettings(), createTestFireflyService({
      accounts: [testAccount('1', 'Checking', { type: 'asset' })],
    }))
    expect(destination).toBeNull()
  })
})
