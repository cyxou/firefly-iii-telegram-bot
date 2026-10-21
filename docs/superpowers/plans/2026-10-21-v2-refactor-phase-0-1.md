# v2 Refactor — Phase 0 & 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the v2 core (Bun + ESM + Redis sessions + DI + test harness) and port the settings feature with durable credential storage and a v1 session migration script.

**Architecture:** `createBot(token, deps)` factory with injectable dependencies (config, logger, settings store, Firefly service factory, session storage). Features are Grammy composers under `src/bot/features/`. Interactive UI is `@grammyjs/menu` only. Flow state lives in per-flow session fields; credentials live in a JSON settings store, not the session. Tests drive real bots through `bot.handleUpdate()` against a mock Telegram API transformer.

**Tech Stack:** Bun, TypeScript 5.9 (strict, ESM, `#root/*` aliases), grammy 1.39.3, @grammyjs/menu 1.3.1, @grammyjs/router 2.0.0, @grammyjs/runner 2.0.3, @grammyjs/storage-redis 2.5.1, **@grammyjs/i18n 0.5.1 (YAML locales — do NOT upgrade to 1.x, it is Fluent-only)**, ioredis 5.9.2, pino 10.3, valibot 1.2, axios 1.2.6 (generated client), vitest 4.0.18.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-refactor-design.md` (Phases 0–1 of 6; Phases 2–5 get their own plans after this lands)

## Global Constraints

- All work happens in the worktree on branch `feat/major-refactoring` (`/home/alex/.herdr/worktrees/firefly-iii-telegram-bot/feat-major-refactoring`). `master` is never touched — it keeps v1 deployable until Phase 5 cutover.
- Two deviations from the spec's letter, flagged for the owner at plan review:
  1. v1 source moves to `legacy/` in Task 1 (spec said "old src untouched until Phase 5"). Intent preserved: master stays deployable, legacy/ remains as porting reference; avoids running two module systems from one package.json.
  2. v1's `@grammyjs/ratelimiter` is dropped (spec's middleware chain omits it; access control + sequentialize remain).
- `legacy/` is reference-only: excluded from tsc, eslint, vitest, lint tests. Never import from it.
- Dependency floor: no dependencies beyond those listed in Tech Stack (plus dev tooling). No `@grammyjs/conversations` ever (lint-tested).
- i18n stays `@grammyjs/i18n@0.5.1` with YAML locales in `/locales` (moved from `src/locales`). Locale keys are reused verbatim from v1 — no key renames in this plan.
- `src/lib/firefly/generated/` is OpenAPI-generated (typescript-axios): never hand-edit, except `model/currency-update.ts` which is a hand-preserved file that survives regeneration.
- Every task ends with a commit on `feat/major-refactoring`. Run `bunx vitest run` before each commit.
- Logging: pino (`ctx.logger` per-update child). No `debug`, no `console.log` (exception: nothing — pino only).

## File Structure (final state after this plan)

```
feat/major-refactoring worktree:
├── legacy/                          # v1 src/, reference only
├── locales/                         # moved from src/locales (en/es/it/ru YAML)
├── data/settings.json               # durable credentials (gitignored)
├── src/
│   ├── main.ts                      # polling entry, graceful shutdown
│   ├── config.ts                    # valibot env config
│   ├── logger.ts
│   ├── bot/
│   │   ├── index.ts                 # createBot + middleware chain
│   │   ├── context.ts               # Context flavor + SessionData
│   │   ├── i18n.ts
│   │   ├── handlers/error.ts
│   │   ├── menus/index.ts           # registerCoreMenus
│   │   ├── middlewares/session.ts, access-control.ts, locale.ts
│   │   ├── helpers/keyboard.ts      # main reply keyboard
│   │   └── features/
│   │       ├── start/index.ts
│   │       ├── settings/{index.ts, settings.menu.ts, settings.router.ts}
│   │       └── unhandled/index.ts
│   └── lib/
│       ├── redis.ts
│       ├── session.ts               # RedisAdapter factory
│       ├── settings-store.ts
│       ├── errors.ts                # Firefly error classes
│       └── firefly/
│           ├── generated/           # moved api/ + model/ + configuration.ts
│           ├── api.ts               # hand barrel (paths fixed after move)
│           ├── client.ts            # cached client factory, interceptor-once
│           └── service.ts           # FireflyService (injected via deps)
├── scripts/migrate-v1-sessions.ts
├── __tests__/
│   ├── helpers/{setup.ts, bot.ts}   # mock API harness + fakes
│   ├── lint/architecture.test.ts
│   ├── features/start/…
│   ├── features/settings/…
│   └── e2e/session-storage.test.ts
├── docker-compose.tests.yaml        # redis only, port 6380
├── vitest.config.ts / vitest.config.e2e.ts
└── CLAUDE.md                        # rewritten for v2 (Task 13)
```

---

### Task 1: Branch scaffold — move v1 to legacy/, new toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `vitest.config.e2e.ts`, `docker-compose.tests.yaml`, `.env.example` (append)
- Move: `src/` → `legacy/` (except locales and firefly generated code, see steps)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `bun install` / `bunx vitest run --passWithNoTests` / `bunx tsc --noEmit` all green; `#root/*` → `./src/*` alias active

- [ ] **Step 1: Verify the worktree branch and move v1 out of the way**

```bash
git branch --show-current   # must print: feat/major-refactoring
git mv src legacy
git mv legacy/locales locales
mkdir -p src/lib/firefly/generated
git mv legacy/lib/firefly/api src/lib/firefly/generated/api
git mv legacy/lib/firefly/model src/lib/firefly/generated/model
git mv legacy/lib/firefly/configuration.ts src/lib/firefly/generated/configuration.ts
git mv legacy/lib/firefly/api.ts src/lib/firefly/api.ts
# if legacy/lib/firefly/configuration-api.ts and/or .openapi-generator-ignore exist, also:
#   git mv legacy/lib/firefly/configuration-api.ts src/lib/firefly/generated/
#   git mv legacy/lib/firefly/.openapi-generator-ignore src/lib/firefly/generated/
```

- [ ] **Step 2: Fix the hand barrel's import paths**

`src/lib/firefly/api.ts` re-exports from `./api/...` and `./model/...` — after the move those live under `./generated/`:

```bash
cd src/lib/firefly
sed -i "s|'\./api/|'./generated/api/|g; s|'\./model/|'./generated/model/|g" api.ts
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "firefly-iii-telegram-bot",
  "type": "module",
  "version": "3.0.0-rc.0",
  "private": true,
  "imports": { "#root/*": "./src/*" },
  "scripts": {
    "dev": "bun run --watch ./src/main.ts",
    "start": "bun run ./src/main.ts",
    "typecheck": "tsc",
    "lint": "eslint .",
    "fix": "eslint . --fix",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "vitest run --config vitest.config.e2e.ts",
    "codegen": "openapi-generator-cli generate -i https://raw.githubusercontent.com/firefly-iii/api-docs/v6.7.8/dist/firefly-iii-v6.7.8-v1.yaml -o src/lib/firefly/generated -g typescript-axios -c .openapi-generator-config.yaml --skip-validate-spec"
  },
  "dependencies": {
    "@grammyjs/i18n": "0.5.1",
    "@grammyjs/menu": "1.3.1",
    "@grammyjs/router": "2.0.0",
    "@grammyjs/runner": "2.0.3",
    "@grammyjs/storage-redis": "2.5.1",
    "axios": "1.2.6",
    "dayjs": "1.11.7",
    "grammy": "1.39.3",
    "ioredis": "5.9.2",
    "pino": "10.3.0",
    "pino-pretty": "13.1.3",
    "valibot": "1.2.0"
  },
  "devDependencies": {
    "@antfu/eslint-config": "7.2.0",
    "@openapitools/openapi-generator-cli": "2.5.2",
    "@types/bun": "1.3.8",
    "eslint": "9.9.2",
    "typescript": "5.9.3",
    "vitest": "4.0.18"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "paths": { "#root/*": ["./src/*"] }
  },
  "include": ["src", "__tests__", "scripts"],
  "exclude": ["legacy", "node_modules", "dist"]
}
```

- [ ] **Step 5: Write `eslint.config.js`**

```js
import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['legacy/**', 'dist/**', 'src/lib/firefly/generated/**', 'data/**'],
})
```

- [ ] **Step 6: Write `vitest.config.ts` and `vitest.config.e2e.ts`**

```ts
// vitest.config.ts
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.{test,spec}.ts'],
    exclude: [...configDefaults.exclude, '**/__tests__/e2e/**'],
    setupFiles: ['__tests__/helpers/setup.ts'],
    fileParallelism: false,
    testTimeout: 10000,
    globals: true,
  },
  resolve: { alias: { '#root': path.resolve(import.meta.dirname, './src') } },
})
```

```ts
// vitest.config.e2e.ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// E2E: real Redis from docker-compose.tests.yaml (port 6380). Telegram is still mocked.
export default defineConfig({
  test: {
    include: ['__tests__/e2e/**/*.test.ts'],
    setupFiles: ['__tests__/e2e/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    globals: true,
  },
  resolve: { alias: { '#root': path.resolve(import.meta.dirname, './src') } },
})
```

- [ ] **Step 7: Write `docker-compose.tests.yaml` (Redis only — no Postgres in this project)**

```yaml
services:
  redis-test:
    image: redis:7-alpine
    container_name: firefly-bot-redis-test
    restart: no
    ports:
      - '6380:6379'
    healthcheck:
      test: [CMD, redis-cli, ping]
      interval: 2s
      timeout: 2s
      retries: 10
      start_period: 3s
```

- [ ] **Step 8: `.gitignore` additions and `.env.example`**

Append to `.gitignore`:

```
data/
```

Append to `.env.example` (create if absent):

```
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
```

- [ ] **Step 9: Verify**

```bash
bun install
bunx tsc --noEmit        # may pass trivially: no src/*.ts yet — the moved firefly
                         # code is under src/ so this DOES typecheck the barrel move
bunx vitest run --passWithNoTests
```

Expected: install clean, tsc reports no errors in `src/lib/firefly/**` (if the barrel sed missed a path, fix the remaining imports by hand), vitest finds no tests and exits 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore(v2): scaffold Bun+ESM toolchain, move v1 to legacy/, relocate firefly client"
```

---

### Task 2: `config.ts` + `logger.ts`

**Files:**
- Create: `src/config.ts`, `src/logger.ts`
- Test: `__tests__/config.test.ts`

**Interfaces:**
- Produces:
  - `interface Config` (inferred) with fields: `botToken: string`, `allowedUserIds: number[]`, `disableUnauthorizedUserLog: boolean`, `redisUrl: string`, `fireflyUrl: string`, `fireflyApiUrl: string`, `fireflyAccessToken: string`, `logLevel: string`
  - `createConfig(input: Record<string, string | undefined>): Config` — pure, testable
  - `const config: Config` — env singleton (imported only by `src/main.ts`)
  - `const logger: Logger` + `type Logger` (pino)

- [ ] **Step 1: Write failing tests for `createConfig`**

```ts
// __tests__/config.test.ts
import { describe, expect, it } from 'vitest'
import { createConfig } from '#root/config.js'

