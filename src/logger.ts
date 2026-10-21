import process from 'node:process'
import { pino } from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.stdout.isTTY ? { transport: { target: 'pino-pretty' } } : {}),
})

export type Logger = typeof logger
