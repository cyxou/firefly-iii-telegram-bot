---
name: update-deps
description: Use when asked to update dependencies, bump packages to latest, fix bun audit or vulnerability findings, or refresh this repo's toolchain. Triggers include "bun audit", "update deps", "fix vulnerabilities", "outdated packages", "security update".
---

# Update dependencies (audit → 0, zero behavior change)

Bump everything to latest, prove nothing broke. The proof is the deliverable — a
bump without the full verification battery is not done.

## Procedure

1. Baseline: `bun audit` — record direct vs transitive chains.
2. Latest versions: `npm view <pkg> version` for every package.json entry.
3. Edit package.json — **exact pins, no ranges** (repo convention). Bump all
   except the exceptions below.
4. `bun install` → `bun audit` — expect **No vulnerabilities found**.
   - Transitive vulns blocked by a parent's range → top-level `overrides`
     entries (e.g. `basic-ftp`). `bun audit fix` lists what's blocked and why.
   - Bun silently ignores nested overrides (`"pkg": { "child": "…" }`) and glob
     `resolutions` — top-level exact names only.
5. Settle: `bun run fix` (oxlint --fix + oxfmt) then `bun run lint`.
   oxlint warnings on test helpers (no-unsafe-optional-chaining) are accepted —
   don't churn test code for them.
6. Verification battery — ALL must pass:
   - `bunx tsc --noEmit`
   - `bunx vitest run` — full unit + integration suite
   - `docker compose -f docker-compose.tests.yaml up -d && sleep 2 && bun run test:e2e` — real Redis; validates runtime deps (ioredis/RESP3 path)
   - `earth +runTests` — the CI gate itself. See landmine 1.
7. If `@openapitools/openapi-generator-cli` changed: `bun run codegen` smoke.
   Fails at `java: command not found` on JRE-less hosts — success criterion is
   the `Downloaded <version>` line matching the `openapitools.json` pin, and
   `src/lib/firefly/generated/` untouched (revert any churn).
8. Report: vuln count before → after, version table, verification evidence,
   skipped/unverifiable items stated plainly.

## Never bump (breaks the bot)

| Package | Ceiling | Why |
|---|---|---|
| `@grammyjs/i18n` | 0.5.1 | 1.x is Fluent-only; locales are v1 YAML keys |
| eslint / `@antfu/eslint-config` | not installed — don't reintroduce | typescript-eslint supports TS <6.1 only, repo runs TS 7 |

## Landmines (each caused a real failure on 2026-10-23)

1. **Never pipe `earth`** — `earth +runTests | tail` reports tail's exit 0; a
   failed gate looks green. Redirect to a file, then check `$?` separately.
2. **`.oxlintrc.json` must keep explicit `node_modules/**` +
   `**/node_modules/**` ignores** — the Earthly container ships no
   `.gitignore`, so gitignore-based skipping silently vanishes and CI lints
   5000+ vendor files to 7 errors in minified code.
3. **Markdown globs** — oxfmt parses `*.menu.ts` as emphasis; escape as
   `\*.menu.ts` in .md prose.
4. **Major runtime bumps** — read the breaking changes and peer ranges before
   crossing a major (ioredis 5→6 = RESP3 default, needs Redis ≥6; e2e against
   redis:7-alpine is the proof).
5. **openapi-generator needs a JRE** — this host has none and CI never runs
   codegen; the jar version is pinned in `openapitools.json` and must not drift.

## Report contract

State: audit count before → after, what bumped (from → to), which verification
commands ran with real results, and anything unverifiable on this host (e.g.
codegen's java boundary) — say it, don't hide it.
