/**
 * main.js — Bootstrap, pre-computation pipeline, wires modules together.
 *
 * Load order:
 *   1. fetchTimeline()        — fetch + normalize API/mock response  (api.js)
 *   2. buildRenderObjects()   — lane assignment + render object array (here)
 *   3. initTimeline()         — hand off to the virtualized renderer  (timeline.js)
 *
 * Zoom changes do not re-fetch data. buildRenderObjects() is called again with
 * the new pxPerDay value, and the controller returned by initTimeline() swaps
 * the content in place.
 *
 * Devtools hook:
 *   window.__timeline_setZoom(pxPerDay)
 *   e.g. window.__timeline_setZoom(0.07)  // ZOOM_YEAR
 */

import { fetchTimeline } from './api.js';
import { buildCardContent } from './cards.js';
import { preloadIcons } from './icons.js';
import { CURVE_HEIGHT, timeToY } from './lines.js';
import { assignLanes } from './lanes.js';
import { initTimeline } from './timeline.js';
import {
  ZOOM_DAY, ZOOM_MONTH, ZOOM_YEAR,
  aggregateByMonth, filterForYearZoom,
} from './zoom.js';

const MS_PER_DAY = 86_400_000;

/** Cached API response — populated once, reused on zoom changes. */
let _data       = null;

/** Controller returned by initTimeline — exposes setRenderObjects. */
let _controller = null;

/** Active zoom level — tracked so theme changes can re-render at the same scale. */
let _pxPerDay   = ZOOM_DAY;

/**
 * Lookup maps built once from _data after fetch. Used by the click handler to
 * resolve a station's dataset.id back to its event object.
 * _eventById covers all original + birthday events.
 * _aggregateById is rebuilt on every ZOOM_MONTH render (aggregates are
 * zoom-level-specific synthetic objects).
 */
let _eventById     = new Map();
let _aggregateById = new Map();

async function init() {
  const container = document.getElementById('timeline-container');

  const loadingEl = document.createElement('p');
  loadingEl.className = 'timeline-loading';
  loadingEl.textContent = 'Loading timeline…';
  container.appendChild(loadingEl);

  _data = await fetchTimeline();
  loadingEl.remove();

  // Pre-load all icon files into the cache before any rendering begins.
  // getIconPath() is called synchronously during scroll; the cache must be
  // fully populated first.
  await preloadIcons(_data.events);

  // Build the event lookup map once — used by click handlers.
  _eventById = new Map(_data.events.map((e) => [e.id, e]));

  const svg             = document.getElementById('timeline-svg');
  const scrollContainer = document.getElementById('timeline-container');

  const { layout, renderObjects } = buildRenderObjects(_data, ZOOM_DAY);
  setBodyZoom(ZOOM_DAY);
  _controller = initTimeline({ svg, scrollContainer, layout, renderObjects });

  setupZoomButtons();
  setupThemeToggle();
  setupCardInteraction(svg);
  setupSpanHoverSync(svg);
}

/**
 * Build the full render-object array for a given zoom level.
 *
 * Pure function of (data, pxPerDay) — safe to call multiple times.
 *
 * @param {object} data      - Normalized API response from fetchTimeline().
 * @param {number} pxPerDay  - One of ZOOM_DAY, ZOOM_MONTH, or ZOOM_YEAR.
 * @returns {{ layout: object, renderObjects: object[] }}
 */
