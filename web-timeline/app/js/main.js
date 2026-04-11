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
 *   e.g. window.__timeline_setZoom(0.55)  // ZOOM_WEEK
 */

import { fetchTimeline } from './api.js';
import { buildCardContent, buildClusterCardContent } from './cards.js';
import { clusterPointEvents } from './clusters.js';
import { preloadIcons } from './icons.js';
import { CURVE_HEIGHT, timeToY } from './lines.js';
import { assignLanes } from './lanes.js';
import { initTimeline } from './timeline.js';
import {
  ZOOM_DAY, ZOOM_WEEK, ZOOM_MONTH,
  aggregateByMonth,
} from './zoom.js';
import { buildWeekMap, renderGrid, eventsForWeek } from './grid.js';

const MS_PER_DAY = 86_400_000;

/** Cached API response — populated once, reused on zoom changes. */
let _data       = null;

/** Controller returned by initTimeline — exposes setRenderObjects. */
let _controller = null;

/** Active zoom level — tracked so theme changes can re-render at the same scale. */
let _pxPerDay   = ZOOM_DAY;

/** WeekMap built once after fetch; rebuilt on theme change (colors are baked in). */
let _weekMap    = null;

/** Reference to #week-grid-container element. */
let _gridContainer = null;

/**
 * Lookup maps built once from _data after fetch. Used by the click handler to
 * resolve a station's dataset.id back to its event object.
 * _eventById covers all original + birthday events.
 * _aggregateById is rebuilt on every ZOOM_MONTH render (aggregates are
 * zoom-level-specific synthetic objects).
 * _clusterById is rebuilt on every ZOOM_DAY render (clusters are zoom-level-specific).
 */
let _eventById     = new Map();
let _aggregateById = new Map();
let _clusterById   = new Map();

/** Card navigation stack — history of opened cards for back-navigation. */
let _cardStack = [];

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
  _gridContainer        = document.getElementById('week-grid-container');

  const { layout, renderObjects } = buildRenderObjects(_data, ZOOM_DAY);
  setBodyZoom(ZOOM_DAY);
  _controller = initTimeline({ svg, scrollContainer, layout, renderObjects });

  // Build the WeekMap once — reused every time Year zoom is activated.
  _weekMap = buildWeekMap(_data, hslColor);

  setupZoomButtons();
  setupViewButtons();
  setupThemeToggle();
  setupCardInteraction(svg);
  setupGridCardInteraction();
  setupSpanHoverSync(svg);
  setupGridResizeHandler();
}

