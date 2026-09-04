/**
 * The frame — ui.md §9.3 and §6. One composer for every state the board can be in, so
 * there is one screen and one renderer (ui.md §10).
 *
 * ui.md §4.2 is a table of NAMED RECTANGLES, and improvising these numbers is how the
 * first pass shipped a SCORE band wider than its own board and a name column that ran
 * through the count column. Every band is declared once, in R.
 */
import { Field } from './bulbs';
import { boardMenu, formatPayout } from '../game/menu';
import { formatPathId, ticketRow, type GameState, type PropId } from '../game/codec';
import { drawWalk, curve, rowForDiff, CHART_X, CHART_COLSTEP, CHART_ROWSTEP } from './replay';

export const WIDE_COLS = 256, WIDE_ROWS = 152;

export const R = {
  scoreY: 4,
  // The chart is the reveal, and the reveal is the product. It gets 30 rows, which at
  // rowStep 2 holds the full -6..+7 range of the widest board with headroom.
  chartY: 34, chartH: 13 * CHART_ROWSTEP + 2,  // 13 units is every board, exactly
  headY: 71,
  rowY: 81, rowStep: 8,
  ctrlY: 133,
  rulesY: 142,
  nameX: 8,
  countRight: 200,
  payRight: 248,
} as const;

export type Phase = 'idle' | 'replay' | 'settled';

export interface FrameState {
  l: number;
  winnerSide: 'HOME' | 'AWAY';
  phase: Phase;
  /** the ticket the player bought, if any */
  propId: PropId | null;
  /** hovered row index, for the focus tick */
  hover: number | null;
  /** the settled round, present once the chain (or demo host) has decided */
  result: GameState | null;
  /** how many of the 13 beats have been walked */
  beat: number;
  /** this beat is the strike frame — head bulb at signal white */
  headHot: boolean;
  /** the ghost touch is re-drawing over a dimmed board */
  ghost: boolean;
}

const fmtCount = (n: number): string => n.toLocaleString('en-US');

/** The lamp-space rectangle of menu row `i` — the click target. */
export function rowRect(i: number): { y0: number; y1: number; x0: number; x1: number } {
  const y = R.rowY + i * R.rowStep;
  return { y0: y - 1, y1: y + 8, x0: R.nameX - 2, x1: R.payRight + 2 };
}

/** The chart band, in lamp space — the only region that changes during a replay. */
export const CHART_BAND = { c0: 1, r0: R.chartY - 2, c1: WIDE_COLS - 2, r1: R.chartY + R.chartH + 2 };

/** Everything that does NOT change between beats: bezel, score, menu head, rows,
 *  controls, rules line. Rendered once per state change and cached as a bitmap, so a
 *  beat only recomputes the chart band instead of all 4.1M device pixels. */
export function composeStatic(s: FrameState): Field {
  const f = composeFrame(s);
  const out = new Field(WIDE_COLS, WIDE_ROWS);
  for (const l of f.list()) {
    if (l.r >= CHART_BAND.r0 && l.r <= CHART_BAND.r1) continue;
    out.lamp(l.c, l.r, l.ink, l.duty);
  }
  return out;
}

/** Only the chart band — the walk, the fence, the envelope. */
export function composeChart(s: FrameState): Field {
  const f = composeFrame(s);
  const out = new Field(WIDE_COLS, WIDE_ROWS);
  for (const l of f.list()) {
    if (l.r < CHART_BAND.r0 || l.r > CHART_BAND.r1) continue;
    out.lamp(l.c, l.r, l.ink, l.duty);
  }
  return out;
}

