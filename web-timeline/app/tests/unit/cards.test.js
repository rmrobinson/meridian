// @vitest-environment happy-dom
/**
 * cards.test.js — Unit tests for buildCardContent().
 *
 * Uses happy-dom for document.createElement.
 * Tests cover metadata_type dispatch, shared elements, and type-specific elements.
 */

import { describe, it, expect } from 'vitest';
import { buildCardContent, buildClusterCardContent } from '../../js/cards.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function base(overrides = {}) {
  return {
    id:            'evt-test',
    family_id:     'hobbies',
    metadata_type: 'standard',
    type:          'point',
    title:         'Test Event',
    label:         null,
    date:          '2023-06-23',
    start_date:    null,
    end_date:      null,
    location:      null,
    description:   null,
    external_url:  null,
    hero_image_url: null,
    photos:        [],
    metadata:      {},
    ...overrides,
  };
}

function getRoot(el) {
  return el;
}

// ── Card type dispatch ────────────────────────────────────────────────────────

describe('card type dispatch', () => {
  it('returns a milestone card for metadata_type: life', () => {
    const frag = buildCardContent(base({ metadata_type: 'life', metadata: { milestone_type: 'relocation' } }));
    expect(getRoot(frag).classList.contains('card--milestone')).toBe(true);
  });

  it('returns an employment card for metadata_type: employment', () => {
    const frag = buildCardContent(base({ metadata_type: 'employment' }));
    expect(getRoot(frag).classList.contains('card--employment')).toBe(true);
  });

  it('returns an education card for metadata_type: education', () => {
    const frag = buildCardContent(base({ metadata_type: 'education' }));
    expect(getRoot(frag).classList.contains('card--education')).toBe(true);
  });

  it('returns a travel card for metadata_type: travel', () => {
    const frag = buildCardContent(base({ metadata_type: 'travel' }));
    expect(getRoot(frag).classList.contains('card--travel')).toBe(true);
  });

  it('returns a flight card for metadata_type: flight', () => {
    const frag = buildCardContent(base({ metadata_type: 'flight' }));
    expect(getRoot(frag).classList.contains('card--flight')).toBe(true);
  });

  it('returns a book card for metadata_type: book', () => {
    const frag = buildCardContent(base({ metadata_type: 'book' }));
    expect(getRoot(frag).classList.contains('card--book')).toBe(true);
  });

  it('returns a film/tv card for metadata_type: film_tv', () => {
    const frag = buildCardContent(base({ metadata_type: 'film_tv' }));
    expect(getRoot(frag).classList.contains('card--tv')).toBe(true);
  });

  it('returns a fitness card for metadata_type: fitness', () => {
    const frag = buildCardContent(base({ metadata_type: 'fitness' }));
    expect(getRoot(frag).classList.contains('card--fitness')).toBe(true);
  });

  it('returns a concert card for metadata_type: concert', () => {
    const frag = buildCardContent(base({ metadata_type: 'concert' }));
    expect(getRoot(frag).classList.contains('card--concert')).toBe(true);
  });

  it('returns a standard card for metadata_type: standard', () => {
    const frag = buildCardContent(base({ metadata_type: 'standard' }));
    expect(getRoot(frag).classList.contains('card--standard')).toBe(true);
  });

  it('returns a standard card when metadata_type is null', () => {
    const frag = buildCardContent(base({ metadata_type: null }));
    expect(getRoot(frag).classList.contains('card--standard')).toBe(true);
  });

  it('returns an aggregate card for aggregate type regardless of metadata_type', () => {
    const frag = buildCardContent(base({
      type: 'aggregate', title: '3 runs', year_month: '2023-06', events: [],
    }));
    expect(getRoot(frag).classList.contains('card--aggregate')).toBe(true);
  });

  it('metadata_type: life routes to milestone card even when external_url is set', () => {
    const frag = buildCardContent(base({
      metadata_type: 'life', external_url: 'https://example.com',
      metadata: { milestone_type: 'relocation' },
    }));
    expect(getRoot(frag).classList.contains('card--milestone')).toBe(true);
  });

  it('metadata_type: flight routes to flight card even when family_id is travel (post-resolveFlights)', () => {
    const frag = buildCardContent(base({
      metadata_type: 'flight', family_id: 'travel',
      metadata: { origin_iata: 'LHR', destination_iata: 'NRT' },
    }));
    expect(getRoot(frag).classList.contains('card--flight')).toBe(true);
  });
});