function buildRenderObjects(data, pxPerDay) {
  // Clamp to midnight so year-marker positions are stable.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const birthDate   = new Date(data.person.birth_date);
  const totalDays   = (today - birthDate) / MS_PER_DAY;
  const totalHeight = Math.ceil(totalDays) * pxPerDay;

  const layout = { totalHeight, today, birthDate, pxPerDay };

  function yFor(date) {
    return timeToY(date, birthDate, today, totalHeight);
  }

  const familyById = new Map(data.line_families.map((f) => [f.id, f]));

  // ── Apply zoom-level event transformation ─────────────────────────────────
  // ZOOM_DAY: all events as-is.
  // ZOOM_MONTH: point events aggregated per (family_id, year-month).
  // ZOOM_YEAR: point events dropped; one synthetic midpoint per span.

  let events = data.events;
  if (pxPerDay === ZOOM_MONTH) {
    events = aggregateByMonth(events, data.line_families);
    // Rebuild the aggregate lookup so click handlers can resolve agg-* IDs.
    _aggregateById = new Map(
      events.filter((e) => e.type === 'aggregate').map((e) => [e.id, e]),
    );
  } else {
    _aggregateById = new Map();
    if (pxPerDay === ZOOM_YEAR) events = filterForYearZoom(events);
  }

  // ── Lane assignment ────────────────────────────────────────────────────────

  const laneMap = assignLanes(events, data.line_families);

  const renderObjects = [];

  // ── Year markers ──────────────────────────────────────────────────────────

  const birthYear   = birthDate.getUTCFullYear();
  const currentYear = today.getUTCFullYear();

  for (let yr = currentYear; yr >= birthYear; yr--) {
    const y = yFor(new Date(Date.UTC(yr, 0, 1)));
    if (y < 0 || y > totalHeight) continue;
    renderObjects.push({ type: 'year-marker', id: `year-${yr}`, y, label: String(yr), isToday: false });
  }

  renderObjects.push({ type: 'year-marker', id: 'marker-today', y: 0,           label: formatDate(today),     isToday: true  });
  renderObjects.push({ type: 'year-marker', id: 'marker-birth', y: totalHeight, label: formatDate(birthDate), isToday: false });

  // ── Pass 1 — span-line render objects + start / end stations ─────────────

  const spanRenderObjects = [];

  // Maps span id → station render object, used in Pass 1b to copy sibling info.
  const startStationById = new Map();
  const endStationById   = new Map();

  for (const evt of events) {
    if (evt.type !== 'span') continue;

    const family = familyById.get(evt.family_id);
    if (!family) continue;

    const info = laneMap.get(evt.line_key);
    if (!info) continue;

    const yStart = yFor(evt.start_date);
    const yEnd   = yFor(evt.end_date);

    // Skip spans entirely outside the canvas.
    if (yEnd < 0 || yStart > totalHeight) continue;

    const { laneOffset, parentOffset, colorIndex } = info;

    // per_event families get hue-shifted color variants so concurrent siblings
    // are visually distinct. single_line families always use the base color.
    const color = family.spawn_behavior === 'per_event'
      ? variantColor(family.base_color_hsl, colorIndex)
      : hslColor(family.base_color_hsl);

    const spanObj = {
      type:         'span-line',
      id:           `span-${evt.id}`,
      eventId:      evt.id,
      title:        evt.title,
      familyId:     family.id,
      laneOffset,
      parentOffset,
      yStart:       Math.max(0, yStart),
      yEnd:         Math.min(totalHeight, yEnd),
      curveHeight:  CURVE_HEIGHT,
      on_end:       family.on_end,
      color,
      // Sibling fields computed in Pass 1b below.
      siblingCount: 1,
      siblingIndex: 0,
    };
    spanRenderObjects.push(spanObj);

    const clampedYStart = spanObj.yStart;
    const clampedYEnd   = spanObj.yEnd;

    // Start station: departure dot on the PARENT line at the exact point where
    // the branch bezier departs — (parentX, clampedYStart + curveHeight).
    // branchBezier departs from (parentX, branchY + curveHeight), so the station
    // sits curveHeight pixels below (older than) the event start date.
    const startStationY = clampedYStart + CURVE_HEIGHT;
    if (startStationY >= 0 && startStationY <= totalHeight) {
      const startStation = {
        type: 'station', id: evt.id,
        y: startStationY, laneOffset: parentOffset, color, event: evt, isMajor: false,
        label:     evt.label ?? truncate(evt.title),
        icon:      evt.icon ?? null,
        departure: true,  // CSS hides icon at compressed zooms to avoid spine clutter
      };
      renderObjects.push(startStation);
      startStationById.set(evt.id, startStation);
    }

    // End station: termination dot only — no label or icon.
    // merge:     arrival dot on PARENT line where the merge bezier ends (yEnd − curveHeight).
    // terminate: dot on the branch lane at yEnd.
    if (family.on_end === 'merge') {
      const endY = clampedYEnd - CURVE_HEIGHT;
      if (endY >= 0 && endY <= totalHeight) {
        const endStation = {
          type: 'station', id: `${evt.id}-end`,
          y: endY, laneOffset: parentOffset, color, event: evt, isMajor: false,
          label:   null,
          icon:    evt.end_icon ?? null,
          arrival: true,  // CSS hides icon at compressed zooms
        };
        renderObjects.push(endStation);
        endStationById.set(evt.id, endStation);
      }
    } else {
      if (clampedYEnd >= 0 && clampedYEnd <= totalHeight) {
        const endStation = {
          type: 'station', id: `${evt.id}-end`,
          y: clampedYEnd, laneOffset, color, event: evt, isMajor: false,
          label: null,
          icon:  null,
        };
        renderObjects.push(endStation);
        endStationById.set(evt.id, endStation);
      }
    }
  }

  // ── Pass 1b — compute siblingCount and siblingIndex ───────────────────────
  //
  // Two spans are siblings if they share the same familyId and their Y ranges
  // overlap. yStart > yEnd (yStart = older = larger Y).
  // Overlap: b.yEnd <= a.yStart AND b.yStart >= a.yEnd.
  // siblingIndex = number of siblings whose |laneOffset| is strictly smaller
  // (0 = innermost; shown on mobile as the collapsed representative).

  const spansByFamily = new Map();
  for (const obj of spanRenderObjects) {
    if (!spansByFamily.has(obj.familyId)) spansByFamily.set(obj.familyId, []);
    spansByFamily.get(obj.familyId).push(obj);
  }

  for (const siblings of spansByFamily.values()) {
    if (siblings.length < 2) continue;

    for (const a of siblings) {
      let concurrentCount = 1; // include self
      let innerSiblings   = 0; // how many siblings have smaller |laneOffset|

      for (const b of siblings) {
        if (b === a) continue;
        const overlaps = b.yEnd <= a.yStart && b.yStart >= a.yEnd;
        if (!overlaps) continue;

        concurrentCount++;
        if (Math.abs(b.laneOffset) < Math.abs(a.laneOffset)) innerSiblings++;
      }

      if (concurrentCount > 1) {
        a.siblingCount = concurrentCount;
        a.siblingIndex = innerSiblings;
      }
    }
  }

  renderObjects.push(...spanRenderObjects);

  // ── Pass 1c — propagate sibling info to start/end station objects ──────────
  //
  // CSS hides non-innermost sibling span-lines on mobile via [data-sibling-index].
  // Their stations must also be hidden. Copy siblingCount/siblingIndex onto the
  // station objects so buildStation() can set the matching data attributes.

  for (const obj of spanRenderObjects) {
    if (obj.siblingCount <= 1) continue;
    const startSt = startStationById.get(obj.eventId);
    if (startSt) { startSt.siblingCount = obj.siblingCount; startSt.siblingIndex = obj.siblingIndex; }
    const endSt = endStationById.get(obj.eventId);
    if (endSt) { endSt.siblingCount = obj.siblingCount; endSt.siblingIndex = obj.siblingIndex; }
  }

  // ── Pass 2 — point / aggregate event stations ─────────────────────────────
  //
  // Spine point events go on the spine (laneOffset: 0).
  // Non-spine point events inherit their line's lane if one is assigned
  // (relevant for single_line families like fitness).
  // Aggregate events from ZOOM_MONTH are also rendered here as spine stations.

  for (const evt of events) {
    if (evt.type !== 'point' && evt.type !== 'aggregate') continue;
    const date = evt.date;
    if (!date) continue;

    const y = yFor(date);
    if (y < 0 || y > totalHeight) continue;

    const laneInfo   = laneMap.get(evt.line_key);
    const laneOffset = laneInfo?.laneOffset ?? 0;
    const family     = familyById.get(evt.family_id);
    const color      = (family && laneInfo)
      ? variantColor(family.base_color_hsl, laneInfo.colorIndex)
      : null;

    const isMajor =
      evt.family_id === 'spine' &&
      evt.metadata?.milestone_type !== 'birthday';

    renderObjects.push({
      type: 'station', id: evt.id,
      y, laneOffset, color, event: evt, isMajor,
      label: evt.label ?? truncate(evt.title),
      icon:  evt.icon ?? null,
    });
  }

  return { layout, renderObjects };
}