describe('createConfig', () => {
  it('parses a valid env map', () => {
    const c = createConfig({
      BOT_TOKEN: '123456:ABCdef',
      ALLOWED_TG_USER_IDS: '1, 22 ,333',
      DISABLE_UNAUTHORIZED_USER_LOG: 'true',
      REDIS_URL: 'redis://localhost:6380',
      FIREFLY_URL: 'https://ff.example.com',
    })
    expect(c.botToken).toBe('123456:ABCdef')
    expect(c.allowedUserIds).toEqual([1, 22, 333])
    expect(c.disableUnauthorizedUserLog).toBe(true)
    expect(c.redisUrl).toBe('redis://localhost:6380')
    expect(c.fireflyUrl).toBe('https://ff.example.com')
    expect(c.fireflyApiUrl).toBe('https://ff.example.com/api') // derived default
  })

  it('defaults: empty allowlist, no redis url override, env firefly blank', () => {
    const c = createConfig({ BOT_TOKEN: '123456:ABCdef' })
    expect(c.allowedUserIds).toEqual([])
    expect(c.disableUnauthorizedUserLog).toBe(false)
    expect(c.redisUrl).toBe('redis://localhost:6379')
    expect(c.fireflyUrl).toBe('')
  })

  it('rejects a malformed bot token', () => {
    expect(() => createConfig({ BOT_TOKEN: 'nope' })).toThrow()
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/config.test.ts`
Expected: FAIL (`Cannot find module '#root/config.js'`)

- [ ] **Step 3: Implement `src/config.ts`**

```ts
import process from 'node:process'
import * as v from 'valibot'

const csvNumbers = v.optional(
  v.pipe(
    v.string(),
    v.transform(s => s.split(',').map(x => Number(x.trim())).filter(n => !Number.isNaN(n) && n !== 0)),
    v.array(v.number()),
  ),
  '',
)

const configSchema = v.object({
  botToken: v.pipe(v.string(), v.regex(/^\d+:[\w-]+$/, 'Invalid BOT_TOKEN')),
  allowedUserIds: csvNumbers,
  disableUnauthorizedUserLog: v.optional(v.pipe(v.string(), v.transform(s => s === 'true')), false),
  redisUrl: v.optional(v.string(), 'redis://localhost:6379'),
  logLevel: v.optional(v.string(), 'info'),
  fireflyUrl: v.optional(v.string(), ''),
  fireflyApiUrl: v.optional(v.string(), ''),
  fireflyAccessToken: v.optional(v.string(), ''),
})

export type Config = v.InferOutput<typeof configSchema>

export function createConfig(input: v.InferInput<typeof configSchema>): Config {
  const parsed = v.parse(configSchema, input)
  return {
    ...parsed,
    fireflyApiUrl: parsed.fireflyApiUrl || (parsed.fireflyUrl ? `${parsed.fireflyUrl.replace(/\/+$/, '')}/api` : ''),
  }
}

export const config = createConfigFromEnvironment()

function createConfigFromEnvironment(): Config {
  try {
    process.loadEnvFile()
  }
  catch {
    // no .env file — CI provides env directly
  }
  return createConfig({
    botToken: process.env.BOT_TOKEN ?? '',
    allowedUserIds: process.env.ALLOWED_TG_USER_IDS,
    disableUnauthorizedUserLog: process.env.DISABLE_UNAUTHORIZED_USER_LOG,
    redisUrl: process.env.REDIS_URL,
    logLevel: process.env.LOG_LEVEL,
    fireflyUrl: process.env.FIREFLY_URL,
    fireflyApiUrl: process.env.FIREFLY_API_URL,
    fireflyAccessToken: process.env.FIREFLY_ACCESS_TOKEN,
  })
}
```

- [ ] **Step 4: Implement `src/logger.ts`**

```ts
import process from 'node:process'
import { pino } from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.stdout.isTTY ? { transport: { target: 'pino-pretty' } } : {}),
})

export type Logger = typeof logger
```

- [ ] **Step 5: Run tests — expect pass**

Run: `bunx vitest run __tests__/config.test.ts`
Expected: 3 passed. Also `bunx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/logger.ts __tests__/config.test.ts
git commit -m "feat(v2): valibot env config + pino logger"
```

---

### Task 3: i18n module, context types, error classes

**Files:**
- Create: `src/bot/i18n.ts`, `src/bot/context.ts`, `src/lib/errors.ts`
- Test: `__tests__/bot/i18n.test.ts`

**Interfaces:**
- Produces:
  - `const i18n: I18n` (0.5.1 API: `i18n.middleware()`, `i18n.t(locale, key)`, `ctx.i18n.t(key)`), `const locales: readonly ['ru', 'it', 'en', 'es']`, `const defaultLanguage = 'en'`
  - `interface SessionData { settingsFlow?: { step: SettingsFlowStep } }`, `type SettingsFlowStep = 'url' | 'api_url' | 'token'` — later phases append their own flow fields; a lint test (Task 10) forbids reintroducing a shared top-level `step`
  - `type Context` = grammy Context with flavors: `config`, `logger`, `settings`, `firefly`, `saveSettings`, `session`, `i18n`, `menu`
  - `class AuthenticationError | HostNotFoundError | BadRequestError | ResourceNotFoundError extends Error` (ported verbatim from `legacy/src/lib/errorHandler.ts:7-33`)

- [ ] **Step 1: Write failing locale-integrity test**

```ts
// __tests__/bot/i18n.test.ts
import { describe, expect, it } from 'vitest'
import { defaultLanguage, i18n, locales } from '#root/bot/i18n.js'

describe('i18n locales', () => {
  it('exposes all four locales', () => {
    expect(locales).toEqual(['ru', 'it', 'en', 'es'])
  })

  it('translates a known key in every locale', () => {
    for (const locale of locales) {
      expect(i18n.t(locale, 'settings.selectBotLang')).toContain('language')
    }
  })

  it('falls back to default language on missing key', () => {
    expect(defaultLanguage).toBe('en')
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/bot/i18n.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/bot/i18n.ts` (port of `legacy/src/lib/i18n.ts`, ESM, root locales dir)**

```ts
import path from 'node:path'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { I18n, pluralize } from '@grammyjs/i18n'

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
  templateData: { pluralize, uppercase: (value: string) => value.toUpperCase() },
})

const locales = ['ru', 'it', 'en', 'es'] as const

export { i18n, locales, defaultLanguage }
```

Note: `useSession: false` — Task 8's locale middleware sets `ctx.i18n.locale()` from durable settings instead, so `__language_code` never enters the session.

- [ ] **Step 4: Implement `src/lib/errors.ts`**

Copy the four error classes verbatim from `legacy/src/lib/errorHandler.ts:7-33` (AuthenticationError, HostNotFoundError, BadRequestError, ResourceNotFoundError), converting `import Debug from 'debug'` away (no logger inside plain error classes).

```ts
export class AuthenticationError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class HostNotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'HostNotFoundError'
  }
}

export class BadRequestError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'BadRequestError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'ResourceNotFoundError'
  }
}
```

- [ ] **Step 5: Implement `src/bot/context.ts`**

```ts
import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { FireflyService } from '#root/lib/firefly/service.js'
import type { UserSettings } from '#root/lib/settings-store.js'
import type { MenuFlavor } from '@grammyjs/menu'
import type { I18n } from '@grammyjs/i18n'
import type { Context as DefaultContext, SessionFlavor } from 'grammy'

export type SettingsFlowStep = 'url' | 'api_url' | 'token'

// One optional field per concurrent flow. NEVER add a shared `step` field
// (lint-tested in __tests__/lint/architecture.test.ts).
export interface SessionData {
  settingsFlow?: { step: SettingsFlowStep }
}

interface ExtendedContextFlavor {
  config: Config
  logger: Logger
  settings: UserSettings | undefined
  firefly: FireflyService
  saveSettings: (settings: UserSettings) => Promise<void>
  i18n: I18n
}

export type Context = DefaultContext
  & ExtendedContextFlavor
  & SessionFlavor<SessionData>
  & MenuFlavor
```

(`Task 5` defines `FireflyService`; until then keep the import behind `import type` — tsc passes because Task 5 lands before any runtime use. If you execute tasks strictly in order, create a minimal placeholder file is NOT allowed — instead execute Task 5's `service.ts` interface first if tsc complains. The declared execution order below resolves this: Task 5 precedes the first file that imports `Context` at runtime.)

- [ ] **Step 6: Run tests + typecheck**

Run: `bunx vitest run __tests__/bot/i18n.test.ts && bunx tsc --noEmit`
Expected: 3 passed; tsc will report `Cannot find module '#root/lib/firefly/service.js'` and `'#root/lib/settings-store.js'` — **expected at this point**, both land in Tasks 4–5. Commit anyway (branch is WIP); re-run `bunx tsc --noEmit` after Task 5 and confirm clean.

- [ ] **Step 7: Commit**

```bash
git add src/bot/i18n.ts src/bot/context.ts src/lib/errors.ts __tests__/bot/i18n.test.ts
git commit -m "feat(v2): i18n (YAML, settings-driven locale), context types, firefly error classes"
```

---

### Task 4: Settings store (durable credentials)

**Files:**
- Create: `src/lib/settings-store.ts`
- Test: `__tests__/lib/settings-store.test.ts`

**Interfaces:**
- Produces (consumed by Task 8's createBot, Task 11's settings feature, Task 12's migration):
  - `interface AccountRef { id: string; type: string; name: string }`
  - `interface UserSettings { fireflyUrl: string; fireflyApiUrl: string; fireflyAccessToken: string; defaultSourceAccount: AccountRef; defaultDestinationAccount: AccountRef; language: string }`
  - `interface SettingsStore { get(userId: number): Promise<UserSettings | undefined>; save(userId: number, settings: UserSettings): Promise<void> }`
  - `defaultSettings(overrides?: Partial<UserSettings>): UserSettings`
  - `createFileSettingsStore(filePath: string): SettingsStore`
  - `createMemorySettingsStore(seed?: Record<number, UserSettings>): SettingsStore`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/lib/settings-store.test.ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createFileSettingsStore,
  createMemorySettingsStore,
  defaultSettings,
} from '#root/lib/settings-store.js'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.map(d => Bun.$`rm -rf ${d}`)); dirs.length = 0 })

describe('settings store', () => {
  it('round-trips settings through a JSON file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ffbot-'))
    dirs.push(dir)
    const file = path.join(dir, 'settings.json')
    const store = createFileSettingsStore(file)

    const s = defaultSettings({ fireflyUrl: 'https://ff.example.com', fireflyApiUrl: 'https://ff.example.com/api' })
    await store.save(1111111, s)

    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    expect(onDisk['1111111'].fireflyUrl).toBe('https://ff.example.com')
    expect((await store.get(1111111))?.fireflyUrl).toBe('https://ff.example.com')
  })

  it('returns undefined for unknown users and tolerates missing file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ffbot-'))
    dirs.push(dir)
    const store = createFileSettingsStore(path.join(dir, 'absent.json'))
    await expect(store.get(42)).resolves.toBeUndefined()
  })

  it('defaultSettings seeds language en and empty account refs', () => {
    const s = defaultSettings()
    expect(s.language).toBe('en')
    expect(s.defaultSourceAccount).toEqual({ id: '', type: '', name: '' })
    expect(s.fireflyAccessToken).toBe('')
  })

  it('memory store is independent per instance', async () => {
    const a = createMemorySettingsStore()
    const b = createMemorySettingsStore()
    await a.save(1, defaultSettings({ fireflyUrl: 'u' }))
    expect(await b.get(1)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/lib/settings-store.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/lib/settings-store.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface AccountRef {
  id: string
  type: string
  name: string
}

export interface UserSettings {
  fireflyUrl: string
  fireflyApiUrl: string
  fireflyAccessToken: string
  defaultSourceAccount: AccountRef
  defaultDestinationAccount: AccountRef
  language: string
}

export interface SettingsStore {
  get(userId: number): Promise<UserSettings | undefined>
  save(userId: number, settings: UserSettings): Promise<void>
}

export function defaultSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    fireflyUrl: '',
    fireflyApiUrl: '',
    fireflyAccessToken: '',
    defaultSourceAccount: { id: '', type: '', name: '' },
    defaultDestinationAccount: { id: '', type: '', name: '' },
    language: 'en',
    ...overrides,
  }
}

export function createFileSettingsStore(filePath: string): SettingsStore {
  async function readAll(): Promise<Record<string, UserSettings>> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'))
    }
    catch {
      return {}
    }
  }
  return {
    async get(userId) {
      return (await readAll())[String(userId)]
    },
    async save(userId, settings) {
      const all = await readAll()
      all[String(userId)] = settings
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`)
    },
  }
}

