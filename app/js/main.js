/**
 * main.js — Bootstrap, pre-computation pipeline, wires modules together.
 *
 * Load order:
 *   1. fetchTimeline()        — fetch + normalize API/mock response  (api.js)
 *   2. buildRenderObjects()   — lane assignment + render object array (here)
 *   3. initTimeline()         — hand off to the virtualized renderer  (timeline.js)
 *
 * Zoom changes do not re-fetch data. buildRenderObjects() is called again with
 * the new pxPerDay value, and the controller returned by initTimeline() swaps
 * the content in place.
 *
 * Devtools hook:
 *   window.__timeline_setZoom(pxPerDay)
 *   e.g. window.__timeline_setZoom(0.07)  // ZOOM_YEAR
 */

import { fetchTimeline } from './api.js';
import { timeToY } from './lines.js';
import { assignLanes } from './lanes.js';
import { initTimeline } from './timeline.js';
import {
  ZOOM_DAY, ZOOM_MONTH, ZOOM_YEAR,
  aggregateByMonth, filterForYearZoom,
} from './zoom.js';

const MS_PER_DAY = 86_400_000;

/**
 * Pixel height of the branch / merge bezier curve.
 * Stored on each span-line render object so timeline.js stays in sync.
 */
const CURVE_HEIGHT = 40;

/** In Phase 1 serve the mock fixture. Phase 4 replaces with the real endpoint. */
const DATA_URL = '/tests/fixtures/mock-timeline.json';

/** Cached API response — populated once, reused on zoom changes. */
let _data       = null;

/** Controller returned by initTimeline — exposes setRenderObjects. */
let _controller = null;

async function init() {
  _data = await fetchTimeline(DATA_URL);

  const svg             = document.getElementById('timeline-svg');
  const scrollContainer = document.getElementById('timeline-container');

  const { layout, renderObjects } = buildRenderObjects(_data, ZOOM_DAY);
  _controller = initTimeline({ svg, scrollContainer, layout, renderObjects });
}

/**
 * Build the full render-object array for a given zoom level.
 *
 * Pure function of (data, pxPerDay) — safe to call multiple times.
 *
 * @param {object} data      - Normalized API response from fetchTimeline().
 * @param {number} pxPerDay  - One of ZOOM_DAY, ZOOM_MONTH, or ZOOM_YEAR.
 * @returns {{ layout: object, renderObjects: object[] }}
 */
function buildRenderObjects(data, pxPerDay) {
  // Clamp to midnight so year-marker positions are stable.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const birthDate   = new Date(data.person.birth_date);
  const totalDays   = (today - birthDate) / MS_PER_DAY;
  const totalHeight = Math.ceil(totalDays) * pxPerDay;

  const layout = { totalHeight, today, birthDate, pxPerDay };

  function yFor(date) {
    return timeToY(date, birthDate, today, totalHeight);
  }

  const familyById = new Map(data.line_families.map((f) => [f.id, f]));

  // ── Apply zoom-level event transformation ─────────────────────────────────
  // ZOOM_DAY: all events as-is.
  // ZOOM_MONTH: point events aggregated per (family_id, year-month).
  // ZOOM_YEAR: point events dropped; one synthetic midpoint per span.

  let events = data.events;
  if (pxPerDay === ZOOM_MONTH) {
    events = aggregateByMonth(events, data.line_families);
  } else if (pxPerDay === ZOOM_YEAR) {
    events = filterForYearZoom(events);
  }

  // ── Lane assignment ────────────────────────────────────────────────────────

  const laneMap = assignLanes(events, data.line_families);

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

  for (const evt of events) {
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

  // ── Pass 2 — point / aggregate event stations ─────────────────────────────
  //
  // Spine point events go on the spine (laneOffset: 0).
  // Non-spine point events inherit their line's lane if one is assigned
  // (relevant for single_line families like fitness).
  // Aggregate events from ZOOM_MONTH are also rendered here as spine stations.

  for (const evt of events) {
    if (evt.type !== 'point' && evt.type !== 'aggregate') continue;
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

  return { layout, renderObjects };
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

// ── Devtools hook ─────────────────────────────────────────────────────────────
//
// Flip zoom level manually from the browser console:
//   window.__timeline_setZoom(0.25)  // ZOOM_MONTH
//   window.__timeline_setZoom(0.07)  // ZOOM_YEAR
//   window.__timeline_setZoom(2)     // ZOOM_DAY (default)

window.__timeline_setZoom = function (pxPerDay) {
  if (!_data || !_controller) {
    console.warn('__timeline_setZoom: timeline not yet initialized');
    return;
  }
  const { layout, renderObjects } = buildRenderObjects(_data, pxPerDay);
  _controller.setRenderObjects(layout, renderObjects);
};

// ── Boot ──────────────────────────────────────────────────────────────────────

init().catch((err) => {
  console.error('Timeline failed to initialize:', err);
});
