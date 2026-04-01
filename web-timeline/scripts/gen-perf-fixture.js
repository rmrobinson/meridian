#!/usr/bin/env node
/**
 * gen-perf-fixture.js — Generate a large synthetic timeline dataset for
 * Phase 5 performance testing.
 *
 * Outputs app/tests/fixtures/perf-timeline.json with 10,000+ events covering
 * a ~37-year life, weighted toward high-frequency event types (fitness, film)
 * that stress the virtualized renderer.
 *
 * The output is fully deterministic — same seed, same file. Re-run any time
 * the fixture needs to be refreshed.
 *
 * Usage:
 *   node scripts/gen-perf-fixture.js
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH  = resolve(__dirname, '../app/tests/fixtures/perf-timeline.json');

// ── Deterministic PRNG (LCG) ──────────────────────────────────────────────────

let _seed = 42;
function rand() {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
  return ((_seed >>> 0) / 0xffffffff);
}
function randInt(min, max) { return min + Math.floor(rand() * (max - min + 1)); }
function randItem(arr)     { return arr[Math.floor(rand() * arr.length)]; }

// ── Date helpers ──────────────────────────────────────────────────────────────

const BIRTH_DATE = '1988-06-15';
const BIRTH      = new Date(BIRTH_DATE);
const TODAY      = new Date('2026-03-31');

function iso(date) { return date.toISOString().slice(0, 10); }

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/** Walk date forward by `stepDays`, jittered ±jitter days. */
function* dateSeries(start, stepDays, jitter = 0) {
  let cur = new Date(start);
  while (cur <= TODAY) {
    yield new Date(cur);
    cur = addDays(cur, stepDays + randInt(-jitter, jitter));
  }
}

// ── Line families (mirrors backend test-config.yaml) ─────────────────────────

const LINE_FAMILIES = [
  { id: 'spine',      label: 'Life Spine',       base_color_hsl: [0, 0, 80],     side: 'center', on_end: 'never',     spawn_behavior: 'single_line' },
  { id: 'employment', label: 'Employment',        base_color_hsl: [210, 70, 50],  side: 'left',   on_end: 'merge',     spawn_behavior: 'per_event'   },
  { id: 'education',  label: 'Education',         base_color_hsl: [270, 60, 55],  side: 'left',   on_end: 'merge',     spawn_behavior: 'per_event'   },
  { id: 'hobbies',    label: 'Hobbies',           base_color_hsl: [180, 55, 45],  side: 'left',   on_end: 'terminate', spawn_behavior: 'per_event'   },
  { id: 'travel',     label: 'Travel',            base_color_hsl: [50, 85, 50],   side: 'right',  on_end: 'merge',     spawn_behavior: 'per_event'   },
  { id: 'flights',    label: 'Flights',           base_color_hsl: [200, 75, 50],  side: 'right',  on_end: 'terminate', spawn_behavior: 'per_event'   },
  { id: 'books',      label: 'Books',             base_color_hsl: [30, 70, 50],   side: 'right',  on_end: 'terminate', spawn_behavior: 'per_event'   },
  { id: 'film_tv',    label: 'Film & TV',         base_color_hsl: [300, 60, 55],  side: 'right',  on_end: 'terminate', spawn_behavior: 'per_event'   },
  { id: 'fitness',    label: 'Fitness & Health',  base_color_hsl: [140, 65, 45],  side: 'right',  on_end: 'terminate', spawn_behavior: 'single_line' },
];

// ── Event accumulators ────────────────────────────────────────────────────────

const events = [];
let   idSeq  = 0;
function nextId(prefix) { return `${prefix}_${String(++idSeq).padStart(5, '0')}`; }

// ── Education ─────────────────────────────────────────────────────────────────
// High school and university — two education spans.

events.push({
  id: nextId('edu'), family_id: 'education', line_key: 'high-school',
  type: 'span', title: 'High School',
  start_date: '2002-09-01', end_date: '2006-06-15',
  icon: 'mdi:school', metadata: { institution: 'Springfield High', degree: 'High School Diploma' },
});

events.push({
  id: nextId('edu'), family_id: 'education', line_key: 'university',
  type: 'span', title: 'University of Waterloo',
  start_date: '2006-09-01', end_date: '2010-04-30',
  icon: 'mdi:school', metadata: { institution: 'University of Waterloo', degree: 'BSc Computer Science' },
});

// ── Employment ────────────────────────────────────────────────────────────────

