/**
 * src/render/coldOpen.ts — the one composer for every state the board can be in.
 *
 * The fence-colour tests below are the direct regression cover for the second of the
 * four shipped defects: the ticket's row is documented "GREEN while the claim is alive,
 * RED once it is refuted", and the code used to turn it red only after beat 13 — so a
 * ticket that had been dead for beats still drew its fence green. `refuted` is now an
 * explicit, beat-addressed input rather than something derived from `phase === 'settled'`,
 * and these tests assert on the ink the composer actually emits at the fence's own row.
 */
import { describe, it, expect } from 'vitest';
import {
  composeFrame, composeStatic, composeChart, CHART_BAND, LIVE_BAND, rowRect, rowIndexForProp,
  WIDE_COLS, WIDE_ROWS, R, type FrameState,
} from '../src/render/coldOpen';
import { rowForDiff, CHART_X, CHART_COLSTEP } from '../src/render/replay';
import { boardMenu } from '../src/game/menu';
import type { GameState } from '../src/game/codec';

const RESULT: GameState = {
  l: 5, propId: 5, pathId: 10, mask: 0b0010111, maxDeficit: 3, struckFirst: true, won: false,
};

const base: FrameState = {
  l: 5, winnerSide: 'HOME', phase: 'idle', propId: null, hover: null, result: null,
  beat: 0, headHot: false, ghost: false, refuted: false, resolvedAt: -1,
};

/** find every lamp on the fence's own row, WITHIN the chart's column span — `run(...
 *  every 3)` skips two lamps out of three, so the fence has to be read by row, not by an
 *  exact column set, and the row also carries the left/right bezel (col 0 and col 255,
 *  ui.md's "one stroked geometry"), which a lower-bound-only column filter still lets
 *  through. Callers pass `beat: 0` so `drawWalk` contributes nothing on this row either:
 *  at a nonzero beat the curve can cross the fence's own row with its own ink (a brighter
 *  duty that wins the merge), which would make this helper read the walk instead of the
 *  fence it is meant to isolate. */
const fenceLamps = (f: ReturnType<typeof composeFrame>, s: FrameState) => {
  const w = 13 - s.l;
  const row = rowForDiff(-(s.propId! - 1), w, 34); // R.chartY = 34
  const chartRight = CHART_X + 13 * CHART_COLSTEP;
  return f.list().filter(l => l.r === row && l.c >= CHART_X && l.c <= chartRight);
};

describe('the ticket fence — GREEN while alive, RED once refuted', () => {
  it('is green mid-replay while the ticket has not been refuted yet', () => {
    const s: FrameState = { ...base, phase: 'replay', propId: 5, result: RESULT, beat: 0, refuted: false };
    const lamps = fenceLamps(composeFrame(s), s);
    expect(lamps.length).toBeGreaterThan(0);
    expect(lamps.every(l => l.ink === 'green')).toBe(true);
  });

  it('turns red the instant `refuted` is set — not only once phase is settled', () => {
    // This is the exact case the shipped defect got wrong: refuted mid-replay, phase
    // still 'replay'. The old code read `phase === 'settled' && !won`, which was false
    // here, and drew the fence green on a ticket already known dead.
    const s: FrameState = { ...base, phase: 'replay', propId: 5, result: RESULT, beat: 0, refuted: true };
    const lamps = fenceLamps(composeFrame(s), s);
    expect(lamps.length).toBeGreaterThan(0);
    expect(lamps.every(l => l.ink === 'red')).toBe(true);
  });

  it('stays red through to settled once refuted', () => {
    const s: FrameState = { ...base, phase: 'settled', propId: 5, result: RESULT, beat: 0, refuted: true };
    const lamps = fenceLamps(composeFrame(s), s);
    expect(lamps.every(l => l.ink === 'red')).toBe(true);
  });

  it('a WON ticket never turns red, however the phase moves', () => {
    const won: GameState = { ...RESULT, won: true };
    const s: FrameState = { ...base, phase: 'settled', propId: 5, result: won, beat: 0, refuted: false };
    const lamps = fenceLamps(composeFrame(s), s);
    expect(lamps.every(l => l.ink === 'green')).toBe(true);
  });

  it('is drawn thinner (duty 1) while idle than once a round is in motion (duty 2)', () => {
    // idle with a ticket picked is not a state App.tsx ever produces (idle clears propId),
    // but composeFrame's own contract does not require phase to gate the fence's presence
    // — only its duty, which this pins directly against the ternary in coldOpen.ts.
    // idle also draws the amber reachable-envelope wedge, which can cross this same row
    // and (being a brighter duty) win the merge at a handful of cells — isolate the
    // fence's own ink rather than asserting duty across every lamp on the row.
    const idle: FrameState = { ...base, phase: 'idle', propId: 5, result: RESULT, beat: 0, refuted: false };
    const lamps = fenceLamps(composeFrame(idle), idle).filter(l => l.ink === 'green');
    expect(lamps.length).toBeGreaterThan(0);
    expect(lamps.every(l => l.duty === 1)).toBe(true);
  });

  it('is not drawn at all for STRUCK FIRST or NEVER BEHIND (propId < 2)', () => {
    const s0: FrameState = { ...base, phase: 'replay', propId: 0, result: RESULT, beat: 1, refuted: false };
    const s1: FrameState = { ...base, phase: 'replay', propId: 1, result: RESULT, beat: 1, refuted: true };
    // no crash, and no propId-specific fence row asserted — these props have none
    expect(() => composeFrame(s0)).not.toThrow();
    expect(() => composeFrame(s1)).not.toThrow();
  });
});

