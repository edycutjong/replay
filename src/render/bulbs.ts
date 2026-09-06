/**
 * THE renderer. ui.md §10 answers "style drifts between screens" with:
 * "There is one screen and one renderer." This is that renderer, ported from the
 * asset pipeline's `_bulb.js` so the game cannot disagree with the icon or the hero —
 * same geometry function, same glyph set, same duty ramps, different rectangles.
 *
 * Fidelity contract with specs/ui.md:
 *   §2.1  four inks x four duties; amber shifts hue as it dims, LEDs do not
 *   §2.2  hierarchy is DUTY, never size
 *   §2.3  zero light sources; bloom is baked into the sprite and ADDS
 *   §2.4  every rule/axis/curve/divider is a run of lit bulbs
 *   §2.7  integer pitch always; bulb diameter 0.62 x pitch; halo 3.0 x diameter
 *   §3    ONE glyph set; TWO scales and only two — TEXT 1x, SCORE 4x
 */

export type Ink = 'amber' | 'green' | 'red' | 'signal';

const INK: Record<Ink, { ramp: string[]; core: string }> = {
  amber: { ramp: ['#3D1F04', '#8A4E08', '#D07F14', '#FFA51E'], core: '#FFE9C2' },
  green: { ramp: ['#0A2B14', '#1C7A34', '#2FC754', '#3DFF6E'], core: '#D6FFE3' },
  red: { ramp: ['#2B0906', '#7A1A15', '#BF2822', '#E8322A'], core: '#FFD5D2' },
  signal: { ramp: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'], core: '#FFFFFF' },
};

/** halo alpha by duty. d0 never draws. */
const HALO = [0, 0.1, 0.22, 0.44, 0.78];
/** per-ink halo reach; signal carries further because it is the strike bulb. */
const REACH: Record<Ink, number> = { amber: 1, green: 1, red: 1, signal: 1.6 };

const color = (ink: Ink, duty: number): string => {
  // `color` is module-private and its one call site (makeSprites) only ever passes an
  // Ink drawn from the fixed ['amber','green','red','signal'] loop below, so INK[ink] is
  // never undefined through any reachable path — this guards a bad cast, not a real case.
  /* v8 ignore next -- unreachable through the typed call site; see above */
  const e = INK[ink] ?? INK.amber;
  return duty >= 4 ? e.ramp[3] : e.ramp[Math.max(0, Math.min(3, duty - 1))];
};

/** the 5x7 glyph set (ui.md §3.2). One bitmap per glyph, no second typeface. */
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00110', '01100'],
  '·': ['00000', '00000', '00000', '01100', '01100', '00000', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  // left-aligned 3x3 operator, not the letter X — see _bulb.js for the two
  // corrections this glyph went through; `96.03×` is the most repeated string here.
  '×': ['00000', '00000', '10100', '01000', '10100', '00000', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '−': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};

const ADVANCE = 6, GLYPH_W = 5, GLYPH_H = 7;
/** ui.md §3: TEXT 1x and SCORE 4x. "No third scale, ever." */
const SCALES = [1, 4];

export type Lamp = { c: number; r: number; ink: Ink; duty: number };

export class Field {
  readonly cols: number;
  readonly rows: number;
  private lamps = new Map<string, Lamp>();

  constructor(cols: number, rows: number) { this.cols = cols; this.rows = rows; }

  list(): Lamp[] { return [...this.lamps.values()]; }

  lamp(c: number, r: number, ink: Ink, duty: number): this {
    c = Math.round(c); r = Math.round(r);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || duty <= 0) return this;
    const k = `${c},${r}`, prev = this.lamps.get(k);
    // brighter wins: a d4 head bulb is never dimmed by a d2 trail drawn after it
    if (prev && prev.duty > duty) return this;
    this.lamps.set(k, { c, r, ink, duty: Math.min(4, duty) });
    return this;
  }

  /** a run of lit bulbs — the ONLY way this product draws a line (ui.md §2.4). */
  run(c: number, r: number, len: number, dir: 'h' | 'v', ink: Ink, duty: number, every = 1): this {
    for (let i = 0; i < len; i++) {
      if (i % every) continue;
      if (dir === 'v') this.lamp(c, r + i, ink, duty); else this.lamp(c + i, r, ink, duty);
    }
    return this;
  }

  rect(c: number, r: number, w: number, h: number, ink: Ink, duty: number): this {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.lamp(c + x, r + y, ink, duty);
    return this;
  }

  /** TEXT at scale 1; SCORE is this at scale 4 — more lamps, not a second typeface. */
  text(c: number, r: number, str: string, ink: Ink, duty: number, scale = 1, track = 0): this {
    if (!SCALES.includes(scale)) throw new Error(`type scale ${scale} — ui.md §3 declares TWO scales`);
    const s = String(str).toUpperCase(), adv = ADVANCE * scale + track;
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]];
      // FONT maps ' ' to a blank glyph, so `!g` is never true for a space in today's
      // 45-glyph set — the `continue` here only matters if that entry is ever removed.
      // Left in as a guard against exactly that regression rather than deleted for
      // coverage's sake, which is how it would go unnoticed until the crash it prevents.
      /* v8 ignore next -- see above: unreachable while FONT[' '] exists */
      if (!g) { if (s[i] !== ' ') throw new Error(`glyph not in the 45-set: ${JSON.stringify(s[i])}`); continue; }
      const ox = c + i * adv;
      for (let gy = 0; gy < GLYPH_H; gy++) for (let gx = 0; gx < GLYPH_W; gx++) {
        if (g[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++)
          this.lamp(ox + gx * scale + sx, r + gy * scale + sy, ink, duty);
      }
    }
    return this;
  }

  /** the SCORE band separator: a solid bar, the 11th SCORE glyph — not the U+2212 TEXT glyph. */
  scoreBar(c: number, r: number, ink: Ink, duty: number, scale = 4): this {
    const w = 4 * scale, h = Math.max(1, Math.round(scale * 0.75));
    return this.rect(c, r + Math.round((GLYPH_H * scale - h) / 2), w, h, ink, duty);
  }

  static textWidth(str: string, scale = 1, track = 0): number {
    return Math.max(0, str.length - 1) * (ADVANCE * scale + track) + GLYPH_W * scale;
  }

  /** THE wordmark, drawn the one way it is allowed to be drawn: 4x with 7 lamp columns
   *  of extra tracking -> 175 x 28 lamps. The tracking is not taste — the boot handoff
   *  superimposes Archivo Black's REPLAY on this one and dissolves it, so the two must
   *  occupy the same box on both axes (aspect 6.25 vs the typeface's 6.342). */
  wordmark(c: number, r: number, ink: Ink, duty: number): this {
    return this.text(c, r, 'REPLAY', ink, duty, 4, 7);
  }
  static wordmarkWidth(): number { return Field.textWidth('REPLAY', 4, 7); }
  static scoreBarWidth(scale = 4): number { return 4 * scale; }
  static glyphH(scale = 1): number { return GLYPH_H * scale; }
}

