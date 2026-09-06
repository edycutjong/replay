/**
 * The renderer — src/render/bulbs.ts. `Field`, `geometry` and `bloomFor` are pure and
 * tested directly against their own contracts (ui.md §2.1-§2.7, quoted in the source).
 * `makeSprites`, `renderCanvas` and `drawSocketField` touch the Canvas 2D API; the jsdom
 * shim in test/setup.ts stands in for a real canvas so these run their real branches
 * without needing a native canvas binding in CI.
 */
import { describe, it, expect } from 'vitest';
import {
  Field, geometry, bloomFor, makeSprites, renderCanvas, lampRegion, drawSocketField, type Geometry,
} from '../src/render/bulbs';

/** App.tsx sizes the canvas backing store to the board itself and then zeroes x0/y0
 *  ("the board now IS the canvas, so it starts at the origin") — `geometry()`'s raw
 *  output centres the board inside a notionally larger viewport instead, which is the
 *  wrong shape to feed a canvas sized to `geo.w x geo.h`: a raw `x0` here places every
 *  lamp off the left edge of a canvas that size, and the render loop's inner body never
 *  executes at all. This mirrors what App.tsx actually does before it renders. */
function boardGeo(cols: number, rows: number, dpr = 1): Geometry {
  const pick = geometry(1024, 640, cols, rows, dpr);
  return { ...pick, x0: 0, y0: 0 };
}

