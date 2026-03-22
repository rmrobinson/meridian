/**
 * zoom.js — Zoom level state, viewBox transitions.
 *
 * Three levels:
 *   "day"   — ~2px/day, every event as a full station with label
 *   "month" — events aggregated per (family_id, year-month)
 *   "year"  — span lines only + single milestone per span at midpoint
 *
 * Zoom state is the only piece of global state this module owns.
 * Aggregation logic for month/year is also here (pure functions, no DOM).
 */

export const ZOOM_LEVELS = /** @type {const} */ (['day', 'month', 'year']);

let _currentZoom = 'day';

export function getZoom() {
  return _currentZoom;
}

export function setZoom(level) {
  if (!ZOOM_LEVELS.includes(level)) {
    throw new Error(`Unknown zoom level: ${level}`);
  }
  _currentZoom = level;
}

/**
 * Aggregate point events by (family_id, year-month) bucket.
 * Span events are never aggregated.
 *
 * @param {object[]} events
 * @returns {object[]} Replacement event list with aggregate placeholders.
 */
export function aggregateByMonth(events) {
  // TODO: implement in Phase 2 (zoom.test.js drives the spec).
  return events;
}

/**
 * Filter events for year zoom: hide all point events, keep only spans.
 * Returns a version of each span with a synthetic midpoint station.
 *
 * @param {object[]} events
 * @returns {object[]}
 */
export function filterForYearZoom(events) {
  // TODO: implement in Phase 2.
  return events.filter((e) => e.type === 'span');
}