export type Geometry = { pitch: number; dia: number; bloom: number; x0: number; y0: number; w: number; h: number };

/** integer pitch at every viewport width — half-pixel bulbs are what make retro
 *  renderers look blurry and fake (ui.md §2.7). Evaluated in DEVICE pixels. */
export function geometry(W: number, H: number, cols: number, rows: number, dpr = 1): Geometry {
  const pitch = Math.max(3, Math.floor(Math.min(W / cols, H / rows))) * dpr;
  const bw = cols * pitch, bh = rows * pitch;
  return {
    pitch,
    dia: pitch * 0.62,
    bloom: bloomFor(pitch),
    x0: Math.round((W * dpr - bw) / 2),
    y0: Math.round((H * dpr - bh) / 2),
    w: bw, h: bh,
  };
}

/**
 * ui.md §4.4, all THREE bands — evaluated on the pitch in the OUTPUT image, not in CSS
 * pixels. The asset pipeline's _bulb.js documents this rule in its own header and then
 * implements only two of the bands (`pitch < 5 ? 1.6 : 3.0`), so the top band was never
 * applied anywhere. A typical desktop at 2x lands on pitch 10, i.e. squarely in it: the
 * game was drawing an 18.6px halo around a 6.2px bulb, which is why glyphs read as soft
 * rather than as discrete lamps.
 *
 * Dense boards need a small halo or the lamps merge; sparse, large-pitch boards need a
 * small halo for the opposite reason — at 10px per lamp a 3.0 ratio is pure smear.
 */
