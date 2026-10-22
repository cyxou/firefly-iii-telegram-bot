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
