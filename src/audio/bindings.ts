/**
 * Event bindings — ui.md §7.2. Every event in the game maps to one of the three graphs
 * with different arguments; nothing here adds a voice.
 *
 * The acceptance test (§7.3 / gate G5) is that a full round played with the SCREEN
 * COVERED still tells you (a) which side scored each point, (b) whether your ticket was
 * getting closer or further away, and (c) whether you won, lost, or nearly. Each of
 * those is one binding below, not an extra feature.
 */
import type { Voices } from './voices';

/** The long shot is the top note. Scrubbing the menu is a rising scale, so the paytable
 *  is readable with your ears — pitch IS odds. */
export function focusTickHz(multiplier: number): number {
  return 600 + (2400 * Math.log(Math.max(1, multiplier))) / Math.log(96.03);
}

export const sfx = {
  boot: (v: Voices): void => v.horn([110], 900, 'up'),
  deal: (v: Voices): void => v.relay(520, 90),
  /** the two pitches identify the sides for the rest of the round */
  scoreStrike: (v: Voices, side: 'HOME' | 'AWAY'): void => v.relay(side === 'HOME' ? 1400 : 1180, 140, 0.8),
  /** six ascending ticks = the menu is priced */
  rowLand: (v: Voices, n: number): void => v.relay(900 + 40 * n, 30, 0.35),
  focus: (v: Voices, multiplier: number): void => v.relay(focusTickHz(multiplier), 18, 0.25, 3),
  /** five descending calls, 24ms apart — the bank has dropped, you are committed */
  betLock: (v: Voices): void => {
    [900, 780, 660, 540, 420].forEach((f, i) => setTimeout(() => v.relay(f, 40, 0.5), i * 24));
  },
  /** broadband and granular — paper, not metal */
  ticketTear: (v: Voices): void => v.relay(3000, 60, 0.4, 1.5),
  /** THE replay is a two-note pattern: you can hear a comeback with your eyes shut */
  point: (v: Voices, byWinner: boolean): void => v.relay(byWinner ? 1900 : 1150, 45, 0.55),
  reconcile: (v: Voices): void => v.relay(700, 120, 0.6),
  win: (v: Voices): void => v.horn([220, 277, 330], 700, 'up'),
  /** root, minor second, tritone — sour by construction, not by sample choice */
  loss: (v: Voices): void => v.horn([220, 233, 311], 420, 'down'),
  /** the loss chord with the root bending up a semitone and no release: nearly */
  nearMiss: (v: Voices): void => v.horn([220, 233, 311], 420, 'down', 100),
};
