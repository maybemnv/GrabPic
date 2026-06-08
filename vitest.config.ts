import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,
    reporters: ['default'],
    outputFile: {
      json: './test-results.json',
    },
  },
})
