import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // Unit tests live next to the code.
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
