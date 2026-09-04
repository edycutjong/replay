// Replay — the frozen 25-row menu: closed-form counts, exact-rational prices, the p >= 1%
// listing floor. Ported from `specs/enumerate.py`'s `board_menu()` / `menu_rows()` — that
// script is the authority on every count and price here; run it and diff against this
// module's output before ever changing either.
//
// Every price and payout is an exact rational (bigint numerator/denominator, always kept in
// lowest terms) — never a float — so `price * payout === RTP` holds by construction, not by
// rounding luck.

import { binom, c13 } from './pascal';

/** Boards, as loser points `l`. Boards are named `winner-loser`, e.g. l=5 is "8-5". The
 *  13-0 and 12-1 boards (l=0, l=1) are CUT (spec.md §7) — never listed here. */
export const BOARDS: readonly number[] = [6, 5, 4, 3, 2];

/** decision B1, CLOSED 2026-08-27: RTP = 97%, not 0.95. */
export const RTP: Fraction = frac(97, 100);

/** the listing floor: a prop is never shown if its probability falls under 1%. */
export const FLOOR: Fraction = frac(1, 100);

const NAMES: Readonly<Record<number, string>> = {
  1: 'CAME BACK',
  2: 'TWO DOWN',
  3: 'THREE DOWN',
  4: 'FOUR DOWN',
  5: 'FIVE DOWN',
  6: 'SIX DOWN',
};

export interface Fraction {
  readonly num: bigint;
  readonly den: bigint;
}

// Every `Fraction` this module ever constructs has a positive numerator and denominator
// (counts, totals and RTP are all positive integers) — so the Euclidean algorithm never
// needs to handle a negative operand. No abs() branch to leave untested.
function gcd(a: bigint, b: bigint): bigint {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** An exact rational, always returned in lowest terms. */
export function frac(num: number, den: number): Fraction {
  const n = BigInt(num);
  const d = BigInt(den);
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/** Exact fraction multiplication, reduced. */
export function mulFrac(a: Fraction, b: Fraction): Fraction {
  const num = a.num * b.num;
  const den = a.den * b.den;
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** Structural equality — safe because every `Fraction` this module produces is kept reduced. */
export function eqFrac(a: Fraction, b: Fraction): boolean {
  return a.num === b.num && a.den === b.den;
}

/** -1 / 0 / 1, by cross-multiplication — exact, no float division. */
export function cmpFrac(a: Fraction, b: Fraction): number {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}

/** The nearest IEEE-754 double — for display and for the one place the spec asks for a
 *  literal float equality (`price * payout === 0.97`). Never used for menu arithmetic. */
export function toNumber(f: Fraction): number {
  return Number(f.num) / Number(f.den);
}

export interface MenuRow {
  /** e.g. "8-5" */
  board: string;
  /** e.g. "FOUR DOWN" */
  prop: string;
  count: number;
  total: number;
  /** probability of the prop hitting, count/total */
  price: Fraction;
  /** RTP / price */
  payout: Fraction;
}

/** The struck-first count: C(12, l-1) — the LOSER scores point 1. */
export function struckFirstCount(l: number): number {
  return binom(12, l - 1);
}

/** The never-behind count: C(13,l) - C(13,l-1) — the ballot-number closed form. */
export function neverBehindCount(l: number): number {
  return c13(l) - c13(l - 1);
}

/** The trailed-k-or-more count: C(13, l-k) — the reflection-principle closed form. */
export function trailedCount(l: number, k: number): number {
  return c13(l - k);
}

/** The rows one board lists, in printed order: STRUCK FIRST, NEVER BEHIND, then the k-down
 *  ladder until either the count hits 0 or its probability falls under the FLOOR. Mirrors
 *  `specs/enumerate.py`'s `board_menu()` exactly. */
export function boardMenu(l: number): MenuRow[] {
  const total = c13(l);
  const board = `${13 - l}-${l}`;
  const rows: MenuRow[] = [];
  const push = (prop: string, count: number): void => {
    rows.push({
      board,
      prop,
      count,
      total,
      price: frac(count, total),
      payout: mulFrac(RTP, frac(total, count)),
    });
  };
  push('STRUCK FIRST', struckFirstCount(l));
  push('NEVER BEHIND', neverBehindCount(l));
  for (let k = 1; k <= 6; k++) {
    const count = trailedCount(l, k);
    if (count === 0 || cmpFrac(frac(count, total), FLOOR) < 0) break;
    push(NAMES[k], count);
  }
  return rows;
}

/** The frozen 25-row menu across all five shipped boards, in board order (7-6, 8-5, 9-4,
 *  10-3, 11-2 — descending `l`, matching `BOARDS`). */
export function fullMenu(): MenuRow[] {
  return BOARDS.flatMap(boardMenu);
}
