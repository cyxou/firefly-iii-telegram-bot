import path from 'node:path'
import { I18n, pluralize } from '@grammyjs/i18n'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'

import 'dayjs/locale/ru'
import 'dayjs/locale/en'
import 'dayjs/locale/es'
import 'dayjs/locale/it'

const defaultLanguage = 'en'

dayjs.locale(defaultLanguage)
dayjs.extend(localizedFormat)

const i18n = new I18n({
  directory: path.resolve(import.meta.dirname, '../../locales'),
  defaultLanguage,
  defaultLanguageOnMissing: true,
  useSession: false, // v1 had true; v2 keeps the language of record in the settings store
  allowMissing: false,
  templateData: {
    pluralize,
    uppercase: (value: string) => value.toUpperCase(),
  },
})

const locales = ['ru', 'it', 'en', 'es'] as const

export { defaultLanguage, i18n, locales }
