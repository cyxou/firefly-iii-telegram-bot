import type { Context } from '#root/bot/context.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { createMainKeyboard, generateWelcomeMessage } from '#root/bot/helpers/keyboard.js'
import { escapeMarkdown } from '#root/bot/helpers/markdown.js'
import { locales } from '#root/bot/i18n.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import { defaultSettings } from '#root/lib/settings-store.js'

// Ported from legacy/composers/settings.ts (v1 menus, same ids).

export function settingsText(ctx: Context) {
  const s = ctx.settings ?? defaultSettings()
  const accessToken = s.fireflyAccessToken.replace(/(.{4})(.*?)(.{4})$/, '$1...$3')
  return ctx.i18n.t('settings.whatDoYouWantToChange', {
    // values are user-controlled and this text is parsed as Markdown — escape
    fireflyUrl: escapeMarkdown(s.fireflyUrl),
    fireflyApiUrl: escapeMarkdown(s.fireflyApiUrl),
    accessToken: s.fireflyAccessToken ? escapeMarkdown(accessToken) : '',
    defaultSourceAccount: {
      ...s.defaultSourceAccount,
      name: escapeMarkdown(s.defaultSourceAccount.name),
    },
  })
}

// no reply_markup: the menu lib injects the nav target (settingsMenu) into
// markup-less edits; passing it explicitly makes the lib re-render on top
// -> Telegram 400 "message is not modified" (v1 never passed it either)
async function backToSettings(ctx: Context) {
  await ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown' })
}

export const settingsMenu = new Menu<Context>('settings')
  .submenu(
    (ctx) => ctx.i18n.t('labels.SWITCH_LANG'),
    'switch-lang',
    async (ctx) => {
      await ctx.editMessageText(ctx.i18n.t('settings.selectBotLang'), { parse_mode: 'Markdown' })
    },
  )
  .row()
  .text(
    (ctx) => ctx.i18n.t('labels.FIREFLY_URL_BUTTON'),
    (ctx) => inputStep(ctx, 'url', 'settings.inputFireflyUrl'),
  )
  .row()
  .text(
    (ctx) => ctx.i18n.t('labels.FIREFLY_API_URL_BUTTON'),
    (ctx) => inputStep(ctx, 'api_url', 'settings.inputFireflyApiUrl'),
  )
  .row()
  .text(
    (ctx) => ctx.i18n.t('labels.FIREFLY_ACCESS_TOKEN_BUTTON'),
    (ctx) => inputStep(ctx, 'token', 'settings.inputFireflyAccessToken'),
  )
  .row()
  .dynamic(async (ctx) => {
    // Render-only: reads durable settings, never writes session (dynamic re-runs on every click).
    const range = new MenuRange<Context>()
    const s = ctx.settings ?? defaultSettings()
    if (s.fireflyUrl && s.fireflyAccessToken) {
      range.text((ctx) => ctx.i18n.t('labels.TEST_CONNECTION'), testConnection).row()
      range
        .submenu(
          (ctx) => ctx.i18n.t('labels.DEFAULT_ASSET_ACCOUNT_BUTTON'),
          'set-default-account',
          async (ctx) => {
            const accounts = await ctx.firefly.listAccounts(AccountTypeFilter.Asset)
            await ctx.editMessageText(
              accounts.length
                ? ctx.i18n.t('settings.selectDefaultAssetAccount')
                : ctx.i18n.t('common.noDefaultSourceAccountExist'),
              { parse_mode: 'Markdown' },
            )
          },
        )
        .row()
    }
    return range
  })
  .text('🔙', async (ctx) => {
    ctx.session.settingsFlow = undefined
    await ctx.deleteMessage()
  })

export const cancelMenu = new Menu<Context>('setting-cancel').back('🔙', async (ctx) => {
  ctx.session.settingsFlow = undefined
  await backToSettings(ctx)
})

