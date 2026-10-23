import { describe, expect, it } from 'vitest'
import { escapeRichMarkdown, markdownTable } from '#root/bot/helpers/rich.js'

describe('markdownTable', () => {
  it('renders a GFM table with header, separator and alignment', () => {
    const table = markdownTable(
      ['Name', 'Balance', 'Currency'],
      [
        ['Checking', '1234.50', 'USD'],
        ['Savings', '980.00', 'USD'],
      ],
      ['left', 'right', 'left'],
    )
    expect(table).toBe(
      [
        '| Name | Balance | Currency |',
        '| --- | ---: | --- |',
        '| Checking | 1234.50 | USD |',
        '| Savings | 980.00 | USD |',
      ].join('\n'),
    )
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
    expect(escapeRichMarkdown('a*b_c[d]~e`f|g\\h')).toBe('a\\*b\\_c\\[d\\]\\~e\\`f\\|g\\\\h')
  })
})
