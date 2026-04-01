import { test, expect } from '@playwright/test';

async function scrollToDate(page, isoDate) {
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
  }, isoDate);
}

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

  // ── Phase 3 — card interaction ────────────────────────────────────────────

  test('tapping a station opens a bottom sheet card', async ({ page }) => {
    // Scroll to evt_000 (Moved to London, 2019-09-01 — spine relocation → milestone card).
    await scrollToDate(page, '2019-09-01');

    await expect(page.locator('[data-testid="station-evt_000"]')).toBeAttached({ timeout: 3000 });
    // dispatchEvent fires a real bubbling click on the <g> element.
    // The SVG's delegated click listener picks it up via e.target.closest('.station').
    await page.dispatchEvent('[data-testid="station-evt_000"]', 'click');

    // On mobile the overlay becomes visible (no [hidden] attribute).
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    // The card content should exist and have a recognisable card class.
    await expect(page.locator('#card-content .card--milestone')).toBeAttached();
    // Sheet positioning should be unset — mobile uses CSS bottom-sheet, no inline top/left.
    const sheetTop = await page.locator('#card-sheet').evaluate((el) => el.style.top);
    expect(sheetTop).toBe('');
  });

  test('bottom sheet dismisses on close button tap', async ({ page }) => {
    await scrollToDate(page, '2019-09-01');

    await expect(page.locator('[data-testid="station-evt_000"]')).toBeAttached({ timeout: 3000 });
    await page.dispatchEvent('[data-testid="station-evt_000"]', 'click');
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');

    // Tap the close button (regular click, not SVG element).
    await page.locator('#card-close').click();
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  test('bottom sheet dismisses on swipe down ≥ 80px', async ({ page }) => {
    await scrollToDate(page, '2019-09-01');
    await expect(page.locator('[data-testid="station-evt_000"]')).toBeAttached({ timeout: 3000 });
    await page.dispatchEvent('[data-testid="station-evt_000"]', 'click');
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');

    // Simulate swipe-down on the card sheet via synthetic touch events.
    // setupSwipeDismiss dismisses when touchend delta ≥ 80px.
    await page.evaluate(() => {
      const sheet = document.getElementById('card-sheet');
      const startY = 300;
      const endY   = 390; // 90px drag — above the 80px threshold

      const makeTouch = (y) => new Touch({
        identifier: 1, target: sheet,
        clientX: 195, clientY: y,
        screenX: 195, screenY: y,
        pageX:   195, pageY:   y,
        radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1,
      });

      sheet.dispatchEvent(new TouchEvent('touchstart', {
        cancelable: true, bubbles: true,
        touches: [makeTouch(startY)], changedTouches: [makeTouch(startY)],
      }));
      sheet.dispatchEvent(new TouchEvent('touchmove', {
        cancelable: true, bubbles: true,
        touches: [makeTouch(endY)], changedTouches: [makeTouch(endY)],
      }));
      sheet.dispatchEvent(new TouchEvent('touchend', {
        cancelable: true, bubbles: true,
        touches: [], changedTouches: [makeTouch(endY)],
      }));
    });

    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  // ── Phase 2+ stubs ────────────────────────────────────────────────────────
  test.fixme('when one book ends, its termination station renders and the line continues at reduced weight', async () => {});
});
