# Codebase Concerns

**Analysis Date:** 2026-05-20

## Tech Debt

**Transaction Creation Complexity:**
- Issue: Duplicate code in deposit vs transfer transaction flows with only minor variations
- Files: `src/composers/transactions/add-transactions-menus.ts` lines 77-83
- Impact: Maintenance burden, potential for inconsistencies, difficulty adding new transaction types
- Fix approach: Abstract common transaction flow patterns into shared utilities or configuration-driven approach

**Amount Input Parsing:**
- Issue: Math evaluation lacks robust input validation and currency handling
- Files: `src/composers/helpers.ts` lines 56-67
- Impact: Inconsistent user experience, potential runtime errors with malformed input
- Fix approach: Implement comprehensive validation, comma-to-dot conversion, and foreign currency support

**Transaction Error Handling:**
- Issue: Multiple "TODO: Handle error properly" comments with console.error fallback
- Files: `src/composers/transactions/add-transactions-menus.ts` lines 621, 652, 978
- Impact: Poor error recovery, inconsistent user feedback, potential silent failures
- Fix approach: Implement structured error handling with user-friendly messages and retry mechanisms

**Type Safety:**
- Issue: Untyped `category: any` in session state
- Files: `src/types/SessionData.ts` line 44
- Impact: Runtime type errors, lost type information, reduced code maintainability
- Fix approach: Define proper Category type and ensure proper typing throughout session management

**Category and Account List Limitations:**
- Issue: Missing pagination for categories and accounts lists
- Files: `src/composers/categories.ts` line 246, `src/composers/helpers.ts` line 142
- Impact: Poor performance with large datasets, poor user experience with many items
- Fix approach: Implement pagination with infinite scroll or page-based navigation

## Known Bugs

**Currency Conversion Handling:**
- Issue: No proper handling when source/destination account currencies differ
- Files: `src/composers/transactions/add-transactions-menus.ts` line 822
- Symptoms: Users may not be prompted for foreign currency amounts
- Trigger: Creating transactions between accounts with different currencies
- Workaround: Manual calculation required or transactions may be incorrect

**Category Missing Flow:**
- Issue: No handling when users have no categories or skip category selection
- Files: `src/composers/transactions/add-transactions-menus.ts` lines 396, 459, 975
- Symptoms: Users may get stuck in transaction creation flow or transactions created without categories
- Trigger: First-time users or users who haven't set up categories
- Workaround: Users must exit and create categories via Firefly UI first

**Multiple Transaction Editing Conflicts:**
- Issue: Shared session state limits simultaneous transaction editing
- Files: `src/types/SessionData.ts` line 43
- Symptoms: Users may lose data when editing multiple transactions
- Trigger: Attempting to edit multiple transactions quickly
- Workaround: Edit transactions one at a time

## Security Considerations

**Environment Variable Security:**
- Risk: Bot tokens and API keys stored in plain text .env files
- Files: `/.env` (present but not read), `src/config.ts`
- Current mitigation: Environment variables, no hardcoded secrets
- Recommendations: Implement environment variable validation, consider secret management integration

**Access Control Implementation:**
- Risk: Relies solely on Telegram ID validation without additional security layers
- Files: `src/index.ts` lines 29-44
- Current mitigation: Rate limiting, logging of unauthorized attempts
- Recommendations: Implement additional authentication factors, session management improvements

**API Token Exposure:**
- Risk: Firefly API tokens handled in session state without encryption
- Files: `src/types/SessionData.ts`, `src/lib/firefly/index.ts`
- Current mitigation: Basic session storage, rate limiting
- Recommendations: Implement token encryption, refresh token support, token rotation

## Performance Bottlenecks

**Large API Files:**
- Problem: Auto-generated API files are extremely large (35K+ lines each)
- Files: `src/lib/firefly/api/insight-api.ts` (3,544 lines), `currencies-api.ts` (2,065 lines)
- Cause: Comprehensive but verbose auto-generated code from OpenAPI spec
- Improvement path: Implement selective API client generation, lazy loading of rarely used endpoints

**Account Caching:**
- Problem: No caching mechanism for accounts/categories between sessions
- Files: `src/composers/transactions/add-transactions-menus.ts` line 109
- Cause: Fresh API call for every menu creation
- Improvement path: Implement localStorage or memory caching with TTL, background refresh

## Fragile Areas

**Mapper Dependency:**
- Files: `src/lib/Mapper.ts`, used throughout composers for keyboard callback data
- Why fragile: Uses Node.js vm module for template string evaluation, single point of failure
- Safe modification: Keep usage consistent, add validation for template strings, consider alternatives for production
- Test coverage: Limited testing of edge cases in callback data parsing

**OpenAPI Generation Workflow:**
- Files: `.openapi-generator-config.yaml`, `src/lib/firefly/` generated files
- Why fragile: Manual generation process, easily overwritten by codegen script
- Safe modification: Use `npm run codegen` for updates, never edit generated files manually
- Test coverage: Limited testing of API client integration, mostly functional testing

## Scaling Limits

**Session State Management:**
- Current capacity: One user per chat, limited session data structure
- Limit: Shared session state, no user isolation beyond Telegram IDs
- Scaling path: Implement proper multi-user session isolation, database-backed session storage

**File-based Session Storage:**
- Current capacity: Limited by filesystem performance and concurrent access
- Limit: Filesystem locks, no support for high concurrent usage
- Scaling path: Redis or database session storage, horizontal scaling considerations

## Dependencies at Risk

**Grammy Ecosystem:**
- Risk: Heavy reliance on specific versions of Grammy.js ecosystem packages
- Impact: Major breaking changes in Grammy updates could require significant refactoring
- Migration plan: Monitor Grammy.js changelog, maintain test coverage, consider gradual migration to alternatives if needed

**OpenAPI Generator:**
- Risk: Deprecated openapi-generator-cli version (2.5.2)
- Impact: May fail with new OpenAPI specs or Firefly API changes
- Migration plan: Update to latest stable version, validate generation process, consider alternative generators

## Missing Critical Features

**Multi-Split Transactions:**
- Problem: Only single split transactions supported
- Blocks: Complex accounting scenarios requiring multiple splits per transaction
- Priority: Medium - affects advanced users only

**Internationalization Testing:**
- Problem: Limited testing of i18n features beyond supported languages
- Blocks: Confidence in adding new languages
- Priority: Low - but expanding language support is planned

## Test Coverage Gaps

**API Integration Testing:**
- What's not tested: Firefly API client integration, error handling, edge cases
- Files: `src/lib/firefly/` (all auto-generated files), `src/lib/errorHandler.ts`
- Risk: API changes could break bot without detection
- Priority: High - critical for reliability

**Transaction Flow Testing:**
- What's not tested: Complex transaction creation flows, error recovery scenarios
- Files: `src/composers/transactions/add-transaction.ts`, `src/composers/transactions/add-transactions-menus.ts`
- Risk: User workflows may fail in production without clear error indicators
- Priority: High - core functionality

**Menu and State Management:**
- What's not tested: Menu persistence, state transitions, cleanup logic
- Files: `src/lib/menu-date-picker/`, session-related components
- Risk: Memory leaks, inconsistent state, menu display issues
- Priority: Medium - affects user experience but not critical functionality

---

*Concerns audit: 2026-05-20*