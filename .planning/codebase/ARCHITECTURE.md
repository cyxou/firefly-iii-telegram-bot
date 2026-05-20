# Architecture

**Analysis Date:** 2025-06-17

## Pattern Overview

**Overall:** Telegram Bot with Composer-based Middleware Chain

**Key Characteristics:**
- Event-driven message processing through Grammy.js middleware chain
- Session-per-user-chat state management with file-based persistence
- Router-based state machines for multi-step workflows
- Auto-generated Firefly III API client with custom error handling
- Component-based feature organization via composers
- Inline menu system with keyboard navigation

## Layers

**Entry Layer (`src/index.ts`):**
- Purpose: Bot initialization and middleware orchestration
- Location: `[src/index.ts]`
- Contains: Bot setup, middleware chain, command handlers
- Depends on: Config, composers, middlewares
- Used by: Grammy bot framework

**Middleware Layer (`src/lib/middlewares/`):**
- Purpose: Cross-cutting concerns and request processing
- Location: `[src/lib/middlewares/]`
- Contains: Access control, session cleanup, settings validation
- Depends on: Session data, configuration
- Used by: Grammy bot chain

**Composer Layer (`src/composers/`):**
- Purpose: Feature-specific message handling and state management
- Location: `[src/composers/]`
- Contains: Transaction management, accounts, categories, settings, reports
- Depends on: API client, helpers, session data
- Used by: Entry layer middleware

**API Layer (`src/lib/firefly/`):**
- Purpose: Firefly III integration with auto-generated client
- Location: `[src/lib/firefly/]`
- Contains: API factory, error interceptors, model definitions
- Depends on: HTTP client, configuration
- Used by: Composer layer

**Utility Layer (`src/lib/` and `src/composers/helpers.ts`):**
- Purpose: Shared utilities and helpers
- Location: `[src/lib/]`, `[src/composers/helpers.ts]`
- Contains: Keyboard builders, amount parsing, formatting utilities
- Depends on: Mathjs, dayjs, custom Mapper
- Used by: All layers above

## Data Flow

**Message Processing Flow:**

1. **Bot Reception**: Grammy bot receives update (text/command/callback)
2. **Middleware Chain**: 
   - Rate limiting → Access control → Session attachment → i18n → Settings validation → Cleanup
3. **Composer Dispatch**: Router determines appropriate composer based on session state
4. **State Machine**: Router navigates through multi-step workflows (e.g., transaction creation)
5. **API Integration**: Composer calls Firefly III API via auto-generated client
6. **Response Generation**: Formats response with keyboard and i18n strings

**State Management:**
- Session data stored per user-chat combination (`${userId}_${chatId}`)
- State machine tracks current step in workflows
- Session persists to filesystem between bot restarts
- Clean separation between transient state and user settings

## Key Abstractions

**Composer Pattern:**
- Purpose: Feature-specific message handling and state management
- Examples: `[src/composers/transactions/`, `[src/composers/accounts.ts]`
- Pattern: Grammy Composer with Router-based state machine

**Mapper Pattern:**
- Purpose: Callback data serialization/deserialization for inline keyboards
- Examples: `[src/lib/Mapper.ts]`
- Pattern: Template-based encoding/decoding via Node.js vm module

**API Client Factory:**
- Purpose: Configured Firefly III API instances with auth and error handling
- Examples: `[src/lib/firefly/index.ts]`
- Pattern: Factory function with Axios interceptors

**Date Picker:**
- Purpose: Custom inline calendar for date selection
- Examples: `[src/lib/menu-date-picker/]`
- Pattern: Grammy Menu integration with session-persisted state

## Entry Points

**Bot Entry (`src/index.ts`):**
- Location: `[src/index.ts]`
- Triggers: Telegram webhook updates
- Responsibilities: Initialize bot, set up middleware chain, handle errors

**Command Handlers:**
- Location: `[src/index.ts]`
- Triggers: `/start`, `/help` commands
- Responsibilities: Send welcome message, help text, set bot commands

**Text Handler:**
- Location: `[src/composers/transactions/add-transaction.ts]`
- Triggers: Text messages in IDLE state
- Responsibilities: Parse transaction amounts and descriptions

## Error Handling

**Strategy:** Centralized error handling with custom error types

**Patterns:**
- Custom error classes: `AuthenticationError`, `ResourceNotFoundError`, `HostNotFoundError`
- Axios response interceptors: Map HTTP errors to custom error types
- Global error handler: Catches unhandled bot errors
- Contextual error responses: Localized error messages via i18n

## Cross-Cutting Concerns

**Logging:** 
- Debug library with hierarchical namespacing (`bot:domain:fn`)
- Structured logging with context information
- Error logging in catch blocks

**Internationalization:**
- Grammy i18n middleware with session-based language switching
- Dayjs locales for date formatting
- Template data for pluralization and formatting functions

**Session Management:**
- File-based storage via `@grammyjs/storage-file`
- Per user-chat session isolation
- Cleanup utilities for state transitions

---

*Architecture analysis: 2025-06-17*