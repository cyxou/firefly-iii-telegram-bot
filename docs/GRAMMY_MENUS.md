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

- Tab bars show every view with the active one `.disabled()` (menu@1.5; on the wire
  the flag is an empty OBJECT `disabled: {}`, not `true`); destructive
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
- When a fake's method must be spied on, WRAP it (`{ ...fake, async m(...x) { record(); return fake.m(...x) } }`)
  — an overrides-based shadow silently removes the fake's mutating behavior and
  breaks every re-render assertion that depends on it.
