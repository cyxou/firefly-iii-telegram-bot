import debug from 'debug'
import { Composer } from 'grammy'
import { Router } from "@grammyjs/router"

import type { MyContext } from '../../types/MyContext'
import {
  parseAmountInput,
  formatTransaction,
  cleanupSessionData,
} from '../helpers'

import firefly from '../../lib/firefly'
import { transactionRecordMenu } from './add-transactions-menus'
import { handleCallbackQueryError } from '../../lib/errorHandler'

export enum Route {
  CHANGE_AMOUNT      = 'EDIT_TRANSACTION|AMOUNT',
  CHANGE_DESCRIPTION = 'EDIT_TRANSACTION|DESCRIPTION'
}

const rootLog = debug('bot:transactions:edit')

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

// Common for all transaction types

router.route(Route.CHANGE_AMOUNT, changeAmountRouteHandler)
router.route(Route.CHANGE_DESCRIPTION, changeDescriptionRouteHandler)

bot.use(router)

export default bot

async function changeAmountRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('changeAmountRouteHandler')
  log('Entered change amount route handler')
  try {
    const userSettings = ctx.session.userSettings
    log('ctx.session: %O', ctx.session)
    const text = ctx.msg?.text || ''

    log('ctx.message: %O', ctx.message)
    log('ctx.update: %O', ctx.update)

    if (!ctx.session.currentTransaction) throw new Error('No current transaction in session data!')

    const currentAmount = ctx.session.currentTransaction.attributes?.transactions[0].amount
    const amount = parseAmountInput(text, currentAmount)
    log('amount: %O', amount)
    
    const tr = ctx.session.currentTransaction
    log('tr.id: %O', tr.id)
    const update = {
      transactions: [{
        source_id: tr.attributes?.transactions[0].source_id,
        destination_id: tr.attributes?.transactions[0].destination_id,
        amount: amount?.toString()
      }]
    }
    
    if (!amount) {
      log('Bad amount supplied...')
      return ctx.reply(ctx.i18n.t('transactions.edit.badAmountTyped'))
    }

    log('Updating transaction...')
    const updatedTr = (await firefly(userSettings).Transactions.updateTransaction( tr.id!, update)).data.data
    
    if (ctx.session.deleteBotsMessage?.messageId) {
      log('Deleting original message...')
      await ctx.api.deleteMessage(ctx.session.deleteBotsMessage.chatId!, ctx.session.deleteBotsMessage.messageId)
    }

    // Cleanup session
    cleanupSessionData(ctx)
    
    return ctx.reply(
      formatTransaction(ctx, updatedTr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}

async function changeDescriptionRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('changeDescriptionRouteHandler')
  log('Entered change description route handler')
  try {
    const userSettings = ctx.session.userSettings
    log('ctx.session: %O', ctx.session)
    const description = ctx.msg?.text || ''
    log('description: %O', description)
    log('ctx.message: %O', ctx.message)
    log('ctx.update: %O', ctx.update)

    if (!ctx.session.currentTransaction) throw new Error('No current transaction in session data!')

    const tr = ctx.session.currentTransaction
    log('tr.id: %O', tr.id)
    const update = {
      transactions: [{
        source_id: tr.attributes?.transactions[0].source_id,
        destination_id: tr.attributes?.transactions[0].destination_id,
        description: description.trim()
      }]
    }

    if (!description) {
      return ctx.editMessageText(ctx.i18n.t('transactions.edit.badDescriptionTyped'))
    }

    log('Updating transaction...')
    const updatedTr = (await firefly(userSettings).Transactions.updateTransaction(
      tr.id || '',
      update
    )).data.data

    if (ctx.session.deleteBotsMessage?.messageId) {
      log('Deleting original message...')
      await ctx.api.deleteMessage(ctx.session.deleteBotsMessage.chatId!, ctx.session.deleteBotsMessage.messageId)
    }

    // Cleanup session
    cleanupSessionData(ctx)
    
    return ctx.reply(
      formatTransaction(ctx, updatedTr),
      {
        parse_mode: 'Markdown',
        reply_markup: transactionRecordMenu
      }
    )
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}
