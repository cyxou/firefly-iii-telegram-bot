import type { BotError } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { GrammyError, HttpError } from 'grammy'

export async function errorHandler(error: BotError<Context>) {
  const { ctx, error: err } = error
  ctx.logger.error(
    {
      err,
      update_id: ctx.update.update_id,
      kind: err instanceof GrammyError ? 'telegram' : err instanceof HttpError ? 'http' : 'unknown',
    },
    'Error while handling update',
  )
}
