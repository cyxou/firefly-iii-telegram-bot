# Technology Stack

**Analysis Date:** 2026-05-20

## Languages

**Primary:**
- TypeScript 4.9.4 - Main language for the entire application

**Secondary:**
- Node.js 18 - Runtime environment
- JavaScript - Transpiled from TypeScript

## Runtime

**Environment:**
- Node.js 18 (Alpine 3.16 for Docker)

**Package Manager:**
- npm 8.x
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- Grammy.js 1.19.0 - Telegram bot framework
- TypeScript ES2016 target - Compiled to CommonJS modules

**Testing:**
- No test framework configured

**Build/Dev:**
- TypeScript compiler (tsc) - For building the application
- Nodemon 2.0.20 - Development hot reload server
- ESLint 8.33.0 - Code linting with TypeScript rules
- ts-node 10.9.1 - TypeScript execution in development

## Key Dependencies

**Critical:**
- @grammyjs/i18n 0.5.1 - Internationalization middleware
- @grammyjs/menu 1.2.1 - Interactive menu system
- @grammyjs/ratelimiter 1.2.1 - Rate limiting middleware
- @grammyjs/router 2.0.0 - Routing for state machines
- @grammyjs/storage-file 2.3.2 - File-based session storage
- axios 1.2.6 - HTTP client for Firefly III API
- dayjs 1.11.7 - Date manipulation and formatting
- debug 4.3.4 - Logging framework
- dotenv 16.0.3 - Environment variable management
- grammy 1.19.0 - Main bot framework
- lodash.curry 4.1.1 - Function currying utilities
- lodash.flatten 4.4.0 - Array flattening
- lodash.isempty 4.4.0 - Empty value checking
- mathjs 11.5.0 - Mathematical expression parsing
- node-fetch 3.3.0 - Fetch API implementation
- node-json-db 2.1.4 - JSON database for storage
- table 6.8.1 - ASCII table formatting

**Infrastructure:**
- Earthly 0.7 - Containerized build system
- Docker - Multi-platform containerization

## Configuration

**Environment:**
- Environment variables loaded via dotenv
- Critical env vars: BOT_TOKEN, ALLOWED_TG_USER_IDS, FIREFLY_URL, FIREFLY_ACCESS_TOKEN
- Debug logging controlled by DEBUG environment variable

**Build:**
- TypeScript configuration in `src/tsconfig.json`
- ESLint configuration in `.eslintrc`
- OpenAPI generator configuration in `.openapi-generator-config.yaml`

## Platform Requirements

**Development:**
- Node.js 18+
- npm
- Earthly (for Docker builds)
- OpenAPI generator CLI (for API client regeneration)

**Production:**
- Node.js 18 (Alpine Linux)
- Docker for container deployment
- GitHub Container Registry for image hosting

---
*Stack analysis: 2026-05-20*
