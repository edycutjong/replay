/** The 13-beat replay curve, drawn on the same bulb field as everything else. */
import type { Field, Ink } from './bulbs';

// ui.md §5.2: ONE chart geometry, colStep : rowStep = 4 : 1 on every board and every
// asset. At 4:1 with rowStep 1 the reveal was 52 lamps wide in a 256-lamp board and the
// curve read as dust. Same ratio, double the scale: rowStep 2, colStep 8.
// centred on the 256-column board: 13 * 8 = 104 lamps wide, so x0 = (256 - 104) / 2
export const CHART_COLSTEP = 8, CHART_ROWSTEP = 2;
export const CHART_X = Math.round((256 - 13 * CHART_COLSTEP) / 2);

/** The running differential after each of the 13 points. Positive = winner ahead. */
export function curve(mask: number): number[] {
  const out: number[] = [];
  let d = 0;
  for (let i = 0; i < 13; i++) { d += ((mask >> i) & 1) !== 0 ? -1 : 1; out.push(d); }
  return out;
}

/**
 * Draw the walk up to `beat` beats (0 = nothing yet). The head bulb strikes at signal
 * white and settles to amber; the trail sits at d2. Both sides settle to the SAME hue —
 * direction carries which side scored, and pitch carries it in the ear, so a second path
 * colour would spend an ink on information already encoded twice (ui.md §6.4).
 */
export function drawWalk(
  f: Field,
  mask: number,
  beat: number,
  chartY: number,
  chartH: number,
  opts: { headHot?: boolean; ink?: Ink; ghost?: boolean } = {},
): void {
  const mid = chartY + Math.round(chartH / 2);
  const pts = curve(mask);
  const ink: Ink = opts.ghost ? 'red' : (opts.ink ?? 'amber');
  let prevX = CHART_X, prevY = mid;
  for (let i = 0; i < Math.min(beat, 13); i++) {
    const x = CHART_X + (i + 1) * CHART_COLSTEP;
    const y = mid - pts[i] * CHART_ROWSTEP;
    const isHead = i === beat - 1;
    // the connecting run — every line in this product is a run of lit bulbs (§2.4).
    // Walk the diagonal so the curve reads as one continuous stroke, not a dot per point.
    const dx = x - prevX, dy = y - prevY, steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let s = 1; s < steps; s++) {
      f.lamp(prevX + Math.round((dx * s) / steps), prevY + Math.round((dy * s) / steps), ink, 2);
    }
    // the node itself sits a duty above its own trail
    f.lamp(x, y, ink, 3);
    if (isHead) {
      // the head bulb strikes at signal white for one frame, then settles to amber d3
      if (opts.headHot) { f.lamp(x, y, 'signal', 4); f.lamp(x, y - 1, ink, 2); f.lamp(x, y + 1, ink, 2); }
      else f.lamp(x, y, ink, 4);
    }
    prevX = x; prevY = y;
  }
}
