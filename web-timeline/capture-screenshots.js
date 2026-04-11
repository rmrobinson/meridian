#!/usr/bin/env node

/**
 * Captures screenshots of the Meridian web-timeline in day view and grid view.
 * Run this after `npm run serve` starts the dev server.
 *
 * Usage: npm run capture-screenshots
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const screenshotsDir = resolve(__dirname, 'screenshots');

// Create screenshots directory if it doesn't exist
mkdirSync(screenshotsDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });

  try {
    // Try both common ports (3000, 3001)
    let url = 'http://localhost:3000/';
    try {
      console.log('📸 Trying http://localhost:3000...');
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 3000,
      });
    } catch {
      url = 'http://localhost:3001/';
      console.log('📸 Port 3000 not available, trying http://localhost:3001...');
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 10000,
      });
    }

    // Wait for the SVG canvas to load (same pattern as the e2e tests)
    console.log('⏳ Waiting for timeline to render...');
    await page.waitForFunction(
      () => Number(document.getElementById('timeline-svg')?.getAttribute('height')) > 0,
      { timeout: 5000 },
    );

    // Allow a brief moment for any animations to settle
    await page.waitForTimeout(1000);

    // Screenshot 1: Day view (subway map)
    const dayViewPath = resolve(screenshotsDir, 'day-view.png');
    console.log(`📸 Capturing day view (subway map)...`);
    await page.screenshot({ path: dayViewPath });
    console.log(`✅ Saved: ${dayViewPath}`);

    // Screenshot 2: Grid view (week grid)
    console.log('📸 Switching to grid view...');
    await page.locator('.view-btn[data-view="grid"]').click();
    await page.waitForFunction(
      () => {
        const container = document.getElementById('week-grid-container');
        return container && !container.hasAttribute('hidden');
      },
      { timeout: 5000 },
    );

    // Allow grid to render
    await page.waitForTimeout(1000);

    const gridViewPath = resolve(screenshotsDir, 'grid-view.png');
    console.log(`📸 Capturing grid view...`);
    await page.screenshot({ path: gridViewPath });
    console.log(`✅ Saved: ${gridViewPath}`);

    console.log('\n✨ Screenshots captured successfully!');
    console.log(`📁 Location: ${screenshotsDir}/`);
  } catch (error) {
    console.error('❌ Error capturing screenshots:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