export function bloomFor(pitch: number): number {
  if (pitch < 5) return 1.6;  // density floor — lamps would otherwise merge
  if (pitch > 8) return 2.0;  // large pitch — 3.0 here is smear, not bloom
  return 3.0;
}

const hexa = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

type Sprites = { data: Record<string, Uint8ClampedArray>; R: number; S: number };

/** one baked sprite per ink+duty. Bloom is IN the sprite; there are no light sources. */
export function makeSprites(geo: Geometry): Sprites {
  const data: Record<string, Uint8ClampedArray> = {};
  const R = Math.ceil(Math.max(2, Math.ceil((geo.dia * geo.bloom) / 2)) * 1.6), S = R * 2;
  (['amber', 'green', 'red', 'signal'] as Ink[]).forEach(ink => {
    for (let d = 1; d <= 4; d++) {
      if (ink === 'signal' && d < 4) continue;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const x = cv.getContext('2d')!;
      const body = color(ink, d), core = INK[ink].core;
      const edge = geo.dia / 2 / (R * REACH[ink]);
      const g = x.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, d >= 4 ? core : body);
      g.addColorStop(Math.max(0.02, edge * 0.55), body);
      g.addColorStop(Math.min(0.99, edge), hexa(body, 0.92));
      g.addColorStop(Math.min(0.995, edge + (1 - edge) * 0.35), hexa(body, HALO[d] * 0.55));
      g.addColorStop(1, hexa(body, 0));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      data[ink + d] = x.getImageData(0, 0, S, S).data;
    }
  });
  return { data, R, S };
}

const px = (g: Geometry, c: number) => g.x0 + c * g.pitch + g.pitch / 2;
const py = (g: Geometry, r: number) => g.y0 + r * g.pitch + g.pitch / 2;

/** Reused across frames. A fresh Float32Array for a 2560x1600 canvas is 47MB, and
 *  allocating one per frame is pure garbage-collector pressure during the replay. */
let accCache: Float32Array | null = null;

export interface Region { x: number; y: number; w: number; h: number }

/**
 * Composites additively into a float buffer and clamps PROPORTIONALLY.
 * `globalCompositeOperation='lighter'` clamps per channel, which saturates R and G
 * together and slides stacked amber halos to pure yellow — a measured, shipped bug
 * in the asset suite's v1. A proportional clamp keeps the hue of a sum of ambers
 * inside the amber ramp's own window.
 *
 * `region` (DEVICE pixels) restricts the read-modify-write to a sub-rectangle. Redrawing
 * the whole 4.1M-pixel canvas per beat cost ~80ms — about 12fps, which is what "not
 * smooth" looks like. During the replay only the chart band changes, so only the chart
 * band is recomputed.
 */