// ── Shared elements ───────────────────────────────────────────────────────────

describe('shared card elements', () => {
  it('renders the event title', () => {
    const frag = buildCardContent(base({ title: 'Glastonbury Festival' }));
    expect(getRoot(frag).querySelector('.card-title').textContent).toBe('Glastonbury Festival');
  });

  it('renders a point event date', () => {
    const frag = buildCardContent(base({ date: '2023-06-23' }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).toContain('2023');
  });

  it('renders a date range for span events', () => {
    const frag = buildCardContent(base({
      type: 'span', start_date: '2023-03-10', end_date: '2023-03-24', date: null,
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).toContain('–');
  });

  it('renders "Present" for ongoing span events with no end_date', () => {
    const frag = buildCardContent(base({
      type: 'span', start_date: '2019-03-01', end_date: null, date: null,
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).toContain('Present');
  });

  it('renders description when present', () => {
    const frag = buildCardContent(base({ description: 'A great weekend.' }));
    expect(getRoot(frag).querySelector('.card-description').textContent).toBe('A great weekend.');
  });

  it('does not render description element when absent', () => {
    const frag = buildCardContent(base({ description: null }));
    expect(getRoot(frag).querySelector('.card-description')).toBeNull();
  });

  it('renders location when present', () => {
    const frag = buildCardContent(base({ location: { label: 'London, UK', lat: 51, lng: 0 } }));
    expect(getRoot(frag).querySelector('.card-location').textContent).toBe('London, UK');
  });

  it('does not render location element when absent', () => {
    const frag = buildCardContent(base({ location: null }));
    expect(getRoot(frag).querySelector('.card-location')).toBeNull();
  });
});

// ── Milestone card ────────────────────────────────────────────────────────────

describe('milestone card', () => {
  it('shows birthday emoji for birthday milestone_type', () => {
    const frag = buildCardContent(base({
      metadata_type: 'life',
      metadata: { milestone_type: 'birthday', age: 30 },
    }));
    expect(getRoot(frag).querySelector('.card-icon').textContent).toBe('🎂');
  });

  it('shows age in dates line when metadata.age is set', () => {
    const frag = buildCardContent(base({
      metadata_type: 'life',
      date: '2020-04-12',
      metadata: { milestone_type: 'birthday', age: 30 },
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).toContain('Age 30');
  });

  it('omits age from dates line when metadata.age is absent', () => {
    const frag = buildCardContent(base({
      metadata_type: 'life',
      metadata: { milestone_type: 'relocation' },
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).not.toContain('Age');
  });

  it('shows fallback star for unknown milestone_type', () => {
    const frag = buildCardContent(base({
      metadata_type: 'life',
      metadata: { milestone_type: 'other' },
    }));
    expect(getRoot(frag).querySelector('.card-icon').textContent).toBe('⭐');
  });
});

// ── Employment card ───────────────────────────────────────────────────────────

describe('employment card', () => {
  it('renders role', () => {
    const frag = buildCardContent(base({
      metadata_type: 'employment',
      metadata: { role: 'Senior Engineer' },
    }));
    expect(getRoot(frag).querySelector('.card-role').textContent).toBe('Senior Engineer');
  });

  it('renders company name as plain text when no company_url', () => {
    const frag = buildCardContent(base({
      metadata_type: 'employment',
      metadata: { company_name: 'Acme Corp' },
    }));
    const node = getRoot(frag).querySelector('.card-company');
    expect(node).not.toBeNull();
    expect(node.textContent).toBe('Acme Corp');
    expect(node.tagName).not.toBe('A');
  });

  it('renders company name as a link when company_url is set', () => {
    const frag = buildCardContent(base({
      metadata_type: 'employment',
      metadata: { company_name: 'Acme Corp', company_url: 'https://acme.example.com' },
    }));
    const link = getRoot(frag).querySelector('a.card-company');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://acme.example.com');
    expect(link.textContent).toBe('Acme Corp');
  });

  it('omits role when absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'employment', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-role')).toBeNull();
  });
});

// ── Education card ────────────────────────────────────────────────────────────

describe('education card', () => {
  it('renders institution', () => {
    const frag = buildCardContent(base({
      metadata_type: 'education',
      metadata: { institution: 'University of Edinburgh' },
    }));
    expect(getRoot(frag).querySelector('.card-institution').textContent).toBe('University of Edinburgh');
  });

  it('renders degree', () => {
    const frag = buildCardContent(base({
      metadata_type: 'education',
      metadata: { degree: 'BSc Computer Science' },
    }));
    expect(getRoot(frag).querySelector('.card-degree').textContent).toBe('BSc Computer Science');
  });

  it('omits institution when absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'education', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-institution')).toBeNull();
  });
});

// ── Travel card ───────────────────────────────────────────────────────────────

describe('travel card', () => {
  it('renders countries joined by middot', () => {
    const frag = buildCardContent(base({
      metadata_type: 'travel',
      metadata: { countries: ['Japan', 'South Korea'] },
    }));
    expect(getRoot(frag).querySelector('.card-countries').textContent).toBe('Japan · South Korea');
  });

  it('renders cities joined by middot', () => {
    const frag = buildCardContent(base({
      metadata_type: 'travel',
      metadata: { cities: ['Tokyo', 'Kyoto'] },
    }));
    expect(getRoot(frag).querySelector('.card-cities').textContent).toBe('Tokyo · Kyoto');
  });

  it('renders hero image when hero_image_url is set', () => {
    const frag = buildCardContent(base({
      metadata_type: 'travel',
      hero_image_url: 'https://cdn.example.com/hero.jpg',
    }));
    const img = getRoot(frag).querySelector('.card-hero');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/hero.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('omits hero image when hero_image_url is absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'travel', hero_image_url: null }));
    expect(getRoot(frag).querySelector('.card-hero')).toBeNull();
  });

  it('renders read-more link when external_url is set', () => {
    const url = 'https://blog.example.com/japan-2023';
    const frag = buildCardContent(base({ metadata_type: 'travel', external_url: url }));
    const link = getRoot(frag).querySelector('.card-read-more');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(url);
  });

  it('omits read-more link when external_url is absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'travel', external_url: null }));
    expect(getRoot(frag).querySelector('.card-read-more')).toBeNull();
  });

  it('renders gallery section when photos are present', () => {
    const photos = ['https://cdn.com/1.jpg', 'https://cdn.com/2.jpg'];
    const frag = buildCardContent(base({ metadata_type: 'travel', photos }));
    const imgs = getRoot(frag).querySelectorAll('.card-gallery img');
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute('loading')).toBe('lazy');
  });

  it('omits gallery section when photos is empty', () => {
    const frag = buildCardContent(base({ metadata_type: 'travel', photos: [] }));
    expect(getRoot(frag).querySelector('.card-gallery')).toBeNull();
  });

  it('omits countries section when metadata is empty', () => {
    const frag = buildCardContent(base({ metadata_type: 'travel', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-countries')).toBeNull();
  });
});

// ── Flight card ───────────────────────────────────────────────────────────────

describe('flight card', () => {
  it('renders route from origin to destination IATA codes', () => {
    const frag = buildCardContent(base({
      metadata_type: 'flight',
      metadata: { origin_iata: 'LHR', destination_iata: 'NRT' },
    }));
    expect(getRoot(frag).querySelector('.card-route').textContent).toBe('LHR → NRT');
  });

  it('renders airline when present', () => {
    const frag = buildCardContent(base({
      metadata_type: 'flight',
      metadata: { airline: 'Japan Airlines' },
    }));
    expect(getRoot(frag).querySelector('.card-airline').textContent).toBe('Japan Airlines');
  });

  it('renders flight number when present', () => {
    const frag = buildCardContent(base({
      metadata_type: 'flight',
      metadata: { flight_number: 'JL044' },
    }));
    expect(getRoot(frag).querySelector('.card-flight-number').textContent).toBe('JL044');
  });

  it('omits route line when IATA codes are absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'flight', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-route')).toBeNull();
  });

  it('omits route line when only one IATA code is present', () => {
    const frag = buildCardContent(base({
      metadata_type: 'flight',
      metadata: { origin_iata: 'LHR' },
    }));
    expect(getRoot(frag).querySelector('.card-route')).toBeNull();
  });
});

// ── Book card ─────────────────────────────────────────────────────────────────

describe('book card', () => {
  it('renders the author', () => {
    const frag = buildCardContent(base({
      metadata_type: 'book',
      metadata: { author: 'Frank Herbert', rating: 5 },
    }));
    expect(getRoot(frag).querySelector('.card-author').textContent).toBe('Frank Herbert');
  });

  it('renders 5 filled stars for a rating of 5', () => {
    const frag = buildCardContent(base({ metadata_type: 'book', metadata: { rating: 5 } }));
    expect(getRoot(frag).querySelector('.card-rating').textContent).toBe('★★★★★');
  });

  it('renders 3 filled and 2 empty stars for a rating of 3', () => {
    const frag = buildCardContent(base({ metadata_type: 'book', metadata: { rating: 3 } }));
    expect(getRoot(frag).querySelector('.card-rating').textContent).toBe('★★★☆☆');
  });

  it('renders review excerpt when present', () => {
    const frag = buildCardContent(base({
      metadata_type: 'book',
      metadata: { review: 'Incredible world-building.' },
    }));
    expect(getRoot(frag).querySelector('.card-review').textContent).toBe('Incredible world-building.');
  });

  it('omits review element when absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'book', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-review')).toBeNull();
  });

  it('renders cover image when cover_image_url is set', () => {
    const frag = buildCardContent(base({
      metadata_type: 'book',
      metadata: { cover_image_url: 'https://covers.example.com/dune.jpg' },
    }));
    const img = getRoot(frag).querySelector('.card-book-cover');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://covers.example.com/dune.jpg');
  });

  it('omits cover image when cover_image_url is absent', () => {
    const frag = buildCardContent(base({ metadata_type: 'book', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-book-cover')).toBeNull();
  });
});

// ── Film/TV card ──────────────────────────────────────────────────────────────

describe('film_tv card', () => {
  it('renders the network for tv type', () => {
    const frag = buildCardContent(base({ metadata_type: 'film_tv', metadata: { type: 'tv', network: 'HBO' } }));
    expect(getRoot(frag).querySelector('.card-network').textContent).toBe('HBO');
  });

  it('renders seasons watched for tv type', () => {
    const frag = buildCardContent(base({ metadata_type: 'film_tv', metadata: { type: 'tv', seasons_watched: 3 } }));
    expect(getRoot(frag).querySelector('.card-seasons').textContent).toBe('3 seasons');
  });

  it('uses singular "season" for 1 season', () => {
    const frag = buildCardContent(base({ metadata_type: 'film_tv', metadata: { type: 'tv', seasons_watched: 1 } }));
    expect(getRoot(frag).querySelector('.card-seasons').textContent).toBe('1 season');
  });

  it('renders a rating', () => {
    const frag = buildCardContent(base({ metadata_type: 'film_tv', metadata: { rating: 4 } }));
    expect(getRoot(frag).querySelector('.card-rating').textContent).toBe('★★★★☆');
  });

  it('renders director for movie type', () => {
    const frag = buildCardContent(base({
      metadata_type: 'film_tv',
      metadata: { type: 'movie', director: 'Denis Villeneuve' },
    }));
    expect(getRoot(frag).querySelector('.card-director').textContent).toBe('Denis Villeneuve');
  });

  it('renders year for movie type', () => {
    const frag = buildCardContent(base({
      metadata_type: 'film_tv',
      metadata: { type: 'movie', year: 2021 },
    }));
    expect(getRoot(frag).querySelector('.card-year').textContent).toBe('2021');
  });

  it('does not render seasons for movie type', () => {
    const frag = buildCardContent(base({
      metadata_type: 'film_tv',
      metadata: { type: 'movie', seasons_watched: 1 },
    }));
    expect(getRoot(frag).querySelector('.card-seasons')).toBeNull();
  });

  it('renders poster when poster_url is set', () => {
    const frag = buildCardContent(base({
      metadata_type: 'film_tv',
      metadata: { poster_url: 'https://tmdb.example.com/dune.jpg' },
    }));
    const img = getRoot(frag).querySelector('.card-poster');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://tmdb.example.com/dune.jpg');
  });
});

// ── Fitness card ──────────────────────────────────────────────────────────────

describe('fitness card', () => {
  it('renders duration when present', () => {
    const frag = buildCardContent(base({ metadata_type: 'fitness', metadata: { duration: '1h 32m' } }));
    expect(getRoot(frag).querySelector('.card-duration').textContent).toBe('1h 32m');
  });

  it('renders distance in km', () => {
    const frag = buildCardContent(base({ metadata_type: 'fitness', metadata: { distance_km: 42.2 } }));
    expect(getRoot(frag).querySelector('.card-distance').textContent).toBe('42.2 km');
  });

  it('renders elevation gain with + prefix', () => {
    const frag = buildCardContent(base({ metadata_type: 'fitness', metadata: { elevation_gain_m: 420 } }));
    expect(getRoot(frag).querySelector('.card-elevation').textContent).toBe('+420 m');
  });

  it('renders avg heart rate in bpm', () => {
    const frag = buildCardContent(base({ metadata_type: 'fitness', metadata: { avg_heart_rate: 142 } }));
    expect(getRoot(frag).querySelector('.card-heart-rate').textContent).toBe('142 bpm');
  });

  it('renders pace for run activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'run', avg_pace_min_km: 5.5 },
    }));
    expect(getRoot(frag).querySelector('.card-pace').textContent).toBe('5:30 /km');
  });

  it('renders bike for cycle activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'cycle', bike: 'Trek Emonda' },
    }));
    expect(getRoot(frag).querySelector('.card-bike').textContent).toBe('Trek Emonda');
  });

  it('renders trail name for hike activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'hike', trail_name: 'West Highland Way' },
    }));
    expect(getRoot(frag).querySelector('.card-trail').textContent).toBe('West Highland Way');
  });

  it('renders AllTrails link when alltrails_url is set for hike', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'hike', trail_name: 'WHW', alltrails_url: 'https://alltrails.com/trail/whw' },
    }));
    const link = getRoot(frag).querySelector('a.card-alltrails');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://alltrails.com/trail/whw');
  });

  it('renders resort for ski activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'ski', resort: 'Verbier' },
    }));
    expect(getRoot(frag).querySelector('.card-resort').textContent).toBe('Verbier');
  });

  it('renders dive site for scuba activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'scuba', dive_site: 'Blue Hole' },
    }));
    expect(getRoot(frag).querySelector('.card-dive-site').textContent).toBe('Blue Hole');
  });

  it('renders grade for climb activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'climb', grade: '6b' },
    }));
    expect(getRoot(frag).querySelector('.card-grade').textContent).toBe('6b');
  });

  it('renders course name for golf activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'golf', course_name: 'St Andrews Links' },
    }));
    expect(getRoot(frag).querySelector('.card-course').textContent).toBe('St Andrews Links');
  });

  it('renders opponent for squash activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'squash', opponent: 'Alex' },
    }));
    expect(getRoot(frag).querySelector('.card-opponent').textContent).toBe('vs Alex');
  });

  it('renders Garmin link when garmin_activity_url is set', () => {
    const url = 'https://connect.garmin.com/activity/123';
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { garmin_activity_url: url },
    }));
    const link = getRoot(frag).querySelector('a.card-garmin');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(url);
  });

  it('renders without crashing for unknown activity', () => {
    const frag = buildCardContent(base({
      metadata_type: 'fitness',
      metadata: { activity: 'future_sport' },
    }));
    expect(getRoot(frag).classList.contains('card--fitness')).toBe(true);
  });
});

