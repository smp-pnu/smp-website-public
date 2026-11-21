import { defineConfig, devices } from '@playwright/test'

// Deliberately fixed loopback targets. These tests must never mutate a live CMS.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3005',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', testIgnore: '**/mcp.spec.ts', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node tests/e2e/public-server.mjs', url: 'http://127.0.0.1:3005/research', timeout: 240_000, reuseExistingServer: false },
    { command: 'node --import tsx tests/e2e/admin-server.mjs', url: 'https://localhost:3019/__qa/health', ignoreHTTPSErrors: true, timeout: 180_000, reuseExistingServer: false },
  ],
})
