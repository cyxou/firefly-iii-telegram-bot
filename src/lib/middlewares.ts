import debug from 'debug'
import path from 'path'

import i18n from './i18n'
import { command } from './constants'
import { getUserStorage } from './storage'
import type { MyContext } from '../types/MyContext'

const rootLog = debug(`bot:mdlwr`)

export function requireSettings() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    const log = rootLog.extend(`requireSettings`)
    log('Entered the requireSettings middleware')
    // log('ctx: %O', ctx)
    log('ctx.update.message: %O', ctx.update.message)
    try {
      const text = ctx.msg!.text?.replace('/', '') || ''
      log('text: %O', text)
      // We allow only the commands routes to enter if Firefly URL or Firefly
      // Token are not set
      const whiteList = [
        i18n.t('ru', 'labels.SETTINGS'),
        i18n.t('en', 'labels.SETTINGS'),
        ...Object.values(command)
      ]
      log('whiteList: %O', whiteList)
      const isCallbackQuery = !!ctx.callbackQuery
      log('isCallbackQuery: %O', isCallbackQuery)
      log('whiteList.includes(text): %O', whiteList.includes(text.replace(/^\//, '')))

      // We need to watch out for the keyboard commands a users clicks on:
      if (whiteList.includes(text)) return next()

      if (isCallbackQuery || ctx.session.step !== 'IDLE') {
        log('Exiting the middleware...')
        return next()
      }

      const userId = ctx.from!.id
      const { fireflyAccessToken, fireflyUrl } = getUserStorage(userId)
      log('fireflyAccessToken: %O', fireflyAccessToken)
      log('fireflyUrl: %O', fireflyUrl)

      if (!fireflyUrl) {
        log('Replying with a message...')
        return await ctx.reply(ctx.i18n.t('mdlwr.noFireflyURLFound'), {
          parse_mode: 'Markdown'
        })
      }

      if (!fireflyAccessToken) {
        log('Replying with a message...')
        return await ctx.reply(ctx.i18n.t('mdlwr.noFireflyAccessTokenFound'), {
          parse_mode: 'Markdown'
        })
      }

      return next()
    } catch (err) {
      console.error('Error occurred in requireSettings: ', err)
    }
  }
}
