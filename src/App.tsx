import { useCallback, useEffect, useRef, useState } from 'react';
import { geometry, makeSprites, renderCanvas, lampRegion, drawSocketField, type Geometry } from './render/bulbs';
import { composeStatic, composeChart, CHART_BAND, rowRect, rowIndexForProp, WIDE_COLS, WIDE_ROWS, type FrameState } from './render/coldOpen';
import { boardMenu, formatPayout, toNumber } from './game/menu';
import { beatTempo, TURBO_BEAT_MS } from './game/tempo';
import { curve } from './render/replay';
import { ticketRow, type PropId } from './game/codec';
import { dealBoard, settleLocally, isEmbedded } from './bridge/demoHost';
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

/** Deal 0 of the published seed renders HOME 8 — AWAY 5 on first load, so the cold-open
 *  frame is byte-for-byte reproducible in the fixture, the screenshot and the video. */
const FIRST = { l: 5, winnerSide: 'HOME' as const };

export function App() {
  const cv = useRef<HTMLCanvasElement>(null);
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
  const [st, setSt] = useState<FrameState>({
    ...FIRST, phase: 'idle', propId: null, hover: null, result: null,
    beat: 0, headHot: false, ghost: false,
  });

  // ---- render -------------------------------------------------------------------
  // Two layers. The static layer (bezel, score, menu, controls) is rendered once per
  // state change into an offscreen canvas; a beat blits that back and recomputes ONLY
  // the chart band. Redrawing all 4.1M device pixels per beat cost ~80ms — 12fps, which
  // is exactly what "not smooth" looks like.
  const staticKey = `${st.l}|${st.winnerSide}|${st.phase}|${st.propId}|${st.hover}|${st.result?.won}|${st.result?.pathId}`;
  const lastStaticKey = useRef('');
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = cv.current;
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
    const host = c.parentElement;
    const availW = host?.clientWidth ?? c.clientWidth;
    const availH = host?.clientHeight ?? c.clientHeight;
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
      c.style.width = `${Math.round(cssW * fit)}px`;
      c.style.height = `${Math.round(cssH * fit)}px`;
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
      const pcss = geo.pitch / dpr, x0 = geo.x0 / dpr, y0 = geo.y0 / dpr;
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

    const region = lampRegion(geo, sprites, CHART_BAND.c0, CHART_BAND.r0, CHART_BAND.c1, CHART_BAND.r1);
    ctx.drawImage(base, 0, 0);                                  // cheap GPU blit
    renderCanvas(composeChart(st), ctx, geo, sprites, region);   // ~13x fewer pixels
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

  const clearTimers = (): void => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  // ---- the round ----------------------------------------------------------------
  const buy = useCallback((propId: PropId) => {
    const result = settleLocally(st.l, propId);
    const pts = curve(result.mask);
    const row = ticketRow(propId);

    // Pre-compute the whole beat schedule from the mask, so tempo is a function of
    // geometry rather than something the animation decides as it goes (ui.md §6.4).
    let resolvedAt = -1;
    for (let i = 0; i < 13; i++) {
      const partial = pts.slice(0, i + 1);
      const maxDef = Math.max(0, ...partial.map(d => -d));
      const struck = ((result.mask & 1) !== 0);
      if (resolvedAt < 0) {
        if (propId === 0) resolvedAt = 0;                            // beat 1 decides it
        else if (propId >= 2 && maxDef >= propId - 1) resolvedAt = i; // reach ticket hit
        else if (propId === 1 && maxDef > 0) resolvedAt = i;         // fence broken
        else if (i === 12) resolvedAt = 12;                          // survived to the end
      }
      void struck;
    }

    setSt(s => ({ ...s, phase: 'replay', propId, result, beat: 0, headHot: false, ghost: false }));
    clearTimers();
    const v = voices.current!;
    sfx.betLock(v); sfx.ticketTear(v); v.startCrowd();

    let t = 0;
    let seenNearMiss = false;
    for (let i = 0; i < 13; i++) {
      const d = Math.abs(pts[i] - row);
      const already = i > resolvedAt;
      // the ghost touch: after the ticket is dead, the curve re-enters the row it missed
      const reTouch = already && !result.won && d <= 1 && !seenNearMiss;
      if (reTouch) seenNearMiss = true;
      const beat = turbo
        ? { ms: TURBO_BEAT_MS, preHoldMs: 0, ghost: false }
        : beatTempo({ d, resolvesTicket: i === resolvedAt, alreadyResolved: already, reTouchesNearMiss: reTouch });
      const at = t + beat.preHoldMs;
      const byWinner = ((result.mask >> i) & 1) === 0; // a set bit is a LOSER point
      timers.current.push(window.setTimeout(() => {
        setSt(s => ({ ...s, beat: i + 1, headHot: true, ghost: beat.ghost }));
        const v = voices.current!;
        // the crowd IS the proximity readout — gain and centre are driven by d
        v.setCrowd(d);
        if (i === 12) sfx.reconcile(v); else sfx.point(v, byWinner);
      }, at));
      timers.current.push(window.setTimeout(() => setSt(s => ({ ...s, headHot: false })), at + 90));
      t += beat.ms;
    }
    timers.current.push(window.setTimeout(() => {
      setSt(s => ({ ...s, phase: 'settled', headHot: false, ghost: false }));
      const v = voices.current!;
      v.stopCrowd();
      // "nearly" is its own verdict, and it is the one the near-miss beat exists for
      if (result.won) sfx.win(v);
      else if (seenNearMiss) sfx.nearMiss(v);
      else sfx.loss(v);
    }, t + 120));
  }, [st.l, turbo]);

  const deal = useCallback(() => {
    clearTimers();
    voices.current!.stopCrowd();
    sfx.deal(voices.current!);
    const { l, winnerSide } = dealBoard();
    setSt({ l, winnerSide, phase: 'idle', propId: null, hover: null, result: null, beat: 0, headHot: false, ghost: false });
  }, []);

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

  const onDown = (e: React.PointerEvent): void => {
    if (st.phase === 'settled') { deal(); return; }
    if (st.phase !== 'idle') return;
    const i = hitRow(e);
    if (i === null) return;
    const rows = boardMenu(st.l);
    const propId = ([0, 1, 2, 3, 4, 5] as PropId[]).find(p => rowIndexForProp(rows, p) === i);
    if (propId !== undefined) buy(propId);
  };

  // ---- the DOM copy: how the frame reaches a screen reader and a phone (ui.md §8.5) --
  const rows = boardMenu(st.l);
  return (
    <div className="cabinet">
      <canvas
        ref={cv}
        className="board"
        onPointerMove={onMove}
        onPointerDown={onDown}
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
      {/* ui.md §2.6 exception 2 of 3: the meta readout is mono type, never lamps. */}
      {!boot && <p className="meta">RTP 97% · MAX 96.03× · ENTROPY SEEDED KECCAK</p>}
      {/* The one line that says what this IS. A player who reads nothing else should
          still understand the inversion: the result is already public, the route is not. */}
      {!boot && <p className="pitch">THE SCORE IS FINAL · BET ON HOW IT HAPPENED</p>}
      {/* The settled controls band belongs to the lamp layer (NO PAY / CLICK TO DEAL
          AGAIN), so the DOM button stands down rather than printing over it. */}
      {!boot && st.phase !== 'settled' && (
        <div className="controls">
          <button className="btn" onClick={() => setTurbo(t => !t)} aria-pressed={turbo}>
            <span className="lamp" aria-hidden="true" />TURBO
          </button>
          <button className="btn" onClick={() => setHelp(h => !h)} aria-pressed={help} aria-expanded={help}>
            <span className="lamp" aria-hidden="true" />HOW IT WORKS
          </button>
          <button
            className="btn"
            aria-pressed={sound}
            onClick={() => { const on = voices.current!.toggle(); setSound(on); if (on) { sfx.boot(voices.current!); voices.current!.startHum(); } else voices.current!.stopHum(); }}
          >
            <span className="lamp" aria-hidden="true" />SOUND
          </button>
        </div>
      )}
      {!boot && !isEmbedded() && <p className="demo">DEMO · PLAY MONEY</p>}
      {help && (
        /* ui.md §9.3 bans a splash, a modal on load and a tutorial, because Simplicity is
           25% and reads "no manual needed" — so this NEVER opens by itself. It is a
           button, for the player who wants it, and the cold open is still zero clicks. */
        <div className="help" role="dialog" aria-label="How Replay works">
          <button className="helpClose" onClick={() => setHelp(false)} aria-label="Close">CLOSE ×</button>
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
          <p className="fine">
            Then the 13 points replay one at a time, and you watch whether the line ever reaches
            your row. Turn SOUND on: the winner's point and the loser's point are different pitches,
            so you can hear a comeback without looking.
          </p>
        </div>
      )}
      <div className="crt" />
      <div className="vignette" />
      <p className="sr">
        Final score {st.winnerSide === 'HOME' ? 'HOME' : 'AWAY'} {13 - st.l},{' '}
        {st.winnerSide === 'HOME' ? 'AWAY' : 'HOME'} {st.l}. {rows[0].total.toLocaleString()} orderings
        of the 13 points end this way. Pick one:{' '}
        {rows.map(r => `${r.prop}, ${r.count} of ${r.total}, pays ${formatPayout(r).replace('×', '')} times`).join('. ')}.
        Expected value is the same on every ticket. Return to player 97 percent.
        {st.result && ` Result: ${st.result.won ? 'won' : 'lost'}, path ${st.result.pathId}.`}
      </p>
    </div>
  );
}