// ── Concert card ──────────────────────────────────────────────────────────────

describe('concert card', () => {
  it('renders main act', () => {
    const frag = buildCardContent(base({
      metadata_type: 'concert',
      metadata: { main_act: 'Arctic Monkeys' },
    }));
    expect(getRoot(frag).querySelector('.card-main-act').textContent).toBe('Arctic Monkeys');
  });

  it('renders opening acts joined by middot', () => {
    const frag = buildCardContent(base({
      metadata_type: 'concert',
      metadata: { opening_acts: ['Fontaines D.C.', 'Wet Leg'] },
    }));
    expect(getRoot(frag).querySelector('.card-opening-acts').textContent).toBe('Fontaines D.C. · Wet Leg');
  });

  it('omits opening acts section when array is empty', () => {
    const frag = buildCardContent(base({
      metadata_type: 'concert',
      metadata: { opening_acts: [] },
    }));
    expect(getRoot(frag).querySelector('.card-opening-acts')).toBeNull();
  });

  it('renders venue label', () => {
    const frag = buildCardContent(base({
      metadata_type: 'concert',
      metadata: { venue: { label: 'Worthy Farm, Somerset' } },
    }));
    expect(getRoot(frag).querySelector('.card-venue').textContent).toBe('Worthy Farm, Somerset');
  });

  it('renders playlist link when playlist_url is set', () => {
    const url = 'https://open.spotify.com/playlist/abc';
    const frag = buildCardContent(base({
      metadata_type: 'concert',
      metadata: { playlist_url: url },
    }));
    const link = getRoot(frag).querySelector('a.card-playlist');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(url);
  });

  it('renders gallery when photos are present', () => {
    const frag = buildCardContent(base({
      metadata_type: 'concert',
      photos: ['https://cdn.com/1.jpg', 'https://cdn.com/2.jpg'],
      metadata: {},
    }));
    const imgs = getRoot(frag).querySelectorAll('.card-gallery img');
    expect(imgs.length).toBe(2);
  });
});

