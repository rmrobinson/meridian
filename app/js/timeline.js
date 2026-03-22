/**
 * timeline.js — Root SVG canvas, scroll container, virtualized render window.
 *
 * Public API:
 *   initTimeline({ svg, scrollContainer, layout, renderObjects })
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

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Viewport heights to keep rendered above and below the visible window. */
const BUFFER_RATIO = 1.5;

/**
 * Initialize the timeline.
 *
 * @param {object}         opts
 * @param {SVGSVGElement}  opts.svg
 * @param {HTMLElement}    opts.scrollContainer
 * @param {object}         opts.layout
 * @param {object[]}       opts.renderObjects
 */
export function initTimeline({ svg, scrollContainer, layout, renderObjects }) {
  const { totalHeight } = layout;

  svg.setAttribute('height', totalHeight);
  svg.setAttribute('width', '100%');

  // Resolve absolute spine center X.
  // getBoundingClientRect is reliable here because the SVG is already in the
  // DOM with width="100%" before initTimeline is called.
  const svgWidth = svg.getBoundingClientRect().width || window.innerWidth;
  const spineX   = svgWidth / 2;

  // ── Layer groups ─────────────────────────────────────────────────────────
  const markersLayer  = appendGroup(svg, 'year-markers-layer');
  const linesLayer    = appendGroup(svg, 'lines-layer');
  const spineLayer    = appendGroup(svg, 'spine-layer');
  const stationsLayer = appendGroup(svg, 'stations-layer');

  // ── Spine (single element, always in DOM) ─────────────────────────────────
  const spineLine = svgEl('line');
  spineLine.setAttribute('class', 'spine-path');
  spineLine.setAttribute('data-testid', 'spine-path');
  spineLine.setAttribute('x1', '50%');
  spineLine.setAttribute('y1', '0');
  spineLine.setAttribute('x2', '50%');
  spineLine.setAttribute('y2', totalHeight);
  spineLayer.appendChild(spineLine);

  // ── Year markers (small count, always in DOM) ─────────────────────────────
  for (const marker of renderObjects.filter((o) => o.type === 'year-marker')) {
    markersLayer.appendChild(buildYearMarker(marker));
  }

  // ── Span lines + stations (both virtualized) ─────────────────────────────

  const spanObjects    = renderObjects.filter((o) => o.type === 'span-line');
  const stationObjects = renderObjects.filter((o) => o.type === 'station');

  // Pre-sort stations ascending by Y for predictable iteration order.
  stationObjects.sort((a, b) => a.y - b.y);

  const liveSpans    = new Map(); // id → SVGElement
  const liveStations = new Map(); // id → SVGElement

  function sync() {
    const scrollTop = scrollContainer.scrollTop;
    const vh        = scrollContainer.clientHeight;
    const buffer    = vh * BUFFER_RATIO;
    const yMin      = scrollTop - buffer;
    const yMax      = scrollTop + vh + buffer;

    // Span lines: in range when any part of their Y extent overlaps the window.
    // yEnd < yStart (yEnd is more recent / top of span, yStart is older / bottom).
    // Branch extends curveHeight below yStart; merge extends curveHeight above yEnd.
    // Full visual extent: [yEnd - curveHeight, yStart + curveHeight].
    for (const obj of spanObjects) {
      const inRange = (obj.yStart + obj.curveHeight) >= yMin && (obj.yEnd - obj.curveHeight) <= yMax;
      if (inRange && !liveSpans.has(obj.id)) {
        liveSpans.set(obj.id, linesLayer.appendChild(buildSpanLine(obj, spineX)));
      } else if (!inRange && liveSpans.has(obj.id)) {
        liveSpans.get(obj.id).remove();
        liveSpans.delete(obj.id);
      }
    }

    // Station dots.
    for (const obj of stationObjects) {
      const inRange = obj.y >= yMin && obj.y <= yMax;
      if (inRange && !liveStations.has(obj.id)) {
        liveStations.set(obj.id, stationsLayer.appendChild(buildStation(obj, spineX)));
      } else if (!inRange && liveStations.has(obj.id)) {
        liveStations.get(obj.id).remove();
        liveStations.delete(obj.id);
      }
    }
  }

  sync(); // render the initial viewport
  scrollContainer.addEventListener('scroll', () => requestAnimationFrame(sync));
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
  g.dataset.family = familyId;

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

  return g;
}

/**
 * Station dot: invisible hit area (≥44px) + visible circle.
 *
 * Spine stations use cx="50%" (resize-safe).
 * Lane stations use an absolute spineX + laneOffset coordinate.
 */
function buildStation(obj, spineX) {
  const { id, event, y, isMajor, laneOffset, color } = obj;
  const onSpine = laneOffset === 0;
  const cx = onSpine ? '50%' : String(spineX + laneOffset);

  const g = svgEl('g');
  g.setAttribute('class', `station station--${event.family_id}`);
  // Use obj.id (not event.id) so start and end stations get distinct testids.
  g.setAttribute('data-testid', `station-${id}`);
  g.dataset.id       = event.id;
  g.dataset.familyId = event.family_id;

  // Hit area — minimum 44×44px touch target.
  const hit = svgEl('circle');
  hit.setAttribute('class', 'station-hit');
  hit.setAttribute('cx', cx);
  hit.setAttribute('cy', y);
  hit.setAttribute('r', '22');

  // Visual dot.
  const dot = svgEl('circle');
  dot.setAttribute('class', 'station-dot');
  dot.setAttribute('cx', cx);
  dot.setAttribute('cy', y);
  dot.setAttribute('r', isMajor ? 7 : 4);
  if (color) dot.setAttribute('fill', color);

  g.appendChild(hit);
  g.appendChild(dot);
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
