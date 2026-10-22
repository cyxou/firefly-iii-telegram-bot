// Ported from legacy/composers/helpers.ts parseAmountInput + the add-transaction
// message regex. mathjs `evaluate` is replaced by a mini precedence-climbing
// evaluator — the v1 regex already gates the charset to \d , . + - * / ^, so
// this is safe (no eval) and fixes v1's never-done commas→dots TODO.

// v1 regexes, de-nested for the regexp/no-super-linear-backtracking lint: the
// amount-only alternative's outer `(...)*` was redundant (two concatenated
// amount expressions always collapse into one), so `?` is semantically equal.
const AMOUNT_RE = /^[-+/*]?\d+(?:[.,]\d+)?(?:[-+/*^]\d+(?:[.,]\d+)?)*$/
const MESSAGE_RE
  = /^(?<amountOnly>\d+(?:[.,]\d+)?(?:[-+/*^]\d+(?:[.,]\d+)?)?)?$|(?<description>.+)\s(?<amount>\d+(?:[.,]\d+)?(?:[-+/*^]\d+(?:[.,]\d+)?)*)$/

/** Evaluate `expr`: numbers and binary + - * / ^ (^ right-associative, mathjs parity). */
export function evaluateAmount(expr: string): number {
  const tokens = expr.replace(/,/g, '.').match(/\d+(?:\.\d+)?|[-+*/^]/g) ?? []
  let pos = 0
  const peek = (): string | undefined => tokens[pos]
  const take = (): string => tokens[pos++]!
  const primary = (): number => Number(take())
  const power = (): number => {
    const base = primary()
    if (peek() === '^') {
      take()
      return base ** power()
    }
    return base
  }
  const term = (): number => {
    let value = power()
    while (peek() === '*' || peek() === '/') {
      const op = take()
      const rhs = power()
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }
  const sum = (): number => {
    let value = term()
    while (peek() === '+' || peek() === '-') {
      const op = take()
      const rhs = term()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }
  return sum()
}

/** v1 semantics: leading operator (+ - * /) composes with `oldAmount`; result is |x|. */
export function parseAmountInput(input: string, oldAmount?: string): number | null {
  if (!AMOUNT_RE.test(input))
    return null
  const expr = oldAmount && /^[-+/*]/.test(input) ? `${oldAmount}${input}` : input
  return Math.abs(evaluateAmount(expr))
}

/** v1 add-transaction text regex, verbatim: 'amount' | 'description amount'. */
export function parseTransactionMessage(text: string): { amount: string, description?: string } | null {
  const groups = MESSAGE_RE.exec(text)?.groups
  if (!groups)
    return null
  const amount = groups.amount || groups.amountOnly
  return amount ? { amount, description: groups.description } : null
}
