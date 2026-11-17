// The widget HTML is a size contract with Telegram's server: ≤32768 B raw and
// ≤4096 B after zlib-9 (INPUT_MEDIA_WIDGET_TOO_LARGE otherwise), and the
// sandbox forbids network, external resources and every form control but
// <button>. These guards keep all of that true in CI, not in production.
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import type { WidgetUiLabels } from '#root/bot/features/reports/report.widget.html.js'
import {
  buildReportsWidgetHtml,
  stripViewEmoji,
} from '#root/bot/features/reports/report.widget.html.js'

const labels: WidgetUiLabels = {
  tb: [
    ['monthly', stripViewEmoji(i18n.t('en', 'labels.VIEW_MONTHLY'))],
    ['trend', stripViewEmoji(i18n.t('en', 'labels.VIEW_TREND'))],
    ['budgets', stripViewEmoji(i18n.t('en', 'labels.VIEW_BUDGETS'))],
    ['networth', stripViewEmoji(i18n.t('en', 'labels.VIEW_NET_WORTH'))],
  ],
  i: i18n.t('en', 'tables.income'),
  e: i18n.t('en', 'tables.expense'),
  n: i18n.t('en', 'tables.net'),
  em: i18n.t('en', 'reports.emptyGeneric'),
  er: i18n.t('en', 'reports.widget.error'),
}

const html = buildReportsWidgetHtml(labels, 'https://ff.example.com')
const bytes = Buffer.from(html, 'utf8')

describe('reports widget html', () => {
  it('fits the raw 32768 B budget', () => {
    expect(bytes.length).toBeLessThanOrEqual(32768)
  })

  it('fits the 4096 B zlib-9 budget (server check)', () => {
    expect(zlib.deflateSync(bytes, { level: 9 }).length).toBeLessThanOrEqual(4096)
  })

  it('renders from state via TelegramWidget and never mutates it', () => {
    expect(html).toContain('TelegramWidget')
    expect(html).toContain('W.request(')
    expect(html).toContain('chatDataChanged')
    // instant first paint from chatData (guarded parse — malformed state must
    // degrade to the empty view, not kill the script), then refresh on screen
    expect(html.indexOf('S={s:q,bu:0')).toBeLessThan(html.indexOf('if(!W.isPreview)req'))
    expect(html).toContain('try{q=JSON.parse(W.chatData')
  })

  it('styles over-budget bars via a compound selector that actually matches', () => {
    // bud() puts both classes on the SAME element — a `.ov .ba i` descendant
    // selector can never match it and the overspend signal was lost
    expect(html).toContain('.ba.ov i{')
    expect(html).not.toContain('.ov .ba i')
  })

  it('cannot be broken out of by a </script> in the embedded URL', () => {
    const hostile = buildReportsWidgetHtml(
      labels,
      'https://ff.example.com/</script><script>alert(1)</script>',
    )
    expect(hostile).not.toContain('</script><script')
    expect(hostile).toContain('\\u003c') // JSON-valid escape, no early tag end
  })

  it('uses only sandbox-allowed markup', () => {
    // no form controls except <button>, no images, no external resources
    for (const forbidden of ['<input', '<textarea', '<select', '<img', '<iframe', 'src="http'])
      expect(html).not.toContain(forbidden)
    // inline SVG only (data: URLs barely compress under the zlib budget)
    expect(html).not.toContain('data:')
  })

  it('derives colors from the chat theme, not hard-coded values', () => {
    expect(html).toContain('var(--tg-theme-')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('guards the browser link to https (openLink rejects other schemes)', () => {
    expect(html).toContain("U.slice(0,8)=='https://'")
  })
})
