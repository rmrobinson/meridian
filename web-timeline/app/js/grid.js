/**
 * grid.js — Week grid view: WeekMap pre-computation and DOM renderer.
 *
 * Activated when the user selects Year zoom. Renders a rectangular grid
 * where each row is a calendar year (birth year → current year) and each
 * column is an ISO week number. Cells are coloured by the highest-priority
 * active span that week:
 *
 *   1. Travel   — base_color_hsl from the travel family definition
 *   2. Employment — base_color_hsl from the employment family definition
 *   3. Education  — base_color_hsl from the education family definition
 *   4. Residence  — hue derived from the most recent spine relocation event
 *   (null)       — no data / before birth / after current week
 *
 * Public API:
 *   buildWeekMap(data, colorFn)  → weekMap object  (pure, safe to call many times)
 *   renderGrid(weekMap, data, container)  → void  (writes DOM)
 *   locationHue(label)           → number [0, 360)
 *   residenceColor(label)        → CSS color string
 *
 * colorFn (passed to buildWeekMap) must have the signature: ([h, s, l]) → CSS string.
 * Pass main.js's hslColor() so theme-aware lightness adjustment is applied.
 */

// ── ISO week helpers ──────────────────────────────────────────────────────────

/**
 * Return the ISO week number (1–53) for a UTC date.
 * ISO weeks start on Monday; week 1 contains the first Thursday of the year.
 */
export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to nearest Thursday (ISO week's anchor day).
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
}

/**
 * Return the ISO week-year for a UTC date.
 * This can differ from the calendar year for days in early January or late December.
 */
