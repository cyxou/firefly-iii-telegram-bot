import { Composer, Markup, Scenes, session, Telegraf } from 'telegraf'
import * as dotenv from 'dotenv';

dotenv.config();

import config from './config'
import firefly from './lib/firefly'
import bot from './lib/bot'

bot.start((ctx) => ctx.reply('Welcome'))
bot.help((ctx) => ctx.reply('Send me a sticker'))
bot.on('sticker', (ctx) => ctx.reply('👍'))

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
