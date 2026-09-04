// Replay — the RTP declaration.
//
// This is not a benchmark. It is the file a human source reviewer opens to check the
// paytable by hand (architecture.md §6.5). Every number here is either derived live from
// `src/game/**` (a full brute-force walk over every ordering of a board, a fold over the
// frozen menu) or, where a derivation would just be recomputing the same closed form a
// second time, compared against the golden values printed by the authoritative
// `specs/enumerate.py` (kitchen, read-only, never imported here — its printed numbers are
// reproduced independently, not copied by reference).
//
// Run `python3 specs/enumerate.py` from the project root to regenerate those golden values
// if this test and the Python ever disagree — the Python is right and this file is wrong.

import { describe, expect, it } from 'vitest';
import { binom, c13, ROW13, skip, take } from '../src/game/pascal';
import { drawRank, unrank, walk } from '../src/game/unrank';
import {
  BOARDS,
  boardMenu,
  cmpFrac,
  eqFrac,
  frac,
  fullMenu,
  FLOOR,
  mulFrac,
  neverBehindCount,
  RTP,
  struckFirstCount,
  toNumber,
  trailedCount,
} from '../src/game/menu';

/** Number of set bits — used only to check `unrank`'s invariant, never shipped. */
function popcount(mask: number): number {
  let n = 0;
  let m = mask;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}

// ---------------------------------------------------------------------------------------
// pascal.ts
// ---------------------------------------------------------------------------------------

describe('pascal.ts — ROW13 and the general binomial', () => {
  it('ROW13 equals C(13,k) from the general stepwise formula, for every k = 0..6', () => {
    // This is the regression check for the exact bug architecture.md §6.1 records: an
    // earlier draft shipped 1716 twice and dropped 1287. binom() is derived independently
    // of ROW13 (a different algorithm — stepwise product vs. a hand-typed table) so this
    // comparison is a real cross-check, not a tautology.
    for (let k = 0; k <= 6; k++) {
      expect(ROW13[k]).toBe(binom(13, k));
    }
    expect(ROW13).toEqual([1, 13, 78, 286, 715, 1287, 1716]);
    expect(ROW13[5]).toBe(1287);
    expect(ROW13[6]).toBe(1716);
  });

  it('c13 uses the symmetry C(13,k) = C(13,13-k) for k = 7..13', () => {
    for (let k = 0; k <= 13; k++) {
      expect(c13(k)).toBe(binom(13, k));
    }
    expect(c13(7)).toBe(c13(6));
    expect(c13(13)).toBe(c13(0));
  });

  it('c13 returns 0 outside [0, 13]', () => {
    expect(c13(-1)).toBe(0);
    expect(c13(-6)).toBe(0);
    expect(c13(14)).toBe(0);
    expect(c13(100)).toBe(0);
  });

  it('binom returns 0 outside [0, n], and 1 at the edges', () => {
    expect(binom(5, -1)).toBe(0);
    expect(binom(5, 6)).toBe(0);
    expect(binom(5, 0)).toBe(1);
    expect(binom(5, 5)).toBe(1);
    expect(binom(0, 0)).toBe(1);
  });

  it('binom(12, l-1) reproduces the STRUCK FIRST seed for every shipped board', () => {
    // C(12,l-1), independently, for the five boards this game actually deals.
    const expected: Record<number, number> = { 6: 792, 5: 495, 4: 220, 3: 66, 2: 12 };
    for (const l of BOARDS) {
      expect(binom(12, l - 1)).toBe(expected[l]);
    }
  });

  it('take/skip are the exact recurrence architecture.md §6.3 states', () => {
    // seed for l=5: C(12,4) = C(13,5)*5/13 = 1287*5/13 = 495
    expect(take(c13(5), 5, 13)).toBe(495);
    // take: C(11,3) = C(12,4)*4/12 = 495*4/12 = 165
    expect(take(495, 4, 12)).toBe(165);
    // skip: C(11,4) = C(12,4)*(12-4)/12 = 495*8/12 = 330
    expect(skip(495, 12, 4)).toBe(330);
  });
});

// ---------------------------------------------------------------------------------------
// unrank.ts
// ---------------------------------------------------------------------------------------