export function createMemorySettingsStore(seed: Record<number, UserSettings> = {}): SettingsStore {
  const db = new Map(Object.entries(seed).map(([k, v]) => [Number(k), v]))
  return {
    async get(userId) {
      return db.get(userId)
    },
    async save(userId, settings) {
      db.set(userId, settings)
    },
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bunx vitest run __tests__/lib/settings-store.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings-store.ts __tests__/lib/settings-store.test.ts
git commit -m "feat(v2): durable per-user settings store (file + memory)"
```

---

### Task 5: Firefly client factory + service layer

**Files:**
- Create: `src/lib/firefly/client.ts`, `src/lib/firefly/service.ts`
- Test: `__tests__/lib/firefly-client.test.ts`

**Interfaces:**
- Consumes: `src/lib/firefly/api.ts` barrel (Task 1), `src/lib/errors.ts` (Task 3), `UserSettings` (Task 4)
- Produces:
  - `createFireflyClients(settings: { fireflyApiUrl: string, fireflyAccessToken: string }): FireflyClients` — cached per (url, token) pair; registers the global axios error interceptor exactly once per process
  - `interface FireflyService { getCurrentUser(): Promise<{ email: string } | null>; listAccounts(type: AccountTypeFilter, date?: string): Promise<AccountRead[]>; getAccount(id: string): Promise<AccountRead> }` — grows one method-group per later phase; feature code NEVER imports the generated client directly (lint-tested)
  - `type FireflyServiceFactory = (settings: UserSettings) => FireflyService`
  - `createFireflyService(settings: UserSettings): FireflyService`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/lib/firefly-client.test.ts
import axios from 'axios'
import { describe, expect, it } from 'vitest'
import { createFireflyClients } from '#root/lib/firefly/client.js'

describe('createFireflyClients', () => {
  it('returns the same instance for identical settings', () => {
    const a = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok' })
    const b = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok' })
    expect(a).toBe(b)
  })

  it('returns a new instance for different credentials', () => {
    const a = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok' })
    const b = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'other' })
    expect(a).not.toBe(b)
  })

  it('registers the global response interceptor exactly once', () => {
    const before = axios.interceptors.response.handlers.length
    createFireflyClients({ fireflyApiUrl: 'https://x/api', fireflyAccessToken: 't1' })
    createFireflyClients({ fireflyApiUrl: 'https://x/api', fireflyAccessToken: 't2' })
    createFireflyClients({ fireflyApiUrl: 'https://x/api', fireflyAccessToken: 't3' })
    expect(axios.interceptors.response.handlers.length).toBe(before + 1)
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/lib/firefly-client.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/lib/firefly/client.ts`**

Port the interceptor mapping verbatim from `legacy/src/lib/firefly/index.ts:36-73` (resErrorInterceptor — maps `Unauthenticated`/401 → AuthenticationError, `NotFoundHttpException`/404 → ResourceNotFoundError, other 400 → BadRequestError, ENOTFOUND/ECONNREFUSED → HostNotFoundError). The generated api files call the *global* axios instance, so the interceptor must stay global — the fix for v1's accumulation bug is the once-guard, not per-instance interceptors.

```ts
import type { axios as AxiosStatic } from 'axios'
import axios from 'axios'
import type { AxiosError, AxiosResponse } from 'axios'
import * as api from '#root/lib/firefly/api.js'
import { Configuration } from '#root/lib/firefly/generated/configuration.js'
import {
  AuthenticationError,
  BadRequestError,
  HostNotFoundError,
  ResourceNotFoundError,
} from '#root/lib/errors.js'

export interface FireflyClients {
  About: ReturnType<typeof api.AboutApiFactory>
  Accounts: ReturnType<typeof api.AccountsApiFactory>
  Categories: ReturnType<typeof api.CategoriesApiFactory>
  Transactions: ReturnType<typeof api.TransactionsApiFactory>
}

function resSuccessInterceptor(response: AxiosResponse) {
  return response
}

function resErrorInterceptor(axiosError: AxiosError) {
  if ((axiosError.response?.data as any)?.message === 'Unauthenticated')
    return Promise.reject(new AuthenticationError(axiosError?.code))
  if (axiosError.response?.status === 401 && axiosError.response.statusText === 'Unauthorized')
    return Promise.reject(new AuthenticationError(axiosError?.code))
  if (
    axiosError.code === 'ERR_BAD_REQUEST'
    && (axiosError.response?.data as any)?.exception === 'NotFoundHttpException'
  )
    return Promise.reject(new ResourceNotFoundError(axiosError.code))
  if (axiosError.code === 'ERR_BAD_REQUEST')
    return Promise.reject(new BadRequestError((axiosError.response?.data as any)?.message || axiosError.code))
  if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED')
    return Promise.reject(new HostNotFoundError(axiosError.code))
  return Promise.reject(axiosError)
}

// v1 bug fixed here: the interceptor used to be registered on EVERY firefly()
// call, accumulating handlers for the process lifetime. The generated code
// resolves the global axios instance, so we keep it global but guard with a
// module-level once flag.
let interceptorsRegistered = false

const cache = new Map<string, FireflyClients>()

export function createFireflyClients(settings: {
  fireflyApiUrl: string
  fireflyAccessToken: string
}): FireflyClients {
  const key = `${settings.fireflyApiUrl}|${settings.fireflyAccessToken}`
  const cached = cache.get(key)
  if (cached)
    return cached

  if (!interceptorsRegistered) {
    ;(axios as AxiosStatic).interceptors.response.use(resSuccessInterceptor, resErrorInterceptor)
    interceptorsRegistered = true
  }

  const configuration = new Configuration({
    accessToken: settings.fireflyAccessToken,
    basePath: settings.fireflyApiUrl.replace(/\/+$/, ''),
  })

  const clients: FireflyClients = {
    About: api.AboutApiFactory(configuration),
    Accounts: api.AccountsApiFactory(configuration),
    Categories: api.CategoriesApiFactory(configuration),
    Transactions: api.TransactionsApiFactory(configuration),
  }
  cache.set(key, clients)
  return clients
}
```

- [ ] **Step 4: Implement `src/lib/firefly/service.ts`**

Copy `filterActiveAccounts` verbatim from `legacy/src/composers/helpers.ts` (search `export function filterActiveAccounts`) into this file if it exists there as a pure filter; if it also does something else, extract only the filter. Phase 1 needs three methods only.

```ts
import dayjs from 'dayjs'
import type { UserSettings } from '#root/lib/settings-store.js'
import { createFireflyClients } from '#root/lib/firefly/client.js'
import { AccountTypeFilter } from '#root/lib/firefly/generated/model/account-type-filter.js'
import type { AccountRead } from '#root/lib/firefly/generated/model/account-read.js'

export interface FireflyService {
  getCurrentUser(): Promise<{ email: string } | null>
  listAccounts(type: AccountTypeFilter, date?: string): Promise<AccountRead[]>
  getAccount(id: string): Promise<AccountRead>
}

export type FireflyServiceFactory = (settings: UserSettings) => FireflyService

export function createFireflyService(settings: UserSettings): FireflyService {
  const clients = () =>
    createFireflyClients({ fireflyApiUrl: settings.fireflyApiUrl, fireflyAccessToken: settings.fireflyAccessToken })

  return {
    async getCurrentUser() {
      const res = await clients().About.getCurrentUser()
      const user = res.data.data
      return user ? { email: user.attributes.email } : null
    },
    async listAccounts(type, date = dayjs().format('YYYY-MM-DD')) {
      const res = await clients().Accounts.listAccount(
        undefined, 100, 1, undefined, undefined, undefined, date, type,
      )
      return filterActiveAccounts(res.data.data ?? [])
    },
    async getAccount(id) {
      const res = await clients().Accounts.getAccount(id)
      return res.data.data
    },
  }
}

// ported from legacy/src/composers/helpers.ts — keep v1 semantics
function filterActiveAccounts(accounts: AccountRead[]): AccountRead[] {
  return accounts.filter(acc => acc.attributes.active !== false)
}
```

Note: if the legacy `filterActiveAccounts` differs (e.g. also checks `accountName` presence), port the legacy body verbatim and keep its behavior; the one above is the fallback if the file is gone.

- [ ] **Step 5: Run tests + full typecheck**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all tests pass; tsc now clean (Task 3's missing-module errors resolved).

- [ ] **Step 6: Commit**

```bash
git add src/lib/firefly/client.ts src/lib/firefly/service.ts __tests__/lib/firefly-client.test.ts
git commit -m "feat(v2): cached firefly client factory (interceptor-once) + service layer"
```

---

### Task 6: Redis + session storage

**Files:**
- Create: `src/lib/redis.ts`, `src/lib/session.ts`, `src/bot/middlewares/session.ts`
- Create: `__tests__/helpers/setup.ts`, `__tests__/e2e/setup.ts`
- Test: `__tests__/e2e/session-storage.test.ts`

**Interfaces:**
- Produces:
  - `const redis: Redis` — reads `process.env.REDIS_URL` directly (NOT via the config singleton) so test setup files can pin a DB before import
  - `createSessionStorage(ttlSeconds = 86400): RedisAdapter<SessionData>`
  - `function session(options: { getSessionKey: (ctx) => string | undefined; storage: Storage<SessionData> }): Middleware<Context>` — thin wrapper over grammy `session()` with `initial: () => ({})`

- [ ] **Step 1: Implement the three modules**

```ts
// src/lib/redis.ts
import { Redis } from 'ioredis'

// Reads REDIS_URL directly instead of going through the config singleton so
// test setup files can point tests at an isolated DB (see __tests__/helpers/setup.ts)
// before this module is imported. ioredis connects lazily on first command.
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
})
```

```ts
// src/lib/session.ts
import type { SessionData } from '#root/bot/context.js'
import { RedisAdapter } from '@grammyjs/storage-redis'
import { redis } from '#root/lib/redis.js'

export function createSessionStorage(ttlSeconds = 86400): RedisAdapter<SessionData> {
  return new RedisAdapter<SessionData>({ instance: redis, ttl: ttlSeconds, autoParseDates: true })
}
```

```ts
// src/bot/middlewares/session.ts
import type { Context, SessionData } from '#root/bot/context.js'
import type { Middleware, SessionOptions } from 'grammy'
import { session as createSession } from 'grammy'

type Options = Pick<SessionOptions<SessionData, Context>, 'getSessionKey' | 'storage'>

export function session(options: Options): Middleware<Context> {
  return createSession({
    getSessionKey: options.getSessionKey,
    storage: options.storage,
    initial: () => ({}),
  })
}
```

- [ ] **Step 2: Write test setup files**

```ts
// __tests__/helpers/setup.ts
// Unit/integration tests run bots with an in-memory session storage, so no
// Redis is needed for `bunx vitest run`. This file exists to keep parity with
// the e2e setup and to host future shared fixtures.
export {}
```

```ts
// __tests__/e2e/setup.ts
// E2E: pin the shared Redis client to the ephemeral test container
// (docker-compose.tests.yaml, port 6380) and flush it before every file.
process.env.REDIS_URL = 'redis://localhost:6380'

export {} // top-level await requires a module

try {
  const { redis } = await import('#root/lib/redis.js')
  await redis.connect()
  await redis.flushdb()
}
catch {
  // No Redis available — session-dependent e2e tests self-skip
}
```

- [ ] **Step 3: Write the storage e2e test (self-skips without Redis)**

```ts
// __tests__/e2e/session-storage.test.ts
import { describe, expect, it } from 'vitest'
import { redis } from '#root/lib/redis.js'
import { createSessionStorage } from '#root/lib/session.js'

const available = await redis.connect()
  .then(() => redis.ping())
  .then(() => true)
  .catch(() => false)

describe.skipIf(!available)('redis session storage (e2e)', () => {
  it('writes and reads a session key', async () => {
    const storage = createSessionStorage()
    await storage.write('e2e-key', { settingsFlow: { step: 'url' } })
    expect(await storage.read('e2e-key')).toEqual({ settingsFlow: { step: 'url' } })
    await storage.delete('e2e-key')
    expect(await storage.read('e2e-key')).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run**

Run: `docker compose -f docker-compose.tests.yaml up -d && bunx vitest run --config vitest.config.e2e.ts; docker compose -f docker-compose.tests.yaml down`
Expected: 1 passed (or skipped with a warning if Docker unavailable — acceptable, note it in the commit)

- [ ] **Step 5: Commit**

```bash
git add src/lib/redis.ts src/lib/session.ts src/bot/middlewares/session.ts __tests__/helpers/setup.ts __tests__/e2e/setup.ts __tests__/e2e/session-storage.test.ts
git commit -m "feat(v2): redis-backed session storage + e2e test scaffolding"
```

---

### Task 7: Test harness — mock Telegram API

**Files:**
- Create: `__tests__/helpers/bot.ts`
- Test: `__tests__/helpers/harness.test.ts`

**Interfaces:**
- Consumes: `Context` (Task 3), `SettingsStore`/`createMemorySettingsStore` (Task 4), `FireflyService` (Task 5)
- Produces (used by Tasks 8, 10, 11 and every later phase):
  - `interface OutgoingRequest { method: string, payload: any, resultMessageId?: number }`
  - `class MockApiError extends Error { error_code: number }`
  - `setupMockApi(bot): { getOutgoingRequests(), getSentMessages(), clearOutgoingRequests() }`
  - `initializeBot(bot): Promise<void>`
  - `generateMessageUpdate(text, opts?): Update`, `generateCallbackQueryUpdate(data, opts?): Update`
  - `getLastMessage(requests): { text: string } | null`
  - `findButton(requests, label, match?: 'exact'|'prefix'): { data: string, messageId: number } | undefined`
  - `createTestConfig(): Config`, `createTestLogger(): Logger`
  - `createTestFireflyService(overrides?: Partial<FireflyService>): FireflyService` + `testAccount(id, name): AccountRead` fixture builder
  - `createTestBot(opts?): { bot, config, settingsStore }`

- [ ] **Step 1: Port the mock API transformer verbatim from the donor**

Copy from `~/code/rukevich/bot/__tests__/helpers/bot.ts` into `__tests__/helpers/bot.ts`, adapting imports:

| Donor lines | What | Adaptation |
|---|---|---|
| 452–499 | `OutgoingRequest`, `MockApiError`, SEND/EDIT method tables | verbatim |
| 505–584 | `setupMockApi` (records calls, assigns message ids, enforces Telegram edit semantics) | verbatim |
| 587–600 | `initializeBot` | verbatim |
| 603–664 | `generateMessageUpdate` | verbatim |
| 667–721 | `generateCallbackQueryUpdate` | verbatim |
| 724–745 | `isTextPayload`, `getLastMessage`, `findPhotoRequest` | verbatim (drop `findPhotoRequest` if unused — keep it, later phases send photos) |

Import changes: `Context` from `#root/bot/context.js`; drop everything Prisma-related (lines 10–451: `MockPrismaClient`, `createTestPrisma`, `createTestI18n`) — this project has no database.

- [ ] **Step 2: Add our fakes + `findButton` + `createTestBot`**

Append to `__tests__/helpers/bot.ts`:

```ts
import { createBot } from '#root/bot/index.js'
import { createConfig, type Config } from '#root/config.js'
import { MemorySessionStorage, type Bot as TelegramBot } from 'grammy'
import type { SessionData } from '#root/bot/context.js'
import type { SettingsStore, UserSettings } from '#root/lib/settings-store.js'
import { createMemorySettingsStore, defaultSettings } from '#root/lib/settings-store.js'
import type { FireflyService } from '#root/lib/firefly/service.js'
import { AccountTypeFilter, type AccountRead } from '#root/lib/firefly/service.js'
import { ResourceNotFoundError } from '#root/lib/errors.js'
import { pino } from 'pino'

export function createTestConfig(): Config {
  return createConfig({ BOT_TOKEN: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz' })
}

export function createTestLogger() {
  return pino({ level: 'silent' })
}

export function testAccount(id: string, name: string, type = 'asset'): AccountRead {
  return { id, type: 'account', attributes: { name, type, active: true } } as unknown as AccountRead
}

export function createTestFireflyService(
  fixtures: { accounts?: AccountRead[] } = {},
  overrides: Partial<FireflyService> = {},
): FireflyService {
  return {
    async getCurrentUser() { return { email: 'test@example.com' } },
    async listAccounts(type) {
      return (fixtures.accounts ?? []).filter(a => !type || a.attributes.type === type)
    },
    async getAccount(id) {
      const acc = (fixtures.accounts ?? []).find(a => a.id === id)
      if (!acc) throw new ResourceNotFoundError('404')
      return acc
    },
    ...overrides,
  }
}

export function createTestBot(options: {
  config?: Partial<Config>
  settingsStore?: SettingsStore
  settings?: UserSettings            // convenience: seeds the default test user 1111111
  firefly?: FireflyService
} = {}) {
  const config = { ...createTestConfig(), ...options.config }
  const logger = createTestLogger()
  const settingsStore = options.settingsStore ?? createMemorySettingsStore()
  if (options.settings) await settingsStore.save(1111111, options.settings)
  const bot = createBot(config.botToken, {
    config,
    logger,
    settingsStore,
    firefly: () => options.firefly ?? createTestFireflyService(),
    sessionStorage: new MemorySessionStorage<SessionData>(),
  })
  return { bot, config, settingsStore }
}

// findButton: click by visible label — ported verbatim from
// ~/code/rukevich/bot/__tests__/e2e/helpers.ts:114-139 (sentTexts not needed yet).
```

Copy `findButton` body from `~/code/rukevich/bot/__tests__/e2e/helpers.ts:114-139` into this file (it is self-contained).

- [ ] **Step 3: Write the harness self-test**

```ts
// __tests__/helpers/harness.test.ts
import { Bot } from 'grammy'
import { describe, expect, it } from 'vitest'
import { generateMessageUpdate, initializeBot, setupMockApi } from './bot.js'

describe('mock API harness', () => {
  it('records sendMessage calls', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    bot.on('message:text', ctx => ctx.reply(`echo:${ctx.msg.text}`))
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('hi'))
    const last = api.getOutgoingRequests().at(-1)
    expect(last?.method).toBe('sendMessage')
    expect((last?.payload as any).text).toBe('echo:hi')
    expect(last?.resultMessageId).toBeGreaterThan(0)
  })

  it('rejects editing a message the bot never sent, like Telegram', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await expect(bot.api.editMessageText(1111111, 999, 'x')).rejects.toThrow('message to edit not found')
  })
})
```

- [ ] **Step 4: Run — expect pass**

Run: `bunx vitest run __tests__/helpers/harness.test.ts`
Expected: 2 passed. (`createTestBot` is compiled but not exercised until Task 8 — that's fine, Task 8 imports it.)

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/bot.ts __tests__/helpers/harness.test.ts
git commit -m "test(v2): mock Telegram API harness (ported from rukevich) + firefly/settings fakes"
```

---

### Task 8: `createBot` — DI seam, middleware chain, start feature

**Files:**
- Create: `src/bot/constants.ts`, `src/bot/index.ts`, `src/bot/handlers/error.ts`, `src/bot/menus/index.ts`, `src/bot/middlewares/access-control.ts`, `src/bot/middlewares/locale.ts`, `src/bot/helpers/keyboard.ts`, `src/bot/features/start/index.ts`, `src/bot/features/unhandled/index.ts`
- Test: `__tests__/features/start/start.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces:
  - `interface Dependencies { config: Config; logger: Logger; settingsStore: SettingsStore; firefly: FireflyServiceFactory; sessionStorage: Storage<SessionData> }`
  - `createBot(token: string, dependencies: Dependencies, botConfig?: BotConfig<Context>): TelegramBot<Context>`
  - `const command = { START: 'start', SETTINGS: 'settings', HELP: 'help' }` (src/bot/constants.ts)
  - `createMainKeyboard(ctx)`, `generateWelcomeMessage(ctx)` (helpers/keyboard.ts)
  - `startFeature`, `unhandledFeature` composers

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/features/start/start.test.ts
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { generateMessageUpdate, initializeBot, setupMockApi, createTestBot } from '../../helpers/bot.js'
import { defaultSettings } from '#root/lib/settings-store.js'

describe('bot core', () => {
  it('drops updates from users not on the allowlist', async () => {
    const { bot } = createTestBot({ config: { allowedUserIds: [2222222] } })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    expect(api.getOutgoingRequests().filter(r => r.method === 'sendMessage')).toHaveLength(0)
  })

  it('answers /start with welcome + main keyboard + registers commands', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')
    expect((send?.payload as any).text).toContain(i18n.t('en', 'welcome').slice(0, 20))
    expect((send?.payload as any).reply_markup?.keyboard).toBeDefined()
    expect(api.getOutgoingRequests().some(r => r.method === 'setMyCommands')).toBe(true)
  })

  it('appends setup hints when firefly is unconfigured', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')
    expect((send?.payload as any).text).toContain(i18n.t('en', 'navigateToSettings').slice(0, 10))
  })

  it('greets in the stored language', async () => {
    const { bot } = createTestBot({ settings: defaultSettings({ language: 'ru' }) })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')
    expect((send?.payload as any).text).toContain(i18n.t('ru', 'welcome').slice(0, 10))
  })

  it('answers /help and unknown text (interim unhandled)', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/help', { isCommand: true }))
    await bot.handleUpdate(generateMessageUpdate('blah'))
    const texts = api.getOutgoingRequests()
      .filter(r => r.method === 'sendMessage')
      .map(r => (r.payload as any).text)
    expect(texts[0]).toContain(i18n.t('en', 'help').slice(0, 10))
    expect(texts[1]).toContain(i18n.t('en', 'help').slice(0, 10))
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/features/start/start.test.ts`
Expected: FAIL (`createBot` module missing)

- [ ] **Step 3: Implement the modules**

```ts
// src/bot/constants.ts
export const command = {
  START: 'start',
  SETTINGS: 'settings',
  HELP: 'help',
} as const
```

```ts
// src/bot/handlers/error.ts
import type { Context } from '#root/bot/context.js'
import { GrammyError, HttpError, type BotError } from 'grammy'

export async function errorHandler(error: BotError<Context>) {
  const { ctx, error: err } = error
  ctx.logger.error(
    {
      err,
      update_id: ctx.update.update_id,
      kind: err instanceof GrammyError ? 'telegram' : err instanceof HttpError ? 'http' : 'unknown',
    },
    'Error while handling update',
  )
}
```

```ts
// src/bot/middlewares/access-control.ts — ported from legacy/src/index.ts:37-51
import type { Context } from '#root/bot/context.js'
import type { Config } from '#root/config.js'
import type { Middleware } from 'grammy'

export function accessControl(config: Config): Middleware<Context> {
  return async (ctx, next) => {
    if (config.allowedUserIds.length > 0 && (!ctx.from || !config.allowedUserIds.includes(ctx.from.id))) {
      if (!config.disableUnauthorizedUserLog) {
        const user = ctx.from
          ? `id=${ctx.from.id}${ctx.from.username ? `, username=@${ctx.from.username}` : ''}`
          : 'unknown user'
        ctx.logger.warn({ user }, 'Unauthorized access attempt')
      }
      return
    }
    await next()
  }
}
```

```ts
// src/bot/middlewares/locale.ts
import dayjs from 'dayjs'
import type { Context } from '#root/bot/context.js'
import { defaultLanguage, locales } from '#root/bot/i18n.js'
import type { Middleware } from 'grammy'

// The language of record lives in the durable settings store, not the session
// (v1 kept it in session.userSettings.language).
export function setLocaleFromSettings(): Middleware<Context> {
  return async (ctx, next) => {
    const locale = ctx.settings?.language ?? defaultLanguage
    ctx.i18n.locale(locales.includes(locale as any) ? locale : defaultLanguage)
    dayjs.locale(ctx.i18n.locale())
    await next()
  }
}
```

```ts
// src/bot/helpers/keyboard.ts
import type { Context } from '#root/bot/context.js'
import { Keyboard } from 'grammy'
import { defaultSettings } from '#root/lib/settings-store.js'

// Port of legacy createMainKeyboard/generateWelcomeMessage (src/composers/helpers.ts).
// If v1's layout differs, copy v1's exactly — this keyboard is muscle memory for users.
export function createMainKeyboard(ctx: Context) {
  return new Keyboard()
    .text(ctx.i18n.t('labels.TRANSACTIONS')).text(ctx.i18n.t('labels.ACCOUNTS')).row()
    .text(ctx.i18n.t('labels.CATEGORIES')).text(ctx.i18n.t('labels.REPORTS')).row()
    .text(ctx.i18n.t('labels.SETTINGS')).row()
    .resize()
}

export function generateWelcomeMessage(ctx: Context) {
  const { fireflyUrl, fireflyAccessToken } = ctx.settings ?? defaultSettings()
  let msg = ctx.i18n.t('welcome')
  if (!fireflyUrl || !fireflyAccessToken) {
    msg += `\n${ctx.i18n.t('needToSet')}\n${ctx.i18n.t('setFireflyUrl')}\n${ctx.i18n.t('setFireflyAccessToken')}\n${ctx.i18n.t('navigateToSettings')}`
  }
  return msg
}
```

```ts
// src/bot/menus/index.ts
import type { Context } from '#root/bot/context.js'
import type { Composer } from 'grammy'

// Core (cross-feature) root menus attach here — AFTER i18n, BEFORE features.
// No core menus exist until Phase 2; the guard is in place so double registration
// across test bots can never happen (donor: rukevich/bot/src/bot/menus/index.ts).
let menusRegistered = false

export function registerCoreMenus(bot: Composer<Context>) {
  if (menusRegistered)
    return
  menusRegistered = true
  // Phase 2+: bot.use(mainMenu) etc.
}
```

```ts
// src/bot/features/start/index.ts
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { command } from '#root/bot/constants.js'
import { createMainKeyboard, generateWelcomeMessage } from '#root/bot/helpers/keyboard.js'
import type { UserSettings } from '#root/lib/settings-store.js'

export const startFeature = new Composer<Context>()

startFeature.command(command.START, async (ctx) => {
  await setBotCommands(ctx, ['start', 'settings', 'help'])
  return ctx.reply(generateWelcomeMessage(ctx), {
    parse_mode: 'Markdown',
    reply_markup: createMainKeyboard(ctx),
  })
})

startFeature.command(command.HELP, ctx =>
  ctx.reply(ctx.i18n.t('help'), { parse_mode: 'Markdown', reply_markup: createMainKeyboard(ctx) }))

async function setBotCommands(ctx: Context, commands: string[]) {
  await ctx.api.setMyCommands(commands.map(c => ({
    command: c,
    description: ctx.i18n.t(`commands.${c}`),
  })))
}

export type { UserSettings }
```

(Delete the re-export line if eslint flags it as unused — it exists only to keep the import list honest.)

```ts
// src/bot/features/unhandled/index.ts
import type { Context } from '#root/bot/context.js'
import { createMainKeyboard } from '#root/bot/helpers/keyboard.js'
import { Composer } from 'grammy'

// Interim fallback: v1 routed unknown text into the add-transaction flow; that
// feature lands in Phase 3 and replaces this handler.
export const unhandledFeature = new Composer<Context>()

unhandledFeature.on('message:text', ctx =>
  ctx.reply(ctx.i18n.t('help'), { parse_mode: 'Markdown', reply_markup: createMainKeyboard(ctx) }))
```

```ts
// src/bot/index.ts
import type { Context, SessionData } from '#root/bot/context.js'
import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { FireflyServiceFactory } from '#root/lib/firefly/service.js'
import type { SettingsStore } from '#root/lib/settings-store.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import { startFeature } from '#root/bot/features/start/index.js'
import { unhandledFeature } from '#root/bot/features/unhandled/index.js'
import { errorHandler } from '#root/bot/handlers/error.js'
import { i18n } from '#root/bot/i18n.js'
import { registerCoreMenus } from '#root/bot/menus/index.js'
import { accessControl } from '#root/bot/middlewares/access-control.js'
import { setLocaleFromSettings } from '#root/bot/middlewares/locale.js'
import { session } from '#root/bot/middlewares/session.js'
import { sequentialize } from '@grammyjs/runner'
import { Bot as TelegramBot, type BotConfig, type Storage } from 'grammy'

export interface Dependencies {
  config: Config
  logger: Logger
  settingsStore: SettingsStore
  firefly: FireflyServiceFactory
  sessionStorage: Storage<SessionData>
}

function getSessionKey(ctx: Omit<Context, 'session'>) {
  return ctx.chat?.id.toString()
}

export function createBot(token: string, deps: Dependencies, botConfig?: BotConfig<Context>) {
  const bot = new TelegramBot<Context>(token, botConfig)

  // DI seam: everything a handler touches arrives here — tests swap these, never module-mock.
  bot.use(async (ctx, next) => {
    ctx.config = deps.config
    ctx.logger = deps.logger.child({ update_id: ctx.update.update_id })
    ctx.settings = ctx.from ? await deps.settingsStore.get(ctx.from.id) : undefined
    ctx.firefly = deps.firefly(ctx.settings ?? defaultSettings())
    ctx.saveSettings = async (settings) => {
      await deps.settingsStore.save(ctx.from!.id, settings)
      ctx.settings = settings
    }
    await next()
  })

  const protectedBot = bot.errorBoundary(errorHandler)

  // Load-bearing order (spec §1): accessControl → sequentialize → session →
  // i18n → locale-from-settings → core menus → features → unhandled (last).
  protectedBot.use(accessControl(deps.config))
  protectedBot.use(sequentialize(getSessionKey))
  protectedBot.use(session({ getSessionKey, storage: deps.sessionStorage }))
  protectedBot.use(i18n.middleware())
  protectedBot.use(setLocaleFromSettings())
  registerCoreMenus(protectedBot)
  protectedBot.use(startFeature)
  // Phase 1 inserts settingsFeature here.
  protectedBot.use(unhandledFeature) // must stay last

  return bot
}

export type Bot = ReturnType<typeof createBot>
```

- [ ] **Step 4: Run — expect pass**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green (Task 3's outstanding type errors are now resolved)

- [ ] **Step 5: Commit**

```bash
git add src/bot __tests__/features/start
git commit -m "feat(v2): createBot DI seam, middleware chain, start + unhandled features"
```

---

### Task 9: `main.ts` — polling entry with graceful shutdown

**Files:**
- Create: `src/main.ts`

**Interfaces:**
- Consumes: `config`, `logger` singletons, `createBot`, `createSessionStorage`, `createFileSettingsStore`, `createFireflyService`
- Produces: a runnable process — no exports used by other modules

- [ ] **Step 1: Implement (port of donor `~/code/rukevich/bot/src/main.ts` polling branch, minus webhook, minus Prisma)**

```ts
import process from 'node:process'
import { createBot } from '#root/bot/index.js'
import { config } from '#root/config.js'
import { logger } from '#root/logger.js'
import { createFireflyService } from '#root/lib/firefly/service.js'
import { createFileSettingsStore } from '#root/lib/settings-store.js'
import { createSessionStorage } from '#root/lib/session.js'
import { run, type RunnerHandle } from '@grammyjs/runner'

const SHUTDOWN_TIMEOUT_MS = 5000

try {
  const bot = createBot(config.botToken, {
    config,
    logger,
    settingsStore: createFileSettingsStore('data/settings.json'),
    firefly: createFireflyService,
    sessionStorage: createSessionStorage(),
  })

  let runner: RunnerHandle | undefined
  onShutdown(async () => {
    logger.info('Shutdown')
    await runner?.stop()
  })

  await Promise.all([bot.init(), bot.api.deleteWebhook()])
  runner = run(bot)
  logger.info({ msg: 'Bot running', username: bot.botInfo.username })
}
catch (error) {
  logger.error(error)
  process.exit(1)
}

function onShutdown(cleanUp: () => Promise<void>) {
  let isShuttingDown = false
  const handleShutdown = () => {
    if (isShuttingDown)
      return
    isShuttingDown = true
    setTimeout(() => {
      logger.warn('Graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    void cleanUp()
      .then(() => process.exit(0))
      .catch((error) => {
        logger.error(error)
        process.exit(1)
      })
  }
  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)
}
```

- [ ] **Step 2: Verify manually (no automated test — thin composition)**

Run: `BOT_TOKEN=123456:INVALID bun run ./src/main.ts`
Expected: process starts, logs a Telegram auth error (`getMe` 401) via pino, exits 1. That proves config → bot → runner wiring end to end. With a real token from `.env`, `Bot running` is logged.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(v2): polling entry point with graceful shutdown"
```

---

### Task 10: Architecture lint tests

**Files:**
- Test: `__tests__/lint/architecture.test.ts`

**Interfaces:**
- Consumes: `src/` tree
- Produces: machine-enforced standards (spec §5)

- [ ] **Step 1: Write the tests**

```ts
// __tests__/lint/architecture.test.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : (full.endsWith('.ts') ? [full] : [])
  })
}

const src = walk('src')

describe('architecture rules', () => {
  it('menus only via @grammyjs/menu — no raw InlineKeyboard/callbackQuery/vm', () => {
    for (const file of src) {
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toMatch(/new InlineKeyboard\b/)
      expect(content, file).not.toMatch(/\.callbackQuery\(/)
      expect(content, file).not.toMatch(/from 'node:vm'/)
    }
  })

  it('generated firefly client is only imported inside lib/firefly', () => {
    for (const file of src) {
      if (file.includes(path.join('lib', 'firefly')))
        continue
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toMatch(/#root\/lib\/firefly\/(api|generated)/)
      expect(content, file).not.toMatch(/from '\.+(\/.*)*\/(api|generated)\//)
    }
  })

  it('SessionData never grows a shared step field', () => {
    const content = readFileSync('src/bot/context.ts', 'utf8')
    expect(content).not.toMatch(/^\s{2}step\??:/m)
  })

  it('no cleanupSessionData and no @grammyjs/conversations', () => {
    for (const file of src) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('cleanupSessionData')
      expect(readFileSync(file, 'utf8'), file).not.toContain('@grammyjs/conversations')
    }
    expect(readFileSync('package.json', 'utf8')).not.toContain('@grammyjs/conversations')
  })
})
```

- [ ] **Step 2: Run — expect pass against the current tree**

Run: `bunx vitest run __tests__/lint/architecture.test.ts`
Expected: 4 passed. If any rule fails, the violating code is wrong — fix the code, never the rule.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lint/architecture.test.ts
git commit -m "test(v2): architecture lint rules (menus-only, service boundary, session shape)"
```

---

### Task 11: Settings feature (Phase 1)

**Files:**
- Create: `src/bot/features/settings/index.ts`, `src/bot/features/settings/settings.menu.ts`, `src/bot/features/settings/settings.router.ts`
- Modify: `src/bot/index.ts` (insert `settingsFeature` before `unhandledFeature`), `src/lib/firefly/service.ts` (add re-exports)
- Test: `__tests__/features/settings/settings.test.ts`, `__tests__/e2e/settings-flow.test.ts`

**Interfaces:**
- Consumes: `Context` (`settingsFlow` session field), `ctx.settings`/`ctx.saveSettings`, `ctx.firefly`, all of Task 7's harness
- Produces: `settingsFeature` composer; menus `settings` / `switch-lang` / `set-default-account` / `setting-cancel` (same ids as v1)

- [ ] **Step 0: Add re-exports to `src/lib/firefly/service.ts`** (features must not import generated code — lint rule from Task 10):

```ts
export { AccountTypeFilter } from '#root/lib/firefly/generated/model/account-type-filter.js'
export type { AccountRead } from '#root/lib/firefly/generated/model/account-read.js'
```

- [ ] **Step 1: Write failing integration tests**

```ts
// __tests__/features/settings/settings.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import {
  createTestBot, findButton, generateCallbackQueryUpdate, generateMessageUpdate,
  initializeBot, setupMockApi, testAccount, type OutgoingRequest,
} from '../../helpers/bot.js'
import { defaultSettings } from '#root/lib/settings-store.js'

const URL_BUTTON = '🔗 Firefly URL'
const TOKEN_BUTTON = '🔑 Access Token'
const CHECK_BUTTON = '🔌 Check connection'

async function setup(opts: Parameters<typeof createTestBot>[0] = {}) {
  const { bot, settingsStore } = createTestBot(opts)
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const send = (text: string) => bot.handleUpdate(generateMessageUpdate(text, { isCommand: true }))
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return { bot, settingsStore, api, send, click }
}

beforeEach(() => { /* fresh bots per test via setup() */ })

describe('settings feature', () => {
  it('shows NOT SPECIFIED markers for a fresh user', async () => {
    const { api, send } = await setup()
    await send('/settings')
    const text = (api.getOutgoingRequests().find(r => r.method === 'sendMessage')?.payload as any).text
    expect(text).toContain(i18n.t('en', 'settings.notSpecified'))
  })

  it('firefly url flow: rejects bad url, accepts good one, persists to the store', async () => {
    const { api, send, click, settingsStore } = await setup()
    await send('/settings')
    await click(URL_BUTTON)
    await send('not a url')
    let replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain(i18n.t('en', 'settings.badUrl'))

    await send('https://ff.example.com')
    const saved = await settingsStore.get(1111111)
    expect(saved?.fireflyUrl).toBe('https://ff.example.com')
    expect(saved?.fireflyApiUrl).toBe('https://ff.example.com/api')
    replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain('ff.example.com')
  })

  it('token flow rejects a short token and stores a long one', async () => {
    const { api, send, click, settingsStore } = await setup()
    await send('/settings')
    await click(TOKEN_BUTTON)
    await send('short')
    let replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain(i18n.t('en', 'settings.badAccessToken'))

    const longToken = 't'.repeat(500)
    await send(longToken)
    expect((await settingsStore.get(1111111))?.fireflyAccessToken).toBe(longToken)
    replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text).toContain('t...')
  })

  it('check connection reports the firefly user email', async () => {
    const { api, send, click } = await setup({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500) }),
    })
    await send('/settings')
    await click(CHECK_BUTTON)
    const replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect((replies.at(-1)!.payload as any).text)
      .toContain(i18n.t('en', 'settings.connectionSuccess', { email: 'test@example.com' }))
  })

  it('default asset account selection persists to the store', async () => {
    const { send, click, settingsStore } = await setup({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500) }),
      firefly: undefined as any, // default fake
    })
    // seed two asset accounts through the default fake by injecting accounts:
    const { createTestFireflyService } = await import('../../helpers/bot.js')
    void createTestFireflyService // (see Step 3 note: accounts are injected via options.firefly)
    await send('/settings')
    await click('💳 Default asset account')
    await click('Checking')
    expect((await settingsStore.get(1111111))?.defaultSourceAccount.name).toBe('Checking')
  })

  it('language switch persists to the store', async () => {
    const { send, click, settingsStore } = await setup()
    await send('/settings')
    await click('🌐 Language')
    await click('🇪🇸 Spanish')
    expect((await settingsStore.get(1111111))?.language).toBe('es')
  })
})
```

(The default-account test injects accounts via `createTestBot({ firefly: createTestFireflyService({ accounts: [testAccount('1', 'Checking'), testAccount('2', 'Savings')] }) })` — adjust the `setup()` call accordingly when writing the real test; the assertion is the contract.)

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/features/settings/settings.test.ts`
Expected: FAIL (feature missing; /settings falls through to unhandled)

