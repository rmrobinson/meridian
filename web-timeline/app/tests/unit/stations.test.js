// @vitest-environment happy-dom
/**
 * stations.test.js — Unit tests for buildStation() DOM output.
 *
 * Uses happy-dom so document.createElementNS is available.
 * The icons module is mocked so tests don't depend on fetch or the file system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock icons.js before importing stations.js so buildStation picks up the mock.
vi.mock('../../js/icons.js', () => ({
  getIconPath: vi.fn(),
}));

import { buildStation, buildClusterStation } from '../../js/stations.js';
import { getIconPath } from '../../js/icons.js';

const SPINE_X = 400;

/** Minimal event object — only the fields buildStation reads directly. */
function makeEvent(overrides = {}) {
  return {
    id:        'test-evt',
    family_id: 'travel',
    type:      'point',
    title:     'Test Event',
    label:     null,
    icon:      null,
    end_icon:  null,
    ...overrides,
  };
}

/** Minimal station render object matching the shape from main.js buildRenderObjects(). */
function makeObj(overrides = {}) {
  return {
    id:           'test-evt',
    y:            200,
    laneOffset:   0,
    color:        null,
    label:        null,
    icon:         null,
    event:        makeEvent(),
    ...overrides,
  };
}

beforeEach(() => {
  getIconPath.mockReset();
  getIconPath.mockReturnValue(null);
});

// ── Station dot ───────────────────────────────────────────────────────────────

describe('station dot', () => {
  it('is always present when there is no icon', () => {
    const g = buildStation(makeObj(), SPINE_X);
    expect(g.querySelector('.station-dot')).not.toBeNull();
  });

  it('is present even when an icon is set', () => {
    getIconPath.mockReturnValue('M 0 0 L 24 24');
    const g = buildStation(makeObj({ icon: 'mdi:airplane-takeoff' }), SPINE_X);
    expect(g.querySelector('.station-dot')).not.toBeNull();
  });

  it('uses cx="50%" for spine stations (laneOffset 0)', () => {
    const g  = buildStation(makeObj({ laneOffset: 0 }), SPINE_X);
    const cx = g.querySelector('.station-dot').getAttribute('cx');
    expect(cx).toBe('50%');
  });

  it('uses absolute cx for off-spine stations', () => {
    const g  = buildStation(makeObj({ laneOffset: 80 }), SPINE_X);
    const cx = g.querySelector('.station-dot').getAttribute('cx');
    expect(cx).not.toBe('50%');
    expect(Number(cx)).toBeCloseTo(SPINE_X + 80, 0);
  });
});

// ── Icon ──────────────────────────────────────────────────────────────────────

describe('station icon', () => {
  it('is not present when obj.icon is null', () => {
    const g = buildStation(makeObj({ icon: null }), SPINE_X);
    expect(g.querySelector('.station-icon')).toBeNull();
  });

  it('is not present when getIconPath returns null (unknown icon ID)', () => {
    getIconPath.mockReturnValue(null);
    const g = buildStation(makeObj({ icon: 'mdi:nonexistent' }), SPINE_X);
    expect(g.querySelector('.station-icon')).toBeNull();
  });

  it('does not throw for an unknown icon ID', () => {
    getIconPath.mockReturnValue(null);
    expect(() => buildStation(makeObj({ icon: 'mdi:nonexistent' }), SPINE_X)).not.toThrow();
  });

  it('is present when obj.icon is set and getIconPath returns a path', () => {
    getIconPath.mockReturnValue('M 0 0 L 24 24');
    const g = buildStation(makeObj({ icon: 'mdi:airplane-takeoff' }), SPINE_X);
    expect(g.querySelector('.station-icon')).not.toBeNull();
  });

  it('sits to the right of the dot for right-side (laneOffset >= 0) stations', () => {
    getIconPath.mockReturnValue('M 0 0 L 24 24');
    const g   = buildStation(makeObj({ icon: 'mdi:star', laneOffset: 80 }), SPINE_X);
    const dot = g.querySelector('.station-dot');
    const ico = g.querySelector('.station-icon');
    expect(Number(ico.getAttribute('x'))).toBeGreaterThan(
      Number(dot.getAttribute('cx')) + Number(dot.getAttribute('r')),
    );
  });

  it('sits to the left of the dot for left-side (laneOffset < 0) stations', () => {
    getIconPath.mockReturnValue('M 0 0 L 24 24');
    const g   = buildStation(makeObj({ icon: 'mdi:star', laneOffset: -80 }), SPINE_X);
    const dot = g.querySelector('.station-dot');
    const ico = g.querySelector('.station-icon');
    // Icon x is the left edge; it should be left of (cx - r).
    expect(Number(ico.getAttribute('x'))).toBeLessThan(
      Number(dot.getAttribute('cx')) - Number(dot.getAttribute('r')),
    );
  });
});

