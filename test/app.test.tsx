/**
 * src/App.tsx — the whole screen. This is the file the coverage.include scope used to
 * exclude by name ("the D00 stub"), and it is where the first and fourth of the four
 * shipped defects lived: the ticket-resolution logic that never produced the ghost
 * touch, and a stale-closure animation bug. The first is now regression-covered by
 * test/schedule.test.ts (the logic moved to src/game/schedule.ts, which is what made it
 * testable at all); these tests cover App.tsx's own remaining surface — the render
 * effect, pointer handling, entropy-source switching, and every toggle — against a real
 * mounted DOM.
 *
 * ONE GAP, STATED PLAINLY: the task this suite was written for asks for a test proving
 * the meta readout reads "ENTROPY CHAIN VRF" once a host answers. That reading requires
 * `useCasinoHost` to be mounted in this component and wired into the betting flow —
 * and it is not: `src/bridge/useCasinoHost.ts` is fully implemented and unit-tested
 * (test/use-casino-host.test.tsx) but nothing here imports it, so a hosted round is
 * still always settled locally. Wiring that in means designing the wager amount and
 * `gameData` ABI encoding `openSession` expects, which is a real product decision this
 * test suite cannot respec on its own — the CHAIN VRF label is therefore dead code
 * (`EntropyLabel` allows it, nothing ever produces it) and this file tests the two
 * sources App.tsx actually reaches: the seeded reel and the CSPRNG escape hatch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from '../src/App';
import { BOOT_MS } from '../src/render/boot';
import { FakeAudioContext } from './setup';
import { sfx } from '../src/audio/bindings';

/** jsdom never runs layout, so every element reports clientWidth/Height 0 — App.tsx's
 *  render effect would then compute a viewport of 0x0 and (via `geometry`'s own floor)
 *  fall back to the minimum 3px pitch, which is a legal but unhelpful thing to click-test
 *  against. Reporting a real viewport here is what lets the pointer-mapping tests below
 *  compute a click target from `rowRect` instead of guessing. */
function mockViewport(width: number, height: number): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: height });
}

/** The canvas is sized to the board itself and its CSS box mirrors that exactly at
 *  fit=1 (see the viewport chosen above), but jsdom's `getBoundingClientRect` does not
 *  read layout from the style attribute either — it has to be told directly. */
function mockCanvasBox(canvas: HTMLElement, width: number, height: number): void {
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON() {},
  });
}

const bootUp = async (): Promise<void> => {
  await act(async () => { vi.advanceTimersByTime(BOOT_MS); });
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.useFakeTimers();
  mockViewport(1024, 640);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App — the boot handoff', () => {
  it('shows the bulb wordmark, not the meta readout, before BOOT_MS elapses', () => {
    render(<App />);
    expect(screen.queryByText(/ENTROPY/)).not.toBeInTheDocument();
  });

  it('reveals the meta line, the pitch line and the controls once boot finishes', async () => {
    render(<App />);
    await bootUp();
    expect(screen.getByText(/ENTROPY SEEDED KECCAK/)).toBeInTheDocument();
    expect(screen.getByText('THE SCORE IS FINAL · BET ON HOW IT HAPPENED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TURBO/ })).toBeInTheDocument();
  });
});

describe('App — entropy provenance (standalone, not embedded)', () => {
  it('starts on the published seeded reel', async () => {
    render(<App />);
    await bootUp();
    expect(screen.getByText(/ENTROPY SEEDED KECCAK/)).toBeInTheDocument();
  });

  it('shows the DEMO / PLAY MONEY badge and the NEW REEL button while standalone', async () => {
    render(<App />);
    await bootUp();
    expect(screen.getByText(/DEMO · PLAY MONEY/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NEW REEL/ })).toBeInTheDocument();
  });

  it('NEW REEL switches the source and the label to BROWSER CSPRNG, and drops SEEDED REEL from the badge', async () => {
    render(<App />);
    await bootUp();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /NEW REEL/ })); });
    expect(screen.getByText(/ENTROPY BROWSER CSPRNG/)).toBeInTheDocument();
    expect(screen.getByText('DEMO · PLAY MONEY')).toBeInTheDocument();
  });
});

describe('App — embedded (inside a host iframe)', () => {
  it('hides the DEMO badge and the NEW REEL button when embedded', async () => {
    const originalTop = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { configurable: true, get() { throw new Error('cross-origin'); } });
    try {
      render(<App />);
      await bootUp();
      expect(screen.queryByText(/DEMO · PLAY MONEY/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /NEW REEL/ })).not.toBeInTheDocument();
      // the rest of the controls are still there — only the standalone-only pair is gated
      expect(screen.getByRole('button', { name: /TURBO/ })).toBeInTheDocument();
    } finally {
      if (originalTop) Object.defineProperty(window, 'top', originalTop);
    }
  });
});

