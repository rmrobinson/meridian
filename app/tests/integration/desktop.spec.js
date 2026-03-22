import { test, expect } from '@playwright/test';

test.describe('Desktop — spine and year markers', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // initTimeline() runs after an async fetch — wait until the SVG has its
    // computed height before any test interacts with the canvas.
    await page.waitForFunction(
      () => Number(document.getElementById('timeline-svg')?.getAttribute('height')) > 0,
    );
  });

  test('SVG canvas is taller than the viewport', async ({ page }) => {
    const height = await page.locator('#timeline-svg').getAttribute('height');
    expect(Number(height)).toBeGreaterThan(800);
  });

  test('spine path is present in the DOM', async ({ page }) => {
    await expect(page.locator('[data-testid="spine-path"]')).toBeAttached();
  });

  test('spine runs from y=0 to the canvas bottom', async ({ page }) => {
    const y1 = await page.locator('[data-testid="spine-path"]').getAttribute('y1');
    const y2 = await page.locator('[data-testid="spine-path"]').getAttribute('y2');
    const height = await page.locator('#timeline-svg').getAttribute('height');
    expect(Number(y1)).toBe(0);
    expect(Number(y2)).toBe(Number(height));
  });

  test('year markers are rendered for recent years', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    // At least a few prior years should exist.
    // render-object id is "year-{yr}", so data-testid is "year-marker-year-{yr}".
    for (const yr of [currentYear - 1, currentYear - 2, currentYear - 5]) {
      await expect(
        page.locator(`[data-testid="year-marker-year-${yr}"]`),
      ).toBeAttached();
    }
  });

  test('today marker is present', async ({ page }) => {
    await expect(page.locator('[data-testid="year-marker-marker-today"]')).toBeAttached();
  });

  test('year markers have a lower Y value for more recent years (recent = closer to top)', async ({
    page,
  }) => {
    const currentYear = new Date().getFullYear();
    const olderYear = currentYear - 5;

    const getY = async (yr) => {
      const tick = page
        .locator(`[data-testid="year-marker-year-${yr}"] .year-tick`)
        .first();
      return Number(await tick.getAttribute('y1'));
    };

    const yRecent = await getY(currentYear - 1);
    const yOlder = await getY(olderYear);
    expect(yRecent).toBeLessThan(yOlder);
  });

  test('at least one station dot renders in the initial viewport', async ({ page }) => {
    // The fixture has events in 2023 and earlier; at Day zoom the canvas is
    // ~26 000px tall, so most events are far below the fold. But birthday
    // auto-events are generated for every year including recent ones — those
    // should be near the top and within the initial render window.
    const stations = page.locator('.station');
    await expect(stations.first()).toBeAttached();
  });

  // ── Trip span ─────────────────────────────────────────────────────────────

  /**
   * Scroll until the Japan trip span (≈2212px) enters the render buffer,
   * then wait two animation frames so the virtualized sync() call completes.
   */
  async function scrollToTripSpan(page) {
    await page.evaluate(() =>
      new Promise((resolve) => {
        document.getElementById('timeline-container').scrollTop = 1200;
        // Two rAF ticks: first fires the scroll handler, second lets it finish.
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
    );
    await expect(page.locator('[data-testid="span-line-span-evt_002"]')).toBeAttached();
  }

  test('trip span element is created in the DOM after scrolling to its Y position', async ({ page }) => {
    await scrollToTripSpan(page);
    // Already confirmed attached inside scrollToTripSpan; just assert once more.
    await expect(page.locator('[data-testid="span-line-span-evt_002"]')).toBeAttached();
  });

  test('trip span has a branch path, a segment path, and a merge path', async ({ page }) => {
    await scrollToTripSpan(page);
    const span = page.locator('[data-testid="span-line-span-evt_002"]');
    await expect(span.locator('.span-branch')).toBeAttached();
    await expect(span.locator('.span-segment')).toBeAttached();
    await expect(span.locator('.span-merge')).toBeAttached();
  });

  test('trip span branch path starts at spine center and curves right', async ({ page }) => {
    await scrollToTripSpan(page);

    const branchD = await page
      .locator('[data-testid="span-line-span-evt_002"] .span-branch')
      .getAttribute('d');

    // Path: "M {parentX},{y} C {parentX},{cy} {laneX},{cy} {laneX},{endY}"
    // At 1280px wide: spineX ≈ 640, laneX = 640 + 80 = 720.
    const tokens = branchD.trim().split(/[\s,]+/);
    const startX = Number(tokens[1]); // M x0
    const endX   = Number(tokens[7]); // C x2 (laneX at end)

    expect(startX).toBeCloseTo(640, -1); // within ~10px of centre
    expect(endX).toBeGreaterThan(startX); // curves to the right
  });

  test('trip span station dots appear at start and end of the span', async ({ page }) => {
    await scrollToTripSpan(page);
    await expect(page.locator('[data-testid="station-evt_002"]')).toBeAttached();
    await expect(page.locator('[data-testid="station-evt_002-end"]')).toBeAttached();
  });

  // ── Phase 2+ stubs ────────────────────────────────────────────────────────
  test.fixme('trip span branches right of spine with a visible bezier curve', async () => {});
  test.fixme('employment span branches left of spine', async () => {});
  test.fixme('two concurrent book spans render as adjacent sibling lanes on the right', async () => {});
  test.fixme('nested branch (placement job off education line) renders outward from education line', async () => {});
  test.fixme('clicking a station opens the correct card type', async () => {});
  test.fixme('zoom toggle switches between Day / Month / Year and updates visible stations', async () => {});
  test.fixme('explicit birthday event replaces auto-generated station at that date', async () => {});
});
