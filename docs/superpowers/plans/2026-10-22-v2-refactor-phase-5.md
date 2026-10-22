# v2 Refactor — Phase 5: Reports + Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v2 reports feature (monthly summary — the first genuinely new feature on v2; v1 had only a `notImplemented` toast) and execute the cutover: delete `legacy/`, sweep dependencies, rewrite the Earthfile for Bun, bump to 3.0.0, and land the branch as a PR to master.

**Architecture:** Reports is a read-only feature slice `src/bot/features/reports/` rendering one rich message per month — per-currency income/expense/net totals plus an expenses-by-category GFM table — over three new `FireflyService` insight methods. Month navigation is stateless (`<YYYY-MM-DD>` payloads, categories month-view pattern; no session). Cutover tasks are mechanical: deletion, dependency bumps within existing majors, an Earthfile port from node/npm/dist to bun-from-source, and PR landing. After merge, a `v3.0.0` tag fires the existing release workflow.

**Tech Stack:** Bun, pure ESM, grammY 1.46 + @grammyjs/menu 1.5 + @grammyjs/router 2, @grammyjs/i18n 0.5.1 (YAML, do NOT upgrade), dayjs, Vitest, Earthly + `oven/bun:1`.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-refactor-design.md` (§7 Phase 5 row; **Phase 5 amendments, owner-approved 2026-10-22** — reports design, image-only releases, PR landing, conservative dep sweep). v1 reference (until Task 4 deletes it): `legacy/composers/reports.ts` (the stub).

## Global Constraints

- grammy 1.46.0, @grammyjs/menu 1.5.0, @grammyjs/router 2.0.0, @grammyjs/i18n **0.5.1** (never 1.x — Fluent-only), @grammyjs/runner 2.0.3, @grammyjs/storage-redis 2.6.0. **Task 5 must not touch these pins.** No new dependencies, ever, in this phase.
- `#root/*` import aliases, pure ESM, `.js` suffix on imports.
- Menus: `@grammyjs/menu` only. No raw `InlineKeyboard`, no `bot.callbackQuery`, no manual callback-data parsing (lint-tested). Payload buttons read `ctx.match`.
- No `firefly` client import outside `src/lib/firefly/service.ts` (lint-tested). Firefly types are re-exported from the service.
- Session: one optional field per flow. **Reports uses NO session at all** — all view state lives in button payloads.
- pino via `ctx.logger` only. Handlers return the reply promise. Non-null assertions allowed.
- menu@1.5 traps (project memory, all apply): payload-derived labels need `new Menu(id, { onMenuOutdated: false })` + fixed layout + every button handler-backed. This is exactly the reports nav menu's shape.
- Payload byte budget: callback_data ≤ 64 bytes including the menu prefix. `reports|2026-09-01` ≈ 20 bytes — fine.
- Rich messages: GFM via `ctx.replyWithRichMessage({ markdown }, { reply_markup })` / `ctx.editMessageText({ markdown }, { reply_markup })`. Every user-controlled value (category names, month labels) through `escapeRichMarkdown()`. Blank line before table headers (GFM tables can't interrupt a paragraph). Column headers from `tables.*` locale keys.
- Tests: `createTestBot()` + `setupMockApi()` + `initializeBot()` + `bot.handleUpdate(...)`; click by visible label via `findButton()`; Firefly faked at the service boundary (`createTestFireflyService`) — created ONCE per setup and closed over (project memory: e2e-fake-per-update-factory). Never module-mock.
- Every task: `bunx vitest run` green + `bunx tsc --noEmit` clean + `bun run lint` clean before commit. e2e needs `docker compose -f docker-compose.tests.yaml up -d` first.
- Beads: at execution start, create an epic `Phase 5: reports + cutover` plus one task issue per plan task below, and close each as its task commits.

## Decisions (owner-approved 2026-10-22 — veto at plan review, not mid-execution)

1. **Reports is a monthly summary screen** (owner-approved via design review): one rich message — `📊 <Month>` title, per-currency `Income / Expense / Net` lines (net = income − expense; **transfers excluded** — internal moves aren't spending), expenses-by-category table (per-row currency, sorted descending by amount). No drill-down, no budgets/bills/tags breakdowns — add when asked.
2. **No month-nav clamp** — mirrors categories details nav; a future month renders zeros/empty note. Not a bug.
3. **Totals are per-currency**: the insight endpoints return one row per currency; multi-currency users get one Income/Expense/Net block per currency, in API order. Service returns expense amounts signed-negative as the API does; the render applies signs (`+`/`−` U+2212, `Math.abs` for display).
4. **`insightExpenseCategory` renames to `insightExpenseForCategory`** (id-scoped) to make room for `insightExpenseByCategory` (all categories, with names). Two-call-site diff (categories.menu.ts + fake); prevents a footgun pair of near-identical names.
5. **Cutover release artifact is the image** (owner-approved): no dist tarball — v2 has no build step, Bun runs TS from source; releases are generated notes only. The Earthfile's `+release` drops its tar steps; `node -e` one-liners become `bun -e`.
6. **Landing is a PR to master** (owner-approved), not a direct merge. Merge → `latest` image (existing workflow). Then push tag `v3.0.0` → versioned image + Telegram release notice.
7. **Dependency sweep is conservative**: same-major bumps only (`bun update` of non-grammy deps), `pino-pretty` → devDependencies (loaded only when stdout is a TTY, never in the container), version `3.0.0-rc.0` → `3.0.0`. axios stays 1.x (codegen output pins its usage shape).
8. **CI workflows stay untouched** — they shell out to Earthly targets (`+validatePR`, `+build-and-push`) whose internals change; nothing else in them references npm/node. Verified by grep in Task 6.
9. **Fresh-message nav renders around the current month**: the dynamic menu anchors on `dayjs()` when `ctx.match` is empty/invalid (the hears entry attaches the menu before any payload exists). Categories returned an empty range in that case because "which category?" has no default — "which month?" does: this one.

---

### Task 1: FireflyService insight trio + rename + fake parity

**Files:**
- Modify: `src/lib/firefly/service.ts` (types, interface, impl)
- Modify: `src/bot/features/categories/categories.menu.ts:113` (rename call)
- Modify: `__tests__/helpers/bot.ts` (fake: rename + 3 new methods, 3 new fixture fields)
- Test: `__tests__/helpers/firefly-fake.test.ts`

**Interfaces:**
- Produces (consumed by Task 2):
  - `interface CurrencyTotal { currency: string, amount: number }` — `amount` signed as the API returns it (expenses negative)
  - `interface CategoryExpense { name: string, currency: string, amount: number }` — `amount` is `Math.abs` of the API difference
  - `insightExpenseTotal(start: string, end: string): Promise<CurrencyTotal[]>`
  - `insightIncomeTotal(start: string, end: string): Promise<CurrencyTotal[]>`
  - `insightExpenseByCategory(start: string, end: string): Promise<CategoryExpense[]>`
  - `insightExpenseForCategory(start, end, categoryId)` — renamed from `insightExpenseCategory`, behavior unchanged
  - Fake fixtures: `incomeTotals?: CurrencyTotal[]`, `expenseTotals?: CurrencyTotal[]`, `expenseByCategory?: CategoryExpense[]` (default `[]`)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/helpers/firefly-fake.test.ts` (imports at top already pull `createTestFireflyService`; add nothing else):

```ts
describe('createTestFireflyService insights (fake parity for Phase 5)', () => {
  it('returns fixture-backed totals and category breakdown', async () => {
    const firefly = createTestFireflyService({
      incomeTotals: [{ currency: 'EUR', amount: 4200 }],
      expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
      expenseByCategory: [
        { name: 'Groceries', currency: 'EUR', amount: 612.4 },
        { name: 'Rent', currency: 'EUR', amount: 550 },
      ],
    })
    expect(await firefly.insightIncomeTotal('2026-10-01', '2026-10-31')).toEqual([{ currency: 'EUR', amount: 4200 }])
    expect(await firefly.insightExpenseTotal('2026-10-01', '2026-10-31')).toEqual([{ currency: 'EUR', amount: -2871.35 }])
    expect(await firefly.insightExpenseByCategory('2026-10-01', '2026-10-31')).toEqual([
      { name: 'Groceries', currency: 'EUR', amount: 612.4 },
      { name: 'Rent', currency: 'EUR', amount: 550 },
    ])
  })

  it('defaults to empty arrays when no fixtures given', async () => {
    const firefly = createTestFireflyService()
    expect(await firefly.insightIncomeTotal('s', 'e')).toEqual([])
    expect(await firefly.insightExpenseTotal('s', 'e')).toEqual([])
    expect(await firefly.insightExpenseByCategory('s', 'e')).toEqual([])
  })

  it('id-scoped category insight still works under its new name', async () => {
    const firefly = createTestFireflyService({
      categoryInsights: { 7: [{ currency: 'USD', difference: -45.3 }] },
    })
    expect(await firefly.insightExpenseForCategory('s', 'e', 7)).toEqual([{ currency: 'USD', difference: -45.3 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run __tests__/helpers/firefly-fake.test.ts`
Expected: FAIL — `insightIncomeTotal is not a function` / type errors on unknown fixture fields.

- [ ] **Step 3: Implement service changes**

In `src/lib/firefly/service.ts`:

Add next to `CategoryExpenseSummary` (line ~21):

```ts
export interface CurrencyTotal {
  currency: string
  /** Signed as the API returns it: expenses negative, income positive. */
  amount: number
}

export interface CategoryExpense {
  name: string
  currency: string
  /** Absolute expense amount. */
  amount: number
}
```

In the `FireflyService` interface, rename the existing member and add three:

```ts
  insightExpenseForCategory: (start: string, end: string, categoryId: number) => Promise<CategoryExpenseSummary[]>
  insightExpenseTotal: (start: string, end: string) => Promise<CurrencyTotal[]>
  insightIncomeTotal: (start: string, end: string) => Promise<CurrencyTotal[]>
  insightExpenseByCategory: (start: string, end: string) => Promise<CategoryExpense[]>
```

In `createFireflyService`'s returned object, rename the existing method and add (call shapes mirror the working positional call at the old `insightExpenseCategory` — if `tsc` rejects the positional form for the totals endpoints, switch to their request-object form as declared in `src/lib/firefly/generated/api/insight-api.ts`):

```ts
    async insightExpenseForCategory(start, end, categoryId) {
      const res = await clients().Insight.insightExpenseCategory(start, end, undefined, [categoryId])
      return (res.data ?? []).map(item => ({
        currency: item.currency_code ?? '',
        difference: item.difference_float ?? 0,
      }))
    },
    async insightExpenseTotal(start, end) {
      const res = await clients().Insight.insightExpenseTotal(start, end)
      return toCurrencyTotals(res.data)
    },
    async insightIncomeTotal(start, end) {
      const res = await clients().Insight.insightIncomeTotal(start, end)
      return toCurrencyTotals(res.data)
    },
    async insightExpenseByCategory(start, end) {
      const res = await clients().Insight.insightExpenseCategory(start, end)
      return (res.data ?? []).map(item => ({
        name: item.name ?? '',
        currency: item.currency_code ?? '',
        amount: Math.abs(item.difference_float ?? 0),
      }))
    },
```

Module-level helper (next to `filterActiveAccounts`):

```ts
function toCurrencyTotals(data: InsightTotal | undefined): CurrencyTotal[] {
  return (data ?? []).map(item => ({
    currency: item.currency_code ?? '',
    amount: item.difference_float ?? 0,
  }))
}
```

Import the generated types alongside the others at the top:

```ts
import type { InsightTotal } from '#root/lib/firefly/generated/model/insight-total.js'
```

In `src/bot/features/categories/categories.menu.ts:113` change `ctx.firefly.insightExpenseCategory(start, end, Number(id))` → `ctx.firefly.insightExpenseForCategory(start, end, Number(id))`.

- [ ] **Step 4: Update the fake**

In `__tests__/helpers/bot.ts`:

Fixtures type (near `categoryInsights` at line ~450) — add:

```ts
    incomeTotals?: CurrencyTotal[]
    expenseTotals?: CurrencyTotal[]
    expenseByCategory?: CategoryExpense[]
```

(import the two types from `#root/lib/firefly/service.js` the way `CategoryExpenseSummary` is already imported.)

Fake object (rename the method at line ~556 and add three after it):

```ts
    async insightExpenseForCategory(_start, _end, categoryId) {
      return fixtures.categoryInsights?.[String(categoryId)] ?? []
    },
    async insightExpenseTotal() {
      return fixtures.expenseTotals ?? []
    },
    async insightIncomeTotal() {
      return fixtures.incomeTotals ?? []
    },
    async insightExpenseByCategory() {
      return fixtures.expenseByCategory ?? []
    },
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bunx vitest run` and `bunx tsc --noEmit` and `bun run lint`
Expected: all green (the categories feature's own tests confirm the rename didn't break it).

Then confirm no stragglers: `grep -rn "insightExpenseCategory\b" src/ __tests__/` — only `generated/` and the new `insightExpenseByCategory`/`insightExpenseForCategory` may match.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firefly/service.ts src/bot/features/categories/categories.menu.ts __tests__/helpers/bot.ts __tests__/helpers/firefly-fake.test.ts
git commit -m "feat(v2): firefly service insight totals + all-categories expense (id-scoped one renamed)"
```

---

### Task 2: Reports feature — locales, menu, render, entry, mount

**Files:**
- Create: `src/bot/features/reports/index.ts`
- Create: `src/bot/features/reports/report.menu.ts`
- Modify: `src/bot/index.ts` (mount; imports at lines 9–14, `use` chain at 64–70)
- Modify: `locales/en.yaml`, `locales/es.yaml`, `locales/it.yaml`, `locales/ru.yaml`
- Test: `__tests__/features/reports/reports.test.ts`

**Interfaces:**
- Consumes: Task 1's `CurrencyTotal`, `CategoryExpense`, and the three insight methods.
- Produces: `reportsFeature` (Composer) mounted in `createBot`; `showCurrentReport(ctx)`; `reportsMenu` (Menu id `'reports'`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/features/reports/reports.test.ts`:

```ts
import dayjs from 'dayjs'
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
} from '../../helpers/bot.js'

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

const MONTH_FIXTURES = {
  incomeTotals: [{ currency: 'EUR', amount: 4200 }],
  expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
  expenseByCategory: [
    { name: 'Rent', currency: 'EUR', amount: 550 },
    { name: 'Groceries', currency: 'EUR', amount: 612.4 },
  ],
} satisfies Parameters<typeof createTestFireflyService>[0]

async function setup(fixtures: Parameters<typeof createTestFireflyService>[0] = MONTH_FIXTURES) {
  // ONE fake closed over for the whole test (project memory: the bot calls
  // deps.firefly(settings) per update — an inline factory would reset state)
  const firefly = createTestFireflyService(fixtures)
  const { bot } = createTestBot({ settings: CONFIGURED, firefly })
  const api = setupMockApi(bot)
  await initializeBot(bot)
  const click = async (label: string) => {
    const btn = findButton(api.getOutgoingRequests(), label)
    if (!btn)
      throw new Error(`button not found: ${label}`)
    await bot.handleUpdate(generateCallbackQueryUpdate(btn.data, { messageId: btn.messageId }))
  }
  const reports = () => bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.REPORTS')))
  return { bot, api, click, reports }
}

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

describe('reports feature', () => {
  it('renders the current-month summary with a descending category table', async () => {
    const { api, reports } = await setup()
    await reports()
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(dayjs()))
    expect(md).toContain('+4200.00 EUR')
    expect(md).toContain('−2871.35 EUR') // U+2212 minus
    expect(md).toContain('+1328.65 EUR') // net = 4200 − 2871.35
    // table headers from shared keys
    expect(md).toContain(i18n.t('en', 'tables.category'))
    expect(md).toContain(i18n.t('en', 'tables.amount'))
    // descending by amount: Groceries (612.40) before Rent (550.00)
    expect(md.indexOf('Groceries')).toBeLessThan(md.indexOf('Rent'))
  })

  it('attaches prev/next month nav and navigates statelessly', async () => {
    const { api, click, reports } = await setup()
    await reports()
    const prev = dayjs().subtract(1, 'month')
    await click(`<< ${monthLabel(prev)}`)
    const edits = api.getOutgoingRequests().filter(r => r.method === 'editMessageText')
    expect(edits).toHaveLength(1)
    // the nav behavior under test: the message re-rendered for the PREVIOUS month
    // (the fake's insight fixtures are date-blind, so amounts repeat — only the
    // label proves the anchor moved)
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(prev))
    expect(md).not.toContain(monthLabel(dayjs()))
  })

  it('renders one Income/Expense/Net block per currency', async () => {
    const { api, reports } = await setup({
      incomeTotals: [
        { currency: 'EUR', amount: 100 },
        { currency: 'USD', amount: 50 },
      ],
      expenseTotals: [{ currency: 'EUR', amount: -30 }],
      expenseByCategory: [],
    })
    await reports()
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain('+100.00 EUR')
    expect(md).toContain('+70.00 EUR') // EUR net
    expect(md).toContain('+50.00 USD') // USD income and net are both +50 (no USD expenses)
    // no category rows → no table
    expect(md).not.toContain(`| ${i18n.t('en', 'tables.category')}`)
  })

  it('fully empty month renders the empty note', async () => {
    const { api, reports } = await setup({ incomeTotals: [], expenseTotals: [], expenseByCategory: [] })
    await reports()
    const md = getLastRichMarkdown(api.getOutgoingRequests())!
    expect(md).toContain(monthLabel(dayjs()))
    expect(md).toContain(i18n.t('en', 'reports.empty'))
  })

  it('gate: unconfigured user gets the settings prompt, not a report', async () => {
    const firefly = createTestFireflyService(MONTH_FIXTURES)
    const { bot } = createTestBot({ firefly }) // no settings seeded → unconfigured
    const api = setupMockApi(bot)
    await initializeBot(bot)
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.REPORTS')))
    const send = api.getOutgoingRequests().find(r => r.method === 'sendMessage')!
    expect((send.payload as any).text).toContain('Firefly URL')
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run __tests__/features/reports/reports.test.ts`
Expected: FAIL — `labels.REPORTS` falls through to unhandled; no rich message recorded.

- [ ] **Step 3: Add locale keys (all four locales)**

`locales/en.yaml` — extend the `tables:` block and add a `reports:` block (top level, near `settings:`):

```yaml
tables:
  # ...existing keys...
  category: Category

reports:
  title: '📊 %{monthName}'
  income: 'Income: %{amount}'
  expense: 'Expense: %{amount}'
  net: 'Net: %{amount}'
  empty: 'Nothing this month.'
```

`locales/es.yaml`:

```yaml
tables:
  category: Categoría

reports:
  title: '📊 %{monthName}'
  income: 'Ingresos: %{amount}'
  expense: 'Gastos: %{amount}'
  net: 'Neto: %{amount}'
  empty: 'Nada este mes.'
```

`locales/it.yaml`:

```yaml
tables:
  category: Categoria

reports:
  title: '📊 %{monthName}'
  income: 'Entrate: %{amount}'
  expense: 'Uscite: %{amount}'
  net: 'Netto: %{amount}'
  empty: 'Niente questo mese.'
```

`locales/ru.yaml`:

```yaml
tables:
  category: Категория

reports:
  title: '📊 %{monthName}'
  income: 'Доход: %{amount}'
  expense: 'Расход: %{amount}'
  net: 'Итог: %{amount}'
  empty: 'В этом месяце ничего нет.'
```

(Merge into the existing `tables:` blocks — do not create duplicates. es-gap lesson from Phase 4: all four locales get every key in the same commit.)

- [ ] **Step 4: Implement the menu + render**

Create `src/bot/features/reports/report.menu.ts`:

```ts
import type { Context } from '#root/bot/context.js'
import dayjs from 'dayjs'
import { Menu, MenuRange } from '@grammyjs/menu'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'
import type { CategoryExpense, CurrencyTotal } from '#root/lib/firefly/service.js'

// Local 2-liner, same as categories.menu.ts — extracting a shared month-label
// helper for two users is not worth a new module.
function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

function money(amount: number, currency: string): string {
  return `${Math.abs(amount).toFixed(2)} ${currency}`
}

function parseAnchor(match: unknown): dayjs.Dayjs {
  const d = typeof match === 'string' ? dayjs(match) : undefined
  return d?.isValid() ? d : dayjs()
}

// Stateless month nav — categories details pattern: the payload carries the
// whole view state (`YYYY-MM-DD` month anchor), labels derive from ctx.match →
// onMenuOutdated: false + fixed layout + every button handler-backed.
// Hears-entry attach renders with no payload → parseAnchor falls back to the
// current month, so the fresh message gets a nav row too.
export const reportsMenu = new Menu<Context>('reports', { onMenuOutdated: false })
  .dynamic((ctx) => {
    const anchor = parseAnchor(ctx.match)
    const prev = anchor.subtract(1, 'month')
    const next = anchor.add(1, 'month')
    return new MenuRange<Context>()
      .text({ text: () => `<< ${monthLabel(prev)}`, payload: prev.format('YYYY-MM-DD') }, showReportFor)
      .text({ text: () => `${monthLabel(next)} >>`, payload: next.format('YYYY-MM-DD') }, showReportFor)
  })

export async function showCurrentReport(ctx: Context) {
  const markdown = await reportMarkdown(ctx, dayjs())
  await ctx.replyWithRichMessage({ markdown }, { reply_markup: reportsMenu })
}

async function showReportFor(ctx: Context) {
  const markdown = await reportMarkdown(ctx, parseAnchor(ctx.match))
  await ctx.editMessageText({ markdown }, { reply_markup: reportsMenu })
}

async function reportMarkdown(ctx: Context, anchor: dayjs.Dayjs): Promise<string> {
  const start = anchor.startOf('month').format('YYYY-MM-DD')
  const end = anchor.endOf('month').format('YYYY-MM-DD')
  const [expenseTotals, incomeTotals, byCategory] = await Promise.all([
    ctx.firefly.insightExpenseTotal(start, end),
    ctx.firefly.insightIncomeTotal(start, end),
    ctx.firefly.insightExpenseByCategory(start, end),
  ])

  const lines = [ctx.i18n.t('reports.title', { monthName: escapeRichMarkdown(monthLabel(anchor)) })]
  const currencies = [...new Set([...incomeTotals, ...expenseTotals].map(t => t.currency))]

  if (!currencies.length) {
    lines.push('', ctx.i18n.t('reports.empty'))
    return lines.join('\n')
  }

  // One block per currency; expense amounts arrive signed-negative from the API.
  for (const currency of currencies) {
    const income = incomeTotals.find(t => t.currency === currency)?.amount ?? 0
    const expense = expenseTotals.find(t => t.currency === currency)?.amount ?? 0
    const net = income + expense
    lines.push(
      '',
      ctx.i18n.t('reports.income', { amount: `+${money(income, currency)}` }),
      ctx.i18n.t('reports.expense', { amount: `−${money(expense, currency)}` }),
      ctx.i18n.t('reports.net', { amount: `${net >= 0 ? '+' : '−'}${money(net, currency)}` }),
    )
  }

  if (byCategory.length) {
    const rows = [...byCategory]
      .sort((a, b) => b.amount - a.amount)
      .map(c => [escapeRichMarkdown(c.name), money(c.amount, c.currency)])
    // leading \n = blank line before the table (GFM tables can't interrupt a paragraph)
    lines.push(`\n${markdownTable(
      [ctx.i18n.t('tables.category'), ctx.i18n.t('tables.amount')],
      rows,
      ['left', 'right'],
    )}`)
  }
  return lines.join('\n')
}
```

If `markdownTable`'s real signature differs (check `src/bot/helpers/rich.ts:18` first — alignment array may not be a parameter), match the categories call site at `categories.menu.ts:144-148` verbatim instead.

- [ ] **Step 5: Feature entry + mount**

Create `src/bot/features/reports/index.ts`:

```ts
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'
import { i18n, locales } from '#root/bot/i18n.js'
import { reportsMenu, showCurrentReport } from './report.menu.js'

export const reportsFeature = new Composer<Context>()

reportsFeature.use(reportsMenu)
for (const locale of locales) {
  reportsFeature.hears(i18n.t(locale, 'labels.REPORTS'), async ctx => showCurrentReport(ctx))
}
```

In `src/bot/index.ts`: add `import { reportsFeature } from '#root/bot/features/reports/index.js'` with the other feature imports (lines 9–14), and `protectedBot.use(reportsFeature)` **after** `transactionsFeature`, **before** `unhandledFeature` (order is load-bearing — unhandled must stay last).

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `bunx vitest run` and `bunx tsc --noEmit` and `bun run lint`
Expected: all green, including the new five tests.

- [ ] **Step 7: Commit**

```bash
git add src/bot/features/reports/ src/bot/index.ts locales/ __tests__/features/reports/
git commit -m "feat(v2): reports — monthly summary (per-currency totals + category table), stateless month nav"
```

---

### Task 3: Reports e2e (real Redis)

**Files:**
- Test: `__tests__/e2e/reports.test.ts`

**Interfaces:**
- Consumes: Task 1 fixtures (`incomeTotals`/`expenseTotals`/`expenseByCategory`), Task 2 feature.

- [ ] **Step 1: Write the e2e test**

Create `__tests__/e2e/reports.test.ts` — same structure as `__tests__/e2e/accounts-categories.test.ts` (redis probe, `CONFIGURED`, `makeBot`, `click`), with report fixtures:

```ts
import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import { createBot } from '#root/bot/index.js'
import { redis } from '#root/lib/redis.js'
import { createSessionStorage } from '#root/lib/session.js'
import { createMemorySettingsStore, defaultSettings } from '#root/lib/settings-store.js'
import {
  createTestConfig,
  createTestFireflyService,
  createTestLogger,
  findButton,
  generateCallbackQueryUpdate,
  generateMessageUpdate,
  initializeBot,
  setupMockApi,
} from '../helpers/bot.js'

// e2e/setup.ts may already have connected this shared instance — ioredis
// rejects a second connect() while connected, so only connect when needed.
const available = await (async () => {
  try {
    if (redis.status !== 'ready')
      await redis.connect()
    await redis.ping()
    return true
  }
  catch {
    return false
  }
})()

const CONFIGURED = defaultSettings({
  fireflyUrl: 'https://ff.example.com',
  fireflyApiUrl: 'https://ff.example.com/api',
  fireflyAccessToken: 'x'.repeat(500),
})

function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, c => c.toLocaleUpperCase())
}

async function makeBot() {
  const config = createTestConfig()
  // ONE fake for the bot's lifetime — deps.firefly(settings) runs per update;
  // an inline factory would reset fixtures between updates (project memory)
  const firefly = createTestFireflyService({
    incomeTotals: [{ currency: 'EUR', amount: 4200 }],
    expenseTotals: [{ currency: 'EUR', amount: -2871.35 }],
    expenseByCategory: [
      { name: 'Groceries', currency: 'EUR', amount: 612.4 },
      { name: 'Rent', currency: 'EUR', amount: 550 },
    ],
  })
  const bot = createBot(config.botToken, {
    config,
    logger: createTestLogger(),
    settingsStore: createMemorySettingsStore({ 1111111: CONFIGURED }),
    firefly: () => firefly,
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

describe.skipIf(!available)('reports (e2e, real redis)', () => {
  it('REPORTS label renders the summary; month nav round-trips without session', async () => {
    const { bot, api, click } = await makeBot()
    await bot.handleUpdate(generateMessageUpdate(i18n.t('en', 'labels.REPORTS')))
    expect(api.getOutgoingRequests().some(r => r.method === 'sendRichMessage')).toBe(true)
    const prev = dayjs().subtract(1, 'month')
    await click(`<< ${monthLabel(prev)}`)
    const edit = api.getOutgoingRequests().filter(r => r.method === 'editMessageText').at(-1)!
    expect((edit.payload as any).rich_message?.markdown).toContain(monthLabel(prev))
    expect((edit.payload as any).rich_message?.markdown).not.toContain(monthLabel(dayjs()))
  })
})
```

- [ ] **Step 2: Run e2e**

Run: `docker compose -f docker-compose.tests.yaml up -d && bun run test:e2e`
Expected: PASS — reports e2e green alongside the existing suites.

- [ ] **Step 3: Commit**

```bash
git add __tests__/e2e/reports.test.ts
git commit -m "test(v2): reports e2e against real redis sessions"
```

---

### Task 4: Delete `legacy/` + scrub live docs

**Files:**
- Delete: `legacy/` (whole tree)
- Modify: `CLAUDE.md` (drop the legacy bullet), `AGENTS.md` is a symlink to it — no separate edit
- Verify: no live references remain

**Interfaces:** none — pure deletion.

- [ ] **Step 1: Delete and scrub**

```bash
git rm -r legacy/
```

In `CLAUDE.md`, delete the line: `- **\`legacy/\`** is v1 reference code: never import, never edit.` (last bullet of Architecture).

- [ ] **Step 2: Verify nothing live references it**

Run: `grep -rn "from '.*legacy\|import(.*)legacy\|require(.*)legacy" src/ __tests__/ scripts/` → no matches. (`docs/` — plans/specs — keeps its historical mentions; those are records, not code.)

Run: `bunx vitest run` and `bunx tsc --noEmit` and `bun run lint`
Expected: all green (architecture lint tests never imported legacy, only checked src/).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(v2): delete legacy/ — v1 reference served the port, spec §7 Phase 5"
```

---

### Task 5: Dependency sweep + pino-pretty → dev + version 3.0.0 + README

**Files:**
- Modify: `package.json` (version, dep moves, bumps), `bun.lock` (regenerated)
- Modify: `README.md`

**Interfaces:** none — versions only; no API changes.

- [ ] **Step 1: Move pino-pretty, bump version and deps**

Edit `package.json`: version `"3.0.0"`; move `"pino-pretty": "13.1.3"` from `dependencies` to `devDependencies`. Then:

```bash
bun update axios dayjs ioredis pino valibot vitest typescript eslint @antfu/eslint-config @types/bun @openapitools/openapi-generator-cli
```

Same-major bumps only. **Do NOT run a bare `bun update`** — it would move the grammy family past the pinned versions (Global Constraints). After the update, verify pins survived:

```bash
git diff package.json | grep -E "grammy|grammY"   # expect: no changes to grammy/@grammyjs lines
```

- [ ] **Step 2: Full gates**

Run: `docker compose -f docker-compose.tests.yaml up -d` (if not up), then `bunx tsc --noEmit && bun run lint && bunx vitest run && bun run test:e2e`
Expected: all green on the bumped versions. If a bump breaks something (new eslint rules flagging code, valibot API), pin that dep back to the last working version rather than adapting code — the sweep is versions, not migrations. Note any pin-backs in the commit message.

- [ ] **Step 3: README refresh**

In `README.md`:
- Manual setup: `npm install` → `bun install`; `npm start` → `bun run start`; add "Bun ≥ 1" to prerequisites, drop the node/npm prerequisite wording.
- Docker section: the image runs `bun ./src/main.ts` from source (no `dist/`); usage/env vars unchanged.
- Development section: commands are the bun ones from CLAUDE.md (`bun run dev`, `bunx vitest run`, `bun run test:e2e`, `bun run codegen`).
- Codegen section: `npm run codegen` → `bun run codegen`.
- Remove/adjust any "Known bugs" entries the v2 port fixed (SHOW_TRANSFERS filter, duplicate settings gate) — check each against the v2 code before deleting the line; keep genuinely still-true items.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock README.md
git commit -m "chore(v2): cutover dep sweep (same-major), pino-pretty to dev, v3.0.0"
```

---

### Task 6: Earthfile → Bun (image runs TS from source)

**Files:**
- Modify: `Earthfile` (full rewrite below)
- Verify: `.github/workflows/*.yml` need no changes

**Interfaces:** Earthly targets keep their names (`+validatePR`, `+buildImage`, `+build-and-push`, `+build-latest`, `+build-and-release`, `+release`, `+deps`, `+runTests`) — CI depends on them.

- [ ] **Step 1: Verify CI has no npm/node references**

Run: `grep -n "npm\|node\|dist" .github/workflows/*.yml`
Expected: no hits (they only call Earthly targets). If any hit appears, update that line to the bun equivalent.

- [ ] **Step 2: Rewrite the Earthfile**

Replace the file content with (targets whose bodies are unchanged from v1 are marked):

```earthfile
VERSION 0.7

ARG --global GHCR_REPO=ghcr.io/cyxou/firefly-iii-telegram-bot
ARG --global GHCR_USERNAME
ARG --global GHCR_TOKEN
ARG --global RELEASE_VERSION=latest

FROM oven/bun:1

WORKDIR /app

build-and-release:
    BUILD --platform=linux/amd64 --platform=linux/arm +buildImage --TAG_LATEST=true
    BUILD +release

build-and-push:
    BUILD --platform=linux/amd64 --platform=linux/arm +buildImage

build-latest:
    BUILD --platform=linux/amd64 --platform=linux/arm +buildImage --RELEASE_VERSION=latest

validatePR:
    BUILD +runTests
    BUILD +buildImage

deps:
    COPY package.json bun.lock .npmrc ./
    RUN bun install --production --frozen-lockfile \
        && mv ./node_modules ./node_modules_prod \
        && bun install --frozen-lockfile

    SAVE ARTIFACT package.json AS LOCAL ./package.json
    SAVE ARTIFACT bun.lock AS LOCAL ./bun.lock
    SAVE ARTIFACT node_modules /node_modules AS LOCAL ./node_modules
    SAVE ARTIFACT node_modules_prod /node_modules_prod AS LOCAL ./node_modules_prod

runTests:
    COPY +deps/node_modules ./node_modules
    COPY package.json bun.lock tsconfig.json vitest.config.ts eslint.config.js .npmrc ./
    COPY --dir src __tests__ locales scripts ./

    RUN bunx tsc --noEmit && bun run lint && bunx vitest run

# v2 runs TypeScript from source — no build/dist step exists (spec amendment 2).
# locales/ ships in the image: i18n resolves it relative to src/bot (src/bot/i18n.ts).
buildImage:
    ARG TAG_LATEST=false
    COPY +deps/node_modules_prod ./node_modules
    COPY package.json bun.lock ./
    COPY --dir src locales ./

    CMD ["bun", "run", "./src/main.ts"]

    SAVE IMAGE --push $GHCR_REPO:$RELEASE_VERSION
    IF [ "$TAG_LATEST" = "true" ]
        SAVE IMAGE --push $GHCR_REPO:latest
    END

checkIfTagExist:
    FROM earthly/dind

    RUN echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

    IF docker manifest inspect ${GHCR_REPO}:${RELEASE_VERSION} > /dev/null
        RUN echo "👷 Docker image with tag ${RELEASE_VERSION} already exists! You should not override it. Please increment the app version number accordingly. Exiting..." \
            && exit 1
    END

# Release = generated notes only; the GHCR image is the artifact (spec amendment 2).
release:
  ARG --required GHCR_TOKEN
  ARG --required RELEASE_VERSION
  ENV GITHUB_TOKEN=${GHCR_TOKEN}
  ENV REPO="cyxou/firefly-iii-telegram-bot"

  # Install gh-cli
  RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
      && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
      && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
      && apt-get update && apt-get install gh -y \
      && gh --version

  # Generate release notes
  RUN gh api -X POST "repos/${REPO}/releases/generate-notes" \
        -F commitish=${RELEASE_VERSION} \
        -F tag_name=${RELEASE_VERSION} \
      > tmp-release-notes.json

  # Create release
  # ponytail: bun -e one-liners instead of jq — jq 404s from the security pool (v1 hit this on bullseye)
  RUN bun -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("tmp-release-notes.json","utf8"));fs.writeFileSync("tmp-release-notes.md",j.body)' \
      && gh release create ${RELEASE_VERSION} \
        --repo ${REPO} \
        --title "$(bun -e 'const j=JSON.parse(require("fs").readFileSync("tmp-release-notes.json","utf8"));console.log(j.name)')" \
        --notes-file tmp-release-notes.md \
        --verify-tag
```

- [ ] **Step 3: Validate locally if Earthly is available**

Run: `command -v earthly && earthly +validatePR --GHCR_REPO=ghcr.io/cyxou/firefly-iii-telegram-bot --GHCR_USERNAME=local --GHCR_TOKEN=unused` (validatePR's `+buildImage` step will fail at the image PUSH with dummy creds — the point is watching `+runTests` and the image build succeed up to the push).
If Earthly is not installed locally: state that in the commit/PR notes and rely on the PR workflow's `+validatePR` run as the gate — do not claim local validation.

- [ ] **Step 4: Commit**

```bash
git add Earthfile
git commit -m "build(v2): Earthfile on oven/bun — runs TS from source, real test gate, image-only releases"
```

---

### Task 7: Final gates, PR to master, release tag

**Files:** none created — verification and landing.

- [ ] **Step 1: Full local gate**

Run: `docker compose -f docker-compose.tests.yaml up -d && bunx tsc --noEmit && bun run lint && bunx vitest run && bun run test:e2e`
Expected: everything green. Paste the tail of each run into the PR body (evidence, not assertion).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/major-refactoring
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --title "v2: major refactoring — reports + cutover (3.0.0)" --body "$(cat <<'EOF'
## Summary
v2 rewrite, complete: grammY 1.46 + @grammyjs/menu on Bun/ESM, Redis sessions,
settings store, accounts/categories/transactions (add/list/edit/delete) with
rich GFM tables, the new reports monthly summary, and the cutover — legacy/
deleted, Earthfile on oven/bun running TS from source, image-only releases.

Phases 0–5 planned and tracked in docs/superpowers/plans/; spec amendments in
docs/superpowers/specs/2026-10-21-v2-refactor-design.md.

## Verification
- `bunx tsc --noEmit` ✅
- `bun run lint` ✅
- `bunx vitest run` ✅ (N tests)
- `bun run test:e2e` ✅ (real Redis)
- Earthly `+validatePR` (this PR's workflow) — watch the run

## Release
After merge: push tag `v3.0.0` → release workflow builds the versioned image
and posts the Telegram notice. Merge itself ships `latest`.
EOF
)"
```

(Replace `N` with the real test count from Step 1. Earthly line: keep only what actually ran, per Step 3 of Task 6.)

- [ ] **Step 4: Post-merge release tag (after the human merges the PR)**

```bash
git checkout master && git pull && git tag v3.0.0 && git push origin v3.0.0
```

This triggers `.github/workflows/release.yml` → `+build-and-release` → versioned image + `latest` + generated release notes + Telegram notification. Confirm the workflow run goes green; the tag step is the last action of Phase 5.

- [ ] **Step 5: Close the beads epic**

Close the `Phase 5: reports + cutover` epic once the tag workflow is green.

---

## Self-review notes

- Spec coverage: §7 Phase 5 row → Tasks 4 (legacy delete), 5 (version bump, dep sweep per amendment 4), 6 (Docker→Bun, Earthfile/CI); amendment 1 (reports) → Tasks 1–3; amendments 2–3 (image-only release, PR landing, tag) → Tasks 6–7. Mapper/old-date-picker deletion is subsumed by `git rm -r legacy/` (both live under it — verified: `legacy/lib/Mapper.ts`, `legacy/lib/menu-date-picker/`).
- Placeholder audit: every code step carries complete runnable content; no TBD/TODO/fill-in steps remain.
- Type consistency: `CurrencyTotal`/`CategoryExpense` field names (`currency`, `amount`, `name`) match between service (Task 1), fake fixtures (Task 1), render (Task 2), and tests (Tasks 1–3). Menu id `'reports'`, method names `showCurrentReport`/`showReportFor`/`reportMarkdown` consistent across Task 2's files.
- Known execution risks, with the check baked into the step: (a) generated client call shapes for the two totals endpoints (Task 1 Step 3 notes the fallback to request-object form); (b) `markdownTable` alignment parameter (Task 2 Step 4 defers to the categories call site); (c) Earthly absent locally (Task 6 Step 3's honesty clause).
```