/**
 * Build the full render-object array for a given zoom level.
 *
 * Pure function of (data, pxPerDay) — safe to call multiple times.
 *
 * @param {object} data      - Normalized API response from fetchTimeline().
 * @param {number} pxPerDay  - One of ZOOM_DAY, ZOOM_WEEK, or ZOOM_MONTH.
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
  // ZOOM_DAY: all events as-is, then cluster nearby point events.
  // ZOOM_WEEK: all events as-is, then cluster nearby point events (same as day).
  // ZOOM_MONTH: point events aggregated per (family_id, year-month).

  let events = data.events;
  if (pxPerDay === ZOOM_MONTH) {
    events = aggregateByMonth(events, data.line_families);
    // Rebuild the aggregate lookup so click handlers can resolve agg-* IDs.
    _aggregateById = new Map(
      events.filter((e) => e.type === 'aggregate').map((e) => [e.id, e]),
    );
  } else {
    _aggregateById = new Map();
  }

  // ── Lane assignment ────────────────────────────────────────────────────────

  const laneMap = assignLanes(events, data.line_families);

  let renderObjects = [];

  // ── Secondary spine lines ─────────────────────────────────────────────────
  //
  // Families with spawn_behavior === 'secondary_spine' render as a persistent
  // vertical line (like the main spine) at their reserved lane offset.

  for (const family of data.line_families) {
    if (family.spawn_behavior !== 'secondary_spine') continue;
    const info = laneMap.get(family.id);
    if (!info) continue;
    renderObjects.push({
      type:       'secondary-spine-line',
      id:         `secondary-spine-${family.id}`,
      familyId:   family.id,
      laneOffset: info.laneOffset,
      color:      hslColor(family.base_color_hsl),
    });
  }

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
    const yEnd   = evt.end_date ? yFor(evt.end_date) : 0;

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
        y: startStationY, laneOffset: parentOffset, parentOffset, color, event: evt, isMajor: false,
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
          y: endY, laneOffset: parentOffset, parentOffset, color, event: evt, isMajor: false,
          label:   null,
          icon:    evt.end_icon ?? null,
          arrival: true,  // CSS hides icon at compressed zooms
          terminal: true,
        };
        renderObjects.push(endStation);
        endStationById.set(evt.id, endStation);
      }
    } else {
      if (clampedYEnd >= 0 && clampedYEnd <= totalHeight) {
        const endStation = {
          type: 'station', id: `${evt.id}-end`,
          y: clampedYEnd, laneOffset, parentOffset, color, event: evt, isMajor: false,
          label: null,
          icon:  null,
          terminal: true,
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

    renderObjects.push({
      type: 'station', id: evt.id,
      y, laneOffset, color, event: evt,
      label: evt.label ?? truncate(evt.title),
      icon:  evt.icon ?? null,
      icon_png_url: evt.icon_png_url ?? null,
    });
  }

  // ── Pass 3 — Clustering pass (day zoom only) ──────────────────────────────
  //
  // At day and week zoom, group nearby point events on the same line into clusters to
  // prevent overlapping dots and labels. Clusters are rendered with a count pill.
  // At month zoom, aggregates handle grouping instead. No clustering applies.

  if (pxPerDay === ZOOM_DAY || pxPerDay === ZOOM_WEEK) {
    // Extract only point-event stations (not aggregates, not span start/end stations).
    const pointStations = renderObjects.filter(
      (o) => o.type === 'station' && o.event?.type === 'point',
    );
    // Run clustering and splice results back into renderObjects.
    const clustered = clusterPointEvents(pointStations, pxPerDay);
    // Replace point stations with cluster results (single runs pass through unchanged).
    const pointStationIds = new Set(pointStations.map((o) => o.id));
    const nonPointObjects = renderObjects.filter((o) => !pointStationIds.has(o.id));
    renderObjects = [...nonPointObjects, ...clustered];
    // Build cluster lookup for click handlers.
    for (const obj of clustered) {
      if (obj.type === 'cluster') {
        _clusterById.set(obj.id, obj);
      }
    }
  } else {
    // Month zoom and beyond: no clustering (aggregates used instead).
    _clusterById = new Map();
  }

  return { layout, renderObjects };
}

// ── Zoom button wiring ────────────────────────────────────────────────────────

/**
 * Attach click listeners to the Day / Week / Month buttons in the zoom bar.
 * Toggles `zoom-btn--active` class and `aria-pressed` attribute on each press.
 *
 * Called once after first render so _data and _controller are guaranteed set.
 */
function setupZoomButtons() {
  const ZOOM_BY_NAME = { day: ZOOM_DAY, week: ZOOM_WEEK, month: ZOOM_MONTH };
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
      setBodyZoom(pxPerDay);
      // Grid view is now controlled by the view switcher, not zoom buttons.
      // Always rebuild subway map render objects.
      const { layout, renderObjects } = buildRenderObjects(_data, pxPerDay);
      _controller.setRenderObjects(layout, renderObjects);
    });
  });
}

/**
 * Attach click listeners to the Subway / Grid view buttons in the view switcher.
 * Toggles `view-btn--active` class to switch between subway map and week grid views.
 * Also toggles visibility of the zoom controls row (hidden in grid view) and adjusts
 * the zoom-bar height and timeline-container top position accordingly.
 *
 * Called once after first render so _data, _controller, and _weekMap are guaranteed set.
 */
function setupViewButtons() {
  const buttons = Array.from(document.querySelectorAll('.view-btn'));
  const zoomBar = document.querySelector('.zoom-bar');
  const zoomControlsRow = document.getElementById('zoom-controls-row');
  const svg = document.getElementById('timeline-svg');
  const timelineContainer = document.getElementById('timeline-container');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (!view) return;

      // Update active button state
      buttons.forEach((b) => {
        b.classList.remove('view-btn--active');
      });
      btn.classList.add('view-btn--active');

      if (view === 'grid') {
        // Show grid, hide subway map and zoom controls
        _gridContainer.removeAttribute('hidden');
        svg.toggleAttribute('hidden', true);
        zoomControlsRow.toggleAttribute('hidden', true);
        // Adjust zoom-bar height and timeline-container position for single-row header
        zoomBar.style.height = '48px';
        timelineContainer.style.top = '48px';
        // Render the grid with the current WeekMap
        renderGrid(_weekMap, _data, _gridContainer);
      } else if (view === 'subway') {
        // Show subway map and zoom controls, hide grid
        svg.toggleAttribute('hidden', false);
        zoomControlsRow.toggleAttribute('hidden', false);
        _gridContainer.toggleAttribute('hidden', true);
        // Restore zoom-bar height and timeline-container position for two-row header
        zoomBar.style.height = '';
        timelineContainer.style.top = '';
      }
    });
  });
}

