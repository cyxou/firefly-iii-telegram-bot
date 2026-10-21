import process from 'node:process'
import { createBot } from '#root/bot/index.js'
import { config } from '#root/config.js'
import { logger } from '#root/logger.js'
import { createFireflyService } from '#root/lib/firefly/service.js'
import { createFileSettingsStore } from '#root/lib/settings-store.js'
import { createSessionStorage } from '#root/lib/session.js'
import { run, type RunnerHandle } from '@grammyjs/runner'

const SHUTDOWN_TIMEOUT_MS = 5000

try {
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
catch (error) {
  logger.error(error)
  process.exit(1)
}

function onShutdown(cleanUp: () => Promise<void>) {
  let isShuttingDown = false
  const handleShutdown = () => {
    if (isShuttingDown)
      return
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
