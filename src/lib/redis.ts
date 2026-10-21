import { Redis } from 'ioredis'

// Reads REDIS_URL directly instead of going through the config singleton so
// test setup files can point tests at an isolated DB (see __tests__/e2e/setup.ts)
// before this module is imported. ioredis connects lazily on first command.
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
})
