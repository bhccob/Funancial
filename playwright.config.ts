import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

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
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Process env beats .env* files in Vite, so the build never reads a developer's .env.local.
    // The URL is empty: the app calls its own origin, where the specs mock `/api/**`.
    env: { VITE_FUNANCIAL_API_URL: '', VITE_FUNANCIAL_API_TOKEN: 'e2e-token' },
  },
});