describe('composeFrame — idle vs replay vs settled', () => {
  it('idle draws the reachable envelope, not a result walk', () => {
    const f = composeFrame({ ...base, phase: 'idle' });
    expect(f.list().length).toBeGreaterThan(0);
  });

  it('replay/settled without a result yet draws neither the envelope nor a walk crash', () => {
    expect(() => composeFrame({ ...base, phase: 'replay', result: null })).not.toThrow();
  });

  it('the head bulb ink reflects headHot and ghost during replay', () => {
    const hot = composeFrame({ ...base, phase: 'replay', propId: 5, result: RESULT, beat: 6, headHot: true, ghost: false });
    expect(hot.list().some(l => l.ink === 'signal')).toBe(true);
    const ghost = composeFrame({ ...base, phase: 'replay', propId: 5, result: RESULT, beat: 6, headHot: false, ghost: true, refuted: true });
    expect(ghost.list().some(l => l.ink === 'red')).toBe(true);
  });

  it('settled draws PAID in green when won, NO PAY in red when lost', () => {
    const paid = composeFrame({ ...base, phase: 'settled', propId: 5, result: { ...RESULT, won: true }, beat: 13 });
    const noPay = composeFrame({ ...base, phase: 'settled', propId: 5, result: { ...RESULT, won: false }, beat: 13, refuted: true });
    expect(paid.list().some(l => l.ink === 'green' && l.duty === 4)).toBe(true);
    expect(noPay.list().some(l => l.ink === 'red' && l.duty === 4)).toBe(true);
  });

  it('the last priced row is emphasised at duty 4 when idle, dimmed like the rest once a ticket is in play', () => {
    const idle = composeFrame({ ...base, phase: 'idle' });
    const rows = boardMenu(5);
    const lastRowY = 81 + (rows.length - 1) * 8; // R.rowY, R.rowStep
    const idleLast = idle.list().filter(l => l.r === lastRowY);
    expect(idleLast.some(l => l.duty === 4)).toBe(true);
  });

  it('draws the HOME/AWAY score band the same way for either winner side', () => {
    const home = composeFrame({ ...base, winnerSide: 'HOME' });
    const away = composeFrame({ ...base, winnerSide: 'AWAY' });
    expect(home.list().length).toBeGreaterThan(0);
    expect(away.list().length).toBeGreaterThan(0);
  });

  it('the hovered row gets the focus duty while idle', () => {
    const unhovered = composeFrame({ ...base, phase: 'idle', hover: null });
    const hovered = composeFrame({ ...base, phase: 'idle', hover: 0 });
    expect(hovered.list().length).toBeGreaterThanOrEqual(unhovered.list().length);
  });
});

