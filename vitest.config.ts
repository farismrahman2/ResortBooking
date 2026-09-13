import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // Lets a .test.ts import a .tsx component (the PDF documents).
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
