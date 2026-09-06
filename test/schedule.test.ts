/**
 * The test that would have caught it.
 *
 * `tempo-codec.test.ts` proves `beatTempo` maps its inputs to the right row, by handing it
 * `reTouchesNearMiss: true` as a literal. Nothing there — or anywhere — asked whether any
 * REACHABLE state produces that input, and the answer for four of the six props was no.
 * These tests address real paths of real boards, and the sweep at the bottom is the one
 * that fails loudly if the ghost touch ever becomes unreachable again.
 */
import { describe, it, expect } from 'vitest';
import { BOARDS } from '../src/game/menu';
import { c13 } from '../src/game/pascal';
import { unrank, walk } from '../src/game/unrank';
import { propWon, ticketRow, type PropId } from '../src/game/codec';
import { BEATS, loserPointsBy, resolveBeat, ghostBeat, planReplay } from '../src/game/schedule';

const PROPS: PropId[] = [0, 1, 2, 3, 4, 5];

/** The hero: the ONLY ordering of the 8-5 board whose curve touches one point short of
 *  FOUR DOWN three separate times. `specs/seed-data.md` §1.3, and deal 3 of the reel. */
const HERO_RANK = 10;
const HERO_L = 5;
const HERO_CURVE = [-1, -2, -3, -2, -3, -2, -3, -2, -1, 0, 1, 2, 3];

describe('the hero path — the beat the product is built to deliver', () => {
  it('is still the unique 8-5 ordering that touches one short of FOUR DOWN three times', () => {
    const found: number[] = [];
    for (let r = 0; r < c13(HERO_L); r++) {
      const { curve, maxDeficit } = walk(unrank(r, HERO_L));
      if (maxDeficit === 3 && curve.filter(d => d === -3).length === 3) found.push(r);
    }
    expect(found).toEqual([HERO_RANK]);
  });

  it('renders the curve the specs quote', () => {
    expect(walk(unrank(HERO_RANK, HERO_L)).curve).toEqual(HERO_CURVE);
  });

  it('kills a FOUR DOWN ticket on beat 6, not at beat 13', () => {
    // beat 6 is index 5: the curve sits at -2 with one loser point left, so the deepest
    // deficit still reachable is 3 and the ticket can never be proved.
    expect(resolveBeat(HERO_CURVE, HERO_L, 5)).toBe(5);
  });

  it('brings the curve back to the line it missed on beat 7, one beat after it died', () => {
    expect(ghostBeat(HERO_CURVE, 5, 5, false)).toBe(6);
  });

  it('gives that beat tempo row 2 — the ghost touch, in silence — and never row 6', () => {
    const plan = planReplay(unrank(HERO_RANK, HERO_L), HERO_L, 5, false);
    expect(plan.won).toBe(false);
    expect(plan.resolvedAt).toBe(5);
    expect(plan.ghostAt).toBe(6);
    expect(plan.beats[6]).toMatchObject({ row: 2, ghost: true, ms: 500, crowd: 0 });
    // 90ms is a dropped frame, not a ghost touch. This is the assertion that fails if the
    // caller ever stops producing the input tempo row 2 exists for.
    expect(plan.beats[6].ms).not.toBe(90);
  });

  it('sounds the ticket dying seven beats before the round ends', () => {
    const plan = planReplay(unrank(HERO_RANK, HERO_L), HERO_L, 5, false);
    const death = plan.beats.findIndex(b => b.resolves);
    expect(death).toBe(5);
    expect(death).toBeLessThan(BEATS - 1);
  });
});

describe('resolveBeat', () => {
  it('settles STRUCK FIRST on the first point, by definition', () => {
    expect(resolveBeat(HERO_CURVE, HERO_L, 0)).toBe(0);
  });

  it('refutes NEVER BEHIND the moment the fence breaks', () => {
    expect(resolveBeat(HERO_CURVE, HERO_L, 1)).toBe(0); // the hero trails from point 1
  });

  it('carries NEVER BEHIND to the last beat when the fence never breaks', () => {
    // Unranking is LEXICOGRAPHIC over the loser's point positions, so rank 0 is the path
    // where the loser scores first, not last — the never-behind paths live at the top of
    // the range. Find one rather than assuming where it sits.
    const clean = walk(unrank(c13(5) - 1, 5)).curve;
    expect(clean.every(d => d >= 0)).toBe(true);
    expect(resolveBeat(clean, 5, 1)).toBe(BEATS - 1);
  });

  it('proves a claim the beat the deficit reaches it', () => {
    // CAME BACK (k=1) is proved by the first point the hero concedes.
    expect(resolveBeat(HERO_CURVE, HERO_L, 2)).toBe(0);
    // THREE DOWN (k=3) is proved when the curve first reaches -3, on beat 3.
    expect(resolveBeat(HERO_CURVE, HERO_L, 4)).toBe(2);
  });

  it('recovers the loser count from the differential alone', () => {
    // after 6 beats at -2: winner 2, loser 4.
    expect(loserPointsBy(5, -2)).toBe(4);
    expect(loserPointsBy(12, 3)).toBe(5);
  });
});