async function inputStep(ctx: Context, step: 'url' | 'api_url' | 'token', promptKey: string) {
  ctx.session.settingsFlow = { step }
  await ctx.editMessageText(ctx.i18n.t(promptKey), {
    parse_mode: 'Markdown',
    reply_markup: cancelMenu,
  })
}

export const langMenu = new Menu<Context>('switch-lang').dynamic(() => {
  const range = new MenuRange<Context>()
  for (const locale of locales) {
    range
      .text(
        {
          text: (ctx) =>
            `${ctx.i18n.t(`labels.SWITCH_TO_${locale.toUpperCase()}`)}${
              (ctx.settings?.language ?? 'en') === locale ? ' ✅' : ''
            }`,
          payload: locale,
        },
        async (ctx) => {
          // payload travels in ctx.match — no closure/session reads needed for logic
          const s = ctx.settings ?? defaultSettings()
          await ctx.saveSettings({ ...s, language: ctx.match! })
          ctx.i18n.locale(ctx.match!)
          ctx.menu.update() // menu@1.5: lazy void — no await needed
          await ctx.reply(generateWelcomeMessage(ctx), {
            reply_markup: createMainKeyboard(ctx),
          })
          await ctx.editMessageText(ctx.i18n.t('settings.selectBotLang'), {
            parse_mode: 'Markdown',
          })
        },
      )
      .row()
  }
  range.back('🔙', backToSettings)
  return range
})

export const defaultAccountMenu = new Menu<Context>('set-default-account').dynamic(async (ctx) => {
  const range = new MenuRange<Context>()
  const s = ctx.settings ?? defaultSettings()
  const accounts = await ctx.firefly.listAccounts(AccountTypeFilter.Asset)
  if (!accounts.length) {
    return range
      .url(ctx.i18n.t('labels.OPEN_ASSET_ACCOUNTS_IN_BROWSER'), `${s.fireflyUrl}/accounts/asset`)
      .row()
      .back('🔙', backToSettings)
  }
  for (const acc of accounts) {
    range
      .text(
        {
          text: (ctx) =>
            `${acc.attributes.name}${
              (ctx.settings ?? defaultSettings()).defaultSourceAccount.id === acc.id ? ' ✅' : ''
            }`,
          payload: acc.id,
        },
        async (ctx) => {
          const current = ctx.settings ?? defaultSettings()
          if (current.defaultSourceAccount.id === ctx.match) return
          const account = await ctx.firefly.getAccount(ctx.match!)
          await ctx.saveSettings({
            ...current,
            defaultSourceAccount: {
              id: ctx.match!,
              name: account.attributes.name,
              type: account.attributes.type ?? 'asset',
            },
          })
          ctx.menu.update() // menu@1.5: lazy void — no await needed
          await ctx.editMessageText(ctx.i18n.t('settings.selectDefaultAssetAccount'), {
            parse_mode: 'Markdown',
          })
        },
      )
      .row()
  }
  range.back('🔙', backToSettings)
  return range
})

async function testConnection(ctx: Context) {
  const s = ctx.settings ?? defaultSettings()
  if (!s.fireflyUrl || !s.fireflyApiUrl) {
    await ctx.reply(
      ctx.i18n.t('settings.specifySmthFirst', {
        smth: ctx.i18n.t('labels.FIREFLY_URL_BUTTON'),
      }),
    )
    return
  }
  if (!s.fireflyAccessToken) {
    await ctx.reply(
      ctx.i18n.t('settings.specifySmthFirst', {
        smth: ctx.i18n.t('labels.FIREFLY_ACCESS_TOKEN_BUTTON'),
      }),
    )
    return
  }
  try {
    const user = await ctx.firefly.getCurrentUser()
    await ctx.reply(
      user
        ? ctx.i18n.t('settings.connectionSuccess', { email: user.email })
        : ctx.i18n.t('settings.connectionFailed'),
    )
  } catch (err: any) {
    await ctx.reply(ctx.i18n.t('settings.connectionFailedUnauthenticated'))
    ctx.logger.warn({ err }, 'firefly connection test failed')
  }
}
