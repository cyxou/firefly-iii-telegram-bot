import type { Context } from '#root/bot/context.js'
import { Menu } from '@grammyjs/menu'

// url button via @grammyjs/menu — raw InlineKeyboard is lint-banned
export const openAssetAccountsMenu = new Menu<Context>('open-asset-accounts').url(
  (ctx) => ctx.i18n.t('labels.OPEN_ASSET_ACCOUNTS_IN_BROWSER'),
  (ctx) => `${ctx.settings?.fireflyUrl ?? ''}/accounts/asset`,
)
