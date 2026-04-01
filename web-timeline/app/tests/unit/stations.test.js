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

import { buildStation } from '../../js/stations.js';
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
    isMajor:      false,
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

  it('has a larger radius for major stations', () => {
    const major  = buildStation(makeObj({ isMajor: true }),  SPINE_X);
    const minor  = buildStation(makeObj({ isMajor: false }), SPINE_X);
    const rMajor = Number(major.querySelector('.station-dot').getAttribute('r'));
    const rMinor = Number(minor.querySelector('.station-dot').getAttribute('r'));
    expect(rMajor).toBeGreaterThan(rMinor);
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

  it('has station-label--major class for major stations', () => {
    const g  = buildStation(makeObj({ label: 'Big Day', isMajor: true }), SPINE_X);
    const el = g.querySelector('.station-label');
    expect(el.classList.contains('station-label--major')).toBe(true);
  });

  it('does not have station-label--major class for minor stations', () => {
    const g  = buildStation(makeObj({ label: 'Small thing', isMajor: false }), SPINE_X);
    const el = g.querySelector('.station-label');
    expect(el.classList.contains('station-label--major')).toBe(false);
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
