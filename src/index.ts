import { Composer, Markup, Scenes, session, Telegraf } from 'telegraf'
import * as dotenv from 'dotenv';
import dayjs from 'dayjs'
import 'dayjs/locale/ru'

dayjs.locale('ru')

dotenv.config();

import config from './config'
import firefly from './lib/firefly'
import bot from './lib/bot'

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
