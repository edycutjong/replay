import { useEffect, useRef } from 'react';
import { Field, geometry, makeSprites, renderCanvas } from './render/bulbs';
import { composeColdOpen, WIDE_COLS, WIDE_ROWS } from './render/coldOpen';
import { boardMenu, formatPayout } from './game/menu';
import './styles/crt.css';

/** Deal 0 of the published seed renders HOME 8 — AWAY 5 on every load, in the fixture,
 *  in the screenshot and in the demo-video take (seed-data.md §2.2 / ui.md R5). */
const DEAL0_L = 5, DEAL0_WINNER = 'HOME' as const;

export function App() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const wCss = cv.clientWidth, hCss = cv.clientHeight;
      cv.width = Math.round(wCss * dpr); cv.height = Math.round(hCss * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#05060B';
      ctx.fillRect(0, 0, cv.width, cv.height);
      const geo = geometry(wCss, hCss, WIDE_COLS, WIDE_ROWS, dpr);
      const field: Field = composeColdOpen(DEAL0_L, DEAL0_WINNER);
      renderCanvas(field, ctx, geo, makeSprites(geo));
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  const rows = boardMenu(DEAL0_L);
  return (
    <div className="cabinet">
      <canvas ref={ref} className="board" />
      {/* ui.md §2.6 exception 2 of 3: the meta readout is mono type, never lamps. */}
      <p className="meta">RTP 97% · MAX 96.03× · ENTROPY SEEDED KECCAK</p>
      <div className="crt" />
      <div className="vignette" />
      {/* the same frame, as text, for screen readers and for a phone reader */}
      <p className="sr">
        Final score HOME 8, AWAY 5. {rows[0].total.toLocaleString()} orderings of the 13 points
        end 8–5. Pick one: {rows.map(r => `${r.prop}, ${r.count} of ${r.total}, pays ${formatPayout(r).replace('×','')} times`).join('. ')}.
        Expected value is the same on every ticket. Return to player 97 percent.
      </p>
    </div>
  );
}