- [ ] **Step 3: Implement the menus**

```ts
// src/bot/features/settings/settings.menu.ts
import type { Context } from '#root/bot/context.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { i18n, locales } from '#root/bot/i18n.js'
import { createMainKeyboard, generateWelcomeMessage } from '#root/bot/helpers/keyboard.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import { defaultSettings } from '#root/lib/settings-store.js'

export function settingsText(ctx: Context) {
  const s = ctx.settings ?? defaultSettings()
  const accessToken = s.fireflyAccessToken.replace(/(.{4})(.*?)(.{4})$/, '$1...$3')
  return ctx.i18n.t('settings.whatDoYouWantToChange', {
    fireflyUrl: s.fireflyUrl,
    fireflyApiUrl: s.fireflyApiUrl,
    accessToken: s.fireflyAccessToken ? accessToken : '',
    defaultSourceAccount: s.defaultSourceAccount,
  })
}

async function inputStep(ctx: Context, step: 'url' | 'api_url' | 'token', promptKey: string) {
  ctx.session.settingsFlow = { step }
  await ctx.editMessageText(ctx.i18n.t(promptKey), { parse_mode: 'Markdown', reply_markup: cancelMenu })
}

export const settingsMenu = new Menu<Context>('settings')
  .submenu(ctx => ctx.i18n.t('labels.SWITCH_LANG'), 'switch-lang', async (ctx) => {
    await ctx.editMessageText(ctx.i18n.t('settings.selectBotLang'), { parse_mode: 'Markdown' })
  }).row()
  .text(ctx => ctx.i18n.t('labels.FIREFLY_URL_BUTTON'), ctx => inputStep(ctx, 'url', 'settings.inputFireflyUrl')).row()
  .text(ctx => ctx.i18n.t('labels.FIREFLY_API_URL_BUTTON'), ctx => inputStep(ctx, 'api_url', 'settings.inputFireflyApiUrl')).row()
  .text(ctx => ctx.i18n.t('labels.FIREFLY_ACCESS_TOKEN_BUTTON'), ctx => inputStep(ctx, 'token', 'settings.inputFireflyAccessToken')).row()
  .dynamic(async (ctx) => {
    // Render-only: reads durable settings, never writes session (dynamic re-runs on every click).
    const range = new MenuRange<Context>()
    const s = ctx.settings ?? defaultSettings()
    if (s.fireflyUrl && s.fireflyAccessToken) {
      range.text(ctx => ctx.i18n.t('labels.TEST_CONNECTION'), testConnection).row()
      range.submenu(ctx => ctx.i18n.t('labels.DEFAULT_ASSET_ACCOUNT_BUTTON'), 'set-default-account', async (ctx) => {
        const accounts = await ctx.firefly.listAccounts(AccountTypeFilter.Asset)
        await ctx.editMessageText(
          accounts.length ? ctx.i18n.t('settings.selectDefaultAssetAccount') : ctx.i18n.t('common.noDefaultSourceAccountExist'),
          { parse_mode: 'Markdown' },
        )
      }).row()
    }
    return range
  })
  .text('🔙', async (ctx) => {
    ctx.session.settingsFlow = undefined
    await ctx.deleteMessage()
  })

export const langMenu = new Menu<Context>('switch-lang')
  .dynamic((ctx) => {
    const range = new MenuRange<Context>()
    for (const locale of locales) {
      range.text(
        {
          text: ctx => `${ctx.i18n.t(`labels.SWITCH_TO_${locale.toUpperCase()}`)}${(ctx.settings?.language ?? 'en') === locale ? ' ✅' : ''}`,
          payload: locale,
        },
        async (ctx) => {
          // payload travels in ctx.match — no closure/session reads needed for logic
          const s = ctx.settings ?? defaultSettings()
          await ctx.saveSettings({ ...s, language: ctx.match! })
          ctx.i18n.locale(ctx.match!)
          await ctx.menu.update()
          await ctx.reply(generateWelcomeMessage(ctx), { reply_markup: createMainKeyboard(ctx) })
          await ctx.editMessageText(ctx.i18n.t('settings.selectBotLang'), { parse_mode: 'Markdown' })
        },
      ).row()
    }
    range.back('🔙', async (ctx) => {
      await ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
    })
    return range
  })

export const defaultAccountMenu = new Menu<Context>('set-default-account')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const s = ctx.settings ?? defaultSettings()
    const accounts = await ctx.firefly.listAccounts(AccountTypeFilter.Asset)
    if (!accounts.length) {
      return range
        .url(ctx.i18n.t('labels.OPEN_ASSET_ACCOUNTS_IN_BROWSER'), `${s.fireflyUrl}/accounts/asset`).row()
        .back('🔙', async (ctx) => {
          await ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
        })
    }
    for (const acc of accounts) {
      range.text(
        {
          text: ctx => `${acc.attributes.name}${(ctx.settings ?? defaultSettings()).defaultSourceAccount.id === acc.id ? ' ✅' : ''}`,
          payload: acc.id,
        },
        async (ctx) => {
          const current = ctx.settings ?? defaultSettings()
          if (current.defaultSourceAccount.id === ctx.match)
            return
          const account = await ctx.firefly.getAccount(ctx.match!)
          await ctx.saveSettings({
            ...current,
            defaultSourceAccount: { id: acc.id, name: account.attributes.name, type: account.attributes.type ?? 'asset' },
          })
          await ctx.menu.update()
          await ctx.editMessageText(ctx.i18n.t('settings.selectDefaultAssetAccount'), { parse_mode: 'Markdown' })
        },
      ).row()
    }
    range.back('🔙', async (ctx) => {
      await ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
    })
    return range
  })

export const cancelMenu = new Menu<Context>('setting-cancel')
  .back('🔙', async (ctx) => {
    ctx.session.settingsFlow = undefined
    await ctx.editMessageText(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
  })

async function testConnection(ctx: Context) {
  const s = ctx.settings ?? defaultSettings()
  if (!s.fireflyUrl || !s.fireflyApiUrl) {
    await ctx.reply(ctx.i18n.t('settings.specifySmthFirst', { smth: ctx.i18n.t('labels.FIREFLY_URL_BUTTON') }))
    return
  }
  if (!s.fireflyAccessToken) {
    await ctx.reply(ctx.i18n.t('settings.specifySmthFirst', { smth: ctx.i18n.t('labels.FIREFLY_ACCESS_TOKEN_BUTTON') }))
    return
  }
  try {
    const user = await ctx.firefly.getCurrentUser()
    await ctx.reply(user
      ? ctx.i18n.t('settings.connectionSuccess', { email: user.email })
      : ctx.i18n.t('settings.connectionFailed'))
  }
  catch (err: any) {
    await ctx.reply(ctx.i18n.t('settings.connectionFailedUnauthenticated'))
    ctx.logger.warn({ err }, 'firefly connection test failed')
  }
}

void i18n
```

