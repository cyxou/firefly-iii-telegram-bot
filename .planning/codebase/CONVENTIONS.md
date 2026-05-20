# Coding Conventions

**Analysis Date:** 2026-05-20

## Naming Patterns

**Files:**
- PascalCase for composers: `src/composers/transactions/AddTransaction.ts`
- kebab-case for configuration and utilities: `src/config.ts`, `src/lib/errorHandler.ts`
- camelCase for regular files: `src/composers/helpers.ts`, `src/lib/Mapper.ts`

**Functions:**
- camelCase for functions: `parseAmountInput`, `createCategoriesKeyboard`, `formatTransactionText`
- Async functions prefixed with `async`: `getFireflyAccounts`, `createFireflyTransaction`
- Event handlers: `startHandler`, `helpHandler` (camelCase)

**Variables:**
- camelCase for variables: `amount`, `description`, `defaultSourceAccount`
- Descriptive naming: `ctx.session.userSettings.fireflyUrl`
- Loop counters: `i`, `j`, `index`

**Types:**
- PascalCase for interfaces: `SessionData`, `AccountAttributes`
- camelCase for type parameters: `MyContext`, `NextFunction`
- Generic types with clear names: `MenuMiddleware<MyContext>`

## Code Style

**Formatting:**
- Tool used: ESLint with TypeScript parser
- Key settings:
  - No source maps (sourceMap: false)
  - Non-null assertions allowed (`@typescript-eslint/no-non-null-assertion`: "off")
  - Module boundary types disabled (`@typescript-eslint/explicit-module-boundary-types`: "off")
  - No unused parameter checking
  - No implicit returns checking

**Linting:**
- Tool: ESLint v8.33.0
- Config: `.eslintrc` (JSON format)
- Scripts:
  - `npm run lint` - Check for issues
  - `npm run fix` - Auto-fix issues

## Import Organization

**Order:**
1. Node.js built-in modules: `import debug from 'debug'`
2. Third-party dependencies: `import dayjs from 'dayjs'`
3. Local modules relative to src: `import i18n from './lib/i18n'`
4. Relative imports: `import { parseAmountInput } from '../helpers'`

**Path Aliases:**
- Not configured in TypeScript (no paths in tsconfig.json)
- All imports are relative or absolute from src root

## Error Handling

**Patterns:**
```typescript
// Debug logging for error context
const log = debug('bot:transactions:helpers')
try {
  // Main logic
} catch (err) {
  log('Error: %O', err)
  console.error('Error occurred: ', err)
  throw err
}

// Custom error classes
export class AuthenticationError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

// Error handling in handlers
export function handleCallbackQueryError(err: Error, ctx: MyContext) {
  if (err instanceof AuthenticationError) {
    return ctx.reply(ctx.i18n.t('settings.connectionFailedUnauthenticated'))
  }
  return ctx.answerCallbackQuery({
    text: err.message,
    show_alert: true
  })
}
```

## Logging

**Framework:** Debug library (debug v4.3.4)

**Patterns:**
```typescript
// Root logger with namespace
import debug from 'debug'
const rootLog = debug(`bot:root`)

// Extended loggers for specific functions
const log = rootLog.extend('startHandler')

// Usage with structured logging
log('start: %O', ctx.message)
log('amount: %O', amount)

// Local debug extensions in functions
function createCategoriesKeyboard(ctx: MyContext) {
  const log = debug.extend('createCategoriesKeyboard')
  log('categories: %O', categories)
}
```

## Comments

**When to Comment:**
- Complex business logic (transaction type determination)
- TODO items for future improvements
- API call explanations
- Multi-step flow documentation

**JSDoc/TSDoc:**
- Not consistently used throughout the codebase
- Some function exports have documentation comments
- Custom error classes have basic constructor documentation

## Function Design

**Size:**
- Prefer smaller, focused functions
- Larger functions are typically composed of multiple smaller functions
- Exception: main handlers like `createFireflyTransaction` are complex due to business logic

**Parameters:**
- Functions typically accept 1-4 parameters
- Object parameters for complex data: `createCategoriesKeyboard(ctx, mapper)`
- Optional parameters with sensible defaults

**Return Values:**
- Async functions always return Promise
- Void for side-effect functions
- Specific types for data-returning functions

## Module Design

**Exports:**
- Named exports for utilities: `export { parseAmountInput, formatTransaction }`
- Default exports for composers and main modules
- Barrel exports in API files: `export * from './generated-api'`

**Barrel Files:**
- `src/lib/firefly/api.ts` - Manually maintained barrel for API client
- Not used elsewhere in the codebase

## TypeScript Configuration

**Target:** ES2016 (compatible with Node.js v12+)

**Modules:** CommonJS (module: "commonjs")

**Strict Mode:**
- All strict type checking enabled (strict: true)
- NoImplicitAny, strictNullChecks, strictFunctionTypes, strictPropertyInitialization

**Additional Features:**
- Source maps disabled for production builds
- Skip lib check for faster builds
- Force consistent casing in file names

## Architectural Patterns

**Composer Pattern:**
```typescript
// Each feature domain is a Composer
const bot = new Composer<MyContext>()
bot.use(transactionRecordMenu)
bot.use(addTransactionMenu)
bot.use(router)
export default bot
```

**Router State Machine:**
```typescript
const router = new Router<MyContext>((ctx) => ctx.session.step)
router.route(Route.SET_FOREIGN_AMOUNT, setForeignAmountRouteHandler)
```

**Middleware Chain:**
```typescript
bot.use(limit())
bot.use(requireSettings())
bot.use(cleanup())
bot.use(addTransaction)
```

---

*Convention analysis: 2026-05-20*