// ── Zoom button wiring ────────────────────────────────────────────────────────

/**
 * Attach click listeners to the Day / Month / Year buttons in the zoom bar.
 * Toggles `zoom-btn--active` class and `aria-pressed` attribute on each press,
 * then rebuilds render objects and hands off to the timeline controller.
 *
 * Called once after first render so _data and _controller are guaranteed set.
 */
function setupZoomButtons() {
  const ZOOM_BY_NAME = { day: ZOOM_DAY, month: ZOOM_MONTH, year: ZOOM_YEAR };
  const buttons = Array.from(document.querySelectorAll('.zoom-btn'));

  // Initialise aria-pressed to match the visually-active button.
  buttons.forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.classList.contains('zoom-btn--active') ? 'true' : 'false');
  });

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pxPerDay = ZOOM_BY_NAME[btn.dataset.zoom];
      if (!pxPerDay) return;

      buttons.forEach((b) => {
        b.classList.remove('zoom-btn--active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('zoom-btn--active');
      btn.setAttribute('aria-pressed', 'true');

      _pxPerDay = pxPerDay;
      const { layout, renderObjects } = buildRenderObjects(_data, pxPerDay);
      setBodyZoom(pxPerDay);
      _controller.setRenderObjects(layout, renderObjects);
    });
  });
}

