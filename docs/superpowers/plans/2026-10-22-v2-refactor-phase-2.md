# v2 Refactor — Phase 2 Implementation Plan (accounts + categories, rich lists)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the accounts and categories features from v1 onto the v2 architecture, establishing the list/menu standards (tab views, `lists` session shape, rich-message tables) that Phase 3+ reuses.

**Architecture:** Two feature slices under `src/bot/features/` built on the Phase 0–1 DI seam. List messages render as **native rich tables** (Bot API 10.1: `sendRichMessage` / `editMessageText` with `rich_message`, GFM markdown flavor) with `@grammyjs/menu` keyboards attached via `reply_markup`. One `requireSettings` middleware gates every Firefly-dependent feature. Category add/rename flows use a dedicated `categoryFlow` session field + router; the category-details month navigation is stateless (id + date travel in button payloads, re-read from `ctx.match` at render).

**Tech Stack:** Bun, TypeScript 5.9 (strict, ESM, `#root/*`), **grammy 1.46.0** (bumped from 1.39.3 in Task 1), **@grammyjs/menu 1.5.0**, @grammyjs/router 2.0.0, @grammyjs/runner 2.0.3, **@grammyjs/storage-redis 2.6.0**, @grammyjs/i18n 0.5.1 (YAML — never upgrade), dayjs 1.11.7, vitest 4.0.18.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-refactor-design.md` + the Phase 2 amendments appended by Task 1. Phases 3–5 get their own plans.

## Global Constraints

- All work in the worktree on branch `feat/major-refactoring` (`/home/alex/.herdr/worktrees/firefly-iii-telegram-bot/feat-major-refactoring`). `master` untouched. Every task ends with a commit; run `bunx vitest run` before each commit.
- `legacy/` is reference-only: never import, never edit.
- Dependency floor (amended for Phase 2): grammy 1.46.0, @grammyjs/menu 1.5.0, @grammyjs/storage-redis 2.6.0; @grammyjs/router 2.0.0 and @grammyjs/runner 2.0.3 are already latest; **@grammyjs/i18n stays 0.5.1** (1.x is Fluent-only). No other dependency changes — the full non-grammy dependency sweep happens at Phase 5 cutover. Never add `@grammyjs/conversations` (lint-tested).
- `src/lib/firefly/generated/` is codegen output — never hand-edit (except `model/currency-update.ts`).
- i18n: v1 locale keys are reused verbatim. **Value** changes are allowed exactly where rich tables replace `<pre>` blocks (`accounts.list.*`, `categories.transactionsList` — Task 6). New keys: `tables.*` (Task 6) and `categories.created` (Task 8). All four locales (en/es/it/ru) must stay key-complete.
- Rich messages use the GFM **markdown** flavor. Every user-controlled value interpolated into rich markdown goes through `escapeRichMarkdown()` (prose) or `markdownTable()` (cells escape internally) — the rich-flavored extension of the `legacy-markdown-escape-user-values` rule.
- grammy menu rules (all lint- or memory-enforced): payload buttons read state from `ctx.match`, never from stale closures or session where avoidable; `.dynamic()` render callbacks never write session and must survive a fetch error (empty range, not a crash); back/nav-button handlers do not pass `reply_markup` (the lib injects — see commit 59a40d2); explicit `reply_markup` is correct only in plain handlers that attach a menu to an edit.
- Logging: pino via `ctx.logger` only. Handlers return the reply promise.

## Rich-message API facts (verified against @grammyjs/types 5.0.0 / grammy 1.46.0)

These exact shapes are used throughout — do not improvise alternatives:

```ts
// send (positional; other carries reply_markup):
await ctx.replyWithRichMessage({ markdown }, { reply_markup: someMenu })
await ctx.api.sendRichMessage(chatId, { markdown }, { reply_markup: someMenu })

// edit — third arg accepts string OR InputRichMessage:
await ctx.editMessageText({ markdown }, { reply_markup: someMenu })
await ctx.api.editMessageText(chatId, messageId, { markdown }, { reply_markup: someMenu })

// InputRichMessage (markdown flavor): { markdown?: string, html?: string, blocks?: …, media?: …, is_rtl?: boolean, skip_entity_detection?: boolean }
```

`editMessageText` on a rich message keeps `reply_markup` (InlineKeyboardMarkup); callback queries fire normally on rich messages; `ctx.menu.update()` (→ `editMessageReplyMarkup`) is keyboard-only and safe on rich messages. A `Menu` instance is a valid `reply_markup` value.

## File Structure (final state after this plan)

```
src/bot/
├── context.ts                     # SessionData += categoryFlow, lists
├── index.ts                       # gate + accountsFeature + categoriesFeature inserted
├── features/
│   ├── accounts/
│   │   ├── index.ts               # hears labels.ACCOUNTS, mounts accountsMenu
│   │   └── accounts.menu.ts       # tab menu (.disabled active tab) + rich table render
│   └── categories/
│       ├── index.ts               # hears labels.CATEGORIES, mounts menus + router
│       ├── categories.menu.ts     # list, details (month nav), delete confirm, add/rename prompt menus
│       └── categories.router.ts   # add / rename text-input routes on categoryFlow.step
├── helpers/
│   ├── menu.ts                    # twoColumnRange (beads 1j0 keyboard half)
│   └── rich.ts                    # markdownTable + escapeRichMarkdown (beads 1j0 table half)
└── middlewares/
    └── require-settings.ts        # the one gate (spec bug #2 stays fixed)
src/lib/firefly/
├── client.ts                      # += Insight factory
└── service.ts                     # += 7 category/insight methods + type re-exports
locales/{en,es,it,ru}.yaml         # accounts.list.* values reshaped; tables.*; categories.created
__tests__/
├── bot/helpers/rich.test.ts
├── helpers/harness-rich.test.ts   # + harness: sendRichMessage recording
├── bot/middlewares/require-settings.test.ts
├── features/accounts/accounts.test.ts
├── features/categories/categories.test.ts
├── e2e/accounts-categories.test.ts
docs/GRAMMY_MENUS.md               # the list/menu standard cookbook
docs/superpowers/specs/2026-10-21-v2-refactor-design.md  # += Phase 2 amendments
```

---

### Task 1: Dependency bump (grammy 1.46.0 + menu 1.5.0 + storage-redis 2.6.0) + spec addendum

**Files:**
- Modify: `package.json` (three dependency versions)
- Modify: `docs/superpowers/specs/2026-10-21-v2-refactor-design.md` (append amendments)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: grammy 1.46.0 runtime (rich-message API available to Tasks 3+), `@grammyjs/menu` 1.5.0 builders (`.disabled()`, `.danger()`), spec amendments on record

- [ ] **Step 1: Bump the three dependency pins in `package.json`**

```diff
-    "@grammyjs/menu": "1.3.1",
+    "@grammyjs/menu": "1.5.0",
-    "@grammyjs/storage-redis": "2.5.1",
+    "@grammyjs/storage-redis": "2.6.0",
-    "grammy": "1.39.3",
+    "grammy": "1.46.0",
```

- [ ] **Step 2: Install and run the full verification suite**

```bash
bun install
bunx tsc --noEmit
bun run lint
bunx vitest run
docker compose -f docker-compose.tests.yaml up -d && bunx vitest run --config vitest.config.e2e.ts; docker compose -f docker-compose.tests.yaml down
```

Expected: all green. The known bump risk is type tightening from `@grammyjs/types` 3.23→5.0 (bundled with grammy) — any `tsc` error is fixed HERE, in this task, before anything new is built. If `@grammyjs/menu` 1.3.1 had been kept it would still satisfy the peer range, but 1.5.0 is bumped deliberately for `.disabled()`/`.danger()` (used in Tasks 6–7).

- [ ] **Step 3: Append the Phase 2 amendments to the spec**

Append to `docs/superpowers/specs/2026-10-21-v2-refactor-design.md`:

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock docs/superpowers/specs/2026-10-21-v2-refactor-design.md
git commit -m "chore(v2): bump grammy 1.46.0 + menu 1.5.0 + storage-redis 2.6.0; record Phase 2 spec amendments"
```

---

### Task 2: Rich helpers — `markdownTable` + `escapeRichMarkdown`

**Files:**
- Create: `src/bot/helpers/rich.ts`
- Test: `__tests__/bot/helpers/rich.test.ts`

