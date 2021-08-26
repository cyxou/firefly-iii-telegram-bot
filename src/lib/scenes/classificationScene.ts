import { Scenes, Markup } from 'telegraf'
import firefly from '../firefly'

const { enter, leave } = Scenes.Stage

// Classification scene
const classificationScene = new Scenes.BaseScene<Scenes.SceneContext>('classificationScene')

classificationScene.enter((ctx) => {
  ctx.reply('Выберите что будем изменять:', {
    ...Markup.inlineKeyboard([
      Markup.button.callback('Категории', 'category'),
      Markup.button.callback('Теги', 'tags'),
      Markup.button.callback('Группы', 'groupa')
    ], { columns: 1})
  })
})
classificationScene.leave((ctx) => ctx.reply('Пока!'))

classificationScene.command('back', leave<Scenes.SceneContext>())

classificationScene.on('text', async ctx => {
  try {
    console.log('ctx.message: ', ctx.message)

    const categories = await firefly.getCategories()
    const catNames = categories.map((c: any) => c.attributes.name)

    const catKeyboard = categories.map(
      (c: any) => Markup.button.callback(
        c.attributes.name,
        JSON.stringify({categoryName: c.attributes.name})
      )
    )

    // console.log('categories: ', categories)
    // ctx.reply('Choose category:')

    ctx.reply(`В какую категорию добавить ${ctx.message.text}?`, {
      ...Markup.inlineKeyboard(catKeyboard, { columns: 1})
    })
    // ctx.reply(
    //   'Keyboard wrap',
    //     Markup.keyboard(catNames, {
    //       wrap: (btn, index, currentRow) => currentRow.length >= (index + 1) / 2
    //   })
    // )
  } catch (err) {
    console.error(err)
  }
})

classificationScene.on('callback_query', async ctx => {
  console.log('ALOHA: ')
  // Using context shortcut
  ctx.answerCbQuery('Sexy!')
  console.log('ctx.update: ', ctx.update)
  ctx.reply('Got it')
  // await ctx.editMessageCaption('Caption', Markup.inlineKeyboard([
  //   Markup.button.callback('Plain', 'plain'),
  //   Markup.button.callback('Italic', 'italic')
  // ]))
})

classificationScene.on('message', (ctx) => ctx.reply('Only text messages please'))

export default classificationScene
