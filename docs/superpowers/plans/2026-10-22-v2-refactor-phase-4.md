# v2 Refactor — Phase 4: Transactions (edit/delete + date-picker rebuild) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v1 transaction edit surface (category / date / source / destination / amount / description, open-in-browser, delete) to v2 behind a record-attached edit menu, and rebuild the date picker as a stateless payload-encoded `@grammyjs/menu` component — retiring v1's session-coupled `MenuDatePicker` class and the raw `dp_` callback scheme.

**Architecture:** One feature slice `src/bot/features/transactions/` grows `record.menu.ts` + `edit.menu.ts`; text-input edits route through a dedicated `editRouter` keyed on `session.editFlow.step` (own field, never a shared `step`); every Firefly mutation goes through three new `FireflyService` methods; the date picker lives in `src/lib/date-picker/` as a pure render component whose every button payload carries the full view state (`<trId>|m|<YYYY-MM>` / `<trId>|y|<YYYY>-<M>` / `<trId>|d|<YYYY-MM-DD>`) — zero session state, same stateless pattern as the categories month-view nav.

**Tech Stack:** Bun, pure ESM, grammY 1.46 + @grammyjs/menu 1.5 + @grammyjs/router 2, @grammyjs/i18n 0.5.1 (YAML, do NOT upgrade), dayjs, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-refactor-design.md` (§7 Phase 4 row, §2 session model, §4 menus & callback data — "date picker rebuilt (~200 lines) as a stateless menu component", §5 testing). v1 behavior source: `legacy/composers/transactions/add-transactions-menus.ts` (record menu ~470–600, edit submenus/handlers ~600–960), `legacy/composers/transactions/edit-transaction.ts`, `legacy/lib/menu-date-picker/index.ts`.

## Global Constraints

- grammy 1.46.0, @grammyjs/menu 1.5.0, @grammyjs/router 2.0.0, @grammyjs/i18n **0.5.1** (never 1.x — Fluent-only). No new dependencies.
- `#root/*` import aliases, pure ESM, `.js` suffix on imports.
- Menus: `@grammyjs/menu` only. No raw `InlineKeyboard`, no `bot.callbackQuery`, no manual callback-data parsing (lint-tested). Payload buttons read `ctx.match`.
- No `firefly` client import outside `src/lib/firefly/service.ts` (lint-tested). Firefly types are re-exported from the service.
- Session: one optional field per flow. NEVER a shared top-level `step` string (lint-tested — a `step` nested inside `editFlow` is fine, `txnFlow.step` is precedent). Never write session inside `.dynamic()` render callbacks; handlers may.
- Record/prompt messages are legacy `parse_mode: 'Markdown'` prose (v1 parity) with every user-controlled value through `escapeMarkdown()` — `formatTransaction` already does this; do not add unescaped interpolation.
- menu@1.5 traps (from project memory, all apply here):
  - Menus whose button labels derive from `ctx.match` need `new Menu(id, { onMenuOutdated: false })` + fixed layout + every button handler-backed, else payload clicks self-invalidate ("Menu was outdated"). The date-picker host menu hits this; session-driven pickers (category page) do not — `add.menu.ts` pagination is the working precedent for those.
  - In `.submenu()` custom middleware, edit with `ctx.editMessageText` **without** `reply_markup` — navInstaller injects the target menu.
  - A plain `.text()` button that re-points the message at a *different registered menu* passes that menu explicitly as `reply_markup`.
  - To clear a keyboard, pass `reply_markup: { inline_keyboard: [] }` explicitly.
- Payload byte budget: callback_data ≤ 64 bytes including the menu prefix. Firefly journal ids are ~19–20 chars; `<trId>|m|<YYYY-MM>` ≈ 29 bytes + prefix ≈ 9 → fits. Never add more state to these payloads without recounting.
- pino via `ctx.logger` only. Handlers return the reply promise. Non-null assertions allowed.
- Tests: `createTestBot()` + `setupMockApi()` + `initializeBot()` + `bot.handleUpdate(...)`; click by visible label via `findButton()`; Firefly faked at the service boundary (`createTestFireflyService`). Never module-mock.
- Every task: `bunx vitest run` green + `bunx tsc --noEmit` clean + `bun run lint` clean before commit. e2e needs `docker compose -f docker-compose.tests.yaml up -d` first.
- Beads: at execution start, create an epic `Phase 4: transactions edit/delete + date picker` plus one task issue per plan task below, and close each as its task commits.

## Decisions (owner-approved 2026-10-22, or Phase 2/3 precedent — veto at plan review, not mid-execution)

