/**
 * gates — the mechanical rows of `ui.md` §13, as one command. `npm run gates`
 *
 * Nine gates: G1 G2 G3 G4 G9 G10 G11 G12 G14. They are here rather than in a checklist
 * because 20,000 pixel samples and 2,241 viewport measurements are not something a
 * person does by hand, and a gate that is only ever eyeballed is not a gate.
 *
 * Where a gate's spec names an artifact this build does not ship, the row reports N/A
 * with the reason and does NOT count as a pass. A gate that quietly passes because the
 * thing it inspects is absent is worse than no gate.
 *
 * Pass a production URL to run G12 against the live surface:
 *   npm run gates -- https://replay.edycu.dev
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Field, geometry } from '../src/render/bulbs';
import { R, WIDE_COLS, WIDE_ROWS } from '../src/render/coldOpen';
import { BOARDS, boardMenu, formatPayout } from '../src/game/menu';

const G = '\x1b[32m', RD = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', Z = '\x1b[0m';
const PROD = process.argv.find(a => a.startsWith('http'));
const rows: Array<{ g: string; s: 'PASS' | 'FAIL' | 'N/A'; d: string }> = [];
const pass = (g: string, d: string): void => { rows.push({ g, s: 'PASS', d }); };
const fail = (g: string, d: string): void => { rows.push({ g, s: 'FAIL', d }); };
const na = (g: string, d: string): void => { rows.push({ g, s: 'N/A', d }); };

const distFiles = (dir = 'dist'): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? distFiles(p) : [p];
  });

// Everything below reads dist/, so build once first.
execSync('npm run build', { stdio: 'pipe' });

// ---------------------------------------------------------------------------
// G3 — no stock chrome. The look is lamps, not CSS. <= 6 hits total across the
// built stylesheet, every one traceable to a named exception (ui.md §2.6).
// ---------------------------------------------------------------------------
{
  const css = distFiles().filter(f => extname(f) === '.css').map(f => readFileSync(f, 'utf8')).join('\n');
  const hits = ['box-shadow', 'linear-gradient', 'border-radius']
    .map(k => [k, (css.match(new RegExp(k, 'g')) ?? []).length] as const)
    .filter(([, n]) => n > 0);
  const total = hits.reduce((a, [, n]) => a + n, 0);
  const detail = hits.length ? hits.map(([k, n]) => `${k}x${n}`).join(' ') : 'none';
  total <= 6 ? pass('G3 ', `stock chrome ${total}/6 in the built CSS — ${detail}`)
             : fail('G3 ', `stock chrome ${total} > 6 — ${detail}`);
}

// ---------------------------------------------------------------------------
// G4 — asset inventory. Zero authored image or audio files: every pixel is drawn
// and every sound is synthesised. Exactly 1 is expected (the favicon export).
// ---------------------------------------------------------------------------
{
  const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp3', '.wav', '.ogg', '.m4a', '.svg']);
  const found = distFiles().filter(f => MEDIA.has(extname(f)));
  found.length === 1
    ? pass('G4 ', `asset inventory is exactly 1 — ${found[0]} (the build-time favicon)`)
    : fail('G4 ', `asset inventory is ${found.length}, expected 1: ${found.join(', ') || 'none'}`);
}

// ---------------------------------------------------------------------------
// G9 — string discipline, on the shipped bundle.
//
// The spec's primary sub-check greps a STRING TABLE module. This build has no such
// module — strings sit at their call sites — so that sub-check is reported N/A rather
// than passed. The four sub-checks that do not need the table run here.
// ---------------------------------------------------------------------------
{
  const js = distFiles().filter(f => extname(f) === '.js').map(f => readFileSync(f, 'utf8')).join('\n');
  const src = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter(f => typeof f === 'string' && /\.tsx?$/.test(f))
    .map(f => readFileSync(join('src', f), 'utf8')).join('\n');

  const problems: string[] = [];
  // the unspaced PATH form — `PATH 0010/1287` is a fail, `PATH 0010 / 1287` is the form
  if (/PATH [0-9]+\//.test(js)) problems.push('unspaced "PATH {ID}/{N}" in the bundle');
  // a bare, subject-less STRUCK FIRST reads as a claim about nobody
  const bareStruck = [...js.matchAll(/STRUCK FIRST/g)].length;
  const interpolated = [...js.matchAll(/(\{LOSER\}|\$\{[^}]*\}\s*)STRUCK FIRST/g)].length;
  // emoji anywhere in user-visible text
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src)) problems.push('emoji in a source string');
  // exclamation marks in rendered strings: the board does not shout
  const shouts = [...src.matchAll(/\.text\([^)]*'[^']*![^']*'/g)].length;
  if (shouts) problems.push(`${shouts} rendered string(s) containing "!"`);

  // every rendered literal fits 42 chars
  const long = [...src.matchAll(/\.text\(\s*[^,]+,\s*[^,]+,\s*'([^']{43,})'/g)].map(m => m[1]);
  if (long.length) problems.push(`${long.length} rendered string(s) over 42 chars: ${long[0].slice(0, 30)}…`);

  problems.length === 0
    ? pass('G9 ', `string discipline: no unspaced PATH, no emoji, no "!", none over 42 chars ${D}(STRUCK FIRST x${bareStruck}, ${interpolated} interpolated)${Z}`)
    : fail('G9 ', problems.join(' · '));
  na('G9b', 'string-table sub-check: this build ships no string-table module, so <=40 keys and "no user text outside the table" cannot be checked');
}

// ---------------------------------------------------------------------------
// G10 — integer pitch. Sweep 320 -> 2560 px in 1 px steps (2,241 measurements) and
// assert the pitch stays an integer and the board never exceeds the viewport.
// ---------------------------------------------------------------------------
{
  // Two invariants, at the level each one actually lives at. The pitch is an integer
  // in the BACKING STORE, which is what keeps a lamp a square of whole device pixels.
  // Fitting the viewport is then a property of the DISPLAYED size, because App.tsx
  // scales the board down when it does not fit — asserting it against geometry() alone
  // reported a fail at every width under 768 px while the shipped page was fine.
  let bad = '';
  let n = 0, scaled = 0;
  for (let w = 320; w <= 2560; w++) {
    for (const dpr of [1, 2]) {
      const h = Math.round(w * 760 / 1280);
      const geo = geometry(w, h, WIDE_COLS, WIDE_ROWS, dpr);
      n++;
      if (geo.pitch !== Math.floor(geo.pitch)) { bad = `pitch ${geo.pitch} is not an integer at ${w}px dpr${dpr}`; break; }
      const cssW = geo.w / dpr, cssH = geo.h / dpr;
      const fit = Math.min(1, w / cssW, h / cssH);
      if (fit < 1) scaled++;
      if (Math.round(cssW * fit) > w + 1 || Math.round(cssH * fit) > h + 1) {
        bad = `displayed board ${Math.round(cssW * fit)}x${Math.round(cssH * fit)} exceeds ${w}x${h} at dpr${dpr}`;
        break;
      }
    }
    if (bad) break;
  }
  bad ? fail('G10', bad)
      : pass('G10', `integer pitch and an in-viewport displayed board over ${n.toLocaleString('en-US')} measurements (320-2560 px, dpr 1 and 2; ${scaled} of them scaled to fit)`);
}

// ---------------------------------------------------------------------------
// G14 — menu column budget. All 25 rendered rows: each field inside its §4.2
// rectangle at advance 6, no two overlapping, and the count column's right edge
// identical across every row (fitting a rectangle is not the same as forming a
// column, and a ragged column of integers is the defect the frame contradicts).
// ---------------------------------------------------------------------------
{
  const problems: string[] = [];
  const rightEdges = new Set<number>();
  let widest = { s: '', w: 0, board: '' };
  let rowCount = 0;

  for (const l of BOARDS) {
    for (const row of boardMenu(l)) {
      rowCount++;
      const name = row.prop;
      const count = `${row.count.toLocaleString('en-US')} OF ${row.total.toLocaleString('en-US')}`;
      const payout = formatPayout(row);

      const nameW = Field.textWidth(name);
      const countW = Field.textWidth(count);
      const payW = Field.textWidth(payout);

      const nameX0 = R.nameX, nameX1 = nameX0 + nameW;
      const countX1 = R.countRight, countX0 = countX1 - countW;
      const payX1 = R.payRight, payX0 = payX1 - payW;

      if (countW > widest.w) widest = { s: count, w: countW, board: row.board };
      rightEdges.add(countX1);

      if (nameX1 > 115) problems.push(`${row.board} ${name}: name runs to col ${nameX1} > 115`);
      if (nameX1 >= countX0) problems.push(`${row.board} ${name}: name (->${nameX1}) overlaps count (${countX0}->)`);
      if (countX1 >= payX0) problems.push(`${row.board} ${name}: count (->${countX1}) overlaps payout (${payX0}->)`);
      if (payX1 > WIDE_COLS - 2) problems.push(`${row.board} ${name}: payout right edge ${payX1} outside the board`);
      if (countX0 < 0 || payX0 < 0) problems.push(`${row.board} ${name}: field starts off-board`);
    }
  }

  const gutter = R.countRight - (R.nameX + Math.max(...BOARDS.flatMap(l => boardMenu(l).map(r => Field.textWidth(r.prop)))));
  if (rightEdges.size !== 1) problems.push(`the count column has ${rightEdges.size} distinct right edges — it is not a column`);
  if (rowCount !== 25) problems.push(`rendered ${rowCount} rows, expected 25`);

  problems.length === 0
    ? pass('G14', `25 rows fit at advance 6, no overlap, count right-aligned to one column (${[...rightEdges][0]}); worst count "${widest.s}" on ${widest.board}, gutter ${gutter} cols`)
    : fail('G14', problems.slice(0, 3).join(' · ') + (problems.length > 3 ? ` (+${problems.length - 3} more)` : ''));
  na('G14b', 'TALL breakpoint: this build ships one breakpoint (WIDE 256x152); the TALL rectangles in ui.md 4.3 have no implementation to measure');
}

// ---------------------------------------------------------------------------
// Browser gates: G1, G2, G11 (local dist), G12 (the live surface).
// ---------------------------------------------------------------------------
{
  const { chromium } = await import('playwright');
  const { createServer } = await import('node:http');
  const MIME: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
  };
  const server = createServer((req, res) => {
    const rel = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
    try {
      const body = readFileSync(join('dist', rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise<void>(r => server.listen(4320, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

  // G1 — bare URL, no interaction, posted score and full priced menu painted <= 1.2 s.
  const t0 = Date.now();
  await page.goto('http://localhost:4320/', { waitUntil: 'commit' });
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return false;
    const d = ctx.getImageData(0, Math.floor(c.height * 0.52), c.width, Math.floor(c.height * 0.34)).data;
    let lit = 0;
    for (let p = 0; p < d.length; p += 4 * 53) if (d[p] > 90) lit++;
    return lit > 60;
  }, null, { timeout: 20000 });
  const cold = Date.now() - t0;
  cold <= 1200 ? pass('G1 ', `cold open painted the score and the priced menu in ${cold} ms (<= 1200)`)
               : fail('G1 ', `cold open took ${cold} ms (> 1200)`);

  await page.waitForTimeout(2600); // let the boot sequence finish before sampling

  // G2 — hue discipline, on the COMPOSITE. Sample 1,000 pixels from each of 20 frames
  // across a round; every hue cluster holding >= 1% of the LIT sample must sit within
  // 12 deg of one of the four inks, or be achromatic. Bloom makes intermediate
  // LUMINANCES, never intermediate hues — that is the property being defended.
  {
    // measured off the INK ramps in bulbs.ts, not guessed: amber #FFA51E -> 36 deg,
    // green #3DFF6E -> 137, red #E8322A -> 3. signal is #FFFFFF, i.e. achromatic, and
    // is caught by the chroma < 25 branch rather than by a hue.
    const INK_HUES = [36, 137, 3];
    const samples: number[] = [];
    let lit = 0, achromatic = 0;
    for (let f = 0; f < 20; f++) {
      const px: number[][] = await page.evaluate(`
        (() => {
          const c = document.querySelector('canvas');
          const ctx = c.getContext('2d');
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          const out = [];
          for (let i = 0; i < 1000; i++) {
            const p = (Math.floor(Math.random() * (d.length / 4))) * 4;
            out.push([d[p], d[p + 1], d[p + 2]]);
          }
          return out;
        })()
      `);
      for (const [r, g, b] of px) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx < 40) continue;               // unlit socket, not part of the lit sample
        lit++;
        const chroma = mx - mn;
        if (chroma < 25) { achromatic++; continue; }
        let h: number;
        if (mx === r) h = 60 * (((g - b) / chroma) % 6);
        else if (mx === g) h = 60 * ((b - r) / chroma + 2);
        else h = 60 * ((r - g) / chroma + 4);
        samples.push((h + 360) % 360);
      }
      await page.waitForTimeout(60);
    }
    // circular hue distance: |((a-b+540) mod 360) - 180| is already the short way
    // round. The first version wrote `180 - d <= 12` and so tested for the LONG way,
    // which reported 98.9% of a perfectly disciplined frame as off-ink.
    // The gate is about CLUSTERS, not about total stray mass: bloom compositing and
    // canvas antialiasing always leave a thin scatter of intermediate hues, and the
    // property being defended is that no POPULATION of off-ink pixels exists. Bin the
    // hues at 4 deg, keep every bin holding >= 1% of the lit sample, and require each
    // survivor to sit within tolerance of an ink.
    const BIN = 4;
    const bins = new Map<number, number>();
    for (const h of samples) {
      const k = Math.floor(h / BIN);
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    const onInk = (h: number): boolean => INK_HUES.some(ink => Math.abs(((h - ink + 540) % 360) - 180) <= 12);
    const offClusters = [...bins.entries()]
      .filter(([k, n]) => n / lit >= 0.01 && !onInk(k * BIN + BIN / 2))
      .map(([k, n]) => `${k * BIN}-${k * BIN + BIN} deg ${(n / lit * 100).toFixed(1)}%`);
    const stray = samples.filter(h => !onInk(h)).length / lit * 100;
    offClusters.length === 0
      ? pass('G2 ', `hue discipline: no off-ink cluster over 1% in 20,000 samples ${D}(${lit} lit, ${achromatic} achromatic, ${stray.toFixed(2)}% scattered stray)${Z}`)
      : fail('G2 ', `off-ink cluster(s) over 1% of the lit sample: ${offClusters.join(', ')}`);
  }

  // G11 — interactive budget. <= 12 focusable elements; 13 is a fail.
  {
    const n: number = await page.evaluate(`
      document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length
    `);
    n <= 12 ? pass('G11', `${n} focusable elements in the DOM layer (<= 12; 11 bridged / 12 standalone is the declared budget)`)
            : fail('G11', `${n} focusable elements — 13 is a fail`);
  }

  await browser.close();
  await new Promise<void>(r => server.close(() => r()));
}

// G12 — embeddability, against the LIVE surface. No X-Frame-Options, an explicit
// frame-ancestors *, and the widget tag in the RAW HTML rather than React-injected.
if (PROD) {
  const hdrs = execSync(`curl -sS -D- -o /dev/null "${PROD}/"`, { encoding: 'utf8' });
  const html = execSync(`curl -sS "${PROD}/"`, { encoding: 'utf8' });
  const problems: string[] = [];
  if (/x-frame-options/i.test(hdrs)) problems.push('X-Frame-Options is present');
  if (!/frame-ancestors\s+\*/i.test(hdrs)) problems.push('no explicit frame-ancestors *');
  const tags = (html.match(/jam\.chain\.wtf\/widget\.js/g) ?? []).length;
  if (tags !== 1) problems.push(`widget tag appears ${tags} times in the raw HTML, expected 1`);
  problems.length === 0
    ? pass('G12', `live: no X-Frame-Options, explicit frame-ancestors *, widget tag x1 in raw HTML — ${PROD}`)
    : fail('G12', problems.join(' · '));
} else {
  na('G12', 'embeddability is a property of the LIVE response — pass the production URL: npm run gates -- <url>');
}

// ---------------------------------------------------------------------------
const C = { PASS: G, FAIL: RD, 'N/A': Y } as const;
console.log(`\ngates — ui.md §13${PROD ? `, live rows against ${PROD}` : ' (local only)'}\n`);
for (const r of rows.sort((a, b) => a.g.localeCompare(b.g, 'en', { numeric: true }))) {
  console.log(`  ${C[r.s]}${r.s.padEnd(4)}${Z}  ${r.g}  ${r.d}`);
}
const failed = rows.filter(r => r.s === 'FAIL').length;
const nas = rows.filter(r => r.s === 'N/A').length;
console.log(`\n${rows.length - failed - nas} pass · ${failed} fail · ${nas} n/a\n`);
process.exit(failed === 0 ? 0 : 1);
