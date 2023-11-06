import debug from 'debug'
import dayjs from 'dayjs'
import { Composer } from 'grammy'
import { Router } from "@grammyjs/router"
import { Menu, MenuRange } from '@grammyjs/menu'

import type { MyContext } from '../types/MyContext'
import i18n, { getLanguageIcon, locales } from '../lib/i18n';
import { command, ACCOUNTS_PAGE_LIMIT } from './constants'
import firefly from '../lib/firefly'
import { AccountTypeFilter } from '../lib/firefly/model/account-type-filter'
import { AccountRead } from '../lib/firefly/model/account-read'
import { handleCallbackQueryError } from '../lib/errorHandler'
import { requireSettings } from '../lib/middlewares'
import { cleanupSessionData, createMainKeyboard, generateWelcomeMessage } from './helpers'

export enum Route {
  FIREFLY_URL = 'SETTINGS|FIREFLY_URL',
  FIREFLY_API_URL = 'SETTINGS|FIREFLY_API_URL',
  FIREFLY_ACCESS_TOKEN = 'SETTINGS|FIREFLY_ACCESS_TOKEN'
}

const rootLog = debug(`bot:settings`)

const bot = new Composer<MyContext>()
const router = new Router<MyContext>((ctx) => ctx.session.step)

const settingsMenu = new Menu<MyContext>('settings')
  .submenu(
    ctx => ctx.i18n.t('labels.SWITCH_LANG'),
    'switch-lang',
    ctx => ctx.editMessageText(ctx.i18n.t('settings.selectBotLang'), { parse_mode: 'Markdown' })
  ).row()
  .text(ctx => ctx.i18n.t('labels.FIREFLY_URL_BUTTON'), inputFireflyUrlCbQH).row()
  .text(ctx => ctx.i18n.t('labels.FIREFLY_API_URL_BUTTON'), inputFireflyApiUrlCbQH).row()
  .text(ctx => ctx.i18n.t('labels.FIREFLY_ACCESS_TOKEN_BUTTON'), inputFireflyAccessTokenCbQH).row()
  // Render test connection and default account buttons only if Firefly URL and
  // Access token are set
  .dynamic(async ctx => {
    const range = new MenuRange<MyContext>()
    const userSettings = ctx.session.userSettings
    const { fireflyUrl, fireflyAccessToken } = userSettings

    if (fireflyUrl && fireflyAccessToken) {
      range
        .text(ctx => ctx.i18n.t('labels.TEST_CONNECTION'), testConnectionCbQH).row()
        .submenu(
          ctx => ctx.i18n.t('labels.DEFAULT_ASSET_ACCOUNT_BUTTON'),
          'set-default-account',
          async ctx => {
            const userSettings = ctx.session.userSettings
            const accounts: AccountRead[] = (await firefly(userSettings).Accounts.listAccount(
              undefined, ACCOUNTS_PAGE_LIMIT, 1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data
            // Take care of a case when no accounts are created yet
            if (!accounts.length) {
              ctx.editMessageText(ctx.i18n.t('common.noDefaultSourceAccountExist'))
            } else {
              ctx.editMessageText(ctx.i18n.t('settings.selectDefaultAssetAccount'), { parse_mode: 'Markdown' })
            }
          }
        ).row()
    }

    return range
  })
  .text('🔙', doneCbQH);

const langMenu = new Menu<MyContext>('switch-lang')
  .dynamic(() => {
    const range = new MenuRange<MyContext>()
    for (const locale of locales) {
      const langText = 'labels.' + `SWITCH_TO_${locale}`.toUpperCase()
      range.text(
        {
          text: ctx => `${ctx.i18n.t(langText)}${ctx.i18n.languageCode === locale ? ' ✅' : ''}`,
          payload: locale,
        },
        ctx => {
          ctx.i18n.locale(locale)
          dayjs.locale(locale)
          ctx.session.userSettings.language = locale
          ctx.menu.update();
          const welcomeMessage = generateWelcomeMessage(ctx)
          ctx.reply(welcomeMessage, { reply_markup: createMainKeyboard(ctx) })
          ctx.editMessageText(ctx.i18n.t('settings.selectBotLang'), { parse_mode: 'Markdown' })
        }
      ).row()
    }
    range.back('🔙', ctx => ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown' }));
    return range
  })

const defaultAccountMenu = new Menu<MyContext>('set-default-account')
  .dynamic(async ctx => {
    const log = rootLog.extend('defaultAccountMenu:dynamic')
    const range = new MenuRange<MyContext>()
    const userSettings = ctx.session.userSettings
    const { fireflyUrl } = userSettings

    const accounts: AccountRead[] = (await firefly(userSettings).Accounts.listAccount(
      undefined, ACCOUNTS_PAGE_LIMIT, 1, dayjs().format('YYYY-MM-DD'), AccountTypeFilter.Asset)).data.data
    log('accounts: %O', accounts)

    // Take care of a case when no accounts are created yet
    // FIXME: This can be probably optimized in order not to get accounts for
    // the second time. The first time we get accounts when we check if a user has
    // not created any accounts yet.
    if (!accounts.length) {
      return range
        .url(ctx.i18n.t('labels.OPEN_ASSET_ACCOUNTS_IN_BROWSER'), `${fireflyUrl}/accounts/asset`).row()
        .back('🔙', ctx => ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown' }));
    }

    for (const acc of accounts) {
      range.text(
        {
          text: ctx =>
            `${acc.attributes.name}${ctx.session.userSettings.defaultSourceAccount.id === acc.id.toString() ? ' ✅' : ''}`,
          payload: acc.id
        },
        async ctx => {
          log('Entered range middleware...')
          if (ctx.session.userSettings.defaultSourceAccount.id.toString() === acc.id.toString()) return

          const account = (await firefly(userSettings).Accounts.getAccount(acc.id)).data.data
          log('account: %O', account)
          ctx.session.userSettings.defaultSourceAccount = {
            id: acc.id.toString(),
            name: account.attributes.name,
            type: account.attributes.type
          }
          ctx.menu.update();
          ctx.editMessageText(ctx.i18n.t('settings.selectDefaultAssetAccount'), { parse_mode: 'Markdown' })
        }
      ).row()
    }
    range.back('🔙', ctx => ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown' }));
    return range
  })

const cancelMenu = new Menu<MyContext>('setting-cancel')
  .back('🔙', ctx => {
    ctx.session.step = 'IDLE'
    ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown' })
  })
// ← back arrow

settingsMenu.register(langMenu)
settingsMenu.register(defaultAccountMenu)
settingsMenu.register(cancelMenu)
bot.use(settingsMenu)
bot.use(requireSettings())

bot.command(command.SETTINGS, settingsCommandHandler)
bot.hears(i18n.t('en', 'labels.SETTINGS'), settingsCommandHandler)
bot.hears(i18n.t('es', 'labels.SETTINGS'), settingsCommandHandler)
bot.hears(i18n.t('ru', 'labels.SETTINGS'), settingsCommandHandler)
bot.hears(i18n.t('it', 'labels.SETTINGS'), settingsCommandHandler)

// Local routes and handlers
router.route('IDLE', (_, next) => next())
router.route(Route.FIREFLY_URL, fireflyUrlRouteHandler)
router.route(Route.FIREFLY_API_URL, fireflyApiUrlRouteHandler)
router.route(Route.FIREFLY_ACCESS_TOKEN, fireflyAccessTokenRouteHandler)
bot.use(router)

export default bot

function settingsText(ctx: MyContext) {
  const {
    fireflyUrl,
    fireflyApiUrl,
    fireflyAccessToken,
    defaultSourceAccount,
  } = ctx.session.userSettings

  // Grab only first 4 and last 4 chars of the token
  const accessToken = fireflyAccessToken?.replace(/(.{4})(.*?)(.{4})$/, '$1...$3')

  return ctx.i18n.t('settings.whatDoYouWantToChange', {
    fireflyUrl,
    fireflyApiUrl,
    accessToken,
    defaultSourceAccount,
  })
}

function settingsCommandHandler(ctx: MyContext) {
  const log = rootLog.extend('settingsCommandHandler')
  log('Entered the settingsCommandHandler...')
  return ctx.reply(
    settingsText(ctx),
    {
      parse_mode: 'Markdown',
      reply_markup: settingsMenu
    }
  )
}

async function doneCbQH(ctx: MyContext) {
  ctx.session.step = 'IDLE'
  return ctx.deleteMessage()
}

async function fireflyAccessTokenRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('fireflyAccessTokenRouteHandler')
  log('Entered fireflyAccessTokenRouteHandler...')
  try {
    log('ctx.msg: %O', ctx.msg)
    const text = ctx.msg!.text as string
    log('User entered text: %s', text)
    log('ctx.session: %O', ctx.session)
    log('text.length: %O', text.length)

    if (text.length < 500) {
      return ctx.reply(ctx.i18n.t('settings.badAccessToken'), {
        reply_markup: cancelMenu
      })
    }

    ctx.session.userSettings.fireflyAccessToken = text
    ctx.session.step = 'IDLE'

    return ctx.reply(
      settingsText(ctx),
      {
        parse_mode: 'Markdown',
        reply_markup: settingsMenu
      }
    )
  } catch (err: any) {
    return handleCallbackQueryError(err, ctx)
  }
}

async function fireflyUrlRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('fireflyUrlRouteHandler')
  log('Entered fireflyUrlRouteHandler...')
  try {
    log('ctx.msg: %O', ctx.msg)
    const text = ctx.msg!.text as string
    log('User entered text: %s', text)
    log('ctx.session: %O', ctx.session)
    const r = new RegExp(/^(http|https):\/\/[^ "]+$/i)
    const valid = r.test(text)
    log('URL is valid: %s', valid)

    if (!valid) {
      return ctx.reply(ctx.i18n.t('settings.badUrl'), {
        reply_markup: cancelMenu
      })
    }

    ctx.session.userSettings.fireflyUrl = text
    ctx.session.userSettings.fireflyApiUrl = `${text}/api`
    ctx.session.step = 'IDLE'

    return ctx.reply(
      settingsText(ctx),
      {
        parse_mode: 'Markdown',
        reply_markup: settingsMenu
      }
    )
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}

async function fireflyApiUrlRouteHandler(ctx: MyContext) {
  const log = rootLog.extend('fireflyApiUrlRouteHandler')
  log('Entered fireflyApiUrlRouteHandler...')
  try {
    log('ctx.msg: %O', ctx.msg)
    const text = ctx.msg!.text as string
    log('User entered text: %s', text)
    log('ctx.session: %O', ctx.session)
    const r = new RegExp(/^(http|https):\/\/[^ "]+$/i)
    const valid = r.test(text)
    log('URL is valid: %s', valid)

    if (!valid) {
      return ctx.reply(ctx.i18n.t('settings.badUrl'), {
        reply_markup: cancelMenu
      })
    }

    ctx.session.userSettings.fireflyApiUrl = text
    ctx.session.step = 'IDLE'

    return ctx.reply(
      settingsText(ctx),
      {
        parse_mode: 'Markdown',
        reply_markup: settingsMenu
      }
    )
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}

async function inputFireflyUrlCbQH(ctx: MyContext) {
  const log = rootLog.extend('inputFireflyUrlCbQH')
  log(`Entered the inputFireflyUrlCbQH action handler`)

  try {
    ctx.session.step = Route.FIREFLY_URL

    await ctx.editMessageText(ctx.i18n.t('settings.inputFireflyUrl'), {
      parse_mode: 'Markdown',
      reply_markup: cancelMenu
    })
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}

async function inputFireflyApiUrlCbQH(ctx: MyContext) {
  const log = rootLog.extend('inputFireflyApiUrlCbQH')
  log(`Entered the inputFireflyApiUrlCbQH action handler`)

  try {
    ctx.session.step = Route.FIREFLY_API_URL

    await ctx.editMessageText(ctx.i18n.t('settings.inputFireflyApiUrl'), {
      parse_mode: 'Markdown',
      reply_markup: cancelMenu
    })
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}

async function inputFireflyAccessTokenCbQH(ctx: MyContext) {
  const log = rootLog.extend('inputFireflyAccessTokenCbQH')
  log(`Entered the inputFireflyAccessTokenCbQH action handler`)
  try {
    ctx.session.step = Route.FIREFLY_ACCESS_TOKEN
    return ctx.editMessageText(ctx.i18n.t('settings.inputFireflyAccessToken'), {
      parse_mode: 'Markdown',
      reply_markup: cancelMenu
    })
  } catch (err: any) {
    cleanupSessionData(ctx)
    return handleCallbackQueryError(err, ctx)
  }
}

async function testConnectionCbQH(ctx: MyContext) {
  const log = rootLog.extend('testConnectionCbQH')
  log('Entered testConnectionCbQH action handler')
  log('ctx: %O', ctx)
  try {
    const userSettings = ctx.session.userSettings
    const { fireflyUrl, fireflyApiUrl, fireflyAccessToken } = userSettings

    if (!fireflyUrl || !fireflyApiUrl) {
      return ctx.reply(
        ctx.i18n.t('settings.specifySmthFirst', { smth: ctx.i18n.t('labels.FIREFLY_URL_BUTTON') }),
        { parse_mode: 'Markdown' }
      )
    }

    if (!fireflyAccessToken) {
      return ctx.reply(
        ctx.i18n.t('settings.specifySmthFirst', { smth: ctx.i18n.t('labels.FIREFLY_ACCESS_TOKEN_BUTTON') }),
        { parse_mode: 'Markdown' }
      )
    }

    const userInfo = (await firefly(userSettings).About.getCurrentUser()).data.data
    log('Firefly user info: %O', userInfo)

    if (!userInfo) return ctx.reply(
      ctx.i18n.t('settings.connectionFailed'),
    )

    return ctx.reply(
      ctx.i18n.t('settings.connectionSuccess', { email: userInfo.attributes.email }),
    )
  } catch (err: any) {
    return handleCallbackQueryError(err, ctx)
  }
}
