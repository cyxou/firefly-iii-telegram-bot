import type { Context } from '#root/bot/context.js'
import type { AccountRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { markdownTable } from '#root/bot/helpers/rich.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'

const ACCOUNT_TYPES = [
  AccountTypeFilter.Asset,
  AccountTypeFilter.Expense,
  AccountTypeFilter.Revenue,
  AccountTypeFilter.Liability,
] as const

function labelKey(type: AccountTypeFilter): string {
  return `accounts.labels.${String(type).toLowerCase()}`
}

// Tab bar: all four types visible; the active one renders disabled (menu@1.5).
// v1 instead HID the active tab — flagged micro-deviation in the spec amendments.
export const accountsMenu = new Menu<Context>('accounts')
  .dynamic((ctx) => {
    const range = new MenuRange<Context>()
    const view = String(ctx.session.lists?.accounts?.view ?? AccountTypeFilter.Asset)
    for (const type of ACCOUNT_TYPES) {
      const label = (c: Context) => c.i18n.t(labelKey(type))
      if (String(type) === view) {
        range.disabled(label).row()
      }
      else {
        range.text({ text: label, payload: String(type) }, async (c) => {
          c.session.lists = { ...c.session.lists, accounts: { view: String(type) } }
          await showAccounts(c, true)
        }).row()
      }
    }
    range.text(c => c.i18n.t('labels.DONE'), async (c) => {
      await c.deleteMessage()
    })
    return range
  })

/** Render the accounts list. `edit` = swap an existing list message (tab click). */
export async function showAccounts(ctx: Context, edit: boolean) {
  const view = (ctx.session.lists?.accounts?.view ?? AccountTypeFilter.Asset) as AccountTypeFilter
  // ponytail: single 100-account fetch per view (v1 ceiling); prev/next paging arrives with Phase 3.
  const accounts = await ctx.firefly.listAccounts(view, dayjs().format('YYYY-MM-DD'))
  ctx.session.lists = { ...ctx.session.lists, accounts: { view: String(view) } }
  const markdown = accountsMarkdown(ctx, view, accounts)
  if (edit) {
    await ctx.editMessageText({ markdown }, { reply_markup: accountsMenu })
  }
  else {
    await ctx.replyWithRichMessage({ markdown }, { reply_markup: accountsMenu })
  }
}

function accountsMarkdown(ctx: Context, view: AccountTypeFilter, accounts: AccountRead[]): string {
  const rows = accounts.map(acc => [
    acc.attributes.name,
    Number.parseFloat(acc.attributes.current_balance || '').toFixed(acc.attributes.currency_decimal_places ?? 2),
    acc.attributes.currency_symbol ?? '',
  ])
  // GFM: a table cannot interrupt a paragraph — the leading/trailing \n plus the
  // template's single blank line give the header row the blank line it needs
  // (live bug 8wh: pipes rendered as literal text without it)
  const table = rows.length
    ? `\n${markdownTable(
      [ctx.i18n.t('tables.name'), ctx.i18n.t('tables.balance'), ctx.i18n.t('tables.currency')],
      rows,
      ['left', 'right', 'left'],
    )}\n`
    : ctx.i18n.t('accounts.list.noAccounts')
  return ctx.i18n.t(`accounts.list.${String(view).toLowerCase()}`, {
    accounts: table,
    sums: accountSums(accounts),
  })
}

// Port of v1's reduce(): Math.ceil applied to the RUNNING sum after every
// addition — a quirk, kept verbatim (behavior-preserving port).
function accountSums(accounts: AccountRead[]): string {
  const sums: Record<string, number> = {}
  for (const acc of accounts) {
    const currency = acc.attributes.currency_symbol || '💲'
    sums[currency] = Math.ceil((sums[currency] ?? 0) + Number.parseFloat(acc.attributes.current_balance || ''))
  }
  return Object.entries(sums).map(([currency, sum]) => `${sum} ${currency}`).join('\n')
}