describe('unrank.ts — drawRank', () => {
  it('accepts the first in-range 16-bit window and reduces mod total', () => {
    const word = new Uint8Array(32);
    word[0] = 0x00;
    word[1] = 0x05; // window 0 = 5
    expect(drawRank(word, 1287)).toBe(5);
  });

  it('rejects an out-of-range window and falls through to the next one', () => {
    const total = 3;
    // limit = floor(65536/3)*3 = 65535. Window 0 = 0xFFFF = 65535 -> rejected (not < limit).
    // Window 1 = 0x0002 -> accepted, 2 % 3 = 2.
    const word = new Uint8Array(32);
    word[0] = 0xff;
    word[1] = 0xff;
    word[2] = 0x00;
    word[3] = 0x02;
    expect(drawRank(word, total)).toBe(2);
  });

  it('falls back to 0 when all sixteen windows reject', () => {
    const total = 3; // limit = 65535; only v = 65535 rejects, and it's the max u16 value
    const word = new Uint8Array(32).fill(0xff);
    expect(drawRank(word, total)).toBe(0);
  });

  it('draws a value in [0, total) for a realistic board total', () => {
    const word = new Uint8Array(32);
    for (let i = 0; i < 32; i++) word[i] = (i * 37 + 11) & 0xff;
    const r = drawRank(word, 1287);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1287);
  });
});

describe('unrank.ts — unrank is a bijection (brute force over the full 8-5 board)', () => {
  const l = 5;
  const total = c13(l); // 1287

  it('C(13,5) = 1287 — sanity on the board this test enumerates', () => {
    expect(total).toBe(1287);
  });

  it('every rank in [0, 1287) maps to a mask with popcount === l, and all masks are distinct', () => {
    const seen = new Set<number>();
    for (let r = 0; r < total; r++) {
      const mask = unrank(r, l);
      expect(popcount(mask)).toBe(l);
      expect(mask).toBeGreaterThanOrEqual(0);
      expect(mask).toBeLessThan(1 << 13);
      seen.add(mask);
    }
    expect(seen.size).toBe(total);
  });

  it('rank 0 is the lexicographically-first ordering: the loser scores the first l points', () => {
    expect(unrank(0, l)).toBe(0b0000000011111); // bits 0..4 set
  });

  it('the bijection holds over every shipped board, not just 8-5', () => {
    for (const board of BOARDS) {
      const t = c13(board);
      const seen = new Set<number>();
      for (let r = 0; r < t; r++) {
        const mask = unrank(r, board);
        expect(popcount(mask)).toBe(board);
        seen.add(mask);
      }
      expect(seen.size).toBe(t);
    }
  });
});

