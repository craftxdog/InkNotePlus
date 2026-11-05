import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bound CPU and jsdom memory pressure on the native installer runners.
    // A single worker keeps full-app tests from competing on slower Intel VMs.
    maxWorkers: process.env.CI ? 1 : undefined,
    environment: 'node',
    setupFiles: ['./tests/support/dom-geometry.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
