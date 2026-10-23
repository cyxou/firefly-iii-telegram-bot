// E2E: pin the shared Redis client to the ephemeral test container
// (compose.tests.yaml, port 6380) and flush it before every file.
import { afterEach } from 'vitest'
import { expectNoRichViolations } from '../helpers/rich-validate.js'

process.env.REDIS_URL = 'redis://localhost:6380'
process.env.BOT_TOKEN ??= '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'

export {} // top-level await requires a module

afterEach(() => {
  expectNoRichViolations()
})

try {
  const { redis } = await import('#root/lib/redis.js')
  await redis.connect()
  await redis.flushdb()
} catch {
  // No Redis available — session-dependent e2e tests self-skip
}
