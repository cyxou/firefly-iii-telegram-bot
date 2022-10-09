import debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"

import type { MyContext } from '../../types/MyContext'
import {
  editTransactionsMapper as mapper,
  parseAmountInput,
  formatTransaction,
  formatTransactionKeyboard,
  createCategoriesKeyboard,
  createAccountsKeyboard,
  createExpenseAccountsKeyboard,
  createEditMenuKeyboard
} from '../helpers'

import firefly from '../../lib/firefly'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'
import { isNaN } from 'lodash'

export enum Route {
  IDLE               = 'IDLE',
  CHANGE_AMOUNT      = 'EDIT_TRANSACTION|AMOUNT',
  CHANGE_DESCRIPTION = 'EDIT_TRANSACTION|DESCRIPTION'
}

const rootLog = debug('bot:transactions:edit')

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

// Common for all transaction types
bot.callbackQuery(mapper.editMenu.regex(), showEditTransactionMenu)
bot.callbackQuery(mapper.done.regex(), doneEditTransactionCbQH)
bot.callbackQuery(mapper.editAmount.regex(), changeTransactionAmountCbQH)
bot.callbackQuery(mapper.editDesc.regex(), changeTransactionDescriptionCbQH)

router.route(Route.CHANGE_AMOUNT, changeAmountRouteHandler)
router.route(Route.CHANGE_DESCRIPTION, changeDescriptionRouteHandler)

bot.callbackQuery(mapper.editCategory.regex(), selectNewCategory)
bot.callbackQuery(mapper.setCategory.regex(), setNewCategory)
bot.callbackQuery(mapper.editSourceAccount.regex(), selectNewSourceAccount)
bot.callbackQuery(mapper.setSourceAccount.regex(), setNewSourceAccount)
bot.callbackQuery(mapper.editDestinationAccount.regex(), selectNewDestinationAccount)
bot.callbackQuery(mapper.setDestinationAccount.regex(), setNewDestinationAccount)

bot.use(router)

export default bot

async function showEditTransactionMenu(ctx: MyContext) {
  const log = rootLog.extend('showEditTransactionMenu')
  log('Entered showEditTransactionMenu action handler')
  try {
    log('ctx.update.callback_query.message: %O', ctx.update?.callback_query?.message)
    // Prevent all router handlers from happening
    ctx.session.step = 'IDLE'

    const userId = ctx.from!.id
    const { editTransaction } = ctx.session
    log('transaction: %O', editTransaction)

    const trId = parseInt(ctx.match![1], 10)
    log('trId: %O', trId)

    const tr = (await firefly(userId).Transactions.getTransaction(trId)).data.data

    ctx.session.editTransaction = tr

    // This is a curried function which deletes the original message.
    // We need it because having edited a transaction, we can not edit the
    // message with updated transaction from the route handler function.
    // Hence the workaround is to delete original message and then post
    // another one with the updated transaction data. This function is meant to
    // be called only from the route handler functions where a user types in
    // things as opposed to clicking on inline keyboard buttons.
    ctx.session.deleteBotsMessage = (function(ctx: MyContext) {
      const messageId = ctx.update?.callback_query?.message!.message_id || 0
      const chatId = ctx.update?.callback_query?.message!.chat.id || 0
      return function() {
        return ctx.api.deleteMessage(chatId, messageId)
      }
    })(ctx)

    const editMenuKeyboard = createEditMenuKeyboard(ctx, tr)
    log('editMenuKeyboard.inline_keyboard: %O', editMenuKeyboard.inline_keyboard)

    const message = ''.concat(
      formatTransaction(ctx, tr),
      '\n',
      ctx.i18n.t('transactions.edit.whatToEdit')
    )
    log('message: %O', message)

    return ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: editMenuKeyboard
    })

  } catch (err) {
    console.error(err)
  }
}

async function doneEditTransactionCbQH(ctx: MyContext) {
  const log = rootLog.extend('doneEditTransactionCbQH')
  try {
    const userId = ctx.from!.id
    const trId = parseInt(ctx.match![1], 10)
    log('transaction id: %O', trId)

    await ctx.answerCallbackQuery()

    const tr = (await firefly(userId).Transactions.getTransaction(trId)).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )
  } catch (err) {
    log('Error: %O', err)
    console.error('Error occured cancelling edit transaction: ', err)
    throw err
  }
}

async function changeTransactionAmountCbQH(ctx: MyContext) {
  const log = rootLog.extend('changeTransactionAmount')
  log('Entered changeTransactionAmount action handler')
  try {
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    ctx.session.step = Route.CHANGE_AMOUNT

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.typeNewAmount'), {
      reply_markup: new InlineKeyboard()
        .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))
    })
  } catch (err) {
    console.error(err)
  }
}

async function changeTransactionDescriptionCbQH(ctx: MyContext) {
  const log = rootLog.extend('changeTransactionDescription')
  log('Entered changeTransactionDescription action handler')
  try {
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    ctx.session.step = Route.CHANGE_DESCRIPTION

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.typeNewDescription'), {
      reply_markup: new InlineKeyboard()
        .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))
    })
  } catch (err) {
    console.error(err)
  }
}

async function changeAmountRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('changeAmountRouteHandler')
  log('Entered change amount route handler')
  try {
    const userId = ctx.from!.id
    log('ctx.session: %O', ctx.session)
    const text = ctx.msg?.text || ''
    const amount = parseAmountInput(text)
    log('amount: %O', amount)

    const trId = ctx.session.editTransaction.id || ''

    if (!amount) {
      return ctx.editMessageText(ctx.i18n.t('transactions.edit.badAmountTyped'), {
        reply_markup: new InlineKeyboard()
          .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))
      })
    }

    ctx.session.step = 'IDLE'

    if (ctx.session.deleteBotsMessage) {
      log('Deleting original message')
      await ctx.session.deleteBotsMessage()
    }

    const tr = (await firefly(userId).Transactions.updateTransaction(
      parseInt(trId, 10),
      { transactions: [{ amount: amount.toString() }] }
    )).data.data

    return ctx.reply(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )
  } catch (err) {
    console.error(err)
  }
}

