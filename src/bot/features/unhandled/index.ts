import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'

// Chain terminator (must stay last). Text is fully owned by the transactions
// add-flow since Phase 3 — unrecognized text gets the dontUnderstand reply
// there; non-text updates end here silently (v1 parity).
export const unhandledFeature = new Composer<Context>()
