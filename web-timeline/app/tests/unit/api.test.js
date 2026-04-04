import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateBirthdays, normalize, resolveFlights, getTokenFromSearch, fetchTimeline } from '../../js/api.js';

const BIRTH = '1990-04-12';

describe('generateBirthdays()', () => {
  it('produces one birthday event per year from birth to today', () => {
    const birthdays = generateBirthdays(BIRTH);
    const today = new Date();
    const expectedCount = today.getFullYear() - 1990; // age 0 through age N-1
    // Allow off-by-one depending on whether today is past April 12.
    expect(birthdays.length).toBeGreaterThanOrEqual(expectedCount);
    expect(birthdays.length).toBeLessThanOrEqual(expectedCount + 1);
  });

  it('does not generate a birthday past today', () => {
    const birthdays = generateBirthdays(BIRTH);
    const today = new Date();
    for (const b of birthdays) {
      expect(new Date(b.date).getTime()).toBeLessThanOrEqual(today.getTime());
    }
  });

  it('skips dates that have an explicit spine birthday event', () => {
    const explicitDate = `${new Date(BIRTH).getFullYear() + 30}-04-12`; // 30th birthday
    const existingEvents = [
      {
        family_id: 'spine',
        date: explicitDate,
        metadata: { milestone_type: 'birthday' },
      },
    ];
    const birthdays = generateBirthdays(BIRTH, existingEvents);
    const dates = birthdays.map((b) => b.date);
    expect(dates).not.toContain(explicitDate);
  });

  it('uses "Birthday — Age N" as the auto-generated title', () => {
    const birthdays = generateBirthdays(BIRTH);
    const age1 = birthdays.find((b) => b.metadata.age === 1);
    expect(age1?.title).toBe('Birthday — Age 1');
  });

  it('includes age in metadata', () => {
    const birthdays = generateBirthdays(BIRTH);
    expect(birthdays[0].metadata.age).toBe(0);
    expect(birthdays[1].metadata.age).toBe(1);
  });
});

describe('photo normalization', () => {
  function rawWithPhotos(photos) {
    return {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [],
      events: [
        {
          id: 'e1',
          family_id: 'travel',
          line_key: 'trip-a',
          type: 'span',
          title: 'Trip A',
          start_date: '2020-01-01',
          end_date: '2020-01-10',
          photos,
        },
      ],
    };
  }

  it('passes through plain URL strings unchanged (mock fixture format)', () => {
    const urls = ['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'];
    const result = normalize(rawWithPhotos(urls));
    const evt = result.events.find((e) => e.id === 'e1');
    expect(evt.photos).toEqual(urls);
  });

  it('extracts s3_url from backend photo objects', () => {
    const photos = [
      { id: 'p1', s3_url: 'https://s3.example.com/photo1.jpg', variant: 'original', sort_order: 0 },
      { id: 'p2', s3_url: 'https://s3.example.com/photo1-thumb.jpg', variant: 'thumb', sort_order: 1 },
    ];
    const result = normalize(rawWithPhotos(photos));
    const evt = result.events.find((e) => e.id === 'e1');
    // Prefers thumb variant
    expect(evt.photos).toEqual(['https://s3.example.com/photo1-thumb.jpg']);
  });

  it('falls back to all photos when no thumb variant is present', () => {
    const photos = [
      { id: 'p1', s3_url: 'https://s3.example.com/photo1.jpg', variant: 'original', sort_order: 0 },
      { id: 'p2', s3_url: 'https://s3.example.com/photo1-hero.jpg', variant: 'hero', sort_order: 1 },
    ];
    const result = normalize(rawWithPhotos(photos));
    const evt = result.events.find((e) => e.id === 'e1');
    expect(evt.photos).toEqual([
      'https://s3.example.com/photo1.jpg',
      'https://s3.example.com/photo1-hero.jpg',
    ]);
  });

  it('returns an empty array when photos is null or absent', () => {
    const result = normalize(rawWithPhotos(null));
    const evt = result.events.find((e) => e.id === 'e1');
    expect(evt.photos).toEqual([]);
  });
});