(Delete the trailing `void i18n` if the import is unused after eslint.)

- [ ] **Step 4: Implement the router and feature index**

```ts
// src/bot/features/settings/settings.router.ts
import type { Context } from '#root/bot/context.js'
import { Router } from '@grammyjs/router'
import { defaultSettings } from '#root/lib/settings-store.js'
import { settingsMenu, settingsText } from './settings.menu.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other.
export const settingsRouter = new Router<Context>(ctx => ctx.session.settingsFlow?.step)

settingsRouter.route('url', async (ctx) => {
  const text = ctx.msg!.text!
  if (!/^(http|https):\/\/[^ "]+$/i.test(text)) {
    await ctx.reply(ctx.i18n.t('settings.badUrl'), { reply_markup: cancelMenuImport() })
    return
  }
  const s = ctx.settings ?? defaultSettings()
  await ctx.saveSettings({ ...s, fireflyUrl: text, fireflyApiUrl: `${text.replace(/\/+$/, '')}/api` })
  ctx.session.settingsFlow = undefined
  await ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
})

settingsRouter.route('api_url', async (ctx) => {
  const text = ctx.msg!.text!
  if (!/^(http|https):\/\/[^ "]+$/i.test(text)) {
    await ctx.reply(ctx.i18n.t('settings.badUrl'), { reply_markup: cancelMenuImport() })
    return
  }
  const s = ctx.settings ?? defaultSettings()
  await ctx.saveSettings({ ...s, fireflyApiUrl: text })
  ctx.session.settingsFlow = undefined
  await ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
})

settingsRouter.route('token', async (ctx) => {
  const text = ctx.msg!.text!
  if (text.length < 500) {
    await ctx.reply(ctx.i18n.t('settings.badAccessToken'), { reply_markup: cancelMenuImport() })
    return
  }
  const s = ctx.settings ?? defaultSettings()
  await ctx.saveSettings({ ...s, fireflyAccessToken: text })
  ctx.session.settingsFlow = undefined
  await ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })
})

settingsRouter.otherwise((_ctx, next) => next())

function cancelMenuImport() {
  // eslint sees this as a circular-safe accessor; replace with a direct import
  // of cancelMenu from './settings.menu.js' — kept as a function only so the
  // plan text compiles in one pass.
  return cancelMenuRef
}

import { cancelMenu as cancelMenuRef } from './settings.menu.js'
```

