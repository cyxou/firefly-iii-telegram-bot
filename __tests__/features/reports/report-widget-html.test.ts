// The widget HTML is a size contract with Telegram's server: ≤32768 B raw and
// ≤4096 B after zlib-9 (INPUT_MEDIA_WIDGET_TOO_LARGE otherwise), and the
// sandbox forbids network, external resources and every form control but
// <button>. These guards keep all of that true in CI, not in production.
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { i18n } from '#root/bot/i18n.js'
import type { WidgetUiLabels } from '#root/bot/features/reports/report.widget.html.js'
import { buildReportsWidgetHtml } from '#root/bot/features/reports/report.widget.html.js'

const labels: WidgetUiLabels = {
  tb: [
    ['monthly', i18n.t('en', 'labels.VIEW_MONTHLY').replace(/^\S+\s/, '')],
    ['trend', i18n.t('en', 'labels.VIEW_TREND').replace(/^\S+\s/, '')],
    ['budgets', i18n.t('en', 'labels.VIEW_BUDGETS').replace(/^\S+\s/, '')],
    ['networth', i18n.t('en', 'labels.VIEW_NET_WORTH').replace(/^\S+\s/, '')],
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
    // instant first paint from chatData, then refresh on screen
    expect(html.indexOf('S={s:JSON.parse(W.chatData')).toBeLessThan(
      html.indexOf('if(!W.isPreview)req'),
    )
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