describe('normalize()', () => {
  it('fills in null for missing optional event fields', () => {
    const raw = {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [],
      events: [
        {
          id: 'e1',
          family_id: 'travel',
          line_key: 'trip-a',
          type: 'span',
          title: 'Trip A',
          start_date: '2020-01-01',
          end_date: '2020-01-10',
          // omit all optional fields
        },
      ],
    };
    const result = normalize(raw);
    const evt = result.events.find((e) => e.id === 'e1');
    expect(evt.location).toBeNull();
    expect(evt.external_url).toBeNull();
    expect(evt.hero_image_url).toBeNull();
    expect(evt.photos).toEqual([]);
    expect(evt.metadata).toEqual({});
    expect(evt.parent_line_key).toBeNull();
  });

  it('does not duplicate a birthday when an explicit event exists', () => {
    const explicitDate = `${new Date(BIRTH).getFullYear() + 30}-04-12`;
    const raw = {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [],
      events: [
        {
          id: 'b30',
          family_id: 'spine',
          line_key: 'spine',
          type: 'point',
          title: '30th Birthday',
          date: explicitDate,
          metadata: { milestone_type: 'birthday' },
        },
      ],
    };
    const result = normalize(raw);
    const onThatDate = result.events.filter((e) => e.date === explicitDate);
    expect(onThatDate).toHaveLength(1);
    expect(onThatDate[0].id).toBe('b30');
  });

  it('uses the explicit title when a custom birthday title is provided', () => {
    const explicitDate = `${new Date(BIRTH).getFullYear() + 30}-04-12`;
    const raw = {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [],
      events: [
        {
          id: 'b30',
          family_id: 'spine',
          line_key: 'spine',
          type: 'point',
          title: '30th Birthday Party',
          date: explicitDate,
          metadata: { milestone_type: 'birthday' },
        },
      ],
    };
    const result = normalize(raw);
    const birthday = result.events.find((e) => e.date === explicitDate);
    expect(birthday.title).toBe('30th Birthday Party');
  });

  it('handles empty events array', () => {
    const raw = {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [],
      events: [],
    };
    const result = normalize(raw);
    // Only auto-generated birthdays remain
    expect(result.events.every((e) => e.family_id === 'spine')).toBe(true);
  });
});

describe('getTokenFromSearch()', () => {
  it('returns null when no token param is present', () => {
    expect(getTokenFromSearch('')).toBeNull();
    expect(getTokenFromSearch('?foo=bar')).toBeNull();
  });

  it('returns null when token param is empty string', () => {
    expect(getTokenFromSearch('?token=')).toBeNull();
  });

  it('returns the token value when present', () => {
    expect(getTokenFromSearch('?token=abc123')).toBe('abc123');
  });

  it('handles token among other params', () => {
    expect(getTokenFromSearch('?foo=bar&token=xyz&baz=1')).toBe('xyz');
  });
});

describe('fetchTimeline() authorization', () => {
  const MINIMAL_PAYLOAD = {
    person: { name: 'Test', birth_date: BIRTH },
    line_families: [],
    events: [],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchOk(payload = MINIMAL_PAYLOAD) {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });
  }

  it('sends no Authorization header when token is null', async () => {
    mockFetchOk();
    await fetchTimeline('/api/timeline', null);
    expect(fetch).toHaveBeenCalledWith('/api/timeline', { headers: {} });
  });

  it('sends Authorization: Bearer header when token is provided', async () => {
    mockFetchOk();
    await fetchTimeline('/api/timeline', 'mytoken');
    expect(fetch).toHaveBeenCalledWith('/api/timeline', {
      headers: { Authorization: 'Bearer mytoken' },
    });
  });

  it('throws when the response is not ok', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchTimeline('/api/timeline', 'bad')).rejects.toThrow('401');
  });
});

// ── resolveFlights() ──────────────────────────────────────────────────────────

