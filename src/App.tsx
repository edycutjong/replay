import { useCallback, useEffect, useRef, useState } from 'react';
import { geometry, makeSprites, renderCanvas, lampRegion, type Geometry } from './render/bulbs';
import { composeStatic, composeChart, CHART_BAND, rowRect, rowIndexForProp, WIDE_COLS, WIDE_ROWS, type FrameState } from './render/coldOpen';
import { boardMenu, formatPayout } from './game/menu';
import { beatTempo, TURBO_BEAT_MS } from './game/tempo';
import { curve } from './render/replay';
import { ticketRow, type PropId } from './game/codec';
import { dealBoard, settleLocally, isEmbedded } from './bridge/demoHost';
import './styles/crt.css';

/** Deal 0 of the published seed renders HOME 8 — AWAY 5 on first load, so the cold-open
 *  frame is byte-for-byte reproducible in the fixture, the screenshot and the video. */
const FIRST = { l: 5, winnerSide: 'HOME' as const };

export function App() {
  const cv = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef<Geometry | null>(null);
  const spritesRef = useRef<ReturnType<typeof makeSprites> | null>(null);
  const timers = useRef<number[]>([]);
  const [turbo, setTurbo] = useState(false);
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

    if (lastStaticKey.current !== staticKey) {
      const bctx = base.getContext('2d', { alpha: false })!;
      bctx.fillStyle = '#05060B';
      bctx.fillRect(0, 0, base.width, base.height);
      renderCanvas(composeStatic(st), bctx, geo, sprites);
      lastStaticKey.current = staticKey;
    }

    const region = lampRegion(geo, sprites, CHART_BAND.c0, CHART_BAND.r0, CHART_BAND.c1, CHART_BAND.r1);
    ctx.drawImage(base, 0, 0);                                  // cheap GPU blit
    renderCanvas(composeChart(st), ctx, geo, sprites, region);   // ~13x fewer pixels
  }, [st, staticKey]);

  useEffect(() => {
    const onResize = (): void => { geoRef.current = null; setSt(s => ({ ...s })); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
      timers.current.push(window.setTimeout(() => {
        setSt(s => ({ ...s, beat: i + 1, headHot: true, ghost: beat.ghost }));
      }, at));
      timers.current.push(window.setTimeout(() => setSt(s => ({ ...s, headHot: false })), at + 90));
      t += beat.ms;
    }
    timers.current.push(window.setTimeout(() => setSt(s => ({ ...s, phase: 'settled', headHot: false, ghost: false })), t + 120));
  }, [st.l, turbo]);

  const deal = useCallback(() => {
    clearTimers();
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
    setSt(s => (s.hover === i ? s : { ...s, hover: i }));
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
      {/* ui.md §2.6 exception 2 of 3: the meta readout is mono type, never lamps. */}
      <p className="meta">RTP 97% · MAX 96.03× · ENTROPY SEEDED KECCAK</p>
      <button className="turbo" onClick={() => setTurbo(t => !t)} aria-pressed={turbo}>
        TURBO {turbo ? 'ON' : 'OFF'}
      </button>
      {!isEmbedded() && <p className="demo">DEMO · PLAY MONEY</p>}
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