// ── Card interaction ──────────────────────────────────────────────────────────

/**
 * Wire delegated click on the SVG → open card, close button, backdrop, Escape.
 * Must be called after initTimeline() so the SVG layers exist.
 */
function setupCardInteraction(svg) {
  const overlay = document.getElementById('card-overlay');
  const sheet   = document.getElementById('card-sheet');
  const content = document.getElementById('card-content');
  const closeBtn = document.getElementById('card-close');

  // Delegated click on the SVG — stations and span lines both bubble up here.
  svg.addEventListener('click', (e) => {
    const el = e.target.closest('.station') ?? e.target.closest('.span-line');
    if (!el) return;
    handleActivate(el, e, overlay, sheet, content);
  });

  // Keyboard activation for elements with role=button + tabindex.
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.station') ?? e.target.closest('.span-line');
    if (!el) return;
    e.preventDefault();
    handleActivate(el, null, overlay, sheet, content);
  });

  closeBtn.addEventListener('click', () => closeCard(overlay));

  // Clicking the backdrop (overlay itself, not the sheet) dismisses.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCard(overlay);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hasAttribute('hidden')) closeCard(overlay);
  });

  // Mobile swipe-down dismiss.
  setupSwipeDismiss(sheet, overlay);
}

function handleActivate(el, mouseEvent, overlay, sheet, content) {
  const eventId = el.dataset.id;
  const event = _aggregateById.get(eventId) ?? _eventById.get(eventId);
  if (!event) return;
  openCard(event, el, mouseEvent, overlay, sheet, content);
}

function openCard(event, el, mouseEvent, overlay, sheet, content) {
  // Populate content.
  content.innerHTML = '';
  content.appendChild(buildCardContent(event));

  // Position (desktop only — mobile is handled entirely by CSS bottom-sheet).
  if (window.innerWidth >= 480) {
    positionCard(el, mouseEvent, sheet);
  } else {
    // Remove any inline positioning set by a prior desktop open.
    sheet.style.top  = '';
    sheet.style.left = '';
  }

  overlay.removeAttribute('hidden');
}