describe('Field', () => {
  it('keeps the brighter lamp when the same cell is written twice', () => {
    const f = new Field(10, 10);
    f.lamp(1, 1, 'amber', 2);
    f.lamp(1, 1, 'amber', 4);
    f.lamp(1, 1, 'amber', 1); // must not dim a d4 head bulb
    expect(f.list()).toEqual([{ c: 1, r: 1, ink: 'amber', duty: 4 }]);
  });

  it('clamps duty to 4 and drops duty <= 0 or out-of-bounds writes', () => {
    const f = new Field(4, 4);
    f.lamp(0, 0, 'amber', 9);
    f.lamp(-1, 0, 'amber', 3);
    f.lamp(0, -1, 'amber', 3);
    f.lamp(4, 0, 'amber', 3);
    f.lamp(0, 4, 'amber', 3);
    f.lamp(1, 1, 'amber', 0);
    expect(f.list()).toEqual([{ c: 0, r: 0, ink: 'amber', duty: 4 }]);
  });

  it('run() draws every `every`-th lamp along an axis', () => {
    const h = new Field(10, 10).run(0, 0, 5, 'h', 'amber', 2);
    expect(h.list().map(l => l.c).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    const stippled = new Field(10, 10).run(0, 0, 6, 'h', 'amber', 2, 2);
    expect(stippled.list().map(l => l.c).sort((a, b) => a - b)).toEqual([0, 2, 4]);
    const v = new Field(10, 10).run(3, 0, 4, 'v', 'amber', 2);
    expect(v.list().map(l => l.r).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('rect() fills a w x h block', () => {
    const f = new Field(10, 10).rect(1, 1, 2, 3, 'amber', 2);
    expect(f.list()).toHaveLength(6);
  });

  it('text() throws on a scale outside {1,4} — TWO scales and only two', () => {
    expect(() => new Field(50, 20).text(0, 0, 'A', 'amber', 2, 2 as 1 | 4)).toThrow(/ui.md §3/);
  });

  it('text() throws on a glyph outside the 45-set, but tolerates spaces', () => {
    const f = new Field(50, 20);
    expect(() => f.text(0, 0, 'A B', 'amber', 2)).not.toThrow();
    expect(() => f.text(0, 0, '@', 'amber', 2)).toThrow(/glyph not in the 45-set/);
  });

  it('renders every glyph in the font without throwing, upper-cased', () => {
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,·/×=+−';
    const f = new Field(400, 20);
    expect(() => f.text(0, 0, glyphs, 'amber', 2)).not.toThrow();
    expect(() => f.text(0, 0, glyphs.toLowerCase(), 'amber', 2)).not.toThrow();
    expect(f.list().length).toBeGreaterThan(0);
  });

  it('textWidth is monotonic in string length and scales with `scale`', () => {
    expect(Field.textWidth('AB')).toBeGreaterThan(Field.textWidth('A'));
    expect(Field.textWidth('A', 4)).toBeGreaterThan(Field.textWidth('A', 1));
    // `Math.max(0, len - 1)` floors an empty string at one glyph cell's width, not zero
    expect(Field.textWidth('')).toBe(5);
    expect(Field.textWidth('A')).toBe(5);
  });

  it('scoreBar and wordmark draw without throwing, and expose their static metrics', () => {
    const f = new Field(300, 40);
    f.scoreBar(0, 0, 'amber', 3);
    f.wordmark(0, 0, 'amber', 3);
    expect(f.list().length).toBeGreaterThan(0);
    expect(Field.scoreBarWidth()).toBe(16);
    expect(Field.wordmarkWidth()).toBeGreaterThan(0);
    expect(Field.glyphH(4)).toBe(28);
  });
});

describe('geometry', () => {
  it('floors pitch at 3 rather than letting a tiny viewport clip the board', () => {
    const g = geometry(10, 10, 256, 152, 1);
    expect(g.pitch).toBe(3);
  });

  it('is exact-integer pitch, scaled by dpr', () => {
    const g1 = geometry(1024, 640, 256, 152, 1);
    const g2 = geometry(1024, 640, 256, 152, 2);
    expect(Number.isInteger(g1.pitch)).toBe(true);
    expect(g2.pitch).toBe(g1.pitch * 2);
  });

  it('centres the board box inside the viewport', () => {
    const g = geometry(1000, 1000, 256, 152, 1);
    expect(g.x0).toBe(Math.round((1000 - g.w) / 2));
    expect(g.y0).toBe(Math.round((1000 - g.h) / 2));
  });
});

describe('bloomFor', () => {
  it('follows the three named bands exactly, ui.md §4.4', () => {
    expect(bloomFor(4)).toBe(1.6);   // dense
    expect(bloomFor(5)).toBe(3.0);   // typical desktop, the band the shipped bug missed
    expect(bloomFor(8)).toBe(3.0);
    expect(bloomFor(9)).toBe(2.0);   // large pitch
  });
});

describe('lampRegion', () => {
  it('pads a lamp-space rectangle by the sprite radius on every side', () => {
    const geo = geometry(1024, 640, 256, 152, 1);
    const sprites = makeSprites(geo);
    const r = lampRegion(geo, sprites, 10, 10, 20, 15);
    const pad = sprites.R + 2;
    expect(r.x).toBe(Math.floor(geo.x0 + 10 * geo.pitch) - pad);
    expect(r.y).toBe(Math.floor(geo.y0 + 10 * geo.pitch) - pad);
    expect(r.w).toBe(Math.ceil(11 * geo.pitch) + pad * 2);
    expect(r.h).toBe(Math.ceil(6 * geo.pitch) + pad * 2);
  });
});

describe('makeSprites', () => {
  it('bakes one sprite per ink+duty, and only the top duty for signal', () => {
    const geo = geometry(1024, 640, 256, 152, 1);
    const sprites = makeSprites(geo);
    for (const ink of ['amber', 'green', 'red'] as const) {
      for (let d = 1; d <= 4; d++) expect(sprites.data[ink + d]).toBeInstanceOf(Uint8ClampedArray);
    }
    expect(sprites.data.signal4).toBeInstanceOf(Uint8ClampedArray);
    expect(sprites.data.signal1).toBeUndefined();
    expect(sprites.data.signal2).toBeUndefined();
    expect(sprites.data.signal3).toBeUndefined();
  });
});

describe('renderCanvas', () => {
  it('draws a field into a 2D context without throwing, full-frame and region-clipped', () => {
    const geo = boardGeo(256, 152);
    const sprites = makeSprites(geo);
    const canvas = document.createElement('canvas');
    canvas.width = geo.w; canvas.height = geo.h;
    const ctx = canvas.getContext('2d')!;
    const f = new Field(256, 152).run(0, 0, 256, 'h', 'amber', 2);
    // 'signal' is only ever baked at duty 4 (bulbs.ts's makeSprites skips the rest — it
    // is the strike bulb, never dimmed) — a lower duty here has no baked sprite to draw,
    // which renderCanvas has to shrug off rather than throw on a missing texture. `lamp()`
    // clamps duty to at most 4 but not up to it, so this really does store duty 2.
    f.lamp(5, 5, 'signal', 4); // baked: renders
    f.lamp(6, 5, 'signal', 2); // unbaked: exercises the miss
    expect(() => renderCanvas(f, ctx, geo, sprites)).not.toThrow();
    const region = lampRegion(geo, sprites, 0, 0, 10, 10);
    expect(() => renderCanvas(f, ctx, geo, sprites, region)).not.toThrow();
  });

  it('is a no-op when the requested region has no positive area', () => {
    const geo = boardGeo(256, 152);
    const sprites = makeSprites(geo);
    const canvas = document.createElement('canvas');
    canvas.width = geo.w; canvas.height = geo.h;
    const ctx = canvas.getContext('2d')!;
    const f = new Field(256, 152).lamp(1, 1, 'amber', 3);
    expect(() => renderCanvas(f, ctx, geo, sprites, { x: 0, y: 0, w: 0, h: 0 })).not.toThrow();
  });

  it('skips lamps whose sprite falls entirely outside the drawn region', () => {
    const geo = boardGeo(256, 152);
    const sprites = makeSprites(geo);
    const canvas = document.createElement('canvas');
    canvas.width = geo.w; canvas.height = geo.h;
    const ctx = canvas.getContext('2d')!;
    // one lamp far outside the tiny region drawn below
    const f = new Field(256, 152).lamp(200, 100, 'amber', 3);
    expect(() => renderCanvas(f, ctx, geo, sprites, { x: 0, y: 0, w: 4, h: 4 })).not.toThrow();
  });
});

describe('drawSocketField', () => {
  it('tiles the socket lattice without throwing', () => {
    const geo = boardGeo(256, 152);
    const canvas = document.createElement('canvas');
    canvas.width = geo.w; canvas.height = geo.h;
    const ctx = canvas.getContext('2d')!;
    expect(() => drawSocketField(ctx, geo)).not.toThrow();
  });

  it('bails out quietly when the host context cannot produce a pattern', () => {
    const geo = boardGeo(256, 152);
    const canvas = document.createElement('canvas');
    canvas.width = geo.w; canvas.height = geo.h;
    const ctx = canvas.getContext('2d')!;
    const original = ctx.createPattern;
    ctx.createPattern = () => null;
    try {
      expect(() => drawSocketField(ctx, geo)).not.toThrow();
    } finally {
      ctx.createPattern = original;
    }
  });
});