**Cleanup instruction:** the `cancelMenuImport` indirection above exists only to keep this plan document simple — in the real file, import `cancelMenu` from `./settings.menu.js` at the top (alongside `settingsMenu`) and use it directly; delete the function and the bottom import.

```ts
// src/bot/features/settings/index.ts
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { command } from '#root/bot/constants.js'
import { i18n, locales } from '#root/bot/i18n.js'
import { cancelMenu, defaultAccountMenu, langMenu, settingsMenu, settingsText } from './settings.menu.js'
import { settingsRouter } from './settings.router.js'

export const settingsFeature = new Composer<Context>()

settingsMenu.register(langMenu)
settingsMenu.register(defaultAccountMenu)
settingsMenu.register(cancelMenu)

settingsFeature.use(settingsMenu)
settingsFeature.use(settingsRouter)

const settingsCommandHandler = (ctx: Context) =>
  ctx.reply(settingsText(ctx), { parse_mode: 'Markdown', reply_markup: settingsMenu })

for (const locale of locales) {
  settingsFeature.hears(i18n.t(locale, 'labels.SETTINGS'), settingsCommandHandler)
}
settingsFeature.command(command.SETTINGS, settingsCommandHandler)
```

Then in `src/bot/index.ts`, insert between start and unhandled:

