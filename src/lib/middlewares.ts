import debug from 'debug'

import {
  textToSceneMap as t2s,
  scene as c,
  keyboardButton as b,
  text as t,
  command
} from './constants'
import { getUserStorage, getDataFromUserStorage } from './storage'
import { MyContext } from './bot'

const rootLog = debug(`bot:mdlwr`)

export function setUserIdToSceneSession() {
  return async (ctx: any, next: () => Promise<void>) => {
    const log = rootLog.extend('setUserIdToSceneSession')
    // log('ctx: %O', ctx)
    const userId: number = ctx.update.message?.from?.id || ctx.update.callback_query?.from?.id
    log('userId: %O', userId)

    ctx.userId = userId

    return next()
  }
}

export function requireSettings() {
  return async (ctx: any, next: () => Promise<void>) => {
    const log = rootLog.extend(`requireSettings`)
    log('Entered the requireSettings middleware')
    // log('ctx: %O', ctx)
    log('ctx.update.message: %O', ctx.update.message)
    try {
      const text = ctx.update?.message?.text
      log('text: %O', text)
      log('ctx.scene?.session?: %O', ctx.scene?.session)
      // We allow only the commands routes to enter if Firefly URL or Firefly
      // Token are not set
      const whiteList = [ b.SETTINGS, ...Object.values(command) ]
      log('whiteList: %O', whiteList)
      const isCallbackQuery = !!ctx.callbackQuery
      log('isCallbackQuery: %O', isCallbackQuery)
      log('whiteList.includes(text): %O', whiteList.includes(text))

      // We need to watch out for the keyboard commands a users clicks on:
      if (whiteList.includes(text)) return handleBotActionsFromKeyboard(ctx)

      if (isCallbackQuery || ctx.scene?.session?.inputFor) {
        log('Exiting the middleware...')
        return next()
      }

      const userId = ctx.message!.from.id
      const { fireflyAccessToken, fireflyUrl } = getDataFromUserStorage(userId)
      log('fireflyAccessToken: %O', fireflyAccessToken)
      log('fireflyUrl: %O', fireflyUrl)

      if (!fireflyUrl || !fireflyAccessToken) {
        log('Replying with a message...')
        return await ctx.replyWithMarkdown(t.addUrlAndAccessToken)
      }

      return next()
    } catch (err) {
      console.error('Error occurred in requireSettings: ', err)
    }
  }
}

function handleBotActionsFromKeyboard(ctx: any) {
  const log = rootLog.extend('handleBotActionsFromKeyboard')
  log('Entered handleBotActionsFromKeyboard function')
  const text = ctx.message.text
  const scene = t2s.get(text)
  log('scene: %O', scene)

  if (scene) {
    log('Moving to scene: ', t2s.get(text))
    ctx.scene.enter(scene)
  }
}
