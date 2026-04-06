/**
 * cards.js — Detail card renderer registry.
 *
 * Selects the appropriate card template based on event properties:
 *   type === 'aggregate'         → aggregate card (list of source events)
 *   family_id === 'spine'        → milestone card
 *   external_url is set          → trip card
 *   photos.length > 0            → gallery card
 *   family_id === 'books'        → book card
 *   family_id === 'film_tv'       → show card
 *   default                      → standard card
 *
 * Cards are HTML <div> overlays shown on station click. On desktop they float
 * beside the station; on mobile they slide up as a bottom sheet.
 *
 * Public API:
 *   buildCardContent(event) → HTMLElement
 *     Returns a div ready to be appended into #card-content.
 *     The card type class (e.g. card--trip) is set on the returned element.
 */

/**
 * Build the content element for the given event.
 *
 * @param {object} event - Normalized event from api.js (or aggregate from zoom.js).
 * @returns {HTMLElement}
 */
export function buildCardContent(event) {
  if (event.type === 'aggregate')      return aggregateCard(event);
  if (event.family_id === 'spine')     return milestoneCard(event);
  if (event.external_url)              return tripCard(event);
  if (event.photos?.length > 0)        return galleryCard(event);
  if (event.family_id === 'books')     return bookCard(event);
  if (event.family_id === 'film_tv')   return showCard(event);
  return standardCard(event);
}

/**
 * Build a week summary card showing all events that overlap the given ISO week,
 * grouped by family. Each event item carries a data-id attribute so the
 * delegated click handler in main.js can open the individual event card.
 *
 * @param {string}   weekKey - ISO week key, e.g. "2023-W11".
 * @param {object[]} events  - Events overlapping this week (from grid.eventsForWeek).
 * @returns {HTMLElement}
 */
export function buildWeekCardContent(weekKey, events, residenceLabel = null) {
  const wrap = el('div', 'card--week');

  wrap.appendChild(el('p', 'card-title', formatWeekKey(weekKey)));

  if (events.length === 0) {
    const msg = residenceLabel
      ? `Living in ${residenceLabel}.`
      : 'No events this week.';
    wrap.appendChild(el('p', 'card-description', msg));
    return wrap;
  }

  // Group events by family label.
  const groups = new Map(); // familyLabel → event[]
  for (const evt of events) {
    const label = FAMILY_LABELS[evt.family_id] ?? titleCase(evt.family_id);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(evt);
  }

  for (const [groupLabel, groupEvents] of groups) {
    const section = document.createElement('section');
    section.className = 'card-week-section';

    const heading = el('p', 'card-week-group-label', groupLabel);
    section.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'card-week-event-list';

    for (const evt of groupEvents) {
      const item = document.createElement('li');

      const btn = document.createElement('button');
      btn.className = 'week-event-item';
      btn.dataset.id = evt.id;
      btn.type = 'button';

      const titleSpan = el('span', 'week-event-title', evt.title);
      const dateSpan  = el('span', 'week-event-date', weekEventDate(evt));
      btn.appendChild(titleSpan);
      btn.appendChild(dateSpan);
      item.appendChild(btn);
      list.appendChild(item);
    }

    section.appendChild(list);
    wrap.appendChild(section);
  }

  return wrap;
}

// ── Card builders ─────────────────────────────────────────────────────────────

function milestoneCard(event) {
  const wrap = el('div', 'card--milestone');

  const icon = MILESTONE_ICONS[event.metadata?.milestone_type] ?? '⭐';
  wrap.appendChild(el('div', 'card-icon', icon));
  wrap.appendChild(el('p', 'card-title', event.title));

  const age = event.metadata?.age;
  if (typeof age === 'number') {
    wrap.appendChild(el('p', 'card-dates', `Age ${age} · ${formatDate(event.date)}`));
  } else {
    wrap.appendChild(el('p', 'card-dates', formatDate(event.date)));
  }

  appendShared(wrap, event, { skipTitle: true, skipDates: true });
  return wrap;
}

function tripCard(event) {
  const wrap = el('div', 'card--trip');

  if (event.hero_image_url) {
    const img = document.createElement('img');
    img.className = 'card-hero';
    img.src = event.hero_image_url;
    img.alt = event.title;
    img.loading = 'lazy';
    wrap.appendChild(img);
  }

  appendShared(wrap, event);

  const link = document.createElement('a');
  link.className = 'card-read-more';
  link.href = event.external_url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Read post →';
  wrap.appendChild(link);

  return wrap;
}

function galleryCard(event) {
  const wrap = el('div', 'card--gallery');

  appendShared(wrap, event);

  const grid = el('div', 'card-gallery');
  for (const url of event.photos) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    grid.appendChild(img);
  }
  wrap.appendChild(grid);

  return wrap;
}

