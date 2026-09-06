/**
 * favicon — the one exported asset, generated at build time. `prebuild`
 *
 * ui.md G4 is "zero authored image or audio files, exactly one build-time export".
 * Drawing the tab icon here rather than checking a .png into the repo is what keeps
 * that true: the mark comes out of the SAME Field/FONT the board is drawn with, so it
 * cannot drift from the game's own typeface, and there is no second place where the
 * amber ramp is written down.
 *
 * It also sidesteps the bloom defect still sitting in the kitchen asset suite, whose
 * icon/OG/hero were rendered against a two-band bloom rule the game no longer uses.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { Field } from '../src/render/bulbs';

const VOID = '#05060B';
const AMBER = '#FFA51E';
const CORE = '#FFE9C2';

// 'R' at type scale 1 is 5x7 lamps; one lamp of padding on each side gives a 7x9 box.
const PAD = 1;
const f = new Field(5 + PAD * 2, 7 + PAD * 2).text(PAD, PAD, 'R', 'amber', 4);
const lamps = f.list();
if (lamps.length === 0) throw new Error('favicon: the glyph rendered no lamps');

const W = f.cols, H = f.rows;
// A tab icon is 16 px, so a lamp is barely two pixels: the bloom that carries the look
// at board scale just turns the glyph to mush here. One flat disc per lamp, plus a
// lighter core on the brightest, is the honest reduction.
const disc = (c: number, r: number, fill: string, rad: number): string =>
  `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="${rad}" fill="${fill}"/>`;

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="geometricPrecision">`,
  `<rect width="${W}" height="${H}" fill="${VOID}"/>`,
  ...lamps.map(l => disc(l.c, l.r, AMBER, 0.42)),
  ...lamps.map(l => disc(l.c, l.r, CORE, 0.16)),
  `</svg>`,
].join('');

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', svg + '\n');
console.log(`favicon: public/favicon.svg — ${lamps.length} lamps, ${W}x${H} lamp box, ${svg.length} bytes`);