describe('resolveFlights()', () => {
  const TRAVEL_SPAN = {
    id: 'trip-japan',
    type: 'span',
    family_id: 'travel',
    line_key: 'japan-2023',
    parent_line_key: null,
    start_date: '2023-03-10',
    end_date: '2023-03-24',
    title: 'Japan Trip',
    label: null,
    icon: null,
    end_icon: null,
    date: null,
    location: null,
    description: null,
    external_url: null,
    hero_image_url: null,
    photos: [],
    metadata: {},
  };

  function makeFlight(id, date, lineKey = `flight-${id}`) {
    return {
      id,
      type: 'point',
      family_id: 'flights',
      line_key: lineKey,
      parent_line_key: null,
      date,
      title: `Flight ${id}`,
      label: null,
      icon: 'mdi:airplane-takeoff',
      end_icon: null,
      start_date: null,
      end_date: null,
      location: null,
      description: null,
      external_url: null,
      hero_image_url: null,
      photos: [],
      metadata: {},
    };
  }

  it('moves a flight within a travel span onto that travel line', () => {
    const flight = makeFlight('f1', '2023-03-15');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    const resolved = result.find((e) => e.id === 'f1');
    expect(resolved.family_id).toBe('travel');
    expect(resolved.line_key).toBe('japan-2023');
  });

  it('is inclusive on the start_date of the travel span', () => {
    const flight = makeFlight('f_start', '2023-03-10');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    const resolved = result.find((e) => e.id === 'f_start');
    expect(resolved.family_id).toBe('travel');
    expect(resolved.line_key).toBe('japan-2023');
  });

  it('is inclusive on the end_date of the travel span', () => {
    const flight = makeFlight('f_end', '2023-03-24');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    const resolved = result.find((e) => e.id === 'f_end');
    expect(resolved.family_id).toBe('travel');
    expect(resolved.line_key).toBe('japan-2023');
  });

  it('promotes a flight with no matching travel span to the spine', () => {
    const flight = makeFlight('f_solo', '2021-03-15');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    const resolved = result.find((e) => e.id === 'f_solo');
    expect(resolved.family_id).toBe('spine');
    expect(resolved.line_key).toBe('spine');
  });

  it('preserves title on the reassigned event', () => {
    const flight = makeFlight('f2', '2023-03-10');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    expect(result.find((e) => e.id === 'f2').title).toBe('Flight f2');
  });

  it('icon is mdi:airplane-takeoff for a flight on the trip start_date', () => {
    const flight = makeFlight('f_dep', '2023-03-10');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    expect(result.find((e) => e.id === 'f_dep').icon).toBe('mdi:airplane-takeoff');
  });

  it('icon is mdi:airplane-landing for a flight on the trip end_date', () => {
    const flight = makeFlight('f_arr', '2023-03-24');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    expect(result.find((e) => e.id === 'f_arr').icon).toBe('mdi:airplane-landing');
  });

  it('icon is mdi:airplane for a flight mid-trip', () => {
    const flight = makeFlight('f_mid', '2023-03-15');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    expect(result.find((e) => e.id === 'f_mid').icon).toBe('mdi:airplane');
  });

  it('icon is mdi:airplane for a standalone flight promoted to spine', () => {
    const flight = makeFlight('f_solo2', '2021-03-15');
    const result = resolveFlights([TRAVEL_SPAN, flight]);
    expect(result.find((e) => e.id === 'f_solo2').icon).toBe('mdi:airplane');
  });

  it('leaves non-flight events unchanged', () => {
    const result = resolveFlights([TRAVEL_SPAN]);
    expect(result[0]).toBe(TRAVEL_SPAN);
  });

  it('handles no travel spans — all flights go to spine', () => {
    const f1 = makeFlight('f_a', '2022-06-01');
    const f2 = makeFlight('f_b', '2023-03-15');
    const result = resolveFlights([f1, f2]);
    expect(result.every((e) => e.family_id === 'spine')).toBe(true);
  });

  it('integrates via normalize(): flights in a travel span get travel family', () => {
    const raw = {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [
        {
          id: 'travel', label: 'Travel', base_color_hsl: [50, 85, 50],
          side: 'right', on_end: 'merge', spawn_behavior: 'per_event',
        },
      ],
      events: [
        {
          id: 'trip',
          family_id: 'travel',
          line_key: 'japan-2023',
          type: 'span',
          title: 'Japan Trip',
          start_date: '2023-03-10',
          end_date: '2023-03-24',
        },
        {
          id: 'flight',
          family_id: 'flights',
          line_key: 'lhr-nrt',
          type: 'point',
          title: 'LHR → NRT',
          date: '2023-03-10',
          icon: 'mdi:airplane-takeoff',
        },
      ],
    };
    const result = normalize(raw);
    const flight = result.events.find((e) => e.id === 'flight');
    expect(flight.family_id).toBe('travel');
    expect(flight.line_key).toBe('japan-2023');
  });

  it('integrates via normalize(): flight outside all trips goes to spine', () => {
    const raw = {
      person: { name: 'Test', birth_date: BIRTH },
      line_families: [],
      events: [
        {
          id: 'solo_flight',
          family_id: 'flights',
          line_key: 'lhr-dub',
          type: 'point',
          title: 'LHR → DUB',
          date: '2021-03-15',
          icon: 'mdi:airplane-takeoff',
        },
      ],
    };
    const result = normalize(raw);
    const flight = result.events.find((e) => e.id === 'solo_flight');
    expect(flight.family_id).toBe('spine');
    expect(flight.line_key).toBe('spine');
  });
});
