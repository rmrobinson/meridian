/**
 * zoom.js — Zoom level constants and aggregation logic.
 *
 * Three zoom levels, each defined by their pixels-per-day scale:
 *   ZOOM_DAY:   2px/day  (~51 100px total for a 35-year life)
 *   ZOOM_MONTH: 0.25px/day (~6 400px total)
 *   ZOOM_YEAR:  0.07px/day (~1 800px total)
 *
 * All aggregation functions are pure — no DOM dependency, no side effects.
 * The only module-level state is the current zoom level.
 */

export const ZOOM_DAY   = 2;     // px per day
export const ZOOM_MONTH = 0.25;  // px per day
export const ZOOM_YEAR  = 0.07;  // px per day

export const ZOOM_LEVELS = [ZOOM_DAY, ZOOM_MONTH, ZOOM_YEAR];

let _currentZoom = ZOOM_DAY;

export function getZoom() {
  return _currentZoom;
}

export function setZoom(pxPerDay) {
  if (!ZOOM_LEVELS.includes(pxPerDay)) {
    throw new Error(
      `Unknown zoom level: ${pxPerDay}. Expected one of ${ZOOM_LEVELS.join(', ')}.`,
    );
  }
  _currentZoom = pxPerDay;
}

/**
 * Aggregate point events by (family_id, year-month) bucket.
 * Span events and any non-point events pass through unchanged.
 *
 * Each bucket produces one aggregate object with `type: 'aggregate'`, a
 * `count` of the source events, and a representative `date` at the 15th of
 * the month. The original events are preserved in `events[]` for card rendering.
 *
 * @param {object[]} events        - Raw events array from the API.
 * @param {object[]} line_families - Family definitions (used for aggregate labels).
 * @returns {object[]}             - Mixed array of pass-through + aggregate events.
 */
export function aggregateByMonth(events, line_families = []) {
  const familyById = new Map(line_families.map((f) => [f.id, f]));

  /** key: `${family_id}/${year_month}` → { family_id, year_month, events[] } */
  const buckets    = new Map();
  const passThrough = [];

  for (const evt of events) {
    if (evt.type !== 'point' || !evt.date) {
      passThrough.push(evt);
      continue;
    }

    const d     = new Date(evt.date);
    const year  = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year_month = `${year}-${month}`;
    const key        = `${evt.family_id}/${year_month}`;

    if (!buckets.has(key)) {
      buckets.set(key, { family_id: evt.family_id, year_month, events: [] });
    }
    buckets.get(key).events.push(evt);
  }

  const aggregates = [];
  for (const { family_id, year_month, events: evts } of buckets.values()) {
    const family = familyById.get(family_id);
    const label  = family ? family.label : family_id;
    const [yr, mo] = year_month.split('-');

    aggregates.push({
      id:            `agg-${family_id}-${year_month}`,
      type:          'aggregate',
      family_id,
      line_key:      evts[0].line_key,
      year_month,
      count:         evts.length,
      title:         `${evts.length} ${label}`,
      date:          `${yr}-${mo}-15`,
      location:      null,
      description:   null,
      external_url:  null,
      hero_image_url: null,
      photos:        [],
      metadata:      { _aggregate: true },
      events:        evts,
    });
  }

  return [...passThrough, ...aggregates];
}

/**
 * Filter events for year zoom: retain only span events, and emit a synthetic
 * midpoint station for each span so the canvas remains interactive.
 *
 * Point events are dropped entirely. The midpoint station carries the span's
 * title and metadata so the detail card can still be shown.
 *
 * @param {object[]} events - Raw events array.
 * @returns {object[]}      - Span events interleaved with one midpoint point per span.
 */
export function filterForYearZoom(events) {
  const result = [];

  for (const evt of events) {
    if (evt.type !== 'span') continue;

    result.push(evt);

    const startMs = new Date(evt.start_date).getTime();
    const endMs   = new Date(evt.end_date).getTime();
    const midDate = new Date((startMs + endMs) / 2).toISOString().slice(0, 10);

    result.push({
      id:              `midpoint-${evt.id}`,
      type:            'point',
      family_id:       evt.family_id,
      line_key:        evt.line_key,
      parent_line_key: evt.parent_line_key ?? null,
      date:            midDate,
      start_date:      null,
      end_date:        null,
      title:           evt.title,
      location:        evt.location        ?? null,
      description:     evt.description     ?? null,
      external_url:    evt.external_url    ?? null,
      hero_image_url:  evt.hero_image_url  ?? null,
      photos:          evt.photos          ?? [],
      metadata:        { ...(evt.metadata ?? {}), _synthetic_midpoint: true },
    });
  }

  return result;
}
