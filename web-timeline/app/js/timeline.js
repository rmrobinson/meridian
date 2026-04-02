/**
 * timeline.js — Root SVG canvas, scroll container, virtualized render window.
 *
 * Public API:
 *   const controller = initTimeline({ svg, scrollContainer, layout, renderObjects })
 *   controller.setRenderObjects(layout, renderObjects)  // swap content on zoom change
 *
 * All layout math is pre-computed by main.js. This module only manages
 * DOM visibility — create elements entering the render window, remove those
 * leaving it.
 *
 * Layer paint order (bottom → top):
 *   1. year-markers-layer  — horizontal tick lines + year labels
 *   2. lines-layer         — virtualized episodic span paths
 *   3. spine-layer         — central vertical line (always in DOM)
 *   4. stations-layer      — virtualized event dots (above all paths)
 */

import { branchBezier, mergeBezier, straightSegment } from './lines.js';
import { buildStation } from './stations.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Viewport heights to keep rendered above and below the visible window. */
const BUFFER_RATIO = 1.5;

/**
 * Initialize the timeline.
 *
 * Creates SVG layers and the spine once. Attaches the scroll listener once.
 * Returns a controller whose `setRenderObjects` method swaps content without
 * tearing down the layer structure or re-binding listeners.
 *
 * @param {object}         opts
 * @param {SVGSVGElement}  opts.svg
 * @param {HTMLElement}    opts.scrollContainer
 * @param {object}         opts.layout
 * @param {object[]}       opts.renderObjects
 * @returns {{ setRenderObjects(layout: object, renderObjects: object[]): void }}
 */
