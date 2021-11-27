import path from 'path'
import { I18n, pluralize } from '@grammyjs/i18n';

const params = {
  directory: path.resolve(__dirname, '../locales'),
  defaultLanguage: 'ru',
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

export default i18n
