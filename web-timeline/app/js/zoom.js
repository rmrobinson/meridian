/**
 * zoom.js — Zoom level constants and aggregation logic.
 *
 * Three zoom levels, each defined by their pixels-per-day scale:
 *   ZOOM_DAY:   2px/day    (~51 100px total for a 35-year life)
 *   ZOOM_WEEK:  0.55px/day (~14 200px total; uses clustering like day view)
 *   ZOOM_MONTH: 0.25px/day (~6 400px total; uses month-based aggregation)
 *
 * Aggregation functions are pure — no DOM dependency, no side effects.
 */

export const ZOOM_DAY   = 2;      // px per day
export const ZOOM_WEEK  = 0.55;   // px per day
export const ZOOM_MONTH = 0.25;   // px per day

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
    const [yr, mo] = year_month.split('-');

    // Single-event buckets: inherit the source event's icon and label so the
    // station looks identical to a day-view station. Multi-event buckets: show
    // a count label and no icon so they're visually distinct from point stations.
    const single = evts.length === 1;
    const familyLabel = family ? family.label : 'events';
    const icon  = single ? (evts[0].icon ?? null) : null;
    const label = single ? (evts[0].label ?? null) : null;
    const title = single ? evts[0].title : `${evts.length} ${familyLabel}`;

    aggregates.push({
      id:            `agg-${family_id}-${year_month}`,
      type:          'aggregate',
      family_id,
      line_key:      evts[0].line_key,
      year_month,
      count:         evts.length,
      icon,
      label,
      title,
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