describe('unrank.ts — walk', () => {
  it('produces a 13-beat curve, maxDeficit and struckFirst for mask 0 (winner never trails)', () => {
    const w = walk(0);
    expect(w.curve).toHaveLength(13);
    expect(w.curve[0]).toBe(1);
    expect(w.curve[12]).toBe(13);
    expect(w.maxDeficit).toBe(0);
    expect(w.struckFirst).toBe(false);
  });

  it('struckFirst is true iff bit 0 is set', () => {
    expect(walk(0b1).struckFirst).toBe(true);
    expect(walk(0b10).struckFirst).toBe(false);
  });

  it('maxDeficit tracks the deepest the winning side ever trails by', () => {
    // loser scores points 1,2,3 (bits 0,1,2): curve -1,-2,-3, then climbs back.
    const w = walk(0b0000000000111);
    expect(w.curve.slice(0, 3)).toEqual([-1, -2, -3]);
    expect(w.maxDeficit).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------
// menu.ts
// ---------------------------------------------------------------------------------------

describe('menu.ts — exact rational arithmetic', () => {
  it('frac reduces to lowest terms', () => {
    const f = frac(6, 8);
    expect(f.num).toBe(3n);
    expect(f.den).toBe(4n);
  });

  it('mulFrac multiplies and reduces', () => {
    expect(mulFrac(frac(2, 3), frac(3, 4))).toEqual(frac(1, 2));
  });

  it('eqFrac compares by reduced value', () => {
    expect(eqFrac(frac(2, 4), frac(1, 2))).toBe(true);
    expect(eqFrac(frac(1, 3), frac(1, 2))).toBe(false);
  });

  it('cmpFrac orders by cross-multiplication', () => {
    expect(cmpFrac(frac(1, 2), frac(1, 3))).toBe(1);
    expect(cmpFrac(frac(1, 3), frac(1, 2))).toBe(-1);
    expect(cmpFrac(frac(1, 2), frac(2, 4))).toBe(0);
  });

  it('toNumber converts to the nearest double', () => {
    expect(toNumber(frac(97, 100))).toBe(0.97);
    expect(toNumber(RTP)).toBe(0.97);
  });

  it('the closed forms agree with independent binom/c13 calls', () => {
    for (const l of BOARDS) {
      expect(struckFirstCount(l)).toBe(binom(12, l - 1));
      expect(neverBehindCount(l)).toBe(c13(l) - c13(l - 1));
      for (let k = 1; k <= 6; k++) {
        expect(trailedCount(l, k)).toBe(c13(l - k));
      }
    }
    // the l=2 (11-2) board's ladder ends at TWO DOWN — the next rung asks c13(-1), which
    // must be exactly 0 for boardMenu's `count === 0` break to fire (the only board where
    // it does; every other board is cut off by the FLOOR first).
    expect(trailedCount(2, 3)).toBe(0);
  });
});

describe('menu.ts — the frozen 25-row menu', () => {
  const menu = fullMenu();

  it('has exactly 25 rows, distributed 7-6:6, 8-5:6, 9-4:5, 10-3:4, 11-2:4', () => {
    const byBoard = new Map<string, number>();
    for (const l of BOARDS) {
      byBoard.set(`${13 - l}-${l}`, boardMenu(l).length);
    }
    expect(menu).toHaveLength(25);
    expect(Object.fromEntries(byBoard)).toEqual({
      '7-6': 6,
      '8-5': 6,
      '9-4': 5,
      '10-3': 4,
      '11-2': 4,
    });
    expect([...byBoard.values()].reduce((a, b) => a + b, 0)).toBe(25);
  });

  it('has 23 distinct prices out of 25, with 0 collisions WITHIN a board', () => {
    const key = (f: { num: bigint; den: bigint }): string => `${f.num}/${f.den}`;
    const allKeys = menu.map((r) => key(r.payout));
    const distinct = new Set(allKeys);
    expect(distinct.size).toBe(23);
    expect(menu).toHaveLength(25);

    for (const l of BOARDS) {
      const rows = boardMenu(l);
      const boardKeys = rows.map((r) => key(r.payout));
      expect(new Set(boardKeys).size).toBe(boardKeys.length); // 0 within-board collisions
    }
  });

  it('the two expected cross-board repeats are 5.82x and 21.34x, and appear on different boards', () => {
    const key = (f: { num: bigint; den: bigint }): string => `${f.num}/${f.den}`;
    const byPrice = new Map<string, { board: string; prop: string }[]>();
    for (const row of menu) {
      const k = key(row.payout);
      const list = byPrice.get(k) ?? [];
      list.push({ board: row.board, prop: row.prop });
      byPrice.set(k, list);
    }
    const repeats = [...byPrice.entries()].filter(([, rows]) => rows.length > 1);
    expect(repeats).toHaveLength(2);
    const repeatKeys = repeats.map(([k]) => k).sort();
    expect(repeatKeys).toEqual([key(frac(2134, 100)).toString(), key(frac(582, 100)).toString()].sort());
    for (const [, rows] of repeats) {
      const boards = new Set(rows.map((r) => r.board));
      expect(boards.size).toBe(rows.length); // never the same board twice
    }
  });

  it('every listed prop clears the p >= 1% floor, minimum exactly 13/1287 (1.0101...%)', () => {
    let min = menu[0]!.price;
    for (const row of menu) {
      expect(cmpFrac(row.price, FLOOR)).toBeGreaterThanOrEqual(0);
      if (cmpFrac(row.price, min) < 0) min = row.price;
    }
    expect(eqFrac(min, frac(13, 1287))).toBe(true);
    expect(toNumber(min) * 100).toBeCloseTo(1.0101, 4);
  });

  it('maxPayout === 9603/100 exactly (96.03x), and stays under 100x', () => {
    let max = menu[0]!.payout;
    for (const row of menu) if (cmpFrac(row.payout, max) > 0) max = row.payout;
    expect(eqFrac(max, frac(9603, 100))).toBe(true);
    expect(cmpFrac(max, frac(100, 1))).toBeLessThan(0);
  });

  it('minPayout === 291/250 exactly (1.16x)', () => {
    let min = menu[0]!.payout;
    for (const row of menu) if (cmpFrac(row.payout, min) < 0) min = row.payout;
    expect(eqFrac(min, frac(291, 250))).toBe(true);
  });

  it('price * payout === 0.97 exactly, on all 25 pairs', () => {
    for (const row of menu) {
      const product = mulFrac(row.price, row.payout);
      expect(eqFrac(product, RTP)).toBe(true);
      expect(toNumber(product)).toBe(0.97);
    }
  });
});

describe('menu.ts / pascal.ts — board deal distribution', () => {
  it('denominator is 8164 (13-0 and 12-1 excluded, renormalised), with the expected per-board split', () => {
    const weights = BOARDS.map((l) => [l, 2 * c13(l)] as const);
    const denominator = weights.reduce((sum, [, w]) => sum + w, 0);
    expect(denominator).toBe(8164);

    const byBoard = Object.fromEntries(weights.map(([l, w]) => [`${13 - l}-${l}`, w]));
    expect(byBoard).toEqual({
      '7-6': 3432,
      '8-5': 2574,
      '9-4': 1430,
      '10-3': 572,
      '11-2': 156,
    });
  });
});

describe('unrank.ts + menu.ts — 8-5 near-miss cadence and max-deficit histogram', () => {
  const l = 5;
  const total = c13(l); // 1287
  const histogram: Record<number, number> = {};
  for (let r = 0; r < total; r++) {
    const { maxDeficit } = walk(unrank(r, l));
    histogram[maxDeficit] = (histogram[maxDeficit] ?? 0) + 1;
  }

  it('matches the exact max-deficit histogram {0:572, 1:429, 2:208, 3:65, 4:12, 5:1}', () => {
    expect(histogram).toEqual({ 0: 572, 1: 429, 2: 208, 3: 65, 4: 12, 5: 1 });
    const sum = Object.values(histogram).reduce((a, b) => a + b, 0);
    expect(sum).toBe(total);
  });

  it('the curve stops at exactly -3 in 65/1287 = 5.051% of rounds — the near-miss figure', () => {
    const exact3 = histogram[3] ?? 0;
    expect(exact3).toBe(65);
    expect(((exact3 / total) * 100).toFixed(3)).toBe('5.051');
  });

  it('is distinct from "touches -3 or deeper" (78/1287 = 6.061%), which also counts the 13 wins', () => {
    const touch3 = Object.entries(histogram)
      .filter(([k]) => Number(k) >= 3)
      .reduce((sum, [, v]) => sum + v, 0);
    expect(touch3).toBe(78);
    const exact3 = histogram[3] ?? 0;
    expect(touch3 - exact3).toBe(13); // these 13 reach -4 and WIN the FOUR DOWN ticket
  });
});

describe('menu.ts — heavy-tail path', () => {
  it('is NOT triggered: needs mult > 100 AND p < 0.1%; we are 96.03x at p = 1.010%', () => {
    const menu = fullMenu();
    let max = menu[0]!;
    for (const row of menu) if (cmpFrac(row.payout, max.payout) > 0) max = row;

    expect(eqFrac(max.payout, frac(9603, 100))).toBe(true);
    expect(eqFrac(max.price, frac(13, 1287))).toBe(true);

    const overMult = cmpFrac(max.payout, frac(100, 1)) > 0;
    const underProb = cmpFrac(max.price, frac(1, 1000)) < 0;
    expect(overMult).toBe(false); // 96.03x <= 100x
    expect(underProb).toBe(false); // 1.010% >= 0.1%
    expect(overMult && underProb).toBe(false); // heavy-tail path not triggered
  });
});
