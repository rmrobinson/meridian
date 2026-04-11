/**
 * cards.js — Detail card renderer registry.
 *
 * Selects the appropriate card template based on event.metadata_type:
 *   type === 'aggregate'      → aggregate card (list of source events)
 *   metadata_type === 'life'       → milestone card
 *   metadata_type === 'employment' → employment card
 *   metadata_type === 'education'  → education card
 *   metadata_type === 'travel'     → travel card (hero image, countries/cities, gallery, read-more link)
 *   metadata_type === 'flight'     → flight card
 *   metadata_type === 'book'       → book card
 *   metadata_type === 'film_tv'    → film/tv card
 *   metadata_type === 'fitness'    → fitness card (with activity sub-sections)
 *   metadata_type === 'concert'    → concert card
 *   default                        → standard card
 *
 * Card layout is driven by metadata type, not by the line family the event is
 * placed on. A flight event reassigned to a travel lane still renders a flight
 * card because metadata_type is set at write time and is stable.
 *
 * Cards are HTML <div> overlays shown on station click. On desktop they float
 * beside the station; on mobile they slide up as a bottom sheet.
 *
 * Public API:
 *   buildCardContent(event) → HTMLElement
 *     Returns a div ready to be appended into #card-content.
 *     The card type class (e.g. card--travel) is set on the returned element.
 */

/**
 * Build the content element for the given event.
 *
 * @param {object} event - Normalized event from api.js (or aggregate from zoom.js).
 * @returns {HTMLElement}
 */
