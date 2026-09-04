import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeGameState, propWon } from '../src/game/codec';
import { unrank, walk } from '../src/game/unrank';
import { c13 } from '../src/game/pascal';

/**
 * DIFFERENTIAL TEST — the Solidity encoder against the TypeScript decoder.
 *
 * fixtures/gamestate.json holds real `newGameState` bytes returned by the deployed
 * ReplayGame contract running on the SDK's local simulator, captured by calling
 * onRandomness (a view) at chosen ranks. These are not hand-written fixtures; if the
 * contract's abi.encode layout and this decoder ever disagree, this fails.
 */
const FIXTURES: Array<{ l: number; prop: number; rank: number; gameState: string }> =
  JSON.parse(readFileSync(new URL('../fixtures/gamestate.json', import.meta.url), 'utf8'));

describe('decodeGameState against real contract output', () => {
  it('has fixtures spanning several boards and props', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(FIXTURES)('board 13-$l prop $prop rank $rank round-trips', (f) => {
    const g = decodeGameState(f.gameState);
    expect(g).not.toBeNull();
    expect(g!.l).toBe(f.l);
    expect(g!.propId).toBe(f.prop);
    // pathId is the rank itself, zero-indexed — there is no +1 anywhere in the codec
    expect(g!.pathId).toBe(f.rank);
  });

  it.each(FIXTURES)('the chain mask agrees with the TS unrank on 13-$l rank $rank', (f) => {
    const g = decodeGameState(f.gameState)!;
    // the client renders what the chain decided; this proves the two agree bit for bit
    expect(g.mask).toBe(unrank(f.rank, f.l));
    const w = walk(g.mask);
    expect(g.maxDeficit).toBe(w.maxDeficit);
    expect(g.struckFirst).toBe(w.struckFirst);
    expect(g.won).toBe(propWon(g.propId, g.maxDeficit, g.struckFirst));
    // popcount of the mask is the loser's points, on every board
    expect([...Array(13).keys()].filter(i => (g.mask >> i) & 1).length).toBe(f.l);
    expect(f.rank).toBeLessThan(c13(f.l));
  });

  it('rejects malformed or truncated state rather than returning junk', () => {
    expect(decodeGameState('0x')).toBeNull();
    expect(decodeGameState('0xdeadbeef')).toBeNull();
    expect(decodeGameState('00'.repeat(7 * 32))).toBeNull();           // l = 0, out of range
    expect(decodeGameState(`0x${'00'.repeat(32 * 6)}`)).toBeNull();    // too few words
    // l in range but propId out of range
    const bad = `0x${(5).toString(16).padStart(64, '0')}${(9).toString(16).padStart(64, '0')}${'00'.repeat(32 * 5)}`;
    expect(decodeGameState(bad)).toBeNull();
  });

  it('returns null rather than throwing on non-hex of the right length', () => {
    // long enough to pass the length check, but BigInt() cannot parse it — this is the
    // path a corrupted or truncated-then-padded snapshot field would take
    expect(decodeGameState(`0x${'zz'.repeat(32 * 7)}`)).toBeNull();
  });

  it('accepts state without the 0x prefix', () => {
    expect(decodeGameState(FIXTURES[0].gameState.slice(2))).not.toBeNull();
  });
});
