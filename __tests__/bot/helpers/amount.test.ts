import { describe, expect, it } from 'vitest'
import { parseAmountInput, parseTransactionMessage } from '#root/bot/helpers/amount.js'

describe('parseAmountInput', () => {
  it('parses plain numbers', () => {
    expect(parseAmountInput('25')).toBe(25)
    expect(parseAmountInput('25.5')).toBe(25.5)
  })

  it('normalizes comma decimals before evaluating (v1 TODO, fixed)', () => {
    expect(parseAmountInput('2,5')).toBe(2.5)
    expect(parseAmountInput('1,5+1')).toBe(2.5)
  })

  it('evaluates arithmetic with precedence', () => {
    expect(parseAmountInput('10+5')).toBe(15)
    expect(parseAmountInput('2*3+1')).toBe(7)
    expect(parseAmountInput('10/4')).toBe(2.5)
    expect(parseAmountInput('2^3')).toBe(8)
    expect(parseAmountInput('2^3^2')).toBe(512) // ^ right-associative (mathjs parity)
  })

  it('returns the absolute value (v1 parity)', () => {
    expect(parseAmountInput('5-10')).toBe(5)
  })

  it('supports relative operations against oldAmount', () => {
    expect(parseAmountInput('*15', '10')).toBe(150)
    expect(parseAmountInput('+5', '10')).toBe(15)
    expect(parseAmountInput('-3', '10')).toBe(7)
  })

  it('rejects anything the v1 regex rejects', () => {
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('10 ** 5')).toBeNull()
    expect(parseAmountInput('')).toBeNull()
  })
})

describe('parseTransactionMessage', () => {
  it('amount-only text', () => {
    expect(parseTransactionMessage('25')).toEqual({ amount: '25' })
    expect(parseTransactionMessage('10+5')).toEqual({ amount: '10+5' })
  })

  it('description + amount (greedy description keeps inner numbers)', () => {
    expect(parseTransactionMessage('Groceries 25')).toEqual({
      amount: '25',
      description: 'Groceries',
    })
    expect(parseTransactionMessage('Café 3,5+1')).toEqual({ amount: '3,5+1', description: 'Café' })
    expect(parseTransactionMessage('a 1 b 2')).toEqual({ amount: '2', description: 'a 1 b' })
  })

  it('non-matching text', () => {
    expect(parseTransactionMessage('abc')).toBeNull()
    expect(parseTransactionMessage('25 abc')).toBeNull()
  })
})
