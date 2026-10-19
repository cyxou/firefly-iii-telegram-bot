# Agent Instructions

## Build & Development Commands

```bash
npm install              # Install dependencies
npm start                # Dev server with hot reload (nodemon + ts-node)
npm run build            # Compile TypeScript to dist/ (also copies locales)
npm run lint             # ESLint check
npm run fix              # ESLint auto-fix
npm run codegen          # Regenerate Firefly III API client from OpenAPI spec
```

No test framework is configured. Do not write or run tests unless explicitly requested.

## Architecture

This is a Telegram bot built with **Grammy.js** that integrates with the [Firefly III](https://www.firefly-iii.org/) personal finance manager API. TypeScript, strict mode, CommonJS modules, target ES2016.

### Middleware Chain (src/index.ts)

The bot processes messages through this ordered chain:
1. Rate limiter (`@grammyjs/ratelimiter`)
2. Access control (filters by `ALLOWED_TG_USER_IDS` env var)
3. File-based session storage (`@grammyjs/storage-file`) — keys are `${userId}_${chatId}`
4. i18n middleware (`@grammyjs/i18n`)
5. `requireSettings` — blocks non-settings commands until Firefly URL and token are configured
6. `cleanup` — schedules deletion of keyboard menu messages
7. Feature composers (transactions, accounts, categories, reports, settings)
8. Command handlers (`/start`, `/help`) and catch-all text handler

### Composer Pattern

Each feature domain is a Grammy `Composer` in `src/composers/`:
- **transactions/** — add, edit, list transactions (largest and most complex composer)
- **accounts.ts** — list/view accounts
- **categories.ts** — list categories
- **settings.ts** — configure Firefly connection (URL, API token, default accounts, language)
- **reports.ts** — financial reports
- **helpers.ts** — shared utilities (amount parsing with mathjs, keyboard builders, transaction formatting)
- **constants.ts** — command names, menu identifiers, page limits

Composers use a **Router-based state machine** via `session.step` to track multi-step flows (e.g., transaction creation goes through amount entry → description → category selection → confirmation).

### Firefly III API Client (src/lib/firefly/)

Auto-generated from OpenAPI spec using `typescript-axios` generator. **Do not manually edit** files in `api/` or `model/` subdirectories. Customizations are in:
- `index.ts` — factory that creates configured API instances with auth and error interceptors
- `api.ts` — manually maintained barrel export (excludes `configuration-api.ts` due to naming collision)
- `.openapi-generator-ignore` — prevents overwrite of customized files

Regenerate with `npm run codegen` (cleans generated files first, fetches spec from Firefly III docs).

### Key Custom Libraries

- **Mapper** (`src/lib/Mapper.ts`) — Callback data serializer/deserializer for inline keyboards. Uses template strings like `LIST_ACCOUNTS|TYPE=${type}` to encode/decode callback query data via Node.js `vm` module.
- **MenuDatePicker** (`src/lib/menu-date-picker/`) — Custom Grammy Menu-compatible inline calendar, ported from telegram-inline-calendar. Stateless design, session-persisted state via `DatePickerState`.

### Session Data (src/types/SessionData.ts)

Per-user-chat session stores: current step, user settings (Firefly credentials, defaults), transaction state, cached accounts/categories, pagination state, and date picker state.

### Internationalization

Locale files in `src/locales/` (en, es, it, ru). Uses `@grammyjs/i18n` with session-based language switching. Default language: English. Dayjs locales loaded for date formatting.

### CI/CD

- **Earthly** build system (`Earthfile`) builds multi-platform Docker images (amd64 + arm)
- GitHub Actions release workflow triggers on version tags (`v*`), pushes to Docker Hub
- PR validation runs tests and build via Earthly

## Environment Variables

| Variable | Purpose |
|---|---|
| `BOT_TOKEN` | Telegram bot token from BotFather |
| `ALLOWED_TG_USER_IDS` | Comma-separated Telegram user IDs for access control (unset = open to all) |
| `DISABLE_UNAUTHORIZED_USER_LOG` | Set to `true` to suppress unauthorized access logs |
| `FIREFLY_URL` | Default Firefly III instance URL |
| `FIREFLY_API_URL` | Override for Firefly API URL (defaults to `${FIREFLY_URL}/api`) |
| `FIREFLY_ACCESS_TOKEN` | Default Firefly III API token |
| `DEBUG` | Enable debug logging (e.g., `bot:*`) |

## Code Style Notes

- **Debug logging**: Use `const log = debug('bot:domain:fn')` with `rootLog.extend('fnName')` for hierarchical namespacing. The `debug` library is used everywhere — not `console.log` (except in error catch blocks).
- **Non-null assertions**: Allowed (`no-non-null-assertion` is off). Pattern like `ctx.msg!.text`, `ctx.from!.id` is standard.
- **Grammy handlers**: Return the `ctx.reply()` Promise directly rather than calling without return.
- **Auto-generated API**: The codegen uses `useSingleRequestParameter: true` — API methods accept a single config object, not individual parameters.

## Known Limitations

- No support for multiple transaction splits (single split per transaction only)
- `formatTransactionUpdate` in helpers.ts has hardcoded Russian strings
- Do not edit multiple transactions simultaneously (shared session state)
- New users may see unnamed "(cash)" account until first transaction is created via Firefly UI


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
<!-- END BEADS INTEGRATION -->
- If a required sync or push is blocked, stop and report the exact command and error.