export function initTimeline({ svg, scrollContainer, layout, renderObjects }) {
  const { totalHeight } = layout;

  svg.setAttribute('height', totalHeight);
  svg.setAttribute('width', '100%');

  // Resolve absolute spine center X.
  // getBoundingClientRect is reliable here because the SVG is already in the
  // DOM with width="100%" before initTimeline is called.
  // Declared as `let` so the ResizeObserver can update it when the window
  // is resized — span lines and stations use absolute pixel coordinates.
  let spineX = (svg.getBoundingClientRect().width || window.innerWidth) / 2;

  // ── Layer groups — created once, never torn down ──────────────────────────
  // Paint order (bottom → top): markers, spine, branch lines, stations.
  // spine-layer must be below lines-layer so child branches render over the
  // parent spine rather than behind it.
  const markersLayer  = appendGroup(svg, 'year-markers-layer');
  const spineLayer    = appendGroup(svg, 'spine-layer');
  const linesLayer    = appendGroup(svg, 'lines-layer');
  const stationsLayer = appendGroup(svg, 'stations-layer');

  // ── Spine (border + main line, always in DOM) ─────────────────────────────
  // The border line is rendered first (behind) at a wider stroke-width.
  // A CSS drop-shadow() filter is used for the shadow instead of the SVG
  // filter used on span lines — the SVG filter collapses on zero-width
  // bounding boxes (perfectly vertical <line> elements).
  const spineLineBorder = svgEl('line');
  spineLineBorder.setAttribute('class', 'spine-border');
  spineLineBorder.setAttribute('x1', '50%');
  spineLineBorder.setAttribute('y1', '0');
  spineLineBorder.setAttribute('x2', '50%');
  spineLineBorder.setAttribute('y2', totalHeight);
  spineLayer.appendChild(spineLineBorder);

  const spineLine = svgEl('line');
  spineLine.setAttribute('class', 'spine-path');
  spineLine.setAttribute('data-testid', 'spine-path');
  spineLine.setAttribute('x1', '50%');
  spineLine.setAttribute('y1', '0');
  spineLine.setAttribute('x2', '50%');
  spineLine.setAttribute('y2', totalHeight);
  spineLayer.appendChild(spineLine);

  // ── Mutable render state (swapped by loadContent) ─────────────────────────
  let spanObjects       = [];
  let stationObjects    = [];
  let spanObjectById    = new Map(); // id → render object (for O(1) eviction lookup)
  let stationObjectById = new Map();
  const liveSpans       = new Map(); // id → SVGElement
  const liveStations    = new Map(); // id → SVGElement

  // ── Virtualized sync loop ─────────────────────────────────────────────────
  //
  // Two-pass design:
  //   Pass 1 — evict: walk liveSpans/liveStations (O(k), k = live count)
  //            and remove elements that have scrolled out of range.
  //   Pass 2 — add: walk sorted arrays with early-exit (O(k') until first
  //            element provably below window) and mount newly in-range elements.
  //
  // Splitting eviction from addition avoids a bug in single-pass early-exit:
  // when scrolling UP, elements now below yMax sit at the END of the sorted
  // arrays and would never be reached before the break, leaking DOM nodes.

  function sync() {
    const scrollTop = scrollContainer.scrollTop;
    const vh        = scrollContainer.clientHeight;
    const buffer    = vh * BUFFER_RATIO;
    const yMin      = scrollTop - buffer;
    const yMax      = scrollTop + vh + buffer;

    const t0 = performance.now();

    // ── Pass 1: evict elements that have left the render window ───────────────
    // Iterating a Map and deleting entries during iteration is safe in JS —
    // the iterator skips entries that were deleted before being visited.
    for (const [id, el] of liveSpans) {
      const obj = spanObjectById.get(id);
      if (!obj ||
          (obj.yEnd   - obj.curveHeight) > yMax ||
          (obj.yStart + obj.curveHeight) < yMin) {
        el.remove();
        liveSpans.delete(id);
      }
    }
    for (const [id, el] of liveStations) {
      const obj = stationObjectById.get(id);
      if (!obj || obj.y < yMin || obj.y > yMax) {
        el.remove();
        liveStations.delete(id);
      }
    }

    // ── Pass 2: mount newly in-range elements, early-exit once below window ───
    // spanObjects sorted by yEnd asc (top of span first).
    // Once yEnd - curveHeight > yMax the span's top is below the window and all
    // subsequent spans are also below — safe to stop.
    for (const obj of spanObjects) {
      if ((obj.yEnd - obj.curveHeight) > yMax) break;
      if ((obj.yStart + obj.curveHeight) >= yMin && !liveSpans.has(obj.id)) {
        liveSpans.set(obj.id, linesLayer.appendChild(buildSpanLine(obj, spineX)));
      }
    }
    // stationObjects sorted by y asc.
    for (const obj of stationObjects) {
      if (obj.y > yMax) break;
      if (obj.y >= yMin && !liveStations.has(obj.id)) {
        liveStations.set(obj.id, stationsLayer.appendChild(buildStation(obj, spineX)));
      }
    }

    // Performance logging — enabled via window.__timeline_perf = true.
    if (window.__timeline_perf) {
      const ms = (performance.now() - t0).toFixed(2);
      console.log(
        `[perf] sync ${ms}ms | live: ${liveSpans.size} spans, ${liveStations.size} stations` +
        ` | total: ${spanObjects.length} spans, ${stationObjects.length} stations`,
      );
    }
  }

  // ── Content loader — called on first render and on every zoom change ───────

  function loadContent(newLayout, newRenderObjects) {
    const { totalHeight: newHeight } = newLayout;

    // Resize canvas and spine to match the new scale.
    svg.setAttribute('height', newHeight);
    spineLineBorder.setAttribute('y2', newHeight);
    spineLine.setAttribute('y2', newHeight);

    // Rebuild year markers (always non-virtualized).
    markersLayer.replaceChildren();
    for (const marker of newRenderObjects.filter((o) => o.type === 'year-marker')) {
      markersLayer.appendChild(buildYearMarker(marker));
    }

    // Evict all currently live virtualized elements.
    for (const el of liveSpans.values()) el.remove();
    liveSpans.clear();
    for (const el of liveStations.values()) el.remove();
    liveStations.clear();

    // Swap the render-object arrays and re-sync the viewport.
    // Sort both arrays by their top Y coordinate (ascending = top of canvas first)
    // so the addition pass in sync() can early-exit once objects are provably
    // below the visible window. Lookup maps enable O(1) eviction in pass 1.
    spanObjects    = newRenderObjects.filter((o) => o.type === 'span-line');
    spanObjects.sort((a, b) => a.yEnd - b.yEnd);       // yEnd is the top (smaller Y)
    stationObjects = newRenderObjects.filter((o) => o.type === 'station');
    stationObjects.sort((a, b) => a.y - b.y);
    spanObjectById    = new Map(spanObjects.map((o) => [o.id, o]));
    stationObjectById = new Map(stationObjects.map((o) => [o.id, o]));

    sync();
  }

  // Initial render.
  loadContent(layout, renderObjects);

  // Single scroll listener — attached once, survives zoom changes.
  scrollContainer.addEventListener('scroll', () => requestAnimationFrame(sync));

  // ── Resize handling ───────────────────────────────────────────────────────
  // The spine uses x1/x2="50%" and repositions automatically. Span lines and
  // station dots use absolute spineX coordinates and must be rebuilt when the
  // SVG width changes. ResizeObserver fires exactly when the element resizes
  // (including window resize) and is already rate-limited by the browser.
  new ResizeObserver((entries) => {
    const newWidth = entries[0]?.contentRect.width;
    if (!newWidth) return;
    const newSpineX = newWidth / 2;
    if (newSpineX === spineX) return;
    spineX = newSpineX;
    // Evict all live elements — sync() will rebuild them with the updated spineX.
    for (const el of liveSpans.values()) el.remove();
    liveSpans.clear();
    for (const el of liveStations.values()) el.remove();
    liveStations.clear();
    sync();
  }).observe(svg);

  // ── Public controller ─────────────────────────────────────────────────────
  return {
    /**
     * Swap render objects after a zoom-level change.
     * No API re-fetch; no layer teardown; no new scroll listener.
     */
    setRenderObjects(newLayout, newRenderObjects) {
      loadContent(newLayout, newRenderObjects);
    },
  };
}

