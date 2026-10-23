import { describe, expect, it } from 'vitest'
import { createConfig } from '#root/config.js'

describe('createConfig', () => {
  it('parses a valid env map', () => {
    const c = createConfig({
      BOT_TOKEN: '123456:ABCdef',
      ALLOWED_TG_USER_IDS: '1, 22 ,333',
      DISABLE_UNAUTHORIZED_USER_LOG: 'true',
      REDIS_URL: 'redis://localhost:6380',
      FIREFLY_URL: 'https://ff.example.com',
    })
    expect(c.botToken).toBe('123456:ABCdef')
    expect(c.allowedUserIds).toEqual([1, 22, 333])
    expect(c.disableUnauthorizedUserLog).toBe(true)
    expect(c.redisUrl).toBe('redis://localhost:6380')
    expect(c.fireflyUrl).toBe('https://ff.example.com')
    expect(c.fireflyApiUrl).toBe('https://ff.example.com/api') // derived default
  })

  it('defaults: empty allowlist, no redis url override, env firefly blank', () => {
    const c = createConfig({ BOT_TOKEN: '123456:ABCdef' })
    expect(c.allowedUserIds).toEqual([])
    expect(c.disableUnauthorizedUserLog).toBe(false)
    expect(c.redisUrl).toBe('redis://localhost:6379')
    expect(c.fireflyUrl).toBe('')
  })

  it('rejects a malformed bot token', () => {
    expect(() => createConfig({ BOT_TOKEN: 'nope' })).toThrow()
  })
})