// ── Aggregate card ────────────────────────────────────────────────────────────

describe('aggregate card', () => {
  it('renders the aggregate title with family label and date range', () => {
    const frag = buildCardContent(base({
      type: 'aggregate', title: '3 Books', family_id: 'books', year_month: '2022-08',
      events: [base({ title: 'Dune' }), base({ title: 'Foundation' }), base({ title: 'Neuromancer' })],
    }));
    const title = getRoot(frag).querySelector('.card-title').textContent;
    expect(title).toContain('Books');
    expect(title).toContain('2022');
  });

  it('renders one tappable button per source event', () => {
    const events = [
      base({ id: 'evt-1', title: 'Dune' }),
      base({ id: 'evt-2', title: 'Foundation' }),
    ];
    const frag = buildCardContent(base({ type: 'aggregate', title: '2 Books', family_id: 'books', year_month: '2022-08', events }));
    const buttons = getRoot(frag).querySelectorAll('.cluster-member-item');
    expect(buttons.length).toBe(2);
    expect(buttons[0].dataset.id).toBe('evt-1');
    expect(buttons[1].dataset.id).toBe('evt-2');
  });

  it('renders the formatted month/year in the header', () => {
    const frag = buildCardContent(base({
      type: 'aggregate', title: '2 runs', family_id: 'fitness', year_month: '2023-06', events: [],
    }));
    const text = getRoot(frag).querySelector('.card-title').textContent;
    expect(text).toContain('2023');
    expect(text.toLowerCase()).toContain('june');
  });
});

