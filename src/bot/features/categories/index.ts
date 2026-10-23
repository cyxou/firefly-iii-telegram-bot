import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import {
  categoriesConfirmMenu,
  categoriesMenu,
  categoryDeleteMenu,
  categoryDetailsMenu,
  categoryFlowCancelMenu,
  showCategoriesList,
} from './categories.menu.js'
import { categoriesRouter } from './categories.router.js'

export const categoriesFeature = new Composer<Context>()

categoriesMenu.register(categoryDetailsMenu) // deepest-first
categoriesMenu.register(categoryDeleteMenu)
categoriesMenu.register(categoriesConfirmMenu)
categoriesMenu.register(categoryFlowCancelMenu)

categoriesFeature.use(categoriesMenu)
categoriesFeature.use(categoriesRouter)

for (const locale of locales) {
  categoriesFeature.hears(i18n.t(locale, 'labels.CATEGORIES'), async ctx => showCategoriesList(ctx, false))
}
