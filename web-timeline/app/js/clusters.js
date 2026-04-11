/**
 * clusters.js — Clustering pass for point events.
 *
 * At Day zoom, point events on the same line that fall close together in time
 * are collapsed into cluster stations to prevent overlapping icons and labels.
 *
 * This is a post-processing step that runs after lane assignment but before
 * rendering. Cluster render objects are inserted into the main render array
 * to be rendered alongside span lines, year markers, etc.
 */

export const CLUSTER_GAP_DAYS = 7;
export const CLUSTER_MAX_SPAN_DAYS = 14;

/**
 * Group point station render objects into clusters per line.
 *
 * Clustering is computed per line (by line_key) after lane assignment.
 * Span events are never clustered. Single-member runs are passed through unchanged.
 *
 * @param {object[]} pointStations  — station render objects with type === 'station'
 * @param {number}   pxPerDay       — current zoom scale (pixels per day)
 * @returns {object[]}              — modified array where runs of ≥2 clustered stations
 *                                    are replaced by 'cluster' render objects
 */
export function clusterPointEvents(pointStations, pxPerDay) {
  const gapPx = CLUSTER_GAP_DAYS * pxPerDay;
  const maxSpanPx = CLUSTER_MAX_SPAN_DAYS * pxPerDay;

  // Group stations by line_key (same line = same family + family spawn behavior).
  const lineGroups = new Map();
  for (const station of pointStations) {
    const lineKey = station.event.line_key;
    if (!lineGroups.has(lineKey)) lineGroups.set(lineKey, []);
    lineGroups.get(lineKey).push(station);
  }

  // Cluster each line independently.
  const clustered = [];
  for (const lineStations of lineGroups.values()) {
    // Sort by Y ascending (y=0 is newest/today; largest y is oldest).
    lineStations.sort((a, b) => a.y - b.y);

    let i = 0;
    while (i < lineStations.length) {
      // Attempt to start a run at position i.
      const runStart = i;
      const runMembers = [lineStations[i]];

      // Extend the run while consecutive events are within gap threshold
      // AND total span doesn't exceed max.
      while (i + 1 < lineStations.length) {
        const current = lineStations[i];
        const next = lineStations[i + 1];
        const gap = Math.abs(next.y - current.y);

        // Check gap threshold.
        if (gap > gapPx) break;

        // Check span threshold: distance from first to next.
        const spanStart = lineStations[runStart];
        const spanSoFar = Math.abs(next.y - spanStart.y);
        if (spanSoFar > maxSpanPx) break;

        runMembers.push(next);
        i++;
      }

      // Emit the run.
      if (runMembers.length === 1) {
        // Single-member run: pass through unchanged.
        clustered.push(runMembers[0]);
      } else {
        // Multi-member run: create a cluster object.
        const first = runMembers[0]; // newest (smallest y)
        const last = runMembers[runMembers.length - 1]; // oldest (largest y)

        clustered.push({
          type: 'cluster',
          id: `cluster-${first.id}-${last.id}`,
          y: (first.y + last.y) / 2, // midpoint
          laneOffset: first.laneOffset,
          color: first.color,
          members: runMembers, // original station objects
          count: runMembers.length,
          familyId: first.event.family_id,
          startDate: last.event.date, // oldest (last member)
          endDate: first.event.date, // newest (first member)
        });
      }

      i++;
    }
  }

  return clustered;
}
