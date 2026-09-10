import { useCallback, useEffect, useRef, useState } from 'react';
import { geometry, makeSprites, renderCanvas, lampRegion, drawSocketField, type Geometry } from './render/bulbs';
import { composeStatic, composeChart, LIVE_BAND, rowRect, rowIndexForProp, WIDE_COLS, WIDE_ROWS, type FrameState } from './render/coldOpen';
import { boardMenu, formatPayout, toNumber } from './game/menu';
import { encodeAbiParameters } from 'viem';
import { type GameState, type PropId } from './game/codec';
import { planReplay } from './game/schedule';
import {
  dealBoard, settleLocally, reelEntropy, csprngEntropy, type Entropy,
} from './bridge/demoHost';
import { useCasinoHost } from './bridge/useCasinoHost';

/** The board's own headline number, and the multiplier the facet quotes risk against. */
const MAX_MULTIPLIER_X = 96.03;

/**
 * The standalone purse, in whole chips.
 *
 * Standalone had no running total at all: round, verdict, round, verdict, with nothing
 * carried forward — no sense of being up or down and no reason for the tenth round to feel
 * different from the first. Inside the casino the HOST owns the money and draws its own
 * balance, so this exists only when no host answered; two balances on one screen is worse
 * than none.
 *
 * Winnings are floored to whole chips. The payout is an exact rational and the stake is an
 * integer, so the product is exact — flooring loses at most a fraction of one chip and
 * keeps the purse an integer a player can add up by eye, which is the same argument the
 * paytable makes about itself.
 */
const PURSE_START = 2_000;
const STAKE = 20;
import { composeWordmark, BOOT_MS } from './render/boot';
import { Voices } from './audio/voices';
import { sfx } from './audio/bindings';

/** One sentence per prop, in the player's words rather than the paytable's. */
const PROP_HELP: Record<string, string> = {
  'STRUCK FIRST': 'the side that LOST the game scored the very first point',
  'NEVER BEHIND': 'the winner led or was level the whole way — never once behind',
  'CAME BACK': 'the winner was behind at some point and still won',
  'TWO DOWN': 'the winner was 2 or more points behind at some point',
  'THREE DOWN': 'the winner was 3 or more points behind at some point',
  'FOUR DOWN': 'the winner was 4 or more points behind — the deepest hole on this board',
};
import { WORDMARK_PATHS, WORDMARK_ADV, WORDMARK_CAP, WORDMARK_LAMPS } from './render/wordmark';
import './styles/crt.css';

/** Deal 0 of the published reel renders HOME 8 — AWAY 5 on first load, so the cold-open
 *  frame is byte-for-byte reproducible in the fixture, the screenshot and the video.
 *  READ FROM THE REEL rather than typed as a literal: a hardcoded first board is a second
 *  source of truth that drifts silently the moment the seed changes. */
const REEL = reelEntropy();
const FIRST = dealBoard(REEL, 0);

