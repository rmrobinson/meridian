import { describe, it, expect } from 'vitest';
import { aggregateByMonth, filterForYearZoom } from '../../js/zoom.js';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeFamily(id, label = id) {
  return {
    id, label, side: 'right', on_end: 'terminate',
    spawn_behavior: 'per_event', base_color_hsl: [30, 70, 50],
  };
}

function makePoint(id, family_id, line_key, date) {
  return {
    id, type: 'point', family_id, line_key, date,
    title: id, location: null, description: null,
    external_url: null, hero_image_url: null, photos: [], metadata: {},
  };
}

function makeSpan(id, family_id, line_key, start_date, end_date, title = id) {
  return {
    id, type: 'span', family_id, line_key, parent_line_key: null,
    start_date, end_date, date: null, title,
    location: null, description: null,
    external_url: null, hero_image_url: null, photos: [], metadata: {},
  };
}

const BOOKS   = makeFamily('books',   'Books');
const FITNESS = makeFamily('fitness', 'Fitness & Health');

// ── aggregateByMonth() ────────────────────────────────────────────────────────

describe('aggregateByMonth()', () => {
  it('span events pass through unchanged', () => {
    const span = makeSpan('s1', 'books', 'k1', '2023-03-10', '2023-03-24');
    const result = aggregateByMonth([span], [BOOKS]);
    expect(result).toContain(span);
  });

  it('groups point events from the same family and month into one aggregate', () => {
    const events = [
      makePoint('e1', 'fitness', 'fitness', '2023-03-05'),
      makePoint('e2', 'fitness', 'fitness', '2023-03-12'),
      makePoint('e3', 'fitness', 'fitness', '2023-03-20'),
    ];
    const result = aggregateByMonth(events, [FITNESS]);
    const aggs = result.filter((e) => e.type === 'aggregate');
    expect(aggs).toHaveLength(1);
    expect(aggs[0].count).toBe(3);
    expect(aggs[0].family_id).toBe('fitness');
    expect(aggs[0].year_month).toBe('2023-03');
  });

  it('aggregate title contains the event count', () => {
    const events = [
      makePoint('e1', 'books', 'k1', '2023-05-01'),
      makePoint('e2', 'books', 'k2', '2023-05-15'),
    ];
    const result = aggregateByMonth(events, [BOOKS]);
    const agg = result.find((e) => e.type === 'aggregate');
    expect(agg.count).toBe(2);
    expect(agg.title).toMatch(/2/); // title contains the count
  });

  it('events from different families in the same month produce separate aggregates', () => {
    const events = [
      makePoint('e1', 'books',   'k1',      '2023-03-10'),
      makePoint('e2', 'fitness', 'fitness',  '2023-03-20'),
    ];
    const result = aggregateByMonth(events, [BOOKS, FITNESS]);
    const aggs = result.filter((e) => e.type === 'aggregate');
    expect(aggs).toHaveLength(2);
    expect(aggs.map((a) => a.family_id).sort()).toEqual(['books', 'fitness']);
  });

  it('events from the same family in different months produce separate aggregates', () => {
    const events = [
      makePoint('e1', 'fitness', 'fitness', '2023-03-10'),
      makePoint('e2', 'fitness', 'fitness', '2023-04-05'),
    ];
    const result = aggregateByMonth(events, [FITNESS]);
    const aggs = result.filter((e) => e.type === 'aggregate');
    expect(aggs).toHaveLength(2);
    expect(aggs.map((a) => a.year_month).sort()).toEqual(['2023-03', '2023-04']);
  });

  it('span events are never included inside aggregate.events[]', () => {
    const span  = makeSpan('s1', 'books', 'k1', '2023-03-01', '2023-03-31');
    const point = makePoint('e1', 'books', 'k2', '2023-03-15');
    const result = aggregateByMonth([span, point], [BOOKS]);
    const agg = result.find((e) => e.type === 'aggregate');
    expect(agg.count).toBe(1);
    expect(result.filter((e) => e.type === 'span')).toHaveLength(1);
  });

  it('aggregate date is placed at the 15th of the month', () => {
    const events = [makePoint('e1', 'fitness', 'fitness', '2023-03-07')];
    const result = aggregateByMonth(events, [FITNESS]);
    const agg = result.find((e) => e.type === 'aggregate');
    expect(agg.date).toBe('2023-03-15');
  });

  it('returns empty array when given empty input', () => {
    expect(aggregateByMonth([], [])).toEqual([]);
  });
});

// ── filterForYearZoom() ───────────────────────────────────────────────────────

describe('filterForYearZoom()', () => {
  it('removes all raw point events', () => {
    const events = [
      makePoint('e1', 'books',   'k1',      '2023-03-15'),
      makePoint('e2', 'fitness', 'fitness',  '2023-04-01'),
    ];
    const result = filterForYearZoom(events);
    // No event whose id matches the original point events should remain.
    expect(result.find((e) => e.id === 'e1')).toBeUndefined();
    expect(result.find((e) => e.id === 'e2')).toBeUndefined();
  });

  it('retains all span events', () => {
    const events = [
      makeSpan('s1', 'books',  'k1', '2023-03-01', '2023-03-31'),
      makeSpan('s2', 'travel', 'k2', '2022-07-01', '2022-07-14'),
    ];
    const result = filterForYearZoom(events);
    expect(result.filter((e) => e.type === 'span')).toHaveLength(2);
  });

  it('adds exactly one synthetic midpoint station per span', () => {
    const events = [
      makeSpan('s1', 'books',  'k1', '2023-03-01', '2023-03-31'),
      makeSpan('s2', 'travel', 'k2', '2022-07-01', '2022-07-14'),
    ];
    const result = filterForYearZoom(events);
    const midpoints = result.filter((e) => e.metadata?._synthetic_midpoint);
    expect(midpoints).toHaveLength(2);
  });

  it('midpoint date falls strictly between start_date and end_date', () => {
    const span   = makeSpan('s1', 'books', 'k1', '2023-03-01', '2023-03-31');
    const result = filterForYearZoom([span]);
    const mid    = result.find((e) => e.metadata?._synthetic_midpoint);
    const midMs  = new Date(mid.date).getTime();
    expect(midMs).toBeGreaterThan(new Date(span.start_date).getTime());
    expect(midMs).toBeLessThan(new Date(span.end_date).getTime());
  });

  it('midpoint station inherits family_id and line_key from its span', () => {
    const span   = makeSpan('s1', 'books', 'book-key-1', '2023-03-01', '2023-03-31');
    const result = filterForYearZoom([span]);
    const mid    = result.find((e) => e.metadata?._synthetic_midpoint);
    expect(mid.family_id).toBe('books');
    expect(mid.line_key).toBe('book-key-1');
  });

  it('midpoint station id is derived from span id', () => {
    const span   = makeSpan('s1', 'books', 'k1', '2023-03-01', '2023-03-31');
    const result = filterForYearZoom([span]);
    const mid    = result.find((e) => e.metadata?._synthetic_midpoint);
    expect(mid.id).toBe('midpoint-s1');
  });

  it('returns empty array when given only point events', () => {
    const events = [makePoint('e1', 'fitness', 'fitness', '2023-03-15')];
    expect(filterForYearZoom(events)).toHaveLength(0);
  });
});
