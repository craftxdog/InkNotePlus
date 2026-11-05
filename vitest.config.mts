import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bound CPU and jsdom memory pressure on the native installer runners.
    maxWorkers: process.env.CI ? 2 : undefined,
    environment: 'node',
    setupFiles: ['./tests/support/dom-geometry.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