const jobs = [
  { key: 'job-intern-2009',  title: 'Software Intern — Shopify',       start: '2009-05-01', end: '2009-08-31' },
  { key: 'job-acme-2010',    title: 'Junior Developer — Acme Corp',     start: '2010-07-01', end: '2013-03-31' },
  { key: 'job-bigco-2013',   title: 'Software Engineer — BigCo',        start: '2013-05-01', end: '2016-11-30' },
  { key: 'job-startup-2017', title: 'Senior Engineer — LaunchPad Inc',  start: '2017-02-01', end: '2021-08-31' },
  { key: 'job-current-2021', title: 'Staff Engineer — Horizon Systems', start: '2021-10-01', end: '2026-03-31' },
];

for (const j of jobs) {
  events.push({
    id: nextId('emp'), family_id: 'employment', line_key: j.key,
    type: 'span', title: j.title,
    start_date: j.start, end_date: j.end,
    icon: 'mdi:briefcase', metadata: { role: j.title.split('—')[0].trim() },
  });
}

// ── Spine milestones ──────────────────────────────────────────────────────────

const milestones = [
  { date: '2010-08-01', title: 'Moved to Toronto',        metadata: { milestone_type: 'relocation' } },
  { date: '2015-06-20', title: 'Wedding Day',             metadata: { milestone_type: 'marriage'   } },
  { date: '2017-03-14', title: 'Moved to Vancouver',      metadata: { milestone_type: 'relocation' } },
  { date: '2018-11-02', title: 'Lost Grandpa Joe',        metadata: { milestone_type: 'bereavement'} },
  { date: '2021-09-15', title: 'Moved to Ottawa',         metadata: { milestone_type: 'relocation' } },
];

for (const m of milestones) {
  events.push({
    id: nextId('spine'), family_id: 'spine', line_key: 'spine',
    type: 'point', title: m.title, date: m.date,
    icon: 'mdi:map-marker', metadata: m.metadata,
  });
}

// ── Travel (4–6 trips/year, each 5–21 days) ───────────────────────────────────

const DESTINATIONS = [
  { title: 'Paris Trip',         icon: 'mdi:airplane-takeoff' },
  { title: 'Tokyo Trip',         icon: 'mdi:airplane-takeoff' },
  { title: 'New York Trip',      icon: 'mdi:airplane-takeoff' },
  { title: 'Barcelona Trip',     icon: 'mdi:airplane-takeoff' },
  { title: 'Road Trip — Coast',  icon: 'mdi:car'              },
  { title: 'Camping Trip',       icon: 'mdi:tent'             },
  { title: 'Ski Trip',           icon: 'mdi:ski'              },
  { title: 'Berlin Trip',        icon: 'mdi:airplane-takeoff' },
  { title: 'Lisbon Trip',        icon: 'mdi:airplane-takeoff' },
  { title: 'Hiking Week',        icon: 'mdi:tent'             },
];

{
  let cur = addMonths(BIRTH, 12 * 18); // start at age 18
  let tripIdx = 0;
  while (cur < TODAY) {
    const dest = DESTINATIONS[tripIdx % DESTINATIONS.length];
    const duration = randInt(5, 21);
    const end = addDays(cur, duration);
    if (end >= TODAY) break;
    const key = `trip-${tripIdx}`;
    events.push({
      id: nextId('travel'), family_id: 'travel', line_key: key,
      type: 'span', title: dest.title,
      start_date: iso(cur), end_date: iso(end),
      icon: dest.icon, metadata: {},
    });
    // Gap of 6–10 weeks between trips.
    cur = addDays(end, randInt(42, 70));
    tripIdx++;
  }
}

// ── Flights (domestic, 10–15 per year, point events) ─────────────────────────

{
  let flightIdx = 0;
  for (const d of dateSeries(addMonths(BIRTH, 12 * 22), 26, 10)) {
    if (d < new Date('2010-01-01')) continue;
    events.push({
      id: nextId('flight'), family_id: 'flights', line_key: `flight-${flightIdx}`,
      type: 'point', title: 'Domestic Flight',
      date: iso(d), icon: 'mdi:airplane-takeoff', metadata: {},
    });
    flightIdx++;
  }
}

// ── Books (~2/month, each read over 10–30 days) ───────────────────────────────

const BOOK_TITLES = [
  'Dune', 'The Pragmatic Programmer', 'Sapiens', 'Thinking Fast and Slow',
  'The Three-Body Problem', 'Atomic Habits', 'Clean Code', 'Deep Work',
  'The Hitchhiker\'s Guide', 'Project Hail Mary', 'The Martian', 'Leviathan Wakes',
  'Ender\'s Game', 'Foundation', 'Neuromancer', 'Snow Crash',
  'The Name of the Wind', 'A Fire Upon the Deep', 'Recursion', 'Dark Matter',
];

