/**
 * api.js — fetch + normalize API response.
 *
 * Also generates auto-generated birthday point events from person.birth_date,
 * one per year from birth to today. Explicit spine events with
 * milestone_type: "birthday" on the same date replace the auto-generated entry.
 */

const TIMELINE_URL = '/api/timeline';

/**
 * Fetch and normalize the full timeline payload.
 *
 * @param {string} [url] - Override endpoint (useful for testing with a fixture).
 * @returns {Promise<NormalizedTimeline>}
 */
export async function fetchTimeline(url = TIMELINE_URL) {
  const res = await fetch(url);
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
  const events = (raw.events ?? []).map(normalizeEvent);

  const birthdays = generateBirthdays(person.birth_date, events);

  return {
    person,
    line_families,
    events: [...events, ...birthdays],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeEvent(evt) {
  return {
    id: evt.id,
    family_id: evt.family_id,
    line_key: evt.line_key,
    parent_line_key: evt.parent_line_key ?? null,
    type: evt.type,
    title: evt.title,
    label: evt.label ?? null,   // short display string; falls back to truncated title if null
    icon: evt.icon ?? null,     // sprite sheet symbol ID, e.g. "book", "briefcase"
    // Span fields
    start_date: evt.start_date ?? null,
    end_date: evt.end_date ?? null,
    // Point field
    date: evt.date ?? null,
    location: evt.location ?? null,
    description: evt.description ?? null,
    external_url: evt.external_url ?? null,
    hero_image_url: evt.hero_image_url ?? null,
    photos: evt.photos ?? [],
    metadata: evt.metadata ?? {},
  };
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
    bday.setFullYear(birth.getFullYear() + age);
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
