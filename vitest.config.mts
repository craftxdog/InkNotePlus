import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/support/dom-geometry.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
