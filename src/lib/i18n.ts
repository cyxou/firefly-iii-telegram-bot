import path from 'path'
import { I18n, pluralize } from '@grammyjs/i18n';

import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import 'dayjs/locale/ru'
import 'dayjs/locale/en'
import 'dayjs/locale/es'

const defaultLanguage = 'en'

dayjs.locale(defaultLanguage)
dayjs.extend(localizedFormat)

const params = {
  directory: path.resolve(__dirname, '../locales'),
  defaultLanguage: defaultLanguage,
  defaultLanguageOnMissing: true,
  sessionName: 'session',
  useSession: true,
  allowMissing: false,
  templateData: {
    pluralize,
    uppercase: (value: string) => value.toUpperCase(),
  }
}

const i18n = new I18n(params)

export const locales = ['ru', 'it', 'en', 'es']

export default i18n