describe('cluster card', () => {
  it('renders a day-zoom cluster with family and date range', () => {
    const frag = buildClusterCardContent({
      type: 'cluster',
      familyId: 'fitness',
      startDate: '2024-01-01',
      endDate: '2024-01-06',
      count: 5,
      members: [
        base({ id: 'evt-1', title: 'Run 1', date: '2024-01-01' }),
        base({ id: 'evt-2', title: 'Run 2', date: '2024-01-03' }),
      ],
    });
    const title = getRoot(frag).querySelector('.card-title').textContent;
    expect(title).toContain('Fitness');
    expect(title).toContain('2024');
  });

  it('renders tappable member rows with correct data-id', () => {
    const frag = buildClusterCardContent({
      type: 'cluster',
      familyId: 'fitness',
      startDate: '2024-01-01',
      endDate: '2024-01-06',
      members: [
        base({ id: 'evt-a', title: 'Run 1', date: '2024-01-01' }),
        base({ id: 'evt-b', title: 'Run 2', date: '2024-01-03' }),
      ],
    });
    const buttons = getRoot(frag).querySelectorAll('.cluster-member-item');
    expect(buttons.length).toBe(2);
    expect(buttons[0].dataset.id).toBe('evt-a');
    expect(buttons[1].dataset.id).toBe('evt-b');
  });

  it('renders week cluster with family grouping', () => {
    const frag = buildClusterCardContent({
      type: 'week-cluster',
      startDate: '2024-01-01',
      endDate: '2024-01-07',
      members: [
        base({ id: 'evt-1', title: 'Run', family_id: 'fitness', date: '2024-01-01' }),
        base({ id: 'evt-2', title: 'Book', family_id: 'books', date: '2024-01-02' }),
      ],
    });
    const title = getRoot(frag).querySelector('.card-title').textContent;
    expect(title).toContain('Week');
    const buttons = getRoot(frag).querySelectorAll('.cluster-member-item');
    expect(buttons.length).toBe(2);
  });
});
