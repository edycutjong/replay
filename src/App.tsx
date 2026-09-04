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
    const resized = Math.round(c.clientWidth * dpr) !== c.width || Math.round(c.clientHeight * dpr) !== c.height;
    if (resized || !geoRef.current) {
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      geoRef.current = geometry(c.clientWidth, c.clientHeight, WIDE_COLS, WIDE_ROWS, dpr);
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
    const dpr = window.devicePixelRatio || 1;
    return {
      c: Math.floor(((e.clientX - box.left) * dpr - geo.x0) / geo.pitch),
      r: Math.floor(((e.clientY - box.top) * dpr - geo.y0) / geo.pitch),
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