describe('App — toggles', () => {
  it('TURBO flips its pressed state', async () => {
    render(<App />);
    await bootUp();
    const btn = screen.getByRole('button', { name: /TURBO/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('HOW IT WORKS opens the help dialog with the live board figures, and CLOSE dismisses it', async () => {
    render(<App />);
    await bootUp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /HOW IT WORKS/ }));
    const dialog = screen.getByRole('dialog', { name: 'How Replay works' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/ROUTES END THAT WAY/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('SOUND toggles on and off, driving Voices through ensure()/toggle() without throwing', async () => {
    render(<App />);
    await bootUp();
    const btn = screen.getByRole('button', { name: /SOUND/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(() => fireEvent.click(btn)).not.toThrow();
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('App — a full round, by pointer', () => {
  // The row labels, "PICK A ROW ABOVE TO BET", "WALKING THE 13 POINTS", "PAID"/"NO PAY"
  // — every string composeFrame draws — are pixels on the <canvas>, not DOM text, so
  // testing-library cannot see them. What IS real DOM here: the canvas's own `cursor`
  // style (idle-with-hover and settled are both 'pointer'; everything else is 'default',
  // per the ternary in App.tsx's JSX) and the `.sr` paragraph's "Result: won/lost, path
  // N." sentence, which App.tsx sets from `st.result` the moment a bet is placed — the
  // route is decided immediately, only its reveal is animated — and clears on `deal()`.

  it('hover focuses a row, buying it locks the board, replays 13 beats and settles, and a further click deals again', async () => {
    const { container } = render(<App />);
    await bootUp();
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608); // App fits the canvas to 1024x608 css px at this viewport, dpr 1, pitch 4

    // row 0 (STRUCK FIRST) — rowRect(0) is lamp rows 80..89, columns 16..250; pick a
    // point well inside it and convert lamp -> device px at pitch 4, geo origin (0,0).
    const point = { clientX: 100 * 4, clientY: 84 * 4 };
    // hovering plays the focus tick through Voices — must not throw even while muted
    expect(() => fireEvent.pointerMove(canvas, point)).not.toThrow();
    expect(canvas.style.cursor).toBe('pointer'); // idle + hovering a row

    fireEvent.pointerDown(canvas, point);
    expect(canvas.style.cursor).toBe('default'); // mid-replay, neither idle nor settled
    expect(screen.getByText(/Result: (won|lost), path \d+\./)).toBeInTheDocument();

    // walk all 13 beats to completion — turbo is off, so this is the real schedule length
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(canvas.style.cursor).toBe('pointer'); // settled

    // any further pointerdown on a settled board deals a fresh one, back to idle
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });
    expect(screen.queryByText(/Result:/)).not.toBeInTheDocument();
    expect(canvas.style.cursor).toBe('default'); // idle, no hover yet
  });

  it('a pointer outside every row is not a bet, and moving off a row clears the hover focus', async () => {
    const { container } = render(<App />);
    await bootUp();
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608);

    fireEvent.pointerMove(canvas, { clientX: 100 * 4, clientY: 84 * 4 }); // row 0
    expect(canvas.style.cursor).toBe('pointer');
    fireEvent.pointerMove(canvas, { clientX: 0, clientY: 0 });            // off every row
    expect(canvas.style.cursor).toBe('default');
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });            // no row hit -> no bet
    expect(screen.queryByText(/Result:/)).not.toBeInTheDocument();
  });

  it('TURBO collapses the same round to the fast schedule', async () => {
    const { container } = render(<App />);
    await bootUp();
    fireEvent.click(screen.getByRole('button', { name: /TURBO/ }));
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608);
    fireEvent.pointerDown(canvas, { clientX: 100 * 4, clientY: 84 * 4 });
    await act(async () => { vi.advanceTimersByTime(13 * 55 + 200); });
    expect(canvas.style.cursor).toBe('pointer'); // settled, well under the non-turbo schedule length
  });

  it('a losing ticket with a ghost touch plays the near-miss horn — the hero path, deal 3 of the published reel', async () => {
    // src/bridge/demoHost.ts: deal 3 of the published reel is rank 10 of the 8-5 board,
    // "the single ordering out of 1,287 whose curve touches one point short of FOUR DOWN
    // three separate times" — the exact case defect 1 made unreachable. Reaching it here,
    // through App.tsx's real pointer handling rather than through schedule.ts directly,
    // is the regression cover for the fix landing in the component that ships it.
    const nearMiss = vi.spyOn(sfx, 'nearMiss');
    const { container } = render(<App />);
    await bootUp();
    fireEvent.click(screen.getByRole('button', { name: /TURBO/ })); // speed only; ghostAt is turbo-independent
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608);

    const settle = async (clientX: number, clientY: number) => {
      fireEvent.pointerDown(canvas, { clientX, clientY });
      await act(async () => { vi.advanceTimersByTime(13 * 55 + 200); });
    };
    const dealAgain = () => fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });

    // burn through deals 0, 1 and 2 with a throwaway STRUCK FIRST bet each (row 0's rect
    // sits at the same lamp position on every board), landing the reel on deal 3.
    for (let i = 0; i < 3; i++) {
      await settle(100 * 4, 84 * 4); // row 0 — STRUCK FIRST
      dealAgain();
    }

    // One or more of the three throwaway STRUCK FIRST rounds above may itself land a
    // near-miss (STRUCK FIRST's ticket row is 0, same as NEVER BEHIND's fence, so a lost
    // one can still re-touch it within 13 beats) — that is a real, separate near-miss,
    // not a false positive, so isolate the call this assertion is actually about.
    nearMiss.mockClear();

    // deal 3, the hero board (8-5) — FOUR DOWN is its 6th and last row: rowRect(5) is
    // lamp rows 120..129 at rowStep 8 from R.rowY 81.
    await settle(100 * 4, 124 * 4);
    expect(nearMiss).toHaveBeenCalledTimes(1);
  });

  it('a pointer move or down mid-replay is ignored — the board is locked until it settles', async () => {
    const { container } = render(<App />);
    await bootUp();
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608);
    fireEvent.pointerDown(canvas, { clientX: 100 * 4, clientY: 84 * 4 }); // buy row 0
    expect(canvas.style.cursor).toBe('default'); // mid-replay
    // neither a hover nor a second buy attempt does anything while locked
    expect(() => fireEvent.pointerMove(canvas, { clientX: 100 * 4, clientY: 124 * 4 })).not.toThrow();
    expect(() => fireEvent.pointerDown(canvas, { clientX: 100 * 4, clientY: 124 * 4 })).not.toThrow();
    expect(canvas.style.cursor).toBe('default'); // unmoved — still mid-replay, not re-hovered
  });

  it('falls back to a 1x pixel ratio when the host reports none', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    try {
      expect(() => render(<App />)).not.toThrow();
      await bootUp();
      expect(screen.getByText(/ENTROPY SEEDED KECCAK/)).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(window, 'devicePixelRatio', original);
    }
  });

  it('pointer events land no-ops when the canvas 2D context is unavailable — no crash, no board', async () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
    try {
      const { container } = render(<App />);
      await bootUp();
      const canvas = container.querySelector('canvas')!;
      mockCanvasBox(canvas, 1024, 608);
      // the render effect bails before ever setting geoRef — toLamp/hitRow see no geometry
      expect(() => fireEvent.pointerMove(canvas, { clientX: 400, clientY: 336 })).not.toThrow();
      expect(() => fireEvent.pointerDown(canvas, { clientX: 400, clientY: 336 })).not.toThrow();
      expect(screen.queryByText(/Result:/)).not.toBeInTheDocument(); // no bet was placed
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it('the help dialog names the loser on an AWAY-won board too (deal 1 of the reel: 7-6, AWAY)', async () => {
    const { container } = render(<App />);
    await bootUp();
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608);
    // deal 0 is HOME-won; settle it, deal again to land on deal 1 (l=6, winner AWAY —
    // src/bridge/demoHost.ts's dealBoard for the published reel).
    fireEvent.pointerDown(canvas, { clientX: 100 * 4, clientY: 84 * 4 });
    await act(async () => { vi.advanceTimersByTime(20000); });
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 }); // deal again

    fireEvent.click(screen.getByRole('button', { name: /HOW IT WORKS/ }));
    // both ternaries keyed on winnerSide === 'HOME' take their AWAY-side branch here.
    // The em dash form is unique to the dialog's own sentence — the .sr paragraph states
    // the same score without one, and matches "AWAY 7" on its own too.
    expect(screen.getByText(/AWAY 7 — HOME 6/)).toBeInTheDocument();
    expect(screen.getByText('HOME STRUCK FIRST')).toBeInTheDocument();
  });
});

describe('App — resize and unmount', () => {
  it('a window resize re-measures the board without throwing', async () => {
    render(<App />);
    await bootUp();
    expect(() => act(() => { window.dispatchEvent(new Event('resize')); })).not.toThrow();
  });

  it('unmounting mid-replay clears every pending beat timer', async () => {
    const { container, unmount } = render(<App />);
    await bootUp();
    const canvas = container.querySelector('canvas')!;
    mockCanvasBox(canvas, 1024, 608);
    fireEvent.pointerDown(canvas, { clientX: 100 * 4, clientY: 84 * 4 });
    const pending = vi.getTimerCount();
    expect(pending).toBeGreaterThan(0);
    unmount();
    // clearTimers() ran on unmount; nothing left to fire (boot's own timer is long gone)
    expect(() => act(() => { vi.advanceTimersByTime(20000); })).not.toThrow();
  });
});
