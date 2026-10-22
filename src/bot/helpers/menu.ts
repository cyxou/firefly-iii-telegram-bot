import type { MenuRange } from '@grammyjs/menu'
import type { Context } from '#root/bot/context.js'

/**
 * Append items two per row (v1 category-list layout). The last item always
 * ends its row so following buttons start on a fresh row.
 */
export function twoColumnRange<C extends Context, T>(
  range: MenuRange<C>,
  items: readonly T[],
  add: (range: MenuRange<C>, item: T) => void,
): void {
  items.forEach((item, i) => {
    add(range, item)
    if (i % 2 !== 0 || i === items.length - 1)
      range.row()
  })
}
