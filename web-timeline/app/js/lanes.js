/**
 * lanes.js — Lane assignment algorithm.
 *
 * Walks span events sorted oldest-first (sweep-line) and assigns each
 * line_key a signed horizontal laneOffset (positive = right of spine,
 * negative = left). The spine itself is always at offset 0.
 *
 * Rules:
 *   - Each span is placed on the innermost free lane on its family's
 *     preferred side, measured outward from its parent's laneOffset.
 *   - Concurrent spans cannot share the same absolute laneOffset.
 *   - When a span ends its lane is freed for subsequent spans.
 *   - single_line families reuse the same line_key across all their
 *     events; the lane is assigned once and re-occupied for each segment.
 *   - If the preferred side is full, the span falls back to the opposite
 *     side from the spine.
 */

export const LANE_WIDTH = 80; // px between adjacent lanes

/**
 * @typedef {object} LaneInfo
 * @property {number}          laneOffset   Signed px offset from spine center.
 * @property {number}          parentOffset Parent line's laneOffset (0 = spine).
 * @property {'left'|'right'}  side         Side relative to parent.
 * @property {string}          familyId
 * @property {number}          colorIndex   0-based index for HSL variant selection.
 */

/**
 * Compute lane assignments for all span events.
 *
 * @param {object[]} events        - Normalized events array from api.js.
 * @param {object[]} line_families - Family definitions array.
 * @returns {Map<string, LaneInfo>} Map from line_key → LaneInfo.
 */
export function assignLanes(events, line_families) {
  const familyById = new Map(line_families.map((f) => [f.id, f]));

  /** @type {Map<string, LaneInfo>} */
  const result = new Map();

  /** Absolute laneOffset values currently occupied by an active span. */
  const occupiedOffsets = new Set();

  /** Next color-variant index per family (increments each time a new line_key is assigned). */
  const colorIndexByFamily = new Map();

  // ── Build sweep-line events ────────────────────────────────────────────────

  const sweepEvents = [];
  for (const evt of events) {
    if (evt.type !== 'span') continue;
    const family = familyById.get(evt.family_id);
    if (!family) continue;

    sweepEvents.push({
      ms:   new Date(evt.start_date).getTime(),
      kind: 'start',
      evt,
      family,
    });
    sweepEvents.push({
      ms:   new Date(evt.end_date).getTime(),
      kind: 'end',
      evt,
      family,
    });
  }

  // Sort oldest-first (ascending ms = smallest timestamp first). This ensures
  // a parent span is assigned before any child span whose start_date is later.
  // At the same ms, process ends before starts so a freed lane is immediately
  // available to a new span starting on the same date.
  sweepEvents.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms;
    if (a.kind === 'end' && b.kind === 'start') return -1;
    if (a.kind === 'start' && b.kind === 'end') return 1;
    return 0;
  });

  // ── Sweep ──────────────────────────────────────────────────────────────────

  for (const { kind, evt, family } of sweepEvents) {
    const lineKey  = evt.line_key;
    const familyId = family.id;

    if (kind === 'end') {
      const info = result.get(lineKey);
      if (info) occupiedOffsets.delete(info.laneOffset);
      continue;
    }

    // ── kind === 'start' ───────────────────────────────────────────────────

    // single_line: already assigned — just re-occupy and continue.
    if (family.spawn_behavior === 'single_line' && result.has(lineKey)) {
      occupiedOffsets.add(result.get(lineKey).laneOffset);
      continue;
    }

    // Resolve parent offset (0 = spine when no parent_line_key).
    let parentOffset = 0;
    if (evt.parent_line_key) {
      const parentInfo = result.get(evt.parent_line_key);
      if (parentInfo) {
        parentOffset = parentInfo.laneOffset;
      } else {
        console.warn(
          `assignLanes: parent_line_key "${evt.parent_line_key}" not yet assigned ` +
          `when processing "${lineKey}" — check event ordering.`,
        );
      }
    }

    const direction = family.side === 'right' ? 1 : -1;

    // Find the innermost free lane on the preferred side from the parent.
    let chosenOffset = null;
    for (let step = 1; step <= 20; step++) {
      const candidate = parentOffset + direction * step * LANE_WIDTH;
      if (!occupiedOffsets.has(candidate)) {
        chosenOffset = candidate;
        break;
      }
    }

    // Fallback: opposite side from the spine (step 1 upward on the other side).
    if (chosenOffset === null) {
      for (let step = 1; step <= 20; step++) {
        const candidate = -direction * step * LANE_WIDTH;
        if (!occupiedOffsets.has(candidate)) {
          chosenOffset = candidate;
          break;
        }
      }
    }

    if (chosenOffset === null) {
      console.warn(`assignLanes: no free lane found for "${lineKey}" — using fallback.`);
      chosenOffset = direction * LANE_WIDTH;
    }

    // Assign color index (increments once per new line_key per family).
    if (!colorIndexByFamily.has(familyId)) colorIndexByFamily.set(familyId, 0);
    const colorIndex = colorIndexByFamily.get(familyId);
    colorIndexByFamily.set(familyId, colorIndex + 1);

    result.set(lineKey, {
      laneOffset:   chosenOffset,
      parentOffset,
      side:         chosenOffset > parentOffset ? 'right' : 'left',
      familyId,
      colorIndex,
    });
    occupiedOffsets.add(chosenOffset);
  }

  return result;
}
