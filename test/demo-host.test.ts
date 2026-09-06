/**
 * The standalone entropy source — src/bridge/demoHost.ts. This is the module the four
 * shipped defects doc points at directly: the meta readout's provenance string used to
 * be a hardcoded literal while every board and path actually came from
 * crypto.getRandomValues. A seeded reel is only trustworthy if it is reproducible; a
 * CSPRNG reel is only trustworthy if it is NOT. Both properties are asserted here
 * against the real functions, not against a description of them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  reelEntropy, csprngEntropy, dealBoard, settleLocally, isEmbedded, REEL_SEED,
} from '../src/bridge/demoHost';
import { c13 } from '../src/game/pascal';
import { unrank, walk } from '../src/game/unrank';
import { propWon, type PropId } from '../src/game/codec';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reelEntropy — the seeded reel', () => {
  it('is labelled SEEDED KECCAK', () => {
    expect(reelEntropy().label).toBe('SEEDED KECCAK');
  });

  it('is deterministic: the same (purpose, n) yields identical bytes across separate calls', () => {
    const a = reelEntropy();
    const b = reelEntropy();
    expect(a.bytes('deal', 0)).toEqual(b.bytes('deal', 0));
    expect(a.bytes('path', 7)).toEqual(b.bytes('path', 7));
    // and within one instance, calling twice for the same address is not a stream read
    expect(a.bytes('deal', 3)).toEqual(a.bytes('deal', 3));
  });

  it('addresses by position — passing a deal does not desync a later position', () => {
    const src = reelEntropy();
    const direct = src.bytes('deal', 4);
    // "read" positions 0..3 first; position 4 must come back identical regardless
    for (let n = 0; n < 4; n++) src.bytes('deal', n);
    expect(src.bytes('deal', 4)).toEqual(direct);
  });

  it('gives different bytes for different purposes and different n', () => {
    const src = reelEntropy();
    expect(src.bytes('deal', 0)).not.toEqual(src.bytes('path', 0));
    expect(src.bytes('deal', 0)).not.toEqual(src.bytes('deal', 1));
  });

  it('is 32 bytes', () => {
    expect(reelEntropy().bytes('deal', 0)).toHaveLength(32);
  });

  it('a different seed produces a different reel', () => {
    const alt = reelEntropy('0x00000000000000000000000000000000000000000000000000000000000001');
    expect(alt.bytes('deal', 0)).not.toEqual(reelEntropy().bytes('deal', 0));
  });

  it('defaults to the published REEL_SEED', () => {
    expect(reelEntropy().bytes('deal', 0)).toEqual(reelEntropy(REEL_SEED).bytes('deal', 0));
  });
});

describe('csprngEntropy — the escape hatch', () => {
  it('is labelled BROWSER CSPRNG', () => {
    expect(csprngEntropy().label).toBe('BROWSER CSPRNG');
  });

  it('differs run to run — it is not a second seeded reel', () => {
    const a = csprngEntropy().bytes('deal', 0);
    const b = csprngEntropy().bytes('deal', 0);
    expect(a).not.toEqual(b);
  });

  it('draws from crypto.getRandomValues, never Math.random', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    csprngEntropy().bytes('deal', 0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(32);
  });
});

describe('dealBoard', () => {
  it('deal 0 of the published reel is the 8-5 board with winner HOME', () => {
    // the cold-open fixture, the screenshot and the video are all pinned to this exact
    // board — App.tsx reads it from the reel rather than hardcoding it for this reason.
    const { l, winnerSide } = dealBoard(reelEntropy(), 0);
    expect(l).toBe(5);
    expect(winnerSide).toBe('HOME');
  });

  it('only ever deals the five shipped boards', () => {
    const src = reelEntropy();
    for (let n = 0; n < 64; n++) {
      const { l } = dealBoard(src, n);
      expect([6, 5, 4, 3, 2]).toContain(l);
    }
  });

  it('is a pure function of (src, n) — same inputs, same board', () => {
    const src = reelEntropy();
    expect(dealBoard(src, 9)).toEqual(dealBoard(src, 9));
  });
});

describe('settleLocally', () => {
  const PROPS: PropId[] = [0, 1, 2, 3, 4, 5];

  it('is a pure function of (l, propId, src, n)', () => {
    const src = reelEntropy();
    for (const propId of PROPS) {
      expect(settleLocally(5, propId, src, 3)).toEqual(settleLocally(5, propId, src, 3));
    }
  });

  it('agrees with the TS unrank/walk pipeline it is built from', () => {
    const src = reelEntropy();
    const total = c13(5);
    const result = settleLocally(5, 2, src, 3);
    expect(result.pathId).toBeGreaterThanOrEqual(0);
    expect(result.pathId).toBeLessThan(total);
    const { maxDeficit, struckFirst } = walk(unrank(result.pathId, 5));
    expect(result.maxDeficit).toBe(maxDeficit);
    expect(result.struckFirst).toBe(struckFirst);
    expect(result.won).toBe(propWon(2, maxDeficit, struckFirst));
  });

  it('only propId and outcome vary across props on the same deal — l and pathId hold steady', () => {
    const src = reelEntropy();
    const results = PROPS.map(p => settleLocally(5, p, src, 3));
    expect(new Set(results.map(r => r.l)).size).toBe(1);
    expect(new Set(results.map(r => r.pathId)).size).toBe(1);
  });
});

describe('isEmbedded', () => {
  it('is false at the top of the window (this test environment)', () => {
    expect(isEmbedded()).toBe(false);
  });

  it('reports embedded when window.top access throws (cross-origin iframe)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', {
      configurable: true,
      get() { throw new Error('cross-origin'); },
    });
    try {
      expect(isEmbedded()).toBe(true);
    } finally {
      if (original) Object.defineProperty(window, 'top', original);
    }
  });
});