describe('ghostBeat', () => {
  it('is silent on a winning ticket — there is nothing to taunt', () => {
    expect(ghostBeat(HERO_CURVE, 4, 2, true)).toBe(-1);
  });

  it('is silent when the curve never comes back within a row of the line', () => {
    // FOUR DOWN's row is -4; a curve that runs away upward never returns to it.
    const away = [1, 2, 3, 4, 5, 6, 7, 6, 5, 6, 7, 8, 9];
    expect(ticketRow(5)).toBe(-4);
    expect(ghostBeat(away, 5, 0, false)).toBe(-1);
  });
});

describe('planReplay', () => {
  it('collapses every beat to the same tick under TURBO, ghost included', () => {
    const plan = planReplay(unrank(HERO_RANK, HERO_L), HERO_L, 5, true);
    expect(plan.beats.every(b => b.ms === 55 && !b.ghost && b.row === 6)).toBe(true);
    expect(plan.totalMs).toBe(55 * BEATS);
  });

  it('TURBO still carries the real per-beat crowd level, not a flat one — the ghost touch stays silent even sped up', () => {
    // Same hero path, timing collapsed. `row` is uniformly 6 under turbo (see above),
    // but `crowd` is sourced from the real (non-turbo) tempo row regardless, so this
    // sequence matches beat-for-beat what the non-turbo schedule produces for HERO_CURVE.
    const plan = planReplay(unrank(HERO_RANK, HERO_L), HERO_L, 5, true);
    expect(plan.beats.map(b => b.crowd)).toEqual([0, 1, 2, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0]);
    // beat 5 (index 5) is the death of the ticket — still a full crowd 2 swell, turbo or
    // not — and beat 6 (index 6) is the ghost touch it fell to: silent, on schedule.
    expect(plan.beats[5].crowd).toBe(2);
    expect(plan.beats[6].crowd).toBe(0);
  });

  it('marks each beat with the side that scored it', () => {
    const mask = unrank(HERO_RANK, HERO_L);
    const plan = planReplay(mask, HERO_L, 5, false);
    plan.beats.forEach((b, i) => expect(b.byWinner).toBe(((mask >> i) & 1) === 0));
  });

  it('schedules 13 beats whose offsets never run backwards', () => {
    const plan = planReplay(unrank(HERO_RANK, HERO_L), HERO_L, 5, false);
    expect(plan.beats).toHaveLength(BEATS);
    for (let i = 1; i < BEATS; i++) expect(plan.beats[i].at).toBeGreaterThan(plan.beats[i - 1].at);
  });
});

describe('the sweep — every path, every board, every prop', () => {
  it('never resolves a ticket outside the 13 beats, and agrees with propWon', () => {
    for (const l of BOARDS) {
      for (let r = 0; r < c13(l); r++) {
        const { curve, maxDeficit, struckFirst } = walk(unrank(r, l));
        for (const p of PROPS) {
          const at = resolveBeat(curve, l, p);
          expect(at).toBeGreaterThanOrEqual(0);
          expect(at).toBeLessThan(BEATS);
          // whatever the schedule says, the OUTCOME is still the contract's to define
          const won = propWon(p, maxDeficit, struckFirst);
          if (won && p >= 2) {
            // a proved claim resolves exactly when the deficit first reaches its row
            const first = curve.findIndex(d => -d >= p - 1);
            expect(at).toBe(first);
          }
        }
      }
    }
  });

  it('REGRESSION: the ghost touch is reachable for every k-down prop', () => {
    // Before src/game/schedule.ts this count was 0 for CAME BACK, TWO DOWN, THREE DOWN
    // and FOUR DOWN across all 4,082 paths x 5 boards — the product shipped with its own
    // hero beat unreachable, and no test in the suite could see it.
    const fires: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const l of BOARDS) {
      for (let r = 0; r < c13(l); r++) {
        const mask = unrank(r, l);
        for (const p of PROPS) {
          if (planReplay(mask, l, p, false).ghostAt >= 0) fires[p]++;
        }
      }
    }
    for (const p of PROPS) expect(fires[p]).toBeGreaterThan(0);
  });
});
