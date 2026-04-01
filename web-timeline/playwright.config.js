import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'app/tests/integration',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile',
      use: {
        // Chromium mobile emulation — matches iPhone 14 viewport.
        // Switch to devices['iPhone 14'] if WebKit is installed.
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: 'npx serve app -p 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
