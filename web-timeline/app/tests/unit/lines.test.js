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
  // The branch departs the spine AT branchY (exactly the event start date)
  // and arrives at the lane at branchY - curveHeight (inward, inside the span).
  // Both branch and merge curves eat into the span interior, so the lane segment
  // is shorter than the spine span by curveHeight at each end.

  it('starts at parentX, branchY (exactly the event start date on the spine)', () => {
    const d = branchBezier(100, 180, 200, 30);
    expect(d).toMatch(/^M 100,200/); // spine connection at actual start date
  });

  it('ends at laneX, branchY - curveHeight (inward, inside the span)', () => {
    const d = branchBezier(100, 180, 200, 30);
    expect(d).toMatch(/180,170$/); // 200 - 30 = 170
  });

  it('departs spine horizontally — CP1 at laneX,branchY; arrives lane vertically — CP2 at laneX,midY', () => {
    // midY = branchY - curveHeight/2 = 200 - 15 = 185
    const d = branchBezier(100, 180, 200, 30);
    expect(d).toContain('180,200'); // CP1: horizontal departure from spine
    expect(d).toContain('180,185'); // CP2: vertical arrival at lane
  });

  it('works when branching left (laneX < parentX)', () => {
    const d = branchBezier(200, 120, 500, 30);
    expect(d).toMatch(/^M 200,500/); // spine connection at actual start date
    expect(d).toMatch(/120,470$/);   // 500 - 30 = 470
  });
});

describe('mergeBezier()', () => {
  // mergeY = the event end date Y (smaller Y = more recent = top of span).
  // The merge departs the lane at mergeY + curveHeight (inward, inside the span)
  // and arrives at the spine AT mergeY — placing the spine connection at the
  // actual event date, mirroring the branch geometry.

  it('starts at laneX, mergeY + curveHeight (inward, inside the span)', () => {
    const d = mergeBezier(180, 100, 400);
    expect(d).toMatch(/^M 180,440/); // 400 + 40 = 440 (default curveHeight = 40)
  });

  it('ends at parentX, mergeY (exactly the event end date on the spine)', () => {
    const d = mergeBezier(180, 100, 400, 30);
    expect(d).toMatch(/100,400$/); // spine connection at actual end date
  });

  it('is the mirror of branchBezier — horizontal departure/arrival at spine, vertical at lane', () => {
    // branch: M(100,200) C(180,200) (180,185) (180,170)
    //   CP1 at laneX,branchY   = (180,200) — horizontal departure from spine
    //   CP2 at laneX,midY      = (180,185) — vertical arrival at lane
    const branch = branchBezier(100, 180, 200, 30);
    // merge: M(180,230) C(180,215) (140,200) (100,200)
    //   CP1 at laneX,cy        = (180,215) — vertical departure from lane (mergeY+ch/2=215)
    //   CP2 at midX,mergeY     = (140,200) — horizontal arrival at spine
    const merge = mergeBezier(180, 100, 200, 30);
    expect(branch).toContain('180,200');
    expect(branch).toContain('180,185');
    expect(merge).toContain('180,215');
    expect(merge).toContain('140,200');
  });
});
