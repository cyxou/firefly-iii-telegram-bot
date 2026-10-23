import type { TransportTargetOptions } from 'pino'
import process from 'node:process'
import { pino } from 'pino'

// Reads env directly (not config) so the logger never depends on the config
// singleton — logger must be importable by bare scripts without full env.

const level = process.env.LOG_LEVEL ?? 'info'

const targets: TransportTargetOptions[] = process.stdout.isTTY
  ? [{ target: 'pino-pretty', level, options: { ignore: 'pid,hostname', translateTime: true } }]
  : [{ target: 'pino/file', level, options: { destination: 1 } }] // stdout

if (process.env.LOG_FILE) {
  targets.push({ target: 'pino/file', level, options: { destination: process.env.LOG_FILE, mkdir: true } })
}

export const logger = pino({ level, transport: { targets } })

export type Logger = typeof logger
