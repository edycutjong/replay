/**
 * Beat tempo — ui.md §6.4. Even pacing across 13 beats is the named failure mode
 * (winners.md §3.3), so duration is a function of `d = |differential - ticket row|`,
 * recomputed every beat. Rows are evaluated top to bottom; the FIRST MATCH WINS.
 *
 * Row 2 is the product's hero beat and is why the ordering matters. Without it the hero
 * path — FOUR DOWN, ticket dead on beat 6, curve returning to one point short on beat 7 —
 * falls through to row 6 and gets 90ms. A 90ms ghost touch is not a ghost touch, it is a
 * dropped frame, and the whole Fun argument for that deal rests on it.
 */
export interface BeatInput {
  /** |running differential - the ticket's row| */
  d: number;
  /** this beat decides the ticket */
  resolvesTicket: boolean;
  /** the ticket was already decided on an earlier beat */
  alreadyResolved: boolean;
  /** already resolved AND this beat re-touches the row it missed */
  reTouchesNearMiss: boolean;
}

export interface Beat {
  /** total beat duration in ms */
  ms: number;
  /** ms of stillness before the head moves — the dopamine gap, derived from geometry */
  preHoldMs: number;
  /** crowd swell level, 0 = silent */
  crowd: 0 | 1 | 2;
  /** the ghost touch re-draws in red over a dimmed board, in silence */
  ghost: boolean;
  /** which tempo row fired, for the tests and the bench */
  row: 1 | 2 | 3 | 4 | 5 | 6;
}

export function beatTempo(i: BeatInput): Beat {
  // 1 — this beat resolves the ticket
  if (i.resolvesTicket) return { ms: 560, preHoldMs: 180, crowd: 2, ghost: false, row: 1 };
  // 2 — THE GHOST TOUCH. No crowd, no swell, no pre-hold, no new sound: the silence is
  //     the point. Must precede row 6 or the hero beat is lost.
  if (i.reTouchesNearMiss) return { ms: 500, preHoldMs: 0, crowd: 0, ghost: true, row: 2 };
  // 6 — AFTER THE TICKET IS DECIDED. The round has stopped being a QUESTION but it is
  //     still the STORY, and a flat 90ms told that story as a blur: a ticket dead on
  //     beat 3 played beats 4-13 in ~900ms of forced silence. The first external review
  //     (2026-09-10) read exactly that and called it "the line dies and the round just
  //     stops... I never get the 'ohh, so close' feeling".
  //
  //     The fix is NOT a new rule. This module's thesis is that duration is a function
  //     of `d`, recomputed every beat, and the flat row 6 was the one place that stopped
  //     being true. Row 6 is now the same proximity curve as rows 3/4/5, DAMPED: a curve
  //     that comes back near the row it missed gets room to be seen, the far tail stays
  //     at 90ms so the round does not drag, and the crowd stays a step under the live
  //     rows because this is an echo of a decided question, not the question itself.
  //
  //     Row 2 still precedes this, so the ghost touch keeps its 500ms of silence and is
  //     never merely the loudest of these.
  if (i.alreadyResolved) {
    if (i.d === 1) return { ms: 260, preHoldMs: 0, crowd: 1, ghost: false, row: 6 };
    if (i.d === 2) return { ms: 170, preHoldMs: 0, crowd: 0, ghost: false, row: 6 };
    return { ms: 90, preHoldMs: 0, crowd: 0, ghost: false, row: 6 };
  }
  // 3/4/5 — proximity to the line
  if (i.d === 1) return { ms: 320, preHoldMs: 0, crowd: 2, ghost: false, row: 3 };
  if (i.d === 2) return { ms: 220, preHoldMs: 0, crowd: 1, ghost: false, row: 4 };
  return { ms: 150, preHoldMs: 0, crowd: 0, ghost: false, row: 5 };
}

/** Turbo collapses every beat to a fixed short tick — Tumbler ships 0.3s turbo and the
 *  genre wraps in seconds, so this is P0, not a stretch. */
export const TURBO_BEAT_MS = 55;
