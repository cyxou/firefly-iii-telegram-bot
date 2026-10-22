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
