import axios from 'axios'
import { describe, expect, it } from 'vitest'
import { createFireflyClients } from '#root/lib/firefly/client.js'

describe('createFireflyClients', () => {
  it('returns the same instance for identical settings', () => {
    const a = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok' })
    const b = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok' })
    expect(a).toBe(b)
  })

  it('returns a new instance for different credentials', () => {
    const a = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok' })
    const b = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'other' })
    expect(a).not.toBe(b)
  })

  it('never accumulates global response interceptors', () => {
    // axios keeps `handlers` runtime-private — reach through the cast.
    // Earlier tests in this file may already have triggered the once-guard,
    // so the invariant is "at most one registration, no accumulation".
    const handlerCount = () => (axios.interceptors.response as any).handlers.length
    const before = handlerCount()
    createFireflyClients({ fireflyApiUrl: 'https://x/api', fireflyAccessToken: 't1' })
    const mid = handlerCount()
    expect(mid - before).toBeLessThanOrEqual(1)
    createFireflyClients({ fireflyApiUrl: 'https://x/api', fireflyAccessToken: 't2' })
    createFireflyClients({ fireflyApiUrl: 'https://x/api', fireflyAccessToken: 't3' })
    expect(handlerCount()).toBe(mid)
  })

  it('wires the Insight api', () => {
    const clients = createFireflyClients({
      fireflyApiUrl: 'https://ff/api',
      fireflyAccessToken: 'tok-insight',
    })
    expect(typeof clients.Insight.insightExpenseCategory).toBe('function')
  })
})
