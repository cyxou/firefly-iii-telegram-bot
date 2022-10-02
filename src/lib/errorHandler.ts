import Debug from 'debug'

import type { MyContext } from '../types/MyContext'

const debug = Debug(`bot:errorHandlers`)

export class AuthenticationError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class HostNotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'HostNotFoundError'
  }
}

export function handleCallbackQueryError(err: Error, ctx: MyContext) {
  const log = debug.extend('handleCallbackQueryError')

  if (!err) {
    log('No error to handle!')
    return
  }

  log('Unexpected error occured: %O', err)

  if (err instanceof HostNotFoundError) {
    return ctx.answerCallbackQuery({
      text: ctx.i18n.t('settings.connectionFailedBadUrl'),
      show_alert: true
    })
  }

  if (err instanceof AuthenticationError) {
    return ctx.answerCallbackQuery({
      text: ctx.i18n.t('settings.connectionFailedUnauthenticated'),
      show_alert: true
    })
  }

  return ctx.answerCallbackQuery({
    text: err.message,
    show_alert: true
  })
}
