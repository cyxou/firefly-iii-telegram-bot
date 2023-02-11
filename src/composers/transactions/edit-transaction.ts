import debug from 'debug'
import { Composer, InlineKeyboard } from 'grammy'
import { Router } from "@grammyjs/router"
import flatten from 'lodash.flatten'

import type { MyContext } from '../../types/MyContext'
import {
  editTransactionsMapper as mapper,
  parseAmountInput,
  formatTransaction,
  formatTransactionKeyboard,
  createCategoriesKeyboard,
  createAccountsKeyboard,
  createEditMenuKeyboard
} from '../helpers'

import firefly from '../../lib/firefly'
import { AccountTypeFilter } from '../../lib/firefly/model/account-type-filter'
import { handleCallbackQueryError } from '../../lib/errorHandler'

export enum Route {
  IDLE               = 'IDLE',
  CHANGE_AMOUNT      = 'EDIT_TRANSACTION|AMOUNT',
  CHANGE_DESCRIPTION = 'EDIT_TRANSACTION|DESCRIPTION'
}

const rootLog = debug('bot:transactions:edit')

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

// Common for all transaction types
bot.callbackQuery(mapper.assignCategory.regex(), assignCategory)
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

    const userSettings = ctx.session.userSettings
    const { editTransaction } = ctx.session
    log('transaction: %O', editTransaction)

    const trId = ctx.match![1]
    log('trId: %O', trId)

    const tr = (await firefly(userSettings).Transactions.getTransaction(trId)).data.data

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

  } catch (err: any) {
    console.error(err)
    rootLog('Error occured editing transaction: %O', err)
    return handleCallbackQueryError(err, ctx)
  }
}

async function doneEditTransactionCbQH(ctx: MyContext) {
  const log = rootLog.extend('doneEditTransactionCbQH')
  try {
    const userSettings = ctx.session.userSettings
    const trId = ctx.match![1]
    log('transaction id: %O', trId)

    await ctx.answerCallbackQuery()

    const tr = (await firefly(userSettings).Transactions.getTransaction(trId)).data.data

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
    const userSettings = ctx.session.userSettings
    log('ctx.session: %O', ctx.session)
    const text = ctx.msg?.text || ''

    const currentAmount = ctx.session.editTransaction.attributes?.transactions[0].amount
    const amount = parseAmountInput(text, currentAmount)
    log('amount: %O', amount)

    const tr = ctx.session.editTransaction
    log('tr.id: %O', tr.id)
    const update = {
      transactions: [{
        source_id: tr.attributes?.transactions[0].source_id,
        destination_id: tr.attributes?.transactions[0].destination_id,
        amount: amount?.toString()
      }]
    }

    if (!amount) {
      return ctx.editMessageText(ctx.i18n.t('transactions.edit.badAmountTyped'), {
        reply_markup: new InlineKeyboard()
          .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId: tr.id || '' }))
      })
    }

    ctx.session.step = 'IDLE'

    if (ctx.session.deleteBotsMessage) {
      log('Deleting original message')
      await ctx.session.deleteBotsMessage()
    }

    const updatedTr = (await firefly(userSettings).Transactions.updateTransaction(
      tr.id || '',
      update
    )).data.data

    return ctx.reply(
      formatTransaction(ctx, updatedTr),
      formatTransactionKeyboard(ctx, updatedTr)
    )
  } catch (err) {
    console.error(err)
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

    const tr = ctx.session.editTransaction
    log('tr.id: %O', tr.id)
    const update = {
      transactions: [{
        source_id: tr.attributes?.transactions[0].source_id,
        destination_id: tr.attributes?.transactions[0].destination_id,
        description: description.trim()
      }]
    }

    if (!description) {
      return ctx.editMessageText(ctx.i18n.t('transactions.edit.badDescriptionTyped'), {
        reply_markup: new InlineKeyboard()
          .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId: tr.id || '' }))
      })
    }

    ctx.session.step = 'IDLE'

    if (ctx.session.deleteBotsMessage) {
      log('Deleting original message')
      await ctx.session.deleteBotsMessage()
    }

    const updatedTr = (await firefly(userSettings).Transactions.updateTransaction(
      tr.id || '',
      update
    )).data.data

    return ctx.reply(
      formatTransaction(ctx, updatedTr),
      formatTransactionKeyboard(ctx, updatedTr)
    )
  } catch (err) {
    console.error(err)
  }
}

