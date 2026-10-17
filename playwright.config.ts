import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const SITE_PORT = 4174;
// The download page has its own build and its own specs; the app's projects skip them.
const SITE_SPECS = '**/e2e/site/**';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    // Fixed so money and dates read the same on every machine.
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      testIgnore: SITE_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'desktop-chromium',
      testIgnore: SITE_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'site',
      testMatch: '**/e2e/site/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        baseURL: `http://localhost:${SITE_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Process env beats .env* files in Vite, so the build never reads a developer's .env.local.
      // The URL is empty: the app calls its own origin, where the specs mock `/api/**`.
      env: { VITE_FUNANCIAL_API_URL: '', VITE_FUNANCIAL_API_TOKEN: 'e2e-token' },
    },
    {
      command: 'npm run site:build && npm run site:preview',
      url: `http://localhost:${SITE_PORT}/get/`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