// ── Card interaction ──────────────────────────────────────────────────────────

/**
 * Wire delegated click on the SVG → open card, close button, backdrop, Escape.
 * Also wire cluster member row clicks for drill-down navigation.
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

  // Cluster member row clicks — drill into event detail card.
  // Delegates on the content div since member rows are rendered inside it.
  content.addEventListener('click', (e) => {
    const btn = e.target.closest('.cluster-member-item');
    if (!btn) return;
    const event = _eventById.get(btn.dataset.id);
    if (!event) return;
    pushCard(event, null, null, overlay, sheet, content);
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

/**
 * Wire click interaction for the week grid view.
 *
 * Two levels of delegation on #week-grid-container:
 *   .week-cell[data-week]  → open a week summary card (as a cluster card with drill-down).
 *   .cluster-member-item   → open the individual event detail card (navigation stack).
 *
 * Both use the same #card-overlay / #card-sheet / #card-content elements as the
 * subway map, so close / Escape / backdrop dismiss work without extra wiring.
 * Cluster member rows and back-navigation are wired in setupCardInteraction.
 */
function setupGridCardInteraction() {
  const overlay = document.getElementById('card-overlay');
  const sheet   = document.getElementById('card-sheet');
  const content = document.getElementById('card-content');

  // Week cell clicks — delegated on the grid container.
  _gridContainer.addEventListener('click', (e) => {
    const cell = e.target.closest('.week-cell[data-week]');
    if (!cell) return;

    const weekKey = cell.dataset.week;
    const events  = eventsForWeek(weekKey, _data);

    // Extract start and end dates from the week key.
    // Week key format: "YYYY-Www" (ISO 8601 week date)
    // We'll compute the Monday of that week as startDate, Sunday as endDate.
    const [yearStr, weekStr] = weekKey.split('-W');
    const year = Number(yearStr);
    const week = Number(weekStr);

    // ISO week 1 is the week with January 4th.
    // Find the Monday of week 1 (always in the previous year).
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const weekStart = new Date(jan4);
    weekStart.setUTCDate(jan4.getUTCDate() - jan4.getUTCDay());
    const monday = new Date(weekStart);
    monday.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    // Create a synthetic week-cluster object to render via the cluster card.
    const weekCluster = {
      type: 'week-cluster',
      id: `week-${weekKey}`,
      members: events,
      count: events.length,
      startDate: monday.toISOString().split('T')[0],
      endDate: sunday.toISOString().split('T')[0],
    };

    // Reset stack and push the week cluster.
    _cardStack = [weekCluster];
    renderCardStack(cell, e, overlay, sheet, content);
  });

  // Keyboard activation on week cells.
  _gridContainer.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cell = e.target.closest('.week-cell[data-week]');
    if (!cell) return;
    e.preventDefault();

    const weekKey = cell.dataset.week;
    const events  = eventsForWeek(weekKey, _data);

    const [yearStr, weekStr] = weekKey.split('-W');
    const year = Number(yearStr);
    const week = Number(weekStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const weekStart = new Date(jan4);
    weekStart.setUTCDate(jan4.getUTCDate() - jan4.getUTCDay());
    const monday = new Date(weekStart);
    monday.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const weekCluster = {
      type: 'week-cluster',
      id: `week-${weekKey}`,
      members: events,
      count: events.length,
      startDate: monday.toISOString().split('T')[0],
      endDate: sunday.toISOString().split('T')[0],
    };

    _cardStack = [weekCluster];
    renderCardStack(null, null, overlay, sheet, content);
  });
  // Note: cluster member row clicks are already delegated in setupCardInteraction(),
  // so no additional wiring needed here.
}

function handleActivate(el, mouseEvent, overlay, sheet, content) {
  const eventId = el.dataset.id;
  // Resolve cluster, aggregate, or event (try in order of likelihood).
  const event = _clusterById.get(eventId)
    ?? _aggregateById.get(eventId)
    ?? _eventById.get(eventId);
  if (!event) return;
  // Reset stack and push the new event (clicking from timeline starts a fresh stack).
  _cardStack = [event];
  renderCardStack(el, mouseEvent, overlay, sheet, content);
}

