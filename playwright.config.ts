import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E configuration.
 * The webServer script (tests/e2e/server.sh) provisions a throwaway SQLite
 * database, applies migrations, seeds the deterministic demo dataset, and
 * serves the app on port 4310. Demo login is enabled for the run.
 */
export default defineConfig({
  testDir: './tests/e2e/specs',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  },
  webServer: {
    command: 'bash tests/e2e/server.sh',
    url: 'http://localhost:4310/api/auth/me',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
