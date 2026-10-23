import type { Middleware, Transformer } from 'grammy'
// Ported from ~/code/rukevich/bot — debug-level tracing of every update,
// every Bot API call it makes, and elapsed time. ctx.api is a fresh per-update
// Api instance, so the transformer is naturally scoped to this update.
import type { Context } from '#root/bot/context.js'
import { performance } from 'node:perf_hooks'

export function updateLogger(): Middleware<Context> {
  return async (ctx, next) => {
    const transformer: Transformer = (previous, method, payload, signal) => {
      ctx.logger.debug({ msg: 'Bot API call', method, payload })
      return previous(method, payload, signal)
    }
    ctx.api.config.use(transformer)

    const { update_id, ...update } = ctx.update
    ctx.logger.debug({ msg: 'Update received', update })

    const startTime = performance.now()
    try {
      await next()
    } finally {
      ctx.logger.debug({ msg: 'Update processed', elapsed: performance.now() - startTime })
    }
  }
}
