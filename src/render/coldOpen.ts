/**
 * The cold open — ui.md §9.3. At 1,200 ms with zero interaction the player is looking
 * at the whole game: the posted score, the reachable envelope, and the full priced menu.
 *
 * No splash, no "how to play", no modal, no connect-wallet, no tutorial. The entire game
 * is legible in one still frame — the cheapest Novelty + Simplicity win available.
 *
 * ui.md §4.2 is a table of NAMED RECTANGLES, and improvising these numbers is how the
 * first pass shipped a SCORE band wider than its own board and a name column that ran
 * through the count column. Every band below is declared once, here.
 */
import { Field } from './bulbs';
import { boardMenu, formatPayout } from '../game/menu';

export const WIDE_COLS = 256, WIDE_ROWS = 152;

/** The named rectangles. Rows are the vertical grid; the three columns are x-edges. */
const R = {
  scoreY: 5,          // SCORE band, 4x -> 28 lamp rows tall
  chartY: 37, chartH: 20,
  headY: 62,
  rowY: 73, rowStep: 9,
  ctrlY: 130,
  rulesY: 141,
  nameX: 8,           // R6 widened the name column to 18 glyphs, cols 8-115
  countRight: 200,
  payRight: 248,
} as const;

const fmtCount = (n: number): string => n.toLocaleString('en-US');

export function composeColdOpen(l: number, winnerSide: 'HOME' | 'AWAY'): Field {
  const f = new Field(WIDE_COLS, WIDE_ROWS);
  const w = 13 - l;
  const loser = winnerSide === 'HOME' ? 'AWAY' : 'HOME';
  const rows = boardMenu(l);

  // ---- bezel: the ONE stroked geometry in the build, drawn as a run of lamps ----
  f.run(0, 0, WIDE_COLS, 'h', 'amber', 1).run(0, WIDE_ROWS - 1, WIDE_COLS, 'h', 'amber', 1);
  f.run(0, 0, WIDE_ROWS, 'v', 'amber', 1).run(WIDE_COLS - 1, 0, WIDE_ROWS, 'v', 'amber', 1);

  // ---- SCORE band ----------------------------------------------------------------
  // The LABEL is TEXT (1x); only the NUMERAL is SCORE (4x). Setting the whole string at
  // 4x needs 320 lamp columns on a 256-column board, which is what clipped "HOME"/"5"
  // off both edges. ui.md §3's two scales are per-RUN, not per-line.
  const home = winnerSide === 'HOME' ? w : l, away = winnerSide === 'HOME' ? l : w;
  const NUM = 4, LAB = 1;
  const labDrop = Math.round((Field.glyphH(NUM) - Field.glyphH(LAB)) / 2); // optical centring
  const wLab = Field.textWidth('HOME', LAB);
  const wNum = Field.textWidth(String(home), NUM);
  const wNum2 = Field.textWidth(String(away), NUM);
  const bar = Field.scoreBarWidth(NUM);
  const g1 = 6, g2 = 10;
  const total = wLab + g1 + wNum + g2 + bar + g2 + wLab + g1 + wNum2;
  let x = Math.round((WIDE_COLS - total) / 2);

  f.text(x, R.scoreY + labDrop, 'HOME', 'amber', 2, LAB); x += wLab + g1;
  f.text(x, R.scoreY, String(home), 'amber', 4, NUM); x += wNum + g2;
  f.scoreBar(x, R.scoreY, 'amber', 3, NUM); x += bar + g2;
  f.text(x, R.scoreY + labDrop, 'AWAY', 'amber', 2, LAB); x += wLab + g1;
  f.text(x, R.scoreY, String(away), 'amber', 4, NUM);

  // The meta readout is NOT drawn here. ui.md §2.6 names exactly three things that are
  // not made of bulbs — the boot wordmark, the meta readout, the DEMO badge — and the
  // 45-glyph set has no '%' precisely because that string never becomes lamps.

  // ---- the chart: the reachable envelope, colStep:rowStep = 4:1 on every board ----
  const colStep = 4, chartX = R.nameX, mid = R.chartY + Math.round(R.chartH / 2);
  f.run(chartX, mid, 13 * colStep + 1, 'h', 'amber', 1, 2); // zero line, alternating = a fence
  for (let i = 0; i <= 13; i++) {
    // the envelope boundary is d2 (ui.md §2.2): how far ahead or behind the curve can
    // still be after i points have been played.
    f.lamp(chartX + i * colStep, mid - Math.min(i, w), 'amber', 2);
    f.lamp(chartX + i * colStep, mid + Math.min(i, l), 'amber', 2);
  }

  // ---- menu head: the only instruction in the product ----
  f.text(chartX, R.headY, `${fmtCount(rows[0].total)} ORDERS END ${w}−${l} · PICK ONE`, 'amber', 3);

  // ---- the priced rows. Hierarchy is DUTY, never size (ui.md §2.2). ----
  rows.forEach((row, i) => {
    const y = R.rowY + i * R.rowStep;
    // R6: the row names its subject. A bare "STRUCK FIRST" is a statistic with no subject.
    const name = row.prop === 'STRUCK FIRST' ? `${loser} STRUCK FIRST` : row.prop;
    f.text(R.nameX, y, name, 'amber', 3);
    // count column is FLUSH RIGHT so `13 OF 1,287` lines up under `495 OF 1,287`
    const cnt = `${fmtCount(row.count)} OF ${fmtCount(row.total)}`;
    f.text(R.countRight - Field.textWidth(cnt), y, cnt, 'amber', 2);
    const pay = formatPayout(row);
    // the tail ticket is the one region lit at full duty — it is the headline number
    f.text(R.payRight - Field.textWidth(pay), y, pay, 'amber', i === rows.length - 1 ? 4 : 3);
  });

  // ---- controls band + the permanent rules line (ui.md §5.6) ----
  f.text(R.nameX, R.ctrlY, 'TURBO  SOUND', 'amber', 2);
  const pass = 'PASS · FREE';
  f.text(R.payRight - Field.textWidth(pass), R.ctrlY, pass, 'amber', 2);
  f.text(R.nameX, R.rulesY, 'EV IS THE SAME ON EVERY TICKET.', 'amber', 2);

  return f;
}
