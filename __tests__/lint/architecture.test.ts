import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : []
  })
}

const src = walk('src')

describe('architecture rules', () => {
  it('menus only via @grammyjs/menu — no raw InlineKeyboard/callbackQuery/vm', () => {
    for (const file of src) {
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toMatch(/new InlineKeyboard\b/)
      expect(content, file).not.toMatch(/\.callbackQuery\(/)
      expect(content, file).not.toMatch(/from 'node:vm'/)
    }
  })

  it('generated firefly client is only imported inside lib/firefly', () => {
    for (const file of src) {
      if (file.includes(path.join('lib', 'firefly'))) continue
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toMatch(/#root\/lib\/firefly\/(api|generated)/)
      expect(content, file).not.toMatch(/from '\..*\/(api|generated)\//)
    }
  })

  it('sessionData never grows a shared step field', () => {
    const content = readFileSync('src/bot/context.ts', 'utf8')
    // The rule targets a SHARED step directly on SessionData. Per-flow step
    // discriminators (settingsFlow/categoryFlow/txnFlow — inline or in a named
    // flow interface) are the sanctioned Router-keying pattern.
    const sessionData = content.match(/export interface SessionData \{[\s\S]*?\n\}/)![0]
    expect(sessionData).not.toMatch(/^\s{2}step\??:/m)
  })

  it('no cleanupSessionData and no @grammyjs/conversations', () => {
    for (const file of src) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('cleanupSessionData')
      expect(readFileSync(file, 'utf8'), file).not.toContain('@grammyjs/conversations')
    }
    expect(readFileSync('package.json', 'utf8')).not.toContain('@grammyjs/conversations')
  })
})