function closeCard(overlay) {
  overlay.setAttribute('hidden', '');
}

/**
 * Compute the anchor rect for card positioning.
 *
 * Stations anchor to their visible dot.
 * Span lines anchor to the mouse/touch point (click), or the element's
 * bounding-rect centre (keyboard activation).
 *
 * @returns {{ left: number, right: number, top: number }}
 */
function anchorRectFor(el, mouseEvent) {
  const dot = el.querySelector('.station-dot');
  if (dot) return dot.getBoundingClientRect();
  if (mouseEvent) {
    return { left: mouseEvent.clientX, right: mouseEvent.clientX, top: mouseEvent.clientY };
  }
  const r = el.getBoundingClientRect();
  const cx = (r.left + r.right) / 2;
  return { left: cx, right: cx, top: (r.top + r.bottom) / 2 };
}

/**
 * Position the floating card beside the activation point.
 * Clamps to the viewport so the card never overflows.
 *
 * Card max-width is 400px (from CSS). We use this as a constant to avoid
 * needing to measure the rendered card (which would require a layout pass).
 */
function positionCard(el, mouseEvent, sheet) {
  const CARD_WIDTH  = 400;
  const GAP         = 12;
  const MARGIN      = 12;

  const anchor    = anchorRectFor(el, mouseEvent);
  const vpWidth   = window.innerWidth;
  const vpHeight  = window.innerHeight;

  // Clamp card width to viewport (handles narrow desktop windows).
  const effectiveW = Math.min(CARD_WIDTH, vpWidth - MARGIN * 2);
  sheet.style.maxWidth = `${effectiveW}px`;

  // Prefer right of anchor; flip left if insufficient space.
  let left;
  if (anchor.right + GAP + effectiveW <= vpWidth - MARGIN) {
    left = anchor.right + GAP;
  } else {
    left = anchor.left - GAP - effectiveW;
  }
  // Clamp to viewport margins.
  left = Math.max(MARGIN, Math.min(left, vpWidth - effectiveW - MARGIN));

  // Align top of card to anchor, clamped so it doesn't extend below viewport.
  const cardHeight = sheet.offsetHeight || 300; // rough fallback before layout
  const top = Math.max(MARGIN,
    Math.min(anchor.top, vpHeight - cardHeight - MARGIN));

  sheet.style.left = `${left}px`;
  sheet.style.top  = `${top}px`;
}

/**
 * When hovering a span line, mirror the hover state onto the departure/arrival
 * stations so their labels and icons appear in compressed zoom levels.
 *
 * Stations and span lines live in separate SVG layers, so CSS alone cannot
 * express this relationship. A delegated mouseover/mouseout pair bridges them
 * by toggling the `station--span-hover` class on matching station elements.
 */
function setupSpanHoverSync(svg) {
  function stationsFor(spanG) {
    return svg.querySelectorAll(`.station[data-id="${spanG.dataset.id}"]`);
  }

  svg.addEventListener('mouseover', (e) => {
    const spanG = e.target.closest('.span-line');
    if (!spanG) return;
    // Ignore moves between child elements within the same span.
    if (e.relatedTarget?.closest('.span-line') === spanG) return;
    stationsFor(spanG).forEach((s) => s.classList.add('station--span-hover'));
  });

  svg.addEventListener('mouseout', (e) => {
    const spanG = e.target.closest('.span-line');
    if (!spanG) return;
    if (e.relatedTarget?.closest('.span-line') === spanG) return;
    stationsFor(spanG).forEach((s) => s.classList.remove('station--span-hover'));
  });
}

/**
 * Swipe-down gesture to dismiss the bottom sheet on mobile.
 * Tracks touch delta and dismisses if the user drags down ≥ 80px.
 */
