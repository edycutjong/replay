/**
 * The three changes made after the first external review (2026-09-10), tested as
 * BEHAVIOUR rather than as table lookups.
 *
 * That distinction is the whole reason this file exists separately. `tempo-codec.test.ts`
 * already proved the tempo table by passing `reTouchesNearMiss: true` in as a literal —
 * and the product still shipped with its own hero beat unreachable, because no test ever
 * asked whether a real path could produce that input. Every assertion below is driven
 * from a real mask, a real plan or a real composed frame.
 *
 * The review, verbatim, is in `submission/traction.md`; the triage is in
 * `submission/feedback-triage.md`.
 */
import { describe, it, expect } from 'vitest';
import { beatTempo } from '../src/game/tempo';
import { planReplay, BEATS } from '../src/game/schedule';
import { unrank } from '../src/game/unrank';
import { c13 } from '../src/game/pascal';
import { boardMenu } from '../src/game/menu';
import { scoreAfter, CHART_X, CHART_COLSTEP } from '../src/render/replay';
import { composeFrame, rowRect, R, type FrameState } from '../src/render/coldOpen';
import type { GameState, PropId } from '../src/game/codec';

const idle = (l: number): FrameState => ({
  l, winnerSide: 'HOME', phase: 'idle', propId: null, hover: null, result: null,
  beat: 0, headHot: false, ghost: false, refuted: false, resolvedAt: -1,
});

/** lamps inside the SCORE band only — the rows the count-up owns. */
const scoreBand = (s: FrameState): { c: number; r: number; ink: string; duty: number }[] =>
  composeFrame(s).list().filter(l => l.r >= R.scoreY && l.r < R.chartY - 2);
const sig = (s: FrameState): string =>
  scoreBand(s).map(l => `${l.c},${l.r},${l.ink},${l.duty}`).sort().join('|');

describe('F1 — the score counts up to the score that was already posted', () => {
  it('scoreAfter is a running split that always lands on the posted score', () => {
    // every ordering of the 8-5 board, not a sampled few
    const l = 5, w = 13 - l;
    for (let r = 0; r < c13(l); r++) {
      const mask = unrank(r, l);
      for (let i = 0; i <= BEATS; i++) {
        const { winner, loser } = scoreAfter(mask, i);
        expect(winner + loser).toBe(i);          // no point appears twice or goes missing
        expect(winner).toBeGreaterThanOrEqual(0);
        expect(loser).toBeGreaterThanOrEqual(0);
      }
      const end = scoreAfter(mask, BEATS);
      expect(end).toEqual({ winner: w, loser: l }); // the premise arrives, exactly
    }
  });

  it('never goes backwards — a scoreboard only ever counts up', () => {
    const mask = unrank(623, 5);
    for (let i = 1; i <= BEATS; i++) {
      const a = scoreAfter(mask, i - 1), b = scoreAfter(mask, i);
      expect(b.winner).toBeGreaterThanOrEqual(a.winner);
      expect(b.loser).toBeGreaterThanOrEqual(a.loser);
    }
  });

  /** The assertion that fails if the SCORE band is ever put back in the cached static
   *  layer: a cached band cannot change between beats, so beat 0 and beat 13 would match. */
  it('the rendered band actually changes between beats, and lands on the idle score', () => {
    const l = 5;
    const result: GameState = {
      l, propId: 5, pathId: 623, mask: unrank(623, l), maxDeficit: 4, struckFirst: false, won: true,
    };
    const at = (beat: number): FrameState => ({ ...idle(l), phase: 'replay', propId: 5, result, beat });

    expect(sig(at(0))).not.toBe(sig(at(BEATS)));   // it counts
    expect(sig(at(4))).not.toBe(sig(at(9)));       // and keeps counting
    expect(sig(at(BEATS))).toBe(sig(idle(l)));     // and lands on the posted score exactly
  });

  /** The reserved-width fix. On the 11-2 board the winner crosses 9 -> 10 mid-replay; if
   *  the centred band were measured from the RUNNING digits it would re-centre and every
   *  glyph would jump. The band's column extent must not move. */
  it('does not re-centre when a numeral gains a digit', () => {
    const l = 2;
    const result: GameState = {
      l, propId: 2, pathId: 0, mask: unrank(0, l), maxDeficit: 0, struckFirst: false, won: false,
    };
    const extent = (beat: number): [number, number] => {
      const cs = scoreBand({ ...idle(l), phase: 'replay', propId: 2, result, beat }).map(x => x.c);
      return [Math.min(...cs), Math.max(...cs)];
    };
    const wide = extent(BEATS);
    for (let i = 1; i < BEATS; i++) expect(extent(i)).toEqual(wide);
  });
});

