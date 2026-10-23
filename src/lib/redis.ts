import process from 'node:process'
import { Redis } from 'ioredis'

// Reads REDIS_URL directly instead of going through the config singleton so
// test setup files can point tests at an isolated DB (see __tests__/e2e/setup.ts)
// before this module is imported. ioredis connects lazily on first command.
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
})