export function App() {
  const cv = useRef<HTMLCanvasElement>(null);
  /** the full viewport box — what the board is sized to FIT INTO. Measured here rather
   *  than on the canvas's own parent, which is now .stage and shrink-wraps the canvas,
   *  so reading it would make the board's size depend on the board's size. */
  const cab = useRef<HTMLElement>(null);
  /** the board's displayed box; carries --lamp, the DOM layer's unit of length */
  const stage = useRef<HTMLDivElement>(null);
  /** how far the board had to shrink to fit, 1 when it did not. The boot overlay is
   *  positioned in DISPLAYED pixels and needs it. */
  const fitRef = useRef(1);
  const geoRef = useRef<Geometry | null>(null);
  const spritesRef = useRef<ReturnType<typeof makeSprites> | null>(null);
  const timers = useRef<number[]>([]);
  const voices = useRef<Voices | null>(null);
  if (!voices.current) voices.current = new Voices();
  const [sound, setSound] = useState(() => voices.current!.enabled);
  const [turbo, setTurbo] = useState(false);
  const [boot, setBoot] = useState(true);
  const [help, setHelp] = useState(false);
  const [markBox, setMarkBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  /** the entropy in play, and where we are in it. NEW REEL swaps the source, which is the
   *  only thing that changes the meta line's provenance string. */
  const [src, setSrc] = useState<Entropy>(() => REEL);
  const dealNo = useRef(0);
  /** what we are waiting on between the bet and the first beat, in the bridged lane */
  const [waiting, setWaiting] = useState<'session' | 'vrf' | null>(null);
  /** the standalone purse and the last round's swing, for the readout */
  const [chips, setChips] = useState(PURSE_START);
  const [swing, setSwing] = useState<number | null>(null);

  // ---- the sponsor integration ---------------------------------------------------
  // The hook is called unconditionally (rules of hooks) and resolves to nothing when
  // there is no host, which is what makes `bridged` mean "a host actually answered"
  // rather than "we are in an iframe". Those are different claims, and the second one
  // was standing in for the first: this component never mounted the bridge at all, so a
  // hosted round was still being decided by browser entropy in `settleLocally` while the
  // page hid its PLAY MONEY badge.
  const host = useCasinoHost(MAX_MULTIPLIER_X);
  const bridged = host.hostApi !== null;

  /** One token, clamped to whatever the facet's live risk limits allow this bet to be. */
  const wager = (() => {
    const unit = 10n ** BigInt(host.snapshot?.token?.decimals ?? 18);
    return host.maxWager !== undefined && host.maxWager < unit ? host.maxWager : unit;
  })();
  const [st, setSt] = useState<FrameState>({
    ...FIRST, phase: 'idle', propId: null, hover: null, result: null,
    beat: 0, headHot: false, ghost: false, refuted: false, resolvedAt: -1,
  });

  // ---- render -------------------------------------------------------------------
  // Two layers. The static layer (bezel, score, menu, controls) is rendered once per
  // state change into an offscreen canvas; a beat blits that back and recomputes ONLY
  // the chart band. Redrawing all 4.1M device pixels per beat cost ~80ms — 12fps, which
  // is exactly what "not smooth" looks like.
  // `refuted` belongs here because the MENU ROW is drawn into the static layer while the
  // fence and the curve are drawn into the chart band. Without it the cache never
  // invalidated on the beat the ticket died, so the board went half-red: the fence and
  // the walk turned on time and the row naming that same ticket kept being blitted green
  // from a stale bitmap. The composer was right; the cache key was not.
  const staticKey = `${st.l}|${st.winnerSide}|${st.phase}|${st.propId}|${st.hover}|${st.refuted}|${st.result?.won}|${st.result?.pathId}`;
  const lastStaticKey = useRef('');
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = cv.current;
    // `<canvas ref={cv}>` below is unconditional — it is never behind `boot`, `help` or a
    // phase check — so React has always attached this ref by the time a passive effect
    // runs. Kept as a guard against a future conditional render around the canvas rather
    // than deleted for coverage's sake, which is how that regression would go unnoticed.
    /* v8 ignore next -- see above: unreachable while the canvas element is unconditional */
    if (!c) return;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Size the backing store to the BOARD, not to the container, and let CSS shrink it
    // if the board does not fit. Sizing it to the container clipped the board on every
    // viewport under 768 CSS px: `geometry` floors the pitch at 3, so a 390 px phone
    // got a 768 px board drawn into a 390 px canvas and lost the whole multiplier
    // column off the right edge — the one column the game is about. Measure the PARENT
    // (never the canvas, whose own style width is what we are about to set, which would
    // feed back into the next pitch) and centre via .cabinet's grid.
    //
    // The `?? c.clientWidth/clientHeight` fallback is the same class of guard as `!c`
    // above: `cab` is the ref on `.cabinet`, this component's own root element, so it is
    // never null when this effect can run. Left in for the same reason.
    /* v8 ignore next 2 -- see above: unreachable while .cabinet is this component's root */
    const availW = cab.current?.clientWidth ?? c.clientWidth;
    const availH = cab.current?.clientHeight ?? c.clientHeight;
    const pick = geometry(availW, availH, WIDE_COLS, WIDE_ROWS, dpr);
    const resized = pick.w !== c.width || pick.h !== c.height;
    if (resized || !geoRef.current) {
      c.width = pick.w;
      c.height = pick.h;
      // Fit the board into the available box, preserving aspect. Letting max-width
      // alone do it squashes the board: it caps the width and leaves the explicit
      // height untouched, so a 390 px phone rendered a 768x456 board into a 390x456
      // element and the lamps came out ovals.
      const cssW = pick.w / dpr, cssH = pick.h / dpr;
      const fit = Math.min(1, availW / cssW, availH / cssH);
      fitRef.current = fit;
      c.style.width = `${Math.round(cssW * fit)}px`;
      c.style.height = `${Math.round(cssH * fit)}px`;
      // Hand the DOM layer the board's own unit. Every overlay offset and type size is
      // expressed in lamps, so the mono readouts sit in the lamp bands they were
      // designed for at every board size. They used to be percentages of the VIEWPORT,
      // which meant one thing while the board filled the screen and another once it was
      // letterboxed -- .pitch at "top: 3%" landed on the SCORE band and printed through
      // the 8, and the controls printed over the rules line.
      stage.current?.style.setProperty('--lamp', `${(pick.pitch / dpr) * fit}px`);
      // the board now IS the canvas, so it starts at the origin
      geoRef.current = { ...pick, x0: 0, y0: 0 };
      spritesRef.current = makeSprites(geoRef.current);
      baseRef.current = document.createElement('canvas');
      baseRef.current.width = c.width; baseRef.current.height = c.height;
      lastStaticKey.current = '';
    }
    const geo = geoRef.current, sprites = spritesRef.current!;
    const base = baseRef.current!;

    if (boot) {
      // the bulb wordmark, waiting under the chrome overlay for the handoff
      ctx.fillStyle = '#05060B';
      ctx.fillRect(0, 0, c.width, c.height);
      drawSocketField(ctx, geo);
      renderCanvas(composeWordmark(4), ctx, geo, sprites);
      lastStaticKey.current = '';
      // Hand the chrome overlay the EXACT box the bulb wordmark occupies, in CSS px, so
      // the two are superimposed rather than merely both centred.
      const pcss = (geo.pitch / dpr) * fitRef.current, x0 = 0, y0 = 0;
      setMarkBox({
        l: x0 + Math.round((WIDE_COLS - WORDMARK_LAMPS.w) / 2) * pcss,
        t: y0 + Math.round((WIDE_ROWS - WORDMARK_LAMPS.h) / 2) * pcss,
        w: WORDMARK_LAMPS.w * pcss,
        h: WORDMARK_LAMPS.h * pcss,
      });
      return;
    }

    if (lastStaticKey.current !== staticKey) {
      const bctx = base.getContext('2d', { alpha: false })!;
      bctx.fillStyle = '#05060B';
      bctx.fillRect(0, 0, base.width, base.height);
      drawSocketField(bctx, geo); // the unlit lattice, under everything
      renderCanvas(composeStatic(st), bctx, geo, sprites);
      lastStaticKey.current = staticKey;
    }

    const region = lampRegion(geo, sprites, LIVE_BAND.c0, LIVE_BAND.r0, LIVE_BAND.c1, LIVE_BAND.r1);
    ctx.drawImage(base, 0, 0);                                  // cheap GPU blit
    renderCanvas(composeChart(st), ctx, geo, sprites, region);   // still a fraction of the board
  }, [st, staticKey, boot]);

  useEffect(() => {
    const onResize = (): void => { geoRef.current = null; setSt(s => ({ ...s })); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setBoot(false), BOOT_MS);
    return () => clearTimeout(t);
  }, []);

  /** FIRST never passes through `deal()` — it is the initial state, not something
   *  dealt — so it gets its own copy of the same "a board just appeared" sounds. Firing
   *  them at mount would announce a score under the wordmark, before the board is even
   *  on screen; tying it to `boot` flipping false lines the audio up with the same
   *  instant the meta line and the menu itself are revealed (`!boot && <p className=
   *  "meta">…`). `boot` only ever goes true -> false once, so this fires exactly once. */
  useEffect(() => {
    if (boot) return;
    const v = voices.current!;
    sfx.scoreStrike(v, FIRST.winnerSide);
    boardMenu(FIRST.l).forEach((_, i) => {
      timers.current.push(window.setTimeout(() => sfx.rowLand(v, i), 50 * i));
    });
  }, [boot]);

  const clearTimers = (): void => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  // ---- the round ----------------------------------------------------------------
  /**
   * Walk one settled round. The `result` is the ONLY input: standalone hands it what
   * `settleLocally` computed, and the hosted lane hands it what the CHAIN wrote into
   * `gameState`. Neither the tempo nor the drawing can tell the difference, which is the
   * point — recomputing a hosted outcome client-side is the defect that capped Overhang
   * under LESSONS R11, so there is exactly one renderer and it never decides anything.
   */
  const runReplay = useCallback((result: GameState, onSettled?: () => void) => {
    const propId = result.propId;
    // The whole schedule up front, from the mask, so tempo is a function of geometry
    // rather than something the animation decides as it goes (ui.md §6.4). This used to
    // be forty lines inline here, which is precisely why it was never tested and why the
    // ghost touch was unreachable for four of the six props — see src/game/schedule.ts.
    const plan = planReplay(result.mask, result.l, propId, turbo);

    setSt(s => ({
      // `resolvedAt` comes from the SAME plan that drives the tempo, so the knockout mark
      // and the beat that slowed down for it can never disagree about where the ticket died.
      ...s, phase: 'replay', propId, result, beat: 0, headHot: false, ghost: false, refuted: false,
      resolvedAt: plan.resolvedAt,
    }));
    clearTimers();
    const v = voices.current!;
    sfx.betLock(v); sfx.ticketTear(v); v.startCrowd();

    plan.beats.forEach((beat, i) => {
      timers.current.push(window.setTimeout(() => {
        // The fence turns red ON the beat the claim dies, never before it — `resolves`
        // is the first beat at which the outcome is knowable, so this reveals nothing
        // the arithmetic has not already settled.
        const refuted = beat.resolves && !plan.won;
        setSt(s => ({ ...s, beat: i + 1, headHot: true, ghost: beat.ghost, refuted: s.refuted || refuted }));
        const v = voices.current!;
        // the crowd IS the proximity readout — gain and centre are driven by d, unless
        // tempo.ts's own crowd level for this beat is 0, which overrides d entirely.
        // The ghost touch is d=1, the loudest distance on the curve, and it is the one
        // beat in the round built to land in silence.
        v.setCrowd(beat.d, beat.crowd === 0);
        if (i === 12) sfx.reconcile(v); else sfx.point(v, beat.byWinner);
        // The sour horn belongs to the beat that kills the ticket, not to beat 13. On the
        // hero path those are seven beats apart, and the gap between them IS the scene.
        if (refuted) sfx.loss(v);
      }, beat.at));
      timers.current.push(window.setTimeout(() => setSt(s => ({ ...s, headHot: false })), beat.at + 90));
    });
    timers.current.push(window.setTimeout(() => {
      setSt(s => ({ ...s, phase: 'settled', headHot: false, ghost: false }));
      const v = voices.current!;
      v.stopCrowd();
      // "nearly" is its own verdict, and it is the one the ghost touch exists for. A loss
      // with no ghost has already sounded its horn at the beat it died.
      if (plan.won) sfx.win(v);
      else if (plan.ghostAt >= 0) sfx.nearMiss(v);
      // The host clamps its balance displays downward-only until this fires, so that the
      // top bar cannot spoil a 13-beat reveal. It has to run at BOTH tempos — forgetting
      // it on the TURBO path is the easy bug, and TURBO is inside `plan` already.
      onSettled?.();
    }, plan.totalMs + 120));
  }, [turbo]);

  /**
   * Place the bet. Two lanes, one renderer.
   *
   * BRIDGED: the chain settles it. `gameData` is `abi.encode(uint8 l, uint8 propId)` —
   * the board and the prop are the BET, and the only thing the VRF decides is which of
   * the C(13,l) orderings actually happened. The replay does not start here; it starts
   * when `gameState` comes back through the snapshot, in the effect below.
   *
   * STANDALONE: `settleLocally` decides, from the reel. This is the only place the
   * TypeScript unrank is ever allowed to pick an outcome.
   */
  const buy = useCallback((propId: PropId) => {
    if (bridged) {
      const gameData = encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'uint8' }],
        [st.l, propId],
      );
      setSt(s => ({
        ...s, phase: 'replay', propId, result: null, beat: 0, headHot: false, ghost: false, refuted: false, resolvedAt: -1,
      }));
      clearTimers();
      const v = voices.current!;
      sfx.betLock(v); sfx.ticketTear(v);
      setWaiting('session');
      void host.openSession(wager.toString(), gameData)
        .then(key => {
          if (key) { setWaiting('vrf'); return; }
          // the host refused the session: give the board back rather than hanging on it
          setWaiting(null);
          setSt(s => ({ ...s, phase: 'idle', propId: null }));
        })
        .catch(() => {
          setWaiting(null);
          setSt(s => ({ ...s, phase: 'idle', propId: null }));
        });
      return;
    }
    // STANDALONE: the reel decides, and the purse is ours to keep.
    const result = settleLocally(st.l, propId, src, dealNo.current);
    const row = boardMenu(st.l)[rowIndexForProp(boardMenu(st.l), propId)];
    // exact rational x integer stake, floored: bigint throughout, no float in the money
    const win = result.won ? Number((BigInt(STAKE) * row.payout.num) / row.payout.den) : 0;
    setChips(c => c - STAKE);
    setSwing(null);
    runReplay(result, () => { setChips(c => c + win); setSwing(win - STAKE); });
  }, [bridged, host, wager, st.l, src, runReplay]);

  /** Reset the purse. Offered whenever the player is DOWN, not only when they are broke:
   *  at 97% RTP with a 96x tail the purse almost never actually busts, so a bust-gated
   *  button is a control nobody ever sees. "I am down, start me over" is the real use. */
  const refill = useCallback(() => { setChips(PURSE_START); setSwing(null); }, []);

  /**
   * The chain has written a settled `gameState`: render exactly that, then reveal.
   *
   * Keyed on the SESSION ID, not on the effect's dependencies. `useCasinoHost` returns a
   * fresh object literal every render, so `host` changes identity on every render and any
   * dependency list containing it re-runs constantly — which restarted the replay from
   * beat 0 forever and meant a hosted round never reached `settled` at all. Guarding on
   * the id makes re-entry harmless whatever the deps do.
   */
  /**
   * The panel had `role="dialog"` and nothing else: opening it left focus on the board, so
   * Tab walked all four cabinet buttons — still operable, underneath the thing covering
   * them — before ever reaching CLOSE, and the panel's own content was never reached at
   * all. Lighthouse scored accessibility 100 with zero violations, because "is there a
   * focus trap" is not an automated check.
   *
   * Focus moves to CLOSE on open, and Tab wraps inside the panel until it is dismissed.
   * Escape already closed it (the window-level shortcut) and still does.
   */
  const helpRef = useRef<HTMLDivElement>(null);
  const helpCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!help) return;
    helpCloseRef.current?.focus();
    const onTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !helpRef.current) return;
      const f = helpRef.current.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      // CLOSE renders unconditionally inside this panel, so the list is never empty while
      // the effect can run. Kept as a guard against a future panel that renders no control,
      // rather than deleted to satisfy a threshold.
      /* v8 ignore next -- see above: unreachable while CLOSE is unconditional */
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      // wrap in both directions, and pull focus back in if it has escaped the panel
      if (e.shiftKey && (document.activeElement === first || !helpRef.current.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !helpRef.current.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onTab);
    return () => window.removeEventListener('keydown', onTab);
  }, [help]);

  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    const p = host.pending;
    if (!p || startedRef.current === p.sessionId) return;
    startedRef.current = p.sessionId;
    setWaiting(null);
    runReplay(p.state, () => host.reveal(p.sessionId));
  }, [host.pending, host, runReplay]);

  const deal = useCallback((next: Entropy = src, from?: number) => {
    clearTimers();
    const v = voices.current!;
    v.stopCrowd();
    sfx.deal(v);
    dealNo.current = from ?? dealNo.current + 1;
    const { l, winnerSide } = dealBoard(next, dealNo.current);
    // the two scoreStrike pitches identify the sides for the rest of the round — the
    // player hears who won before a single ticket is priced
    sfx.scoreStrike(v, winnerSide);
    // six ascending ticks price the menu, staggered so the run reads as a rising
    // arpeggio rather than a chord. Scheduled through `timers` so a rapid re-deal's
    // `clearTimers()` above cancels whatever of the previous board's run is still
    // pending, rather than stacking two overlapping arpeggios.
    boardMenu(l).forEach((_, i) => {
      timers.current.push(window.setTimeout(() => sfx.rowLand(v, i), 50 * i));
    });
    setSt({
      l, winnerSide, phase: 'idle', propId: null, hover: null, result: null,
      beat: 0, headHot: false, ghost: false, refuted: false, resolvedAt: -1,
    });
  }, [src]);

  /** SOUND. Named rather than inline on the button, because the M shortcut has to do
   *  exactly this and a second copy of it would be a second thing to keep in step. */
  const toggleSound = useCallback(() => {
    const on = voices.current!.toggle();
    setSound(on);
    if (on) { sfx.boot(voices.current!); voices.current!.startHum(); } else voices.current!.stopHum();
  }, []);

  /** NEW REEL — leave the published reel for a fresh one drawn from the browser's CSPRNG.
   *  This is the ONLY control that changes the meta line's provenance string, which is
   *  why that string is derived from `src` rather than typed into the markup. */
  const newReel = useCallback(() => {
    const fresh = csprngEntropy();
    setSrc(fresh);
    deal(fresh, 0);
  }, [deal]);

  /**
   * The cabinet switches, bound at the window rather than on the board. A shortcut that
   * only fires while one particular element holds focus is not much of a shortcut, and
   * there is no text input anywhere on this page for a bare letter key to interfere with.
   * Modified presses are left alone so the browser keeps its own shortcuts.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (help) { e.preventDefault(); setHelp(false); } return; }
      if (k === 't') { e.preventDefault(); setTurbo(t => !t); return; }
      if (k === 'h') { e.preventDefault(); setHelp(h => !h); return; }
      if (k === 'm') { e.preventDefault(); toggleSound(); return; }
      // NEW REEL only exists standalone: bridged, the chain owns the randomness
      if (k === 'n' && !bridged) { e.preventDefault(); newReel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help, bridged, newReel, toggleSound]);

  // ---- pointer ------------------------------------------------------------------
  const toLamp = (e: React.PointerEvent): { c: number; r: number } | null => {
    const c = cv.current, geo = geoRef.current;
    if (!c || !geo) return null;
    const box = c.getBoundingClientRect();
    // Map through the DISPLAYED size rather than through devicePixelRatio. The two are
    // the same only while the canvas renders at its intrinsic size; once CSS shrinks it
    // to fit a narrow viewport, a dpr-based mapping puts every click in the wrong row.
    const sx = c.width / box.width, sy = c.height / box.height;
    return {
      c: Math.floor(((e.clientX - box.left) * sx - geo.x0) / geo.pitch),
      r: Math.floor(((e.clientY - box.top) * sy - geo.y0) / geo.pitch),
    };
  };

  const hitRow = (e: React.PointerEvent): number | null => {
    const p = toLamp(e);
    if (!p) return null;
    const n = boardMenu(st.l).length;
    for (let i = 0; i < n; i++) {
      const q = rowRect(i);
      if (p.r >= q.y0 && p.r <= q.y1 && p.c >= q.x0 && p.c <= q.x1) return i;
    }
    return null;
  };

  const onMove = (e: React.PointerEvent): void => {
    if (st.phase !== 'idle') return;
    const i = hitRow(e);
    setSt(s => {
      if (s.hover === i) return s;
      // pitch = odds: scrubbing the menu is a rising scale and the long shot is the top note
      if (i !== null) sfx.focus(voices.current!, toNumber(boardMenu(s.l)[i].payout));
      return { ...s, hover: i };
    });
  };

  /** Which ticket is printed on menu row `i` — the menu's order is the printed order,
   *  not the propId order, so this is a lookup rather than an index. */
  const propAtRow = (i: number): PropId | undefined =>
    ([0, 1, 2, 3, 4, 5] as PropId[]).find(p => rowIndexForProp(boardMenu(st.l), p) === i);

  const onDown = (e: React.PointerEvent): void => {
    if (st.phase === 'settled') { deal(); return; }
    if (st.phase !== 'idle') return;
    const i = hitRow(e);
    if (i === null) return;
    const propId = propAtRow(i);
    if (propId !== undefined) buy(propId);
  };

  /** Move the selection and sound the focus tick, so arrowing the menu is the same rising
   *  scale that scrubbing it with a pointer is — pitch IS odds, whichever way you got here. */
  const focusRow = (i: number): void => {
    if (i === st.hover) return;
    sfx.focus(voices.current!, toNumber(boardMenu(st.l)[i].payout));
    setSt(s => ({ ...s, hover: i }));
  };

  /**
   * The board is a control, not a picture, and until now it answered only to a pointer:
   * every ticket on it was unreachable from a keyboard, and the canvas was not even in
   * the tab order. Arrow keys walk the menu, 1-6 jump straight to a row, Enter or Space
   * bets the selected one, and on a settled board either deals again — the same three
   * things a pointer can do, in the same order.
   */
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const bet = e.key === 'Enter' || e.key === ' ';
    if (st.phase === 'settled') {
      if (bet) { e.preventDefault(); deal(); }
      return;
    }
    // mid-replay the board is not taking instructions, exactly as with a pointer
    if (st.phase !== 'idle') return;
    const n = boardMenu(st.l).length;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      // entering the menu from nowhere lands on the near end, not on row 0 both times
      const from = st.hover ?? (down ? -1 : n);
      focusRow(Math.max(0, Math.min(n - 1, from + (down ? 1 : -1))));
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusRow(e.key === 'Home' ? 0 : n - 1);
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      const i = Number(e.key) - 1;
      // a board with four rows has no row 6: ignore it rather than clamping onto a
      // ticket the player did not ask for
      if (i < n) { e.preventDefault(); focusRow(i); }
      return;
    }
    if (bet && st.hover !== null) {
      e.preventDefault();
      const propId = propAtRow(st.hover);
      if (propId !== undefined) buy(propId);
    }
  };

  // ---- the DOM copy: how the frame reaches a screen reader and a phone (ui.md §8.5) --
  const rows = boardMenu(st.l);
  return (
    // <main>, not <div>: a page with no landmark gives a screen-reader user no way
    // to skip to the thing the page is for, and this page is one control.
    <main className="cabinet" ref={cab}>
      {/* THE STAGE is exactly the board's displayed box, and every overlay below is its
          child. They used to be children of .cabinet, i.e. of the whole viewport, which
          was the same rectangle only while the board filled it — once the board became a
          letterboxed box the percentage offsets stopped tracking the lamp bands and the
          controls printed straight over the rules line. */}
      <div className="stage" ref={stage}>
      <canvas
        ref={cv}
        className="board"
        // The board joins the tab order: it is the primary control of this page, and a
        // canvas is not focusable by default, so before this the only reachable controls
        // were the three cabinet buttons.
        tabIndex={0}
        role="application"
        aria-label="Replay board. Arrow keys choose a ticket, Enter bets it."
        aria-describedby="board-state"
        onPointerMove={onMove}
        onPointerDown={onDown}
        onKeyDown={onKeyDown}
        style={{ cursor: st.phase === 'idle' && st.hover !== null ? 'pointer' : st.phase === 'settled' ? 'pointer' : 'default' }}
      />
      {/* ui.md §1.4 — the one gradient in the build, for 400ms, once per page load.
          It dissolves and the same word remains, in bulbs. That is the thesis. */}
      {boot && markBox && (
        <svg
          className="boot"
          aria-hidden="true"
          viewBox={`0 ${-WORDMARK_CAP} ${WORDMARK_ADV} ${WORDMARK_CAP}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ left: markBox.l, top: markBox.t, width: markBox.w, height: markBox.h }}
        >
          <defs>
            {/* the poster's .chrome ramp, verbatim — the one gradient in the build */}
            <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" /><stop offset="35%" stopColor="#D9E2EC" />
              <stop offset="49%" stopColor="#7C8BA0" /><stop offset="50%" stopColor="#232C38" />
              <stop offset="62%" stopColor="#9FB0C2" /><stop offset="100%" stopColor="#E6EDF5" />
            </linearGradient>
          </defs>
          {WORDMARK_PATHS.map(p => (
            <path key={p.x} d={p.d} transform={`translate(${p.x} 0)`} fill="url(#chrome)" />
          ))}
        </svg>
      )}
      {/* ui.md §2.6 exception 2 of 3: the meta readout is mono type, never lamps.
          The provenance string is READ FROM THE SOURCE IN PLAY (ui.md §12's three
          values), never typed — it was the literal `ENTROPY SEEDED KECCAK` while every
          board and path came from crypto.getRandomValues, i.e. the one unverifiable
          claim on the screen of a game whose whole argument is that you can check it. */}
      {/* NOT `embedded ? ...`. Being inside an iframe is not evidence that a chain decided
          anything — `bridged` means a host actually answered the penpal handshake, and
          only then is CHAIN VRF a true statement about where this round's 32 bytes came
          from. While the bridge was unmounted these were the same condition, and the page
          made the stronger claim on the weaker evidence. */}
      {!boot && <p className="meta">RTP 97% · MAX 96.03× · ENTROPY {bridged ? 'CHAIN VRF' : src.label}</p>}
      {/* What the round is waiting on, in the player's words. A bet that has left the
          client and not yet come back is the one moment the board has nothing to draw. */}
      {waiting && (
        <p className="wait">{waiting === 'session' ? 'OPENING SESSION' : 'WAITING FOR VRF'}</p>
      )}
      {/* The one line that says what this IS. A player who reads nothing else should
          still understand the inversion: the result is already public, the route is not. */}
      {!boot && <p className="pitch">THE SCORE IS FINAL · BET ON HOW IT HAPPENED</p>}
      {/* The settled controls band belongs to the lamp layer (NO PAY / CLICK TO DEAL
          AGAIN), so the DOM button stands down rather than printing over it. */}
      {!boot && st.phase !== 'settled' && (
        <div className="controls">
          <button className="btn" onClick={() => setTurbo(t => !t)} aria-pressed={turbo} title="Turbo (T)" aria-keyshortcuts="t">
            <span className="lamp" aria-hidden="true" /><kbd className="key">T</kbd>{' '}TURBO
          </button>
          <button className="btn" onClick={() => setHelp(h => !h)} aria-pressed={help} aria-expanded={help} title="How it works (H)" aria-keyshortcuts="h">
            <span className="lamp" aria-hidden="true" /><kbd className="key">H</kbd>{' '}HOW IT WORKS
          </button>
          <button
            className="btn"
            aria-pressed={sound}
            onClick={toggleSound}
            title="Sound (M)"
            aria-keyshortcuts="m"
          >
            <span className="lamp" aria-hidden="true" /><kbd className="key">M</kbd>{' '}SOUND
          </button>
          {/* The escape hatch from the published reel. Without it a seeded demo is a
              fixed sequence a player can memorise, which is the one way a curated reel
              could cost us the Fun criterion it exists to serve. */}
          {!bridged && (
            <button className="btn" onClick={newReel} title="New reel (N)" aria-keyshortcuts="n">
              <span className="lamp" aria-hidden="true" /><kbd className="key">N</kbd>{' '}NEW REEL
            </button>
          )}
          {/* The board's own keys. `aria-hidden` because the canvas already announces them
              in its label and each switch carries an aria-keyshortcuts — this is the
              printed key card on the cabinet, for eyes only. */}
          <span className="legend" aria-hidden="true">
            <kbd className="key">↑</kbd><kbd className="key">↓</kbd>
            <span>CHOOSE</span>
            <kbd className="key">1</kbd><span className="dash">–</span><kbd className="key">6</kbd>
            <span>ROW</span>
            <kbd className="key">ENTER</kbd>
            <span>BET</span>
          </span>
        </div>
      )}
      {/* The badge is about MONEY, so it is keyed to the lane that handles it. Two words,
          not three: it used to append "· SEEDED REEL", which is jargon a player has no way
          to parse and which the meta line already states properly as the entropy
          provenance. An honesty surface that nobody can read is decoration. */}
      {!boot && !bridged && <p className="demo">DEMO · PLAY MONEY</p>}
      {/* The purse. Standalone only — see PURSE_START. `swing` is the last round's net, so
          a win reads as what you actually gained rather than as what the ticket paid. */}
      {!boot && !bridged && (
        <p className="purse">
          {chips.toLocaleString('en-US')}
          {swing !== null && <span className={swing >= 0 ? 'up' : 'down'}>
            {swing >= 0 ? ' +' : ' −'}{Math.abs(swing).toLocaleString('en-US')}
          </span>}
          {chips < PURSE_START && (
            <button className="refill" onClick={refill}>REFILL</button>
          )}
        </p>
      )}
      {help && (
        /* ui.md §9.3 bans a splash, a modal on load and a tutorial, because Simplicity is
           25% and reads "no manual needed" — so this NEVER opens by itself. It is a
           button, for the player who wants it, and the cold open is still zero clicks. */
        <div className="help" role="dialog" aria-modal="true" aria-label="How Replay works" ref={helpRef}>
          <button className="helpClose" onClick={() => setHelp(false)} aria-label="Close" ref={helpCloseRef}>CLOSE ×</button>
          <h2>THE SCORE IS ALREADY FINAL.</h2>
          <p>
            A 13-point game ended <b>{st.winnerSide === 'HOME' ? 'HOME' : 'AWAY'} {13 - st.l} —{' '}
            {st.winnerSide === 'HOME' ? 'AWAY' : 'HOME'} {st.l}</b>. That result is on the board
            before you bet a cent. Every other casino game hides the outcome and shows you the odds.
            This one shows you the outcome and sells you the <b>route</b>.
          </p>
          <h2>{rows[0].total.toLocaleString()} ROUTES END THAT WAY.</h2>
          <p>
            The loser took {st.l} of the 13 points. <i>Which</i> {st.l} of them decides the entire
            play-by-play — every lead, every comeback. There are exactly C(13,{st.l}) ={' '}
            {rows[0].total.toLocaleString()} ways to choose them, and each one is a different game
            that ends on the same scoreline.
          </p>
          <h2>YOU BET ON WHAT KIND OF ROUTE IT WAS.</h2>
          <ul>
            {rows.map(r => (
              <li key={r.prop}>
                <b>{r.prop === 'STRUCK FIRST' ? `${st.winnerSide === 'HOME' ? 'AWAY' : 'HOME'} STRUCK FIRST` : r.prop}</b>
                <span>{PROP_HELP[r.prop]}</span>
                <em>{r.count.toLocaleString()} of {r.total.toLocaleString()} · {formatPayout(r)}</em>
              </li>
            ))}
          </ul>
          <h2>EVERY TICKET IS PRICED THE SAME WAY.</h2>
          <p>
            Each price is an exact count divided by the total — no estimate, no simulation. Payout is
            <b> 0.97 ÷ probability</b>, so probability × payout = 0.97 on <i>every</i> row. The safe
            1.75× and the wild 96.03× have identical expected value. There is no trap bet here, and
            you can check the whole paytable by hand.
          </p>
          <h2>YOU PLAY WITH {PURSE_START.toLocaleString()} CHIPS.</h2>
          <p>
            Every ticket costs <b>{STAKE}</b>, and a winning one pays its multiplier on that
            stake — {formatPayout(rows[rows.length - 1])} on this board returns{' '}
            <b>{Math.floor(STAKE * toNumber(rows[rows.length - 1].payout)).toLocaleString()}</b>.
            Winnings are rounded down to whole chips. It is play money and the badge in the
            corner says so; inside a real casino the house keeps the balance and this panel
            would not be talking about it at all. <b>REFILL</b> puts you back to{' '}
            {PURSE_START.toLocaleString()} any time you are down.
          </p>
          <p className="fine">
            Then the 13 points replay one at a time, and you watch whether the line ever reaches
            your row. Turn SOUND on: the winner's point and the loser's point are different pitches,
            so you can hear a comeback without looking.
          </p>
          <p className="fine">
            <b>Keys:</b> arrows or 1-6 choose a ticket, Enter or Space bets it, and on a
            settled board either deals again. <b>T</b> turbo, <b>H</b> this panel,
            <b>M</b> sound{!bridged ? <>, <b>N</b> a new reel</> : null}.
          </p>
        </div>
      )}
      <div className="crt" />
      <div className="vignette" />
      </div>
      <p className="sr" id="board-state">
        Final score {st.winnerSide === 'HOME' ? 'HOME' : 'AWAY'} {13 - st.l},{' '}
        {st.winnerSide === 'HOME' ? 'AWAY' : 'HOME'} {st.l}. {rows[0].total.toLocaleString()} orderings
        of the 13 points end this way. Pick one:{' '}
        {rows.map(r => `${r.prop}, ${r.count} of ${r.total}, pays ${formatPayout(r).replace('×', '')} times`).join('. ')}.
        Expected value is the same on every ticket. Return to player 97 percent.
        {!bridged && ` You have ${chips.toLocaleString('en-US')} play chips; each ticket costs ${STAKE}.`}
        Use the arrow keys or the number keys to choose a ticket, then Enter to bet it.
        {st.result && ` Result: ${st.result.won ? 'won' : 'lost'}, path ${st.result.pathId}.`}
      </p>
    </main>
  );
}
