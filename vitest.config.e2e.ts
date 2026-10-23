import path from 'node:path'
import { defineConfig } from 'vitest/config'

// E2E: real Redis from compose.tests.yaml (port 6380). Telegram is still mocked.
export default defineConfig({
  test: {
    include: ['__tests__/e2e/**/*.test.ts'],
    setupFiles: ['__tests__/e2e/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    globals: true,
  },
  resolve: {
    alias: {
      '#root': path.resolve(import.meta.dirname, './src'),
    },
  },
})
