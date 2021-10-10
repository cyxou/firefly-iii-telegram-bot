import type { Context, SessionFlavor } from 'grammy'
import { SessionData } from './SessionData'
import type { ParseModeContext } from '@grammyjs/parse-mode'

export type MyContext = Context & ParseModeContext & SessionFlavor<SessionData>
