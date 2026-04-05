/**
 * api.js — fetch + normalize API response.
 *
 * Also generates auto-generated birthday point events from person.birth_date,
 * one per year from birth to today. Explicit spine events with
 * milestone_type: "birthday" on the same date replace the auto-generated entry.
 */

// Can be overridden at runtime by setting window.TIMELINE_API_URL before the
// module loads — useful for pointing at a backend on a different origin during
// local development without changing source code.
const TIMELINE_URL = (typeof window !== 'undefined' && window.TIMELINE_API_URL)
  ? window.TIMELINE_API_URL
  : '/api/timeline';

/**
 * Extract the `token` query parameter from a URL search string.
 *
 * @param {string} search - e.g. window.location.search ("?token=abc123")
 * @returns {string|null} The token value, or null if absent/empty.
 */
export function getTokenFromSearch(search) {
  const token = new URLSearchParams(search).get('token');
  return token || null;
}

/**
 * Fetch and normalize the full timeline payload.
 *
 * @param {string} [url]   - Override endpoint (useful for testing with a fixture).
 * @param {string} [token] - Bearer token for Authorization header. Defaults to
 *                           the `token` query param from the current page URL.
 * @returns {Promise<NormalizedTimeline>}
 */
export async function fetchTimeline(
  url = TIMELINE_URL,
  token = (typeof window !== 'undefined' ? getTokenFromSearch(window.location.search) : null),
) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.status}`);
  const raw = await res.json();
  return normalize(raw);
}

/**
 * Normalize a raw API payload.
 *
 * - Ensures all optional fields are present with sane defaults.
 * - Generates birthday events from person.birth_date.
 * - Merges explicit birthday events over auto-generated ones.
 *
 * @param {object} raw
 * @returns {NormalizedTimeline}
 */
export function normalize(raw) {
  const person = raw.person;
  const line_families = raw.line_families ?? [];
  const events = resolveFlights((raw.events ?? []).map(normalizeEvent));

  // Inject computed age into any explicit birthday spine events so cards.js
  // can always read event.metadata.age without needing person.birth_date.
  injectBirthdayAge(events, person.birth_date);

  const birthdays = generateBirthdays(person.birth_date, events);

  return {
    person,
    line_families,
    events: [...events, ...birthdays],
  };
}

/**
 * Mutate explicit spine birthday events to include a computed `age` in their
 * metadata, matching the shape of auto-generated birthday events.
 *
 * @param {object[]} events       - Already-normalized events.
 * @param {string}   birthDateStr - ISO date string from person.birth_date.
 */
function injectBirthdayAge(events, birthDateStr) {
  const birth = new Date(birthDateStr);
  for (const evt of events) {
    if (evt.family_id !== 'spine' || evt.metadata?.milestone_type !== 'birthday') continue;
    if (typeof evt.metadata.age === 'number') continue; // already set
    const evtDate = new Date(evt.date);
    evt.metadata.age = evtDate.getUTCFullYear() - birth.getUTCFullYear();
  }
}

// ---------------------------------------------------------------------------
// Flight resolution
// ---------------------------------------------------------------------------

/**
 * Reassign flight events (family_id === 'flights') to the appropriate line,
 * and select the correct icon based on the flight's position relative to its
 * containing travel span:
 *
 *   - start_date of the span → mdi:airplane-takeoff  (departure)
 *   - end_date of the span   → mdi:airplane-landing  (arrival)
 *   - mid-trip or standalone → mdi:airplane
 *
 * Flights that don't overlap any travel span are promoted to the main spine.
 *
 * The check is purely date-based — no explicit metadata link is required
 * between flight events and travel spans.
 *
 * @param {object[]} events - Normalized events array.
 * @returns {object[]}
 */
export function resolveFlights(events) {
  const travelSpans = events.filter(
    (e) => e.type === 'span' && e.family_id === 'travel',
  );

  return events.map((evt) => {
    if (evt.family_id !== 'flights') return evt;

    const flightDate = new Date(evt.date);
    const containing = travelSpans.find((span) => {
      const start = new Date(span.start_date);
      const end   = new Date(span.end_date);
      return flightDate >= start && flightDate <= end;
    });

    if (containing) {
      const isStart = evt.date === containing.start_date;
      const isEnd   = evt.date === containing.end_date;
      const icon = isStart ? 'mdi:airplane-takeoff'
                 : isEnd   ? 'mdi:airplane-landing'
                 :           'mdi:airplane';
      return { ...evt, family_id: containing.family_id, line_key: containing.line_key, icon };
    }

    return { ...evt, family_id: 'spine', line_key: 'spine', icon: 'mdi:airplane' };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeEvent(evt) {
  return {
    id: evt.id,
    family_id: evt.family_id,
    line_key: evt.line_key,
    type: evt.type,
    title: evt.title,
    label: evt.label ?? null,   // short display string; falls back to truncated title if null
    icon: evt.icon ?? null,       // icon shown at the departure station (start of span / point event)
    end_icon: evt.end_icon ?? null, // icon shown at the arrival station (merge end of span only)
    // Span fields
    start_date: evt.start_date ?? null,
    end_date: evt.end_date ?? null,
    // Point field
    date: evt.date ?? null,
    location: evt.location ?? null,
    description: evt.description ?? null,
    external_url: evt.external_url ?? null,
    hero_image_url: evt.hero_image_url ?? null,
    photos: normalizePhotos(evt.photos),
    metadata: evt.metadata ?? {},
  };
}

/**
 * Normalize photos from either format:
 *   - Mock fixture: plain URL strings  ["https://..."]
 *   - Backend API:  photo objects      [{ id, s3_url, variant, sort_order }]
 *
 * The gallery card renders thumbnails, so prefer the 'thumb' variant when
 * backend photo objects are present. Falls back to all photos if none are
 * tagged 'thumb'.
 *
 * @param {Array} photos
 * @returns {string[]}
 */
function normalizePhotos(photos) {
  if (!photos || photos.length === 0) return [];
  // Mock fixture: already URL strings.
  if (typeof photos[0] === 'string') return photos;
  // Backend API: objects with s3_url + variant.
  const thumbs = photos.filter((p) => p.variant === 'thumb');
  return (thumbs.length > 0 ? thumbs : photos).map((p) => p.s3_url);
}

/**
 * Generate one auto birthday event per year from birth year to this year.
 * Explicit birthday events from the API take precedence — they are returned
 * by normalize() in the main events array and de-duplicate by date here.
 *
 * @param {string} birthDateStr - ISO date string, e.g. "1990-04-12"
 * @param {object[]} existingEvents - already-normalized events
 * @returns {object[]}
 */
export function generateBirthdays(birthDateStr, existingEvents = []) {
  const birth = new Date(birthDateStr);
  const today = new Date();

  // Dates of explicit birthday spine events (ISO strings) — these win.
  const explicitDates = new Set(
    existingEvents
      .filter(
        (e) =>
          e.family_id === 'spine' && e.metadata?.milestone_type === 'birthday',
      )
      .map((e) => e.date),
  );

  const birthdays = [];
  for (let age = 0; ; age++) {
    const bday = new Date(birth);
    bday.setUTCFullYear(birth.getUTCFullYear() + age);
    if (bday > today) break;

    const isoDate = bday.toISOString().slice(0, 10);
    if (explicitDates.has(isoDate)) continue; // explicit event replaces auto

    birthdays.push({
      id: `auto_birthday_${age}`,
      family_id: 'spine',
      line_key: 'spine',
      parent_line_key: null,
      type: 'point',
      title: `Birthday — Age ${age}`,
      label: `Age ${age}`,
      icon: 'mdi:cake-variant',
      date: isoDate,
      start_date: null,
      end_date: null,
      location: null,
      description: null,
      external_url: null,
      hero_image_url: null,
      photos: [],
      metadata: { milestone_type: 'birthday', age },
    });
  }

  return birthdays;
}
