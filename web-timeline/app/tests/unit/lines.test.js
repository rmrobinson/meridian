import { describe, it, expect } from 'vitest';
import { timeToY, branchBezier, mergeBezier } from '../../js/lines.js';

// Fixed reference points used across tests.
const BIRTH = '1990-04-12';
const TODAY = '2026-03-21';
const HEIGHT = 51100; // ~2px/day for a ~35-year life

describe('timeToY()', () => {
  it('returns 0 for today', () => {
    const y = timeToY(TODAY, BIRTH, TODAY, HEIGHT);
    expect(y).toBe(0);
  });

  it('returns totalHeight for birth date', () => {
    const y = timeToY(BIRTH, BIRTH, TODAY, HEIGHT);
    expect(y).toBe(HEIGHT);
  });

  it('returns a value between 0 and totalHeight for a mid-range date', () => {
    const y = timeToY('2008-04-12', BIRTH, TODAY, HEIGHT);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(HEIGHT);
  });

  it('is monotonically decreasing — more recent dates produce smaller Y', () => {
    const y2020 = timeToY('2020-01-01', BIRTH, TODAY, HEIGHT);
    const y2010 = timeToY('2010-01-01', BIRTH, TODAY, HEIGHT);
    expect(y2020).toBeLessThan(y2010);
  });

  it('produces a proportionally correct value for a known date', () => {
    // Halfway between birth and today should be approximately HEIGHT/2.
    const birthMs = new Date(BIRTH).getTime();
    const todayMs = new Date(TODAY).getTime();
    const midMs = birthMs + (todayMs - birthMs) / 2;
    const midDate = new Date(midMs).toISOString().slice(0, 10);

    const y = timeToY(midDate, BIRTH, TODAY, HEIGHT);
    // Truncating to an ISO date string loses sub-day precision; at ~2px/day
    // that can be up to 2px off from the true midpoint. Allow ±3px.
    expect(Math.abs(y - HEIGHT / 2)).toBeLessThan(3);
  });

  it('accepts Date objects as well as ISO strings', () => {
    const yString = timeToY('2015-06-01', BIRTH, TODAY, HEIGHT);
    const yDate = timeToY(
      new Date('2015-06-01'),
      new Date(BIRTH),
      new Date(TODAY),
      HEIGHT,
    );
    expect(yDate).toBeCloseTo(yString, 5);
  });

  it('throws when today equals birthDate', () => {
    expect(() => timeToY(BIRTH, BIRTH, BIRTH, HEIGHT)).toThrow();
  });

  it('returns a value greater than totalHeight for a date before birth', () => {
    const y = timeToY('1985-01-01', BIRTH, TODAY, HEIGHT);
    expect(y).toBeGreaterThan(HEIGHT);
  });

  it('returns a negative value for a date after today', () => {
    const y = timeToY('2030-01-01', BIRTH, TODAY, HEIGHT);
    expect(y).toBeLessThan(0);
  });
});

describe('branchBezier()', () => {
  // branchY = the event start date Y (larger Y = older = bottom of span).
  // The branch departs the spine BELOW branchY (at branchY + curveHeight, even older)
  // and arrives at the lane AT branchY — placing the spine connection outside the span.

  it('starts at parentX, branchY + curveHeight (below/older than the event date)', () => {
    const d = branchBezier(100, 180, 200, 30);
    expect(d).toMatch(/^M 100,230/); // 200 + 30 = 230
  });

  it('ends at laneX, branchY (exactly the event start date on the lane)', () => {
    const d = branchBezier(100, 180, 200, 30);
    expect(d).toMatch(/180,200$/);
  });

  it('uses symmetric control points at the midpoint Y (branchY + curveHeight/2)', () => {
    // Control points both at branchY + curveHeight/2 = 200 + 15 = 215
    const d = branchBezier(100, 180, 200, 30);
    expect(d).toContain('100,215');
    expect(d).toContain('180,215');
  });

  it('works when branching left (laneX < parentX)', () => {
    const d = branchBezier(200, 120, 500, 30);
    expect(d).toMatch(/^M 200,530/); // 500 + 30 = 530
    expect(d).toMatch(/120,500$/);
  });
});

describe('mergeBezier()', () => {
  // mergeY = the event end date Y (smaller Y = more recent = top of span).
  // The merge departs the lane AT mergeY and arrives at the spine ABOVE mergeY
  // (at mergeY - curveHeight, even more recent) — placing the spine connection
  // outside (above) the span, mirroring the branch geometry.

  it('starts at laneX, mergeY (exactly the event end date on the lane)', () => {
    const d = mergeBezier(180, 100, 400);
    expect(d).toMatch(/^M 180,400/);
  });

  it('ends at parentX, mergeY - curveHeight (above/more recent than the event date)', () => {
    const d = mergeBezier(180, 100, 400, 30);
    expect(d).toMatch(/100,370$/); // 400 - 30 = 370
  });

  it('is the mirror of branchBezier — same X values, complementary Y midpoints', () => {
    // branch: (100,230)→(180,200), control Y = branchY + curveHeight/2 = 215
    const branch = branchBezier(100, 180, 200, 30);
    // merge: (180,200)→(100,170), control Y = mergeY - curveHeight/2 = 185
    const merge = mergeBezier(180, 100, 200, 30);
    expect(branch).toContain('100,215');
    expect(branch).toContain('180,215');
    expect(merge).toContain('180,185');
    expect(merge).toContain('100,185');
  });
});
