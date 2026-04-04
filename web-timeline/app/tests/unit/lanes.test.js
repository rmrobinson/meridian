import { describe, it, expect } from 'vitest';
import { assignLanes, LANE_WIDTH, SECONDARY_SPINE_SLOTS } from '../../js/lanes.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeFamily(id, side, spawn_behavior = 'per_event', on_end = 'merge') {
  return { id, side, spawn_behavior, on_end, base_color_hsl: [120, 60, 50], label: id };
}

function makeSpan(id, lineKey, familyId, startDate, endDate, parentLineKey = null) {
  return {
    id, type: 'span', family_id: familyId, line_key: lineKey,
    parent_line_key: parentLineKey,
    start_date: startDate, end_date: endDate,
    date: null, title: '', location: null, description: null,
    external_url: null, hero_image_url: null, photos: [], metadata: {},
  };
}

const RIGHT  = makeFamily('right-fam',  'right');
const RIGHT2 = makeFamily('right-fam2', 'right');
const LEFT   = makeFamily('left-fam',   'left');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('assignLanes()', () => {
  // ── Single span ─────────────────────────────────────────────────────────────

  it('single right span assigned to +LANE_WIDTH', () => {
    const events = [makeSpan('e1', 'k1', 'right-fam', '2020-01-01', '2021-01-01')];
    const result = assignLanes(events, [RIGHT]);
    expect(result.get('k1').laneOffset).toBe(LANE_WIDTH);
  });

  it('single left span assigned to -LANE_WIDTH', () => {
    const events = [makeSpan('e1', 'k1', 'left-fam', '2020-01-01', '2021-01-01')];
    const result = assignLanes(events, [LEFT]);
    expect(result.get('k1').laneOffset).toBe(-LANE_WIDTH);
  });

  it('parentOffset defaults to 0 when no parent_line_key', () => {
    const events = [makeSpan('e1', 'k1', 'right-fam', '2020-01-01', '2021-01-01')];
    const result = assignLanes(events, [RIGHT]);
    expect(result.get('k1').parentOffset).toBe(0);
  });

  it('propagates familyId into LaneInfo', () => {
    const events = [makeSpan('e1', 'k1', 'right-fam', '2020-01-01', '2021-01-01')];
    const result = assignLanes(events, [RIGHT]);
    expect(result.get('k1').familyId).toBe('right-fam');
  });

  it('propagates side into LaneInfo', () => {
    const events = [makeSpan('e1', 'k1', 'left-fam', '2020-01-01', '2021-01-01')];
    const result = assignLanes(events, [LEFT]);
    expect(result.get('k1').side).toBe('left');
  });

  it('ignores point events', () => {
    const point = {
      id: 'p1', type: 'point', family_id: 'right-fam', line_key: 'spine',
      parent_line_key: null, date: '2020-06-01', start_date: null, end_date: null,
      title: '', location: null, description: null,
      external_url: null, hero_image_url: null, photos: [], metadata: {},
    };
    const result = assignLanes([point], [RIGHT]);
    expect(result.size).toBe(0);
  });

  // ── Concurrent spans — different families ───────────────────────────────────

  it('concurrent spans from different same-side families each get a distinct lane', () => {
    const events = [
      makeSpan('e1', 'k1', 'right-fam',  '2020-01-01', '2022-01-01'),
      makeSpan('e2', 'k2', 'right-fam2', '2020-06-01', '2021-06-01'),
    ];
    const result = assignLanes(events, [RIGHT, RIGHT2]);
    const o1 = result.get('k1').laneOffset;
    const o2 = result.get('k2').laneOffset;
    expect(o1).not.toBe(o2);
    expect(o1).toBeGreaterThan(0);
    expect(o2).toBeGreaterThan(0);
  });

  // ── Concurrent spans — same family (sibling adjacency) ─────────────────────

  it('two concurrent spans from the same family occupy adjacent lanes', () => {
    const events = [
      makeSpan('e1', 'k1', 'right-fam', '2022-07-20', '2022-08-14'),
      makeSpan('e2', 'k2', 'right-fam', '2022-07-25', '2022-09-10'),
    ];
    const result = assignLanes(events, [RIGHT]);
    const offsets = [result.get('k1').laneOffset, result.get('k2').laneOffset].sort((a, b) => a - b);
    expect(offsets[0]).toBe(LANE_WIDTH);
    expect(offsets[1]).toBe(2 * LANE_WIDTH);
  });

  // ── Lane freed ──────────────────────────────────────────────────────────────

  it('lane freed when span ends — next non-concurrent span reuses it', () => {
    const events = [
      makeSpan('e1', 'k1', 'right-fam', '2015-01-01', '2016-01-01'),
      makeSpan('e2', 'k2', 'right-fam', '2017-01-01', '2018-01-01'),
    ];
    const result = assignLanes(events, [RIGHT]);
    expect(result.get('k1').laneOffset).toBe(result.get('k2').laneOffset);
  });

  // ── Color index ─────────────────────────────────────────────────────────────

  it('colorIndex increments per family, not per event', () => {
    const events = [
      makeSpan('e1', 'k1', 'right-fam', '2015-01-01', '2016-01-01'),
      makeSpan('e2', 'k2', 'right-fam', '2017-01-01', '2018-01-01'),
    ];
    const result = assignLanes(events, [RIGHT]);
    expect(result.get('k1').colorIndex).toBe(0);
    expect(result.get('k2').colorIndex).toBe(1);
  });

  it('colorIndex is independent across families', () => {
    const events = [
      makeSpan('e1', 'k1', 'right-fam',  '2020-01-01', '2021-01-01'),
      makeSpan('e2', 'k2', 'right-fam2', '2020-01-01', '2021-01-01'),
    ];
    const result = assignLanes(events, [RIGHT, RIGHT2]);
    expect(result.get('k1').colorIndex).toBe(0);
    expect(result.get('k2').colorIndex).toBe(0); // first span in its own family
  });

  // ── Nested branch ───────────────────────────────────────────────────────────

  it('nested branch parentOffset equals the parent line laneOffset', () => {
    const EDU = makeFamily('education',  'left');
    const EMP = makeFamily('employment', 'left');
    const events = [
      makeSpan('e1', 'university-2010', 'education',  '2010-09-01', '2014-05-30'),
      makeSpan('e2', 'cern-2012',       'employment', '2012-06-01', '2012-08-31', 'university-2010'),
    ];
    const result = assignLanes(events, [EDU, EMP]);
    expect(result.get('university-2010').laneOffset).toBe(-LANE_WIDTH);
    expect(result.get('cern-2012').parentOffset).toBe(-LANE_WIDTH);
  });

  it('nested branch laneOffset is further from spine than its parent', () => {
    const EDU = makeFamily('education',  'left');
    const EMP = makeFamily('employment', 'left');
    const events = [
      makeSpan('e1', 'university-2010', 'education',  '2010-09-01', '2014-05-30'),
      makeSpan('e2', 'cern-2012',       'employment', '2012-06-01', '2012-08-31', 'university-2010'),
    ];
    const result = assignLanes(events, [EDU, EMP]);
    const parentAbs = Math.abs(result.get('university-2010').laneOffset);
    const childAbs  = Math.abs(result.get('cern-2012').laneOffset);
    expect(childAbs).toBeGreaterThan(parentAbs);
  });

  it('nested branch laneOffset is exactly 2×LANE_WIDTH from spine when parent is at 1×', () => {
    const EDU = makeFamily('education',  'left');
    const EMP = makeFamily('employment', 'left');
    const events = [
      makeSpan('e1', 'university-2010', 'education',  '2010-09-01', '2014-05-30'),
      makeSpan('e2', 'cern-2012',       'employment', '2012-06-01', '2012-08-31', 'university-2010'),
    ];
    const result = assignLanes(events, [EDU, EMP]);
    expect(result.get('cern-2012').laneOffset).toBe(-2 * LANE_WIDTH);
  });

  it('nested branch with unknown parent falls back gracefully (no throw)', () => {
    const EMP = makeFamily('employment', 'left');
    const events = [
      makeSpan('e1', 'cern', 'employment', '2012-06-01', '2012-08-31', 'missing-parent'),
    ];
    expect(() => assignLanes(events, [EMP])).not.toThrow();
    const result = assignLanes(events, [EMP]);
    expect(result.has('cern')).toBe(true);
  });

  // ── single_line family ──────────────────────────────────────────────────────

  it('single_line family reuses the same line_key — only one result entry', () => {
    const SL = makeFamily('sl-fam', 'right', 'single_line', 'terminate');
    const events = [
      makeSpan('e1', 'fitness', 'sl-fam', '2018-01-01', '2019-01-01'),
      makeSpan('e2', 'fitness', 'sl-fam', '2020-01-01', '2021-01-01'),
    ];
    const result = assignLanes(events, [SL]);
    const keys = [...result.keys()];
    expect(keys.filter((k) => k === 'fitness').length).toBe(1);
    expect(result.get('fitness').laneOffset).toBe(LANE_WIDTH);
  });

  // ── Full fixture trace ──────────────────────────────────────────────────────

  it('full fixture: all lane invariants hold', () => {
    const BOOKS  = makeFamily('books',      'right', 'per_event', 'terminate');
    const EDU    = makeFamily('education',  'left',  'per_event', 'merge');
    const EMP    = makeFamily('employment', 'left',  'per_event', 'merge');
    const TRAVEL = makeFamily('travel',     'right', 'per_event', 'merge');

    const events = [
      makeSpan('e005',  'university-2010',      'education',  '2010-09-01', '2014-05-30'),
      makeSpan('e001b', 'uni-placement-2012',   'employment', '2012-06-01', '2012-08-31', 'university-2010'),
      makeSpan('e001',  'acme-corp',            'employment', '2015-06-01', '2018-11-30'),
      makeSpan('e003',  'dune-2022',            'books',      '2022-07-20', '2022-08-14'),
      makeSpan('e006',  'midnight-library-2022','books',      '2022-07-25', '2022-09-10'),
      makeSpan('e002',  'japan-2023',           'travel',     '2023-03-10', '2023-03-24'),
    ];

    const result = assignLanes(events, [BOOKS, EDU, EMP, TRAVEL]);

    // Education spine-child: lane 1 left
    expect(result.get('university-2010').laneOffset).toBe(-LANE_WIDTH);
    // CERN nested under university: lane 2 left, parentOffset = -80
    expect(result.get('uni-placement-2012').parentOffset).toBe(-LANE_WIDTH);
    expect(result.get('uni-placement-2012').laneOffset).toBe(-2 * LANE_WIDTH);
    // Acme Corp: non-concurrent with university → reuses lane 1 left
    expect(result.get('acme-corp').laneOffset).toBe(-LANE_WIDTH);
    // Dune: right lane 1
    expect(result.get('dune-2022').laneOffset).toBe(LANE_WIDTH);
    // Midnight Library: concurrent with Dune → right lane 2
    expect(result.get('midnight-library-2022').laneOffset).toBe(2 * LANE_WIDTH);
    // Japan trip: non-concurrent with books → reuses right lane 1
    expect(result.get('japan-2023').laneOffset).toBe(LANE_WIDTH);
  });

  // ── secondary_spine family ──────────────────────────────────────────────────

  it('secondary_spine left family is assigned a fixed negative laneOffset', () => {
    const FITNESS = makeFamily('fitness', 'left', 'secondary_spine', 'terminate');
    const result = assignLanes([], [FITNESS]);
    expect(result.has('fitness')).toBe(true);
    expect(result.get('fitness').laneOffset).toBe(-(SECONDARY_SPINE_SLOTS * LANE_WIDTH));
  });

  it('secondary_spine right family is assigned a fixed positive laneOffset', () => {
    const SEC = makeFamily('sec-right', 'right', 'secondary_spine', 'terminate');
    const result = assignLanes([], [SEC]);
    expect(result.get('sec-right').laneOffset).toBe(SECONDARY_SPINE_SLOTS * LANE_WIDTH);
  });

  it('secondary_spine slot is pre-occupied — regular left spans skip it', () => {
    const FITNESS = makeFamily('fitness', 'left', 'secondary_spine', 'terminate');
    const LEFT    = makeFamily('left-fam', 'left');
    const reserved = -(SECONDARY_SPINE_SLOTS * LANE_WIDTH);

    // Pack enough concurrent left spans to reach the reserved slot.
    const events = [];
    for (let i = 0; i < SECONDARY_SPINE_SLOTS; i++) {
      events.push(makeSpan(`e${i}`, `key${i}`, 'left-fam', '2020-01-01', '2021-01-01'));
    }

    const result = assignLanes(events, [FITNESS, LEFT]);
    const regularOffsets = [...result.entries()]
      .filter(([k]) => k !== 'fitness')
      .map(([, v]) => v.laneOffset);

    expect(regularOffsets).not.toContain(reserved);
  });

  it('secondary_spine entry has colorIndex 0 and parentOffset 0', () => {
    const FITNESS = makeFamily('fitness', 'left', 'secondary_spine', 'terminate');
    const result = assignLanes([], [FITNESS]);
    const info = result.get('fitness');
    expect(info.colorIndex).toBe(0);
    expect(info.parentOffset).toBe(0);
  });
});
