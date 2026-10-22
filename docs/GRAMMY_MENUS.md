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
- menu@1.5 staleness detection hashes button **labels** into `callback_data`. If a
  menu's labels derive from `ctx.match` (e.g. month-nav), every payload click
  re-renders different labels → hash self-invalidates → "Menu was outdated" toast,
  handler never runs. Fix: `new Menu(id, { onMenuOutdated: false })` — only for
  menus with a fixed layout where every button has a handler.
- In a match-dependent dynamic, EVERY button must carry the state payload. A
  payload-less button leaves `ctx.match` empty at click; an `if (!id) return empty`
  guard then crashes the menu lib reading the button position
  (`categories.menu.ts` details menu is the reference for both rules).

## Attach / edit rules

- Plain handlers attach a menu explicitly: `ctx.replyWithRichMessage({ markdown }, { reply_markup: menu })`
  or `ctx.editMessageText({ markdown }, { reply_markup: menu })`. Passing the `Menu`
  instance as `reply_markup` is correct here — the lib renders it at call time.
- `.back()` / `.submenu()` middleware must NOT pass `reply_markup` — the menu lib's
  nav installer injects the target menu into markup-less edits and then skips its own
  trailing edit; an explicit markup causes a redundant render → Telegram 400
  "message is not modified" (see commit 59a40d2).
- `ctx.menu.update()` re-renders the current menu only (keyboard edit) — safe on rich
  messages. menu@1.5: it is lazy and returns void, no `await`.

## Stateless calendar (payload-encoded view state)

When a menu's entire view can be encoded in ≤64 bytes, put the view in the
payloads instead of the session: every navigation button carries the state it
navigates TO (`<trId>|m|<YYYY-MM>`), the dynamic render decodes `ctx.match`,
and handlers re-render via `ctx.menu.update()` / `ctx.menu.nav()`. The menu
needs `onMenuOutdated: false` (labels derive from `ctx.match`, so a payload
click always self-invalidates the staleness hash). Session bugs of the v1
`datePickerState` class (stale pin, TTL loss, cross-flow re-pointing) are
unreachable by construction. See `src/lib/date-picker/` +
`features/transactions/edit.menu.ts` (`edit-date`).

menu@1.5 rules this pattern must obey (learned the hard way):

- A payload click re-renders the SAME menu with `ctx.match` = payload, then runs
  the handler at the clicked `[row][col]` of the RE-RENDERED layout — baked
  closures at the original position do not run. Every payload must therefore
  re-render a position-stable layout.
- **Different view shapes need different menus**: month and year views live in
  `edit-date` / `edit-year`. A payload that changed the view shape within one
  menu would land the click on an unrelated button (a year pick at `[2][c]` is a
  *day* button in the month layout — it would silently change the date).
  View switches ride grammy navigation instead: the month label is a `.submenu()`
  into the year menu, year picks `ctx.menu.nav('edit-date')` back.
- EVERY button carries a payload — including noop weekday-header and blank-grid
  cells. A payload-less click re-renders with empty `ctx.match`, the dynamic
  returns an empty range, and menu.js crashes reading the missing position.

## Rich list rendering

- Tabular data renders as GFM markdown via `markdownTable()` (`bot/helpers/rich.ts`):
  localized column headers come from the shared `tables.*` locale keys; cells escape
  themselves; prose interpolations go through `escapeRichMarkdown()`.
- **A GFM table cannot interrupt a paragraph**: the header row must be preceded by a
  blank line or Telegram renders the pipes as literal text (live bug, beads 8wh).
  The call sites wrap every `markdownTable()` string in `\n…\n` — folded-YAML
  templates only carry one blank line, which folds to a single `\n` and is NOT
  enough. The mock harness structurally validates every rich send
  (`__tests__/helpers/rich-validate.ts`) and fails the offending test in a global
  afterEach — new GFM gotchas get added to `validateRichMarkdown()`, not to
  per-test assertions.
- `accounts.list.*` / `categories.transactionsList` locale values interpolate
  `${accounts}`/`${transactions}` = the rendered table string, plus `${sums}`.
- The message and the keyboard are independent: rich payload via `rich_message`,
  menu via `reply_markup`, on both `sendRichMessage` and `editMessageText`.

## List views & pagination (the standard)

Per-list view state lives in `session.lists.<name> = { page: number, view?: string, date?: string }`
(`accounts` uses `view` for the account-type tab; `transactions` adds `date` for
day navigation). The transactions add-flow picker pages client-side instead:
`txnFlow.categoryPage` + prev/next handlers that mutate it and `ctx.menu.update()`
— page state that belongs to a flow lives in the flow's own session field, not
in `lists`. Lists stay single-fetch (v1 ceilings, `ponytail:`-noted): prev/next
on a list navigates days (transactions) or re-fetches the page counter (future).

- Tab bars show every view with the active one `.disabled()` (menu@1.5; on the wire
  the flag is an empty OBJECT `disabled: {}`, not `true`); destructive
  confirmations style their YES button `.danger()`.
- A tab bar inside a Menu MUST be session-driven (`accounts`, `transactions-list`):
  menu@1.5 re-renders at click time and requires the clicked position to land on
  a handler-backed button — a `ctx.match`-driven render promotes the clicked tab
  to the disabled active tab at that position and throws "Cannot invoke handlers
  … outdated", even with `onMenuOutdated: false`.
- Views that fit in a payload stay stateless when EVERY button stays
  handler-backed across re-renders: the category details view carries
  `'{id}|{YYYY-MM-DD}'` in prev/next payloads and re-reads `ctx.match` at render —
  zero session, TTL-proof. Prefer this whenever the state is ≤ 64 bytes.

## Testing

- Click buttons by visible label (`findButton`), replay real `callback_data` via
  `generateCallbackQueryUpdate`; assert on recorded API payloads
  (`getLastRichMarkdown`, raw `reply_markup.inline_keyboard`).
- The mock harness treats `sendRichMessage` like a text send: it gets a message id
  and can be edited later; editing a media message still throws like Telegram.
- When a fake's method must be spied on, WRAP it (`{ ...fake, async m(...x) { record(); return fake.m(...x) } }`)
  — an overrides-based shadow silently removes the fake's mutating behavior and
  breaks every re-render assertion that depends on it.
