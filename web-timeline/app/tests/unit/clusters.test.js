// @vitest-environment happy-dom
/**
 * clusters.test.js — Unit tests for clustering pass logic.
 *
 * Tests the grouping of nearby point events into clusters.
 */

import { describe, it, expect } from 'vitest';
import { clusterPointEvents, CLUSTER_GAP_DAYS, CLUSTER_MAX_SPAN_DAYS } from '../../js/clusters.js';

const PX_PER_DAY = 2; // 2px per day (ZOOM_DAY)
const GAP_PX = CLUSTER_GAP_DAYS * PX_PER_DAY; // 14px
const MAX_SPAN_PX = CLUSTER_MAX_SPAN_DAYS * PX_PER_DAY; // 28px

/** Helper to make a station object. */
function makeStation(y, id = `evt-${y}`) {
  return {
    type: 'station',
    id,
    y,
    laneOffset: 50,
    color: '#ff0000',
    event: {
      id,
      type: 'point',
      family_id: 'fitness',
      line_key: 'fitness-single',
      date: new Date(2024, 0, 1 + Math.floor((100 - y) / PX_PER_DAY)).toISOString().split('T')[0],
      title: `Event ${id}`,
      label: null,
      icon: null,
    },
  };
}

describe('clusterPointEvents', () => {
  it('passes through a single station unchanged', () => {
    const stations = [makeStation(50, 'evt-1')];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('station');
    expect(result[0].id).toBe('evt-1');
  });

  it('groups two events within CLUSTER_GAP_DAYS into one cluster', () => {
    const stations = [
      makeStation(100, 'evt-1'),
      makeStation(100 - GAP_PX + 2, 'evt-2'), // within gap
    ];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('cluster');
    expect(result[0].count).toBe(2);
  });

  it('creates separate clusters when gap exceeds CLUSTER_GAP_DAYS', () => {
    const stations = [
      makeStation(100, 'evt-1'),
      makeStation(100 - GAP_PX - 2, 'evt-2'), // gap exceeded
    ];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('station');
    expect(result[1].type).toBe('station');
  });

  it('splits a cluster when span exceeds CLUSTER_MAX_SPAN_DAYS', () => {
    // 3 events spanning more than max span: first two cluster, third is separate.
    const stations = [
      makeStation(100, 'evt-1'),
      makeStation(100 - (MAX_SPAN_PX / 2), 'evt-2'),
      makeStation(100 - MAX_SPAN_PX - 2, 'evt-3'),
    ];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    // First two should cluster, third should be separate.
    expect(result.filter((o) => o.type === 'cluster')).toHaveLength(1);
    expect(result.filter((o) => o.type === 'station')).toHaveLength(1);
  });

  it('generates correct Y midpoint for a cluster', () => {
    // Two events within gap: y=100 and y=98 (gap = 2px < 14px gapPx)
    const stations = [
      makeStation(98, 'evt-1'),
      makeStation(100, 'evt-2'),
    ];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    const cluster = result.find((o) => o.type === 'cluster');
    expect(cluster).toBeDefined();
    expect(cluster.y).toBe((98 + 100) / 2); // midpoint = 99
  });

  it('never clusters events on different lines (different line_key)', () => {
    const evt1 = makeStation(100, 'evt-1');
    const evt2 = makeStation(100 - GAP_PX + 2, 'evt-2');
    evt2.event.line_key = 'books-single'; // different line
    const stations = [evt1, evt2];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    expect(result).toHaveLength(2);
    expect(result.filter((o) => o.type === 'cluster')).toHaveLength(0);
  });

  it('extracts correct count from cluster', () => {
    const stations = [
      makeStation(100, 'evt-1'),
      makeStation(100 - GAP_PX + 2, 'evt-2'),
      makeStation(100 - (GAP_PX * 2) + 2, 'evt-3'),
    ];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    const cluster = result.find((o) => o.type === 'cluster');
    expect(cluster.count).toBe(3);
  });

  it('stores original station objects as cluster members in sorted order', () => {
    const evt1 = makeStation(100, 'evt-1');
    const evt2 = makeStation(100 - GAP_PX + 2, 'evt-2'); // y=88, smaller than evt1
    const stations = [evt1, evt2];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    const cluster = result.find((o) => o.type === 'cluster');
    expect(cluster).toBeDefined();
    expect(cluster.members).toHaveLength(2);
    // After sorting by y ascending, evt2 (y=88) comes before evt1 (y=100)
    expect(cluster.members[0].id).toBe('evt-2');
    expect(cluster.members[1].id).toBe('evt-1');
  });

  it('maintains date range (startDate = oldest, endDate = newest)', () => {
    // Create two events within gap (y=98 and y=100, gap=2px < 14px).
    // Y increases backward in time: larger y = older, smaller y = newer.
    const evt1 = makeStation(98, 'evt-1'); // newer (smaller y)
    const evt2 = makeStation(100, 'evt-2'); // older (larger y)
    const stations = [evt1, evt2];
    const result = clusterPointEvents(stations, PX_PER_DAY);
    const cluster = result.find((o) => o.type === 'cluster');
    expect(cluster).toBeDefined();
    expect(cluster.startDate).toBeDefined(); // oldest
    expect(cluster.endDate).toBeDefined(); // newest
    // Members are stored in y-sorted order (ascending): evt1 (y=98) then evt2 (y=100)
    // So first (newest) is evt1, last (oldest) is evt2
    expect(cluster.endDate).toBe(evt1.event.date); // newest
    expect(cluster.startDate).toBe(evt2.event.date); // oldest
  });

  it('handles complex scenario: 20 daily events produce two clusters at max span', () => {
    // Create 20 events over 20 days (40px at PX_PER_DAY=2).
    // Max span is 28px, so first 14 events cluster (28px span), next 6 separate (out of span).
    const stations = [];
    for (let i = 0; i < 20; i++) {
      stations.push(makeStation(100 - i * PX_PER_DAY, `evt-${i}`));
    }
    const result = clusterPointEvents(stations, PX_PER_DAY);
    const clusters = result.filter((o) => o.type === 'cluster');
    // Should have at least 2 clusters due to span limit.
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });
});
