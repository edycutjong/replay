import { describe, it, expect } from 'vitest';
import { beatTempo, TURBO_BEAT_MS } from '../src/game/tempo';
import { PROPS, formatPathId, ticketRow, propWon } from '../src/game/codec';

const base = { d: 9, resolvesTicket: false, alreadyResolved: false, reTouchesNearMiss: false };

describe('beatTempo — rows are evaluated top to bottom, first match wins', () => {
  it('row 1: the resolving beat gets 560ms and a 180ms pre-hold', () => {
    const b = beatTempo({ ...base, resolvesTicket: true });
    expect(b).toMatchObject({ row: 1, ms: 560, preHoldMs: 180 });
  });

  it('row 2: THE GHOST TOUCH — silent, no pre-hold, red re-draw', () => {
    const b = beatTempo({ ...base, alreadyResolved: true, reTouchesNearMiss: true });
    expect(b).toMatchObject({ row: 2, ghost: true, crowd: 0, preHoldMs: 0 });
    expect(b.ms).toBeGreaterThanOrEqual(450);
    expect(b.ms).toBeLessThanOrEqual(560);
  });

  it('THE ORDERING IS THE POINT: a ghost touch must NOT fall through to row 6', () => {
    // Both flags are true on the hero path — the ticket died on beat 6 and the curve
    // came back to one point short on beat 7. If row 6 were checked first that beat
    // would be 90ms, which is not a ghost touch, it is a dropped frame.
    const hero = beatTempo({ d: 1, resolvesTicket: false, alreadyResolved: true, reTouchesNearMiss: true });
    expect(hero.row).toBe(2);
    expect(hero.ms).not.toBe(90);
  });

  it('row 3/4/5: tempo tightens as the curve nears the line', () => {
    expect(beatTempo({ ...base, d: 1 })).toMatchObject({ row: 3, ms: 320, crowd: 2 });
    expect(beatTempo({ ...base, d: 2 })).toMatchObject({ row: 4, ms: 220, crowd: 1 });
    expect(beatTempo({ ...base, d: 3 })).toMatchObject({ row: 5, ms: 150, crowd: 0 });
    expect(beatTempo({ ...base, d: 7 }).row).toBe(5);
  });

  it('row 6: once resolved and not re-touching, do not waste the players time', () => {
    expect(beatTempo({ ...base, d: 4, alreadyResolved: true })).toMatchObject({ row: 6, ms: 90 });
  });

  it('resolving beats a ghost touch when both are somehow true', () => {
    expect(beatTempo({ ...base, resolvesTicket: true, reTouchesNearMiss: true }).row).toBe(1);
  });

  it('turbo is short enough that the genre wraps in seconds', () => {
    expect(TURBO_BEAT_MS).toBeLessThan(90);
    expect(13 * TURBO_BEAT_MS).toBeLessThan(1000);
  });
});

describe('codec', () => {
  it('formatPathId is zero-indexed, four digits, WITH the spaces (ui.md G9)', () => {
    expect(formatPathId(0, 1716)).toBe('PATH 0000 / 1,716');
    expect(formatPathId(10, 1287)).toBe('PATH 0010 / 1,287');
    // the unspaced form is a G9 failure and appears nowhere
    expect(formatPathId(10, 1287)).not.toMatch(/\d\/\d/);
  });

  it('ticketRow puts the reach ladder below the zero line', () => {
    expect(ticketRow(0)).toBe(0);
    expect(ticketRow(1)).toBe(0);
    expect(ticketRow(2)).toBe(-1);
    expect(ticketRow(5)).toBe(-4);
  });

  it('propWon mirrors Replay.sol _won exactly', () => {
    expect(propWon(0, 3, true)).toBe(true);
    expect(propWon(0, 3, false)).toBe(false);
    expect(propWon(1, 0, false)).toBe(true);
    expect(propWon(1, 1, false)).toBe(false);
    expect(propWon(2, 1, false)).toBe(true);
    expect(propWon(5, 4, false)).toBe(true);
    expect(propWon(5, 3, false)).toBe(false);
  });

  it('PROPS is index-aligned with propId', () => {
    expect(PROPS[0]).toBe('STRUCK FIRST');
    expect(PROPS[5]).toBe('FOUR DOWN');
    expect(PROPS).toHaveLength(6);
  });
});
