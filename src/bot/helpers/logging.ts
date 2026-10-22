import type { Update } from '@grammyjs/types'
import type { Context } from '#root/bot/context.js'

export function getUpdateInfo(ctx: Context): Omit<Update, 'update_id'> {
  const { update_id, ...update } = ctx.update
  return update
}
