import type { RunnerHandle } from '@grammyjs/runner'
import process from 'node:process'
import { run } from '@grammyjs/runner'
import { createBot } from '#root/bot/index.js'
import { config } from '#root/config.js'
import { createFireflyService } from '#root/lib/firefly/service.js'
import { REDIS_URL, redis } from '#root/lib/redis.js'
import { createSessionStorage } from '#root/lib/session.js'
import { createFileSettingsStore } from '#root/lib/settings-store.js'
import { logger } from '#root/logger.js'

const SHUTDOWN_TIMEOUT_MS = 5000

async function main() {
  // Fail fast: a misconfigured REDIS_URL must crash at boot (loud), not fail
  // on every update after a deceptively healthy start. The 'error' listener
  // captures the real connection failure (ECONNREFUSED & friends) and keeps
  // ioredis from printing "[ioredis] Unhandled error event" console noise.
  let lastConnectionError: Error | undefined
  redis.on('error', (error) => {
    lastConnectionError = error
    logger.debug(error, 'Redis connection error')
  })
  try {
    await redis.ping()
  } catch (error) {
    // The ping rejects with an opaque MaxRetriesPerRequestError; the cause
    // above is what an operator actually needs to see.
    const cause = lastConnectionError?.message ?? (error as Error).message
    throw new Error(`Redis is unreachable at ${REDIS_URL} — ${cause}. Is Redis running?`, {
      cause: error,
    })
  }

  const bot = createBot(config.botToken, {
    config,
    logger,
    settingsStore: createFileSettingsStore('data/settings.json'),
    firefly: createFireflyService,
    sessionStorage: createSessionStorage(),
  })

  let runner: RunnerHandle | undefined
  onShutdown(async () => {
    logger.info('Shutdown')
    await runner?.stop()
  })

  await Promise.all([bot.init(), bot.api.deleteWebhook()])
  runner = run(bot)
  logger.info({ msg: 'Bot running', username: bot.botInfo.username })
}

main().catch((error) => {
  logger.error(error)
  process.exit(1)
})

function onShutdown(cleanUp: () => Promise<void>) {
  let isShuttingDown = false
  const handleShutdown = () => {
    if (isShuttingDown) return
    isShuttingDown = true
    setTimeout(() => {
      logger.warn('Graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    void cleanUp()
      .then(() => process.exit(0))
      .catch((error) => {
        logger.error(error)
        process.exit(1)
      })
  }
  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)
}
