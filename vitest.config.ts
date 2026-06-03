import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// Single root config running every package's *.test.ts(x) under jsdom. The
// solid plugin compiles Solid reactivity for the solid adapter's tests; it is
// inert for the core (plain TS) and React suites.
export default defineConfig({
  plugins: [solid()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    conditions: ['development', 'browser'],
  },
});
