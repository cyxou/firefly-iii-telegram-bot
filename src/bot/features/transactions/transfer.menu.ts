import type { Context } from '#root/bot/context.js'
import type { AccountRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { twoColumnRange } from '#root/bot/helpers/menu.js'
import { AccountTypeFilter, TransactionTypeProperty } from '#root/lib/firefly/service.js'
import { buildSplit, toRef } from './create.js'
import { showRecord, staleFlowExit } from './record.js'

// v1 getAccounts: fetch the types in parallel, filter active (service does),
// drop the skip id, and REVERSE (top accounts land near the thumb — v1 quirk).
export async function pickAccounts(ctx: Context, types: AccountTypeFilter[], skipId?: string): Promise<AccountRead[]> {
  const lists = await Promise.all(types.map(t => ctx.firefly.listAccounts(t)))
  return lists.flat().filter(acc => !skipId || acc.id !== skipId).reverse()
}

// ---- deposit: revenue source → asset/liability destination ----

export const newDepositMenu = new Menu<Context>('new-deposit')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    if (!ctx.session.txnFlow)
      return range
    const accounts = await pickAccounts(ctx, [AccountTypeFilter.Revenue])
    twoColumnRange(range, accounts, (r, acc) => {
      r.submenu({ text: () => acc.attributes.name, payload: acc.id }, 'new-deposit-target', async (c) => {
        c.session.txnFlow!.draft.sourceAccount = toRef(acc)
        // markup-less edit: navInstaller injects new-deposit-target
        return c.editMessageText(c.i18n.t('transactions.add.selectDestAccount', { amount: c.session.txnFlow!.draft.amount }), { parse_mode: 'Markdown' })
      })
    })
    return range
  })
  .back('🔙') // v1 parity: re-renders the picker keyboard, text unchanged

export const newDepositTargetMenu = new Menu<Context>('new-deposit-target')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.txnFlow
    if (!flow)
      return range
    const accounts = await pickAccounts(ctx, [AccountTypeFilter.Asset, AccountTypeFilter.Liability])
    twoColumnRange(range, accounts, (r, acc) => {
      r.text({ text: () => acc.attributes.name, payload: acc.id }, async (c) => {
        const f = c.session.txnFlow
        if (!f)
          return staleFlowExit(c)
        f.draft.destAccount = toRef(acc)
        const tr = await c.firefly.storeTransaction(buildSplit(f.draft, TransactionTypeProperty.Deposit))
        c.session.txnFlow = undefined
        return showRecord(c, tr, true)
      })
    })
    return range
  })
  .back('🔙')

// ---- transfer: asset/liability → asset/liability (skip source), maybe foreign ----

export const newTransferMenu = new Menu<Context>('new-transfer')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    if (!ctx.session.txnFlow)
      return range
    const accounts = await pickAccounts(ctx, [AccountTypeFilter.Asset, AccountTypeFilter.Liability])
    twoColumnRange(range, accounts, (r, acc) => {
      r.submenu({ text: () => acc.attributes.name, payload: acc.id }, 'new-transfer-target', async (c) => {
        c.session.txnFlow!.draft.sourceAccount = toRef(acc)
        return c.editMessageText(c.i18n.t('transactions.add.selectDestAccount', { amount: c.session.txnFlow!.draft.amount }), { parse_mode: 'Markdown' })
      })
    })
    return range
  })
  .back('🔙')

export const newTransferTargetMenu = new Menu<Context>('new-transfer-target')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.txnFlow
    if (!flow)
      return range
    const accounts = await pickAccounts(ctx, [AccountTypeFilter.Asset, AccountTypeFilter.Liability], flow.draft.sourceAccount?.id)
    twoColumnRange(range, accounts, (r, acc) => {
      r.submenu({ text: () => acc.attributes.name, payload: acc.id }, 'txn-foreign', async (c) => {
        const f = c.session.txnFlow
        if (!f)
          return staleFlowExit(c)
        const dest = toRef(acc)
        f.draft.destAccount = dest
        // v1 loose != (kept as strict !== — both sides are string|undefined, so
        // no coercion differs): mismatch incl. either side unknown asks for
        // the foreign amount
        if (f.draft.sourceAccount?.currencyId !== dest.currencyId) {
          f.step = 'foreign_amount'
          f.promptMessage = { chatId: c.chat!.id, messageId: c.msg!.message_id }
          // markup-less edit injects txn-foreign (the 🔙 prompt keyboard)
          return c.editMessageText(c.i18n.t('transactions.add.typeForeignAmount', {
            destCurrency: dest.currencySymbol ?? '',
            sourceCurrency: f.draft.sourceAccount?.currencySymbol ?? '',
          }), { parse_mode: 'Markdown' })
        }
        const tr = await c.firefly.storeTransaction(buildSplit(f.draft))
        c.session.txnFlow = undefined
        return showRecord(c, tr, true)
      })
    })
    return range
  })
  .back('🔙')

// Prompt keyboard while waiting for the foreign amount. Plain-button re-point
// at a registered menu passes the menu EXPLICITLY (no nav injection happens
// for plain buttons — legacy add-transactions-menus.ts:336 was right).
export const txnForeignMenu = new Menu<Context>('txn-foreign')
  .text('🔙', async (c) => {
    const flow = c.session.txnFlow
    if (!flow)
      return c.deleteMessage()
    flow.step = undefined
    return c.editMessageText(c.i18n.t('transactions.add.selectDestAccount', { amount: flow.draft.amount }), {
      parse_mode: 'Markdown',
      reply_markup: newTransferTargetMenu,
    })
  })
