import type { Middleware } from 'grammy'
import type { Context } from '#root/bot/context.js'
import type { Config } from '#root/config.js'

// Ported from legacy/src/index.ts:37-51 (v1 accessControl middleware).
export function accessControl(config: Config): Middleware<Context> {
  return async (ctx, next) => {
    if (config.allowedUserIds.length > 0 && (!ctx.from || !config.allowedUserIds.includes(ctx.from.id))) {
      if (!config.disableUnauthorizedUserLog) {
        const user = ctx.from
          ? `id=${ctx.from.id}${ctx.from.username ? `, username=@${ctx.from.username}` : ''}`
          : 'unknown user'
        ctx.logger.warn({ user }, 'Unauthorized access attempt')
      }
      return
    }
    await next()
  }
}
