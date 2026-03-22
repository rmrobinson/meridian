import { describe, it, expect } from 'vitest';
import { generateBirthdays, normalize } from '../../js/api.js';

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