export function isoWeekYear(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

/**
 * Number of ISO weeks in a given ISO year (52 or 53).
 * A year has 53 weeks if 1 Jan is Thursday, or if it is a leap year with 1 Jan on Wednesday.
 */
export function isoWeeksInYear(year) {
  const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();   // 0 = Sun
  const dec31Day = new Date(Date.UTC(year, 11, 31)).getUTCDay();
  return (jan1Day === 4 || dec31Day === 4) ? 53 : 52;
}

/**
 * Return the Monday (UTC) that starts ISO week `week` of ISO year `year`.
 */
export function isoWeekStart(year, week) {
  // 4 January is always in week 1 of its ISO year.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Mon=1 … Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const result = new Date(week1Monday);
  result.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return result;
}

/**
 * Return the Sunday (UTC) that ends ISO week `week` of ISO year `year`.
 */
function isoWeekEnd(year, week) {
  const start = isoWeekStart(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return end;
}

/**
 * Zero-pad a week number to two digits, e.g. 3 → "03".
 */
function padWeek(w) {
  return String(w).padStart(2, '0');
}

// ── Residence colour ──────────────────────────────────────────────────────────

/**
 * Deterministically map a location label string to a hue in [0, 360).
 * The same label always produces the same hue across sessions and devices.
 *
 * @param {string} label
 * @returns {number}
 */
export function locationHue(label) {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return Math.abs(hash) % 360;
}

/**
 * Generate a CSS color for a residence location label.
 * Fixed saturation (40 %) keeps residence colours visually subordinate to
 * the richer family colours. The lightness token adapts to dark/light mode.
 *
 * @param {string} label
 * @returns {string}
 */
export function residenceColor(label) {
  const h = locationHue(label);
  return `hsl(${h}, 40%, var(--residence-l))`;
}

// ── WeekMap pre-computation ───────────────────────────────────────────────────

/**
 * Build a flat WeekMap keyed by "YYYY-Wnn" (ISO week year + week number).
 *
 * Each entry is one of:
 *   { family: 'travel'|'employment'|'education', eventId, color }
 *   { family: 'residence', label, color }
 *   null   — no data (before birth, after current week, or no known residence)
 *
 * @param {object} data      - Normalized API response from api.js.
 * @param {Function} colorFn - ([h,s,l]) → CSS string. Pass main.js's hslColor().
 * @returns {object}         - Plain object: weekKey → entry | null
 */
export function buildWeekMap(data, colorFn) {
  const today         = new Date();
  const timelineStart = data.timelineStart;

  // Current ISO week boundaries — weeks beyond this are excluded.
  const currentISOYear = isoWeekYear(today);
  const currentISOWeek = isoWeekNumber(today);

  // Timeline start ISO week — weeks before this are null.
  const birthISOYear = isoWeekYear(timelineStart);
  const birthISOWeek = isoWeekNumber(timelineStart);

  // Build a lookup from family id → color string.
  const familyColor = new Map();
  for (const f of data.line_families ?? []) {
    familyColor.set(f.id, colorFn(f.base_color_hsl));
  }

  // ── Collect span events by priority family ──────────────────────────────

  const travelSpans     = [];
  const employmentSpans = [];
  const educationSpans  = [];

  for (const evt of data.events ?? []) {
    if (evt.type !== 'span') continue;
    const entry = { id: evt.id, start: new Date(evt.start_date), end: evt.end_date ? new Date(evt.end_date) : new Date() };
    if (evt.family_id === 'travel')     travelSpans.push(entry);
    if (evt.family_id === 'employment') employmentSpans.push(entry);
    if (evt.family_id === 'education')  educationSpans.push(entry);
  }

  // ── Collect spine relocation events, sorted ascending by date ──────────
  //
  // Only primary spine (line_key === 'spine') events are used, per spec.

  const relocations = (data.events ?? [])
    .filter(
      (e) =>
        e.family_id === 'spine' &&
        e.line_key  === 'spine' &&
        e.metadata?.milestone_type === 'relocation' &&
        e.location?.label,
    )
    .map((e) => ({ date: new Date(e.date), label: e.location.label }))
    .sort((a, b) => a.date - b.date);

  // ── Iterate over every ISO week from birth year to current year ─────────

  const weekMap = Object.create(null);

  const startISOYear = birthISOYear;
  const endISOYear   = currentISOYear;

  for (let yr = startISOYear; yr <= endISOYear; yr++) {
    const totalWeeks = isoWeeksInYear(yr);

    for (let wk = 1; wk <= totalWeeks; wk++) {
      // Skip weeks before birth.
      if (yr === birthISOYear && wk < birthISOWeek) continue;

      // Skip weeks after the current ISO week.
      if (yr === currentISOYear && wk > currentISOWeek) continue;
      // If we've gone past the current year entirely, stop.
      if (yr > currentISOYear) break;

      const weekKey  = `${yr}-W${padWeek(wk)}`;
      const weekSt   = isoWeekStart(yr, wk);
      const weekEn   = isoWeekEnd(yr, wk);

      // Priority 1: travel
      const travelMatch = bestTravelSpan(travelSpans, weekSt, weekEn);
      if (travelMatch) {
        weekMap[weekKey] = {
          family:  'travel',
          eventId: travelMatch.id,
          color:   familyColor.get('travel') ?? null,
        };
        continue;
      }

      // Priority 2: employment
      const employMatch = firstOverlappingSpan(employmentSpans, weekSt, weekEn);
      if (employMatch) {
        weekMap[weekKey] = {
          family:  'employment',
          eventId: employMatch.id,
          color:   familyColor.get('employment') ?? null,
        };
        continue;
      }

      // Priority 3: education
      const eduMatch = firstOverlappingSpan(educationSpans, weekSt, weekEn);
      if (eduMatch) {
        weekMap[weekKey] = {
          family:  'education',
          eventId: eduMatch.id,
          color:   familyColor.get('education') ?? null,
        };
        continue;
      }

      // Priority 4: residence — most recent relocation on or before week start.
      const reloc = mostRecentRelocation(relocations, weekSt);
      if (reloc) {
        weekMap[weekKey] = {
          family: 'residence',
          label:  reloc.label,
          color:  residenceColor(reloc.label),
        };
        continue;
      }

      // No data.
      weekMap[weekKey] = null;
    }
  }

  return weekMap;
}

/**
 * Among travel spans that overlap [weekSt, weekEn], return the one with the
 * latest start_date. Returns null if none overlap.
 */
function bestTravelSpan(spans, weekSt, weekEn) {
  let best = null;
  for (const s of spans) {
    if (s.start > weekEn || s.end < weekSt) continue;  // no overlap
    if (!best || s.start > best.start) best = s;
  }
  return best;
}

/**
 * Return the first span in `spans` that overlaps [weekSt, weekEn], or null.
 */
function firstOverlappingSpan(spans, weekSt, weekEn) {
  for (const s of spans) {
    if (s.start <= weekEn && s.end >= weekSt) return s;
  }
  return null;
}

/**
 * Return the most recent relocation whose date is on or before `weekSt`.
 * `relocations` must be sorted ascending by date.
 */
function mostRecentRelocation(relocations, weekSt) {
  let result = null;
  for (const r of relocations) {
    if (r.date <= weekSt) result = r;
    else break;
  }
  return result;
}

// ── DOM renderer ──────────────────────────────────────────────────────────────

// Cell and layout constants — must stay in sync with grid.css.
// Two size tiers, switching at the same 479px breakpoint as the CSS.
const SMALL_BREAKPOINT = 479; // px — matches @media (max-width: 479px) in grid.css
const CELL_LG = 14, GAP_LG = 2, LABEL_LG = 40, PAD_LG = 32; // total h-padding
const CELL_SM = 8,  GAP_SM = 1, LABEL_SM = 30, PAD_SM = 16;

/**
 * Return true if all 53 (max) cells fit in a single row at the current window width.
 * Uses 53 rather than the year's actual week count so the decision is consistent
 * across all rows (a 52-week year looks identical to a 53-week year layout-wise).
 */
function fitsInOneRow() {
  const small  = window.innerWidth <= SMALL_BREAKPOINT;
  const cellW  = small ? CELL_SM : CELL_LG;
  const cellG  = small ? GAP_SM  : GAP_LG;
  const labelW = small ? LABEL_SM : LABEL_LG;
  const padX   = small ? PAD_SM  : PAD_LG;
  // 53 cells + 52 gaps + label + padding must fit within the window.
  return window.innerWidth >= 53 * cellW + 52 * cellG + labelW + padX;
}

/**
 * Render the week grid into `container`, replacing any existing content.
 *
 * Determines the layout (single row vs two half-rows) by measuring whether
 * all 53 cells fit at the current window width rather than using a fixed px
 * breakpoint, so the split happens exactly when needed.
 *
 * @param {object}   weekMap   - Output of buildWeekMap().
 * @param {object}   data      - Normalized API response (used for birth/current year).
 * @param {Element}  container - The #week-grid-container element.
 */
export function renderGrid(weekMap, data, container) {
  const splitIntoHalves = !fitsInOneRow();

  const today         = new Date();
  const timelineStart = data.timelineStart;

  const birthISOYear   = isoWeekYear(timelineStart);
  const currentISOYear = isoWeekYear(today);

  container.innerHTML = '';

  const gridEl = document.createElement('div');
  gridEl.className = 'week-grid';

  // Rows from birth year to current year (top = birth, bottom = current year).
  for (let yr = birthISOYear; yr <= currentISOYear; yr++) {
    const totalWeeks = isoWeeksInYear(yr);

    const yearEl = document.createElement('div');
    yearEl.className = 'grid-year';
    yearEl.dataset.year = yr;

    if (splitIntoHalves) {
      // Two half-rows: W01–W26 (row A) and W27–end (row B).
      yearEl.appendChild(buildRow(yr, 1, Math.min(26, totalWeeks), weekMap, String(yr), 'grid-row--a'));
      if (totalWeeks > 26) {
        yearEl.appendChild(buildRow(yr, 27, totalWeeks, weekMap, '', 'grid-row--b'));
      }
    } else {
      // Single row with all weeks.
      yearEl.appendChild(buildRow(yr, 1, totalWeeks, weekMap, String(yr), 'grid-row--a'));
    }

    gridEl.appendChild(yearEl);
  }

  container.appendChild(gridEl);
}

/**
 * Build a single .grid-row element for weeks `startWk` through `endWk` of `yr`.
 *
 * @param {number} yr         - ISO year.
 * @param {number} startWk    - First week number to include (1-based).
 * @param {number} endWk      - Last week number to include (inclusive).
 * @param {object} weekMap    - WeekMap from buildWeekMap().
 * @param {string} labelText  - Text for the row label (empty string for indent row).
 * @param {string} rowClass   - Extra CSS class ('grid-row--a' or 'grid-row--b').
 * @returns {HTMLElement}
 */
function buildRow(yr, startWk, endWk, weekMap, labelText, rowClass) {
  const row = document.createElement('div');
  row.className = `grid-row ${rowClass}`;

  // Row label (year number or blank indent spacer).
  const label = document.createElement('span');
  label.className = labelText ? 'row-label' : 'row-label row-label--indent';
  label.textContent = labelText;
  row.appendChild(label);

  for (let wk = startWk; wk <= endWk; wk++) {
    const weekKey = `${yr}-W${padWeek(wk)}`;
    const entry   = weekMap[weekKey];

    const cell = document.createElement('div');
    cell.className = 'week-cell';

    if (entry !== null && entry !== undefined) {
      cell.dataset.week = weekKey;
      cell.style.background = entry.color;
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', weekLabel(yr, wk, entry));
    }

    row.appendChild(cell);
  }

  return row;
}

/**
 * Build a human-readable aria-label for a week cell.
 */
function weekLabel(yr, wk, entry) {
  const base = `Year ${yr}, week ${wk}`;
  if (entry.family === 'residence') return `${base} — ${entry.label}`;
  return `${base} — ${entry.family}`;
}

// ── Event collection for click handler ───────────────────────────────────────

/**
 * Collect all events from `data` that overlap a given ISO week.
 * Includes span events where start_date ≤ weekEnd AND end_date ≥ weekStart,
 * and point events where date falls within the week.
 *
 * @param {string} weekKey  - e.g. "2023-W11"
 * @param {object} data     - Normalized API response.
 * @returns {object[]}      - Array of event objects (may be empty).
 */
export function eventsForWeek(weekKey, data) {
  const [yearStr, wStr] = weekKey.split('-W');
  const yr  = Number(yearStr);
  const wk  = Number(wStr);
  const weekSt = isoWeekStart(yr, wk);
  const weekEn = isoWeekEnd(yr, wk);

  const results = [];
  for (const evt of data.events ?? []) {
    if (evt.type === 'span') {
      const start = new Date(evt.start_date);
      const end   = evt.end_date ? new Date(evt.end_date) : new Date();
      if (start <= weekEn && end >= weekSt) results.push(evt);
    } else if (evt.type === 'point') {
      const d = new Date(evt.date);
      if (d >= weekSt && d <= weekEn) results.push(evt);
    }
  }
  return results;
}
