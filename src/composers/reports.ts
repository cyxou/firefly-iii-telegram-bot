import { Composer } from 'grammy'
import i18n from '../lib/i18n'

import type { MyContext } from '../types/MyContext'

// const rootLog = debug(`bot:reports`)

const bot = new Composer<MyContext>()

bot.hears(i18n.t('en', 'labels.REPORTS'), reportsHandler)
bot.hears(i18n.t('ru', 'labels.REPORTS'), reportsHandler)
bot.hears(i18n.t('it', 'labels.REPORTS'), reportsHandler)

async function reportsHandler(ctx: MyContext) {
  await ctx.reply(ctx.i18n.t('reports.notImplemented'), { parse_mode: 'Markdown' })
}

export default bot