describe('F2 — a decided ticket still gets to tell the rest of its story', () => {
  const dead = (d: number): ReturnType<typeof beatTempo> =>
    beatTempo({ d, resolvesTicket: false, alreadyResolved: true, reTouchesNearMiss: false });

  it('damps by proximity instead of flattening to 90ms', () => {
    expect(dead(1).ms).toBeGreaterThan(dead(2).ms);
    expect(dead(2).ms).toBeGreaterThan(dead(9).ms);
    expect(dead(9).ms).toBe(90);                 // the far tail stays fast — no drag
    expect([dead(1).row, dead(2).row, dead(9).row]).toEqual([6, 6, 6]);
  });

  it('stays quieter than the same distance on a live ticket — an echo, not the question', () => {
    const live = (d: number): ReturnType<typeof beatTempo> =>
      beatTempo({ d, resolvesTicket: false, alreadyResolved: false, reTouchesNearMiss: false });
    expect(dead(1).ms).toBeLessThan(live(1).ms);
    expect(dead(1).crowd).toBeLessThan(live(1).crowd);
  });

  it('never outranks the ghost touch, which keeps its silence', () => {
    const ghost = beatTempo({ d: 1, resolvesTicket: false, alreadyResolved: true, reTouchesNearMiss: true });
    expect(ghost.row).toBe(2);
    expect(ghost.ms).toBeGreaterThan(dead(1).ms);
    expect(ghost.crowd).toBe(0);
  });

  /** REACHABILITY, the lesson this file exists for: prove a real losing path actually
   *  gets a slowed post-death beat, rather than proving the table in isolation. */
  it('a real losing path gets a readable beat after its ticket is already dead', () => {
    const l = 5;
    let found = 0;
    for (let r = 0; r < c13(l); r++) {
      const plan = planReplay(unrank(r, l), l, 5 as PropId, false);
      if (plan.won) continue;
      const after = plan.beats.slice(plan.resolvedAt + 1);
      if (after.some(b => b.row === 6 && b.ms > 90)) found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('the round does not drag — a losing round still fits inside a winning one\'s budget', () => {
    const l = 5;
    let worst = 0;
    for (let r = 0; r < c13(l); r++) {
      worst = Math.max(worst, planReplay(unrank(r, l), l, 5 as PropId, false).totalMs);
    }
    expect(worst).toBeLessThan(9000);
  });
});

describe('F2 — the knockout mark says WHERE, not just that it is dead', () => {
  const l = 5, propId = 5 as PropId;
  const result: GameState = {
    l, propId, pathId: 3, mask: unrank(3, l), maxDeficit: 3, struckFirst: false, won: false,
  };
  const frame = (over: Partial<FrameState>): FrameState =>
    ({ ...idle(l), phase: 'replay', propId, result, beat: BEATS, ...over });
  const colOf = (k: number): number => CHART_X + (k + 1) * CHART_COLSTEP;
  const redAt = (s: FrameState, c: number): number =>
    composeFrame(s).list().filter(x => x.c === c && x.ink === 'red').length;

  it('marks the beat the ticket died', () => {
    expect(redAt(frame({ refuted: true, resolvedAt: 4 }), colOf(4))).toBeGreaterThan(0);
  });

  it('is absent while the claim is still alive', () => {
    const alive = redAt(frame({ refuted: false, resolvedAt: 4 }), colOf(4));
    const dead = redAt(frame({ refuted: true, resolvedAt: 4 }), colOf(4));
    expect(dead).toBeGreaterThan(alive);
  });

  it('moves with the beat it marks', () => {
    expect(redAt(frame({ refuted: true, resolvedAt: 2 }), colOf(2)))
      .toBeGreaterThan(redAt(frame({ refuted: true, resolvedAt: 9 }), colOf(2)));
  });
});

describe('F3 — the menu partitions, so a tap cannot buy the wrong ticket', () => {
  it('adjacent rows are contiguous and never overlap', () => {
    for (let i = 0; i + 1 < 6; i++) {
      expect(rowRect(i).y1 + 1).toBe(rowRect(i + 1).y0);
    }
  });

  /** `hitRow` returns the FIRST match, so an overlap is not a near-miss — it silently
   *  resolves to the upper row and spends the stake on a ticket nobody chose. */
  it('every lamp row in the menu span resolves to exactly one row', () => {
    const n = boardMenu(5).length;
    for (let r = rowRect(0).y0; r <= rowRect(n - 1).y1; r++) {
      const hits = [...Array(n).keys()].filter(i => r >= rowRect(i).y0 && r <= rowRect(i).y1);
      expect(hits).toHaveLength(1);
    }
  });

  it('spans the priced columns so the payout is part of the target', () => {
    expect(rowRect(0).x0).toBeLessThan(R.nameX);
    expect(rowRect(0).x1).toBeGreaterThanOrEqual(R.payRight);
  });
});
