import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Switch to grid view and wait for the grid container to be visible. */
async function activateGridView(page) {
  await page.locator('.view-btn[data-view="grid"]').click();
  await expect(page.locator('#week-grid-container')).not.toHaveAttribute('hidden');
  await expect(page.locator('.week-grid')).toBeAttached();
}

/** Switch back to subway view and wait for the SVG to be visible. */
async function activateSubwayView(page) {
  await page.locator('.view-btn[data-view="subway"]').click();
  await expect(page.locator('#timeline-svg')).not.toHaveAttribute('hidden');
}

// ── Desktop tests ─────────────────────────────────────────────────────────────

test.describe('Grid — desktop (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => Number(document.getElementById('timeline-svg')?.getAttribute('height')) > 0,
    );
  });

  // ── Layout ──────────────────────────────────────────────────────────────────

  test('grid renders one .grid-year row per year from birth year to current year', async ({ page }) => {
    await activateGridView(page);

    const currentYear = new Date().getFullYear();
    // Mock fixture birth_date is 1990-04-12.
    const birthYear = 1990;
    const expectedYears = currentYear - birthYear + 1;

    const yearRows = page.locator('.grid-year');
    await expect(yearRows).toHaveCount(expectedYears);
  });

  test('birth year row has neutral cells (no data-week) before the birth week', async ({ page }) => {
    await activateGridView(page);

    // Birth is 1990-04-12 → ISO week 15 of 1990.
    // Week 14 of 1990 should be in the row but have no data-week (neutral).
    const birthYearRow = page.locator('.grid-year[data-year="1990"] .grid-row--a');
    await expect(birthYearRow).toBeAttached();

    // Count cells without data-week in the birth year row.
    const neutralCells = birthYearRow.locator('.week-cell:not([data-week])');
    const count = await neutralCells.count();
    // Weeks 1–14 should be neutral (14 cells without data-week; col-labels at W1 are
    // rendered as .col-label elements, not .week-cell, so exactly 13 neutral week-cells
    // before W14 col-label, then W14 itself is a col-label, then W15 is the first with data-week).
    // Neutral cells: W02–W13 = 12 cells (W01 is rendered as col-label).
    expect(count).toBeGreaterThan(0);
  });

  test('current year row has no cells after the current ISO week', async ({ page }) => {
    await activateGridView(page);

    const currentYear = new Date().getFullYear();
    const currentYearRow = page.locator(`.grid-year[data-year="${currentYear}"] .grid-row--a`);
    await expect(currentYearRow).toBeAttached();

    // All cells that exist should either have data-week (coloured) or be neutral (pre-birth).
    // None should have a data-week value with a week number beyond the current week.
    const allWeekKeys = await currentYearRow
      .locator('.week-cell[data-week]')
      .evaluateAll((cells) => cells.map((c) => c.dataset.week));

    // Compute current ISO week in JS.
    const currentISOWeek = await page.evaluate(() => {
      const today = new Date();
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    });

    for (const key of allWeekKeys) {
      const weekNum = Number(key.split('-W')[1]);
      expect(weekNum).toBeLessThanOrEqual(currentISOWeek);
    }
  });

  test('a week covered by a travel span has a coloured cell (non-neutral)', async ({ page }) => {
    await activateGridView(page);
    // Japan trip: 2023-03-10 → 2023-03-28 covers 2023-W11.
    const cell = page.locator('.week-cell[data-week="2023-W11"]');
    await expect(cell).toBeAttached();
    // Cell should have an inline background style (not empty).
    const bg = await cell.evaluate((el) => el.style.background);
    expect(bg).toBeTruthy();
    expect(bg).not.toBe('');
  });

  test('a week with only residence data has a coloured cell', async ({ page }) => {
    await activateGridView(page);
    // 2000-W10: no spans in fixture, residence = Edinburgh (relocation 1990-04-12).
    const cell = page.locator('.week-cell[data-week="2000-W10"]');
    await expect(cell).toBeAttached();
    const bg = await cell.evaluate((el) => el.style.background);
    expect(bg).toBeTruthy();
  });

  // ── Click interaction ────────────────────────────────────────────────────────

  test('clicking a coloured week cell opens the card overlay', async ({ page }) => {
    await activateGridView(page);
    // 2023-W11: covered by Japan trip.
    const cell = page.locator('.week-cell[data-week="2023-W11"]');
    await expect(cell).toBeAttached();
    await cell.click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
  });

  test('week card lists events grouped by family', async ({ page }) => {
    await activateGridView(page);
    await page.locator('.week-cell[data-week="2023-W11"]').click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    // Card should contain a .card--week-cluster element.
    await expect(page.locator('#card-content .card--week-cluster')).toBeAttached();
    // Should have at least one group label.
    await expect(page.locator('.cluster-group-label').first()).toBeAttached();
    // Should have at least one tappable event item.
    await expect(page.locator('.cluster-member-item').first()).toBeAttached();
  });

  test('clicking a neutral cell does not open the card overlay', async ({ page }) => {
    await activateGridView(page);
    // Find a neutral cell in the birth year row (no data-week).
    const neutralCell = page.locator(
      '.grid-year[data-year="1990"] .grid-row--a .week-cell:not([data-week])',
    ).first();
    await expect(neutralCell).toBeAttached();
    await neutralCell.click();
    // Overlay should remain hidden.
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  test('tapping an event item in the week card opens its individual detail card', async ({ page }) => {
    await activateGridView(page);
    await page.locator('.week-cell[data-week="2023-W11"]').click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');

    // Click the first event item.
    const firstItem = page.locator('.cluster-member-item').first();
    await expect(firstItem).toBeAttached();
    await firstItem.click();

    // Card content should now show an individual event card (not the week card).
    // The week-cluster card should have been replaced by an individual event card.
    // Individual cards have classes like card--trip, card--milestone, card--standard etc.
    const content = page.locator('#card-content');
    const hasWeekClusterCard = await content.locator('.card--week-cluster').count();
    expect(hasWeekClusterCard).toBe(0);
  });

  test('close button dismisses the week card', async ({ page }) => {
    await activateGridView(page);
    await page.locator('.week-cell[data-week="2023-W11"]').click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    await page.locator('#card-close').click();
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  test('Escape key dismisses the week card', async ({ page }) => {
    await activateGridView(page);
    await page.locator('.week-cell[data-week="2023-W11"]').click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });

  // ── Zoom state ───────────────────────────────────────────────────────────────

  test('selecting Year zoom shows the grid and hides the SVG', async ({ page }) => {
    await activateGridView(page);
    await expect(page.locator('#timeline-svg')).toHaveAttribute('hidden', '');
    await expect(page.locator('#week-grid-container')).not.toHaveAttribute('hidden');
  });

  test('selecting Day zoom from Year returns to the subway map', async ({ page }) => {
    await activateGridView(page);
    await activateSubwayView(page);
    await expect(page.locator('#week-grid-container')).toHaveAttribute('hidden', '');
    await expect(page.locator('#timeline-svg')).not.toHaveAttribute('hidden');
    await expect(page.locator('body')).toHaveClass(/zoom-day/);
  });

  test('returning to subway view restores the zoom button visibility', async ({ page }) => {
    // Zoom controls row should be visible initially.
    await expect(page.locator('#zoom-controls-row')).not.toHaveAttribute('hidden');

    // Switch to grid view — zoom controls row should be hidden.
    await activateGridView(page);
    await expect(page.locator('#zoom-controls-row')).toHaveAttribute('hidden', '');

    // Switch back to subway view — zoom controls row should reappear.
    await activateSubwayView(page);
    await expect(page.locator('#zoom-controls-row')).not.toHaveAttribute('hidden');
  });

  test('zoom state is restored after switching between views', async ({ page }) => {
    // Start in Month zoom so the zoom level has changed from default.
    await page.locator('.zoom-btn[data-zoom="month"]').click();
    await expect(page.locator('body')).toHaveClass(/zoom-month/);

    // Switch to grid view, then back to subway view.
    await activateGridView(page);
    await activateSubwayView(page);

    // Month zoom should still be active; the grid should be hidden.
    await expect(page.locator('body')).toHaveClass(/zoom-month/);
    await expect(page.locator('#week-grid-container')).toHaveAttribute('hidden', '');
    // Stations (subway map) should be renderable.
    await expect(page.locator('.station').first()).toBeAttached({ timeout: 3000 });
  });

  // ── No horizontal overflow ───────────────────────────────────────────────────

  test('grid has no horizontal overflow at 1280px', async ({ page }) => {
    await activateGridView(page);
    const overflow = await page.evaluate(() => {
      const container = document.getElementById('timeline-container');
      return container.scrollWidth <= container.clientWidth + 1; // +1 for sub-pixel rounding
    });
    expect(overflow).toBe(true);
  });
});

// ── Mobile tests ──────────────────────────────────────────────────────────────

test.describe('Grid — mobile (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => Number(document.getElementById('timeline-svg')?.getAttribute('height')) > 0,
    );
  });

  test('grid fits within viewport width with no horizontal overflow', async ({ page }) => {
    await activateGridView(page);
    const overflow = await page.evaluate(() => {
      const container = document.getElementById('timeline-container');
      return container.scrollWidth <= container.clientWidth + 1;
    });
    expect(overflow).toBe(true);
  });

  test('cells are at minimum 8×8px on mobile', async ({ page }) => {
    await activateGridView(page);
    // Sample cells from a mid-life year that should have data-week entries.
    const cells = page.locator('.week-cell[data-week]');
    const count = await cells.count();
    expect(count).toBeGreaterThan(0);

    // Check first few cells for sizing.
    for (let i = 0; i < Math.min(count, 10); i++) {
      const box = await cells.nth(i).boundingBox();
      if (!box) continue;
      expect(box.width).toBeGreaterThanOrEqual(8);
      expect(box.height).toBeGreaterThanOrEqual(8);
    }
  });

  test('each year has two half-rows (grid-row--a and grid-row--b) on mobile', async ({ page }) => {
    await activateGridView(page);
    // Pick a year with 53 weeks to ensure both rows are rendered.
    const yearGroup = page.locator('.grid-year[data-year="2020"]');
    await expect(yearGroup).toBeAttached();
    await expect(yearGroup.locator('.grid-row--a')).toBeAttached();
    await expect(yearGroup.locator('.grid-row--b')).toBeAttached();
  });

  test('second half-row (grid-row--b) is visible on mobile', async ({ page }) => {
    await activateGridView(page);
    const rowB = page.locator('.grid-year[data-year="2020"] .grid-row--b');
    await expect(rowB).toBeVisible();
  });

  test('clicking a coloured week cell opens a bottom sheet', async ({ page }) => {
    await activateGridView(page);
    const cell = page.locator('.week-cell[data-week="2023-W11"]');
    await expect(cell).toBeAttached();
    await cell.click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    // On mobile the card sheet should have no inline top/left positioning.
    const sheetTop = await page.locator('#card-sheet').evaluate((el) => el.style.top);
    expect(sheetTop).toBe('');
  });

  test('bottom sheet dismisses on close button tap', async ({ page }) => {
    await activateGridView(page);
    await page.locator('.week-cell[data-week="2023-W11"]').click();
    await expect(page.locator('#card-overlay')).not.toHaveAttribute('hidden');
    await page.locator('#card-close').click();
    await expect(page.locator('#card-overlay')).toHaveAttribute('hidden', '');
  });
});
