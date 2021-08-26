import { Composer, Markup, Scenes, session, Telegraf } from 'telegraf'
import config from '../config'
import { botCommand, scene } from './constants'

import addTransactionScene from './scenes/add-ransaction'
import classificationScene from './scenes/classificationScene'
import addTransactionWizard from './wizard/add-transaction'

const token = config.botToken



// Handler factories
const { enter, leave } = Scenes.Stage

const bot = new Telegraf<any>(token)

const sceneStage = new Scenes.Stage<Scenes.SceneContext>(
  [
    addTransactionScene,
    classificationScene,
  ]
  // ], { ttl: 20 }
)

// const wizardStage = new Scenes.Stage<Scenes.WizardContext>(
  // [ addTransactionWizard ],
  // // { default: 'add-transaction-wizard'}
// )
//
// Example of middleware
// bot.use(async (ctx, next) => {
//   console.time(`Processing update ${ctx.update.update_id}`)
//   await next() // runs next middleware
//   // runs after next middleware finishes
//   console.timeEnd(`Processing update ${ctx.update.update_id}`)
// })
bot.use(session())
bot.use(sceneStage.middleware())
// bot.use(wizardStage.middleware())
bot.command(botCommand.ADD_TRANSACTION, (ctx) => ctx.scene.enter(scene.ADD_TRANSACTION_SCENE))
// bot.command(botCommand.ADD_TRANSACTION, (ctx) => ctx.scene.enter('ADD_TRANSACTION_WIZARD'))
// bot.command('classification', (ctx) => ctx.scene.enter('classificationScene'))
bot.on('message', ctx => {
  try {
    return ctx.reply('Try /addTransaction', Markup
      .keyboard([
        ['🔀 Транзакции', '💳 Счета'], // Row1 with 2 buttons
        ['🏷️ Классификация', ' 📈 Отчеты'], // Row2 with 2 buttons
        ['⚙️ Настройки бота' ] // Row3 with 3 buttons
      ])
      .oneTime()
      .resize()
    )
    // console.log('ctx.message: ', ctx.message.text)
    // const amount = parseFloat(ctx.message.text)
    // console.log('amount: ', amount)
    // if (!isNaN(amount)) ctx.scene.enter('add-transaction-wizard')
    // else ctx.reply('Try /echo or /greeter')
  } catch (err) {
    console.error(err)
  }
})

export default bot
