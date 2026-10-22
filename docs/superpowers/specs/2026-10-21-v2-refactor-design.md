# v2 Refactor — AI-First Architecture Rewrite

**Date:** 2026-10-21
**Status:** Approved design, pending implementation plan
**Pattern source:** `~/code/rukevich/bot` (donor codebase — read its files when porting patterns)

## Motivation

The bot works but every change is verified by hand in Telegram: zero tests, no injection
seam (`firefly()` inline in ~20 handlers), one shared session bag where a single `step`
string drives 4 routers and flows corrupt each other's state, a 1,027-line menu monster,
and four coexisting callback-data schemes. Goal: restructure for **AI-first iteration** —
small feature slices, enforced standards, and a test harness that lets an agent change a
flow and prove it without touching Telegram.

## Decisions (settled with owner)

| Fork | Decision |
|---|---|
| Delivery | Rewrite core, port features (branch; old code on `master` stays deployable until cutover) |
| Runtime | Bun, pure ESM, `#root/*` import aliases, tests run against source |
| Sessions | Redis (`@grammyjs/storage-redis`), keyed by chat id, 24h TTL, `sequentialize` for per-chat ordering |
| Firefly client | Keep the generated typescript-axios client, wrapped in an injected service layer |
| i18n | Keep existing YAML locales (en/es/it/ru); Fluent conversion explicitly deferred |
| Delivery mode | Polling only (no webhook) |
| UX | Behavior-preserving port; no flow redesign during migration |

## 1. Target architecture

```
src/
  main.ts                  # polling entry, graceful shutdown
  config.ts                # valibot-validated env
  logger.ts                # pino
  bot/
    index.ts               # createBot(token, deps) — the DI seam
    context.ts             # Context flavors + SessionData
    i18n.ts                # YAML locales, loaded once
    menus/index.ts         # registerCoreMenus()
    middlewares/            # session, errorBoundary, sequentialize wiring
    features/
      start/               # /start, /help, unhandled fallback (always last)
      settings/            # composer + menu + router
      accounts/  categories/  reports/
      transactions/        # add.menu.ts | edit.menu.ts | list.menu.ts | router.ts
  lib/
    firefly/               # generated client (untouched, codegen kept) + firefly.service.ts
    session.ts             # Redis adapter factory
    settings-store.ts      # durable per-user Firefly credentials (JSON file)
    date-picker/           # rebuilt as a plain @grammyjs/menu component
__tests__/                 # helpers/ features/ e2e/ lint/ (mirrors rukevich layout)
docs/                      # menu cookbook + plans/
```

**DI seam** (donor: `rukevich/bot/src/bot/index.ts`): `createBot(token, { config, logger,
settingsStore, fireflyFactory })`. One middleware attaches deps to `ctx`. Tests construct
a real bot with fakes — no module mocking.

**Middleware order** (load-bearing, documented in CLAUDE.md, asserted by a lint test):
`sequentialize → session(redis) → i18n → registerCoreMenus → features → unhandled`.

## 2. Session model

Replaces the single shared `step` string with per-flow state objects; one Router per
flow keyed on its **own** session field, so flows cannot re-point each other and cleanup
touches only its own field.

```ts
interface SessionData {
  settingsFlow?: { step: 'url' | 'api_url' | 'token' }
  categoryFlow?: { step: 'add' | 'rename', category?: CategoryRead }
  txnDraft?: TransactionDraft
  editFlow?: { transactionId: string, field: 'amount' | 'description' }
  lists?: Record<string, { page: number, view?: string }> // keyed per list
  __language_code?: string
}
```

**Credentials leave the session.** Per-user Firefly URL/token live in
`lib/settings-store.ts` — a durable JSON file (`data/settings.json`, gitignored) — so the
Redis TTL never logs users out and tokens stop persisting in session dumps. A one-time
migration script (`scripts/migrate-v1-sessions.ts`) reads legacy `sessions/**/*.json`,
extracts `userSettings`, and seeds the store. Flow state (drafts, half-finished edits)
*should* expire with the TTL.

## 3. Firefly service layer

Generated client stays (codegen step unchanged), but feature code never imports it.
`lib/firefly/firefly.service.ts` exposes only what the bot uses (~10 methods):

`about` (connection validation), `listAccounts(type?)`, `listCategories`,
`getTransaction`, `listTransactions(type?, page?)`, `storeTransaction`,
`updateTransaction`, `deleteTransaction`.

- Builds and caches one axios client per user-settings.
- Interceptors registered **once per client instance** — fixes the v1 bug where every
  `firefly()` call adds another global interceptor.
- A lint test bans importing `lib/firefly/api|model` or `firefly()` outside the service.

## 4. Menus & callback data

`@grammyjs/menu` exclusively (donor standard, see `rukevich/bot/docs/GRAMMY_MENUS.md`):
menus defined per feature in `*.menu.ts`, registered deepest-first; state travels via
session; re-render via `ctx.menu.nav()/update()`; cross-feature nav via
`ctx.editMessageText`/`editMessageMedia` with target menu markup.

- **`lib/Mapper.ts` (vm sandbox) deleted.** Pagination/tabs become session page counter +
  prev/next buttons (donor pattern: `rukevich/bot/src/bot/features/admin/orders.menu.ts`).
- **Date picker rebuilt** (~200 lines) as a stateless menu component; the picked date
  lands in flow state; the 447-line session-coupled class is not ported.
