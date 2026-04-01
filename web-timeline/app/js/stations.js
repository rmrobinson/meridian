/**
 * stations.js — Station DOM building: event dot, icon, label, hit area.
 *
 * Each station has:
 *   - An invisible <circle> hit area (≥44px) for accessible touch targets
 *   - A visible <circle> dot sized by importance
 *   - An optional MDI icon rendered beside the dot
 *   - An optional label <text> element
 *
 * Spine stations use cx="50%" for dot/hit so they reposition on window resize.
 * All other coordinates are absolute — the ResizeObserver in timeline.js evicts
 * and rebuilds live stations whenever spineX changes.
 *
 * Icon visibility by zoom level is driven by CSS body classes (zoom-day /
 * zoom-month / zoom-year) rather than JS, so no re-render is needed on zoom.
 */

import { getIconPath } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_SIZE = 24;
const ICON_GAP  = 4;

/**
 * Build a station <g> element from a render object.
 *
 * @param {object} obj     - Station render object from main.js buildRenderObjects().
 * @param {number} spineX  - Absolute pixel X of the spine centre.
 * @returns {SVGGElement}
 */
export function buildStation(obj, spineX) {
  const { id, event, y, isMajor, laneOffset, color, label, icon } = obj;
  const onSpine = laneOffset === 0;
  const cx_abs  = spineX + laneOffset;
  const cx_svg  = onSpine ? '50%' : String(cx_abs);

  // Right-side and spine: icon to the right, label to the left (inner side).
  // Left-side: icon to the left, label to the right (inner side).
  const isRight = laneOffset >= 0;
  const dotR    = isMajor ? 7 : 4;

  const iconPath = icon ? getIconPath(icon) : null;

  const g = svgEl('g');
  g.setAttribute('class',
    `station station--${event.family_id}${iconPath ? ' station--has-icon' : ''}${obj.departure ? ' station--departure' : ''}${obj.arrival ? ' station--arrival' : ''}`);
  g.setAttribute('data-testid', `station-${id}`);
  g.setAttribute('role',        'button');
  g.setAttribute('tabindex',    '0');
  g.setAttribute('aria-label',  event.title ?? id);
  g.dataset.id       = event.id;
  g.dataset.familyId = event.family_id;

  // Mirror span sibling attributes so the mobile-collapse CSS rule hides
  // stations of non-innermost sibling spans alongside their lines.
  if ((obj.siblingCount ?? 1) > 1) {
    g.dataset.siblingCount = String(obj.siblingCount);
    g.dataset.siblingIndex = String(obj.siblingIndex);
  }

  // ── Hit area — minimum 44×44px touch target ───────────────────────────────
  const hit = svgEl('circle');
  hit.setAttribute('class', 'station-hit');
  hit.setAttribute('cx', cx_svg);
  hit.setAttribute('cy', y);
  hit.setAttribute('r', '22');
  g.appendChild(hit);

  // ── Dot ───────────────────────────────────────────────────────────────────
  const dot = svgEl('circle');
  dot.setAttribute('class', 'station-dot');
  dot.setAttribute('cx', cx_svg);
  dot.setAttribute('cy', y);
  dot.setAttribute('r', dotR);
  if (color) dot.setAttribute('fill', color);
  g.appendChild(dot);

  // ── Icon ──────────────────────────────────────────────────────────────────
  // Always beside the dot on the outer side. The dot is never hidden — the
  // icon complements it at all zoom levels.
  // Departure/arrival station icons are suppressed at ZOOM_MONTH/YEAR via CSS.
  if (iconPath) {
    const besideX = isRight
      ? cx_abs + dotR + ICON_GAP
      : cx_abs - dotR - ICON_GAP - ICON_SIZE;

    g.appendChild(makeMdiIcon(iconPath, 'station-icon',
      besideX, y - ICON_SIZE / 2, ICON_SIZE));
  }

  // ── Label ─────────────────────────────────────────────────────────────────
  // Inner side (between dot and spine). Visibility at compressed zooms via CSS.
  if (label) {
    const LABEL_GAP = 6;
    const labelX = isRight
      ? cx_abs - dotR - LABEL_GAP
      : cx_abs + dotR + LABEL_GAP;

    const text = svgEl('text');
    text.setAttribute('class',
      `station-label${isMajor ? ' station-label--major' : ''}`);
    text.setAttribute('x',                 String(labelX));
    text.setAttribute('y',                 String(y));
    text.setAttribute('text-anchor',       isRight ? 'end' : 'start');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = label;
    g.appendChild(text);
  }

  return g;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function svgEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

/**
 * Create a nested <svg> containing a single MDI <path>.
 * MDI icons use a 24×24 viewBox; the outer svg scales them to `size` px.
 *
 * @param {string} d         - SVG path `d` attribute from the cached MDI file.
 * @param {string} className - CSS class for the outer <svg>.
 * @param {number} x
 * @param {number} y
 * @param {number} size      - Width and height in px.
 * @returns {SVGSVGElement}
 */
function makeMdiIcon(d, className, x, y, size) {
  const icon = svgEl('svg');
  icon.setAttribute('class',   className);
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('x',       String(x));
  icon.setAttribute('y',       String(y));
  icon.setAttribute('width',   String(size));
  icon.setAttribute('height',  String(size));

  const path = svgEl('path');
  path.setAttribute('d',    d);
  path.setAttribute('fill', 'currentColor');
  icon.appendChild(path);

  return icon;
}
