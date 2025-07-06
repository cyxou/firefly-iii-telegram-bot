# System Architecture & Design Patterns

## Core Architectural Decisions
1. **Middleware Chain**  
   ```typescript
   bot.use(session())
   bot.use(i18n())
   bot.use(requireSettings)
   bot.use(cleanup)
   ```
2. **Composer Pattern**  
   ```typescript
   // Feature isolation example
   export const transactionsComposer = new Composer<MyContext>()
   transactionsComposer.use(addTransaction)
   transactionsComposer.use(editTransaction)
   ```

## Key Implementation Patterns
### Session Management
- **Isolation Strategy**: `${user_id}_${chat_id}` session keys
- **Data Lifecycle**:
  ```mermaid
  graph LR
    A[Message] --> B[Load Session]
    B --> C[Process]
    C --> D[Modify State]
    D --> E[Auto-save]
  ```

### API Integration
- **Client Generation**:
  ```bash
  npm run codegen # Regenerates from Firefly OpenAPI spec
  ```
- **Configuration Flow**:
  ```typescript
  new Configuration({
    basePath: userSettings.fireflyApiUrl,
    accessToken: userSettings.fireflyAccessToken
  })
  ```

## Critical Paths
1. Transaction Creation:
   ```typescript
   parseInput → validate → createPayload → API call → updateSession
   ```
2. Settings Configuration:
   ```typescript
   collectCredentials → testConnection → persistSettings
