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

export class BadRequestError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'BadRequestError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'ResourceNotFoundError'
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
    return ctx.reply(ctx.i18n.t('settings.connectionFailedBadUrl'), { parse_mode: 'Markdown'})
  }

  if (err instanceof AuthenticationError) {
    return ctx.reply(ctx.i18n.t('settings.connectionFailedUnauthenticated'))
  }

  if (err instanceof ResourceNotFoundError) {
    // can happen when manipulatin settings, or other entities
    if (!ctx.match) return ctx.reply(ctx.i18n.t('settings.resourceNotFound'))
    // Usually may happen when editing a transaction that got deleted
    return ctx.reply(ctx.i18n.t('transactions.edit.noSuchTransactionAnymore', {id : ctx.match![1]}))
  }

  if (err instanceof BadRequestError) {
    return ctx.reply(err.message)
  }

  return ctx.answerCallbackQuery({
    text: err.message,
    show_alert: true
  })
}
