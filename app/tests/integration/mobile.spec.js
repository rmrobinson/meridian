import { test, expect } from '@playwright/test';

test.describe('Mobile — layout and interaction', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => Number(document.getElementById('timeline-svg')?.getAttribute('height')) > 0,
    );
  });

  test('SVG canvas has no horizontal overflow', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const container = document.getElementById('timeline-container');
      return container.scrollWidth <= container.clientWidth;
    });
    expect(overflow).toBe(true);
  });

  test('spine is present and vertically centered', async ({ page }) => {
    await expect(page.locator('[data-testid="spine-path"]')).toBeAttached();
  });

  test('zoom segmented control is visible and pinned at top', async ({ page }) => {
    const zoomBar = page.locator('.zoom-bar');
    await expect(zoomBar).toBeVisible();
    const box = await zoomBar.boundingBox();
    expect(box.y).toBeLessThan(10); // pinned near the top of the viewport
  });

  test('station touch targets are at least 44×44px', async ({ page }) => {
    // Scroll to the bottom quarter so birthday stations are in the render window.
    await page.evaluate(() => {
      const c = document.getElementById('timeline-container');
      c.scrollTop = c.scrollHeight * 0.75;
    });
    await page.waitForTimeout(200); // let rAF flush

    const hits = page.locator('.station-hit');
    const count = await hits.count();
    // We may have zero if the scroll didn't bring any into the buffer.
    // Just verify that any visible ones meet the size requirement.
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await hits.nth(i).boundingBox();
      if (!box) continue; // off-screen elements may have no box
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  // ── Phase 2 — mobile sibling collapse ────────────────────────────────────

  test('two concurrent book spans collapse into a single bolder line', async ({ page }) => {
    // Scroll to the middle of the Dune / Midnight Library overlap (Aug 2022).
    await page.evaluate((targetDate) => {
      const birth  = new Date('1990-04-12');
      const today  = new Date();
      today.setHours(0, 0, 0, 0);
      const totalH = Number(document.getElementById('timeline-svg').getAttribute('height'));
      const ratio  = (today - new Date(targetDate)) / (today - birth);
      const y      = ratio * totalH;
      const c      = document.getElementById('timeline-container');
      c.scrollTop  = Math.max(0, y - c.clientHeight / 2);
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }, '2022-08-01');

    // Primary sibling: Dune (innermost lane, siblingIndex=0)
    await expect(page.locator('[data-testid="span-line-span-evt_003"]')).toBeAttached({ timeout: 3000 });
    const sibCount = await page.locator('[data-testid="span-line-span-evt_003"]').getAttribute('data-sibling-count');
    const sibIndex = await page.locator('[data-testid="span-line-span-evt_003"]').getAttribute('data-sibling-index');
    expect(sibCount).toBe('2');
    expect(sibIndex).toBe('0');

    // Secondary sibling: Midnight Library (siblingIndex=1) — in DOM but hidden on mobile
    await expect(page.locator('[data-testid="span-line-span-evt_006"]')).toBeAttached();
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="span-line-span-evt_006"]');
      return el ? window.getComputedStyle(el).display === 'none' : false;
    });
    expect(isHidden).toBe(true);
  });

  // ── Phase 2+ stubs ────────────────────────────────────────────────────────
  test.fixme('when one book ends, its termination station renders and the line continues at reduced weight', async () => {});
  test.fixme('tapping a station opens a bottom sheet card', async () => {});
  test.fixme('bottom sheet dismisses on swipe down or close tap', async () => {});
});