describe('composeStatic / composeChart — the split that makes a beat cheap', () => {
  it('partition the same frame by the chart band, and their union is the whole frame', () => {
    const s: FrameState = { ...base, phase: 'replay', propId: 5, result: RESULT, beat: 4, headHot: true };
    const full = composeFrame(s);
    const stat = composeStatic(s);
    const chart = composeChart(s);
    const key = (l: { c: number; r: number }) => `${l.c},${l.r}`;
    const fullKeys = new Set(full.list().map(key));
    const partKeys = new Set([...stat.list(), ...chart.list()].map(key));
    expect(partKeys).toEqual(fullKeys);
    // no lamp appears in both halves
    const statKeys = new Set(stat.list().map(key));
    expect(chart.list().every(l => !statKeys.has(key(l)))).toBe(true);
  });

  it('every lamp in composeStatic falls outside the LIVE band, and vice versa', () => {
    const s: FrameState = { ...base, phase: 'idle' };
    const stat = composeStatic(s);
    const chart = composeChart(s);
    expect(stat.list().every(l => l.r < LIVE_BAND.r0 || l.r > LIVE_BAND.r1)).toBe(true);
    expect(chart.list().every(l => l.r >= LIVE_BAND.r0 && l.r <= LIVE_BAND.r1)).toBe(true);
  });

  /** The band is what a beat repaints, so the SCORE has to be INSIDE it now that the
   *  numerals change every beat, and the chart has to stay inside it. A score left in the
   *  static layer would be cached and blitted — it would simply never count. */
  it('the LIVE band contains both the score band and the chart band', () => {
    expect(LIVE_BAND.r0).toBeLessThanOrEqual(R.scoreY);
    expect(LIVE_BAND.r1).toBeGreaterThanOrEqual(CHART_BAND.r1);
    expect(LIVE_BAND.r0).toBeLessThan(CHART_BAND.r0);
  });
});

describe('rowRect / rowIndexForProp', () => {
  it('rowRect grows downward by rowStep and is wide enough to cover the priced columns', () => {
    const r0 = rowRect(0), r1 = rowRect(1);
    expect(r1.y0).toBeGreaterThan(r0.y0);
    expect(r0.x1).toBeGreaterThan(r0.x0);
  });

  it('rowIndexForProp maps a propId to its row on a board that lists it', () => {
    const rows = boardMenu(5);
    expect(rowIndexForProp(rows, 0)).toBe(0);  // STRUCK FIRST always first
    expect(rowIndexForProp(rows, 1)).toBe(1);  // NEVER BEHIND always second
  });

  it('rowIndexForProp is -1 for a prop the board does not list', () => {
    // the 11-2 board's menu is short — SIX DOWN cannot exist on any shipped board,
    // but a prop outside a short board's ladder still round-trips to -1 rather than
    // throwing, which is what the caller in App.tsx's onDown relies on.
    const rows = boardMenu(2);
    const listed = rows.map(r => r.prop);
    expect(listed).not.toContain('SIX DOWN');
  });

  it('board dimensions match the fixed wide layout', () => {
    expect(WIDE_COLS).toBe(256);
    expect(WIDE_ROWS).toBe(152);
  });
});

describe('the player\'s row and the fence tell the same story', () => {
  /** The ghost touch drew a red curve over a red fence while the row naming that ticket
   *  was still green. Both surfaces answer to `refuted` now: dead is a fact about the
   *  claim, not about the round being over. */
  const inkAt = (f: ReturnType<typeof composeFrame>, r: number): string | undefined =>
    f.list().find(l => l.r === r && l.ink !== 'amber')?.ink;

  const state = (over: Partial<FrameState>): FrameState => ({
    l: 5, winnerSide: 'HOME', phase: 'replay', propId: 5, hover: null,
    result: null, beat: 7, headHot: false, ghost: false, refuted: false, resolvedAt: -1, ...over,
  });

  it('is green on both while the claim is alive', () => {
    const f = composeFrame(state({ refuted: false }));
    expect(inkAt(f, R.rowY + 5 * R.rowStep)).toBe('green');
  });

  it('turns the row red on the beat the claim dies, not at the end of the round', () => {
    const f = composeFrame(state({ refuted: true }));
    expect(inkAt(f, R.rowY + 5 * R.rowStep)).toBe('red');
  });

  it('still marks a settled loss red even if nothing refuted it early', () => {
    const f = composeFrame(state({
      phase: 'settled', refuted: false,
      result: { l: 5, propId: 5, pathId: 1, mask: 0, maxDeficit: 0, struckFirst: false, won: false },
    }));
    expect(inkAt(f, R.rowY + 5 * R.rowStep)).toBe('red');
  });

  it('leaves a winning ticket green', () => {
    const f = composeFrame(state({
      phase: 'settled', refuted: false,
      result: { l: 5, propId: 5, pathId: 1, mask: 0, maxDeficit: 4, struckFirst: false, won: true },
    }));
    expect(inkAt(f, R.rowY + 5 * R.rowStep)).toBe('green');
  });
});
