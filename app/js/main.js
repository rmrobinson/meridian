/**
 * main.js — Bootstrap, pre-computation pipeline, wires modules together.
 *
 * Load order:
 *   1. fetchTimeline()  — fetch + normalize API/mock response  (api.js)
 *   2. Build layout     — compute totalHeight, pxPerDay        (lines.js)
 *   3. Build render objects — year markers, span-lines, stations (here)
 *   4. initTimeline()   — hand off to the virtualized renderer  (timeline.js)
 */

import { fetchTimeline } from './api.js';
import { timeToY } from './lines.js';
import { initTimeline } from './timeline.js';

const PX_PER_DAY = 2;
const MS_PER_DAY = 86_400_000;

/**
 * Pixel height of the branch / merge bezier curve.
 * Must match the value used by timeline.js when drawing paths.
 * Stored on each span-line render object so the two modules stay in sync.
 */
const CURVE_HEIGHT = 40;

/** Horizontal distance (px) between adjacent lanes. */
const LANE_WIDTH = 80;

/** In Phase 1 serve the mock fixture. Phase 4 replaces with the real endpoint. */
const DATA_URL = '/tests/fixtures/mock-timeline.json';

async function init() {
  const data = await fetchTimeline(DATA_URL);

  // Clamp to midnight so year-marker positions are stable.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const birthDate = new Date(data.person.birth_date);
  const totalDays  = (today - birthDate) / MS_PER_DAY;
  const totalHeight = Math.ceil(totalDays) * PX_PER_DAY;

  const layout = { totalHeight, today, birthDate, pxPerDay: PX_PER_DAY };

  function yFor(date) {
    return timeToY(date, birthDate, today, totalHeight);
  }

  // Build a lookup so we can get family properties by id.
  const familyById = new Map(data.line_families.map((f) => [f.id, f]));

  const renderObjects = [];

  // ── Year markers ──────────────────────────────────────────────────────────

  const birthYear   = birthDate.getFullYear();
  const currentYear = today.getFullYear();

  for (let yr = currentYear; yr >= birthYear; yr--) {
    const y = yFor(new Date(`${yr}-01-01`));
    if (y < 0 || y > totalHeight) continue;
    renderObjects.push({ type: 'year-marker', id: `year-${yr}`, y, label: String(yr), isToday: false });
  }

  renderObjects.push({ type: 'year-marker', id: 'marker-today',  y: 0,           label: formatDate(today),     isToday: true  });
  renderObjects.push({ type: 'year-marker', id: 'marker-birth',  y: totalHeight, label: formatDate(birthDate), isToday: false });

  // ── Pass 1 — span-line render objects + start / end stations ─────────────
  //
  // Phase 1 uses a naive single-lane assignment per side.
  // Phase 2 replaces this with the full concurrent lane-assignment algorithm.

  for (const evt of data.events) {
    if (evt.type !== 'span') continue;

    const family = familyById.get(evt.family_id);
    if (!family) continue;

    const yStart = yFor(evt.start_date);
    const yEnd   = yFor(evt.end_date);

    // Skip spans entirely outside the canvas.
    if (yEnd < 0 || yStart > totalHeight) continue;

    const laneOffset = family.side === 'right' ? LANE_WIDTH : -LANE_WIDTH;
    const color      = hslColor(family.base_color_hsl);

    renderObjects.push({
      type:        'span-line',
      id:          `span-${evt.id}`,
      eventId:     evt.id,
      familyId:    family.id,
      laneOffset,
      yStart:      Math.max(0, yStart),
      yEnd:        Math.min(totalHeight, yEnd),
      curveHeight: CURVE_HEIGHT,
      on_end:      family.on_end,
      color,
    });

    // Start station: sits at yStart — the branch bezier arrives here on the lane.
    const yStation = yStart;
    if (yStation >= 0 && yStation <= totalHeight) {
      renderObjects.push({
        type: 'station', id: evt.id,
        y: yStation, laneOffset, color, event: evt, isMajor: false,
      });
    }

    // End station: sits at the start of the merge bezier on the lane.
    if (yEnd >= 0 && yEnd <= totalHeight) {
      renderObjects.push({
        type: 'station', id: `${evt.id}-end`,
        y: yEnd, laneOffset, color, event: evt, isMajor: false,
      });
    }
  }

  // ── Pass 2 — point event stations (all on the spine) ─────────────────────

  for (const evt of data.events) {
    if (evt.type !== 'point') continue;
    const date = evt.date;
    if (!date) continue;

    const y = yFor(date);
    if (y < 0 || y > totalHeight) continue;

    const isMajor =
      evt.family_id === 'spine' &&
      evt.metadata?.milestone_type !== 'birthday';

    renderObjects.push({
      type: 'station', id: evt.id,
      y, laneOffset: 0, color: null, event: evt, isMajor,
    });
  }

  // ── Hand off ──────────────────────────────────────────────────────────────

  const svg             = document.getElementById('timeline-svg');
  const scrollContainer = document.getElementById('timeline-container');

  initTimeline({ svg, scrollContainer, layout, renderObjects });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hslColor([h, s, l]) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

init().catch((err) => {
  console.error('Timeline failed to initialize:', err);
});
