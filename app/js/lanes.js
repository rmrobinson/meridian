/**
 * lanes.js — Lane assignment algorithm.
 *
 * Walks events sorted by start_date and assigns each line_key a horizontal
 * X position (lane). The spine is always X=0 (center). Episodic lines are
 * placed outward from their parent on their family's preferred side.
 *
 * All layout work happens once at load time; output is consumed by the
 * virtualized renderer in timeline.js.
 */

export const LANE_WIDTH = 80; // px between adjacent lanes
export const SPINE_X = 0;    // logical center; translate to canvas center in SVG

/**
 * Compute lane assignments for all span events.
 *
 * @param {object[]} events        - Normalized events from api.js.
 * @param {object[]} line_families - Family definitions.
 * @returns {Map<string, LaneInfo>} Map from line_key to lane info.
 */
export function assignLanes(events, line_families) {
  // TODO: implement in Phase 2
  return new Map();
}
