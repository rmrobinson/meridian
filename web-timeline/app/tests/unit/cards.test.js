// @vitest-environment happy-dom
/**
 * cards.test.js — Unit tests for buildCardContent().
 *
 * Uses happy-dom for document.createElement.
 * Tests cover type dispatch, shared elements, and type-specific elements.
 */

import { describe, it, expect } from 'vitest';
import { buildCardContent } from '../../js/cards.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function base(overrides = {}) {
  return {
    id:            'evt-test',
    family_id:     'hobbies',
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

function getRoot(frag) {
  // buildCardContent returns a DocumentFragment whose first child is the card div.
  return frag.firstChild;
}

// ── Card type dispatch ────────────────────────────────────────────────────────

describe('card type dispatch', () => {
  it('returns a milestone card for spine events', () => {
    const frag = buildCardContent(base({ family_id: 'spine', metadata: { milestone_type: 'relocation' } }));
    expect(getRoot(frag).classList.contains('card--milestone')).toBe(true);
  });

  it('returns a trip card when external_url is set', () => {
    const frag = buildCardContent(base({ external_url: 'https://example.com' }));
    expect(getRoot(frag).classList.contains('card--trip')).toBe(true);
  });

  it('returns a gallery card when photos are present', () => {
    const frag = buildCardContent(base({ photos: ['https://cdn.com/photo.jpg'] }));
    expect(getRoot(frag).classList.contains('card--gallery')).toBe(true);
  });

  it('returns a book card for books family', () => {
    const frag = buildCardContent(base({ family_id: 'books' }));
    expect(getRoot(frag).classList.contains('card--book')).toBe(true);
  });

  it('returns a show card for tv family', () => {
    const frag = buildCardContent(base({ family_id: 'film_tv' }));
    expect(getRoot(frag).classList.contains('card--tv')).toBe(true);
  });

  it('returns a standard card for all other events', () => {
    const frag = buildCardContent(base({ family_id: 'fitness' }));
    expect(getRoot(frag).classList.contains('card--standard')).toBe(true);
  });

  it('returns an aggregate card for aggregate type', () => {
    const frag = buildCardContent(base({
      type: 'aggregate', title: '3 runs', year_month: '2023-06', events: [],
    }));
    expect(getRoot(frag).classList.contains('card--aggregate')).toBe(true);
  });

  it('spine takes priority over external_url (milestone beats trip)', () => {
    const frag = buildCardContent(base({
      family_id: 'spine', external_url: 'https://example.com',
      metadata: { milestone_type: 'relocation' },
    }));
    expect(getRoot(frag).classList.contains('card--milestone')).toBe(true);
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
      family_id: 'spine',
      metadata: { milestone_type: 'birthday', age: 30 },
    }));
    expect(getRoot(frag).querySelector('.card-icon').textContent).toBe('🎂');
  });

  it('shows age in dates line when metadata.age is set', () => {
    const frag = buildCardContent(base({
      family_id: 'spine',
      date: '2020-04-12',
      metadata: { milestone_type: 'birthday', age: 30 },
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).toContain('Age 30');
  });

  it('omits age from dates line when metadata.age is absent', () => {
    const frag = buildCardContent(base({
      family_id: 'spine',
      metadata: { milestone_type: 'relocation' },
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).not.toContain('Age');
  });

  it('shows fallback star for unknown milestone_type', () => {
    const frag = buildCardContent(base({
      family_id: 'spine',
      metadata: { milestone_type: 'other' },
    }));
    expect(getRoot(frag).querySelector('.card-icon').textContent).toBe('⭐');
  });
});

// ── Trip card ─────────────────────────────────────────────────────────────────

describe('trip card', () => {
  it('renders hero image when hero_image_url is set', () => {
    const frag = buildCardContent(base({
      external_url: 'https://blog.example.com/trip',
      hero_image_url: 'https://cdn.example.com/hero.jpg',
    }));
    const img = getRoot(frag).querySelector('.card-hero');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/hero.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('omits hero image when hero_image_url is absent', () => {
    const frag = buildCardContent(base({ external_url: 'https://example.com', hero_image_url: null }));
    expect(getRoot(frag).querySelector('.card-hero')).toBeNull();
  });

  it('renders read-more link with correct href', () => {
    const url = 'https://blog.example.com/japan-2023';
    const frag = buildCardContent(base({ external_url: url }));
    const link = getRoot(frag).querySelector('.card-read-more');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(url);
  });
});

// ── Gallery card ──────────────────────────────────────────────────────────────

describe('gallery card', () => {
  it('renders one img per photo', () => {
    const photos = ['https://cdn.com/1.jpg', 'https://cdn.com/2.jpg', 'https://cdn.com/3.jpg'];
    const frag = buildCardContent(base({ photos }));
    const imgs = getRoot(frag).querySelectorAll('.card-gallery img');
    expect(imgs.length).toBe(3);
  });

  it('sets loading=lazy on gallery images', () => {
    const frag = buildCardContent(base({ photos: ['https://cdn.com/1.jpg'] }));
    const img = getRoot(frag).querySelector('.card-gallery img');
    expect(img.getAttribute('loading')).toBe('lazy');
  });
});

// ── Book card ─────────────────────────────────────────────────────────────────

describe('book card', () => {
  it('renders the author', () => {
    const frag = buildCardContent(base({
      family_id: 'books',
      metadata: { author: 'Frank Herbert', rating: 5 },
    }));
    expect(getRoot(frag).querySelector('.card-author').textContent).toBe('Frank Herbert');
  });

  it('renders 5 filled stars for a rating of 5', () => {
    const frag = buildCardContent(base({ family_id: 'books', metadata: { rating: 5 } }));
    expect(getRoot(frag).querySelector('.card-rating').textContent).toBe('★★★★★');
  });

  it('renders 3 filled and 2 empty stars for a rating of 3', () => {
    const frag = buildCardContent(base({ family_id: 'books', metadata: { rating: 3 } }));
    expect(getRoot(frag).querySelector('.card-rating').textContent).toBe('★★★☆☆');
  });

  it('renders review excerpt when present', () => {
    const frag = buildCardContent(base({
      family_id: 'books',
      metadata: { review: 'Incredible world-building.' },
    }));
    expect(getRoot(frag).querySelector('.card-review').textContent).toBe('Incredible world-building.');
  });

  it('omits review element when absent', () => {
    const frag = buildCardContent(base({ family_id: 'books', metadata: {} }));
    expect(getRoot(frag).querySelector('.card-review')).toBeNull();
  });
});

// ── Show card ─────────────────────────────────────────────────────────────────

describe('show card', () => {
  it('renders the network', () => {
    const frag = buildCardContent(base({ family_id: 'film_tv', metadata: { network: 'HBO' } }));
    expect(getRoot(frag).querySelector('.card-network').textContent).toBe('HBO');
  });

  it('renders seasons watched', () => {
    const frag = buildCardContent(base({ family_id: 'film_tv', metadata: { seasons_watched: 3 } }));
    expect(getRoot(frag).querySelector('.card-seasons').textContent).toBe('3 seasons');
  });

  it('uses singular "season" for 1 season', () => {
    const frag = buildCardContent(base({ family_id: 'film_tv', metadata: { seasons_watched: 1 } }));
    expect(getRoot(frag).querySelector('.card-seasons').textContent).toBe('1 season');
  });

  it('renders a rating', () => {
    const frag = buildCardContent(base({ family_id: 'film_tv', metadata: { rating: 4 } }));
    expect(getRoot(frag).querySelector('.card-rating').textContent).toBe('★★★★☆');
  });
});

// ── Aggregate card ────────────────────────────────────────────────────────────

describe('aggregate card', () => {
  it('renders the aggregate title', () => {
    const frag = buildCardContent(base({
      type: 'aggregate', title: '3 Books', year_month: '2022-08',
      events: [base({ title: 'Dune' }), base({ title: 'Foundation' }), base({ title: 'Neuromancer' })],
    }));
    expect(getRoot(frag).querySelector('.card-title').textContent).toBe('3 Books');
  });

  it('renders one list item per source event', () => {
    const events = [base({ title: 'Dune' }), base({ title: 'Foundation' })];
    const frag = buildCardContent(base({ type: 'aggregate', title: '2 Books', year_month: '2022-08', events }));
    const items = getRoot(frag).querySelectorAll('.card-aggregate-list li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Dune');
    expect(items[1].textContent).toBe('Foundation');
  });

  it('renders the formatted month/year in dates', () => {
    const frag = buildCardContent(base({
      type: 'aggregate', title: '2 runs', year_month: '2023-06', events: [],
    }));
    const text = getRoot(frag).querySelector('.card-dates').textContent;
    expect(text).toContain('2023');
    expect(text.toLowerCase()).toContain('june');
  });
});
