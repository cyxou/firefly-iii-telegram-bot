# External Integrations

**Analysis Date:** 2026-05-20

## APIs & External Services

**Firefly III (Finance):**
- Firefly III API v2.0.10 - Personal finance management
- SDK: Auto-generated TypeScript client via OpenAPI
- Auth: Bearer token (FIREFLY_ACCESS_TOKEN env var)
- Base URL: Configurable via FIREFLY_URL/FIREFLY_API_URL

**Telegram:**
- Telegram Bot API - Bot framework integration
- Client: Grammy.js library
- Auth: Bot token (BOT_TOKEN env var)

## Data Storage

**Databases:**
- Firefly III database (MariaDB/MySQL) - Primary data storage
  - Connection: Environment variable configuration
  - Client: Firefly III's built-in MariaDB

**File Storage:**
- Local filesystem - Session storage (`sessions/` directory)
  - Library: @grammyjs/storage-file

**Caching:**
- No external caching detected
- Session data stored in JSON files

## Authentication & Identity

**Telegram Authentication:**
- User ID filtering - Configurable via ALLOWED_TG_USER_IDS
- Implementation: Custom middleware in `src/index.ts`

**Firefly III Authentication:**
- API token authentication
- Implementation: Custom error interceptors in `src/lib/firefly/index.ts`

## Monitoring & Observability

**Error Tracking:**
- Custom error handler in `src/index.ts`
- Console logging for bot errors
- Debug logging via debug library

**Logs:**
- Debug logging framework with hierarchical namespacing
- Environment variable controlled (DEBUG)
- Structured logging for unauthorized access attempts

## CI/CD & Deployment

**Hosting:**
- GitHub Container Registry (GHCR)
- Platform: Docker containers

**CI Pipeline:**
- GitHub Actions - Triggers on version tags
- Earthly build system - Multi-platform builds
- Validation: Build and test runs on PRs

## Environment Configuration

**Required env vars:**
- `BOT_TOKEN` - Telegram bot authentication
- `FIREFLY_URL` - Firefly III instance URL
- `FIREFLY_ACCESS_TOKEN` - Firefly III API access token
- `ALLOWED_TG_USER_IDS` - Comma-separated Telegram user IDs (optional)
- `FIREFLY_API_URL` - Firefly API URL override (optional)
- `DISABLE_UNAUTHORIZED_USER_LOG` - Suppress unauthorized access logs (optional)
- `DEBUG` - Debug logging configuration (optional)

**Secrets location:**
- Environment variables
- `.env` files (not committed to git)

## Webhooks & Callbacks

**Incoming:**
- Telegram webhook - Main bot interaction point
- Callback queries - Menu interaction and state management

**Outgoing:**
- Firefly III API calls - Transaction and data operations
- Telegram API calls - Message replies and menu updates

---
*Integration audit: 2026-05-20*
