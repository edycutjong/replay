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

// The Euclidean algorithm on ABSOLUTE values. This abs() was once deleted as
// "unreachable — every Fraction here is built from positive counts", which is true of
// this module's own call sites and false of the exported API: BigInt `%` keeps the sign
// of its dividend, so gcd(-3201n, 200n) returns -1n and frac() then yields
// {num: 3201n, den: -200n} — a NEGATIVE DENOMINATOR that silently breaks every
// comparison and formatter downstream. Reachability is a property of the API, not of
// today's callers.
// A function DECLARATION, not a const arrow: `RTP` calls frac() at module-evaluation
// time, which reaches gcd before a const would be initialised (temporal dead zone).
function abs(v: bigint): bigint { return v < 0n ? -v : v; }

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a); b = abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Normalise to lowest terms with the sign carried by the NUMERATOR, never the
 *  denominator — the invariant every other function in this module assumes. */
function norm(n: bigint, d: bigint): Fraction {
  if (d === 0n) throw new Error('Fraction with zero denominator');
  const g = gcd(n, d);
  const sign = d < 0n ? -1n : 1n;
  return { num: (n / g) * sign, den: (d / g) * sign };
}

/** An exact rational, always returned in lowest terms. */
export function frac(num: number, den: number): Fraction {
  return norm(BigInt(num), BigInt(den));
}

/** Exact fraction multiplication, reduced. */
export function mulFrac(a: Fraction, b: Fraction): Fraction {
  return norm(a.num * b.num, a.den * b.den);
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

/**
 * Format an exact Fraction at `dp` decimal places with HALF-UP rounding.
 *
 * Never route a payout through `toNumber()` and `Number.toFixed()`. `THREE DOWN` on the
 * 8-5 board is exactly 3201/200 = 16.005, whose IEEE-754 double is a hair BELOW 16.005,
 * so `toFixed(2)` returns "16.00" and the screen contradicts the paytable. The whole
 * pitch is that these numbers are exact integers you can count; rounding them through a
 * float is the one place that claim can quietly become false.
 */
export function formatFraction(f: Fraction, dp = 2): string {
  const scale = 10n ** BigInt(dp);
  const neg = f.num < 0n;
  const num = neg ? -f.num : f.num;
  // half-up: floor((num*scale*2 + den) / (den*2))
  const scaled = (num * scale * 2n + f.den) / (f.den * 2n);
  const whole = scaled / scale, frac = scaled % scale;
  const body = dp === 0 ? `${whole}` : `${whole}.${frac.toString().padStart(dp, '0')}`;
  return neg ? `-${body}` : body;
}

/** The payout exactly as it must appear on the board: `96.03×`, never `96.0×`. */
export function formatPayout(r: MenuRow): string {
  return `${formatFraction(r.payout, 2)}×`;
}
