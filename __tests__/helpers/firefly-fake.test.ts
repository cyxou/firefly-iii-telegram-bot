import { describe, expect, it } from 'vitest'
import { createTestFireflyService, testAccount, testCategory } from './bot.js'

const SPLIT = {
  type: 'withdrawal',
  date: '2026-10-22T10:00:00+00:00',
  description: 'Groceries',
  source_id: '1',
  amount: '25',
} as never

describe('createTestFireflyService transactions (fake parity for Phase 4)', () => {
  it('get returns the stored transaction; 404s when missing', async () => {
    const firefly = createTestFireflyService({
      accounts: [testAccount('1', 'Checking', { type: 'asset' })],
    })
    const created = await firefly.storeTransaction(SPLIT)
    const got = await firefly.getTransaction(created.id)
    expect(got.attributes.transactions![0]!.description).toBe('Groceries')
    await expect(firefly.getTransaction('nope')).rejects.toThrow()
  })

  it('update overlays the change, keeps untouched fields, re-resolves names', async () => {
    const firefly = createTestFireflyService({
      accounts: [testAccount('1', 'Checking', { type: 'asset' })],
      categories: [testCategory('9', 'Food')],
    })
    const created = await firefly.storeTransaction(SPLIT)
    const updated = await firefly.updateTransaction(created.id, { amount: '30', category_id: '9' })
    const split = updated.attributes.transactions![0]!
    expect(split.amount).toBe('30')
    expect(split.category_id).toBe('9')
    expect(split.category_name).toBe('Food')
    expect(split.description).toBe('Groceries') // untouched field survives
    expect(split.source_name).toBe('Checking') // names re-resolved like the real API
  })

  it('delete removes the transaction', async () => {
    const firefly = createTestFireflyService({ transactions: [] })
    const created = await firefly.storeTransaction(SPLIT)
    await firefly.deleteTransaction(created.id)
    await expect(firefly.getTransaction(created.id)).rejects.toThrow()
  })
})

describe('createTestFireflyService insights (fake parity for Phase 5)', () => {
  it('returns fixture-backed totals and category breakdown', async () => {
    const firefly = createTestFireflyService({
      incomeTotals: [{ currency: 'EUR', amount: 4200 }],
      expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
      expenseByCategory: [
        { name: 'Groceries', currency: 'EUR', amount: 612.4 },
        { name: 'Rent', currency: 'EUR', amount: 550 },
      ],
    })
    expect(await firefly.insightIncomeTotal('2026-10-01', '2026-10-31')).toEqual([{ currency: 'EUR', amount: 4200 }])
    expect(await firefly.insightExpenseTotal('2026-10-01', '2026-10-31')).toEqual([{ currency: 'EUR', amount: -2871.35 }])
    expect(await firefly.insightExpenseByCategory('2026-10-01', '2026-10-31')).toEqual([
      { name: 'Groceries', currency: 'EUR', amount: 612.4 },
      { name: 'Rent', currency: 'EUR', amount: 550 },
    ])
  })

  it('defaults to empty arrays when no fixtures given', async () => {
    const firefly = createTestFireflyService()
    expect(await firefly.insightIncomeTotal('s', 'e')).toEqual([])
    expect(await firefly.insightExpenseTotal('s', 'e')).toEqual([])
    expect(await firefly.insightExpenseByCategory('s', 'e')).toEqual([])
  })

  it('id-scoped category insight still works under its new name', async () => {
    const firefly = createTestFireflyService({
      categoryInsights: { 7: [{ currency: 'USD', difference: -45.3 }] },
    })
    expect(await firefly.insightExpenseForCategory('s', 'e', 7)).toEqual([{ currency: 'USD', difference: -45.3 }])
  })
})
