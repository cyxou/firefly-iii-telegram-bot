import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import {
  decodeViewPayload,
  encodeDatePayload,
  encodeViewPayload,
  leadingBlanks,
} from '#root/lib/date-picker/index.js'

describe('date picker codec', () => {
  it('month payloads round-trip', () => {
    const raw = encodeViewPayload('19', { mode: 'month', year: 2026, month: 9 })
    expect(raw).toBe('19|m|2026-10')
    expect(decodeViewPayload(raw)).toEqual({
      trId: '19',
      view: { mode: 'month', year: 2026, month: 9 },
    })
  })

  it('year payloads round-trip and keep the month', () => {
    const raw = encodeViewPayload('19', { mode: 'year', year: 2026, month: 9 })
    expect(raw).toBe('19|y|2026-9')
    expect(decodeViewPayload(raw)).toEqual({
      trId: '19',
      view: { mode: 'year', year: 2026, month: 9 },
    })
  })

  it('date payload encodes', () => {
    expect(encodeDatePayload('19', '2026-10-22')).toBe('19|d|2026-10-22')
  })

  it('garbage and foreign payloads decode to null', () => {
    expect(decodeViewPayload('')).toBeNull()
    expect(decodeViewPayload('19|x|2026-10')).toBeNull()
    expect(decodeViewPayload('19|m|2026-13')).toBeNull() // month out of range
    expect(decodeViewPayload('19|m|nan-10')).toBeNull()
  })

  it('payloads stay under the 64-byte callback budget with a 20-char id', () => {
    const trId = '12345678901234567890'
    expect(encodeViewPayload(trId, { mode: 'month', year: 2026, month: 9 }).length).toBeLessThan(35)
    expect(encodeDatePayload(trId, '2026-10-22').length).toBeLessThan(35)
  })
})

describe('leadingBlanks (Monday-first, v1 startWeekDay=1)', () => {
  it('known months: Jan 2026 Thu→3, Jun 2026 Mon→0, Nov 2026 Sun→6, Dec 2026 Tue→1', () => {
    expect(leadingBlanks(2026, 0)).toBe(3)
    expect(leadingBlanks(2026, 5)).toBe(0)
    expect(leadingBlanks(2026, 10)).toBe(6)
    expect(leadingBlanks(2026, 11)).toBe(1)
  })

  it('agrees with dayjs across a full year', () => {
    for (let month = 0; month < 12; month++) {
      const day = dayjs().year(2027).month(month).date(1).day()
      expect(leadingBlanks(2027, month)).toBe((day + 6) % 7)
    }
  })
})