export function buildCardContent(event) {
  // Cluster and aggregate cards use the same rendering (list of tappable members).
  if (event.type === 'cluster' || event.type === 'aggregate' || event.type === 'week-cluster') {
    return buildClusterCardContent(event);
  }
  switch (event.metadata_type) {
    case 'life':       return milestoneCard(event);
    case 'employment': return employmentCard(event);
    case 'education':  return educationCard(event);
    case 'travel':     return travelCard(event);
    case 'flight':     return flightCard(event);
    case 'book':       return bookCard(event);
    case 'film_tv':    return filmTvCard(event);
    case 'fitness':    return fitnessCard(event);
    case 'concert':    return concertCard(event);
    default:           return standardCard(event);
  }
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

function employmentCard(event) {
  const wrap = el('div', 'card--employment');
  appendShared(wrap, event);

  const { role, company_name, company_url } = event.metadata ?? {};
  if (role) wrap.appendChild(el('p', 'card-role', role));
  if (company_name) {
    if (company_url) {
      const link = document.createElement('a');
      link.className = 'card-company';
      link.href = company_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = company_name;
      wrap.appendChild(link);
    } else {
      wrap.appendChild(el('p', 'card-company', company_name));
    }
  }
  return wrap;
}

function educationCard(event) {
  const wrap = el('div', 'card--education');
  appendShared(wrap, event);

  const { institution, degree } = event.metadata ?? {};
  if (institution) wrap.appendChild(el('p', 'card-institution', institution));
  if (degree) wrap.appendChild(el('p', 'card-degree', degree));
  return wrap;
}

function travelCard(event) {
  const wrap = el('div', 'card--travel');

  if (event.hero_image_url) {
    const img = document.createElement('img');
    img.className = 'card-hero';
    img.src = event.hero_image_url;
    img.alt = event.title;
    img.loading = 'lazy';
    wrap.appendChild(img);
  }

  appendShared(wrap, event);

  const { countries, cities } = event.metadata ?? {};
  if (countries?.length > 0) {
    wrap.appendChild(el('p', 'card-countries', countries.join(' · ')));
  }
  if (cities?.length > 0) {
    wrap.appendChild(el('p', 'card-cities', cities.join(' · ')));
  }

  appendGallery(wrap, event.photos);

  if (event.external_url) {
    const link = document.createElement('a');
    link.className = 'card-read-more';
    link.href = event.external_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Read post →';
    wrap.appendChild(link);
  }

  return wrap;
}

function flightCard(event) {
  const wrap = el('div', 'card--flight');
  appendShared(wrap, event);

  const {
    origin_iata, destination_iata,
    airline, flight_number, aircraft_type,
    scheduled_departure, actual_departure,
    scheduled_arrival, actual_arrival,
  } = event.metadata ?? {};

  // Route + flight number header
  const header = document.createElement('div');
  header.className = 'card-flight-header';

  if (origin_iata && destination_iata) {
    header.appendChild(el('p', 'card-route', `${origin_iata} → ${destination_iata}`));
  }
  if (flight_number) {
    header.appendChild(el('p', 'card-flight-number', flight_number));
  }

  if (header.children.length > 0) {
    wrap.appendChild(header);
  }

  if (airline) wrap.appendChild(el('p', 'card-airline', airline));
  if (aircraft_type) wrap.appendChild(el('p', 'card-aircraft', aircraft_type));

  // Times section
  const times = document.createElement('div');
  times.className = 'card-flight-times';

  if (scheduled_departure || actual_departure) {
    const dep = scheduled_departure ? formatTime(scheduled_departure) : '';
    const depActual = actual_departure && actual_departure !== scheduled_departure
      ? ` (${formatTime(actual_departure)})` : '';
    times.appendChild(el('p', 'card-departure', `${dep}${depActual}`));
  }
  if (scheduled_arrival || actual_arrival) {
    const arr = scheduled_arrival ? formatTime(scheduled_arrival) : '';
    const arrActual = actual_arrival && actual_arrival !== scheduled_arrival
      ? ` (${formatTime(actual_arrival)})` : '';
    times.appendChild(el('p', 'card-arrival', `${arr}${arrActual}`));
  }

  if (times.children.length > 0) {
    wrap.appendChild(times);
  }

  return wrap;
}

function bookCard(event) {
  const wrap = el('div', 'card--book');

  const { cover_image_url } = event.metadata ?? {};
  if (cover_image_url) {
    const img = document.createElement('img');
    img.className = 'card-book-cover';
    img.src = cover_image_url;
    img.alt = '';
    img.loading = 'lazy';
    wrap.appendChild(img);
  }

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

function filmTvCard(event) {
  const wrap = el('div', 'card--tv');

  const { poster_url } = event.metadata ?? {};
  if (poster_url) {
    const img = document.createElement('img');
    img.className = 'card-poster';
    img.src = poster_url;
    img.alt = '';
    img.loading = 'lazy';
    wrap.appendChild(img);
  }

  appendShared(wrap, event);

  const { type, director, year, network, seasons_watched, rating } = event.metadata ?? {};

  if (type === 'movie') {
    if (director) wrap.appendChild(el('p', 'card-director', director));
    if (year) wrap.appendChild(el('p', 'card-year', String(year)));
  } else {
    // tv or unspecified
    if (network) wrap.appendChild(el('p', 'card-network', network));
    if (typeof seasons_watched === 'number') {
      wrap.appendChild(el('p', 'card-seasons',
        `${seasons_watched} season${seasons_watched !== 1 ? 's' : ''}`));
    }
  }

  if (typeof rating === 'number') {
    wrap.appendChild(el('p', 'card-rating', starsFor(rating)));
  }

  return wrap;
}

function fitnessCard(event) {
  const wrap = el('div', 'card--fitness');
  appendShared(wrap, event);

  const {
    activity, duration, distance_km, elevation_gain_m, avg_heart_rate,
    garmin_activity_url,
    // running
    avg_pace_min_km,
    // cycling
    bike, avg_speed_kmh,
    // hiking
    trail_name, alltrails_url,
    // skiing
    resort, vertical_drop_m, runs,
    // scuba
    dive_site, max_depth_m,
    // climbing
    climbing_type, grade, route_name, problem_name,
    // golf
    course_name, holes, score,
    // squash
    opponent, result,
  } = event.metadata ?? {};

  // Common stats
  if (duration) wrap.appendChild(el('p', 'card-duration', duration));
  if (distance_km != null) wrap.appendChild(el('p', 'card-distance', `${distance_km} km`));
  if (elevation_gain_m != null) wrap.appendChild(el('p', 'card-elevation', `+${elevation_gain_m} m`));
  if (avg_heart_rate != null) wrap.appendChild(el('p', 'card-heart-rate', `${avg_heart_rate} bpm`));

  // Activity sub-section
  switch (activity) {
    case 'run':
      if (avg_pace_min_km != null) wrap.appendChild(el('p', 'card-pace', formatPace(avg_pace_min_km)));
      break;
    case 'cycle':
      if (bike) wrap.appendChild(el('p', 'card-bike', bike));
      if (avg_speed_kmh != null) wrap.appendChild(el('p', 'card-speed', `${avg_speed_kmh} km/h`));
      break;
    case 'hike':
      if (trail_name) {
        if (alltrails_url) {
          const link = document.createElement('a');
          link.className = 'card-alltrails';
          link.href = alltrails_url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = trail_name;
          wrap.appendChild(link);
        } else {
          wrap.appendChild(el('p', 'card-trail', trail_name));
        }
      }
      break;
    case 'ski':
      if (resort) wrap.appendChild(el('p', 'card-resort', resort));
      if (vertical_drop_m != null) wrap.appendChild(el('p', 'card-vertical', `${vertical_drop_m} m vertical`));
      if (runs != null) wrap.appendChild(el('p', 'card-runs', `${runs} run${runs !== 1 ? 's' : ''}`));
      break;
    case 'scuba':
      if (dive_site) wrap.appendChild(el('p', 'card-dive-site', dive_site));
      if (max_depth_m != null) wrap.appendChild(el('p', 'card-depth', `${max_depth_m} m depth`));
      break;
    case 'climb':
      if (climbing_type) wrap.appendChild(el('p', 'card-climbing-type', climbing_type));
      if (grade) wrap.appendChild(el('p', 'card-grade', grade));
      if (route_name) wrap.appendChild(el('p', 'card-route-name', route_name));
      else if (problem_name) wrap.appendChild(el('p', 'card-route-name', problem_name));
      break;
    case 'golf':
      if (course_name) wrap.appendChild(el('p', 'card-course', course_name));
      if (holes != null) wrap.appendChild(el('p', 'card-holes', `${holes} holes`));
      if (score != null) wrap.appendChild(el('p', 'card-score', String(score)));
      break;
    case 'squash':
      if (opponent) wrap.appendChild(el('p', 'card-opponent', `vs ${opponent}`));
      if (result) wrap.appendChild(el('p', 'card-result', result));
      break;
  }

  if (garmin_activity_url) {
    const link = document.createElement('a');
    link.className = 'card-garmin';
    link.href = garmin_activity_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on Garmin →';
    wrap.appendChild(link);
  }

  return wrap;
}

function concertCard(event) {
  const wrap = el('div', 'card--concert');
  appendShared(wrap, event);

  const { main_act, opening_acts, venue, playlist_url } = event.metadata ?? {};
  if (main_act) wrap.appendChild(el('p', 'card-main-act', main_act));
  if (opening_acts?.length > 0) {
    wrap.appendChild(el('p', 'card-opening-acts', opening_acts.join(' · ')));
  }
  if (venue?.label) wrap.appendChild(el('p', 'card-venue', venue.label));

  appendGallery(wrap, event.photos);

  if (playlist_url) {
    const link = document.createElement('a');
    link.className = 'card-playlist';
    link.href = playlist_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View playlist →';
    wrap.appendChild(link);
  }

  return wrap;
}

function standardCard(event) {
  const wrap = el('div', 'card--standard');
  appendShared(wrap, event);
  return wrap;
}

/**
 * Build a cluster card — a list of member events with drill-down capability.
 *
 * Used for three contexts:
 *   - Day zoom proximity clusters (type === 'cluster')
 *   - Month zoom aggregates (type === 'aggregate')
 *   - Week grid cells (type === 'week-cluster')
 *
 * All three have a list of member events that can be tapped to open the
 * individual event detail card.
 *
 * @param {object} clusterOrAggregate - Cluster, aggregate, or week cluster object
 * @returns {HTMLElement}
 */
export function buildClusterCardContent(clusterOrAggregate) {
  const obj = clusterOrAggregate;
  const wrap = el('div', `card--${obj.type}`);

  // Header with family label (if present) and date range.
  let headerText = '';
  if (obj.type === 'week-cluster') {
    headerText = `Week of ${formatDate(obj.startDate)}`;
  } else if (obj.type === 'aggregate') {
    const familyLabel = FAMILY_LABELS[obj.family_id] ?? titleCase(obj.family_id);
    headerText = `${familyLabel} · ${formatYearMonth(obj.year_month)}`;
  } else {
    // cluster
    const familyLabel = FAMILY_LABELS[obj.familyId] ?? titleCase(obj.familyId);
    const dateRange = `${formatDate(obj.endDate)} – ${formatDate(obj.startDate)}`;
    headerText = `${familyLabel} · ${dateRange}`;
  }
  wrap.appendChild(el('p', 'card-title', headerText));

  // Member events list.
  const members = obj.members ?? obj.events ?? [];

  if (obj.type === 'week-cluster') {
    // Week cluster: group members by family.
    const groups = new Map();
    for (const evt of members) {
      const label = FAMILY_LABELS[evt.family_id] ?? titleCase(evt.family_id);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(evt);
    }

    for (const [groupLabel, groupEvents] of groups) {
      const section = document.createElement('section');
      section.className = 'cluster-section';

      const heading = el('p', 'cluster-group-label', groupLabel);
      section.appendChild(heading);

      const list = document.createElement('ul');
      list.className = 'cluster-member-list';

      for (const evt of groupEvents) {
        const item = document.createElement('li');

        const btn = document.createElement('button');
        btn.className = 'cluster-member-item';
        btn.dataset.id = evt.id;
        btn.type = 'button';

        // Icon + label + date layout.
        // Priority: icon_png_url (for cards) > non-mdi icon text (emoji) > skip
        if (evt.icon_png_url) {
          const iconImg = document.createElement('img');
          iconImg.className = 'cluster-member-icon';
          iconImg.src = evt.icon_png_url;
          iconImg.alt = '';
          iconImg.loading = 'lazy';
          btn.appendChild(iconImg);
        } else if (evt.icon && !evt.icon.startsWith('mdi:')) {
          const iconSpan = el('span', 'cluster-member-icon', evt.icon);
          btn.appendChild(iconSpan);
        }

        const titleSpan = el('span', 'cluster-member-label', evt.label ?? evt.title);
        const dateSpan = el('span', 'cluster-member-date', formatDate(evt.date ?? evt.start_date));
        btn.appendChild(titleSpan);
        btn.appendChild(dateSpan);

        item.appendChild(btn);
        list.appendChild(item);
      }

      section.appendChild(list);
      wrap.appendChild(section);
    }
  } else {
    // Cluster or aggregate: flat list of members (not grouped).
    const list = document.createElement('ul');
    list.className = 'cluster-member-list';

    for (const evt of members) {
      const item = document.createElement('li');

      const btn = document.createElement('button');
      btn.className = 'cluster-member-item';
      btn.dataset.id = evt.id;
      btn.type = 'button';

      // Icon + label + date layout.
      // Priority: icon_png_url (for cards) > non-mdi icon text (emoji) > skip
      if (evt.icon_png_url) {
        const iconImg = document.createElement('img');
        iconImg.className = 'cluster-member-icon';
        iconImg.src = evt.icon_png_url;
        iconImg.alt = '';
        iconImg.loading = 'lazy';
        btn.appendChild(iconImg);
      } else if (evt.icon && !evt.icon.startsWith('mdi:')) {
        const iconSpan = el('span', 'cluster-member-icon', evt.icon);
        btn.appendChild(iconSpan);
      }

      const titleSpan = el('span', 'cluster-member-label', evt.label ?? evt.title);
      const dateSpan = el('span', 'cluster-member-date', formatDate(evt.date ?? evt.start_date));
      btn.appendChild(titleSpan);
      btn.appendChild(dateSpan);

      item.appendChild(btn);
      list.appendChild(item);
    }

    wrap.appendChild(list);
  }

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
      ? `${formatDate(event.start_date)} – ${event.end_date ? formatDate(event.end_date) : 'Present'}`
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

/**
 * Append a photo gallery grid if photos are present.
 *
 * @param {HTMLElement} parent
 * @param {string[]}    photos
 */
function appendGallery(parent, photos) {
  if (!photos?.length) return;
  const grid = el('div', 'card-gallery');
  for (const url of photos) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    grid.appendChild(img);
  }
  parent.appendChild(grid);
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
 * Format an ISO datetime string as HH:MM.
 * @param {string} isoString
 * @returns {string}
 */
function formatTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Format a decimal minutes-per-km pace value as "M:SS /km".
 * @param {number} decimalMinutes
 * @returns {string}
 */
function formatPace(decimalMinutes) {
  if (decimalMinutes == null) return '';
  const mins = Math.floor(decimalMinutes);
  const secs = Math.round((decimalMinutes - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
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