async function changeDescriptionRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('changeDescriptionRouteHandler')
  log('Entered change description route handler')
  try {
    const userId = ctx.from!.id
    log('ctx.session: %O', ctx.session)
    const description = ctx.msg?.text || ''
    log('description: %O', description)

    const trId = ctx.session.editTransaction.id || ''

    if (!description) {
      return ctx.editMessageText(ctx.i18n.t('transactions.edit.badDescriptionTyped'), {
        reply_markup: new InlineKeyboard()
          .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))
      })
    }

    ctx.session.step = 'IDLE'

    if (ctx.session.deleteBotsMessage) {
      log('Deleting original message')
      await ctx.session.deleteBotsMessage()
    }

    const tr = (await firefly(userId).Transactions.updateTransaction(
      parseInt(trId, 10),
      { transactions: [{ description: description.trim() }] }
    )).data.data

    return ctx.reply(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )
  } catch (err) {
    console.error(err)
  }
}

async function selectNewCategory(ctx: MyContext) {
  const log = rootLog.extend('selectNewCategory')
  log('Entered selectNewCategory action handler')
  try {
    const userId = ctx.from!.id
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    const categoriesKeyboard = await createCategoriesKeyboard(
      userId,
      mapper.setCategory
    )
    categoriesKeyboard
      .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewCategory'), {
      reply_markup: categoriesKeyboard
    })

  } catch (err) {
    console.error(err)
  }
}

async function selectNewSourceAccount(ctx: MyContext) {
  const log = rootLog.extend('selectNewSourceAccount')
  log('Entered selectNewSourceAccount action handler')
  try {
    const userId = ctx.from!.id
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    const accountsKeyboard = await createAccountsKeyboard(
      userId,
      [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities],
      mapper.setSourceAccount
    )

    accountsKeyboard
      .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))

    log('accountsKeyboard: %O', accountsKeyboard.inline_keyboard)

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewSourceAccount'), {
      reply_markup: accountsKeyboard
    })

  } catch (err) {
    console.error(err)
  }
}

async function selectNewDestinationAccount(ctx: MyContext) {
  const log = rootLog.extend('selectNewDestinationAccount')
  log('Entered selectNewDestinationAccount action handler')
  try {
    const userId = ctx.from!.id
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    const accountsKeyboard = await createExpenseAccountsKeyboard(userId)
    accountsKeyboard
      .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewDestinationAccount'), {
      reply_markup: accountsKeyboard
    })

  } catch (err) {
    console.error(err)
  }
}

async function setNewCategory(ctx: MyContext) {
  const log = rootLog.extend('setNewCategory')
  log('Entered editTransactionCategory action handler')
  try {
    const userId = ctx.from!.id
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    await ctx.answerCallbackQuery()

    const trId = ctx.session.editTransaction.id || ''
    log('trId: %O', trId)
    const tr = (await firefly(userId).Transactions.updateTransaction(
      parseInt(trId, 10),
      { transactions: [{ category_id: categoryId }]}
    )).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

  } catch (err) {
    console.error(err)
  }
}

async function setNewSourceAccount(ctx: MyContext) {
  const log = rootLog.extend('setNewSourceAccount')
  log('Entered setNewSourceAccount action handler')
  try {
    const userId = ctx.from!.id
    const sourceAccountId = parseInt(ctx.match![1], 10)
    log('sourceAccountId: %O', sourceAccountId)

    if (isNaN(sourceAccountId)) throw new Error('Source Account ID is bad!')


    await ctx.answerCallbackQuery()

    const trId = parseInt(ctx.session.editTransaction.id || '', 10)
    log('trId: %O', trId)

    if (isNaN(trId)) throw new Error('Transaction ID is bad!')

    const transaction = ctx.session.editTransaction
    log('Transaction to update: %O', transaction)
    log('Inner transactions: %O', transaction.attributes?.transactions)

    // When we change the source account of the transaction, we also want to change the
    // currency of the transaction to match the newly set source account. Otherwise
    // the transaction would have the original account's currency.
    const sourceAccountData = (await firefly(userId).Accounts.getAccount(sourceAccountId)).data.data
    log('sourceAccountData: %O', sourceAccountData)

    const update = {
      transactions: [{
        source_id: sourceAccountId.toString(),
        currency_id: sourceAccountData.attributes.currency_id
      }]
    }

    // Proceed with updating the transaction
    const tr = (await firefly(userId).Transactions.updateTransaction(trId, update)).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

  } catch (err) {
    console.error(err)
  }
}

async function setNewDestinationAccount(ctx: MyContext) {
  const log = rootLog.extend('setNewDestinationAccount')
  log('Entered setNewDestinationAccount action handler')
  try {
    const userId = ctx.from!.id
    const destId = ctx.match![1]
    log('destId: %O', destId)

    await ctx.answerCallbackQuery()

    const trId = ctx.session.editTransaction.id || ''
    log('trId: %O', trId)
    const tr = (await firefly(userId).Transactions.updateTransaction(
      parseInt(trId, 10),
      { transactions: [{ destination_id: destId }]}
    )).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, tr),
      formatTransactionKeyboard(ctx, tr)
    )

  } catch (err) {
    console.error(err)
  }
}