export function renderCanvas(
  field: Field,
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  sprites: Sprites,
  region?: Region,
): void {
  const rx = region ? Math.max(0, region.x) : 0;
  const ry = region ? Math.max(0, region.y) : 0;
  const W = region ? Math.min(region.w, ctx.canvas.width - rx) : ctx.canvas.width;
  const H = region ? Math.min(region.h, ctx.canvas.height - ry) : ctx.canvas.height;
  if (W <= 0 || H <= 0) return;
  const base = ctx.getImageData(rx, ry, W, H), bd = base.data;
  const need = W * H * 3;
  if (!accCache || accCache.length < need) accCache = new Float32Array(need);
  const acc = accCache;
  acc.fill(0, 0, need);
  const S = sprites.S;

  for (const l of field.list()) {
    const img = sprites.data[l.ink + l.duty];
    if (!img) continue;
    const ox = Math.round(px(geo, l.c) - sprites.R) - rx, oy = Math.round(py(geo, l.r) - sprites.R) - ry;
    if (ox + S < 0 || oy + S < 0 || ox >= W || oy >= H) continue; // outside the dirty region
    for (let y = 0; y < S; y++) {
      const ty = oy + y;
      if (ty < 0 || ty >= H) continue;
      const row = ty * W;
      for (let x = 0; x < S; x++) {
        const tx = ox + x;
        if (tx < 0 || tx >= W) continue;
        const si = (y * S + x) * 4, a = img[si + 3];
        if (!a) continue;
        const af = a / 255, di = (row + tx) * 3;
        acc[di] += img[si] * af; acc[di + 1] += img[si + 1] * af; acc[di + 2] += img[si + 2] * af;
      }
    }
  }

  for (let p = 0, q = 0; q < need; p += 4, q += 3) {
    let r = bd[p] + acc[q], g = bd[p + 1] + acc[q + 1], b = bd[p + 2] + acc[q + 2];
    const m = Math.max(r, g, b);
    if (m > 255) { const k = 255 / m; r *= k; g *= k; b *= k; } // proportional: hue survives
    bd[p] = r; bd[p + 1] = g; bd[p + 2] = b;
  }
  ctx.putImageData(base, rx, ry);
}

/** Lamp-space rectangle -> device-pixel region, padded by the sprite radius so a lamp's
 *  bloom is never clipped at the seam. */
export function lampRegion(geo: Geometry, sprites: Sprites, c0: number, r0: number, c1: number, r1: number): Region {
  const pad = sprites.R + 2;
  const x = Math.floor(geo.x0 + c0 * geo.pitch) - pad;
  const y = Math.floor(geo.y0 + r0 * geo.pitch) - pad;
  return { x, y, w: Math.ceil((c1 - c0 + 1) * geo.pitch) + pad * 2, h: Math.ceil((r1 - r0 + 1) * geo.pitch) + pad * 2 };
}
export type { Sprites };

/**
 * THE SOCKET FIELD — ui.md §2.1's third substrate value. A real bulb board is a lattice
 * of sockets, most of them dark; without it, lit lamps float on void and the frame reads
 * as text on black rather than as hardware with most of its lamps off. It is also what
 * makes the lit lamps read as *lit* — a bulb is only bright relative to its neighbours.
 *
 * Drawn as a tiled pattern rather than ~39,000 individual dots (256 x 152 positions).
 * The pattern is PHASED TO THE BOARD ORIGIN: a canvas pattern tiles from user-space
 * (0,0), not from the rect it fills, so filling the board rect directly would sit the
 * sockets off the lamp lattice by whatever x0 mod pitch happens to be — the asset
 * pipeline shipped exactly that bug, and every lit lamp carried a dark crescent.
 */
export function drawSocketField(ctx: CanvasRenderingContext2D, geo: Geometry): void {
  const tile = document.createElement('canvas');
  tile.width = geo.pitch; tile.height = geo.pitch;
  const t = tile.getContext('2d')!;
  const d = Math.max(1, geo.dia * 0.5);
  t.fillStyle = '#12151C';
  t.beginPath();
  t.arc(geo.pitch / 2, geo.pitch / 2, d / 2, 0, Math.PI * 2);
  t.fill();
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.translate(geo.x0, geo.y0); // phase the lattice to the board, not to the canvas
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, geo.w, geo.h);
  ctx.restore();
}
