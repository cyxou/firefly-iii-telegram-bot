import type { SessionData } from '#root/bot/context.js'
import { RedisAdapter } from '@grammyjs/storage-redis'
import { redis } from '#root/lib/redis.js'

export function createSessionStorage(ttlSeconds = 86400): RedisAdapter<SessionData> {
  return new RedisAdapter<SessionData>({ instance: redis, ttl: ttlSeconds, autoParseDates: true })
}