function setupSwipeDismiss(sheet, overlay) {
  let startY = null;

  sheet.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) sheet.style.transform = `translateY(${delta}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const delta = e.changedTouches[0].clientY - startY;
    sheet.style.transition = '';
    sheet.style.transform  = '';
    startY = null;
    if (delta >= 80) closeCard(overlay);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * True when the current active theme is light.
 * Checks explicit data-theme override first, then the system preference.
 */
function isLightMode() {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light') return true;
  if (theme === 'dark')  return false;
  return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Adjust HSL lightness for the current theme.
 * Base API values are tuned for dark mode; lighten further for dark, darken for light.
 */
function themeL(l) {
  return isLightMode() ? Math.max(l - 20, 20) : l;
}

function hslColor([h, s, l]) {
  return `hsl(${h}, ${s}%, ${themeL(l)}%)`;
}

/**
 * Shift hue by 15° per colorIndex so concurrent siblings in the same family
 * are visually distinct while remaining recognizably related.
 */
function variantColor([h, s, l], colorIndex) {
  const shiftedH = (h + colorIndex * 15) % 360;
  return `hsl(${shiftedH}, ${s}%, ${themeL(l)}%)`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Truncate a string to at most `max` characters, breaking at the last space
 * before the limit and appending an ellipsis.
 */
function truncate(str, max = 22) {
  if (!str || str.length <= max) return str ?? '';
  const cut = str.slice(0, max - 1).trimEnd();
  return cut + '…';
}

/**
 * Reflect the active zoom level on <body> as a CSS class so timeline.css
 * zoom-state rules (label visibility, icon placement) can use simple selectors.
 */
function setBodyZoom(pxPerDay) {
  document.body.classList.remove('zoom-day', 'zoom-month', 'zoom-year');
  if (pxPerDay === ZOOM_MONTH)     document.body.classList.add('zoom-month');
  else if (pxPerDay === ZOOM_YEAR) document.body.classList.add('zoom-year');
  else                             document.body.classList.add('zoom-day');
}

// ── Devtools hook ─────────────────────────────────────────────────────────────
//
// Flip zoom level manually from the browser console:
//   window.__timeline_setZoom(0.25)  // ZOOM_MONTH
//   window.__timeline_setZoom(0.07)  // ZOOM_YEAR
//   window.__timeline_setZoom(2)     // ZOOM_DAY (default)

window.__timeline_setZoom = function (pxPerDay) {
  if (!_data || !_controller) {
    console.warn('__timeline_setZoom: timeline not yet initialized');
    return;
  }
  _pxPerDay = pxPerDay;
  const { layout, renderObjects } = buildRenderObjects(_data, pxPerDay);
  setBodyZoom(pxPerDay);
  _controller.setRenderObjects(layout, renderObjects);
};

// ── Theme toggle ──────────────────────────────────────────────────────────────

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    // Determine the active mode: explicit override, or from system preference.
    const isDark = current === 'dark' ||
      (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    rebuildForThemeChange();
  });

  // When the OS preference changes, clear any stored override so the
  // system setting takes full effect via the prefers-color-scheme media query.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('theme');
    rebuildForThemeChange();
  });
}

/**
 * Rebuild render objects after a theme change so line colors (computed in JS
 * from base_color_hsl) adapt to the new light/dark mode.
 */
function rebuildForThemeChange() {
  if (!_data || !_controller) return;
  const { layout, renderObjects } = buildRenderObjects(_data, _pxPerDay);
  _controller.setRenderObjects(layout, renderObjects);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

init().catch((err) => {
  console.error('Timeline failed to initialize:', err);
  const container = document.getElementById('timeline-container');
  if (container) {
    // Remove loading indicator if still present (fetch failed before it was cleared).
    container.querySelector('.timeline-loading')?.remove();
    const msg = document.createElement('p');
    msg.className = 'timeline-error';
    msg.textContent = 'Failed to load timeline data. Please refresh the page.';
    container.appendChild(msg);
  }
});
