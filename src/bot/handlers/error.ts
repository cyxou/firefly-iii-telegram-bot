import type { BotError } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { GrammyError, HttpError } from 'grammy'
import { answerWidgetQuery, widgetQueryOf } from '#root/bot/helpers/widget-api.js'

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
  // A widget_query must be answered within 15 s no matter what (widget-api
  // rule) — an error above the reports feature would otherwise leave the
  // widget to time out instead of showing our error label. Best-effort: the
  // failing path may have answered already. Done first: its deadline is
  // tighter than the chat reply's.
  const query = widgetQueryOf(ctx.update)
  if (query) {
    try {
      await answerWidgetQuery(ctx.api, query.id, JSON.stringify({ e: 'error' }))
    } catch {
      // answered upstream, or Telegram already gave up — nothing to do
    }
  }
  // v1 told the user something went wrong; silence makes breakage look like a dead bot
  // (the Markdown-400 bug was invisible for exactly this reason). Guarded: the reply
  // itself can fail (or i18n may not be attached if the error predates that middleware).
  try {
    await ctx.reply(ctx.i18n.t('common.errorOccurred'))
  } catch {
    // logged above — nothing further to do
  }
}
