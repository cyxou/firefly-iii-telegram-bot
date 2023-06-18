import debug from 'debug'

import i18n from './i18n'
import { command } from './constants'
import type { MyContext } from '../types/MyContext'

const rootLog = debug(`bot:mdlwr`)

// Add a method to delete the last user's message.
export function cleanup() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    const log = rootLog.extend(`cleanup`)
    log('Entered the cleanup middleware')

    // Do nothing in case if a message comes from a bot
    if (ctx.msg!.from!.is_bot) return next()

    const text = ctx.msg!.text || ''
    const keyboardCommandList = [
      i18n.t('ru', 'labels.SETTINGS'),
      i18n.t('ru', 'labels.TRANSACTIONS'),
      i18n.t('ru', 'labels.ACCOUNTS'),
      i18n.t('ru', 'labels.REPORTS'),
      i18n.t('ru', 'labels.CATEGORIES'),
      i18n.t('en', 'labels.SETTINGS'),
      i18n.t('en', 'labels.TRANSACTIONS'),
      i18n.t('en', 'labels.ACCOUNTS'),
      i18n.t('en', 'labels.REPORTS'),
      i18n.t('en', 'labels.CATEGORIES'),
      i18n.t('it', 'labels.SETTINGS'),
      i18n.t('it', 'labels.TRANSACTIONS'),
      i18n.t('it', 'labels.ACCOUNTS'),
      i18n.t('it', 'labels.REPORTS'),
      i18n.t('it', 'labels.CATEGORIES'),
    ]
    log('keyboardCommandList: %O', keyboardCommandList)
    log('keyboardCommandList.includes(text): %O', keyboardCommandList.includes(text))

    // Not interested in anything that is not a keyboard menu command
    if (!keyboardCommandList.includes(text)) return next()

    ctx.session.deleteKeyboardMenuMessage = (function(ctx: MyContext) {
      log('ctx.msg: %O', ctx.msg)
      const messageId = ctx.msg!.message_id
      log('messageId: %O', messageId)
      const chatId = ctx.msg!.chat.id
      log('chatId: %O', chatId)
      return async function() {
        log('chatId: %O', chatId)
        log('messageId: %O', messageId)
        return ctx.api.deleteMessage(chatId, messageId)
      }
    })(ctx)
    return next()
  }
}
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
        i18n.t('it', 'labels.SETTINGS'),
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

      const { fireflyAccessToken, fireflyUrl } = ctx.session.userSettings
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
