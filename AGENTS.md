# Agent Instructions

## Build & Development Commands

```bash
bun install                # Install dependencies
bun run dev                # Dev with watch-reload
bun run start              # Run the bot (polling)
bunx tsc --noEmit          # Typecheck
bun run lint / bun run fix # ESLint
LOG_FILE=logs/bot.log LOG_LEVEL=debug bun run start  # Debug run with file logging (logs/ gitignored)
bunx vitest run            # Unit + integration tests (no external services needed)
docker compose -f docker-compose.tests.yaml up -d   # ephemeral Redis for e2e
bun run test:e2e           # e2e (real Redis, Telegram still mocked)
bun run codegen            # Regenerate Firefly client into src/lib/firefly/generated
docker compose -f compose.firefly.yaml up -d        # DEV local Firefly III + MariaDB
```

## Architecture

Telegram bot (grammY, Bun, pure ESM, `#root/*` → `src/*`) for the Firefly III API.
Entry `src/main.ts` (polling only). `createBot(token, deps)` in `src/bot/index.ts`
is the DI seam: deps = `{ config, logger, settingsStore, firefly, sessionStorage }`.
Tests inject fakes here — never module-mock.

Middleware order (load-bearing): deps → errorBoundary → accessControl →
sequentialize → session(Redis) → i18n → setLocaleFromSettings →
features → unhandled (last).

- **Features** live in `src/bot/features/<name>/` (composer index.ts + *.menu.ts + *.router.ts).
- **Session** (`src/bot/context.ts`): one optional field per flow (e.g. `settingsFlow`).
  NEVER a shared `step` string (lint-tested). Flow state may expire (24h Redis TTL).
- **Credentials** live in `src/lib/settings-store.ts` (data/settings.json), never in session.
  Env (`FIREFLY_URL`/`FIREFLY_ACCESS_TOKEN`) seeds users with no stored settings
  (`bot/index.ts` `envDefaults`) — stored settings always win.
- **Firefly access** only through `FireflyService` (`src/lib/firefly/service.ts`).
  `src/lib/firefly/generated/` is codegen output — never hand-edit (except
  `model/currency-update.ts`, hand-preserved across regens).
- **i18n**: `@grammyjs/i18n` 0.5.1 with YAML `/locales` (en/es/it/ru). Do NOT
  upgrade to 1.x — it is Fluent-only. Locale keys are v1's, unchanged.
- **Menus**: `@grammyjs/menu` only. No raw InlineKeyboard, no `bot.callbackQuery`,
  no manual callback-data parsing (lint-tested). Payload buttons: read `ctx.match`.
- **Rich messages**: list content goes out as GFM markdown via
  `ctx.replyWithRichMessage` / `ctx.editMessageText({ markdown })` (grammy 1.46,
  Bot API 10.1) with menus attached as `reply_markup`. Escape user values
  (`bot/helpers/rich.ts`); column headers come from shared `tables.*` locale keys.
  Patterns: `docs/GRAMMY_MENUS.md`.

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
