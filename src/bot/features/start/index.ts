import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { command } from '#root/bot/constants.js'
import { createMainKeyboard, generateWelcomeMessage } from '#root/bot/helpers/keyboard.js'

// Ported from legacy/src/index.ts startHandler/helpHandler/setBotCommands.
export const startFeature = new Composer<Context>()

startFeature.command(command.START, async (ctx) => {
  await setBotCommands(ctx)
  return ctx.reply(generateWelcomeMessage(ctx), {
    parse_mode: 'Markdown',
    reply_markup: createMainKeyboard(ctx),
  })
})

startFeature.command(command.HELP, ctx =>
  ctx.reply(ctx.i18n.t('help'), { parse_mode: 'Markdown', reply_markup: createMainKeyboard(ctx) }))

function setBotCommands(ctx: Context) {
  return ctx.api.setMyCommands(Object.values(command).map(c => ({
    command: c,
    description: ctx.i18n.t(`commands.${c}`),
  })))
}