- `helpers.ts` is not ported: pure parts (`parseAmountInput`, `formatTransactionText`)
  become pure tested modules under `bot/helpers/`; formatting/network/keyboard glue
  dissolves into the owning features.
- The four v1 callback schemes (Mapper/vm, hand regexes, menu payloads, `dp_` strings)
  collapse to one: menu payloads.

## 5. Testing

Vitest, two configs (`vitest.config.ts`, `vitest.config.e2e.ts`), ported from donor:

- **Unit** — pure helpers, zero mocks.
- **Integration** — `createTestBot()` + mock Telegram API transformer
  (`__tests__/helpers/bot.ts`, donor: `rukevich/bot/__tests__/helpers/bot.ts`): records
  outgoing calls into `outgoingRequests[]`, assigns message ids, and **mirrors Telegram
  edit semantics** (editing a media message throws 400). Drive flows via
  `bot.handleUpdate(generateMessageUpdate(...))`; assert on captured payloads.
  Firefly is faked at the service boundary (fixture responses), not the network.
- **E2E** — real Redis from `docker-compose.tests.yaml`; flows clicked **by visible
  label** via ported `findButton()` which replays the real encoded `callback_data`.
- **Lint tests** (`__tests__/lint/`) — architecture rules:
  - no raw `InlineKeyboard` / `bot.callbackQuery` / manual callback-data parsing
  - no `firefly` client usage outside the service layer
  - no reintroduction of a shared `step` field or `cleanupSessionData`
  - no re-adding `@grammyjs/conversations`

## 6. AI-first scaffolding

- Rewritten CLAUDE.md: commands, middleware order table, feature-slice rules,
  menu-vs-router decision table, testing patterns.
- `docs/GRAMMY_MENUS.md`-style cookbook ported/adapted from donor.
- Dated design docs in `docs/plans/` (this spec moves the practice here).
- Standards enforced by lint tests, not prose.

## 7. Migration phases

All work on the `feat/major-refactoring` branch (herdr worktree). Each phase lands with tests from its first commit
(harness exists from Phase 0 — no "tests later" window). Old `src/` untouched until
Phase 5.

| Phase | Ships | Acceptance |
|---|---|---|
| 0 | Skeleton: Bun+ESM+vitest+`docker-compose.tests.yaml`, `createBot`, start feature, ported mock-API helpers | `/start` integration test green; lint tests green |
| 1 | settings feature + settings store + `scripts/migrate-v1-sessions.ts` | configure-via-chat flow tested e2e; migration script converts a fixture session file |
| 2 | accounts, categories | list + pagination standards established; integration + e2e green |
| 3 | transactions add + list | amount→description→category→confirm flow, quick mode, deposit/transfer submenus, list views; the 1,027-line monster split into per-flow files; SHOW_TRANSFERS filter bug fixed |
| 4 | transactions edit/delete + date-picker rebuild | fixes folded in: duplicate `requireSettings` |
| 5 | reports (first new feature on v2 — currently a stub) + cutover | delete old `src/`, Mapper, old date picker; Docker→Bun base image; Earthfile/CI updated; version bump |

Dead v1 code is simply not ported: `formatTransactionUpdate` (dead, hardcoded Russian);
the one live Russian toast (`categories.ts:234`) moves to locales.

## Non-goals

Webhook mode; Fluent/.ftl conversion; Postgres/Prisma (no local domain data); multi-split
transactions; UX/flow redesign during port; encrypted credential storage at rest
(the settings file is root-private in the container, same trust boundary as v1).

## Bugs folded into the port (from exploration)

1. `list-transactions.ts:184` SHOW_TRANSFERS button filters withdrawals → fixed in Phase 3 (list port).
2. Duplicate `requireSettings` mount (`settings.ts:154` + `index.ts:67`) → v2 has one.
3. Session-stored closure `deleteKeyboardMenuMessage` (unserializable) → v2 stores message
   ids, not closures.
4. Axios interceptor accumulation → fixed structurally by the service layer.
5. `bot.start()` before `bot.catch()` → v2 registers error handling first.

## Phase 2 amendments (2026-10-22, owner-approved)

1. **grammy 1.39.3 → 1.46.0; @grammyjs/menu 1.3.1 → 1.5.0; @grammyjs/storage-redis 2.5.1 → 2.6.0.**
   Enabled by Bot API 10.1+ rich messages. router/runner already latest; i18n stays 0.5.1.
   The full non-grammy dependency sweep happens at Phase 5 cutover.
2. **List messages render as native rich tables** (GFM markdown via `sendRichMessage` /
   `editMessageText({ rich_message })`), replacing v1's `<pre>` ASCII tables built with the
   `table` npm package (which is NOT re-added — a pure `markdownTable` helper replaces it).
   Rendering deviation from "behavior-preserving port"; flows, buttons, and locale keys unchanged.
   Locale *values* for `accounts.list.*` / `categories.transactionsList` drop the `<pre>` wrapper;
   new shared `tables.*` column-header keys carry the localization.
3. **`requireSettings` gate moves from Phase 3 to Phase 2** — accounts/categories are the first
   Firefly-dependent features. One mount in `createBot`, after start+settings, before them.
4. **Accounts tab bar shows all four account types, active one rendered with menu@1.5 `.disabled()`**
   (v1 hid the active tab). Delete-confirmations use `.danger()` styling on the YES button.
5. **Pagination standard only**: `lists` session field + tabs + cookbook now; prev/next page
   buttons arrive with Phase 3 (transactions), where v1 actually paginated.