```ts
import { settingsFeature } from '#root/bot/features/settings/index.js'
// ...
protectedBot.use(settingsFeature)
```

- [ ] **Step 5: Run integration tests — expect pass**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green. If `settings.badUrl`/`badAccessToken` keys don't exist in `locales/en.yaml`, add them at the `settings:` level with the v1 texts from `legacy/src/locales/en.yaml` (check `legacy` for the exact keys used by the v1 router — reuse verbatim).

- [ ] **Step 6: Add the e2e variant against real Redis**

```ts
// __tests__/e2e/settings-flow.test.ts
import { describe, expect, it } from 'vitest'
import { createBot } from '#root/bot/index.js'
import { createConfig } from '#root/config.js'
import { createFireflyService, type FireflyService } from '#root/lib/firefly/service.js'
import { createMemorySettingsStore, defaultSettings } from '#root/lib/settings-store.js'
import { createSessionStorage } from '#root/lib/session.js'
import {
  createTestConfig, createTestFireflyService, createTestLogger,
  findButton, generateCallbackQueryUpdate, generateMessageUpdate, initializeBot, setupMockApi,
} from '../helpers/bot.js'
import { pino } from 'pino'

const available = await fetch('http://localhost:6380').then(() => false, () => false) // placeholder probe
// (replace the probe with: import { redis } from '#root/lib/redis.js'; const available = await redis.connect().then(()=>redis.ping()).then(()=>true).catch(()=>false))

describe.skipIf(!available)('settings flow (e2e, real redis)', () => {
  it('persists the firefly url through a redis-backed session', async () => {
    const settingsStore = createMemorySettingsStore()
    const bot = createBot(createTestConfig().botToken, {
      config: createTestConfig(),
      logger: createTestLogger(),
      settingsStore,
      firefly: () => createTestFireflyService(),
      sessionStorage: createSessionStorage(),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/settings', { isCommand: true }))
    const btn = findButton(api.getOutgoingRequests(), '🔗 Firefly URL')
    await bot.handleUpdate(generateCallbackQueryUpdate(btn!.data, { messageId: btn!.messageId }))
    await bot.handleUpdate(generateMessageUpdate('https://ff.example.com'))
    expect((await settingsStore.get(1111111))?.fireflyUrl).toBe('https://ff.example.com')
  })
})
```

