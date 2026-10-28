import { defineConfig } from 'vitest/config';

// Tests run against a real Postgres database (baanrai_test), made fresh from
// db/schema.sql and db/migrations on every run. Test files share it, so they
// run one at a time.
export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/env.js'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // Only starts the server; the app itself is in app.js.
      exclude: ['src/index.js'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
