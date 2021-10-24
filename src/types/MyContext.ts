import type { Context, SessionFlavor } from 'grammy'
import { SessionData } from './SessionData'
import { I18nContext } from '@grammyjs/i18n';

export type MyContext = Context & SessionFlavor<SessionData> & {
  readonly i18n: I18nContext;
}
