/**
 * main.js — Bootstrap, pre-computation pipeline, wires modules together.
 *
 * Load order:
 *   1. fetchTimeline()  — fetch + normalize API/mock response  (api.js)
 *   2. assignLanes()    — compute lane offsets for all span events (lanes.js)
 *   3. Build render objects — year markers, span-lines, stations (here)
 *   4. initTimeline()   — hand off to the virtualized renderer  (timeline.js)
 */

import { fetchTimeline } from './api.js';
import { timeToY } from './lines.js';
import { assignLanes, LANE_WIDTH } from './lanes.js';
import { initTimeline } from './timeline.js';

const PX_PER_DAY = 2;
const MS_PER_DAY = 86_400_000;

/**
 * Pixel height of the branch / merge bezier curve.
 * Must match the value used by timeline.js when drawing paths.
 * Stored on each span-line render object so the two modules stay in sync.
 */
const CURVE_HEIGHT = 40;

/** In Phase 1 serve the mock fixture. Phase 4 replaces with the real endpoint. */
const DATA_URL = '/tests/fixtures/mock-timeline.json';

async function init() {
  const data = await fetchTimeline(DATA_URL);

  // Clamp to midnight so year-marker positions are stable.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const birthDate   = new Date(data.person.birth_date);
  const totalDays   = (today - birthDate) / MS_PER_DAY;
  const totalHeight = Math.ceil(totalDays) * PX_PER_DAY;

  const layout = { totalHeight, today, birthDate, pxPerDay: PX_PER_DAY };

  function yFor(date) {
    return timeToY(date, birthDate, today, totalHeight);
  }

  // Build a lookup so we can get family properties by id.
  const familyById = new Map(data.line_families.map((f) => [f.id, f]));

  // ── Lane assignment ────────────────────────────────────────────────────────

  const laneMap = assignLanes(data.events, data.line_families);

  const renderObjects = [];

  // ── Year markers ──────────────────────────────────────────────────────────

  const birthYear   = birthDate.getFullYear();
  const currentYear = today.getFullYear();

  for (let yr = currentYear; yr >= birthYear; yr--) {
    const y = yFor(new Date(`${yr}-01-01`));
    if (y < 0 || y > totalHeight) continue;
    renderObjects.push({ type: 'year-marker', id: `year-${yr}`, y, label: String(yr), isToday: false });
  }

  renderObjects.push({ type: 'year-marker', id: 'marker-today', y: 0,           label: formatDate(today),     isToday: true  });
  renderObjects.push({ type: 'year-marker', id: 'marker-birth', y: totalHeight, label: formatDate(birthDate), isToday: false });

  // ── Pass 1 — span-line render objects + start / end stations ─────────────

  const spanRenderObjects = [];

  for (const evt of data.events) {
    if (evt.type !== 'span') continue;

    const family = familyById.get(evt.family_id);
    if (!family) continue;

    const info = laneMap.get(evt.line_key);
    if (!info) continue;

    const yStart = yFor(evt.start_date);
    const yEnd   = yFor(evt.end_date);

    // Skip spans entirely outside the canvas.
    if (yEnd < 0 || yStart > totalHeight) continue;

    const { laneOffset, parentOffset, colorIndex } = info;

    // per_event families get hue-shifted color variants so concurrent siblings
    // are visually distinct. single_line families always use the base color.
    const color = family.spawn_behavior === 'per_event'
      ? variantColor(family.base_color_hsl, colorIndex)
      : hslColor(family.base_color_hsl);

    const spanObj = {
      type:         'span-line',
      id:           `span-${evt.id}`,
      eventId:      evt.id,
      familyId:     family.id,
      laneOffset,
      parentOffset,
      yStart:       Math.max(0, yStart),
      yEnd:         Math.min(totalHeight, yEnd),
      curveHeight:  CURVE_HEIGHT,
      on_end:       family.on_end,
      color,
      // Sibling fields computed in Pass 1b below.
      siblingCount: 1,
      siblingIndex: 0,
    };
    spanRenderObjects.push(spanObj);

    // Start station: at yStart (branch bezier arrives here on the lane).
    if (yStart >= 0 && yStart <= totalHeight) {
      renderObjects.push({
        type: 'station', id: evt.id,
        y: yStart, laneOffset, color, event: evt, isMajor: false,
      });
    }

    // End station: at yEnd (merge bezier departs from here).
    if (yEnd >= 0 && yEnd <= totalHeight) {
      renderObjects.push({
        type: 'station', id: `${evt.id}-end`,
        y: yEnd, laneOffset, color, event: evt, isMajor: false,
      });
    }
  }

  // ── Pass 1b — compute siblingCount and siblingIndex ───────────────────────
  //
  // Two spans are siblings if they share the same familyId and their Y ranges
  // overlap. yStart > yEnd (yStart = older = larger Y).
  // Overlap: b.yEnd <= a.yStart AND b.yStart >= a.yEnd.
  // siblingIndex = number of siblings whose |laneOffset| is strictly smaller
  // (0 = innermost; shown on mobile as the collapsed representative).

  const spansByFamily = new Map();
  for (const obj of spanRenderObjects) {
    if (!spansByFamily.has(obj.familyId)) spansByFamily.set(obj.familyId, []);
    spansByFamily.get(obj.familyId).push(obj);
  }

  for (const siblings of spansByFamily.values()) {
    if (siblings.length < 2) continue;

    for (const a of siblings) {
      let concurrentCount = 1; // include self
      let innerSiblings   = 0; // how many siblings have smaller |laneOffset|

      for (const b of siblings) {
        if (b === a) continue;
        const overlaps = b.yEnd <= a.yStart && b.yStart >= a.yEnd;
        if (!overlaps) continue;

        concurrentCount++;
        if (Math.abs(b.laneOffset) < Math.abs(a.laneOffset)) innerSiblings++;
      }

      if (concurrentCount > 1) {
        a.siblingCount = concurrentCount;
        a.siblingIndex = innerSiblings;
      }
    }
  }

  renderObjects.push(...spanRenderObjects);

  // ── Pass 2 — point event stations ────────────────────────────────────────
  //
  // Spine point events go on the spine (laneOffset: 0).
  // Non-spine point events inherit their line's lane if one is assigned
  // (relevant for single_line families like fitness).

  for (const evt of data.events) {
    if (evt.type !== 'point') continue;
    const date = evt.date;
    if (!date) continue;

    const y = yFor(date);
    if (y < 0 || y > totalHeight) continue;

    const laneInfo   = laneMap.get(evt.line_key);
    const laneOffset = laneInfo?.laneOffset ?? 0;
    const family     = familyById.get(evt.family_id);
    const color      = (family && laneInfo)
      ? variantColor(family.base_color_hsl, laneInfo.colorIndex)
      : null;

    const isMajor =
      evt.family_id === 'spine' &&
      evt.metadata?.milestone_type !== 'birthday';

    renderObjects.push({
      type: 'station', id: evt.id,
      y, laneOffset, color, event: evt, isMajor,
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

/**
 * Shift hue by 15° per colorIndex so concurrent siblings in the same family
 * are visually distinct while remaining recognizably related.
 */
function variantColor([h, s, l], colorIndex) {
  const shiftedH = (h + colorIndex * 15) % 360;
  return `hsl(${shiftedH}, ${s}%, ${l}%)`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

init().catch((err) => {
  console.error('Timeline failed to initialize:', err);
});
