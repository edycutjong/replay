/**
 * When a ticket stops being an open question, and when a dead one is taunted.
 *
 * This module exists because the logic in it used to live inside `App.tsx`'s `buy()`
 * callback, where the coverage threshold does not reach and no test could address it.
 * That is not a filing detail — it is the whole reason the product shipped with its own
 * hero beat unreachable. `tempo.ts` row 2 (THE GHOST TOUCH) fires on `reTouchesNearMiss`,
 * and the caller never once produced that input for CAME BACK, TWO DOWN, THREE DOWN or
 * FOUR DOWN: across every path of every board (4,082 x 5 boards x 6 props) it fired 0
 * times for the four `k-down` props and only for STRUCK FIRST and NEVER BEHIND.
 *
 * The cause was that the old `resolvedAt` recognised only two ways for a round to end —
 * the claim being PROVED early, or beat 13 arriving — and never the third, which is the
 * one the ghost touch is about: the claim becoming IMPOSSIBLE. NEVER BEHIND worked by
 * accident, because its refutation happens to be an early positive event (the fence
 * breaking) rather than the absence of one.
 *
 * `tempo.ts`'s own docstring names the case it could not produce:
 *   "the hero path - FOUR DOWN, ticket dead on beat 6, curve returning to one point
 *    short on beat 7"
 * `resolveBeat` below returns 5 for that path, and `ghostBeat` returns 6.
 *
 * The unit tests missed it because `tempo-codec.test.ts` passes `reTouchesNearMiss: true`
 * in as a literal: it proves the tempo table is right, and asserts nothing about whether
 * any reachable state produces that row. A pure module is testable against REAL paths,
 * which is what `test/schedule.test.ts` now does by exhaustive sweep.
 */
import { walk } from './unrank';
import { propWon, ticketRow, type PropId } from './codec';
import { beatTempo, TURBO_BEAT_MS } from './tempo';

export const BEATS = 13;

/**
 * How many of the first `i + 1` points the LOSER scored, recovered from the running
 * differential alone: over `i + 1` beats `winner + loser = i + 1` and
 * `winner - loser = d`, so `loser = (i + 1 - d) / 2`.
 */
export function loserPointsBy(i: number, d: number): number {
  return (i + 1 - d) / 2;
}

/**
 * The beat index (0-based) at which the ticket is decided — whichever comes first of
 * the claim being PROVED, the claim becoming IMPOSSIBLE, or the path running out.
 *
 * The elimination test is the part that was missing. After beat `i` the deficit can only
 * deepen while the loser still has points left to score, so the deepest deficit this path
 * can ever reach from here is `max(deficit so far, -d + remaining loser points)` — every
 * remaining loser point arriving back to back. Once that ceiling falls under the row the
 * ticket needs, nothing later in the path can save it and the round is over as a question.
 */
export function resolveBeat(curve: readonly number[], l: number, propId: PropId): number {
  // STRUCK FIRST is settled by the first point and never by distance.
  if (propId === 0) return 0;
  const k = propId - 1; // CAME BACK 1, TWO DOWN 2, THREE DOWN 3, FOUR DOWN 4
  let maxDeficit = 0;
  // Beat 13 always decides it, so it needs no test of its own — see the final return.
  for (let i = 0; i < BEATS - 1; i++) {
    const d = curve[i];
    if (-d > maxDeficit) maxDeficit = -d;
    if (propId === 1) {
      // NEVER BEHIND is the fence at the zero line: one point behind refutes it.
      if (maxDeficit > 0) return i;
      continue;
    }
    if (maxDeficit >= k) return i; // proved
    const reachable = -d + (l - loserPointsBy(i, d));
    if (maxDeficit < k && reachable < k) return i; // impossible: dead here
  }
  return BEATS - 1;
}

/**
 * THE GHOST TOUCH — `ui.md` §6.4 row 2. The first beat AFTER a ticket has been refuted on
 * which the curve comes back within one row of the line it missed. `-1` when the ticket
 * won, or when the curve never returns.
 *
 * This is the cruelty the product is built to deliver, and it is arithmetic rather than
 * staging: on the hero path the curve reaches one point short of FOUR DOWN three separate
 * times, and the third of them lands on a ticket that has already been dead for a beat.
 */
export function ghostBeat(
  curve: readonly number[],
  propId: PropId,
  resolvedAt: number,
  won: boolean,
): number {
  if (won) return -1;
  const row = ticketRow(propId);
  for (let i = resolvedAt + 1; i < BEATS; i++) {
    if (Math.abs(curve[i] - row) <= 1) return i;
  }
  return -1;
}

export interface PlannedBeat {
  /** ms from the start of the replay at which the head strikes (after the pre-hold) */
  at: number;
  /** ms this beat occupies before the next one begins */
  ms: number;
  /** re-draw in red over a dimmed board, in silence */
  ghost: boolean;
  /** |differential - the ticket's row|, the crowd's proximity readout */
  d: number;
  /** the winning side scored this point */
  byWinner: boolean;
  /** this beat is the one that decides the ticket */
  resolves: boolean;
  /** which `beatTempo` row fired, for the tests and the bench */
  row: 1 | 2 | 3 | 4 | 5 | 6;
  /** `Beat.crowd` from the REAL (non-turbo) tempo row, always — turbo overrides `ms`,
   *  `ghost` and `row` for speed, but the crowd is drama, not pacing, and the ghost
   *  touch's silence is not something a sped-up replay should undo. */
  crowd: 0 | 1 | 2;
}

export interface ReplayPlan {
  curve: number[];
  won: boolean;
  resolvedAt: number;
  /** -1 when there is no ghost touch */
  ghostAt: number;
  beats: PlannedBeat[];
  /** ms from the first beat to the last one finishing */
  totalMs: number;
}

/**
 * The whole 13-beat schedule, computed up front from the mask so that tempo is a function
 * of geometry rather than something the animation decides as it goes (`ui.md` §6.4).
 */
export function planReplay(mask: number, l: number, propId: PropId, turbo: boolean): ReplayPlan {
  const { curve, maxDeficit, struckFirst } = walk(mask);
  const won = propWon(propId, maxDeficit, struckFirst);
  const resolvedAt = resolveBeat(curve, l, propId);
  const ghostAt = ghostBeat(curve, propId, resolvedAt, won);
  const row = ticketRow(propId);
  const beats: PlannedBeat[] = [];
  let t = 0;
  for (let i = 0; i < BEATS; i++) {
    const d = Math.abs(curve[i] - row);
    // The real tempo row, computed regardless of turbo — turbo only ever overrides
    // pacing (below). Without this, TURBO_BEAT_MS's synthetic row-6 stand-in had no
    // `crowd` of its own, and the ghost touch's silence existed only in the schedule
    // turbo never uses.
    const tempo = beatTempo({
      d,
      resolvesTicket: i === resolvedAt,
      alreadyResolved: i > resolvedAt,
      reTouchesNearMiss: i === ghostAt,
    });
    const beat = turbo
      ? { ms: TURBO_BEAT_MS, preHoldMs: 0, ghost: false, row: 6 as const }
      : tempo;
    beats.push({
      at: t + beat.preHoldMs,
      ms: beat.ms,
      ghost: beat.ghost,
      d,
      // a SET bit is a point the LOSER scored
      byWinner: ((mask >> i) & 1) === 0,
      resolves: i === resolvedAt,
      row: beat.row,
      crowd: tempo.crowd,
    });
    t += beat.ms;
  }
  return { curve, won, resolvedAt, ghostAt, beats, totalMs: t };
}
