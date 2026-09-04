/**
 * The gameData / gameState ABI — architecture.md §5.2 and §6.4.
 *
 * `gameState` is the SINGLE SOURCE OF TRUTH for the animation. The contract writes the
 * mask; the client renders it and never recomputes the outcome when a host is present.
 * Recomputing client-side is exactly the defect that capped Overhang under LESSONS R11.
 */
export const PROPS = ['STRUCK FIRST', 'NEVER BEHIND', 'CAME BACK', 'TWO DOWN', 'THREE DOWN', 'FOUR DOWN'] as const;
export type PropId = 0 | 1 | 2 | 3 | 4 | 5;

export interface GameState {
  l: number;
  propId: PropId;
  /** the rank r itself, zero-indexed — renders as `PATH 0010 / 1287`, no +1 anywhere */
  pathId: number;
  /** 13-bit mask; a set bit is a point the LOSER scored */
  mask: number;
  maxDeficit: number;
  struckFirst: boolean;
  won: boolean;
}

/** `PATH {ID} / {N}` — ui.md §12 meta.path. WITH the spaces; the unspaced form is a G9
 *  failure. {ID} is zero-padded to four digits and the range is 0000…N-1. */
export function formatPathId(pathId: number, total: number): string {
  return `PATH ${String(pathId).padStart(4, '0')} / ${total.toLocaleString('en-US')}`;
}

/** Which row of the board the ticket sits on, for the tempo's `d`. */
export function ticketRow(propId: PropId): number {
  if (propId === 0) return 0;      // STRUCK FIRST resolves on beat 1, never by distance
  if (propId === 1) return 0;      // NEVER BEHIND is the fence at the zero line
  return -(propId - 1);            // CAME BACK -1, TWO DOWN -2, THREE DOWN -3, FOUR DOWN -4
}

/** Does this prop win on the realised path? Mirrors `_won` in Replay.sol exactly. */
export function propWon(propId: PropId, maxDeficit: number, struckFirst: boolean): boolean {
  if (propId === 0) return struckFirst;
  if (propId === 1) return maxDeficit === 0;
  return maxDeficit >= propId - 1;
}