export function composeFrame(s: FrameState): Field {
  const f = new Field(WIDE_COLS, WIDE_ROWS);
  const w = 13 - s.l;
  const loser = s.winnerSide === 'HOME' ? 'AWAY' : 'HOME';
  const rows = boardMenu(s.l);
  const dim = s.phase !== 'idle';

  // ---- bezel: the ONE stroked geometry in the build, drawn as a run of lamps ----
  f.run(0, 0, WIDE_COLS, 'h', 'amber', 1).run(0, WIDE_ROWS - 1, WIDE_COLS, 'h', 'amber', 1);
  f.run(0, 0, WIDE_ROWS, 'v', 'amber', 1).run(WIDE_COLS - 1, 0, WIDE_ROWS, 'v', 'amber', 1);

  // ---- SCORE band ----------------------------------------------------------------
  // The LABEL is TEXT (1x); only the NUMERAL is SCORE (4x). Setting the whole string at
  // 4x needs 320 lamp columns on a 256-column board — which is what clipped it.
  const home = s.winnerSide === 'HOME' ? w : s.l, away = s.winnerSide === 'HOME' ? s.l : w;
  const NUM = 4, LAB = 1;
  const labDrop = Math.round((Field.glyphH(NUM) - Field.glyphH(LAB)) / 2);
  const wLab = Field.textWidth('HOME', LAB);
  const wNum = Field.textWidth(String(home), NUM), wNum2 = Field.textWidth(String(away), NUM);
  const bar = Field.scoreBarWidth(NUM), g1 = 6, g2 = 10;
  let x = Math.round((WIDE_COLS - (wLab + g1 + wNum + g2 + bar + g2 + wLab + g1 + wNum2)) / 2);
  f.text(x, R.scoreY + labDrop, 'HOME', 'amber', 2, LAB); x += wLab + g1;
  f.text(x, R.scoreY, String(home), 'amber', 4, NUM); x += wNum + g2;
  f.scoreBar(x, R.scoreY, 'amber', 3, NUM); x += bar + g2;
  f.text(x, R.scoreY + labDrop, 'AWAY', 'amber', 2, LAB); x += wLab + g1;
  f.text(x, R.scoreY, String(away), 'amber', 4, NUM);

  // The meta readout is NOT drawn here — ui.md §2.6 names three things that are not
  // bulbs, and the 45-glyph set has no '%' for exactly that reason.

  // ---- the chart ----------------------------------------------------------------
  // Anchored to the board's range: differentials run -l..+w and w + l is always 13, so
  // every board spans the same 13 units and the zero line simply sits where it belongs.
  const mid = rowForDiff(0, w, R.chartY);
  const chartW = 13 * CHART_COLSTEP;
  f.run(CHART_X, mid, chartW + 1, 'h', 'amber', 1, 2); // the zero line, alternating = a fence

  // the ticket's row is a fence the player can see the curve reaching for. GREEN while
  // the claim is alive, RED once it is refuted — nothing else is ever either ink.
  if (s.propId !== null && s.propId >= 2) {
    const fenceInk = s.phase === 'settled' && !s.result?.won ? 'red' : 'green';
    f.run(CHART_X, rowForDiff(ticketRow(s.propId), w, R.chartY), chartW + 1, 'h', fenceInk, s.phase === 'idle' ? 1 : 2, 3);
  }

  if (s.phase === 'idle') {
    // The reachable envelope — every ordering that ends this score lives inside this
    // wedge. Drawn as a CONNECTED boundary, not a lamp per point: at colStep 8 the
    // isolated nodes read as scattered noise rather than as a shape. Its boundary sits
    // at d2 (ui.md §2.2) — one d4 region per frame, and it is not this one.
    let pux = CHART_X, puy = mid, plx = CHART_X, ply = mid;
    for (let i = 1; i <= 13; i++) {
      const x = CHART_X + i * CHART_COLSTEP;
      const uy = rowForDiff(Math.min(i, w), w, R.chartY);
      const ly = rowForDiff(-Math.min(i, s.l), w, R.chartY);
      for (const [x0, y0, x1, y1] of [[pux, puy, x, uy], [plx, ply, x, ly]] as const) {
        const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy));
        for (let k = 1; k <= n; k++) {
          f.lamp(x0 + Math.round((dx * k) / n), y0 + Math.round((dy * k) / n), 'amber', 2);
        }
      }
      pux = x; puy = uy; plx = x; ply = ly;
    }
  } else if (s.result) {
    drawWalk(f, s.result.mask, s.beat, R.chartY, w, { headHot: s.headHot, ghost: s.ghost });
  }

  // ---- menu head ----------------------------------------------------------------
  if (s.phase === 'idle') {
    f.text(R.nameX, R.headY, `${fmtCount(rows[0].total)} ORDERS END ${w}−${s.l} · PICK ONE`, 'amber', 3);
  } else if (s.result) {
    f.text(R.nameX, R.headY, formatPathId(s.result.pathId, rows[0].total), 'amber', 3);
  }

  // ---- the priced rows. Hierarchy is DUTY, never size (ui.md §2.2). ----
  rows.forEach((row, i) => {
    const y = R.rowY + i * R.rowStep;
    const picked = s.propId !== null && i === rows.findIndex(r => r.prop === rows[s.propId as number]?.prop);
    const isMine = s.propId !== null && rowIndexForProp(rows, s.propId) === i;
    // R6: the row names its subject. A bare "STRUCK FIRST" is a statistic with no subject.
    const name = row.prop === 'STRUCK FIRST' ? `${loser} STRUCK FIRST` : row.prop;
    let ink: 'amber' | 'green' | 'red' = 'amber';
    let duty = dim && !isMine ? 1 : 3;
    if (isMine) {
      // GREEN is your ticket alive; RED is your ticket dead. Nothing else is ever either.
      ink = s.phase === 'settled' ? (s.result?.won ? 'green' : 'red') : 'green';
      duty = 4;
    } else if (s.phase === 'idle' && s.hover === i) {
      duty = 4; // the focus tick — a duty state, never an outline
    }
    void picked;
    f.text(R.nameX, y, name, ink, duty);
    const cnt = `${fmtCount(row.count)} OF ${fmtCount(row.total)}`;
    f.text(R.countRight - Field.textWidth(cnt), y, cnt, ink, Math.max(1, duty - 1));
    const pay = formatPayout(row);
    f.text(R.payRight - Field.textWidth(pay), y, pay, ink, isMine ? 4 : (i === rows.length - 1 && !dim ? 4 : duty));
  });

  // ---- controls band + the permanent rules line (ui.md §5.6) ----
  if (s.phase === 'settled' && s.result) {
    const verdict = s.result.won ? 'PAID' : 'NO PAY';
    f.text(R.nameX, R.ctrlY, verdict, s.result.won ? 'green' : 'red', 4);
    const again = 'CLICK TO DEAL AGAIN';
    f.text(R.payRight - Field.textWidth(again), R.ctrlY, again, 'amber', 2);
  } else {
    // TURBO is a real focusable DOM button (see App.tsx) laid over this band, so the
    // lamp layer must not print the word twice — the first pass overlapped them.
    const pass = s.phase === 'idle' ? 'PICK A TICKET' : 'WAITING';
    f.text(R.payRight - Field.textWidth(pass), R.ctrlY, pass, 'amber', 2);
  }
  f.text(R.nameX, R.rulesY, 'EV IS THE SAME ON EVERY TICKET.', 'amber', 2);

  return f;
}

/** Menu order is STRUCK FIRST, NEVER BEHIND, then the k-down ladder — so a propId maps
 *  straight onto its row index for every board that lists it. */
export function rowIndexForProp(rows: ReturnType<typeof boardMenu>, propId: PropId): number {
  const want = ['STRUCK FIRST', 'NEVER BEHIND', 'CAME BACK', 'TWO DOWN', 'THREE DOWN', 'FOUR DOWN'][propId];
  return rows.findIndex(r => r.prop === want);
}

export { curve };
