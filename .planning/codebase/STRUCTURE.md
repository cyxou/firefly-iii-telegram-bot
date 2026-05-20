# Codebase Structure

**Analysis Date:** 2025-06-17

## Directory Layout

```
/home/alex/code/firefly-iii-telegram-bot/
├── src/                         # Source code
│   ├── index.ts                 # Bot entry point and middleware orchestration
│   ├── config.ts                # Configuration management
│   ├── types/                   # TypeScript type definitions
│   │   ├── MyContext.ts         # Grammy context with session data
│   │   └── SessionData.ts       # Session state interface
│   ├── composers/               # Feature-specific message handlers
│   │   ├── transactions/        # Transaction management
│   │   │   ├── add-transaction.ts     # Transaction creation flow
│   │   │   ├── edit-transaction.ts    # Transaction editing
│   │   │   ├── list-transactions.ts  # Transaction listing
│   │   │   └── add-transactions-menus.ts # Transaction keyboard menus
│   │   ├── accounts.ts          # Account listing and viewing
│   │   ├── categories.ts        # Category management
│   │   ├── reports.ts           # Financial reports
│   │   ├── settings.ts          # Bot configuration
│   │   ├── helpers.ts          # Shared utilities and keyboard builders
│   │   └── constants.ts        # Command names and menu identifiers
│   ├── lib/                     # Core libraries
│   │   ├── firefly/            # Firefly III API integration
│   │   │   ├── index.ts        # API factory and error interceptors
│   │   │   ├── api/            # Auto-generated API client
│   │   │   └── model/          # Auto-generated data models
│   │   ├── menu-date-picker/   # Custom inline calendar
│   │   └── i18n.ts            # Internationalization setup
│   └── locales/                # Translation files
├── sessions/                    # File-based session storage
├── dist/                       # Compiled TypeScript output
├── .planning/codebase/          # Architecture documentation
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── Earthfile                   # Multi-platform Docker build
```

## Directory Purposes

**`src/`:** Main source code directory

**`src/composers/`:** Feature-specific message handlers
- Purpose: Organize bot functionality by domain
- Contains: Transaction, account, category, settings, reports handlers
- Key files: `[src/composers/transactions/]`, `[src/composers/helpers.ts]`

**`src/lib/`:** Core libraries and integrations
- Purpose: Third-party integrations and shared utilities
- Contains: Firefly API client, date picker, i18n setup
- Key files: `[src/lib/firefly/index.ts]`, `[src/lib/menu-date-picker/]`

**`src/types/`:** TypeScript type definitions
- Purpose: Type safety and interfaces
- Contains: Grammy context, session data interfaces
- Key files: `[src/types/MyContext.ts]`, `[src/types/SessionData.ts]`

**`sessions/`:** File-based session storage
- Purpose: Persistent session data between bot restarts
- Contains: Individual session files per user-chat combination

**`locales/`:** Translation files
- Purpose: Internationalization support
- Contains: Language-specific text strings
- Supported languages: English, Spanish, Italian, Russian

## Key File Locations

**Entry Points:**
- `[src/index.ts]`: Bot initialization and middleware chain
- `[src/config.ts]`: Environment variable configuration

**Core Logic:**
- `[src/composers/transactions/add-transaction.ts]`: Main transaction creation
- `[src/composers/settings.ts]`: Bot configuration handling
- `[src/lib/firefly/index.ts]`: Firefly III API integration
- `[src/lib/menu-date-picker/index.ts]`: Custom date picker component

**Utilities:**
- `[src/composers/helpers.ts]`: Shared helpers and keyboard builders
- `[src/lib/Mapper.ts]`: Callback data serialization

## Naming Conventions

**Files:**
- Lowercase with kebab-case: `add-transaction.ts`, `settings.ts`
- Index files: `index.ts` for main exports

**Functions:**
- camelCase: `createFireflyTransaction`, `generateWelcomeMessage`
- Async functions: Explicit `async` declaration
- Handler functions: `startHandler`, `textHandler`

**Variables:**
- camelCase: `userSettings`, `sessionData`
- Constants: UPPER_SNAKE_CASE: `ACCOUNTS_PAGE_LIMIT`
- Router enums: PascalCase: `Route.SET_FOREIGN_AMOUNT`

**Types:**
- Interfaces: PascalCase: `SessionData`, `MyContext`
- Enums: PascalCase: `Route`, `TransactionTypeProperty`

## Where to Add New Code

**New Feature:**
- Primary code: `[src/composers/]` (create new directory)
- Tests: Currently not configured
- Internationalization: `[src/locales/]` (add translation strings)

**New Transaction Type:**
- Implementation: `[src/composers/transactions/]`
- Router state: Update `Step` type in `[src/types/SessionData.ts]`
- Menus: Update `[src/composers/transactions/add-transactions-menus.ts]`

**New API Integration:**
- Implementation: `[src/lib/firefly/]`
- Error handling: Update interceptors in `[src/lib/firefly/index.ts]`
- Models: Auto-generated, configure in `[.openapi-generator-ignore]`

**New Utility:**
- Shared utilities: `[src/composers/helpers.ts]`
- Core utilities: `[src/lib/]`
- Callback data handling: Update `[src/lib/Mapper.ts]`

## Special Directories

**`src/lib/firefly/`:**
- Purpose: Firefly III API integration
- Generated: Partially auto-generated from OpenAPI spec
- Committed: Customizations committed, generated files managed via ignore

**`src/lib/menu-date-picker/`:**
- Purpose: Custom inline calendar component
- Generated: Custom implementation
- Committed: Fully committed version

**`sessions/`:**
- Purpose: File-based session storage
- Generated: Runtime created
- Committed: No, runtime data only

---

*Structure analysis: 2025-06-17*