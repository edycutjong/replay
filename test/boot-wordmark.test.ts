/** src/render/boot.ts and src/render/wordmark.ts — the one-time boot handoff. */
import { describe, it, expect } from 'vitest';
import { composeWordmark, BOOT_MS, HANDOFF_MS } from '../src/render/boot';
import { WIDE_COLS, WIDE_ROWS } from '../src/render/coldOpen';
import { Field } from '../src/render/bulbs';
import { WORDMARK_PATHS, WORDMARK_ADV, WORDMARK_CAP, WORDMARK_LAMPS } from '../src/render/wordmark';

describe('composeWordmark', () => {
  it('draws the REPLAY wordmark centred on the wide board, at the requested duty', () => {
    const f = composeWordmark(3);
    expect(f).toBeInstanceOf(Field);
    expect(f.cols).toBe(WIDE_COLS);
    expect(f.rows).toBe(WIDE_ROWS);
    expect(f.list().length).toBeGreaterThan(0);
    expect(f.list().every(l => l.duty === 3 && l.ink === 'amber')).toBe(true);
  });

  it('the handoff budget leaves the whole boot sequence clear before the cold-open budget', () => {
    expect(HANDOFF_MS).toBeLessThanOrEqual(BOOT_MS);
  });
});

describe('wordmark metrics', () => {
  it('exposes exactly two path groups, at their column offsets', () => {
    expect(WORDMARK_PATHS).toHaveLength(2);
    expect(WORDMARK_PATHS[0].x).toBe(0);
    expect(WORDMARK_PATHS[1].x).toBe(144);
  });

  it('every path is non-empty SVG path data', () => {
    for (const p of WORDMARK_PATHS) expect(p.d.length).toBeGreaterThan(0);
  });

  it('the outline aspect and the bulb-lamp aspect match within the documented 1.5%', () => {
    const outlineAspect = WORDMARK_ADV / WORDMARK_CAP;
    const lampAspect = WORDMARK_LAMPS.w / WORDMARK_LAMPS.h;
    expect(Math.abs(outlineAspect - lampAspect) / outlineAspect).toBeLessThan(0.015);
  });
});
