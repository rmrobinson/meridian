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
 * canvas = further in the past). It departs the spine at
 * (parentX, branchY + curveHeight) — curveHeight pixels *below* (older than)
 * the event start date — and arrives at the lane at (laneX, branchY), which
 * is exactly the event start date. This places the spine connection point
 * outside (below) the span's Y extent.
 *
 * @param {number} parentX
 * @param {number} laneX
 * @param {number} branchY    - Y of the event start date (arrival point on the lane)
 * @param {number} [curveHeight=30]
 * @returns {string}
 */
export function branchBezier(parentX, laneX, branchY, curveHeight = CURVE_HEIGHT) {
  const cy = branchY + curveHeight / 2;
  return (
    `M ${parentX},${branchY + curveHeight} ` +
    `C ${parentX},${cy} ${laneX},${cy} ${laneX},${branchY}`
  );
}

/**
 * Generate the SVG path `d` for a merge-back bezier.
 *
 * The merge sits at the *more recent* end of the span (smaller Y = further up
 * the canvas = closer to today). It departs the lane at (laneX, mergeY) —
 * exactly the event end date — and arrives at the spine at
 * (parentX, mergeY - curveHeight), curveHeight pixels *above* (more recent
 * than) the event end date. This places the spine connection point outside
 * (above) the span's Y extent, mirroring the branch geometry.
 *
 * @param {number} laneX
 * @param {number} parentX
 * @param {number} mergeY - Y of the event end date (departure point on the lane)
 * @param {number} [curveHeight=30]
 * @returns {string}
 */
export function mergeBezier(laneX, parentX, mergeY, curveHeight = CURVE_HEIGHT) {
  const cy = mergeY - curveHeight / 2;
  return (
    `M ${laneX},${mergeY} ` +
    `C ${laneX},${cy} ${parentX},${cy} ${parentX},${mergeY - curveHeight}`
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}
