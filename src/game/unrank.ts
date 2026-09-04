// Replay — settlement math: bytes32 -> rank -> path mask -> lead curve.
// Mirrors the Solidity `_drawRank` / `_unrank` / `_walk` in architecture.md §6.3 / §7.2.
// The TypeScript copy exists ONLY for standalone demo mode (architecture.md §6.4) — when a
// host is present the chain writes the mask and the client only ever renders it.

import { c13, skip, take } from './pascal';

const N = 13;

/** A 32-byte word (e.g. the session's VRF `bytes32`) -> a uniform rank in [0, total), by
 *  16-bit-window rejection sampling (architecture.md §7.2). `byte % n` is forbidden bias;
 *  the generic rule is `limit = floor(65536/total)*total`, reject any window >= limit, else
 *  `% total`. All sixteen windows rejecting is the documented ~1.32e-28 fallback, at which
 *  point this returns 0 rather than looping forever or re-hashing. */
export function drawRank(randomness: Uint8Array, total: number): number {
  const limit = Math.floor(65536 / total) * total;
  for (let w = 0; w < 16; w++) {
    const v = (randomness[2 * w] << 8) | randomness[2 * w + 1];
    if (v < limit) return v % total;
  }
  return 0;
}

/** r in [0, C(13,l)) -> a 13-bit mask, bit i set iff the board's `l`-point side (the
 *  LOSER — boards are named `winner-loser`, e.g. 8-5 means l=5) scored point i.
 *
 *  Combinatorial-number-system unranking in lexicographic order: exactly uniform BY
 *  CONSTRUCTION (one rejection loop upstream in `drawRank`, no per-swap retry the way
 *  Fisher-Yates needs — that shuffle is on the cut list, architecture.md §6.3). This walks
 *  the same seed + take/skip recurrence as the Solidity `_unrank`, rather than recomputing
 *  a binomial coefficient from scratch at every one of the 13 steps. */
export function unrank(r: number, l: number): number {
  let mask = 0;
  let rem = l;
  let c = take(c13(l), l, N); // seed: C(12, l-1) = C(13,l)*l/13, the STRUCK FIRST count
  let m = N - 1;
  let k = l - 1;
  for (let i = 0; i < N; i++) {
    if (r < c) {
      mask |= 1 << i;
      rem--;
      if (rem === 0) break;
      c = take(c, k, m);
      k--;
      m--;
    } else {
      r -= c;
      c = skip(c, m, k);
      m--;
    }
  }
  return mask;
}

export interface Walk {
  /** running deficit after each of the 13 beats: positive n means the winning side is down
   *  by n at that point; the array is exactly 13 long, one entry per beat. */
  curve: number[];
  /** the largest deficit the curve ever reaches. */
  maxDeficit: number;
  /** true iff the loser scored point 1 — the loser struck first. */
  struckFirst: boolean;
}

/** One O(13) pass over a path mask (bit i set = the loser scored point i) producing the
 *  running lead curve and the two statistics the whole menu is built from. Mirrors the
 *  Solidity `_walk`. */
export function walk(mask: number): Walk {
  let d = 0;
  let maxDeficit = 0;
  const curve: number[] = [];
  for (let i = 0; i < N; i++) {
    d += (mask >> i) & 1 ? -1 : 1;
    if (d < 0 && -d > maxDeficit) maxDeficit = -d;
    curve.push(d);
  }
  return { curve, maxDeficit, struckFirst: (mask & 1) !== 0 };
}
