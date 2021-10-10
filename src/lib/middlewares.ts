import debug from 'debug'

import {
  // textToSceneMap as t2s,
  scene as c,
  keyboardButton as b,
  text as t,
  command
} from './constants'
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
      const whiteList = [ b.SETTINGS, ...Object.values(command) ]
      log('whiteList: %O', whiteList)
      const isCallbackQuery = !!ctx.callbackQuery
      log('isCallbackQuery: %O', isCallbackQuery)
      log('whiteList.includes(text): %O', whiteList.includes(text.replace(/^\//, '')))

      // We need to watch out for the keyboard commands a users clicks on:
      if (whiteList.includes(text)) return next()

      if (isCallbackQuery || ctx.session.settingsStep !== 'idle') {
        log('Exiting the middleware...')
        return next()
      }

      const userId = ctx.from!.id
      const { fireflyAccessToken, fireflyUrl } = getUserStorage(userId)
      log('fireflyAccessToken: %O', fireflyAccessToken)
      log('fireflyUrl: %O', fireflyUrl)

      if (!fireflyUrl || !fireflyAccessToken) {
        log('Replying with a message...')
        return await ctx.reply(t.addUrlAndAccessToken, {
          parse_mode: 'Markdown'
        })
      }

      return next()
    } catch (err) {
      console.error('Error occurred in requireSettings: ', err)
    }
  }
}

function handleBotActionsFromKeyboard(ctx: MyContext) {
  const log = rootLog.extend('handleBotActionsFromKeyboard')
  log('Entered handleBotActionsFromKeyboard function')
  log('ctx: %O', ctx)
  const text = ctx.msg!.text || ''
  // const scene = t2s.get(text)
  // log('scene: %O', scene)

  // if (scene) {
    // log('Moving to scene: ', t2s.get(text))
    // ctx.scene.enter(scene)
  // }
}
