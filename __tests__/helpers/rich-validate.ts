// Structural validation for rich-message markdown (GFM flavor) — the rules
// Telegram's renderer enforces but the mock API cannot (nothing renders).
// Born from live bug 8wh: a table without a blank line before it renders as
// literal pipe text, and every test stayed green because payloads were only
// recorded, never checked.

const isTableRow = (line: string) => line.trimStart().startsWith('|')

// | --- |, | :---: |, | ---: | … only pipes, dashes, colons, spaces, at least one dash
function isDelimiterRow(line: string) {
  const t = line.trim()
  return t.startsWith('|') && /-/.test(t) && /^[\s|:-]+$/.test(t)
}

/**
 * Return a violation message for every structurally invalid construct, or []
 * if the markdown would render as intended. Only rules we have seen Telegram
 * enforce are checked — extend here when a new live gotcha lands.
 */
export function validateRichMarkdown(markdown: string): string[] {
  const lines = markdown.split('\n')
  const violations: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!isTableRow(lines[i]))
      continue
    // start of a table run (previous line is not itself a table row)
    if (i > 0 && isTableRow(lines[i - 1]))
      continue
    const prev = i > 0 ? lines[i - 1].trim() : ''
    if (prev !== '')
      violations.push(`GFM table at line ${i + 1} interrupts a paragraph (needs a blank line before it): ${lines[i].slice(0, 60)}`)
    const next = lines[i + 1]
    if (next === undefined || !isDelimiterRow(next))
      violations.push(`pipe row at line ${i + 1} has no GFM separator row after it (renders as literal text): ${lines[i].slice(0, 60)}`)
  }
  return violations
}

// --- registry: the mock transformer notes every rich send; the shared test
// setups fail the offending test in afterEach (throwing inside the transformer
// would only be swallowed by the bot's error boundary).

const richViolations: string[] = []

/** Record a rich-markdown payload the bot tried to send (mock transformer). */
export function noteRichMarkdown(markdown: string) {
  richViolations.push(...validateRichMarkdown(markdown))
}

/** Drain the registry — used by the afterEach assertion helper. */
export function expectNoRichViolations() {
  const violations = richViolations.splice(0)
  if (violations.length > 0)
    throw new Error(`bot sent structurally invalid rich markdown:\n${violations.join('\n')}`)
}