1. **Delete gets a confirmation submenu** (owner-approved deviation): DELETE → `transactions.edit.confirmDeletion` text + YES (`.danger()`) / CANCEL, mirroring the Phase 2 categories delete-confirm (`categories.menu.ts:49-71`). v1 deleted instantly; same deviation class as the Phase 2 rich-tables amendment. After YES: `deleteTransaction` + `ctx.deleteMessage()` (v1's message-vanishes behavior, no toast).
2. **Edit is reachable from the record message only** (owner-approved, v1-faithful). No per-row edit buttons in the day-view list; that would be new UX beyond the port. Can be its own change later.
3. **The date picker is payload-stateless.** v1 pinned `transactionId` in `ctx.session.datePickerState` and parsed raw `dp_` strings (callback scheme #4); v2 encodes `<trId>|<view>` in every button payload and renders from `ctx.match` — the categories month-view pattern (`categoryDetailsMenu`), which also dictates `onMenuOutdated: false` there. The stale-calendar-session bug class is unreachable by construction.
4. **Session carries ids, not transactions.** `editFlow = { transactionId, step?, categoryPage?, promptMessage? }`; the transaction is fetched fresh per edit (`applyTransactionUpdate`). v1's `session.currentTransaction` copy (and its `augmentSessionWithCurrentTransaction` staleness guard) is not ported. New `session.recordTrId` is v1's `currentTransaction.id` reduced to an id — the record menu's Edit-button payload source, skipped when absent exactly like v1 skipped the button after session loss.
5. **Updates re-send the full split** (v1 `updateFireflyTransaction` verbatim): source/destination/category/currency/date are always sent, filled from the *current* fetched split, with the change overlaid — never rely on the API merging absent fields.
6. **v1 quirks kept verbatim** (behavior-preserving): source-account change also re-points `currency_id` to the new account's currency (v1 `editTransactionSelectSourceAccountHandler`); the source picker skips the transaction's current destination (no self-transfer); the destination picker lists `CashAccount | Liabilities | Expense`; account lists render `.reverse()` (via the shared `pickAccounts`); weekday header cells and blank grid cells are noop *buttons* (v1 layout); Monday-first week regardless of locale; today renders as `N*`; current year brackets as `[YYYY]`; amount input supports v1's leading-operator composition (`+50` / `-20` against the current amount via `parseAmountInput(input, oldAmount)` — empty input is an error, not "keep current").
7. **Amount/description text flows follow the foreign-amount precedent** (`txnFlow`): prompt message id stored as plain ids (`editFlow.promptMessage`), deleted after the input lands, fresh record reply (`showRecord(ctx, tr, false)`). A finished quick/slow add clears `editFlow` so a pending edit prompt can never hijack the next text.
8. **Dead v1 code not ported:** `handleDatePickerCallback` (raw `dp_` parsing — replaced by payloads), `MenuDatePicker` statics `navigateYear`/`toggleMode`/`selectYear` (superseded by payload encoding), the picker's `language`/`dateFormat` options (dayjs global locale is already set per-update by `middlewares/locale.ts`; format is always `YYYY-MM-DD`), `minDate`/`maxDate` options (v1 never passed them — every date is selectable; add when a flow needs bounds), `deleteBotsMessage`/`cleanupSessionData` (session-closure bug #3 structurally gone), `transactions.add.couldNotDelete` (delete errors route through the error boundary, Phase 3 decision 8 precedent).
9. **es.yaml has a pre-existing gap**: `transactions.edit.typeNewDate` exists in en/it/ru but NOT es (verified). Task 8 adds it alongside the new `confirmDeletion` key in all four locales.

---

### Task 1: FireflyService get/update/delete + fake parity

**Files:**
- Modify: `src/lib/firefly/service.ts` (interface + implementation)
- Modify: `__tests__/helpers/bot.ts` (`createTestFireflyService` transactions fake)
- Test: `__tests__/helpers/firefly-fake.test.ts` (new)

**Interfaces:**
- Produces (consumed by Tasks 2–7):
  - `getTransaction(id: string): Promise<TransactionRead>`
  - `updateTransaction(id: string, split: TransactionSplitUpdate): Promise<TransactionRead>`
  - `deleteTransaction(id: string): Promise<void>`
  - type re-export `TransactionSplitUpdate`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/helpers/firefly-fake.test.ts
import { describe, expect, it } from 'vitest'
import { createTestFireflyService, testAccount, testCategory } from './bot.js'

const SPLIT = {
  type: 'withdrawal',
  date: '2026-10-22T10:00:00+00:00',
  description: 'Groceries',
  source_id: '1',
  amount: '25',
} as never

describe('createTestFireflyService transactions (fake parity for Phase 4)', () => {
  it('get returns the stored transaction; 404s when missing', async () => {
    const firefly = createTestFireflyService({
      accounts: [testAccount('1', 'Checking', { type: 'asset' })],
    })
    const created = await firefly.storeTransaction(SPLIT)
    const got = await firefly.getTransaction(created.id)
    expect(got.attributes.transactions![0]!.description).toBe('Groceries')
    await expect(firefly.getTransaction('nope')).rejects.toThrow()
  })

  it('update overlays the change, keeps untouched fields, re-resolves names', async () => {
    const firefly = createTestFireflyService({
      accounts: [testAccount('1', 'Checking', { type: 'asset' })],
      categories: [testCategory('9', 'Food')],
    })
    const created = await firefly.storeTransaction(SPLIT)
    const updated = await firefly.updateTransaction(created.id, { amount: '30', category_id: '9' })
    const split = updated.attributes.transactions![0]!
    expect(split.amount).toBe('30')
    expect(split.category_id).toBe('9')
    expect(split.category_name).toBe('Food')
    expect(split.description).toBe('Groceries') // untouched field survives
    expect(split.source_name).toBe('Checking') // names re-resolved like the real API
  })

  it('delete removes the transaction', async () => {
    const firefly = createTestFireflyService({ transactions: [] })
    const created = await firefly.storeTransaction(SPLIT)
    await firefly.deleteTransaction(created.id)
    await expect(firefly.getTransaction(created.id)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run __tests__/helpers/firefly-fake.test.ts`
Expected: FAIL — `firefly.getTransaction is not a function`.

- [ ] **Step 3: Add the service methods**

In `src/lib/firefly/service.ts` — add to imports/re-exports (top, next to the other model imports):

```ts
import type { TransactionSplitUpdate } from '#root/lib/firefly/generated/model/transaction-split-update.js'
// and to the export line:
export type { AccountRead, CategoryRead, TransactionRead, TransactionSplitStore, TransactionSplitUpdate }
```

Add to the `FireflyService` interface (after `storeTransaction`):

```ts
  getTransaction: (id: string) => Promise<TransactionRead>
  updateTransaction: (id: string, split: TransactionSplitUpdate) => Promise<TransactionRead>
  deleteTransaction: (id: string) => Promise<void>
```

Add to the returned object in `createFireflyService` (after `storeTransaction`):

```ts
    async getTransaction(id) {
      const res = await clients().Transactions.getTransaction(id)
      return res.data.data
    },
    async updateTransaction(id, split) {
      const res = await clients().Transactions.updateTransaction(id, { transactions: [split] })
      return res.data.data
    },
    async deleteTransaction(id) {
      await clients().Transactions.deleteTransaction(id)
    },
```

- [ ] **Step 4: Add the fake implementations**

In `__tests__/helpers/bot.ts` inside `createTestFireflyService`'s returned object (after `storeTransaction`). Mirror `storeTransaction`'s name-resolution logic — updates must be observable in later `getTransaction`/record renders:

```ts
    async getTransaction(id) {
      const found = transactions.find(t => t.id === id)
      if (!found)
        throw new ResourceNotFoundError('404')
      return found
    },
    async updateTransaction(id, split) {
      const found = transactions.find(t => t.id === id)
      if (!found)
        throw new ResourceNotFoundError('404')
      const cur = found.attributes.transactions![0]!
      Object.assign(cur, split)
      const accounts = fixtures.accounts ?? []
      if (split.source_id)
        cur.source_name = accounts.find(a => a.id === split.source_id)?.attributes.name ?? cur.source_name
      if (split.destination_id)
        cur.destination_name = accounts.find(a => a.id === split.destination_id)?.attributes.name ?? cur.destination_name
      if (split.category_id !== undefined && split.category_id !== null)
        cur.category_name = fixtures.categories?.find(c => c.id === split.category_id)?.attributes.name
      return found
    },
    async deleteTransaction(id) {
      const idx = transactions.findIndex(t => t.id === id)
      if (idx !== -1)
        transactions.splice(idx, 1)
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run __tests__/helpers/firefly-fake.test.ts && bunx vitest run`
Expected: PASS (new file + whole suite still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/firefly/service.ts __tests__/helpers/bot.ts __tests__/helpers/firefly-fake.test.ts
git commit -m "feat(v2): firefly service get/update/delete transaction + fake parity"
```

---

### Task 2: Record menu + edit shell (session fields, open-in-browser, back)

**Files:**
- Modify: `src/bot/context.ts` (SessionData + EditFlowState)
- Create: `src/bot/features/transactions/record.menu.ts`
- Create: `src/bot/features/transactions/edit.menu.ts`
- Modify: `src/bot/features/transactions/record.ts:39-44` (`showRecord` attaches the menu)
- Modify: `src/bot/features/transactions/index.ts` (use recordMenu)
- Test: `__tests__/features/transactions/edit.test.ts` (new file, grows through Task 7)

**Interfaces:**
- Consumes: Task 1 service methods; `showRecord` (unchanged signature) from `record.ts`.
- Produces (consumed by Tasks 3–7):
  - `recordMenu: Menu<Context>` (id `'txn-record'`)
  - `editTransactionMenu: Menu<Context>` (id `'edit-transaction'`)
  - `applyTransactionUpdate(ctx: Context, trId: string, changes: Partial<TransactionSplitUpdate>): Promise<TransactionRead>` — in `edit.menu.ts`
  - `showRecordFromId(ctx: Context, trId: string): Promise<...>` — re-fetch + re-render the record into the current message
  - `staleExit(ctx: Context)` and `cancelTextPrompt(ctx: Context)` — in `edit.menu.ts`
  - `enterEditFlow(ctx: Context)` — submenu-attach middleware setting `session.editFlow`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/features/transactions/edit.test.ts
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
  testAccount,
  testCategory,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function setupEdit() {
  const firefly = createTestFireflyService({
    accounts: [
      testAccount('1', 'Checking', { type: 'asset', currencyId: '1', currencySymbol: '$' }),
      testAccount('2', 'Cash wallet', { type: 'Cash account' }),
      testAccount('3', 'EUR wallet', { type: 'asset', currencyId: '2', currencySymbol: '€' }),
    ],
    categories: [testCategory('1', 'Food'), testCategory('2', 'Fun')],
    transactions: [],
  })
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  const send = (text: string) => bot.handleUpdate(generateMessageUpdate(text))
  return { bot, api, firefly, click, send }
}

describe('record menu + edit shell', () => {
  it('record reply carries a ✏️ Edit button whose payload is the new transaction id', async () => {
    const { api, send } = await setupEdit()
    await send('Groceries 25')
    const btn = findButton(api.getOutgoingRequests(), '✏️ Edit')
    expect(btn).toBeDefined()
    expect(btn!.data).toContain('200') // fake ids start at 200
  })

  it('Edit opens the edit shell; open-in-browser URL points at the transaction', async () => {
    const { api, click, send } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    const last = api.getOutgoingRequests().at(-1)!
    const kb = (last.payload as any).reply_markup.inline_keyboard as { text: string, url?: string }[][]
    expect(kb.flat().find(b => b.url)?.url).toBe('https://ff.example.com/transactions/show/200')
    expect(kb.flat().some(b => b.text === '🔙 Back')).toBe(true)
  })

  it('🔙 Back re-renders the record with the Edit button again', async () => {
    const { api, click, send } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔙 Back')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
    expect(findButton(api.getOutgoingRequests(), '✏️ Edit')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts`
Expected: FAIL — first test: no `✏️ Edit` button on the record reply.

- [ ] **Step 3: Session fields**

In `src/bot/context.ts`, add next to `TxnFlowState`:

```ts
export interface EditFlowState {
  transactionId: string
  /** text-input routes; also the editRouter key (own field, never a shared step) */
  step?: 'amount' | 'description'
  /** client-side page for the edit category picker (add-flow precedent) */
  categoryPage?: number
  /** text prompt to delete once the input lands (plain ids, never a closure) */
  promptMessage?: { chatId: number, messageId: number }
}
```

In `SessionData`, add:

```ts
  /** record message Edit-button payload source — v1 currentTransaction.id reduced to an id */
  recordTrId?: string
  editFlow?: EditFlowState
```

- [ ] **Step 4: Record menu**

```ts
// src/bot/features/transactions/record.menu.ts
import type { Context } from '#root/bot/context.js'
import { Menu, MenuRange } from '@grammyjs/menu'

// The record message's keyboard: the Edit submenu only (v1 parity — v1 skipped
// the button when session.currentTransaction was lost; recordTrId is that
// field, reduced to an id). The payload bakes the id at render time, so a
// stale render can only *miss* the button, never mis-target the click.
export const recordMenu = new Menu<Context>('txn-record')
  .dynamic((ctx) => {
    const range = new MenuRange<Context>()
    const trId = ctx.session.recordTrId
    if (trId)
      range.submenu({ text: () => ctx.i18n.t('labels.EDIT_TRANSACTION'), payload: trId }, 'edit-transaction')
    return range
  })
```

- [ ] **Step 5: Edit shell**

```ts
// src/bot/features/transactions/edit.menu.ts
import type { Context } from '#root/bot/context.js'
import type { TransactionRead, TransactionSplitUpdate } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import { showRecord } from './record.js'
import { recordMenu } from './record.menu.js'

// v1 updateFireflyTransaction port: fetch fresh, re-send the FULL split
// (source/dest/category/currency/date filled from current) — never rely on the
// API merging absent fields.
export async function applyTransactionUpdate(
  ctx: Context,
  trId: string,
  changes: Partial<TransactionSplitUpdate>,
): Promise<TransactionRead> {
  const cur = (await ctx.firefly.getTransaction(trId)).attributes.transactions![0]!
  return ctx.firefly.updateTransaction(trId, {
    source_id: cur.source_id,
    destination_id: cur.destination_id,
    category_id: cur.category_id ?? '',
    currency_id: cur.currency_id,
    date: cur.date,
    ...changes,
  })
}

/** v1 closeEditTransactionMenu: fetch by id and edit the message back into the record. */
export async function showRecordFromId(ctx: Context, trId: string) {
  const tr = await ctx.firefly.getTransaction(trId)
  return showRecord(ctx, tr, true)
}

/** Stale keyboard after the flow ended — explicit empty keyboard: a markup-less edit would re-inject this menu. */
export function staleExit(ctx: Context) {
  return ctx.editMessageText(ctx.i18n.t('common.errorOccurred'), { reply_markup: { inline_keyboard: [] } })
}

/** Cancel a picker/prompt and return to the record (v1 🔙 on every edit submenu). */
export async function cancelTextPrompt(ctx: Context) {
  const trId = ctx.session.editFlow?.transactionId
  ctx.session.editFlow = undefined
  if (!trId)
    return ctx.deleteMessage()
  return showRecordFromId(ctx, trId)
}

/** Submenu-attach middleware: point editFlow at the payload's transaction. */
export async function enterEditFlow(ctx: Context) {
  const trId = typeof ctx.match === 'string' && ctx.match ? ctx.match : ''
  if (trId)
    ctx.session.editFlow = { transactionId: trId, categoryPage: 1 }
}

export const editTransactionMenu = new Menu<Context>('edit-transaction')
  .dynamic((ctx) => {
    // ctx.match is the payload of the button that opened/re-rendered this menu
    // (always the trId here) — payload is the source of truth, no session copy.
    const trId = typeof ctx.match === 'string' && ctx.match ? ctx.match : undefined
    const range = new MenuRange<Context>()
    if (!trId)
      return range // rendered outside an edit click (stale keyboard): empty
    range
      .url(ctx.i18n.t('labels.OPEN_IN_BROWSER'), `${ctx.settings!.fireflyUrl}/transactions/show/${trId}`)
      .row()
      .text({ text: () => ctx.i18n.t('labels.CLOSE'), payload: trId }, async c => showRecordFromId(c, trId))
    return range
  })

recordMenu.register([editTransactionMenu])
```

- [ ] **Step 6: Attach in showRecord + use the menu**

In `src/bot/features/transactions/record.ts`, replace `showRecord` (lines 39–44) and its doc comment with:

```ts
/**
 * Show a created/updated transaction with the record menu (Phase 4: ✏️ Edit).
 * `edit` swaps the flow's menu message into the record. recordTrId feeds the
 * Edit button's payload (v1 currentTransaction parity — skipped when absent).
 */
export async function showRecord(ctx: Context, tr: TransactionRead, edit: boolean) {
  ctx.session.recordTrId = tr.id
  const text = formatTransaction(tr, (key, params) => ctx.i18n.t(key, params as never))
  return edit
    ? ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: recordMenu })
    : ctx.reply(text, { parse_mode: 'Markdown', reply_markup: recordMenu })
}
```

Add the import `import { recordMenu } from './record.menu.js'` to `record.ts`.
In `src/bot/features/transactions/index.ts`, add `import { recordMenu } from './record.menu.js'` and `transactionsFeature.use(recordMenu)` **above** `transactionsFeature.use(addTransactionMenu)`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts && bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all PASS/clean (existing tests that assert the record's *empty* keyboard — if any quick-add/deposit-transfer test asserted `inline_keyboard: []` on the record — must be updated to expect the Edit button instead; that is the intended Phase 4 change, fix the assertion, don't special-case the code).

- [ ] **Step 8: Commit**

```bash
git add src/bot/context.ts src/bot/features/transactions/ __tests__/features/transactions/edit.test.ts
git commit -m "feat(v2): record menu + transaction edit shell (open-in-browser, back)"
```

---

### Task 3: Edit category picker

**Files:**
- Modify: `src/bot/features/transactions/add.menu.ts` (export `CATEGORIES_PER_PAGE`)
- Modify: `src/bot/features/transactions/edit.menu.ts`
- Test: `__tests__/features/transactions/edit.test.ts` (append)

**Interfaces:**
- Consumes: `enterEditFlow`, `applyTransactionUpdate`, `cancelTextPrompt`, `staleExit` (Task 2); `twoColumnRange` (`bot/helpers/menu.ts`); `CategoryRead` from the service.
- Produces: `editCategoryMenu: Menu<Context>` (id `'edit-category'`), registered under `editTransactionMenu`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/features/transactions/edit.test.ts`:

```ts
describe('edit category', () => {
  it('picker lists categories; picking one updates and re-renders the record', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔖 Category')
    await click('Food')
    const updated = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!
    expect(updated.attributes.transactions![0]!.category_id).toBe('1')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Food')
  })

  it('🔙 from the picker returns to the record without updating', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔖 Category')
    await click('🔙')
    const updated = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!
    expect(updated.attributes.transactions![0]!.category_id).toBeUndefined()
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts`
Expected: FAIL — `button not found: 🔖 Category` (button not in the shell yet).

- [ ] **Step 3: Implement**

In `add.menu.ts` change `const CATEGORIES_PER_PAGE = 20` to `export const CATEGORIES_PER_PAGE = 20` (single source; the comment above it stays).

In `edit.menu.ts` add imports:

```ts
import type { CategoryRead } from '#root/lib/firefly/service.js'
import { twoColumnRange } from '#root/bot/helpers/menu.js'
import { CATEGORIES_PER_PAGE } from './add.menu.js'
```

Add the menu + handler (session-driven pagination — the `add.menu.ts` pattern, no `onMenuOutdated` needed):

```ts
// Edit category picker: same shape as the add-flow picker, but the page
// counter and trId live in editFlow (render reads session, handlers mutate).
export const editCategoryMenu = new Menu<Context>('edit-category')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.editFlow
    if (!flow)
      return range // rendered outside a live flow (stale attach): empty grid
    let categories: CategoryRead[] = []
    try {
      categories = await ctx.firefly.listCategories()
    }
    catch (err) {
      ctx.logger.warn({ err }, 'edit category picker render failed') // dead range, live nav row
    }
    const page = flow.categoryPage ?? 1
    const totalPages = Math.max(1, Math.ceil(categories.length / CATEGORIES_PER_PAGE))
    const slice = categories.slice((page - 1) * CATEGORIES_PER_PAGE, page * CATEGORIES_PER_PAGE)
    twoColumnRange(range, slice, (r, cat) => {
      r.text({ text: () => cat.attributes.name, payload: cat.id }, onEditCategorySelected)
    })
    if (page > 1) {
      range.text('<<', async (c) => {
        c.session.editFlow!.categoryPage = page - 1
        c.menu.update() // menu@1.5: lazy void — no await needed
      })
    }
    if (page < totalPages) {
      range.text('>>', async (c) => {
        c.session.editFlow!.categoryPage = page + 1
        c.menu.update()
      })
    }
    return range.row()
  })
  .text('🔙', cancelTextPrompt) // v1: every edit submenu's 🔙 = back to record

async function onEditCategorySelected(ctx: Context) {
  const flow = ctx.session.editFlow
  const categoryId = String(ctx.match ?? '')
  if (!flow || !categoryId)
    return staleExit(ctx)
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, { category_id: categoryId })
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, true)
}
```

In `editTransactionMenu`'s dynamic, insert as the FIRST row (v1 layout order — category+date row, source+dest row, description+amount row, url, delete, back):

```ts
    range
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_CATEGORY'), payload: trId }, 'edit-category', enterEditFlow)
      .row()
      .url(ctx.i18n.t('labels.OPEN_IN_BROWSER'), `${ctx.settings!.fireflyUrl}/transactions/show/${trId}`)
      ...
```

Update the registration line: `recordMenu.register([editTransactionMenu])` stays; add after the menu definitions:

```ts
editTransactionMenu.register([editCategoryMenu])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts && bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/features/transactions/add.menu.ts src/bot/features/transactions/edit.menu.ts __tests__/features/transactions/edit.test.ts
git commit -m "feat(v2): edit category picker"
```

---

### Task 4: Edit source/destination account pickers

**Files:**
- Modify: `src/bot/features/transactions/transfer.menu.ts` (export `pickAccounts`)
- Modify: `src/bot/features/transactions/edit.menu.ts`
- Test: `__tests__/features/transactions/edit.test.ts` (append)

**Interfaces:**
- Consumes: `pickAccounts(ctx, types: AccountTypeFilter[], skipId?: string): Promise<AccountRead[]>` (now exported from `transfer.menu.ts`), `AccountTypeFilter` from the service, Task 2 helpers.
- Produces: `editSourceMenu` (id `'edit-source'`), `editDestMenu` (id `'edit-dest'`), registered under `editTransactionMenu`.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('edit accounts', () => {
  it('source picker skips the current destination; picking EUR wallet also syncs currency', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25') // withdrawal: source=1 Checking, dest inferred (Cash wallet)
    await click('✏️ Edit')
    await click('📤 Source account')
    // the prompt text swaps in (v1 chooseNewSourceAccount)
    const prompt = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((prompt.payload as any).text).toContain('source account')
    await click('EUR wallet')
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    expect(split.source_id).toBe('3')
    expect(split.currency_id).toBe('2') // v1: transaction follows the new source's currency
  })

  it('destination picker lists cash accounts; picking one updates destination', async () => {
    const { click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('📥 Destination account')
    await click('Cash wallet')
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    expect(split.destination_id).toBe('2')
  })
})
```

Note on fixtures: the fake's `listAccounts` filters `String(a.attributes.type) === String(type)` — for the destination picker's `CashAccount`/`Liabilities`/`Expense` filters, add fixture accounts with `type: 'Cash account'` (already there: `testAccount('2', 'Cash wallet', { type: 'Cash account' })`) and if a test needs liability/expense entries, declare them with `type: 'liabilities'` / `type: 'expense'` verbatim (the list *filter* value, not the attribute value the real API returns — the fake compares filter-to-attribute, so fixtures must match the filter string).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts`
Expected: FAIL — `button not found: 📤 Source account`.

- [ ] **Step 3: Implement**

In `transfer.menu.ts` change `async function pickAccounts(` to `export async function pickAccounts(`.

In `edit.menu.ts` add imports:

```ts
import type { AccountRead } from '#root/lib/firefly/service.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'
import { pickAccounts } from './transfer.menu.js'
```

Add the menus + handlers:

```ts
// v1: skip the transaction's current destination — a transfer must not be
// re-pointed onto itself (fetched fresh here; no session copy).
export const editSourceMenu = new Menu<Context>('edit-source')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.editFlow
    if (!flow)
      return range
    const cur = (await ctx.firefly.getTransaction(flow.transactionId)).attributes.transactions![0]!
    const accounts = await pickAccounts(ctx, [AccountTypeFilter.Asset, AccountTypeFilter.Liabilities], cur.destination_id ?? undefined)
    twoColumnRange(range, accounts, (r, acc) => {
      r.text({ text: () => acc.attributes.name, payload: acc.id }, onEditSourceSelected)
    })
    return range
  })
  .text('🔙', cancelTextPrompt)

async function onEditSourceSelected(ctx: Context) {
  const flow = ctx.session.editFlow
  const accId = String(ctx.match ?? '')
  if (!flow || !accId)
    return staleExit(ctx)
  // v1: the transaction follows the new source account's currency
  const account = await ctx.firefly.getAccount(accId)
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, {
    source_id: accId,
    currency_id: account.attributes.currency_id,
  })
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, true)
}

// v1 destination trio verbatim: cash + liabilities + expense; no skip.
export const editDestMenu = new Menu<Context>('edit-dest')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    const flow = ctx.session.editFlow
    if (!flow)
      return range
    const accounts: AccountRead[] = await pickAccounts(ctx, [AccountTypeFilter.CashAccount, AccountTypeFilter.Liabilities, AccountTypeFilter.Expense])
    twoColumnRange(range, accounts, (r, acc) => {
      r.text({ text: () => acc.attributes.name, payload: acc.id }, onEditDestSelected)
    })
    return range
  })
  .text('🔙', cancelTextPrompt)

async function onEditDestSelected(ctx: Context) {
  const flow = ctx.session.editFlow
  const accId = String(ctx.match ?? '')
  if (!flow || !accId)
    return staleExit(ctx)
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, { destination_id: accId })
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, true)
}
```

In `editTransactionMenu`'s dynamic, add the source/dest row (after the category row, before `.url(...)` — the CHANGE_DATE submenu joins this position in Task 6):

```ts
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_SOURCE_ACCOUNT'), payload: trId }, 'edit-source', async (c) => {
        await enterEditFlow(c)
        // markup-less edit: navInstaller injects edit-source
        return c.editMessageText(c.i18n.t('transactions.edit.chooseNewSourceAccount'))
      })
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_DEST_ACCOUNT'), payload: trId }, 'edit-dest', async (c) => {
        await enterEditFlow(c)
        return c.editMessageText(c.i18n.t('transactions.edit.chooseNewDestinationAccount'))
      })
      .row()
```

Extend registration:

```ts
editTransactionMenu.register([editCategoryMenu, editSourceMenu, editDestMenu])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts && bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/features/transactions/transfer.menu.ts src/bot/features/transactions/edit.menu.ts __tests__/features/transactions/edit.test.ts
git commit -m "feat(v2): edit source/destination account pickers (currency sync, skip-dest)"
```

---

### Task 5: Edit amount/description text flows

**Files:**
- Modify: `src/bot/features/transactions/router.ts` (editRouter + routes)
- Modify: `src/bot/features/transactions/edit.menu.ts` (prompt menus + submenu rows)
- Modify: `src/bot/features/transactions/index.ts` (use editRouter)
- Modify: `src/bot/features/transactions/add.ts` (clear editFlow on new adds)
- Test: `__tests__/features/transactions/edit.test.ts` (append)

**Interfaces:**
- Consumes: `parseAmountInput(input: string, oldAmount?: string): number | null` (`bot/helpers/amount.ts` — leading-operator composition against `oldAmount`); Task 2 helpers.
- Produces: `editRouter: Router<Context>` keyed on `ctx.session.editFlow?.step`; `editAmountMenu` (id `'edit-amount'`), `editDescriptionMenu` (id `'edit-description'`) — prompt keyboards whose only button is 🔙.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('edit amount/description text flows', () => {
  it('amount: prompt → text → update, prompt deleted, fresh record', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    const prompt = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((prompt.payload as any).text).toContain('amount')
    await send('30')
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    expect(split.amount).toBe('30')
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
    const reply = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((reply.payload as any).text).toContain('30')
  })

  it('amount composes with current (v1): "+5" on 25 → 30', async () => {
    const { click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await send('+5')
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    expect(split.amount).toBe('30')
  })

  it('bad amount stays in the flow and retries', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await send('abc')
    const err = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((err.payload as any).text).toContain('amount')
    await send('40')
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    expect(split.amount).toBe('40')
  })

  it('description: prompt → text → update', async () => {
    const { click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('📝 Description')
    await send('Beer')
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    expect(split.description).toBe('Beer')
  })

  it('🔙 on the prompt cancels: editFlow cleared, record re-rendered, next text is a NEW add', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await click('🔙')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
    await send('Cinema 9')
    const all = await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31')
    expect(all).toHaveLength(2) // second text was parsed as a new quick add, not an edit
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts`
Expected: FAIL — `button not found: 💸 Amount`.

- [ ] **Step 3: Prompt keyboards + submenu rows in edit.menu.ts**

Add:

```ts
function promptOf(ctx: Context) {
  // the prompt IS the edited menu message (v1 deleteBotsMessage, as plain ids)
  return { chatId: ctx.chat!.id, messageId: ctx.msg!.message_id }
}

// Prompt keyboards while waiting for text (v1 stub menus: 🔙 only).
export const editAmountMenu = new Menu<Context>('edit-amount')
  .text('🔙', cancelTextPrompt)

export const editDescriptionMenu = new Menu<Context>('edit-description')
  .text('🔙', cancelTextPrompt)
```

In `editTransactionMenu`'s dynamic, add the description+amount row (after the source/dest row, before `.url(...)`):

```ts
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_DESCRIPTION'), payload: trId }, 'edit-description', async (c) => {
        c.session.editFlow = { transactionId: trId, step: 'description', promptMessage: promptOf(c) }
        // markup-less edit: navInstaller injects edit-description (the 🔙 prompt keyboard)
        return c.editMessageText(c.i18n.t('transactions.edit.typeNewDescription'))
      })
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_AMOUNT'), payload: trId }, 'edit-amount', async (c) => {
        c.session.editFlow = { transactionId: trId, step: 'amount', promptMessage: promptOf(c) }
        return c.editMessageText(c.i18n.t('transactions.edit.typeNewAmount'))
      })
      .row()
```

Extend registration:

```ts
editTransactionMenu.register([editCategoryMenu, editSourceMenu, editDestMenu, editAmountMenu, editDescriptionMenu])
```

- [ ] **Step 4: editRouter in router.ts**

Append to `src/bot/features/transactions/router.ts`:

```ts
import type { TransactionRead } from '#root/lib/firefly/service.js'
import { applyTransactionUpdate } from './edit.menu.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other.
export const editRouter = new Router<Context>(ctx => ctx.session.editFlow?.step)

async function finishTextEdit(ctx: Context, updated: TransactionRead) {
  const flow = ctx.session.editFlow!
  if (flow.promptMessage)
    await ctx.api.deleteMessage(flow.promptMessage.chatId, flow.promptMessage.messageId)
  ctx.session.editFlow = undefined
  return showRecord(ctx, updated, false) // fresh reply (foreign-amount precedent)
}

editRouter.route('amount', async (ctx) => {
  const flow = ctx.session.editFlow!
  const current = (await ctx.firefly.getTransaction(flow.transactionId)).attributes.transactions![0]!.amount
  // v1: '+50'/'-20' composes with the current amount; garbage → retry in-flow
  const amount = parseAmountInput(ctx.msg?.text ?? '', current)
  if (!amount)
    return ctx.reply(ctx.i18n.t('transactions.edit.badAmountTyped'))
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, { amount: String(amount) })
  return finishTextEdit(ctx, updated)
})

editRouter.route('description', async (ctx) => {
  const flow = ctx.session.editFlow!
  const description = (ctx.msg?.text ?? '').trim()
  if (!description)
    return ctx.reply(ctx.i18n.t('transactions.edit.badDescriptionTyped'))
  const updated = await applyTransactionUpdate(ctx, flow.transactionId, { description })
  return finishTextEdit(ctx, updated)
})

editRouter.otherwise((_ctx, next) => next())
```

In `src/bot/features/transactions/index.ts`: import `editRouter`, and add `transactionsFeature.use(editRouter)` directly **after** `transactionsFeature.use(transactionsRouter)` (both routers sit above the hears/handleAddText text handlers).

- [ ] **Step 5: a finished add clears a pending edit**

In `src/bot/features/transactions/add.ts` — after `ctx.session.txnFlow = undefined` in the quick-add path (line ~54), and inside the slow-path `ctx.session.txnFlow = { ... }` assignment block, add:

```ts
  ctx.session.editFlow = undefined // a new add wins over a half-finished edit prompt
```

(Quick path: add the line right after `ctx.session.txnFlow = undefined`. Slow path: add it right after the `ctx.session.txnFlow = {` object literal closes.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts && bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all PASS/clean.

- [ ] **Step 7: Commit**

```bash
git add src/bot/features/transactions/router.ts src/bot/features/transactions/edit.menu.ts src/bot/features/transactions/index.ts src/bot/features/transactions/add.ts __tests__/features/transactions/edit.test.ts
git commit -m "feat(v2): edit amount/description text flows (prompt delete, compose amounts)"
```

---

### Task 6: Stateless date picker + edit-date wiring

**Files:**
- Create: `src/lib/date-picker/index.ts`
- Modify: `src/bot/features/transactions/edit.menu.ts` (editDateMenu + CHANGE_DATE row)
- Test: `__tests__/lib/date-picker.test.ts` (new — pure math/codec)
- Test: `__tests__/features/transactions/edit.test.ts` (append — wiring)

**Interfaces:**
- Produces (in `src/lib/date-picker/index.ts`):
  - `type DatePickerView = { mode: 'month' | 'year', year: number, month: number }` (month 0–11)
  - `encodeViewPayload(trId: string, view: DatePickerView): string` → `'<trId>|m|<YYYY-MM>'` | `'<trId>|y|<YYYY>-<M>'`
  - `encodeDatePayload(trId: string, date: string): string` → `'<trId>|d|<YYYY-MM-DD>'`
  - `decodeViewPayload(raw: string): { trId: string, view: DatePickerView } | null`
  - `leadingBlanks(year: number, month: number): number` — Monday-based offset of day 1 (0=Mon … 6=Sun)
  - `appendDatePicker<C>(range: MenuRange<C>, trId: string, view: DatePickerView, handlers: DatePickerHandlers<C>): void` where `DatePickerHandlers<C> = { onNav: (ctx: C) => unknown, onDate: (ctx: C, date: string) => unknown, onBack: (ctx: C) => unknown, backLabel: string }`
- Consumes: dayjs global locale (already set per-update by `middlewares/locale.ts` — month/weekday names localize for free); Task 2 helpers.

- [ ] **Step 1: Write the failing unit tests (pure math + codec)**

```ts
// __tests__/lib/date-picker.test.ts
import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  decodeViewPayload,
  encodeDatePayload,
  encodeViewPayload,
  leadingBlanks,
} from '#root/lib/date-picker/index.js'

describe('date picker codec', () => {
  it('month payloads round-trip', () => {
    const raw = encodeViewPayload('19', { mode: 'month', year: 2026, month: 9 })
    expect(raw).toBe('19|m|2026-10')
    expect(decodeViewPayload(raw)).toEqual({ trId: '19', view: { mode: 'month', year: 2026, month: 9 } })
  })

  it('year payloads round-trip and keep the month', () => {
    const raw = encodeViewPayload('19', { mode: 'year', year: 2026, month: 9 })
    expect(raw).toBe('19|y|2026-9')
    expect(decodeViewPayload(raw)).toEqual({ trId: '19', view: { mode: 'year', year: 2026, month: 9 } })
  })

  it('date payload encodes', () => {
    expect(encodeDatePayload('19', '2026-10-22')).toBe('19|d|2026-10-22')
  })

  it('garbage and foreign payloads decode to null', () => {
    expect(decodeViewPayload('')).toBeNull()
    expect(decodeViewPayload('19|x|2026-10')).toBeNull()
    expect(decodeViewPayload('19|m|2026-13')).toBeNull() // month out of range
    expect(decodeViewPayload('19|m|nan-10')).toBeNull()
  })

  it('payloads stay under the 64-byte callback budget with a 20-char id', () => {
    const trId = '12345678901234567890'
    expect(encodeViewPayload(trId, { mode: 'month', year: 2026, month: 9 }).length).toBeLessThan(35)
    expect(encodeDatePayload(trId, '2026-10-22').length).toBeLessThan(35)
  })
})

describe('leadingBlanks (Monday-first, v1 startWeekDay=1)', () => {
  it('known months: Jan 2026 Thu→3, Jun 2026 Mon→0, Nov 2026 Sun→6, Dec 2026 Tue→1', () => {
    expect(leadingBlanks(2026, 0)).toBe(3)
    expect(leadingBlanks(2026, 5)).toBe(0)
    expect(leadingBlanks(2026, 10)).toBe(6)
    expect(leadingBlanks(2026, 11)).toBe(1)
  })

  it('agrees with dayjs across a full year', () => {
    for (let month = 0; month < 12; month++) {
      const day = dayjs().year(2027).month(month).date(1).day()
      expect(leadingBlanks(2027, month)).toBe((day + 6) % 7)
    }
  })
})
```

- [ ] **Step 2: Run unit tests to verify they fail**

Run: `bunx vitest run __tests__/lib/date-picker.test.ts`
Expected: FAIL — module `#root/lib/date-picker/index.js` not found.

- [ ] **Step 3: Implement the component**

```ts
// src/lib/date-picker/index.ts
// Stateless rebuild of v1's 447-line session-coupled MenuDatePicker: no
// datePickerState in session, no raw dp_ callback parsing — every button's
// payload carries the full view, so the host menu renders from ctx.match
// alone (the categories month-view pattern). Month/weekday names come from
// dayjs's global locale (set per-update by bot/middlewares/locale.ts).
import type { MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'

export type DatePickerView = { mode: 'month' | 'year', year: number, month: number } // month 0-11

/** '<trId>|m|<YYYY-MM>' month view · '<trId>|y|<YYYY>-<M>' year view */
export function encodeViewPayload(trId: string, view: DatePickerView): string {
  return view.mode === 'month'
    ? `${trId}|m|${view.year}-${String(view.month + 1).padStart(2, '0')}`
    : `${trId}|y|${view.year}-${view.month}`
}

/** '<trId>|d|<YYYY-MM-DD>' date selection */
export function encodeDatePayload(trId: string, date: string): string {
  return `${trId}|d|${date}`
}

export function decodeViewPayload(raw: string): { trId: string, view: DatePickerView } | null {
  const [trId, kind, data] = raw.split('|')
  if (!trId || !data)
    return null
  const [y, m] = data.split('-').map(Number)
  const view = kind === 'm'
    ? { mode: 'month' as const, year: y, month: m - 1 }
    : kind === 'y'
      ? { mode: 'year' as const, year: y, month: m }
      : null
  if (!view)
    return null
  const ok = Number.isInteger(view.year) && view.year > 0
    && Number.isInteger(view.month) && view.month >= 0 && view.month <= 11
  return ok ? { trId, view } : null
}

/** Monday-based offset of day 1 (0=Mon … 6=Sun) — v1 forced Monday start. */
export function leadingBlanks(year: number, month: number): number {
  return (dayjs().year(year).month(month).date(1).day() + 6) % 7
}

export interface DatePickerHandlers<C> {
  /** month ‹/›, month-label→year, year ‹‹/››/pick — host re-renders its own menu */
  onNav: (ctx: C) => unknown
  /** a day button — receives the picked YYYY-MM-DD */
  onDate: (ctx: C, date: string) => unknown
  onBack: (ctx: C) => unknown
  backLabel: string
}

export function appendDatePicker<C>(
  range: MenuRange<C>,
  trId: string,
  view: DatePickerView,
  handlers: DatePickerHandlers<C>,
): void {
  if (view.mode === 'year')
    appendYearView(range, trId, view, handlers)
  else
    appendMonthView(range, trId, view, handlers)
}

function appendMonthView<C>(range: MenuRange<C>, trId: string, view: DatePickerView, h: DatePickerHandlers<C>): void {
  const current = dayjs().year(view.year).month(view.month)
  const prev = current.subtract(1, 'month')
  const next = current.add(1, 'month')
  range.row()
    .text({ text: '‹', payload: encodeViewPayload(trId, { mode: 'month', year: prev.year(), month: prev.month() }) }, ctx => h.onNav(ctx))
    .text({ text: current.format('MMMM YYYY'), payload: encodeViewPayload(trId, { mode: 'year', year: view.year, month: view.month }) }, ctx => h.onNav(ctx))
    .text({ text: '›', payload: encodeViewPayload(trId, { mode: 'month', year: next.year(), month: next.month() }) }, ctx => h.onNav(ctx))
  // weekday header (Monday-first; v1 rendered these as noop buttons)
  range.row()
  for (let i = 0; i < 7; i++)
    range.text(dayjs().day((i + 1) % 7).format('dd'), () => {})
  // day grid; today renders as 'N*' (v1)
  const blanks = leadingBlanks(view.year, view.month)
  const days = current.daysInMonth()
  const today = dayjs().format('YYYY-MM-DD')
  for (let weekStart = 1 - blanks; weekStart <= days; weekStart += 7) {
    range.row()
    for (let d = weekStart; d < weekStart + 7; d++) {
      if (d < 1 || d > days) {
        range.text(' ', () => {}) // blank cell (v1)
      }
      else {
        const date = current.date(d).format('YYYY-MM-DD')
        const label = date === today ? `${d}*` : String(d)
        range.text({ text: label, payload: encodeDatePayload(trId, date) }, ctx => h.onDate(ctx, date))
      }
    }
  }
  range.row().text(h.backLabel, ctx => h.onBack(ctx))
}

function appendYearView<C>(range: MenuRange<C>, trId: string, view: DatePickerView, h: DatePickerHandlers<C>): void {
  const start = Math.floor(view.year / 10) * 10
  range.row()
    .text({ text: '‹‹', payload: encodeViewPayload(trId, { mode: 'year', year: start - 10, month: view.month }) }, ctx => h.onNav(ctx))
    .text(`${start}-${start + 9}`, () => {}) // decade label (v1 noop)
    .text({ text: '››', payload: encodeViewPayload(trId, { mode: 'year', year: start + 10, month: view.month }) }, ctx => h.onNav(ctx))
  // 2 rows of 5 years; current year bracketed (v1)
  for (let row = 0; row < 2; row++) {
    range.row()
    for (let col = 0; col < 5; col++) {
      const year = start + row * 5 + col
      const label = year === view.year ? `[${year}]` : String(year)
      // picking a year returns to the month view with that year (v1)
      range.text({ text: label, payload: encodeViewPayload(trId, { mode: 'month', year, month: view.month }) }, ctx => h.onNav(ctx))
    }
  }
  range.row().text({ text: h.backLabel, payload: encodeViewPayload(trId, { mode: 'month', year: view.year, month: view.month }) }, ctx => h.onBack(ctx))
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `bunx vitest run __tests__/lib/date-picker.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing wiring tests**

Append to `__tests__/features/transactions/edit.test.ts` (uses the `bot` from setup):

```ts
describe('edit date (stateless calendar)', () => {
  async function openCalendar(click: (l: string) => Promise<void>, send: (t: string) => Promise<unknown>) {
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('📆 Date')
  }

  it('renders the current month with a day button per date', async () => {
    const { api, click, send } = await setupEdit()
    await openCalendar(click, send)
    const day10 = findButton(api.getOutgoingRequests(), '10') ?? findButton(api.getOutgoingRequests(), '10*') // today renders '10*'
    expect(day10).toBeDefined()
    expect(findButton(api.getOutgoingRequests(), '‹')).toBeDefined()
  })

  it('‹ navigates to the previous month (payload-driven, no session)', async () => {
    const { api, bot, click, send } = await setupEdit()
    await openCalendar(click, send)
    const btn = findButton(api.getOutgoingRequests(), '‹')!
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
    // the re-rendered keyboard shows the previous month's label
    const dayjs = (await import('dayjs')).default
    const prevLabel = dayjs().subtract(1, 'month').format('MMMM YYYY')
    const kb = (api.getOutgoingRequests().at(-1)!.payload as any).reply_markup.inline_keyboard as { text: string }[][]
    expect(kb.flat().some(b => b.text === prevLabel)).toBe(true)
  })

  it('picking a day updates the transaction date', async () => {
    const { api, bot, click, send, firefly } = await setupEdit()
    await openCalendar(click, send)
    const day15 = findButton(api.getOutgoingRequests(), '15') ?? findButton(api.getOutgoingRequests(), '15*')
    await bot.handleUpdate(generateCallbackQueryUpdate(day15!.data, { messageId: day15!.messageId }))
    const split = (await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))[0]!.attributes.transactions![0]!
    const dayjs = (await import('dayjs')).default
    expect(dayjs(split.date).format('D')).toBe('15')
    expect(dayjs(split.date).format('YYYY-MM')).toBe(dayjs().format('YYYY-MM'))
  })

  it('month label opens the year view; picking a year returns to months', async () => {
    const { api, bot, click, send } = await setupEdit()
    await openCalendar(click, send)
    const dayjs = (await import('dayjs')).default
    const label = findButton(api.getOutgoingRequests(), dayjs().format('MMMM YYYY'))!
    await bot.handleUpdate(generateCallbackQueryUpdate(label.data, { messageId: label.messageId }))
    const yearBtn = findButton(api.getOutgoingRequests(), String(dayjs().year()))
    expect(yearBtn).toBeDefined() // current year button (bracketed only for the ACTIVE year — it is)
    await bot.handleUpdate(generateCallbackQueryUpdate(yearBtn!.data, { messageId: yearBtn!.messageId }))
    expect(findButton(api.getOutgoingRequests(), '‹')).toBeDefined() // back in month view
  })
})
```

Note: `dayjs()`-dependent assertions use the current date so they never go stale; `'15*'` fallbacks cover "today is the 15th".

- [ ] **Step 6: Run wiring tests to verify they fail**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts`
Expected: FAIL — `button not found: 📆 Date`.

- [ ] **Step 7: Wire the edit-date menu**

In `edit.menu.ts` add imports:

```ts
import { appendDatePicker, decodeViewPayload, type DatePickerView } from '#root/lib/date-picker/index.js'
import dayjs from 'dayjs'
```

Add the host menu (labels derive from `ctx.match` → `onMenuOutdated: false` is REQUIRED; fixed layout; every button handler-backed — blank/header cells are noop buttons):

```ts
function currentView(): DatePickerView {
  return { mode: 'month', year: dayjs().year(), month: dayjs().month() }
}

export const editDateMenu = new Menu<Context>('edit-date', { onMenuOutdated: false })
  .dynamic((ctx) => {
    const raw = typeof ctx.match === 'string' && ctx.match ? ctx.match : ''
    // attach payload is the bare trId (CHANGE_DATE button) → current month;
    // after that every button carries the full '<trId>|m|…' / '<trId>|y|…' view
    const decoded = decodeViewPayload(raw)
      ?? (raw && !raw.includes('|') ? { trId: raw, view: currentView() } : null)
    const range = new MenuRange<Context>()
    if (!decoded)
      return range
    const { trId, view } = decoded
    appendDatePicker(range, trId, view, {
      onNav: async c => c.editMessageText(c.i18n.t('transactions.edit.typeNewDate'), { reply_markup: editDateMenu }),
      onDate: async (c, date) => {
        const updated = await applyTransactionUpdate(c, trId, { date })
        c.session.editFlow = undefined
        return showRecord(c, updated, true)
      },
      onBack: c => cancelTextPrompt(c),
      backLabel: ctx.i18n.t('labels.CLOSE'),
    })
    return range
  })
```

In `editTransactionMenu`'s dynamic, add CHANGE_DATE to the first row (next to CHANGE_CATEGORY — v1 layout) with the prompt-text middleware:

```ts
      .submenu({ text: () => ctx.i18n.t('labels.CHANGE_DATE'), payload: trId }, 'edit-date', async (c) => {
        await enterEditFlow(c)
        // markup-less edit: navInstaller injects the calendar keyboard
        return c.editMessageText(c.i18n.t('transactions.edit.typeNewDate'))
      })
```

Extend registration:

```ts
editTransactionMenu.register([editCategoryMenu, editDateMenu, editSourceMenu, editDestMenu, editAmountMenu, editDescriptionMenu])
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `bunx vitest run __tests__/lib/date-picker.test.ts __tests__/features/transactions/edit.test.ts && bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all PASS/clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/date-picker/index.ts src/bot/features/transactions/edit.menu.ts __tests__/lib/date-picker.test.ts __tests__/features/transactions/edit.test.ts
git commit -m "feat(v2): stateless payload-encoded date picker + edit-date wiring"
```

---

### Task 7: Transaction delete confirmation

**Files:**
- Modify: `src/bot/features/transactions/edit.menu.ts` (DELETE row + confirm menu)
- Test: `__tests__/features/transactions/edit.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 helpers (`showRecordFromId`); locale keys `labels.YES` / `labels.CANCEL` / `labels.DELETE` (exist); new key `transactions.edit.confirmDeletion` (Task 8 adds translations; **add the en key in this task** so the test renders).
- Produces: `txnDeleteConfirmMenu: Menu<Context>` (id `'txn-delete-confirm'`), registered under `recordMenu`.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('delete confirmation', () => {
  it('DELETE asks for confirmation; CANCEL returns to the record', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('❌ Delete')
    const confirm = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((confirm.payload as any).text).toContain('Are you sure')
    await click('✖ Cancel')
    expect((await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))).toHaveLength(1)
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Groceries')
  })

  it('YES deletes the transaction and removes the message', async () => {
    const { api, click, send, firefly } = await setupEdit()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('❌ Delete')
    await click('✅ Yes')
    expect((await firefly.listTransactions('withdrawal' as never, '2000-01-01', '2999-12-31'))).toHaveLength(0)
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts`
Expected: FAIL — `button not found: ❌ Delete`.

- [ ] **Step 3: Implement**

In `locales/en.yaml`, inside `transactions:` → `edit:` (next to `badAmountTyped`):

```yaml
    confirmDeletion: >
      Are you sure that you want to delete this transaction?
```

In `edit.menu.ts` add (mirrors `categories.menu.ts` Phase 2 pattern):

```ts
// ---- delete confirm (owner-approved deviation: v1 deleted instantly) ----

async function askDeleteConfirm(ctx: Context) {
  await ctx.editMessageText(ctx.i18n.t('transactions.edit.confirmDeletion'), { parse_mode: 'Markdown', reply_markup: txnDeleteConfirmMenu })
}

export const txnDeleteConfirmMenu = new Menu<Context>('txn-delete-confirm')
  .dynamic((ctx) => {
    // ctx.match here is the DELETE button's payload (the trId) — it is what
    // bakes YES/CANCEL correctly at the confirm-menu attach render
    const trId = typeof ctx.match === 'string' && ctx.match ? ctx.match : undefined
    const range = new MenuRange<Context>()
    if (!trId)
      return range
    range
      .text({ text: c => c.i18n.t('labels.YES'), payload: trId }, async (c) => {
        await c.firefly.deleteTransaction(trId)
        await c.deleteMessage() // v1: the message just vanishes
      })
      .danger() // menu@1.5 destructive styling
    range.text({ text: c => c.i18n.t('labels.CANCEL'), payload: trId }, async c => showRecordFromId(c, trId))
    return range
  })
```

In `editTransactionMenu`'s dynamic, add the DELETE row between `.url(...)` and the CLOSE row:

```ts
      .text({ text: () => ctx.i18n.t('labels.DELETE'), payload: trId }, askDeleteConfirm)
      .row()
```

Extend registration (confirm menu reachable from the record message's tree):

```ts
recordMenu.register([editTransactionMenu, txnDeleteConfirmMenu])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run __tests__/features/transactions/edit.test.ts && bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/features/transactions/edit.menu.ts locales/en.yaml __tests__/features/transactions/edit.test.ts
git commit -m "feat(v2): transaction delete confirmation (danger YES, v1 instant-delete deviates by owner approval)"
```

---

### Task 8: e2e (real Redis) + full locale coverage + cookbook

**Files:**
- Modify: `__tests__/e2e/transactions.test.ts` (append edit/delete journeys)
- Modify: `locales/es.yaml`, `locales/it.yaml`, `locales/ru.yaml` (translations)
- Modify: `docs/GRAMMY_MENUS.md` (stateless-calendar pattern note)

**Interfaces:**
- Consumes: everything from Tasks 1–7; the e2e `makeBot()` harness already in `__tests__/e2e/transactions.test.ts` (real Redis session storage, `click`/`send` helpers).

- [ ] **Step 1: Write the failing e2e tests**

Start Redis: `docker compose -f docker-compose.tests.yaml up -d`. Append inside the existing `describe.skipIf(!available)` block in `__tests__/e2e/transactions.test.ts`:

```ts
  it('edit round-trip through redis: category change re-renders the record', async () => {
    const { api, click, send } = await makeBot()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('🔖 Category')
    await click('Food')
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).text).toContain('Food')
  })

  it('edit amount through redis: typed text updates, prompt deleted, session clean', async () => {
    const { api, bot, click, send } = await makeBot()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('💸 Amount')
    await bot.handleUpdate(generateMessageUpdate('30'))
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
    // next text is a NEW add — editFlow did not leak across the redis session
    await send('Cinema 9')
    const replies = api.getOutgoingRequests().filter(r => r.method === 'sendMessage')
    expect(replies.length).toBeGreaterThanOrEqual(3) // record + fresh record + new record
  })

  it('delete through redis: confirm → YES removes the message and transaction', async () => {
    const { api, click, send } = await makeBot()
    await send('Groceries 25')
    await click('✏️ Edit')
    await click('❌ Delete')
    await click('✅ Yes')
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
  })
```

- [ ] **Step 2: Run e2e to verify they fail**

Run: `docker compose -f docker-compose.tests.yaml up -d && bun run test:e2e`
Expected: FAIL at the first new test (`button not found: ✏️ Edit`) if anything from Tasks 1–7 regressed in real-Redis mode; otherwise PASS — then the run exists to guard regressions, which is the deliverable.

- [ ] **Step 3: Locale coverage**

`locales/it.yaml` and `locales/ru.yaml` already have `typeNewDate`; add `confirmDeletion` inside `transactions:` → `edit:` of each, matching the en wording added in Task 7.

`it.yaml`:

```yaml
    confirmDeletion: >
      Sei sicuro di voler eliminare questa transazione?
```

`ru.yaml`:

```yaml
    confirmDeletion: >
      Вы уверены, что хотите удалить эту транзакцию?
```

`es.yaml` — **pre-existing gap**: `transactions.edit.typeNewDate` is missing (present in en/it/ru). Add BOTH keys inside `transactions:` → `edit:`:

```yaml
    typeNewDate: 'Selecciona una nueva fecha para la transacción:'
    confirmDeletion: >
      ¿Seguro que quieres eliminar esta transacción?
```

Placement note: keep YAML key order aligned with `en.yaml` (next to the other `edit.*` keys). Verify with `bunx vitest run __tests__/bot/i18n.test.ts` — if that suite asserts key parity across locales, the new keys must land in the same commit.

- [ ] **Step 4: Cookbook note**

Append to `docs/GRAMMY_MENUS.md` (after the stateless-nav section, if one exists; else under payload patterns):

```markdown
## Stateless calendar (payload-encoded view state)

When a menu's entire view can be encoded in ≤64 bytes, put the view in the
payloads instead of the session: every navigation button carries the state it
navigates TO (`<trId>|m|<YYYY-MM>`), the dynamic render decodes `ctx.match`,
and handlers re-render via `editMessageText(text, { reply_markup: sameMenu })`.
The menu needs `onMenuOutdated: false` (labels derive from `ctx.match`, so a
payload click always self-invalidates the staleness hash). Session bugs of the
v1 `datePickerState` class (stale pin, TTL loss, cross-flow re-pointing) are
unreachable by construction. See `src/lib/date-picker/` +
`features/transactions/edit.menu.ts` (`edit-date`).
```

- [ ] **Step 5: Full verification**

Run: `bunx vitest run && bun run test:e2e && bunx tsc --noEmit && bun run lint`
Expected: everything green/clean.

- [ ] **Step 6: Commit**

```bash
git add __tests__/e2e/transactions.test.ts locales/es.yaml locales/it.yaml locales/ru.yaml docs/GRAMMY_MENUS.md
git commit -m "test(v2): transactions edit/delete e2e; close es locale gap; cookbook stateless-calendar pattern"
```

---

## Phase 4 acceptance (mirrors the spec's phase table)

- Record message carries ✏️ Edit → full v1 edit surface works: category (paginated picker), date (stateless calendar incl. year view), source (skips current destination, syncs currency), destination (cash/liabilities/expense), amount & description (text flows with prompt cleanup, v1 `+N` composition), open-in-browser, 🔙.
- Delete asks for confirmation (`.danger()` YES) and removes the message.
- No `datePickerState` in session, no `dp_` callback parsing anywhere in `src/` — the four v1 callback schemes are now fully collapsed to menu payloads.
- Integration + e2e (real Redis) green; lint tests green; all four locales carry the new keys.