/**
 * Push a new event onto the navigation stack and render it.
 * Used when drilling into a member event from within a cluster/aggregate card.
 */
function pushCard(event, anchorEl, mouseEvent, overlay, sheet, content) {
  _cardStack.push(event);
  renderCardStack(anchorEl, mouseEvent, overlay, sheet, content);
}

/**
 * Render the top event from the navigation stack.
 * Injects a back button if stack depth > 1.
 */
function renderCardStack(anchorEl, mouseEvent, overlay, sheet, content) {
  if (_cardStack.length === 0) {
    closeCard(overlay);
    return;
  }

  const event = _cardStack[_cardStack.length - 1];

  // Populate content with the appropriate card type.
  content.innerHTML = '';
  content.appendChild(buildCardContent(event));

  // Inject back button in the card header if this is not the first card in the stack.
  if (_cardStack.length > 1) {
    const cardTitle = content.querySelector('.card-title');
    if (cardTitle) {
      const backBtn = document.createElement('button');
      backBtn.className = 'card-back-btn';
      backBtn.setAttribute('aria-label', 'Back');
      backBtn.textContent = '←';
      backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        goBack(overlay, sheet, content);
      });
      cardTitle.parentElement.insertBefore(backBtn, cardTitle);
    }
  }

  // Position (desktop only — mobile is handled entirely by CSS bottom-sheet).
  if (window.innerWidth >= 480) {
    positionCard(anchorEl, mouseEvent, sheet);
  } else {
    // Remove any inline positioning set by a prior open.
    sheet.style.top  = '';
    sheet.style.left = '';
  }

  overlay.removeAttribute('hidden');
}

/**
 * Pop the top card from the stack and re-render.
 * If stack becomes empty, close the card entirely.
 */
function goBack(overlay, sheet, content) {
  _cardStack.pop();
  if (_cardStack.length === 0) {
    closeCard(overlay);
  } else {
    renderCardStack(null, null, overlay, sheet, content);
  }
}

function closeCard(overlay) {
  _cardStack = [];
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
export function isLightMode() {
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

export function hslColor([h, s, l]) {
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
  document.body.classList.remove('zoom-day', 'zoom-week', 'zoom-month');
  if (pxPerDay === ZOOM_MONTH)     document.body.classList.add('zoom-month');
  else if (pxPerDay === ZOOM_WEEK) document.body.classList.add('zoom-week');
  else                             document.body.classList.add('zoom-day');
}

// ── Grid resize handler ───────────────────────────────────────────────────────

/**
 * Re-render the grid on window resize so the single-row ↔ half-row split
 * stays in sync with the 480px CSS breakpoint.
 * Only re-renders when the grid is the active view (Year zoom).
 *
 * The grid DOM is small (~35 years × ≤53 cells) so a full re-render on
 * resize is inexpensive. A 100ms debounce prevents thrashing during drag.
 */
function setupGridResizeHandler() {
  let debounceTimer = null;
  window.addEventListener('resize', () => {
    // Only re-render grid if it's currently visible
    if (!_gridContainer || _gridContainer.hasAttribute('hidden')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderGrid(_weekMap, _data, _gridContainer);
    }, 100);
  });
}

// ── Devtools hook ─────────────────────────────────────────────────────────────
//
// Flip zoom level manually from the browser console:
//   window.__timeline_setZoom(0.25)  // ZOOM_MONTH
//   window.__timeline_setZoom(0.55)  // ZOOM_WEEK
//   window.__timeline_setZoom(2)     // ZOOM_DAY (default)

window.__timeline_setZoom = function (pxPerDay) {
  if (!_data) {
    console.warn('__timeline_setZoom: timeline not yet initialized');
    return;
  }
  _pxPerDay = pxPerDay;
  setBodyZoom(pxPerDay);
  // Grid view is controlled by the view switcher, not zoom level.
  // Always rebuild subway render objects.
  const { layout, renderObjects } = buildRenderObjects(_data, pxPerDay);
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
  if (!_data) return;
  // If grid view is visible, rebuild the WeekMap (colors are baked in) then re-render.
  if (_gridContainer && !_gridContainer.hasAttribute('hidden')) {
    _weekMap = buildWeekMap(_data, hslColor);
    renderGrid(_weekMap, _data, _gridContainer);
  }
  // Always rebuild subway render objects (even if grid is visible, in case user switches back).
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
