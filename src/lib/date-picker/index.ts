import type { MenuRange } from '@grammyjs/menu'
// Stateless rebuild of v1's 447-line session-coupled MenuDatePicker: no
// datePickerState in session, no raw dp_ callback parsing — every button's
// payload carries the full view state, so the host menus render from ctx.match
// alone (the categories month-view pattern). Month/weekday names come from
// dayjs's global locale (set per-update by bot/middlewares/locale.ts).
//
// menu@1.5 contract this is built around: a payload click re-renders the SAME
// menu with ctx.match = payload, then runs the handler at the clicked
// [row][col] of the RE-RENDERED layout. Month and year views therefore live in
// SEPARATE host menus (a payload that switches view shape would land the click
// on an unrelated button), and view switches use grammy's own navigation
// (submenu / ctx.menu.nav) instead of position-mapped handlers. Every button
// carries a payload — a payload-less click re-renders an empty range and
// crashes menu.js.
import type { Context } from 'grammy'
import dayjs from 'dayjs'

export interface DatePickerView { mode: 'month' | 'year', year: number, month: number } // month 0-11

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

export interface DatePickerHandlers<C extends Context> {
  /** a day button — receives the picked YYYY-MM-DD */
  onDate: (ctx: C, date: string) => unknown
  /** month-view back button (v1: back to the record) */
  onBack: (ctx: C) => unknown
  backLabel: string
}

/** Month-view grid into `range`; the month label opens `yearMenuId` (submenu). */
export function appendDatePicker<C extends Context>(
  range: MenuRange<C>,
  trId: string,
  view: DatePickerView,
  yearMenuId: string,
  handlers: DatePickerHandlers<C>,
): void {
  const current = dayjs().year(view.year).month(view.month)
  const prev = current.subtract(1, 'month')
  const next = current.add(1, 'month')
  const now = encodeViewPayload(trId, { mode: 'month', year: view.year, month: view.month })
  range.row()
    .text({ text: '‹', payload: encodeViewPayload(trId, { mode: 'month', year: prev.year(), month: prev.month() }) }, ctx => ctx.menu.update())
    .submenu({ text: current.format('MMMM YYYY'), payload: encodeViewPayload(trId, { mode: 'year', year: view.year, month: view.month }) }, yearMenuId)
    .text({ text: '›', payload: encodeViewPayload(trId, { mode: 'month', year: next.year(), month: next.month() }) }, ctx => ctx.menu.update())
  // weekday header (Monday-first; v1 rendered these as noop buttons)
  range.row()
  for (let i = 0; i < 7; i++)
    range.text({ text: dayjs().day((i + 1) % 7).format('dd'), payload: now }, () => {})
  // day grid; today renders as 'N*' (v1)
  const blanks = leadingBlanks(view.year, view.month)
  const days = current.daysInMonth()
  const today = dayjs().format('YYYY-MM-DD')
  for (let weekStart = 1 - blanks; weekStart <= days; weekStart += 7) {
    range.row()
    for (let d = weekStart; d < weekStart + 7; d++) {
      if (d < 1 || d > days) {
        range.text({ text: ' ', payload: now }, () => {}) // blank cell (v1)
      }
      else {
        const date = current.date(d).format('YYYY-MM-DD')
        const label = date === today ? `${d}*` : String(d)
        range.text({ text: label, payload: encodeDatePayload(trId, date) }, ctx => handlers.onDate(ctx, date))
      }
    }
  }
  range.row().text({ text: handlers.backLabel, payload: now }, ctx => handlers.onBack(ctx))
}

/** Year-view decade grid into `range`; picks/back nav to `monthMenuId`. */
export function appendYearPicker<C extends Context>(
  range: MenuRange<C>,
  trId: string,
  view: DatePickerView,
  monthMenuId: string,
  backLabel: string,
): void {
  const start = Math.floor(view.year / 10) * 10
  const now = encodeViewPayload(trId, { mode: 'year', year: view.year, month: view.month })
  const toMonth = (year: number) => encodeViewPayload(trId, { mode: 'month', year, month: view.month })
  range.row()
    .text({ text: '‹‹', payload: encodeViewPayload(trId, { mode: 'year', year: start - 10, month: view.month }) }, ctx => ctx.menu.update())
    .text({ text: `${start}-${start + 9}`, payload: now }, () => {}) // decade label (v1 noop)
    .text({ text: '››', payload: encodeViewPayload(trId, { mode: 'year', year: start + 10, month: view.month }) }, ctx => ctx.menu.update())
  // 2 rows of 5 years; active year bracketed (v1). Picking (or back) returns
  // to the month view — nav re-renders the month menu from this payload.
  for (let row = 0; row < 2; row++) {
    range.row()
    for (let col = 0; col < 5; col++) {
      const year = start + row * 5 + col
      const label = year === view.year ? `[${year}]` : String(year)
      range.text({ text: label, payload: toMonth(year) }, ctx => ctx.menu.nav(monthMenuId))
    }
  }
  range.row().text({ text: backLabel, payload: toMonth(view.year) }, ctx => ctx.menu.nav(monthMenuId))
}
