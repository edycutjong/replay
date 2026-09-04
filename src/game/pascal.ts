// Replay — Pascal's triangle for N = 13.
//
// ROW13 is the ONLY numeric constant the contract carries (architecture.md §6.1); every
// count, price and rank/mask below derives from it plus the two exact integer recurrences
// described in architecture.md §6.3. C(13,5) = 1287, NOT 1716 — an earlier draft of
// complexity.md §2.1 shipped this row with `1716` repeated and `1287` dropped, and that
// exact regression is what the coverage-complete test file re-derives ROW13 against (the
// standard multiplicative binomial formula) to catch again.

/** C(13, k) for k = 0..6 — the seven-entry row architecture.md §6.1 calls "the only numeric
 *  constant in the contract". */
export const ROW13: readonly number[] = [1, 13, 78, 286, 715, 1287, 1716];

/** C(13, k) for any integer k, via ROW13 and the symmetry C(13,k) = C(13,13-k). Returns 0
 *  outside [0, 13] — menu.ts's trailed-k formula relies on exactly this (e.g. the 11-2
 *  board's TWO DOWN rung is the last one listed, so its next rung asks for C(13,-1)). */
export function c13(k: number): number {
  if (k < 0 || k > 13) return 0;
  const j = k <= 6 ? k : 13 - k;
  return ROW13[j];
}

/** General C(n, k) for 0 <= n <= 13, via the standard exact stepwise product: each partial
 *  product C(n, i+1) = C(n, i) * (n-i) / (i+1) is an integer by construction (a well-known
 *  property of binomial coefficients — the running product is always divisible by i+1).
 *  Used for C(12, l-1), the STRUCK FIRST count, which sits one row off ROW13. Returns 0
 *  outside [0, n]. */
export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) {
    c = (c * (n - i)) / (i + 1);
  }
  return c;
}

/** The exact multiply-then-divide recurrence architecture.md §6.3 uses to walk a binomial
 *  coefficient C(m, k) down to its "take" neighbour C(m-1, k-1) — the count assigned when
 *  the loser scores the current point. `unrank.ts` mirrors the Solidity `_unrank`'s
 *  `c = c * k / m` step with this. The division is exact by construction. */
export function take(c: number, k: number, m: number): number {
  return (c * k) / m;
}

/** The other half of the same recurrence: walks C(m, k) down to its "skip" neighbour
 *  C(m-1, k) — the count assigned when the current point is NOT the loser's. Mirrors the
 *  Solidity `_unrank`'s `c = c * (m - k) / m` step. Exact by construction. */
export function skip(c: number, m: number, k: number): number {
  return (c * (m - k)) / m;
}
