import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.{test,spec}.ts'],
    exclude: [...configDefaults.exclude, '**/__tests__/e2e/**'],
    setupFiles: ['__tests__/helpers/setup.ts'],
    fileParallelism: false,
    testTimeout: 10000,
    globals: true,
  },
  resolve: { alias: { '#root': path.resolve(import.meta.dirname, './src') } },
})