{
  let cur = addMonths(BIRTH, 12 * 14); // start reading at ~14
  let bookIdx = 0;
  while (cur < TODAY) {
    const duration = randInt(10, 30);
    const end = addDays(cur, duration);
    if (end >= TODAY) break;
    events.push({
      id: nextId('book'), family_id: 'books', line_key: `book-${bookIdx}`,
      type: 'span', title: BOOK_TITLES[bookIdx % BOOK_TITLES.length],
      start_date: iso(cur), end_date: iso(end),
      icon: 'mdi:book-open-variant',
      metadata: { author: 'Various', rating: randInt(3, 5) },
    });
    // Gap of 5–20 days between books.
    cur = addDays(end, randInt(5, 20));
    bookIdx++;
  }
}

// ── Film & TV (~2 films/week, point events) ───────────────────────────────────

const FILM_TITLES = [
  'Inception', 'The Dark Knight', 'Interstellar', 'Arrival', 'Mad Max: Fury Road',
  'Everything Everywhere All at Once', 'The Shawshank Redemption', 'Parasite',
  'Whiplash', 'BlacKkKlansman', 'Get Out', 'Ex Machina', 'Her', 'Hereditary',
  'Midsommar', 'The Lighthouse', 'Annihilation', 'Blade Runner 2049',
  'Spider-Man: Into the Spider-Verse', 'Portrait of a Lady on Fire',
];

{
  let filmIdx = 0;
  for (const d of dateSeries(addMonths(BIRTH, 12 * 12), 2, 1)) {
    events.push({
      id: nextId('film'), family_id: 'film_tv', line_key: `film-${filmIdx}`,
      type: 'point', title: FILM_TITLES[filmIdx % FILM_TITLES.length],
      date: iso(d), icon: 'mdi:filmstrip',
      metadata: { rating: randInt(3, 5) },
    });
    filmIdx++;
  }
}

// ── Fitness runs (~4/week, single_line) ───────────────────────────────────────

{
  let runIdx = 0;
  for (const d of dateSeries(addMonths(BIRTH, 12 * 16), 2, 1)) {
    const distKm = (randInt(40, 120) / 10);
    events.push({
      id: nextId('run'), family_id: 'fitness', line_key: 'fitness',
      type: 'point', title: 'Run',
      date: iso(d), icon: 'mdi:run',
      metadata: { activity: 'run', distance_km: distKm },
    });
    runIdx++;
  }
}

// ── Fitness — gym sessions (~3/week, single_line, separate from runs) ─────────

{
  let gymIdx = 0;
  for (const d of dateSeries(addMonths(BIRTH, 12 * 20), 2, 1)) {
    events.push({
      id: nextId('gym'), family_id: 'fitness', line_key: 'fitness',
      type: 'point', title: 'Gym',
      date: iso(d), icon: 'mdi:heart',
      metadata: { activity: 'gym' },
    });
    gymIdx++;
  }
}

// ── Hobbies (concerts, events ~20/year) ───────────────────────────────────────

const HOBBY_EVENTS = [
  { title: 'Concert — Radiohead',       icon: 'mdi:music'      },
  { title: 'Concert — Arcade Fire',     icon: 'mdi:music'      },
  { title: 'Concert — LCD Soundsystem', icon: 'mdi:music'      },
  { title: 'Hackathon',                 icon: 'mdi:briefcase'  },
  { title: 'Climbing Trip',             icon: 'mdi:heart'      },
  { title: 'Cycling Sportive',          icon: 'mdi:bike'       },
];

{
  let hobbyIdx = 0;
  for (const d of dateSeries(addMonths(BIRTH, 12 * 16), 18, 5)) {
    const h = HOBBY_EVENTS[hobbyIdx % HOBBY_EVENTS.length];
    events.push({
      id: nextId('hobby'), family_id: 'hobbies', line_key: `hobby-${hobbyIdx}`,
      type: 'point', title: h.title,
      date: iso(d), icon: h.icon, metadata: { activity: h.title },
    });
    hobbyIdx++;
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

const fixture = {
  person: { name: 'Alex Meridian', birth_date: BIRTH_DATE },
  line_families: LINE_FAMILIES,
  events,
};

writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2));
console.log(`Generated ${events.length} events → ${OUT_PATH}`);
