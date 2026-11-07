// issue #72: single source for the bot version — read from package.json at
// build/import time (static JSON import, never a cwd-dependent file read).
import pkg from '../package.json'

export const BOT_VERSION: string = pkg.version
