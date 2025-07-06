# Technical Context & Development Setup

## Core Technologies
| Category          | Technology Stack              |
|-------------------|-------------------------------|
| Runtime           | Node.js 18.x, TypeScript 5.x  |
| Bot Framework     | Grammy.js 1.14.x              |
| API Client        | Auto-generated OpenAPI Client |
| Session Storage   | @grammyjs/storage-file 2.1.0  |
| Internationalization | @grammyjs/i18n 2.0.1       |
| Dependency Mgmt   | npm 9.x                       |

## Critical Dependencies
```json
{
  "dependencies": {
    "grammy": "^1.14.1",
    "mathjs": "^11.5.0",
    "axios": "^1.4.0",
    "@grammyjs/storage-file": "^2.1.0"
  },
  "devDependencies": {
    "typescript": "^5.1.3",
    "openapi-generator-cli": "^2.6.0",
    "@types/node": "^18.15.11"
  }
}
```

## Configuration Matrix
```typescript
// Environment Variables
interface EnvConfig {
  BOT_TOKEN: string
  FIREFLY_URL: string
  FIREFLY_API_URL: string
  FIREFLY_ACCESS_TOKEN: string
  TG_USER_ID?: string
  DEBUG?: string
}

// Session Defaults
const initialSession: SessionData = {
  userSettings: {
    fireflyUrl: process.env.FIREFLY_URL || '',
    fireflyApiUrl: process.env.FIREFLY_API_URL || '',
    fireflyAccessToken: process.env.FIREFLY_ACCESS_TOKEN || '',
    language: 'en'
  }
}
```

## Development Practices
1. **API Client Generation**:
   ```bash
   npm run codegen # Cleans and regenerates API client
   ```
2. **Code Quality**:
   ```bash
   npm run lint    # ESLint checks
   npm run format  # Prettier formatting
   ```
3. **Debugging**:
   ```bash
   DEBUG='bot:*' npm start  # Enable all debug logging
   ```

## Deployment Architecture
```mermaid
graph TD
    A[Docker Container] --> B[Node.js Runtime]
    B --> C[Session Storage Volume]
    B --> D[Firefly III API]
    C --> E[Persistent File Storage]
```

## Security Considerations
- **Token Storage**: Encrypted in session files
- **Input Validation**:
  ```typescript
  function sanitizeAmount(input: string): number {
    return math.evaluate(input.replace(/[^0-9+\-*/().]/g, ''))
  }
  ```
- **Session Isolation**: Per user-chat ID namespace
