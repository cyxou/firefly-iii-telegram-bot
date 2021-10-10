import type { Context, SessionFlavor } from 'grammy'
import { SessionData } from './SessionData'

export type MyContext = Context & SessionFlavor<SessionData>
