import { describe, it, expect } from 'vitest';
import { focusTickHz } from '../src/audio/bindings';
import { fullMenu, boardMenu, toNumber } from '../src/game/menu';

describe('focus tick — pitch IS odds (ui.md §7.2)', () => {
  it('rises monotonically with the multiplier, so scrubbing the menu is a scale', () => {
    const hz = boardMenu(5).map(r => focusTickHz(toNumber(r.payout)));
    const sorted = [...hz].sort((a, b) => a - b);
    const byMult = boardMenu(5)
      .map(r => ({ m: toNumber(r.payout), f: focusTickHz(toNumber(r.payout)) }))
      .sort((a, b) => a.m - b.m)
      .map(x => x.f);
    expect(byMult).toEqual(sorted);
  });

  it('puts the long shot at the top note: 96.03x lands on the 3000Hz ceiling', () => {
    expect(focusTickHz(96.03)).toBeCloseTo(3000, 6);
    expect(focusTickHz(1)).toBeCloseTo(600, 6);
  });

  it('stays inside the audible band for every one of the 25 shipped rows', () => {
    for (const r of fullMenu()) {
      const f = focusTickHz(toNumber(r.payout));
      expect(f).toBeGreaterThanOrEqual(600);
      expect(f).toBeLessThanOrEqual(3000);
    }
  });
});
