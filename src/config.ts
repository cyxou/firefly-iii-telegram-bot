import process from 'node:process'
import * as v from 'valibot'

// Schema keys are env-var names: createConfig accepts a raw env-shaped record
// (`createConfig(process.env)` just works). Transforms that change the type
// (string -> number[] / boolean) wrap their optional INSIDE the pipe, because
// v.optional's default is typed against the wrapped schema's input type.
const configSchema = v.object({
  BOT_TOKEN: v.pipe(v.string(), v.regex(/^\d+:[\w-]+$/, 'Invalid BOT_TOKEN')),
  ALLOWED_TG_USER_IDS: v.pipe(
    v.optional(v.string(), ''),
    v.transform(s => s.split(',').map(x => Number(x.trim())).filter(n => !Number.isNaN(n) && n !== 0)),
  ),
  DISABLE_UNAUTHORIZED_USER_LOG: v.pipe(v.optional(v.string(), ''), v.transform(s => s === 'true')),
  REDIS_URL: v.optional(v.string(), 'redis://localhost:6379'),
  LOG_LEVEL: v.optional(v.string(), 'info'),
  FIREFLY_URL: v.optional(v.string(), ''),
  FIREFLY_API_URL: v.optional(v.string(), ''),
  FIREFLY_ACCESS_TOKEN: v.optional(v.string(), ''),
})

export function createConfig(input: Record<string, string | undefined>) {
  const p = v.parse(configSchema, input)
  return {
    botToken: p.BOT_TOKEN,
    allowedUserIds: p.ALLOWED_TG_USER_IDS,
    disableUnauthorizedUserLog: p.DISABLE_UNAUTHORIZED_USER_LOG,
    redisUrl: p.REDIS_URL,
    logLevel: p.LOG_LEVEL,
    fireflyUrl: p.FIREFLY_URL,
    fireflyAccessToken: p.FIREFLY_ACCESS_TOKEN,
    fireflyApiUrl: p.FIREFLY_API_URL || (p.FIREFLY_URL ? `${p.FIREFLY_URL.replace(/\/+$/, '')}/api` : ''),
  }
}

export type Config = ReturnType<typeof createConfig>

export const config = loadConfigFromEnv()

function loadConfigFromEnv(): Config {
  try {
    process.loadEnvFile()
  }
  catch {
    // no .env file — CI provides env directly
  }
  return createConfig(process.env)
}