function bookCard(event) {
  const wrap = el('div', 'card--book');

  appendShared(wrap, event);

  const { title, author, rating, review } = event.metadata ?? {};
  if (title) wrap.appendChild(el('p', 'card-book-title', title));
  if (author) wrap.appendChild(el('p', 'card-author', author));
  if (typeof rating === 'number') {
    wrap.appendChild(el('p', 'card-rating', starsFor(rating)));
  }
  if (review) wrap.appendChild(el('p', 'card-review', review));

  return wrap;
}

function showCard(event) {
  const wrap = el('div', 'card--tv');

  appendShared(wrap, event);

  const { network, seasons_watched, rating } = event.metadata ?? {};
  if (network) wrap.appendChild(el('p', 'card-network', network));
  if (typeof seasons_watched === 'number') {
    wrap.appendChild(el('p', 'card-seasons',
      `${seasons_watched} season${seasons_watched !== 1 ? 's' : ''}`));
  }
  if (typeof rating === 'number') {
    wrap.appendChild(el('p', 'card-rating', starsFor(rating)));
  }

  return wrap;
}

function standardCard(event) {
  const wrap = el('div', 'card--standard');
  appendShared(wrap, event);
  return wrap;
}

function aggregateCard(event) {
  const wrap = el('div', 'card--aggregate');

  wrap.appendChild(el('p', 'card-title', event.title));
  wrap.appendChild(el('p', 'card-dates', formatYearMonth(event.year_month)));

  const list = document.createElement('ul');
  list.className = 'card-aggregate-list';
  for (const src of event.events ?? []) {
    const item = document.createElement('li');
    item.textContent = src.title;
    list.appendChild(item);
  }
  wrap.appendChild(list);

  return wrap;
}

// ── Shared elements ───────────────────────────────────────────────────────────

/**
 * Append the elements common to all card types (title, dates, description, location).
 *
 * @param {HTMLElement} parent
 * @param {object}      event
 * @param {object}      [opts]
 * @param {boolean}     [opts.skipTitle=false]
 * @param {boolean}     [opts.skipDates=false]
 */
function appendShared(parent, event, { skipTitle = false, skipDates = false } = {}) {
  if (!skipTitle) parent.appendChild(el('p', 'card-title', event.title));
  if (!skipDates) {
    const dateStr = event.start_date
      ? `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`
      : formatDate(event.date);
    parent.appendChild(el('p', 'card-dates', dateStr));
  }
  if (event.description) {
    parent.appendChild(el('p', 'card-description', event.description));
  }
  if (event.location?.label) {
    parent.appendChild(el('p', 'card-location', event.location.label));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MILESTONE_ICONS = {
  birthday:    '🎂',
  marriage:    '💍',
  relocation:  '🏠',
  bereavement: '🕊',
  other:       '⭐',
};

/**
 * Create an element with a CSS class and optional text content.
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Convert a numeric rating (1–5) to a string of filled/empty star characters.
 * @param {number} rating
 * @returns {string}
 */
function starsFor(rating) {
  const filled = Math.round(Math.max(0, Math.min(5, rating)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/**
 * Format an ISO date string as a human-readable date ("12 Apr 2023").
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Format a "YYYY-MM" string as "Month YYYY" ("April 2023").
 * @param {string} yearMonth
 * @returns {string}
 */
function formatYearMonth(yearMonth) {
  if (!yearMonth) return '';
  const [yr, mo] = yearMonth.split('-');
  return new Date(Number(yr), Number(mo) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * Format an ISO week key ("2023-W11") as a human-readable header ("Week 11 · 2023").
 * @param {string} weekKey
 * @returns {string}
 */
function formatWeekKey(weekKey) {
  if (!weekKey) return '';
  const [yr, wPart] = weekKey.split('-W');
  return `Week ${Number(wPart)} · ${yr}`;
}

/**
 * Format a short date string for a week card event item.
 * Spans show start date only; point events show their date.
 * @param {object} evt
 * @returns {string}
 */
function weekEventDate(evt) {
  if (evt.start_date) return formatDate(evt.start_date);
  return formatDate(evt.date);
}

/** Convert a snake_case or kebab-case id to Title Case. */
function titleCase(str) {
  return str.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const FAMILY_LABELS = {
  spine:      'Milestones',
  travel:     'Travel',
  employment: 'Employment',
  education:  'Education',
  books:      'Books',
  fitness:    'Fitness & Health',
  film_tv:    'Film & TV',
  hobbies:    'Hobbies',
  flights:    'Flights',
};
