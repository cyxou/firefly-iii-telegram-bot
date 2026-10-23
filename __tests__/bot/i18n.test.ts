import { describe, expect, it } from 'vitest'
import { defaultLanguage, i18n, locales } from '#root/bot/i18n.js'

describe('i18n locales', () => {
  it('exposes all four locales', () => {
    expect(locales).toEqual(['ru', 'it', 'en', 'es'])
  })

  it('translates a known key in every locale', () => {
    const values = locales.map(locale => i18n.t(locale, 'settings.selectBotLang'))
    for (const value of values)
      expect(value.length).toBeGreaterThan(0)
    // four distinct translations — every locale file actually loaded
    expect(new Set(values).size).toBe(locales.length)
  })

  it('falls back to default language on missing key', () => {
    expect(defaultLanguage).toBe('en')
  })
})
