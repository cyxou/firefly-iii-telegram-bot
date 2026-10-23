import type { Context } from '#root/bot/context.js'
import { Menu, MenuRange } from '@grammyjs/menu'

// The record message's keyboard: the Edit submenu only (v1 parity — v1 skipped
// the button when session.currentTransaction was lost; recordTrId is that
// field, reduced to an id). The payload bakes the id at render time, so a
// stale render can only *miss* the button, never mis-target the click.
export const recordMenu = new Menu<Context>('txn-record').dynamic((ctx) => {
  const range = new MenuRange<Context>()
  const trId = ctx.session.recordTrId
  if (trId) {
    range.submenu(
      {
        text: () => ctx.i18n.t('labels.EDIT_TRANSACTION'),
        payload: trId,
      },
      'edit-transaction',
    )
  }
  return range
})