(Replace the placeholder probe line with the redis-connect probe as the comment says — the test body is the contract.)

Run: `docker compose -f docker-compose.tests.yaml up -d && bunx vitest run --config vitest.config.e2e.ts`
Expected: e2e settings test + session storage test pass.

- [ ] **Step 7: Commit**

```bash
git add src/bot/features/settings src/bot/index.ts src/lib/firefly/service.ts __tests__/features/settings __tests__/e2e/settings-flow.test.ts
git commit -m "feat(v2): settings feature — durable credentials, lang menu, default account, connection test"
```

---

### Task 12: v1 session migration script

**Files:**
- Create: `scripts/migrate-v1-sessions.ts`
- Test: `__tests__/scripts/migrate-v1-sessions.test.ts`

**Interfaces:**
- Consumes: `createFileSettingsStore`, `defaultSettings`
- Produces: `migrateV1Sessions(sessionsDir: string, outputFile: string): Promise<{ users: number, skipped: number }>` + CLI (`bun run scripts/migrate-v1-sessions.ts [sessionsDir] [outputFile]`, defaults `sessions data/settings.json`)

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/scripts/migrate-v1-sessions.test.ts
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateV1Sessions } from '#root/../scripts/migrate-v1-sessions.js'

describe('migrateV1Sessions', () => {
  it('extracts userSettings, prefers credentialed sessions per user', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'ffmig-'))
    const sessionsDir = path.join(base, 'sessions')
    await mkdir(path.join(sessionsDir, '35'), { recursive: true })
    await writeFile(path.join(sessionsDir, '35', '111_111.json'), JSON.stringify({
      userSettings: { fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: '', defaultSourceAccount: { id: '', type: '', name: '' }, defaultDestinationAccount: { id: '', type: '', name: '' }, language: 'en' },
    }))
    await writeFile(path.join(sessionsDir, '35', '111_222.json'), JSON.stringify({
      userSettings: { fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500), defaultSourceAccount: { id: '7', type: 'asset', name: 'Cash' }, defaultDestinationAccount: { id: '', type: '', name: '' }, language: 'ru' },
    }))
    await writeFile(path.join(sessionsDir, '35', 'garbage.json'), JSON.stringify({ nope: 1 }))

    const out = path.join(base, 'settings.json')
    const result = await migrateV1Sessions(sessionsDir, out)

    expect(result).toEqual({ users: 1, skipped: 1 })
    const disk = JSON.parse(await readFile(out, 'utf8'))
    expect(disk['111'].fireflyAccessToken).toBe('x'.repeat(500))
    expect(disk['111'].defaultSourceAccount.name).toBe('Cash')
    expect(disk['111'].language).toBe('ru')
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/scripts/migrate-v1-sessions.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
// scripts/migrate-v1-sessions.ts
// One-time migration: v1 stored Firefly credentials inside file-based sessions
// (sessions/<shard>/<userId>_<chatId>.json → userSettings). v2 keeps credentials
// in data/settings.json. Usage:
//   bun run scripts/migrate-v1-sessions.ts [sessionsDir] [outputFile]
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createFileSettingsStore, defaultSettings, type UserSettings } from '#root/lib/settings-store.js'

export async function migrateV1Sessions(sessionsDir: string, outputFile: string) {
  const store = createFileSettingsStore(outputFile)
  const best = new Map<number, UserSettings>()
  let skipped = 0

  for (const entry of await readdir(sessionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    for (const file of await readdir(path.join(sessionsDir, entry.name))) {
      const match = /^(\d+)_(\d+)\.json$/.exec(file)
      if (!match) {
        skipped++
        continue
      }
      let session: any
      try {
        session = JSON.parse(await readFile(path.join(sessionsDir, entry.name, file), 'utf8'))
      }
      catch {
        skipped++
        continue
      }
      const raw = session?.userSettings
      if (!raw) {
        skipped++
        continue
      }
      const userId = Number(match[1])
      const candidate = defaultSettings({
        fireflyUrl: raw.fireflyUrl ?? '',
        fireflyApiUrl: raw.fireflyApiUrl ?? '',
        fireflyAccessToken: raw.fireflyAccessToken ?? '',
        defaultSourceAccount: raw.defaultSourceAccount,
        defaultDestinationAccount: raw.defaultDestinationAccount,
        language: raw.language ?? 'en',
      })
      const existing = best.get(userId)
      // a user with sessions in several chats: keep the one that can actually talk to Firefly
      if (!existing || (!existing.fireflyAccessToken && candidate.fireflyAccessToken))
        best.set(userId, candidate)
    }
  }

  for (const [userId, settings] of best)
    await store.save(userId, settings)
  return { users: best.size, skipped }
}

if (import.meta.main) {
  const sessionsDir = process.argv[2] ?? 'sessions'
  const outputFile = process.argv[3] ?? 'data/settings.json'
  const result = await migrateV1Sessions(sessionsDir, outputFile)
  console.log(`migrated ${result.users} user(s), skipped ${result.skipped} file(s) → ${outputFile}`)
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bunx vitest run __tests__/scripts/migrate-v1-sessions.test.ts`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-v1-sessions.ts __tests__/scripts/migrate-v1-sessions.test.ts
git commit -m "feat(v2): migrate v1 file sessions into the settings store"
```

---

### Task 13: Rewrite CLAUDE.md for v2

**Files:**
- Modify: `CLAUDE.md` (replace v1 content on the branch; AGENTS.md is a symlink to it, no action)

- [ ] **Step 1: Replace CLAUDE.md content**

```markdown
# Agent Instructions

## Build & Development Commands

```bash
bun install                # Install dependencies
bun run dev                # Dev with watch-reload
bun run start              # Run the bot (polling)
bunx tsc --noEmit          # Typecheck
bun run lint / bun run fix # ESLint
bunx vitest run            # Unit + integration tests (no external services needed)
docker compose -f docker-compose.tests.yaml up -d   # ephemeral Redis for e2e
bun run test:e2e           # e2e (real Redis, Telegram still mocked)
bun run codegen            # Regenerate Firefly client into src/lib/firefly/generated
bun run scripts/migrate-v1-sessions.ts sessions data/settings.json
```

## Architecture

Telegram bot (grammY, Bun, pure ESM, `#root/*` → `src/*`) for the Firefly III API.
Entry `src/main.ts` (polling only). `createBot(token, deps)` in `src/bot/index.ts`
is the DI seam: deps = `{ config, logger, settingsStore, firefly, sessionStorage }`.
Tests inject fakes here — never module-mock.

Middleware order (load-bearing): deps → errorBoundary → accessControl →
sequentialize → session(Redis) → i18n → setLocaleFromSettings → core menus →
features → unhandled (last).

- **Features** live in `src/bot/features/<name>/` (composer index.ts + *.menu.ts + *.router.ts).
- **Session** (`src/bot/context.ts`): one optional field per flow (e.g. `settingsFlow`).
  NEVER a shared `step` string (lint-tested). Flow state may expire (24h Redis TTL).
- **Credentials** live in `src/lib/settings-store.ts` (data/settings.json), never in session.
- **Firefly access** only through `FireflyService` (`src/lib/firefly/service.ts`).
  `src/lib/firefly/generated/` is codegen output — never hand-edit (except
  `model/currency-update.ts`, hand-preserved across regens).
- **i18n**: `@grammyjs/i18n` 0.5.1 with YAML `/locales` (en/es/it/ru). Do NOT
  upgrade to 1.x — it is Fluent-only. Locale keys are v1's, unchanged.
- **Menus**: `@grammyjs/menu` only. No raw InlineKeyboard, no `bot.callbackQuery`,
  no manual callback-data parsing (lint-tested). Payload buttons: read `ctx.match`.
- **`legacy/`** is v1 reference code: never import, never edit.

## Testing Patterns

Drive a real bot: `createTestBot()` → `setupMockApi(bot)` → `initializeBot(bot)` →
`bot.handleUpdate(generateMessageUpdate(...))`, assert on recorded API calls.
Click buttons by visible label with `findButton()` and replay its callback_data.
Fake Firefly at the service boundary (`createTestFireflyService`). Architecture
rules live in `__tests__/lint/` — extend them, never bypass.

## Code Style

- pino via `ctx.logger` (per-update child). No console.log, no debug.
- Handlers return the reply promise.
- Non-null assertions allowed (`ctx.msg!.text`).

## Beads Issue Tracker

(unchanged — see `bd prime`)
```

- [ ] **Step 2: Verify + commit**

Run: `bunx vitest run && bun run lint`
Expected: green (or fix trivial style nits with `bun run fix`)

```bash
git add CLAUDE.md
git commit -m "docs(v2): CLAUDE.md for the v2 architecture"
```

---

## Out of scope for this plan (later phase plans)

- `requireSettings` gate middleware — lands with the transactions feature (Phase 3), when there is something to gate.
- `docs/GRAMMY_MENUS.md` cookbook — Phase 2, when list/pagination standards multiply menus.
- Earthfile / CI / Docker base image swap — Phase 5 cutover.
- Deleting `legacy/` — Phase 5.
- `FireflyService` transaction/category methods — Phases 2–3.

## Self-Review (performed at plan-writing time)

1. **Spec coverage (Phases 0–1):** skeleton ✓ (T1–T10), settings feature ✓ (T11), settings store + migration ✓ (T4, T12), test harness before features ✓ (T7 precedes T8/T11), CLAUDE.md ✓ (T13). Deferred items are listed above with owning phases.
2. **Placeholders:** two intentional port-with-reference blocks (donor mock-API lines, `findButton`, legacy `filterActiveAccounts`, legacy keyboard layout) point at exact on-disk files/lines — the source of truth exists locally; two inline "cleanup instruction" notes tell the implementer to inline rather than copy scaffolding quirks. No TBDs.
3. **Type consistency:** `createTestBot`/`setupMockApi`/`findButton` signatures used in T8/T11 match T7's definitions; `defaultSettings`/`UserSettings`/`SettingsStore` consistent across T4/T7/T8/T11/T12; `FireflyServiceFactory` matches `Dependencies.firefly`; `settingsText` exported from `settings.menu.ts` and consumed by router/index; `command` constant defined in T8, used in T11.

## Execution Order

Tasks 1 → 13 strictly sequential. Task 3 knowingly leaves `tsc --noEmit` red until Task 5 lands (branch is WIP; called out in T3 Step 6).

