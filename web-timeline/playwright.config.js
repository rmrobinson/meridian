import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'app/tests/integration',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3100',
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
    // Run on port 3100 in --mode test so it uses .env.test (BACKEND_URL=),
    // serving the mock fixture instead of proxying to a live backend.
    // Port 3100 avoids conflicts with the dev server on port 3000.
    command: 'npx vite --mode test --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
  },
});
