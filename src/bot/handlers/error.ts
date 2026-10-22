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
  // v1 told the user something went wrong; silence makes breakage look like a dead bot
  // (the Markdown-400 bug was invisible for exactly this reason). Guarded: the reply
  // itself can fail (or i18n may not be attached if the error predates that middleware).
  try {
    await ctx.reply(ctx.i18n.t('common.errorOccurred'))
  }
  catch {
    // logged above — nothing further to do
  }
}
