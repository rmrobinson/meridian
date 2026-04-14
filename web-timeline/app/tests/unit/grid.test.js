import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildWeekMap,
  locationHue,
  isoWeekNumber,
  isoWeekYear,
  isoWeekStart,
  isoWeeksInYear,
  eventsForWeek,
} from '../../js/grid.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal colorFn that echoes the HSL tuple as a string — deterministic in tests. */
const colorFn = ([h, s, l]) => `hsl(${h},${s}%,${l}%)`;

/**
 * Build a minimal normalized data object for tests.
 * All fields are optional; defaults to an empty person/family/event set.
 */
function makeData({
  timeline_start = '1990-01-01',
  line_families = [],
  events = [],
} = {}) {
  return { person: {}, timelineStart: new Date(timeline_start), line_families, events };
}

/** Build a span event. */
function span(id, family_id, start_date, end_date) {
  return {
    id, family_id,
    line_key: family_id,
    type: 'span',
    title: id,
    start_date, end_date,
    date: null,
    metadata: {},
    location: null,
  };
}

/** Build a spine relocation point event. */
function relocation(id, date, locationLabel) {
  return {
    id,
    family_id: 'spine',
    line_key: 'spine',
    type: 'point',
    title: id,
    date,
    start_date: null,
    end_date: null,
    metadata: { milestone_type: 'relocation' },
    location: { label: locationLabel },
  };
}

/** Line family stub. */
function family(id, h = 200, s = 70, l = 50) {
  return { id, label: id, base_color_hsl: [h, s, l], side: 'right', on_end: 'merge', spawn_behavior: 'per_event' };
}

// ── ISO week helpers ──────────────────────────────────────────────────────────

describe('isoWeeksInYear', () => {
  it('returns 52 for a regular year', () => {
    expect(isoWeeksInYear(2023)).toBe(52);
  });

  it('returns 53 for a long year (2020)', () => {
    // 2020: 1 Jan is Wednesday, 31 Dec is Thursday → 53 weeks.
    expect(isoWeeksInYear(2020)).toBe(53);
  });
});

describe('isoWeekNumber', () => {
  it('2023-01-02 is week 1', () => {
    expect(isoWeekNumber(new Date('2023-01-02'))).toBe(1);
  });

  it('2023-01-09 is week 2', () => {
    expect(isoWeekNumber(new Date('2023-01-09'))).toBe(2);
  });

  it('2023-12-31 is week 52', () => {
    expect(isoWeekNumber(new Date('2023-12-31'))).toBe(52);
  });
});

describe('isoWeekYear', () => {
  it('2021-01-01 belongs to ISO year 2020 (week 53)', () => {
    // 2021-01-01 is a Friday → ISO week 53 of 2020.
    expect(isoWeekYear(new Date('2021-01-01'))).toBe(2020);
  });

  it('2023-01-02 belongs to ISO year 2023', () => {
    expect(isoWeekYear(new Date('2023-01-02'))).toBe(2023);
  });
});

describe('isoWeekStart', () => {
  it('week 1 of 2023 starts on 2023-01-02 (Monday)', () => {
    const d = isoWeekStart(2023, 1);
    expect(d.toISOString().slice(0, 10)).toBe('2023-01-02');
  });

  it('week 2 of 2023 starts on 2023-01-09', () => {
    const d = isoWeekStart(2023, 2);
    expect(d.toISOString().slice(0, 10)).toBe('2023-01-09');
  });
});

// ── locationHue ───────────────────────────────────────────────────────────────

