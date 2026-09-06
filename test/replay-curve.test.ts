/** src/render/replay.ts — the running curve and the walk it draws on the chart band. */
import { describe, it, expect } from 'vitest';
import { Field } from '../src/render/bulbs';
import { curve, rowForDiff, drawWalk, CHART_X, CHART_COLSTEP, CHART_ROWSTEP } from '../src/render/replay';

describe('curve', () => {
  it('is +1 per winner point and -1 per loser point, running', () => {
    // mask bit i set = loser scored point i. Loser scores points 0 and 2, winner point 1.
    const mask = 0b101;
    expect(curve(mask).slice(0, 3)).toEqual([-1, 0, -1]);
  });

  it('is always 13 long', () => {
    expect(curve(0)).toHaveLength(13);
    expect(curve(0b1111111111111)).toHaveLength(13);
  });

  it('a mask of 0 is a clean sweep for the winner', () => {
    expect(curve(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe('rowForDiff', () => {
  it('is anchored to the range so the zero line sits at chartY + w', () => {
    expect(rowForDiff(0, 8, 100)).toBe(100 + 8 * CHART_ROWSTEP);
  });

  it('moves one rowStep per unit of differential', () => {
    expect(rowForDiff(1, 8, 100) - rowForDiff(0, 8, 100)).toBe(-CHART_ROWSTEP);
  });
});

describe('drawWalk', () => {
  const mask = 0b0000010; // loser scores point 1 only (a small early dip)

  it('draws nothing at beat 0', () => {
    const f = new Field(256, 152);
    drawWalk(f, mask, 0, 40, 8);
    expect(f.list()).toHaveLength(0);
  });

  it('the head bulb sits at signal white when headHot, amber d4 otherwise', () => {
    const hot = new Field(256, 152);
    drawWalk(hot, mask, 1, 40, 8, { headHot: true });
    const headLamp = hot.list().find(l => l.duty === 4);
    expect(headLamp?.ink).toBe('signal');

    const cold = new Field(256, 152);
    drawWalk(cold, mask, 1, 40, 8, { headHot: false });
    const coldHead = cold.list().find(l => l.duty === 4);
    expect(coldHead?.ink).toBe('amber');
  });

  it('the ghost touch redraws the whole walk in red', () => {
    const f = new Field(256, 152);
    drawWalk(f, mask, 5, 40, 8, { ghost: true });
    expect(f.list().every(l => l.ink === 'red')).toBe(true);
  });

  it('walks no further than 13 beats even if asked for more', () => {
    const full = new Field(256, 152);
    drawWalk(full, mask, 13, 40, 8);
    const over = new Field(256, 152);
    drawWalk(over, mask, 99, 40, 8);
    // the loop itself is capped at 13 points either way — same columns lit
    expect(over.list().map(l => l.c).sort((a, b) => a - b))
      .toEqual(full.list().map(l => l.c).sort((a, b) => a - b));
  });

  it('the head column advances CHART_COLSTEP lamps per beat from CHART_X', () => {
    const f = new Field(256, 152);
    drawWalk(f, mask, 3, 40, 8);
    const cols = new Set(f.list().map(l => l.c));
    expect(cols.has(CHART_X + 3 * CHART_COLSTEP)).toBe(true);
  });
});