async function assignCategory(ctx: MyContext) {
  const log = rootLog.extend('assignCategory')
  log('Entered assignCategory action handler')
  try {
    const userSettings = ctx.session.userSettings
    const trId = ctx.match![1]
    log('trId: %O', trId)

    await ctx.answerCallbackQuery()

    const tr = (await firefly(userSettings).Transactions.getTransaction(trId)).data.data

    ctx.session.editTransaction = tr

    const categoriesKeyboard = await createCategoriesKeyboard(
      ctx,
      mapper.setCategory
    )

    // If inline_keyboard array does not contain anything, than user has no categories yet
    if (!flatten(categoriesKeyboard.inline_keyboard).length) {
      categoriesKeyboard.text(ctx.i18n.t('labels.DONE'), mapper.done.template({ trId }))

      return ctx.editMessageText(ctx.i18n.t('transactions.edit.noCategoriesYet'), {
        parse_mode: 'Markdown',
        reply_markup:  categoriesKeyboard
      })
    }

    categoriesKeyboard
      .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewCategory'), {
      reply_markup: categoriesKeyboard
    })

  } catch (err) {
    console.error(err)
  }
}

async function selectNewCategory(ctx: MyContext) {
  const log = rootLog.extend('selectNewCategory')
  log('Entered selectNewCategory action handler')
  try {
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    const categoriesKeyboard = await createCategoriesKeyboard(
      ctx,
      mapper.setCategory
    )
    // If inline_keyboard array does not contain anything, than user has no categories yet
    if (!flatten(categoriesKeyboard.inline_keyboard).length) {
      categoriesKeyboard.text(ctx.i18n.t('labels.DONE'), mapper.editMenu.template({ trId }))

      return ctx.editMessageText(ctx.i18n.t('transactions.edit.noCategoriesYet'), {
        parse_mode: 'Markdown',
        reply_markup:  categoriesKeyboard
      })
    }

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
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()

    const accountsKeyboard = await createAccountsKeyboard(
      ctx,
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
    const trId = ctx.match![1]

    await ctx.answerCallbackQuery()
    const accTypeFilters = [
      AccountTypeFilter.CashAccount,
      AccountTypeFilter.Liabilities,
      AccountTypeFilter.Expense
    ]

    const accountsKeyboard = (await createAccountsKeyboard(
      ctx,
      accTypeFilters,
      mapper.setDestinationAccount
    ))
      .text(ctx.i18n.t('labels.CANCEL'), mapper.editMenu.template({ trId }))

    log('accountsKeyboard.inline_keyboard: %O', accountsKeyboard.inline_keyboard)

    return ctx.editMessageText(ctx.i18n.t('transactions.edit.chooseNewDestinationAccount'), {
      reply_markup: accountsKeyboard
    })

  } catch (err) {
    console.error(err)
  }
}

async function setNewCategory(ctx: MyContext) {
  const log = rootLog.extend('setNewCategory')
  log('Entered setNewCategory action handler')
  try {
    const userSettings = ctx.session.userSettings
    const categoryId = ctx.match![1]
    log('categoryId: %O', categoryId)

    await ctx.answerCallbackQuery()

    const tr = ctx.session.editTransaction
    log('ctx.session.editTransaction: %O', tr)

    const update = {
      transactions: [{
        source_id: tr.attributes?.transactions[0].source_id,
        destination_id: tr.attributes?.transactions[0].destination_id,
        category_id: categoryId
      }]
    }
    log('Transaction update: %O', update)

    const updatedTr = (await firefly(userSettings).Transactions.updateTransaction(
      tr.id || '',
      update
    )).data.data

    return ctx.editMessageText(
      formatTransaction(ctx, updatedTr),
      formatTransactionKeyboard(ctx, updatedTr)
    )

  } catch (err) {
    console.error(err)
  }
}

async function setNewSourceAccount(ctx: MyContext) {
  const log = rootLog.extend('setNewSourceAccount')
  log('Entered setNewSourceAccount action handler')
  try {
    const userSettings = ctx.session.userSettings
    const sourceAccountId = ctx.match![1]
    log('sourceAccountId: %O', sourceAccountId)

    if (!sourceAccountId) throw new Error('Source Account ID is bad!')


    await ctx.answerCallbackQuery()

    const trId = ctx.session.editTransaction.id || ''
    log('trId: %O', trId)

    if (!trId) throw new Error('Transaction ID is bad!')

    const transaction = ctx.session.editTransaction
    log('Transaction to update: %O', transaction)
    log('Inner transactions: %O', transaction.attributes?.transactions)

    // When we change the source account of the transaction, we also want to change the
    // currency of the transaction to match the newly set source account. Otherwise
    // the transaction would have the original account's currency.
    const sourceAccountData = (await firefly(userSettings).Accounts.getAccount(sourceAccountId)).data.data
    log('sourceAccountData: %O', sourceAccountData)

    const update = {
      transactions: [{
        source_id: sourceAccountId.toString(),
        currency_id: sourceAccountData.attributes.currency_id
      }]
    }

    // Proceed with updating the transaction
    const tr = (await firefly(userSettings).Transactions.updateTransaction(trId, update)).data.data

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
    const userSettings = ctx.session.userSettings
    const destId = ctx.match![1]
    log('destId: %O', destId)

    await ctx.answerCallbackQuery()

    const trId = ctx.session.editTransaction.id || ''
    log('trId: %O', trId)
    const tr = (await firefly(userSettings).Transactions.updateTransaction(
      trId,
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
