import type { Context } from '#root/bot/context.js'
import { Router } from '@grammyjs/router'
import { defaultSettings } from '#root/lib/settings-store.js'
import { cancelMenu, settingsMenu, settingsText } from './settings.menu.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other.
// (v1 keyed every flow off the shared session.step string; that design bug is
// what the per-flow fields + lint rule replace.)
export const settingsRouter = new Router<Context>((ctx) => ctx.session.settingsFlow?.step)

settingsRouter.route('url', async (ctx) => {
  const text = ctx.msg!.text!
  if (!/^(?:http|https):\/\/[^ "]+$/i.test(text)) {
    await ctx.reply(ctx.i18n.t('settings.badUrl'), { reply_markup: cancelMenu })
    return
  }
  const s = ctx.settings ?? defaultSettings()
  await ctx.saveSettings({
    ...s,
    fireflyUrl: text,
    fireflyApiUrl: `${text.replace(/\/+$/, '')}/api`,
  })
  ctx.session.settingsFlow = undefined
  await ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
})

settingsRouter.route('api_url', async (ctx) => {
  const text = ctx.msg!.text!
  if (!/^(?:http|https):\/\/[^ "]+$/i.test(text)) {
    await ctx.reply(ctx.i18n.t('settings.badUrl'), { reply_markup: cancelMenu })
    return
  }
  const s = ctx.settings ?? defaultSettings()
  await ctx.saveSettings({ ...s, fireflyApiUrl: text })
  ctx.session.settingsFlow = undefined
  await ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
})

settingsRouter.route('token', async (ctx) => {
  const text = ctx.msg!.text!
  if (text.length < 500) {
    await ctx.reply(ctx.i18n.t('settings.badAccessToken'), { reply_markup: cancelMenu })
    return
  }
  const s = ctx.settings ?? defaultSettings()
  await ctx.saveSettings({ ...s, fireflyAccessToken: text })
  ctx.session.settingsFlow = undefined
  await ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
})

settingsRouter.otherwise((_ctx, next) => next())
