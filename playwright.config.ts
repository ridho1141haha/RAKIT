import { defineConfig, devices } from '@playwright/test'

/**
 * RAKIT E2E suite.
 * Runs against the local dev server (port 3000). If the server is already
 * running, it is reused — tests never start a second instance.
 * workers=1 + fullyParallel=false: the suite shares one SQLite database and
 * uses unique-suffix data to stay collision-free.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /07-mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /07-mobile/,
    },
  ],
})
