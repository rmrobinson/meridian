import { test, expect } from '@playwright/test';

/**
 * Compute the Y position for a given ISO date using the same formula as
 * main.js, then scroll the container so that date is centred in the viewport.
 * Robust to changing "today" as time advances.
 */
async function scrollToDate(page, isoDate) {
  await page.evaluate((targetDate) => {
    const birth   = new Date('1990-04-12');
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const totalH  = Number(document.getElementById('timeline-svg').getAttribute('height'));
    const ratio   = (today - new Date(targetDate)) / (today - birth);
    const y       = ratio * totalH;
    const c       = document.getElementById('timeline-container');
    c.scrollTop   = Math.max(0, y - c.clientHeight / 2);
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }, isoDate);
}

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

  // ── Phase 2 — lane assignment ─────────────────────────────────────────────

  test('employment span branches left of spine', async ({ page }) => {
    await scrollToDate(page, '2015-06-01'); // Acme Corp start
    await expect(page.locator('[data-testid="span-line-span-evt_001"]')).toBeAttached({ timeout: 3000 });

    // Path: "M {parentX},{py} C {cx1},{cy1} {cx2},{cy2} {laneX},{branchY}"
    // At 1280px: spineX=640, laneX=640-80=560 (left side)
    const branchD = await page.locator('[data-testid="span-line-span-evt_001"] .span-branch').getAttribute('d');
    const tokens  = branchD.trim().split(/[\s,]+/);
    const startX  = Number(tokens[1]); // parentX ≈ 640
    const endX    = Number(tokens[8]); // final endpoint X = laneX ≈ 560

    expect(startX).toBeCloseTo(640, -1); // starts near spine centre
    expect(endX).toBeLessThan(startX);   // curves left
  });

  test('two concurrent book spans render as adjacent sibling lanes on the right', async ({ page }) => {
    await scrollToDate(page, '2022-08-01'); // during overlap of Dune + Midnight Library
    await expect(page.locator('[data-testid="span-line-span-evt_003"]')).toBeAttached({ timeout: 3000 });
    await expect(page.locator('[data-testid="span-line-span-evt_006"]')).toBeAttached({ timeout: 3000 });

    const getEndX = async (testId) => {
      const d = await page.locator(`[data-testid="${testId}"] .span-branch`).getAttribute('d');
      return Number(d.trim().split(/[\s,]+/)[8]); // final endpoint X = laneX
    };

    const x1 = await getEndX('span-line-span-evt_003'); // Dune → laneOffset +80 → ~720
    const x2 = await getEndX('span-line-span-evt_006'); // Midnight Library → laneOffset +160 → ~800

    expect(x1).toBeGreaterThan(640);           // right of spine
    expect(x2).toBeGreaterThan(x1);            // further right
    expect(x2 - x1).toBeCloseTo(80, -1);       // exactly one LANE_WIDTH apart
  });

  test('CERN placement (nested branch) renders outward from education line, not from spine', async ({ page }) => {
    await scrollToDate(page, '2012-07-01'); // mid-point of CERN placement
    await expect(page.locator('[data-testid="span-line-span-evt_001b"]')).toBeAttached({ timeout: 3000 });

    // parentX = spineX + parentOffset = 640 + (-80) = 560 (university line)
    // laneX   = spineX + laneOffset   = 640 + (-160) = 480
    const branchD = await page.locator('[data-testid="span-line-span-evt_001b"] .span-branch').getAttribute('d');
    const tokens  = branchD.trim().split(/[\s,]+/);
    const startX  = Number(tokens[1]); // parentX ≈ 560
    const endX    = Number(tokens[8]); // laneX   ≈ 480

    expect(startX).toBeCloseTo(560, -1); // starts at university line, not spine
    expect(endX).toBeLessThan(startX);   // curves further left (outward)
    expect(endX).toBeCloseTo(480, -1);
  });

  // ── Phase 3 — card interaction ────────────────────────────────────────────

  test('clicking a spine station opens a milestone card', async ({ page }) => {
    // evt_000: "Moved to London" (2019-09-01) — spine relocation, no external_url → milestone card.
    await scrollToDate(page, '2019-09-01');
    await expect(page.locator('[data-testid="station-evt_000"]')).toBeAttached({ timeout: 3000 });

    // dispatchEvent fires a real bubbling click on the <g> element.
    // The SVG's delegated click listener picks it up via e.target.closest('.station').
    await page.dispatchEvent('[data-testid="station-evt_000"]', 'click');

    // Overlay should be visible (no [hidden] attribute).
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    // Card wrapper should carry the milestone modifier class.
    await expect(page.locator('#card-content .card--milestone')).toBeAttached();
  });

  test('clicking a trip station opens a trip card with a read-more link', async ({ page }) => {
    // evt_002: Japan Trip (2023-03-10..2023-03-24) — has external_url → trip card.
    await scrollToDate(page, '2023-03-10');
    await expect(page.locator('[data-testid="station-evt_002"]')).toBeAttached({ timeout: 3000 });

    await page.dispatchEvent('[data-testid="station-evt_002"]', 'click');

    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    await expect(page.locator('#card-content .card--trip')).toBeAttached();
    const link = page.locator('#card-content .card-read-more');
    await expect(link).toBeAttached();
    expect(await link.getAttribute('href')).toContain('japan-2023');
  });

  test('close button hides the card overlay', async ({ page }) => {
    await scrollToDate(page, '2019-09-01');
    await expect(page.locator('[data-testid="station-evt_000"]')).toBeAttached({ timeout: 3000 });
    await page.dispatchEvent('[data-testid="station-evt_000"]', 'click');
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');

    await page.locator('#card-close').click();
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  test('Escape key dismisses the open card', async ({ page }) => {
    await scrollToDate(page, '2019-09-01');
    await expect(page.locator('[data-testid="station-evt_000"]')).toBeAttached({ timeout: 3000 });
    await page.dispatchEvent('[data-testid="station-evt_000"]', 'click');
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');

    await page.keyboard.press('Escape');
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  // ── Phase 3 — zoom toggle ─────────────────────────────────────────────────

  test('zoom toggle switches body class and active button', async ({ page }) => {
    // Start: Day zoom (default).
    await expect(page.locator('body')).toHaveClass(/zoom-day/);
    await expect(page.locator('.zoom-btn[data-zoom="day"]')).toHaveClass(/zoom-btn--active/);

    // Switch to Month.
    await page.locator('.zoom-btn[data-zoom="month"]').click();
    await expect(page.locator('body')).toHaveClass(/zoom-month/);
    await expect(page.locator('.zoom-btn[data-zoom="month"]')).toHaveClass(/zoom-btn--active/);
    await expect(page.locator('.zoom-btn[data-zoom="day"]')).not.toHaveClass(/zoom-btn--active/);

    // Switch to Year.
    await page.locator('.zoom-btn[data-zoom="year"]').click();
    await expect(page.locator('body')).toHaveClass(/zoom-year/);
    await expect(page.locator('.zoom-btn[data-zoom="year"]')).toHaveClass(/zoom-btn--active/);
  });

  test('switching to Month zoom renders aggregate stations', async ({ page }) => {
    await page.locator('.zoom-btn[data-zoom="month"]').click();
    await expect(page.locator('body')).toHaveClass(/zoom-month/);

    // At Month zoom, scroll near the present to find any station (birthday
    // aggregates or regular agg events should appear).
    const stations = page.locator('.station');
    await expect(stations.first()).toBeAttached({ timeout: 3000 });
  });

  // ── Phase 3 — span hover sync ─────────────────────────────────────────────

  test('hovering a span line in month zoom adds station--span-hover to its stations', async ({ page }) => {
    await page.locator('.zoom-btn[data-zoom="month"]').click();
    await expect(page.locator('body')).toHaveClass(/zoom-month/);

    await scrollToDate(page, '2023-03-10');
    await expect(page.locator('[data-testid="span-line-span-evt_002"]')).toBeAttached({ timeout: 3000 });

    // Trigger mouseover on the span line via JS so the delegated listener fires.
    await page.evaluate(() => {
      const span = document.querySelector('[data-testid="span-line-span-evt_002"]');
      span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }));
    });

    await expect(page.locator('[data-testid="station-evt_002"]')).toHaveClass(/station--span-hover/);
  });

  test('mousing out of a span line removes station--span-hover from its stations', async ({ page }) => {
    await page.locator('.zoom-btn[data-zoom="month"]').click();
    await scrollToDate(page, '2023-03-10');
    await expect(page.locator('[data-testid="span-line-span-evt_002"]')).toBeAttached({ timeout: 3000 });

    await page.evaluate(() => {
      const span = document.querySelector('[data-testid="span-line-span-evt_002"]');
      span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }));
    });
    await expect(page.locator('[data-testid="station-evt_002"]')).toHaveClass(/station--span-hover/);

    await page.evaluate(() => {
      const span = document.querySelector('[data-testid="span-line-span-evt_002"]');
      span.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    await expect(page.locator('[data-testid="station-evt_002"]')).not.toHaveClass(/station--span-hover/);
  });

  // ── Phase 3+ — birthday override ─────────────────────────────────────────

  test('explicit birthday event replaces auto-generated station at that date', async ({ page }) => {
    // The fixture has an explicit spine birthday on 2020-04-12 ("Turning 30").
    // The auto-generator would produce "Birthday — Age 30" for the same date —
    // the explicit event must suppress it so only one station exists.
    await scrollToDate(page, '2020-04-12');

    // Only one station with data-id matching the explicit event's ID should exist.
    await expect(page.locator('[data-testid="station-evt_birthday_30"]')).toBeAttached({ timeout: 3000 });

    // The auto-generated counterpart must NOT be in the DOM.
    await expect(page.locator('[data-testid="station-auto_birthday_30"]')).not.toBeAttached();

    // Opening the card shows the custom title, not the auto-generated one.
    await page.dispatchEvent('[data-testid="station-evt_birthday_30"]', 'click');
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    await expect(page.locator('#card-content .card-title')).toHaveText('Turning 30');
  });
});
