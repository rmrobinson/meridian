/**
 * lines.js — SVG path generation (segments + bezier curves)
 *
 * Depends on layout data pre-computed at load time. No DOM access.
 */

/**
 * Pixel height of the branch / merge bezier curve.
 * Shared by main.js (render-object construction) and the bezier helpers below.
 */
export const CURVE_HEIGHT = 40;

/**
 * Map a date to a Y pixel position on the canvas.
 *
 * Top of canvas (Y=0) is today. Bottom (Y=totalHeight) is birth date.
 *
 * @param {Date|string} date        - The date to convert.
 * @param {Date|string} birthDate   - The person's birth date (maps to totalHeight).
 * @param {Date|string} today       - Reference "now" (maps to Y=0). Defaults to new Date().
 * @param {number}      totalHeight - Canvas height in pixels.
 * @returns {number} Y position in pixels.
 */
export function timeToY(date, birthDate, today, totalHeight) {
  const d = toMs(date);
  const birth = toMs(birthDate);
  const now = toMs(today);

  if (now === birth) {
    throw new Error('today and birthDate cannot be the same');
  }

  const ratio = (now - d) / (now - birth);
  return ratio * totalHeight;
}

/**
 * Generate the SVG path `d` attribute for a straight vertical segment.
 *
 * @param {number} x
 * @param {number} yStart - top Y (earlier in scroll = more recent date)
 * @param {number} yEnd   - bottom Y (older date)
 * @returns {string}
 */
export function straightSegment(x, yStart, yEnd) {
  return `M ${x},${yStart} L ${x},${yEnd}`;
}

/**
 * Generate the SVG path `d` for a branch-off bezier.
 *
 * The branch sits at the *older* end of the span (larger Y = further down the
 * canvas = further in the past). It departs the spine at (parentX, branchY) —
 * exactly the event start date — and arrives at the lane at
 * (laneX, branchY - curveHeight), curveHeight pixels *above* (more recent than,
 * inside the span). The curve eats into the span interior so the total lane
 * segment is shorter than the spine span by curveHeight at each end.
 *
 * Control points: CP1=(laneX, branchY) produces a horizontal departure from
 * the spine; CP2=(laneX, branchY-ch/2) produces a vertical arrival at the lane.
 *
 * @param {number} parentX
 * @param {number} laneX
 * @param {number} branchY    - Y of the event start date (departure point on the spine)
 * @param {number} [curveHeight=CURVE_HEIGHT]
 * @returns {string}
 */
export function branchBezier(parentX, laneX, branchY, curveHeight = CURVE_HEIGHT) {
  const cy = branchY - curveHeight / 2;
  return (
    `M ${parentX},${branchY} ` +
    `C ${laneX},${branchY} ${laneX},${cy} ${laneX},${branchY - curveHeight}`
  );
}

/**
 * Generate the SVG path `d` for a merge-back bezier.
 *
 * The merge sits at the *more recent* end of the span (smaller Y = further up
 * the canvas = closer to today). It departs the lane at
 * (laneX, mergeY + curveHeight), curveHeight pixels *below* (older than, inside
 * the span) — and arrives at the spine at (parentX, mergeY), exactly the event
 * end date. Mirrors the branch geometry: curves eat inward from both ends.
 *
 * Control points: CP1=(laneX, mergeY+ch/2) produces a vertical departure from
 * the lane; CP2=(midX, mergeY) produces a horizontal arrival at the spine.
 *
 * @param {number} laneX
 * @param {number} parentX
 * @param {number} mergeY - Y of the event end date (arrival point on the spine)
 * @param {number} [curveHeight=CURVE_HEIGHT]
 * @returns {string}
 */
export function mergeBezier(laneX, parentX, mergeY, curveHeight = CURVE_HEIGHT) {
  const midX = (laneX + parentX) / 2;
  const cy   = mergeY + curveHeight / 2;
  return (
    `M ${laneX},${mergeY + curveHeight} ` +
    `C ${laneX},${cy} ${midX},${mergeY} ${parentX},${mergeY}`
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}