// ── Label ─────────────────────────────────────────────────────────────────────

describe('station label', () => {
  it('is not rendered when label is null', () => {
    const g = buildStation(makeObj({ label: null }), SPINE_X);
    expect(g.querySelector('.station-label')).toBeNull();
  });

  it('is rendered when label is set', () => {
    const g = buildStation(makeObj({ label: 'Japan' }), SPINE_X);
    const el = g.querySelector('.station-label');
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('Japan');
  });
});

// ── CSS class flags ───────────────────────────────────────────────────────────

describe('station CSS class flags', () => {
  it('adds station--has-icon class when icon is present', () => {
    getIconPath.mockReturnValue('M 0 0 L 24 24');
    const g = buildStation(makeObj({ icon: 'mdi:star' }), SPINE_X);
    expect(g.classList.contains('station--has-icon')).toBe(true);
  });

  it('does not add station--has-icon class when no icon', () => {
    const g = buildStation(makeObj({ icon: null }), SPINE_X);
    expect(g.classList.contains('station--has-icon')).toBe(false);
  });

  it('adds station--departure class for departure stations', () => {
    const g = buildStation(makeObj({ departure: true }), SPINE_X);
    expect(g.classList.contains('station--departure')).toBe(true);
  });

  it('adds station--arrival class for arrival stations', () => {
    const g = buildStation(makeObj({ arrival: true }), SPINE_X);
    expect(g.classList.contains('station--arrival')).toBe(true);
  });

  it('includes family_id in the station class', () => {
    const g = buildStation(makeObj({ event: makeEvent({ family_id: 'books' }) }), SPINE_X);
    expect(g.classList.contains('station--books')).toBe(true);
  });
});

// ── Cluster stations ──────────────────────────────────────────────────────────

describe('cluster station', () => {
  function makeCluster(overrides = {}) {
    return {
      id:           'cluster-a-b',
      y:            200,
      laneOffset:   50,
      color:        '#1e90ff',
      count:        5,
      familyId:     'fitness',
      startDate:    '2024-01-01',
      endDate:      '2024-01-06',
      members:      [makeObj(), makeObj()],
      ...overrides,
    };
  }

  it('renders a plain dot with no icon', () => {
    const g = buildClusterStation(makeCluster(), SPINE_X);
    expect(g.querySelector('.station-dot')).not.toBeNull();
    expect(g.querySelector('.station-icon')).toBeNull();
  });

  it('renders a count pill on the label side', () => {
    const g = buildClusterStation(makeCluster(), SPINE_X);
    const pill = g.querySelector('.cluster-pill-text');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('5');
  });

  it('reflects the correct member count in the pill', () => {
    const g = buildClusterStation(makeCluster({ count: 12 }), SPINE_X);
    const pill = g.querySelector('.cluster-pill-text');
    expect(pill.textContent).toBe('12');
  });

  it('has a hit area ≥ 44px radius', () => {
    const g = buildClusterStation(makeCluster(), SPINE_X);
    const hit = g.querySelector('.station-hit');
    const r = Number(hit.getAttribute('r'));
    expect(r).toBeGreaterThanOrEqual(22); // radius ≥ 22px → diameter ≥ 44px
  });

  it('includes familyId in the CSS class', () => {
    const g = buildClusterStation(makeCluster({ familyId: 'books' }), SPINE_X);
    expect(g.classList.contains('station--books')).toBe(true);
  });
});
