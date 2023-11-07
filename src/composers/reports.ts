import { Composer } from 'grammy'
import i18n, { locales } from '../lib/i18n'

import type { MyContext } from '../types/MyContext'

// const rootLog = debug(`bot:reports`)

const bot = new Composer<MyContext>()

for (const locale of locales) {
  bot.hears(i18n.t(locale, 'labels.REPORTS'), reportsHandler)
}

async function reportsHandler(ctx: MyContext) {
  await ctx.reply(ctx.i18n.t('reports.notImplemented'), { parse_mode: 'Markdown' })
}

export default bot
