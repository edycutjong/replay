/**
 * The boot sequence — ui.md §1.4 and §9.2. The art direction's thesis, performed once:
 * a chrome-ramp REPLAY set in a real typeface dissolves over 400ms and leaves the same
 * word standing in bulbs. Chrome is the ONE gradient in the build and this is its only
 * appearance; after the handoff nothing in the product is ever a gradient again.
 *
 * The whole sequence must be clear of the cold-open budget: ui.md G1 gives the posted
 * score, the full priced menu and the multiplier 1,200ms from a cold load.
 */
import { Field } from './bulbs';
import { WIDE_COLS, WIDE_ROWS } from './coldOpen';

export const HANDOFF_MS = 400;
export const BOOT_MS = 700;

export function composeWordmark(duty: number): Field {
  const f = new Field(WIDE_COLS, WIDE_ROWS);
  const w = Field.wordmarkWidth();
  f.wordmark(Math.round((WIDE_COLS - w) / 2), Math.round((WIDE_ROWS - 28) / 2), 'amber', duty);
  return f;
}
