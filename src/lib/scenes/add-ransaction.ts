import { Scenes, Markup } from 'telegraf'
import dayjs from 'dayjs'

import firefly, { ITransaction } from '../firefly'
import { scene as c } from '../constants'

const { enter, leave } = Scenes.Stage

const CHOOSE_CATEGORY = 'CHOOSE_CATEGORY'
const CHOOSE_ACCOUNT = 'CHOOSE_ACCOUNT'
const CANCEL = 'CANCEL'
const DELETE_TRANSACTION = 'DELETE_TRANSACTION'
const EDIT_TRANSACTION = 'EDIT_TRANSACTION'

interface MySceneSession extends Scenes.SceneSessionData {
  // will be available under `ctx.scene.session.transaction`
  transaction?: ITransaction
}

type MyContext = Scenes.SceneContext<MySceneSession>

// Transaction scene
const scene = new Scenes.BaseScene<MyContext>(c.ADD_TRANSACTION_SCENE)

scene.enter((ctx) => {
  ctx.reply(
    'Введите сумму транзакции, либо несколько значений через пробел',
    Markup.inlineKeyboard([
    Markup.button.callback('Отмена', CANCEL),
  ]))
})

scene.leave((ctx) => ctx.reply('Отмена...'))

scene.command('back', leave<MyContext>())

scene.on('text', async ctx => {
  try {
    console.log('ctx.message: ', ctx.message)
    let amount
    amount = parseFloat(ctx.message.text)
    console.log('amount: ', amount)
    if (isNaN(amount)) {
      console.log('ALOHA amount: ', amount)
      return ctx.reply('Введите сумму транзакции (число)')
      // return ctx.scene.reset()
    } else {
      console.log('else stuff: ')
      // ctx.scene.session.transaction.amount = amount
    }

    const defaultAssetAccount = (await firefly.getAccounts('asset'))[0]
    const defaultExpenseAccount = (await firefly.getAccounts('expense'))[0]

    ctx.scene.session.transaction = {
      amount,
      categoryName: '',
      sourceId: defaultAssetAccount.id,
      destinationId: defaultExpenseAccount.id
    }

    ctx.state.amount = ctx.message.text

    const categories = await firefly.getCategories()
    const catNames = categories.map((c: any) => c.attributes.name)

    const catKb = categories.map((c: any) => Markup.button.callback(
      c.attributes.name,
      `!category=${c.attributes.name}`
    ))
    catKb.push(Markup.button.url('❤️', 'http://telegraf.js.org'))
    catKb.push(Markup.button.callback('-- Отмена --', CANCEL))

    ctx.reply(`В какую категорию добавить ${ctx.message.text}?`, {
      ...Markup.inlineKeyboard(catKb, { columns: 1})
    })
  } catch (err) {
    console.error(err)
  }
})

scene.action(/^!category=(.+)$/, async (ctx, next) => {
  console.log('ALOHA from category action: ', 'ALOHA')
  console.log('ctx: ', ctx.match)
  // console.log('set-category: ctx.message: ', ctx)
  // console.log('Wizard sesssion: ', ctx.session)
  const categoryName = ctx.match[1]
  // await ctx.answerCbQuery(`Выбрана категория: ${categoryName}`)
  // console.log('categoryName: ', categoryName)
  ctx.scene.session.transaction!.categoryName = categoryName

  await ctx.editMessageText(
    `Добавлено ${ctx.scene.session.transaction!.amount} в категорию расходов: ${categoryName}\n${dayjs().format()}`, {
      ...Markup.inlineKeyboard([
        Markup.button.callback('📆 Уточнить дату', EDIT_TRANSACTION),
        Markup.button.callback('❌  Удалить', DELETE_TRANSACTION),
      ], { columns: 2})
    })

  // await ctx.reply(`Step 3. Category selected: ${categoryName}`)
  // console.log('ctx.message: ', ctx.scene)
  // console.log('ctx.scene.session: ', ctx.scene.session)
  // console.log('ctx.scene.state: ', ctx.scene.state)
  // return next()
  // await ctx.reply(`categoryName : ${categoryName}`)

  const { transaction } = ctx.scene.session
  await firefly.createTransaction(transaction!)
  await ctx.answerCbQuery('Транзакция создана!')
})

scene.on('callback_query', async ( ctx, next ) => {
  console.log('callback_query - ALOHA')
  // Using context shortcut
  await ctx.answerCbQuery()
  // console.log('ctx.update: ', ctx.update)
  // await ctx.editMessageCaption('Caption', Markup.inlineKeyboard([
  //   Markup.button.callback('Plain', 'plain'),
  //   Markup.button.callback('Italic', 'italic')
  // ]))
  return next()
})

scene.action(CANCEL, ctx => {
  try {
    console.log('EXITING...: ')
    ctx.scene.leave()
  } catch (err) {
    console.error(err)
  }
})

scene.action(DELETE_TRANSACTION, ctx => {
  try {
    console.log('@TODO Removing transaction...: ')
    return ctx.deleteMessage()
  } catch (err) {
    console.error(err)
  }
})

scene.on('message', (ctx) => ctx.reply('Only text messages please'))

// What to do if user entered a raw message or picked some other option?
scene.use((ctx) => ctx.replyWithMarkdown('Please choose either Movie or Theater'));

export default scene
