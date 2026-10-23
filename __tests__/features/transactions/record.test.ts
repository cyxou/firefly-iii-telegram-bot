import type { TransactionRead } from '#root/lib/firefly/service.js'
import { describe, expect, it } from 'vitest'
import { formatTransaction } from '#root/bot/features/transactions/record.js'
import { i18n } from '#root/bot/i18n.js'

const t = (key: string, params?: Record<string, unknown>) => i18n.t('en', key, params as never)

function txn(split: Record<string, unknown>): TransactionRead {
  return {
    id: '19',
    type: 'transaction',
    attributes: {
      transactions: [split],
    },
  } as unknown as TransactionRead
}

describe('formatTransaction', () => {
  it('withdrawal message with category', () => {
    const text = formatTransaction(
      txn({
        type: 'withdrawal',
        amount: '25',
        currency_symbol: '$',
        date: '2026-10-22T10:00:00+00:00',
        source_name: 'Checking',
        destination_name: 'Cash wallet',
        description: 'Groceries',
        category_name: 'Food',
      }),
      t,
    )
    expect(text).toContain('Groceries')
    expect(text).toContain('25')
    expect(text).toContain('Checking → Cash wallet')
    expect(text).toContain('Food')
  })

  it('escapes user values (legacy Markdown): underscore in description must not break entities', () => {
    const text = formatTransaction(
      txn({
        type: 'withdrawal',
        amount: '1',
        currency_symbol: '$',
        date: '2026-10-22T10:00:00+00:00',
        source_name: 'A_B',
        destination_name: 'C',
        description: 'snake_case',
        category_name: undefined,
      }),
      t,
    )
    expect(text).toContain('snake\\_case')
    expect(text).toContain('A\\_B')
  })

  it('n/A description renders empty bold (v1 template branch)', () => {
    const text = formatTransaction(
      txn({
        type: 'deposit',
        amount: '5',
        currency_symbol: '$',
        date: '2026-10-22T10:00:00+00:00',
        source_name: 'Employer',
        destination_name: 'Checking',
        description: 'N/A',
      }),
      t,
    )
    expect(text).toContain('Checking')
    expect(text).not.toContain('N/A')
  })

  it('transfer message with foreign amount', () => {
    const text = formatTransaction(
      txn({
        type: 'transfer',
        amount: '100',
        currency_symbol: '$',
        date: '2026-10-22T10:00:00+00:00',
        source_name: 'Checking',
        destination_name: 'EUR wallet',
        description: 'N/A',
        foreign_amount: '92',
        foreign_currency_symbol: '€',
      }),
      t,
    )
    expect(text).toContain('92')
    expect(text).toContain('€')
  })
})
