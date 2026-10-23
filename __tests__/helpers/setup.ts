// Unit/integration tests run bots with an in-memory session storage, so no
// Redis is needed for `bunx vitest run`. Besides parity with the e2e setup,
// this file hosts shared fixtures. The BOT_TOKEN default keeps the config
// singleton in src/config.js from throwing at import time in environments
// without a .env (CI).
import { afterEach } from 'vitest'
import { expectNoRichViolations } from './rich-validate.js'

process.env.BOT_TOKEN ??= '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'

// Any test whose bot sent structurally invalid rich markdown (GFM rules the
// mock cannot render) fails here, loudly — live-bug class 8wh.
afterEach(() => {
  expectNoRichViolations()
})
