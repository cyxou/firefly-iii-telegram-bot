import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import {
  categoriesMenu,
  categoryDeleteMenu,
  categoryDetailsMenu,
  categoryFlowCancelMenu,
  showCategoriesList,
} from './categories.menu.js'

export const categoriesFeature = new Composer<Context>()

categoriesMenu.register(categoryDetailsMenu) // deepest-first
categoriesMenu.register(categoryDeleteMenu)
categoriesMenu.register(categoryFlowCancelMenu)

categoriesFeature.use(categoriesMenu)
// categoriesRouter lands in Task 8

for (const locale of locales) {
  categoriesFeature.hears(i18n.t(locale, 'labels.CATEGORIES'), async ctx => showCategoriesList(ctx, false))
}