describe('locationHue', () => {
  it('returns the same value for the same label on repeated calls', () => {
    const h1 = locationHue('Edinburgh, UK');
    const h2 = locationHue('Edinburgh, UK');
    expect(h1).toBe(h2);
  });

  it('returns a value in [0, 360)', () => {
    const h = locationHue('London, UK');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it('returns different values for different labels', () => {
    // There is a theoretical collision risk but not for these two strings.
    expect(locationHue('Edinburgh, UK')).not.toBe(locationHue('London, UK'));
  });

  it('returns different values for San Francisco vs Edinburgh', () => {
    expect(locationHue('San Francisco, CA')).not.toBe(locationHue('Edinburgh, UK'));
  });
});

// ── buildWeekMap ──────────────────────────────────────────────────────────────

describe('buildWeekMap — birth / future week exclusion', () => {
  it('excludes weeks before the birth ISO week', () => {
    // Birth on 1990-04-16 (week 16 of 1990).
    const data = makeData({ timeline_start: '1990-04-16' });
    const map  = buildWeekMap(data, colorFn);
    // Week 15 of 1990 should not be present.
    expect(map['1990-W15']).toBeUndefined();
    // Week 16 should be present (null — no residence data).
    expect(Object.prototype.hasOwnProperty.call(map, '1990-W16')).toBe(true);
  });

  it('does not include weeks after the current ISO week', () => {
    const data = makeData();
    const map  = buildWeekMap(data, colorFn);
    const today = new Date();
    const currentYear = isoWeekYear(today);
    const currentWeek = isoWeekNumber(today);
    // The next week should not be present.
    const nextWeek = currentWeek + 1;
    if (nextWeek <= isoWeeksInYear(currentYear)) {
      const key = `${currentYear}-W${String(nextWeek).padStart(2, '0')}`;
      expect(map[key]).toBeUndefined();
    }
  });
});

describe('buildWeekMap — priority: travel > employment > education > residence', () => {
  // Use a week we can reliably address: 2022-W30 (Mon 2022-07-25 – Sun 2022-07-31).
  const WEEK = '2022-W30';

  it('assigns travel colour when a travel span covers the week', () => {
    const data = makeData({
      timeline_start: '1990-01-01',
      line_families: [family('travel', 50, 85, 50), family('employment', 210, 70, 50)],
      events: [
        span('t1', 'travel',     '2022-07-01', '2022-08-31'),
        span('e1', 'employment', '2022-01-01', '2022-12-31'),
        relocation('r1', '1990-01-01', 'Edinburgh, UK'),
      ],
    });
    const map = buildWeekMap(data, colorFn);
    expect(map[WEEK]?.family).toBe('travel');
    expect(map[WEEK]?.color).toBe('hsl(50,85%,50%)');
  });

  it('assigns employment colour when no travel span is active', () => {
    const data = makeData({
      timeline_start: '1990-01-01',
      line_families: [family('employment', 210, 70, 50)],
      events: [
        span('e1', 'employment', '2022-01-01', '2022-12-31'),
        relocation('r1', '1990-01-01', 'Edinburgh, UK'),
      ],
    });
    const map = buildWeekMap(data, colorFn);
    expect(map[WEEK]?.family).toBe('employment');
  });

  it('assigns education colour when neither travel nor employment is active', () => {
    const data = makeData({
      timeline_start: '1990-01-01',
      line_families: [family('education', 270, 60, 55)],
      events: [
        span('edu1', 'education', '2022-01-01', '2022-12-31'),
        relocation('r1', '1990-01-01', 'Edinburgh, UK'),
      ],
    });
    const map = buildWeekMap(data, colorFn);
    expect(map[WEEK]?.family).toBe('education');
  });

  it('assigns residence colour when only a relocation event is present', () => {
    const data = makeData({
      timeline_start: '1990-01-01',
      events: [relocation('r1', '1990-01-01', 'Edinburgh, UK')],
    });
    const map = buildWeekMap(data, colorFn);
    expect(map[WEEK]?.family).toBe('residence');
    expect(map[WEEK]?.label).toBe('Edinburgh, UK');
  });

  it('returns null for weeks before any known residence', () => {
    // Birth on 1990-04-16; no relocation events → null for weeks after birth.
    const data = makeData({ timeline_start: '1990-04-16' });
    const map  = buildWeekMap(data, colorFn);
    expect(map['1990-W16']).toBeNull();
    expect(map['2000-W01']).toBeNull();
  });
});

describe('buildWeekMap — concurrent travel spans', () => {
  it('picks the travel span with the latest start_date when two spans overlap the week', () => {
    // Both spans cover 2022-W30. t2 starts later → t2 wins.
    const data = makeData({
      timeline_start: '1990-01-01',
      line_families: [family('travel', 50, 85, 50)],
      events: [
        { ...span('t1', 'travel', '2022-07-01', '2022-08-31') },
        { ...span('t2', 'travel', '2022-07-20', '2022-08-10') },
        relocation('r1', '1990-01-01', 'Edinburgh, UK'),
      ],
    });
    const map = buildWeekMap(data, colorFn);
    expect(map['2022-W30']?.eventId).toBe('t2');
  });
});

describe('buildWeekMap — residence carries forward', () => {
  it('uses Edinburgh until the London relocation, then London thereafter', () => {
    const data = makeData({
      timeline_start: '1990-01-01',
      events: [
        relocation('r1', '1990-01-01', 'Edinburgh, UK'),
        relocation('r2', '2019-09-02', 'London, UK'),  // week 36 of 2019
      ],
    });
    const map = buildWeekMap(data, colorFn);

    // 2010-W01 → Edinburgh (well before London move).
    expect(map['2010-W01']?.label).toBe('Edinburgh, UK');

    // 2020-W01 → London (well after move).
    expect(map['2020-W01']?.label).toBe('London, UK');
  });

  it('Edinburgh stops at the week the London relocation falls in', () => {
    // London relocation on 2019-09-02 (Monday of week 36).
    // Week 35 (Mon 2019-08-26 – Sun 2019-09-01): Edinburgh.
    // Week 36 (Mon 2019-09-02 – Sun 2019-09-08): London.
    const data = makeData({
      timeline_start: '1990-01-01',
      events: [
        relocation('r1', '1990-01-01', 'Edinburgh, UK'),
        relocation('r2', '2019-09-02', 'London, UK'),
      ],
    });
    const map = buildWeekMap(data, colorFn);
    expect(map['2019-W35']?.label).toBe('Edinburgh, UK');
    expect(map['2019-W36']?.label).toBe('London, UK');
  });
});

// ── eventsForWeek ─────────────────────────────────────────────────────────────

describe('eventsForWeek', () => {
  const weekKey = '2023-W11';  // Mon 2023-03-13 – Sun 2023-03-19

  it('includes a span that overlaps the week', () => {
    const data = makeData({
      events: [span('s1', 'travel', '2023-03-10', '2023-03-28')],
    });
    const results = eventsForWeek(weekKey, data);
    expect(results.map((e) => e.id)).toContain('s1');
  });

  it('excludes a span that ends before the week starts', () => {
    const data = makeData({
      events: [span('s1', 'travel', '2023-03-01', '2023-03-12')],
    });
    const results = eventsForWeek(weekKey, data);
    expect(results.map((e) => e.id)).not.toContain('s1');
  });

  it('includes a point event whose date falls within the week', () => {
    const data = makeData({
      events: [{
        id: 'p1', family_id: 'spine', line_key: 'spine', type: 'point',
        date: '2023-03-15', start_date: null, end_date: null,
        title: 'p1', metadata: {}, location: null,
      }],
    });
    const results = eventsForWeek(weekKey, data);
    expect(results.map((e) => e.id)).toContain('p1');
  });

  it('excludes a point event outside the week', () => {
    const data = makeData({
      events: [{
        id: 'p1', family_id: 'spine', line_key: 'spine', type: 'point',
        date: '2023-03-20', start_date: null, end_date: null,
        title: 'p1', metadata: {}, location: null,
      }],
    });
    const results = eventsForWeek(weekKey, data);
    expect(results.map((e) => e.id)).not.toContain('p1');
  });
});