**Interfaces:**
- Produces (used by Tasks 6–7 and every later list feature):
  - `markdownTable(header: readonly string[], rows: readonly (readonly string[])[], aligns?: readonly ('left' | 'right' | 'center')[]): string` — GFM pipe table; **escapes every cell internally** (`\`, `|`, newlines→space)
  - `escapeRichMarkdown(value: string): string` — escapes GFM inline metachars `` \ ` * _ [ ] ~ | `` for prose interpolation

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/bot/helpers/rich.test.ts
import { describe, expect, it } from 'vitest'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'

describe('markdownTable', () => {
  it('renders a GFM table with header, separator and alignment', () => {
    const table = markdownTable(
      ['Name', 'Balance', 'Currency'],
      [['Checking', '1234.50', 'USD'], ['Savings', '980.00', 'USD']],
      ['left', 'right', 'left'],
    )
    expect(table).toBe([
      '| Name | Balance | Currency |',
      '| --- | ---: | --- |',
      '| Checking | 1234.50 | USD |',
      '| Savings | 980.00 | USD |',
    ].join('\n'))
  })

  it('escapes pipes and collapses newlines inside cells', () => {
    const table = markdownTable(['A'], [['x | y'], ['line1\nline2']])
    expect(table).toContain('| x \\| y |')
    expect(table).toContain('line1 line2')
    expect(table).not.toContain('\nline2 |') // newline never breaks the row
  })

  it('defaults every column to left alignment', () => {
    expect(markdownTable(['A'], [['1']])).toContain('| --- |')
  })
})

describe('escapeRichMarkdown', () => {
  it('escapes GFM inline metachars', () => {
    expect(escapeRichMarkdown('a*b_c[d]~e`f|g\\h')).toBe('a\\*b\\_c\\[d\\]~e\\`f\\|g\\\\h')
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/bot/helpers/rich.test.ts`
Expected: FAIL (`Cannot find module '#root/bot/helpers/rich.js'`)

- [ ] **Step 3: Implement `src/bot/helpers/rich.ts`**

```ts
// Rich-message (GFM markdown flavor) formatting helpers. Every user-controlled
// value that lands in a rich message goes through one of these two functions —
// the rich-flavored extension of the escapeMarkdown discipline (commit a775b10).

/** Escape a value interpolated into rich-markdown PROSE (bold names, headings). */
export function escapeRichMarkdown(value: string): string {
  return value.replace(/([\\`*_\[\]~|])/g, '\\$1')
}

function escapeCell(cell: string): string {
  return String(cell).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * Build a GFM pipe table for a rich message ({ markdown } flavor).
 * Cells are escaped here — callers pass raw values.
 */
export function markdownTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  aligns: readonly ('left' | 'right' | 'center')[] = [],
): string {
  const row = (cells: readonly string[]) => `| ${cells.map(c => escapeCell(c)).join(' | ')} |`
  const separator = `| ${header.map((_, i) => {
    const a = aligns[i]
    return a === 'right' ? '---:' : a === 'center' ? ':---:' : '---'
  }).join(' | ')} |`
  return [row(header), separator, ...rows.map(row)].join('\n')
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `bunx vitest run __tests__/bot/helpers/rich.test.ts && bunx tsc --noEmit`
Expected: 4 passed; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/helpers/rich.ts __tests__/bot/helpers/rich.test.ts
git commit -m "feat(v2): GFM table + escaping helpers for rich messages"
```

---

### Task 3: Mock-harness support for rich messages

**Files:**
- Modify: `__tests__/helpers/bot.ts` (SEND method set, payload cast, result echo, `getLastRichMarkdown`)
- Test: `__tests__/helpers/harness-rich.test.ts`

**Interfaces:**
- Consumes: grammy 1.46.0 (Task 1)
- Produces (used by Tasks 6–9):
  - mock API records `sendRichMessage` like a text send: assigns `resultMessageId`, allows later `editMessageText` on that message
  - `getLastRichMarkdown(requests: OutgoingRequest[]): string | undefined` — markdown of the most recent rich send/edit

- [ ] **Step 1: Write the failing harness test**

```ts
// __tests__/helpers/harness-rich.test.ts
import { Bot } from 'grammy'
import { describe, expect, it } from 'vitest'
import { getLastRichMarkdown, generateMessageUpdate, initializeBot, setupMockApi } from './bot.js'

describe('mock API rich messages', () => {
  it('records sendRichMessage with a message id, and edits target it', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    const api = setupMockApi(bot)
    await initializeBot(bot)
    const sent = await bot.api.sendRichMessage(1111111, { markdown: '| a |\n| --- |\n| 1 |' })
    const last = api.getOutgoingRequests().at(-1)!
    expect(last.method).toBe('sendRichMessage')
    expect(last.resultMessageId).toBeGreaterThan(0)
    expect(sent.message_id).toBe(last.resultMessageId)
    expect(getLastRichMarkdown(api.getOutgoingRequests())).toContain('| a |')

    await bot.api.editMessageText(1111111, sent.message_id, { markdown: '| b |' })
    expect(getLastRichMarkdown(api.getOutgoingRequests())).toContain('| b |')
  })

  it('keeps findButton working on rich-message keyboards', async () => {
    const bot = new Bot<any>('123456:ABCdef')
    bot.on('message:text', async (ctx) => {
      await ctx.api.sendRichMessage(ctx.chat.id, { markdown: 'x' }, {
        reply_markup: { inline_keyboard: [[{ text: 'Tab', callback_data: 'tab:1' }]] },
      })
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('go'))
    const { findButton } = await import('./bot.js')
    expect(findButton(api.getOutgoingRequests(), 'Tab')?.data).toBe('tab:1')
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/helpers/harness-rich.test.ts`
Expected: FAIL — `sendRichMessage` falls through the mock and returns `{ result: true }` (no `message_id`), `getLastRichMarkdown` is not exported.

- [ ] **Step 3: Modify `__tests__/helpers/bot.ts`**

Three edits:

1. Treat rich sends as text sends (Bot API: `editMessageText` edits "text, rich and game messages" — same edit semantics):

```ts
// Send methods that create a message the real API would later allow editing.
// Reply-keyboard-only methods (sendChatAction etc.) are not messages.
const SEND_TEXT_METHODS = new Set(['sendMessage', 'sendRichMessage'])
```

2. Widen the payload cast and echo the rich payload into the mocked result message:

```ts
const p = payload as {
  chat_id?: number
  message_id?: number
  inline_message_id?: string
  text?: string
  rich_message?: { markdown?: string }
}
```

and in the `SEND_TEXT_METHODS` result object, next to `text: p.text`:

```ts
          ...(p.rich_message ? { rich_message: p.rich_message } : {}),
```

3. Append the query helper next to `getLastMessage`:

```ts
/** Markdown of the most recent rich send/edit, if any. */
export function getLastRichMarkdown(requests: OutgoingRequest[]): string | undefined {
  for (const request of [...requests].reverse()) {
    const markdown = (request.payload as { rich_message?: { markdown?: string } })?.rich_message?.markdown
    if (markdown !== undefined)
      return markdown
  }
  return undefined
}
```

`EDIT_METHODS` needs no change: `editMessageText` already requires kind `'text'`, which rich sends now are.

- [ ] **Step 4: Run — expect pass, plus no regressions**

Run: `bunx vitest run __tests__/helpers/ && bunx tsc --noEmit`
Expected: harness-rich (2 passed) + existing harness/settings/start tests all green.

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/bot.ts __tests__/helpers/harness-rich.test.ts
git commit -m "test(v2): mock Telegram harness records sendRichMessage"
```

---

### Task 4: `requireSettings` gate middleware

**Files:**
- Create: `src/bot/middlewares/require-settings.ts`
- Modify: `src/bot/index.ts` (one mount, after `settingsFeature`, before `unhandledFeature`)
- Modify: `__tests__/features/start/start.test.ts` (the unknown-text case is now gated for unconfigured users)
- Test: `__tests__/bot/middlewares/require-settings.test.ts`

**Interfaces:**
- Consumes: `ctx.settings` (DI middleware), `ctx.i18n`, `createMainKeyboard(ctx)` (`src/bot/helpers/keyboard.ts`)
- Produces: `requireSettings(): Middleware<Context>` — the single gate; Tasks 6–7's features mount after it and are thereby gated

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/bot/middlewares/require-settings.test.ts
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

function gateTexts(api: ReturnType<typeof setupMockApi>) {
  return api.getOutgoingRequests()
    .filter(r => r.method === 'sendMessage')
    .map(r => (r.payload as { text: string }).text)
}

describe('requireSettings gate', () => {
  it('blocks unconfigured users with the firefly-url prompt + main keyboard', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain('Firefly URL')
    expect((send.payload as any).reply_markup?.keyboard).toBeDefined()
  })

  it('asks for the access token when only the url is set', async () => {
    const { bot } = createTestBot({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api' }),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    expect(gateTexts(api).at(-1)).toContain('Access Token')
  })

  it('lets configured users through to the unhandled fallback', async () => {
    const { bot } = createTestBot({ settings: CONFIGURED })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('blah'))
    expect(gateTexts(api).at(-1)).toContain(i18n.t('en', 'help').slice(0, 10))
  })

  it('never gates /start, /settings, or callback queries', async () => {
    const { bot } = createTestBot()
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate('/start', { isCommand: true }))
    await bot.handleUpdate(generateMessageUpdate('/settings', { isCommand: true }))
    await bot.handleUpdate(generateCallbackQueryUpdate('settings:anything'))
    const texts = gateTexts(api)
    expect(texts[0]).toContain(i18n.t('en', 'welcome').slice(0, 10))
    expect(texts[1]).toContain(i18n.t('en', 'settings.notSpecified').slice(0, 8))
    expect(texts.some(t => t.includes('Firefly URL') && t !== texts[0])).toBe(false)
  })
})
```

(The first test asserts on the English copy's stable fragment rather than the full locale value so a copy edit cannot break the test; the i18n keys used are `mdlwr.noFireflyURLFound` / `mdlwr.noFireflyAccessTokenFound`, unchanged from v1.)

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/bot/middlewares/require-settings.test.ts`
Expected: FAIL (module missing; unconfigured text falls through to the unhandled help reply).

- [ ] **Step 3: Implement `src/bot/middlewares/require-settings.ts`**

```ts
import type { Middleware } from 'grammy'
import type { Context } from '#root/bot/context.js'
import { createMainKeyboard } from '#root/bot/helpers/keyboard.js'

// Gate for every Firefly-dependent feature. Mounted ONCE in createBot, after
// the start+settings features (which must stay reachable unconfigured) and
// before accounts/categories/unhandled — keeping this the only mount is what
// fixes v1's duplicate-requireSettings bug (spec "Bugs folded into the port" #2).
// Callback queries pass through (v1 semantics): menus only ever rendered for
// configured users, so a stale keyboard fails into the error boundary like v1.
export function requireSettings(): Middleware<Context> {
  return async (ctx, next) => {
    if (ctx.callbackQuery)
      return next()
    if (!ctx.settings?.fireflyUrl) {
      return ctx.reply(ctx.i18n.t('mdlwr.noFireflyURLFound'), {
        parse_mode: 'Markdown',
        reply_markup: createMainKeyboard(ctx),
      })
    }
    if (!ctx.settings?.fireflyAccessToken) {
      return ctx.reply(ctx.i18n.t('mdlwr.noFireflyAccessTokenFound'), {
        parse_mode: 'Markdown',
        reply_markup: createMainKeyboard(ctx),
      })
    }
    return next()
  }
}
```

- [ ] **Step 4: Mount it in `src/bot/index.ts`**

```ts
import { requireSettings } from '#root/bot/middlewares/require-settings.js'
// ...
  protectedBot.use(startFeature)
  protectedBot.use(settingsFeature)
  protectedBot.use(requireSettings()) // gates everything below (Phase 2+: accounts, categories, unhandled)
  protectedBot.use(unhandledFeature) // must stay last
```

- [ ] **Step 5: Update the now-obsolete start-feature test expectation**

In `__tests__/features/start/start.test.ts`, the "answers /help and unknown text" case sends `'blah'` from an unconfigured bot — the gate now intercepts it. Update that test to seed configured settings for the unknown-text assertion:

```ts
  it('answers /help, and unknown text falls to unhandled for configured users', async () => {
    const { bot } = createTestBot({
      settings: defaultSettings({ fireflyUrl: 'https://ff', fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'x'.repeat(500) }),
    })
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
```

(Add the `defaultSettings` import if the file lacks it. `/help` is unaffected by the gate — the start feature runs before it.)

- [ ] **Step 6: Run — expect pass**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green, including the updated start test.

- [ ] **Step 7: Commit**

```bash
git add src/bot/middlewares/require-settings.ts src/bot/index.ts __tests__/bot/middlewares/require-settings.test.ts __tests__/features/start/start.test.ts
git commit -m "feat(v2): requireSettings gate — one mount before all firefly-dependent features"
```

---

### Task 5: FireflyService category + insight methods, harness fakes

**Files:**
- Modify: `src/lib/firefly/client.ts` (add `Insight` factory)
- Modify: `src/lib/firefly/service.ts` (7 new methods + type re-exports)
- Modify: `__tests__/helpers/bot.ts` (`testCategory`, `testCategoryTransaction`, richer `testAccount`, extended fake)
- Test: `__tests__/lib/firefly-client.test.ts` (one addition)

**Interfaces:**
- Consumes: generated barrel (`listCategory`, `getCategory`, `storeCategory`, `updateCategory`, `deleteCategory`, `listTransactionByCategory(id, xTraceId?, limit?, page?, start?, end?)`, `insightExpenseCategory(start, end, xTraceId?, categories?: number[])`)
- Produces (consumed by Tasks 6–8 and their tests):
  - `FireflyService` grows: `listCategories(): Promise<CategoryRead[]>`, `getCategory(id: string): Promise<CategoryRead>`, `storeCategory(name: string): Promise<void>`, `updateCategory(id: string, name: string): Promise<void>`, `deleteCategory(id: string): Promise<void>`, `listTransactionsByCategory(id: string, start: string, end: string): Promise<TransactionRead[]>`, `insightExpenseCategory(start: string, end: string, categoryId: number): Promise<CategoryExpenseSummary[]>`
  - `interface CategoryExpenseSummary { currency: string, difference: number }`
  - service re-exports: `type { CategoryRead, TransactionRead }`
  - harness: `testCategory(id, name)`, `testCategoryTransaction(description, options?)`, `testAccount(id, name, options?)`, fake fixtures `{ accounts?, categories?, categoryTransactions?, categoryInsights? }` with a **mutable** category list (store/update/delete observable)

- [ ] **Step 1: Extend the client-factory test**

Append to `__tests__/lib/firefly-client.test.ts`:

```ts
  it('wires the Insight api', () => {
    const clients = createFireflyClients({ fireflyApiUrl: 'https://ff/api', fireflyAccessToken: 'tok-insight' })
    expect(typeof clients.Insight.insightExpenseCategory).toBe('function')
  })
```

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/lib/firefly-client.test.ts`
Expected: FAIL (`Insight` not on `FireflyClients`).

- [ ] **Step 3: Add the Insight factory to `src/lib/firefly/client.ts`**

```ts
export interface FireflyClients {
  About: ReturnType<typeof api.AboutApiFactory>
  Accounts: ReturnType<typeof api.AccountsApiFactory>
  Categories: ReturnType<typeof api.CategoriesApiFactory>
  Insight: ReturnType<typeof api.InsightApiFactory>
  Transactions: ReturnType<typeof api.TransactionsApiFactory>
}
```

and in the built clients object:

```ts
    Insight: api.InsightApiFactory(configuration),
```

- [ ] **Step 4: Grow `src/lib/firefly/service.ts`**

Imports/types section — add `CategoryRead`, `TransactionRead` imports and re-exports, and the summary interface:

```ts
import type { AccountRead } from '#root/lib/firefly/generated/model/account-read.js'
import type { CategoryRead } from '#root/lib/firefly/generated/model/category-read.js'
import type { TransactionRead } from '#root/lib/firefly/generated/model/transaction-read.js'
// ...
export { AccountTypeFilter }
export type { AccountRead, CategoryRead, TransactionRead }

export interface CategoryExpenseSummary {
  currency: string
  difference: number
}
```

`FireflyService` interface additions:

```ts
  listCategories: () => Promise<CategoryRead[]>
  getCategory: (id: string) => Promise<CategoryRead>
  storeCategory: (name: string) => Promise<void>
  updateCategory: (id: string, name: string) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  listTransactionsByCategory: (id: string, start: string, end: string) => Promise<TransactionRead[]>
  insightExpenseCategory: (start: string, end: string, categoryId: number) => Promise<CategoryExpenseSummary[]>
```

Implementation object additions (inside `createFireflyService`'s return):

```ts
    // ponytail: 500-category cap (v1 ceiling); real pagination arrives with the Phase 3 lists standard.
    async listCategories() {
      const res = await clients().Categories.listCategory(undefined, 500)
      return res.data.data ?? []
    },
    async getCategory(id) {
      const res = await clients().Categories.getCategory(id)
      return res.data.data
    },
    async storeCategory(name) {
      await clients().Categories.storeCategory({ name })
    },
    async updateCategory(id, name) {
      await clients().Categories.updateCategory(id, { name })
    },
    async deleteCategory(id) {
      await clients().Categories.deleteCategory(id)
    },
    // ponytail: 100-transaction single page (v1 ceiling); page counter arrives in Phase 3.
    async listTransactionsByCategory(id, start, end) {
      const res = await clients().Categories.listTransactionByCategory(id, undefined, 100, 1, start, end)
      return res.data.data ?? []
    },
    async insightExpenseCategory(start, end, categoryId) {
      const res = await clients().Insight.insightExpenseCategory(start, end, undefined, [categoryId])
      return (res.data ?? []).map(item => ({
        currency: item.currency_code ?? '',
        difference: item.difference_float ?? 0,
      }))
    },
```

(If tsc rejects `{ name }` for the generated `CategoryStore`/`CategoryUpdate` models because they carry extra required fields, check the model in `generated/model/category-store.ts` first — Firefly's models are `{ name }` plus optionals; only add fields the model actually requires.)

- [ ] **Step 5: Grow the harness fakes in `__tests__/helpers/bot.ts`**

Replace `testAccount` and `createTestFireflyService`, add the two new fixture builders:

```ts
export function testAccount(id: string, name: string, options: {
  type?: string
  active?: boolean
  balance?: string
  currencySymbol?: string
  decimalPlaces?: number
} = {}): AccountRead {
  const { type = 'asset', active = true, balance = '100.00', currencySymbol = 'USD', decimalPlaces = 2 } = options
  return {
    id,
    type: 'account',
    attributes: { name, type, active, current_balance: balance, currency_symbol: currencySymbol, currency_decimal_places: decimalPlaces },
  } as unknown as AccountRead
}

export function testCategory(id: string, name: string): CategoryRead {
  return { id, type: 'category', attributes: { name } } as unknown as CategoryRead
}

export function testCategoryTransaction(description: string, options: {
  amount?: string
  currencySymbol?: string
  date?: string
} = {}): TransactionRead {
  const { amount = '12.34', currencySymbol = '$', date = '2026-10-01T12:00:00+00:00' } = options
  return {
    type: 'transaction',
    attributes: { transactions: [{ description, amount, currency_symbol: currencySymbol, date }] },
  } as unknown as TransactionRead
}

export function createTestFireflyService(
  fixtures: {
    accounts?: AccountRead[]
    categories?: CategoryRead[]
    categoryTransactions?: Record<string, TransactionRead[]>
    categoryInsights?: Record<string, CategoryExpenseSummary[]>
  } = {},
  overrides: Partial<FireflyService> = {},
): FireflyService {
  const categories = [...(fixtures.categories ?? [])] // mutable copy: store/update/delete are observable in re-renders
  let nextCategoryId = 100
  return {
    async getCurrentUser() {
      return { email: 'test@example.com' }
    },
    async listAccounts(type) {
      return (fixtures.accounts ?? [])
        .filter(a => a.attributes.active !== false) // service parity: filterActiveAccounts
        .filter(a => !type || String(a.attributes.type) === String(type))
    },
    async getAccount(id) {
      const acc = (fixtures.accounts ?? []).find(a => a.id === id)
      if (!acc)
        throw new ResourceNotFoundError('404')
      return acc
    },
    async listCategories() {
      return [...categories]
    },
    async getCategory(id) {
      const found = categories.find(c => c.id === id)
      if (!found)
        throw new ResourceNotFoundError('404')
      return found
    },
    async storeCategory(name) {
      categories.push(testCategory(String(nextCategoryId++), name))
    },
    async updateCategory(id, name) {
      const found = categories.find(c => c.id === id)
      if (found)
        (found.attributes as { name: string }).name = name
    },
    async deleteCategory(id) {
      const idx = categories.findIndex(c => c.id === id)
      if (idx !== -1)
        categories.splice(idx, 1)
    },
    async listTransactionsByCategory(id) {
      return fixtures.categoryTransactions?.[id] ?? []
    },
    async insightExpenseCategory(_start, _end, categoryId) {
      return fixtures.categoryInsights?.[String(categoryId)] ?? []
    },
    ...overrides,
  }
}
```

Update the import line to include the new types:

```ts
import type { AccountRead, CategoryExpenseSummary, CategoryRead, FireflyService, TransactionRead } from '#root/lib/firefly/service.js'
```

- [ ] **Step 6: Run — expect pass (client test + everything downstream still green)**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green (existing settings tests use `testAccount('1', 'Checking')` — the new options object defaults preserve that call shape).

- [ ] **Step 7: Commit**

```bash
git add src/lib/firefly/client.ts src/lib/firefly/service.ts __tests__/lib/firefly-client.test.ts __tests__/helpers/bot.ts
git commit -m "feat(v2): firefly service category/insight methods + harness fakes"
```

---

### Task 6: Accounts feature (rich table + tab menu)

**Files:**
- Create: `src/bot/features/accounts/index.ts`, `src/bot/features/accounts/accounts.menu.ts`
- Modify: `src/bot/context.ts` (SessionData += `categoryFlow`, `lists`)
- Modify: `src/bot/index.ts` (mount `accountsFeature` after the gate)
- Modify: `locales/{en,es,it,ru}.yaml` (reshape `accounts.list.*` values, add `tables.*`)
- Test: `__tests__/features/accounts/accounts.test.ts`

**Interfaces:**
- Consumes: `markdownTable` (Task 2), mock rich support (Task 3), gate (Task 4), `listAccounts` + `AccountTypeFilter` (Phase 1), locale keys `accounts.labels.{asset,expense,revenue,liability}`, `accounts.list.*`, `labels.DONE`
- Produces:
  - `accountsFeature` composer; `accountsMenu` (id `'accounts'`)
  - `showAccounts(ctx, edit: boolean): Promise<void>`
  - `SessionData.lists?: Record<string, { page: number, view?: string }>` — the list-state standard shape (Phase 3 reuses; `lists.accounts.view` holds the current `AccountTypeFilter` string)

- [ ] **Step 1: Reshape the locale values**

`locales/en.yaml` — replace the four `accounts.list.<type>` values (keep each locale's existing heading sentence; only the wrapper changes) and add the shared `tables` section at top level:

```yaml
accounts:
  labels: # unchanged
  list:
    noAccounts: No accounts yet🤷
    asset: >
      Balance of your asset accounts:

      ${accounts}

      SUM: ${sums ? sums : '0'}
    expense: >
      Balance of your expense accounts:

      ${accounts}

      SUM: ${sums ? sums : '0'}
    revenue: >
      Balance of your revenue accounts:

      ${accounts}

      SUM: ${sums ? sums : '0'}
    liability: >
      Balance of your liabilities:

      ${accounts}

      SUM: ${sums ? sums : '0'}

tables:
  name: Name
  balance: Balance
  currency: Currency
  date: Date
  description: Description
  amount: Amount
```

For `es/it/ru.yaml`: apply the identical transformation — take the existing `<pre>…</pre>` value, keep its first line (the translated heading), drop the `<pre>` wrapper and the `${accounts.replace(/\n$/, '')}` hack, and end with the `SUM:` line (keep each locale's existing SUM wording if it differs; default `SUM:`). Add the `tables` section translated:

```yaml
# es
tables:
  name: Nombre
  balance: Saldo
  currency: Moneda
  date: Fecha
  description: Descripción
  amount: Importe
# it
tables:
  name: Nome
  balance: Saldo
  currency: Valuta
  date: Data
  description: Descrizione
  amount: Importo
# ru
tables:
  name: Название
  balance: Баланс
  currency: Валюта
  date: Дата
  description: Описание
  amount: Сумма
```

- [ ] **Step 2: Extend `SessionData` in `src/bot/context.ts`**

```ts
export interface SessionData {
  settingsFlow?: { step: SettingsFlowStep }
  categoryFlow?: { step: 'add' | 'rename', names?: string[], categoryId?: string }
  // Per-list view state — the list/pagination standard shape (Phase 3 fills the page counter in)
  lists?: Record<string, { page: number, view?: string }>
}
```

(Both flow fields land now so context.ts is touched once; `categoryFlow` is consumed in Task 8. The nested `step` keys sit at 4-space indent — the lint test's `^\s{2}step\??:` rule stays satisfied.)

- [ ] **Step 3: Write failing integration tests**

```ts
// __tests__/features/accounts/accounts.test.ts
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  getLastRichMarkdown,
  initializeBot,
  setupMockApi,
  testAccount,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function setup() {
  const { bot } = createTestBot({
    settings: CONFIGURED,
    firefly: createTestFireflyService({
      accounts: [
        testAccount('1', 'Checking', { balance: '1234.5', currencySymbol: 'USD', decimalPlaces: 2 }),
        testAccount('2', 'Savings', { balance: '980.004', currencySymbol: 'USD', decimalPlaces: 2 }),
        testAccount('3', 'Cash', { balance: '55.2', currencySymbol: 'EUR', decimalPlaces: 2 }),
        testAccount('4', 'Hidden', { active: false }),
        testAccount('5', 'Wallet', { type: 'expense', balance: '10', currencySymbol: 'USD' }),
      ],
    }),
  })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return { bot, api, click }
}

describe('accounts feature', () => {
  it('renders the asset list as a rich table with per-currency sums', async () => {
    const { bot, api } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendRichMessage')!
    expect(send).toBeDefined()
    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(markdown).toContain('| Checking | 1234.50 | USD |')
    expect(markdown).toContain('| Cash | 55.20 | EUR |')
    expect(markdown).not.toContain('Hidden') // inactive accounts filtered (service parity)
    expect(markdown).not.toContain('Wallet') // expense account not in the asset view
    expect(markdown).toContain('SUM:')
  })

  it('sums use the v1 running-ceil quirk (USD 1234.5 + 980.004 → 2216)', async () => {
    const { bot, api } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    // ceil applied to the RUNNING sum after each addition: ceil(1234.5)=1235, ceil(1235+980.004)=2216
    expect(markdown).toContain('2216 USD')
    expect(markdown).toContain('56 EUR') // ceil(55.2)
  })

  it('shows all four tabs with the active one disabled, and switching edits the message', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendRichMessage')!
    const keyboard = (send.payload as any).reply_markup.inline_keyboard.flat() as any[]
    const assetButton = keyboard.find(b => b.text === i18n.t('en', 'accounts.labels.asset'))
    expect(assetButton?.disabled).toBe(true) // menu@1.5 disabled = active tab marker

    await click(i18n.t('en', 'accounts.labels.expense'))
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).rich_message?.markdown).toContain('Wallet')
    const editKeyboard = (edit.payload as any).reply_markup.inline_keyboard.flat() as any[]
    expect(editKeyboard.find((b: any) => b.text === i18n.t('en', 'accounts.labels.expense'))?.disabled).toBe(true)
    expect(editKeyboard.find((b: any) => b.text === i18n.t('en', 'accounts.labels.asset'))?.callback_data).toBeDefined()
  })

  it('Done deletes the list message', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendRichMessage')!
    await click(i18n.t('en', 'labels.DONE'))
    const del = api.getOutgoingRequests().find(r => r.method === 'deleteMessage')!
    expect(del).toBeDefined()
    expect((del.payload as any).message_id).toBe(send.resultMessageId)
  })
})
```

(If the USD sum expectation ever fails toward `2215`, the implementation ceil'ed the final total instead of the running sum — that is a behavior change; fix the code, not the test.)

- [ ] **Step 4: Run — expect failure**

Run: `bunx vitest run __tests__/features/accounts/accounts.test.ts`
Expected: FAIL (feature missing; `labels.ACCOUNTS` text hits the unhandled fallback → plain sendMessage, no `sendRichMessage`).

- [ ] **Step 5: Implement `src/bot/features/accounts/accounts.menu.ts`**

```ts
import type { Context } from '#root/bot/context.js'
import type { AccountRead } from '#root/lib/firefly/service.js'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { markdownTable } from '#root/bot/helpers/rich.js'
import { AccountTypeFilter } from '#root/lib/firefly/service.js'

const ACCOUNT_TYPES = [
  AccountTypeFilter.Asset,
  AccountTypeFilter.Expense,
  AccountTypeFilter.Revenue,
  AccountTypeFilter.Liability,
] as const

function labelKey(type: AccountTypeFilter): string {
  return `accounts.labels.${String(type).toLowerCase()}`
}

/** Render the accounts list. `edit` = swap an existing list message (tab click). */
export async function showAccounts(ctx: Context, edit: boolean) {
  const view = (ctx.session.lists?.accounts?.view ?? AccountTypeFilter.Asset) as AccountTypeFilter
  // ponytail: single 100-account fetch per view (v1 ceiling); prev/next paging arrives with Phase 3.
  const accounts = await ctx.firefly.listAccounts(view, dayjs().format('YYYY-MM-DD'))
  ctx.session.lists = { ...ctx.session.lists, accounts: { page: 1, view: String(view) } }
  const markdown = accountsMarkdown(ctx, view, accounts)
  if (edit) {
    await ctx.editMessageText({ markdown }, { reply_markup: accountsMenu })
  }
  else {
    await ctx.replyWithRichMessage({ markdown }, { reply_markup: accountsMenu })
  }
}

function accountsMarkdown(ctx: Context, view: AccountTypeFilter, accounts: AccountRead[]): string {
  const rows = accounts.map(acc => [
    acc.attributes.name,
    Number.parseFloat(acc.attributes.current_balance || '').toFixed(acc.attributes.currency_decimal_places ?? 2),
    acc.attributes.currency_symbol ?? '',
  ])
  const table = rows.length
    ? markdownTable(
        [ctx.i18n.t('tables.name'), ctx.i18n.t('tables.balance'), ctx.i18n.t('tables.currency')],
        rows,
        ['left', 'right', 'left'],
      )
    : ctx.i18n.t('accounts.list.noAccounts')
  return ctx.i18n.t(`accounts.list.${String(view).toLowerCase()}`, {
    accounts: table,
    sums: accountSums(accounts),
  })
}

// Port of v1's reduce(): Math.ceil applied to the RUNNING sum after every
// addition — a quirk, kept verbatim (behavior-preserving port).
function accountSums(accounts: AccountRead[]): string {
  const sums: Record<string, number> = {}
  for (const acc of accounts) {
    const currency = acc.attributes.currency_symbol || '💲'
    sums[currency] = Math.ceil((sums[currency] ?? 0) + Number.parseFloat(acc.attributes.current_balance || ''))
  }
  return Object.entries(sums).map(([currency, sum]) => `${sum} ${currency}`).join('\n')
}

// Tab bar: all four types visible; the active one renders disabled (menu@1.5).
// v1 instead HID the active tab — flagged micro-deviation in the spec amendments.
export const accountsMenu = new Menu<Context>('accounts')
  .dynamic((ctx) => {
    const range = new MenuRange<Context>()
    const view = String(ctx.session.lists?.accounts?.view ?? AccountTypeFilter.Asset)
    for (const type of ACCOUNT_TYPES) {
      const label = (c: Context) => c.i18n.t(labelKey(type))
      if (String(type) === view) {
        range.disabled(label).row()
      }
      else {
        range.text({ text: label, payload: String(type) }, async (c) => {
          c.session.lists = { ...c.session.lists, accounts: { page: 1, view: String(type) } }
          await showAccounts(c, true)
        }).row()
      }
    }
    range.text(c => c.i18n.t('labels.DONE'), async (c) => {
      await c.deleteMessage()
    })
    return range
  })
```

If `range.disabled(label)` does not typecheck (menu@1.5 builder naming), check `node_modules/@grammyjs/menu/out/menu.d.ts` for the actual builder (`disabled` / `style`-based) and use it; the semantics required are: visible button, no callback fire.

- [ ] **Step 6: Implement `src/bot/features/accounts/index.ts` and mount it**

```ts
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { accountsMenu, showAccounts } from './accounts.menu.js'

export const accountsFeature = new Composer<Context>()

accountsFeature.use(accountsMenu)
for (const locale of locales) {
  accountsFeature.hears(i18n.t(locale, 'labels.ACCOUNTS'), async ctx => showAccounts(ctx, false))
}
```

In `src/bot/index.ts`, between the gate and `unhandledFeature`:

```ts
import { accountsFeature } from '#root/bot/features/accounts/index.js'
// ...
  protectedBot.use(requireSettings())
  protectedBot.use(accountsFeature)
  protectedBot.use(unhandledFeature) // must stay last
```

- [ ] **Step 7: Run — expect pass**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/bot/features/accounts src/bot/context.ts src/bot/index.ts locales __tests__/features/accounts
git commit -m "feat(v2): accounts feature — rich table list, tab menu with disabled active tab"
```

---

### Task 7: Categories feature — list, details (month nav), delete

**Files:**
- Create: `src/bot/features/categories/index.ts`, `src/bot/features/categories/categories.menu.ts`
- Create: `src/bot/helpers/menu.ts` (`twoColumnRange`)
- Modify: `src/bot/index.ts` (mount `categoriesFeature` after `accountsFeature`)
- Test: `__tests__/features/categories/categories.test.ts`

**Interfaces:**
- Consumes: `twoColumnRange`, `markdownTable`/`escapeRichMarkdown` (Task 2), `showAccounts`-style rendering, service methods (Task 5), locale keys `categories.{list,listEmpty,transactionsList,confirmDeletion,deleted,noTransactions}`, `labels.{ADD_CATEGORIES,DONE,DELETE,CLOSE,YES,CANCEL}`
- Produces:
  - `twoColumnRange<C, T>(range: MenuRange<C>, items: readonly T[], add: (range: MenuRange<C>, item: T) => void): void` (`src/bot/helpers/menu.ts` — beads 1j0 keyboard half; Phase 3 reuses)
  - `categoriesFeature` composer; menus `categories` / `category-details` / `category-delete`; `showCategoriesList(ctx, edit)` and `showCategoryDetails(ctx)` handlers
  - **Stateless details pattern**: payload `'id'` or `'id|YYYY-MM-DD'` is the whole view state; `ctx.match` re-read at every render — no session (v1 parity: v1 carried the date in callback regexes)

- [ ] **Step 1: Write failing integration tests**

```ts
// __tests__/features/categories/categories.test.ts
import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import type { TransactionRead } from '#root/lib/firefly/service.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestBot,
  createTestFireflyService,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  getLastRichMarkdown,
  initializeBot,
  setupMockApi,
  testCategory,
  testCategoryTransaction,
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

const txnCalls: Array<{ id: string, start: string, end: string }> = []
let deletedIds: string[] = []

async function setup() {
  txnCalls.length = 0
  deletedIds = []
  const { bot } = createTestBot({
    settings: CONFIGURED,
    firefly: createTestFireflyService(
      {
        categories: [testCategory('1', 'Groceries'), testCategory('2', 'Utilities'), testCategory('3', 'Clothes')],
        categoryTransactions: {
          '1': [
            testCategoryTransaction('Supermarket', { amount: '40.10', date: '2026-10-05T10:00:00+00:00' }),
            testCategoryTransaction('Bakery', { amount: '5.20', date: '2026-10-12T10:00:00+00:00' }),
          ] as TransactionRead[],
        },
        categoryInsights: { '1': [{ currency: 'USD', difference: -45.3 }] },
      },
      {
        listTransactionsByCategory: async (id, start, end) => {
          txnCalls.push({ id, start, end })
          return id === '1'
            ? [
                testCategoryTransaction('Supermarket', { amount: '40.10', date: '2026-10-05T10:00:00+00:00' }),
                testCategoryTransaction('Bakery', { amount: '5.20', date: '2026-10-12T10:00:00+00:00' }),
              ]
            : []
        },
        deleteCategory: async (id) => {
          deletedIds.push(id)
        },
      },
    ),
  })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return { bot, api, click }
}

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

describe('categories feature', () => {
  it('lists categories two per row with Add + Done', async () => {
    const { bot, api } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain(i18n.t('en', 'categories.list').slice(0, 15))
    const rows = (send.payload as any).reply_markup.inline_keyboard as { text: string }[][]
    expect(rows[0].map(b => b.text)).toEqual(['Groceries', 'Utilities'])
    expect(rows[1].map(b => b.text)).toEqual(['Clothes']) // odd count: last one alone (v1 layout)
    expect(rows[2].map(b => b.text)).toEqual([i18n.t('en', 'labels.ADD_CATEGORIES')])
    expect(rows[3].map(b => b.text)).toEqual([i18n.t('en', 'labels.DONE')])
  })

  it('details: rich transaction table + insight sums + month nav', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')

    const markdown = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(markdown).toContain('*Groceries*')
    expect(monthLabel(dayjs())).length // sanity: label helper works
    expect(markdown).toContain('| Bakery | 5.20 $ |') // newest first (v1 .reverse())
    expect(markdown).toContain('45.3 USD') // Math.abs of insight difference

    // month nav is stateless: prev-month click refetches the previous range
    await click(`<< ${monthLabel(dayjs().subtract(1, 'month'))}`)
    expect(txnCalls.at(-1)!.start).toBe(dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'))
  })

  it('delete: confirm screen, YES deletes with toast, list re-renders without the category', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click(i18n.t('en', 'labels.DELETE'))
    const confirm = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((confirm.payload as any).text).toContain(i18n.t('en', 'categories.confirmDeletion').slice(0, 15))

    await click(i18n.t('en', 'labels.YES'))
    expect(deletedIds).toEqual(['1'])
    const answered = api.getOutgoingRequests().filter(r => r.method === 'answerCallbackQuery').at(-1)!
    expect((answered.payload as any).text).toBe(i18n.t('en', 'categories.deleted'))
    const listReRender = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    const rows = (listReRender.payload as any).reply_markup.inline_keyboard.flat() as { text: string }[]
    expect(rows.some(b => b.text === 'Groceries')).toBe(false)
    expect(rows.some(b => b.text === 'Utilities')).toBe(true)
  })

  it('delete-cancel returns to the details view of the same month', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click(i18n.t('en', 'labels.DELETE'))
    await click(i18n.t('en', 'labels.CANCEL'))
    expect(getLastRichMarkdown(api.getOutgoingRequests())).toContain('*Groceries*')
  })

  it('Done deletes the list message', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click(i18n.t('en', 'labels.DONE'))
    expect(api.getOutgoingRequests().some(r => r.method === 'deleteMessage')).toBe(true)
  })
})
```

(If `labels.CANCEL` differs per locale file, use exactly what `locales/en.yaml` has — v1 keys are authoritative.)

- [ ] **Step 2: Run — expect failure**

Run: `bunx vitest run __tests__/features/categories/categories.test.ts`
Expected: FAIL (feature missing).

- [ ] **Step 3: Implement `src/bot/helpers/menu.ts`**

```ts
import type { MenuRange } from '@grammyjs/menu'

/**
 * Append items two per row (v1 category-list layout). The last item always
 * ends its row so following buttons start on a fresh row.
 */
export function twoColumnRange<C, T>(
  range: MenuRange<C>,
  items: readonly T[],
  add: (range: MenuRange<C>, item: T) => void,
): void {
  items.forEach((item, i) => {
    add(range, item)
    if (i % 2 !== 0 || i === items.length - 1)
      range.row()
  })
}
```

- [ ] **Step 4: Implement `src/bot/features/categories/categories.menu.ts`**

```ts
import type { Context } from '#root/bot/context.js'
import type { CategoryRead, TransactionRead } from '#root/lib/firefly/service.js'
import type dayjs from 'dayjs'
import { Menu, MenuRange } from '@grammyjs/menu'
import dayjs from 'dayjs'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'
import { twoColumnRange } from '#root/bot/helpers/menu.js'

// ---- list ----

export async function showCategoriesList(ctx: Context, edit: boolean) {
  const categories = await ctx.firefly.listCategories()
  const text = categories.length ? ctx.i18n.t('categories.list') : ctx.i18n.t('categories.listEmpty')
  if (edit) {
    await ctx.editMessageText(text, { reply_markup: categoriesMenu })
  }
  else {
    await ctx.reply(text, { reply_markup: categoriesMenu })
  }
}

export const categoriesMenu = new Menu<Context>('categories')
  .dynamic(async (ctx) => {
    const range = new MenuRange<Context>()
    try {
      // ponytail: fetch-per-render (v1 parity). The range must bake id payloads,
      // and session writes are forbidden in dynamic callbacks — so refetch it is.
      const categories = await ctx.firefly.listCategories()
      twoColumnRange(range, categories, (r, category: CategoryRead) => {
        r.text({ text: () => category.attributes.name, payload: category.id }, showCategoryDetails)
      })
    }
    catch (err) {
      ctx.logger.warn({ err }, 'category list render failed') // dead range, live Add/Done buttons
    }
    range.text(() => ctx.i18n.t('labels.ADD_CATEGORIES'), async (c) => {
      c.session.categoryFlow = { step: 'add' }
      await c.editMessageText(c.i18n.t('categories.typeCategories'), { parse_mode: 'Markdown', reply_markup: categoryFlowCancelMenu })
    }).row()
    range.text(() => ctx.i18n.t('labels.DONE'), async (c) => {
      await c.deleteMessage()
    })
    return range
  })

// ---- details (month view) — stateless: the clicked payload carries all state ----

function parseDetailsMatch(match: string | undefined): { id: string, date: string } {
  const [id, dateInput] = String(match ?? '').split('|')
  return { id, date: dateInput || dayjs().format('YYYY-MM-DD') }
}

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

export async function showCategoryDetails(ctx: Context) {
  const { id, date } = parseDetailsMatch(ctx.match)
  const start = dayjs(date).startOf('month').format('YYYY-MM-DD')
  const end = dayjs(date).endOf('month').format('YYYY-MM-DD')
  const [category, transactions, insights] = await Promise.all([
    ctx.firefly.getCategory(id),
    ctx.firefly.listTransactionsByCategory(id, start, end),
    ctx.firefly.insightExpenseCategory(start, end, Number(id)),
  ])
  const sums = insights.map(s => `${Math.abs(s.difference)} ${s.currency}`).join('\n')
  const markdown = ctx.i18n.t('categories.transactionsList', {
    categoryName: escapeRichMarkdown(category.attributes.name),
    monthName: escapeRichMarkdown(monthLabel(dayjs(date))),
    transactions: transactionsMarkdown(ctx, transactions),
    sums,
  })
  await ctx.editMessageText({ markdown }, { reply_markup: categoryDetailsMenu })
}

function transactionsMarkdown(ctx: Context, transactions: TransactionRead[]): string {
  if (!transactions.length)
    return ctx.i18n.t('categories.noTransactions')
  const rows = [...transactions].reverse().flatMap((item) => {
    const tr = item.attributes.transactions?.[0]
    if (!tr)
      return []
    return [[
      dayjs(tr.date).format('DD MMM'),
      tr.description,
      `${Number.parseFloat(tr.amount).toFixed(2)} ${tr.currency_symbol ?? ''}`,
    ]]
  })
  return markdownTable(
    [ctx.i18n.t('tables.date'), ctx.i18n.t('tables.description'), ctx.i18n.t('tables.amount')],
    rows,
    ['left', 'left', 'right'],
  )
}

export const categoryDetailsMenu = new Menu<Context>('category-details')
  .dynamic((ctx) => {
    const { id, date } = parseDetailsMatch(ctx.match)
    if (!id)
      return new MenuRange<Context>() // rendered outside a details click: empty
    const prev = dayjs(date).subtract(1, 'month')
    const next = dayjs(date).add(1, 'month')
    const range = new MenuRange<Context>()
    range.text({ text: () => `<< ${monthLabel(prev)}`, payload: `${id}|${prev.format('YYYY-MM-DD')}` }, showCategoryDetails)
    range.text({ text: () => `${monthLabel(next)} >>`, payload: `${id}|${next.format('YYYY-MM-DD')}` }, showCategoryDetails).row()
    // rename row arrives in Task 8
    range.text(() => ctx.i18n.t('labels.DELETE'), (c) => askDeleteConfirm(c)).row()
    range.text(() => ctx.i18n.t('labels.CLOSE'), async (c) => {
      await showCategoriesList(c, true)
    })
    return range
  })

// ---- delete confirm ----

async function askDeleteConfirm(ctx: Context) {
  await ctx.editMessageText(ctx.i18n.t('categories.confirmDeletion'), { parse_mode: 'Markdown', reply_markup: categoryDeleteMenu })
}

export const categoryDeleteMenu = new Menu<Context>('category-delete')
  .dynamic((ctx) => {
    // ctx.match here is the DETAILS delete button's payload 'id|date'
    const { id, date } = parseDetailsMatch(ctx.match)
    if (!id)
      return new MenuRange<Context>()
    const range = new MenuRange<Context>()
    range
      .text({ text: c => c.i18n.t('labels.YES'), payload: id }, async (c) => {
        await c.firefly.deleteCategory(id)
        await c.answerCallbackQuery({ text: c.i18n.t('categories.deleted') })
        await showCategoriesList(c, true)
      })
      .danger() // menu@1.5 destructive styling; if the builder name differs, check menu.d.ts — omitting it changes nothing functional
    range.text({ text: c => c.i18n.t('labels.CANCEL'), payload: `${id}|${date}` }, showCategoryDetails)
    return range
  })

// ---- flow cancel (referenced by the Add button; the rename route lands in Task 8) ----

export async function cancelCategoryFlow(ctx: Context) {
  ctx.session.categoryFlow = undefined
  await showCategoriesList(ctx, true)
}

export const categoryFlowCancelMenu = new Menu<Context>('category-flow-cancel')
  .text(c => c.i18n.t('labels.CANCEL'), cancelCategoryFlow)
```

How the stateless wiring works (the part to verify in the integration test, not trust): `ctx.match` holds the clicked button's payload for the whole update, so `showCategoryDetails` re-renders with the *target* month, and `categoryDetailsMenu`'s dynamic builds prev/next payloads from that same `ctx.match`. No session, no closures beyond the render.

- [ ] **Step 5: Implement `src/bot/features/categories/index.ts` and mount it**

```ts
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { categoriesMenu } from './categories.menu.js'

export const categoriesFeature = new Composer<Context>()

categoriesMenu.register(categoryDetailsMenu) // deepest-first
categoriesMenu.register(categoryDeleteMenu)
categoriesMenu.register(categoryFlowCancelMenu)

categoriesFeature.use(categoriesMenu)
// categoriesRouter lands in Task 8

for (const locale of locales) {
  categoriesFeature.hears(i18n.t(locale, 'labels.CATEGORIES'), async ctx => showCategoriesList(ctx, false))
}
```

(Fix the import list to include `categoryDeleteMenu`, `categoryFlowCancelMenu`, `showCategoriesList` from `./categories.menu.js` — shown split here only to keep the registration lines readable.)

In `src/bot/index.ts`:

```ts
import { categoriesFeature } from '#root/bot/features/categories/index.js'
// ...
  protectedBot.use(accountsFeature)
  protectedBot.use(categoriesFeature)
  protectedBot.use(unhandledFeature) // must stay last
```

- [ ] **Step 6: Run — expect pass**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/bot/features/categories src/bot/helpers/menu.ts src/bot/index.ts __tests__/features/categories
git commit -m "feat(v2): categories list + rich details view with stateless month nav + delete"
```

---

### Task 8: Categories flows — add (multi-line + confirm), rename (router)

**Files:**
- Create: `src/bot/features/categories/categories.router.ts`
- Modify: `src/bot/features/categories/categories.menu.ts` (rename row in details, `categoriesConfirmMenu`)
- Modify: `src/bot/features/categories/index.ts` (mount router)
- Modify: `locales/{en,es,it,ru}.yaml` (new key `categories.created`)
- Test: `__tests__/features/categories/categories.test.ts` (append)

**Interfaces:**
- Consumes: `categoryFlow` session field (Task 6's context.ts change), `categoryFlowCancelMenu` / `showCategoriesList` (Task 7), locale keys `categories.{typeCategories,confirmCreation,typeNewName}`, `labels.{YES,DECLINE_CATEGORIES_LIST,CANCEL}`
- Produces: `categoriesRouter = new Router<Context>(ctx => ctx.session.categoryFlow?.step)` with routes `'add'` | `'rename'`, `otherwise → next()`; `categoriesConfirmMenu` (id `'categories-confirm'`)

- [ ] **Step 1: Add the locale key (replaces v1's hardcoded Russian toast)**

```yaml
# en
categories:
  created: Categories created!
# es
  created: '¡Categorías creadas!'
# it
  created: Categorie create!
# ru
  created: Категории созданы!
```

- [ ] **Step 2: Append failing tests** to `__tests__/features/categories/categories.test.ts`

```ts
describe('categories flows', () => {
  it('add: multi-line input → confirm screen → YES creates each and toasts', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click(i18n.t('en', 'labels.ADD_CATEGORIES'))
    let last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.typeCategories').slice(0, 12))

    await bot.handleUpdate(generateMessageUpdate('Food\nFuel'))
    last = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((last.payload as any).text).toContain('2 category(s)')
    expect((last.payload as any).text).toContain('Food')

    await click(i18n.t('en', 'labels.YES'))
    const answered = api.getOutgoingRequests().filter(r => r.method === 'answerCallbackQuery').at(-1)!
    expect((answered.payload as any).text).toBe(i18n.t('en', 'categories.created'))
    const listReRender = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    const labels = ((listReRender.payload as any).reply_markup.inline_keyboard as { text: string }[][]).flat().map(b => b.text)
    expect(labels).toContain('Food')
    expect(labels).toContain('Fuel')
  })

  it('add: DECLINE re-prompts, CANCEL returns to the list with an empty flow', async () => {
    const { bot, api, click } = await setup()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click(i18n.t('en', 'labels.ADD_CATEGORIES'))
    await bot.handleUpdate(generateMessageUpdate('Food'))
    await click(i18n.t('en', 'labels.DECLINE_CATEGORIES_LIST'))
    let last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.typeCategories').slice(0, 12))

    await click(i18n.t('en', 'labels.CANCEL'))
    last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.list').slice(0, 12))
    // flow cleared: plain text no longer routes into the add flow
    await bot.handleUpdate(generateMessageUpdate('not categories input'))
    const texts = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').map(r => (r.payload as any).text)
    expect(texts.at(-1)).toContain(i18n.t('en', 'help').slice(0, 8))
  })

  it('rename: from details, new name updates the category and returns to the list', async () => {
    const renamed: Array<{ id: string, name: string }> = []
    const { bot } = createTestBot({
      settings: CONFIGURED,
      firefly: createTestFireflyService(
        { categories: [testCategory('1', 'Groceries')] },
        {
          updateCategory: async (id, name) => {
            renamed.push({ id, name })
          },
        },
      ),
    })
    const api = setupMockApi(bot)
    await initializeBot(bot)
    const click = async (label: string) => {
      const btn = findButton(api.getOutgoingRequests(), label)
      if (!btn)
        throw new Error(`button not found: ${label}`)
      await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
    }
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click(i18n.t('en', 'labels.RENAME_CATEGORY'))
    let last = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.typeNewName').slice(0, 8))

    await bot.handleUpdate(generateMessageUpdate('Groceries & Stuff'))
    expect(renamed).toEqual([{ id: '1', name: 'Groceries & Stuff' }])
    last = api.getOutgoingRequests().filter(r => r.method === 'sendMessage').at(-1)!
    expect((last.payload as any).text).toContain(i18n.t('en', 'categories.list').slice(0, 12))
    expect((last.payload as any).reply_markup).toBeDefined()
  })
})
```

(`CONFIGURED`, `testCategory`, `createTestFireflyService` etc. are already imported by the Task 7 test file header.)

- [ ] **Step 3: Run — expect failure**

Run: `bunx vitest run __tests__/features/categories/categories.test.ts`
Expected: FAIL (no rename button; add flow never prompts; typed input falls to unhandled).

- [ ] **Step 4: Add the rename row to `categoryDetailsMenu`** (in `categories.menu.ts`, where the Task 7 comment sits)

```ts
    range.text({ text: () => ctx.i18n.t('labels.RENAME_CATEGORY'), payload: id }, async (c) => {
      c.session.categoryFlow = { step: 'rename', categoryId: parseDetailsMatch(c.match).id }
      await c.editMessageText(c.i18n.t('categories.typeNewName'), { reply_markup: categoryFlowCancelMenu })
    }).row()
```

- [ ] **Step 5: Add `categoriesConfirmMenu` to `categories.menu.ts`**

```ts
async function createCategories(ctx: Context) {
  const names = ctx.session.categoryFlow?.names ?? []
  for (const name of names)
    await ctx.firefly.storeCategory(name)
  ctx.session.categoryFlow = undefined
  await ctx.answerCallbackQuery({ text: ctx.i18n.t('categories.created') })
  await showCategoriesList(ctx, true)
}

async function rePromptAddCategories(ctx: Context) {
  await ctx.editMessageText(ctx.i18n.t('categories.typeCategories'), { parse_mode: 'Markdown', reply_markup: categoryFlowCancelMenu })
}

export const categoriesConfirmMenu = new Menu<Context>('categories-confirm')
  .text(c => c.i18n.t('labels.YES'), createCategories).row()
  .text(c => c.i18n.t('labels.DECLINE_CATEGORIES_LIST'), rePromptAddCategories).row()
  .text(c => c.i18n.t('labels.CANCEL'), cancelCategoryFlow)
```

- [ ] **Step 6: Implement `src/bot/features/categories/categories.router.ts`**

```ts
import type { Context } from '#root/bot/context.js'
import { Router } from '@grammyjs/router'
import { categoriesConfirmMenu, categoryFlowCancelMenu, showCategoriesList } from './categories.menu.js'

// Keyed on this flow's OWN session field — flows cannot re-point each other
// (the v1 shared `step` router corruption mode, structurally impossible here).
export const categoriesRouter = new Router<Context>(ctx => ctx.session.categoryFlow?.step)

categoriesRouter.route('add', async (ctx) => {
  const names = (ctx.msg?.text ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  ctx.session.categoryFlow = { step: 'add', names }
  await ctx.reply(ctx.i18n.t('categories.confirmCreation', { categories: names }), {
    parse_mode: 'Markdown',
    reply_markup: categoriesConfirmMenu,
  })
})

categoriesRouter.route('rename', async (ctx) => {
  const name = ctx.msg?.text ?? ''
  const categoryId = ctx.session.categoryFlow.categoryId!
  await ctx.firefly.updateCategory(categoryId, name)
  ctx.session.categoryFlow = undefined
  await showCategoriesList(ctx, false)
})

categoriesRouter.otherwise((_ctx, next) => next())
```

(The `categories.confirmCreation` YAML value already interpolates `${categories.length}` and `${categories.join('\n')}` — passing the array preserves v1 semantics exactly.)

- [ ] **Step 7: Mount the router and register the confirm menu** in `src/bot/features/categories/index.ts`

```ts
import { categoryDeleteMenu, categoriesConfirmMenu, categoriesMenu, categoryDetailsMenu, categoryFlowCancelMenu, showCategoriesList } from './categories.menu.js'
import { categoriesRouter } from './categories.router.js'

categoriesMenu.register(categoryDetailsMenu)
categoriesMenu.register(categoryDeleteMenu)
categoriesMenu.register(categoriesConfirmMenu)
categoriesMenu.register(categoryFlowCancelMenu)

categoriesFeature.use(categoriesMenu)
categoriesFeature.use(categoriesRouter)
```

- [ ] **Step 8: Run — expect pass**

Run: `bunx vitest run && bunx tsc --noEmit && bun run lint`
Expected: all green (including the architecture lint tests — `categoryFlow` is a per-flow field, not a shared `step`).

- [ ] **Step 9: Commit**

```bash
git add src/bot/features/categories locales __tests__/features/categories
git commit -m "feat(v2): categories add/rename flows on a dedicated categoryFlow router"
```

---

### Task 9: E2E — accounts + categories + gate against real Redis

**Files:**
- Test: `__tests__/e2e/accounts-categories.test.ts`

**Interfaces:**
- Consumes: `createSessionStorage()` (real Redis, port 6380 from `docker-compose.tests.yaml`), everything from Tasks 4–8
- Produces: e2e proof that list state (`session.lists`) and flows (`categoryFlow`) survive the real Redis session round-trip

- [ ] **Step 1: Write the e2e tests**

```ts
// __tests__/e2e/accounts-categories.test.ts
import { describe, expect, it } from 'vitest'
import { createBot } from '#root/bot/index.js'
import { createSessionStorage } from '#root/lib/session.js'
import { redis } from '#root/lib/redis.js'
import { defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestConfig,
  createTestFireflyService,
  createTestLogger,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
  testAccount,
  testCategory,
} from '../helpers/bot.js'
import { i18n } from '#root/bot/i18n.js'

const available = await redis.connect()
  .then(() => redis.ping())
  .then(() => true)
  .catch(() => false)

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

async function makeBot(settings = CONFIGURED) {
  const config = createTestConfig()
  const bot = createBot(config.botToken, {
    config,
    logger: createTestLogger(),
    settingsStore: createTestBotSettingsStore(settings),
    firefly: () => createTestFireflyService({
      accounts: [
        testAccount('1', 'Checking', { balance: '1234.5' }),
        testAccount('2', 'Wallet', { type: 'expense', balance: '9' }),
      ],
      categories: [testCategory('1', 'Groceries'), testCategory('2', 'Utilities')],
    }),
    sessionStorage: createSessionStorage(),
  })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  return { bot, api, click }
}

// fresh memory settings store per bot; import createMemorySettingsStore for it
import { createMemorySettingsStore } from '#root/lib/settings-store.js'
function createTestBotSettingsStore(settings = CONFIGURED) {
  return createMemorySettingsStore(settings ? { 1111111: settings } : {})
}

describe.skipIf(!available)('accounts + categories (e2e, real redis)', () => {
  it('accounts: rich list renders, tab switch round-trips through redis session', async () => {
    const { bot, api, click } = await makeBot()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(true)
    await click(i18n.t('en', 'accounts.labels.expense'))
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).rich_message?.markdown).toContain('Wallet')
    // session.lists survived the redis round-trip: the active tab came back disabled
    const keyboard = (edit.payload as any).reply_markup.inline_keyboard.flat()
    expect(keyboard.find((b: any) => b.text === i18n.t('en', 'accounts.labels.expense'))?.disabled).toBe(true)
  })

  it('categories: list → details → month nav → delete-cancel', async () => {
    const { bot, api, click } = await makeBot()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.CATEGORIES')))
    await click('Groceries')
    await click('<< ' + new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date()) + ', ' + new Date().getFullYear()) // prev-month label
    // two edits happened: details render + prev-month render (stateless nav, no session involved)
    expect(api.getOutgoingRequests().filter(r => r.method === 'editMessageText').length).toBeGreaterThanOrEqual(2)
  })

  it('gate: unconfigured user gets the settings prompt, not a firefly error', async () => {
    const { bot, api } = await makeBot(undefined)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.ACCOUNTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain('Firefly URL')
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(false)
  })
})
```

(Move the `createMemorySettingsStore` import to the top of the file with the other imports — shown mid-file only for readability. The prev-month label in the second test uses `Intl` directly instead of importing dayjs formatting twice; if it proves brittle, compute it with `dayjs().subtract(1, 'month').format('MMMM, YYYY')` capitalized — the same helper the menu uses.)

- [ ] **Step 2: Run**

```bash
docker compose -f docker-compose.tests.yaml up -d && bunx vitest run --config vitest.config.e2e.ts; docker compose -f docker-compose.tests.yaml down
```

Expected: 3 passed (plus the existing settings-flow and session-storage e2e tests). Self-skips with a note if Docker is unavailable — acceptable, record it in the commit.

- [ ] **Step 3: Commit**

```bash
git add __tests__/e2e/accounts-categories.test.ts
git commit -m "test(v2): e2e accounts/categories/gate against real redis sessions"
```

---

### Task 10: Standards docs — `docs/GRAMMY_MENUS.md` cookbook + CLAUDE.md touch-up

**Files:**
- Create: `docs/GRAMMY_MENUS.md`
- Modify: `CLAUDE.md` (Architecture section: two lines)

**Interfaces:**
- Consumes: everything landed in Tasks 1–9 (the cookbook documents the *established* patterns, it does not invent them)
- Produces: the list/menu standard Phase 3+ implementers (human or agent) must follow

- [ ] **Step 1: Write `docs/GRAMMY_MENUS.md`**

```markdown
# Menu & List Cookbook (v2)

The patterns below are established by the accounts/categories features (Phase 2).
They are conventions backed by lint tests where noted — extend them, never bypass.

## Menu basics

- Menus are `@grammyjs/menu` instances in `<feature>.menu.ts`, registered deepest-first
  on their parent (`parentMenu.register(childMenu)`), mounted per feature via
  `feature.use(menuInstance)` BEFORE the feature's router.
- Buttons that need per-item state use **payload buttons**; the payload travels in
  `callback_data` (64-byte budget) and comes back as `ctx.match` on click.
  Read state from `ctx.match`, not from stale closures or session.
- `.dynamic()` ranges re-run on EVERY click of that menu:
  - never write `ctx.session` inside them;
  - wrap fetches in try/catch — a crash is swallowed by the error handler and the
    user sees a dead spinner; return an empty range instead;
  - fetch-per-render is accepted (v1 parity) where the range must bake fresh
    payloads; leave a `ponytail:` note if you know the ceiling.

## Attach / edit rules

- Plain handlers attach a menu explicitly: `ctx.replyWithRichMessage({ markdown }, { reply_markup: menu })`
  or `ctx.editMessageText({ markdown }, { reply_markup: menu })`. Passing the `Menu`
  instance as `reply_markup` is correct here — the lib renders it at call time.
- `.back()` / `.submenu()` middleware must NOT pass `reply_markup` — the menu lib's
  nav installer injects the target menu into markup-less edits and then skips its own
  trailing edit; an explicit markup causes a redundant render → Telegram 400
  "message is not modified" (see commit 59a40d2).
- `ctx.menu.update()` re-renders the current menu only (keyboard edit) — safe on rich messages.

## Rich list rendering

- Tabular data renders as GFM markdown via `markdownTable()` (`bot/helpers/rich.ts`):
  localized column headers come from the shared `tables.*` locale keys; cells escape
  themselves; prose interpolations go through `escapeRichMarkdown()`.
- `accounts.list.*` / `categories.transactionsList` locale values interpolate
  `${accounts}`/`${transactions}` = the rendered table string, plus `${sums}`.
- The message and the keyboard are independent: rich payload via `rich_message`,
  menu via `reply_markup`, on both `sendRichMessage` and `editMessageText`.

## List views & pagination (the standard)

Per-list view state lives in `session.lists.<name> = { page: number, view?: string }`
(`accounts` uses `view` for the account-type tab). Phase 2 ships single-page lists
(v1 ceilings, `ponytail:`-noted); Phase 3 adds prev/next buttons that mutate `page`
and re-render — the session shape is already in place, do not invent a new one.

- Tab bars show every view with the active one `.disabled()` (menu@1.5); destructive
  confirmations style their YES button `.danger()`.
- Views that fit in a payload stay stateless: the category details view carries
  `'{id}|{YYYY-MM-DD}'` in prev/next payloads and re-reads `ctx.match` at render —
  zero session, TTL-proof. Prefer this whenever the state is ≤ 64 bytes.

## Testing

- Click buttons by visible label (`findButton`), replay real `callback_data` via
  `generateCallbackQueryUpdate`; assert on recorded API payloads
  (`getLastRichMarkdown`, raw `reply_markup.inline_keyboard`).
- The mock harness treats `sendRichMessage` like a text send: it gets a message id
  and can be edited later; editing a media message still throws like Telegram.
```

- [ ] **Step 2: Touch up `CLAUDE.md`** — in the Architecture bullet list, after the Menus bullet add:

```markdown
- **Rich messages**: list content goes out as GFM markdown via
  `ctx.replyWithRichMessage` / `ctx.editMessageText({ markdown })` (grammy 1.46,
  Bot API 10.1) with menus attached as `reply_markup`. Escape user values
  (`bot/helpers/rich.ts`); column headers come from shared `tables.*` locale keys.
  Patterns: `docs/GRAMMY_MENUS.md`.
```

- [ ] **Step 3: Verify + commit**

Run: `bunx vitest run && bun run lint`
Expected: green.

```bash
git add docs/GRAMMY_MENUS.md CLAUDE.md
git commit -m "docs(v2): menu/list cookbook (rich tables, payload patterns, pagination standard)"
```

---

## Out of scope for this plan (later phases)

- Transactions add + list (Phase 3) — first real consumer of the `page` counter; also fixes the SHOW_TRANSFERS filter bug and splits the 1,027-line v1 menu monster.
- Transactions edit/delete + date-picker rebuild (Phase 4); reports + cutover (Phase 5).
- Full non-grammy dependency sweep (axios, valibot, pino, dayjs, vitest, …) — Phase 5 cutover, with the major version bump.
- `@grammyjs/parse-mode`, `@grammyjs/commands`, `@grammyjs/stream`, rate limiters — evaluated and rejected for this stack (single-user-per-chat polling bot; rich messages already lift the length ceiling).
- Any UX redesign beyond the flagged amendments (disabled tab, danger button, rich rendering).

## Self-Review (performed at plan-writing time)

1. **Spec coverage (Phase 2 row):** accounts ✓ (T6), categories ✓ (T7 list/details/delete + T8 add/rename — the full v1 surface minus nothing), "list + pagination standards established" ✓ (T2 rich helpers, T6 `lists` shape + tabs, T10 cookbook; real paging deliberately Phase 3 per owner decision), "integration + e2e green" ✓ (T6/T7/T8 integration, T9 e2e). Spec §4's `docs/GRAMMY_MENUS.md` deferral ✓ (T10). Bugs folded: duplicate `requireSettings` stays fixed by the single T4 mount ✓; interceptor accumulation untouched (T5 adds methods on the cached client) ✓.
2. **Placeholders:** the only "check at implementation" notes are deliberate verification hooks against on-disk truth (`range.disabled()` builder name from `node_modules/@grammyjs/menu/out/menu.d.ts`, generated `CategoryStore` field requirements, per-locale `labels.CANCEL` spelling) — each names the exact file to check and the fallback. No TBDs, no "add appropriate handling".
3. **Type consistency:** `markdownTable(header, rows, aligns)` matches across T2/T6/T7; `showAccounts(ctx, edit)` defined T6, not consumed later; `showCategoriesList(ctx, edit)` / `showCategoryDetails(ctx)` / `parseDetailsMatch` defined T7, consumed by T8's router and menus; `twoColumnRange(range, items, add)` defined and used in T7; `testAccount` options object (T5) matches every T6/T9 call; `CategoryExpenseSummary` named in T5 and used in T5's fake only; `SessionData.categoryFlow`/`lists` added once (T6) and consumed in T7/T8; e2e `makeBot` builds on `createSessionStorage()` + memory settings store per Phase 0–1 patterns.
4. **Known risks surfaced to the implementer, not hidden:** grammy type-tightening fallout is fenced into T1; the `ctx.match`-driven dynamic render (stateless details) is explicitly called out as "verify in the integration test, not trust"; `.danger()`/`.disabled()` builder names carry named fallbacks; the running-ceil sum quirk has a dedicated regression test with the failure mode named.

## Execution Order

Tasks 1 → 10 strictly sequential. T1 fences the bump risk before anything depends on it; T2–3 are the shared plumbing T6–9 consume; T4's gate must precede the features it guards (T6/T7 mount after it in the chain); T7's menus are the base T8 extends; T9 exercises the whole stack; T10 documents what landed.