// ── Builder functions ─────────────────────────────────────────────────────────

/**
 * Year marker: horizontal tick line + year label.
 */
function buildYearMarker(marker) {
  const g = svgEl('g');
  g.setAttribute('class', `year-marker${marker.isToday ? ' year-marker--today' : ''}`);
  g.setAttribute('data-testid', `year-marker-${marker.id}`);
  g.dataset.year = marker.label;

  const tick = svgEl('line');
  tick.setAttribute('class', 'year-tick');
  tick.setAttribute('x1', '0');
  tick.setAttribute('x2', '100%');
  tick.setAttribute('y1', marker.y);
  tick.setAttribute('y2', marker.y);

  const label = svgEl('text');
  label.setAttribute('class', `year-label${marker.isToday ? ' year-label--today' : ''}`);
  label.setAttribute('x', '10');
  label.setAttribute('y', marker.y - 5);
  label.textContent = marker.label;

  g.appendChild(tick);
  g.appendChild(label);
  return g;
}

/**
 * Span line: branch bezier + straight segment + optional merge bezier.
 *
 * Three separate <path> elements share a <g> so they can be virtualized
 * together and styled with a single class.
 *
 * parentOffset is the signed pixel offset of the parent line from spine center.
 * For spine-parented spans this is 0. For nested branches it is the parent
 * line's laneOffset, so bezier curves connect to the correct parent X.
 */
function buildSpanLine(obj, spineX) {
  const { laneOffset, parentOffset, yStart, yEnd, curveHeight, on_end, color, familyId } = obj;
  const laneX   = spineX + laneOffset;
  const parentX = spineX + (parentOffset ?? 0);

  const g = svgEl('g');
  g.setAttribute('class', `span-line span-line--${familyId}`);
  g.setAttribute('data-testid', `span-line-${obj.id}`);
  g.dataset.family    = familyId;
  g.dataset.id        = obj.eventId;
  g.setAttribute('role',       'button');
  g.setAttribute('tabindex',   '0');
  g.setAttribute('aria-label', obj.title ?? obj.eventId);

  // Mobile sibling-collapse data attributes (set when concurrent siblings exist).
  if ((obj.siblingCount ?? 1) > 1) {
    g.dataset.siblingCount = String(obj.siblingCount);
    g.dataset.siblingIndex = String(obj.siblingIndex);
  }

  // Branch: parent line → lane at the event start date.
  // Departs parent at (parentX, yStart + curveHeight), arrives lane at (laneX, yStart).
  const branch = svgEl('path');
  branch.setAttribute('class', 'span-branch');
  branch.setAttribute('d', branchBezier(parentX, laneX, yStart, curveHeight));
  branch.setAttribute('stroke', color);

  // Straight segment: lane, from branch arrival (yStart) to merge departure (yEnd).
  const segment = svgEl('path');
  segment.setAttribute('class', 'span-segment');
  segment.setAttribute('d', straightSegment(laneX, yStart, yEnd));
  segment.setAttribute('stroke', color);

  g.appendChild(branch);
  g.appendChild(segment);

  // Merge (only when on_end === 'merge'): lane → parent line at the event end date.
  // Departs lane at (laneX, yEnd), arrives parent at (parentX, yEnd - curveHeight).
  if (on_end === 'merge') {
    const merge = svgEl('path');
    merge.setAttribute('class', 'span-merge');
    merge.setAttribute('d', mergeBezier(laneX, parentX, yEnd, curveHeight));
    merge.setAttribute('stroke', color);
    g.appendChild(merge);
  }

  // Transparent wide hit path over the straight segment for easier mouse/touch targeting.
  // Appended last so it sits on top of the visual paths and captures events first.
  const hit = svgEl('path');
  hit.setAttribute('class', 'span-hit');
  hit.setAttribute('d', straightSegment(laneX, yStart, yEnd));
  g.appendChild(hit);

  return g;
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function svgEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

function appendGroup(parent, className) {
  const g = svgEl('g');
  g.setAttribute('class', className);
  parent.appendChild(g);
  return g;
}
