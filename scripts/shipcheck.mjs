#!/usr/bin/env node
/**
 * shipcheck — the submission gate. Every row is a hard gate: a missing widget tag is an
 * automatic reject, wrong headers cost the gallery's live preview, an invalid manifest
 * fails eligibility, and a declared RTP that disagrees with the contract is the thing a
 * reviewer screens for first.
 *
 * Rows that need the network take PROD as an argument; without it they report SKIP rather
 * than passing, because a check that silently passes when it did not run is worse than no
 * check (LESSONS R13).
 *
 *   node scripts/shipcheck.mjs [https://replay-chain-jam.vercel.app]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PROD = process.argv[2] ?? process.env.PROD ?? null;
const rows = [];
const ok = (n, d) => rows.push({ n, s: 'PASS', d });
const no = (n, d) => rows.push({ n, s: 'FAIL', d });
const skip = (n, d) => rows.push({ n, s: 'SKIP', d });
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null);

// 1 — no placeholders anywhere in the shipped prose.
{
  const PAT = /\b(TODO|TBD|FIXME|XXX|LOREM|PLACEHOLDER|COMING SOON|YOUR_[A-Z_]+|<[a-z-]*your[a-z-]*>)\b/i;
  const files = ['README.md', 'DEMO.md', 'FEEDBACK.md'].filter(existsSync);
  const hits = files.filter(f => PAT.test(readFileSync(f, 'utf8')));
  hits.length ? no(1, `placeholder text in ${hits.join(', ')}`) : ok(1, `${files.length} prose files clean`);
}

// 2 — the jam widget, in RAW html, in the BUILT output. Missing = automatic reject.
{
  const built = read('dist/index.html');
  if (!built) skip(2, 'dist/index.html missing — run `npm run build` first');
  else {
    const n = (built.match(/jam\.chain\.wtf\/widget\.js/g) ?? []).length;
    n === 1 ? ok(2, 'widget tag present exactly once in dist/index.html')
            : no(2, `widget tag appears ${n} times in the built output, expected 1`);
  }
}

// 3 — framing headers. frame-ancestors and NO X-Frame-Options anywhere.
{
  const v = read('vercel.json');
  if (!v) no(3, 'vercel.json missing');
  else if (/x-frame-options/i.test(v)) no(3, 'X-Frame-Options present — it must be absent entirely');
  else if (!/frame-ancestors\s+\*/.test(v)) no(3, 'CSP frame-ancestors * missing');
  else ok(3, 'frame-ancestors *, no X-Frame-Options');
}

// 4 — the manifest validates and canonicalises to the contract's name.
{
  const m = read('public/game.manifest.json');
  if (!m) no(4, 'public/game.manifest.json missing');
  else {
    try {
      const j = JSON.parse(m);
      const canon = String(j.gameId ?? '').trim().replace(/Game$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (j.schemaVersion !== 1 || j.apiVersion !== 1) no(4, 'schemaVersion/apiVersion must be 1');
      else if (canon !== 'replay') no(4, `gameId "${j.gameId}" canonicalises to "${canon}"`);
      else if (j.capabilities?.openSession !== true) no(4, 'capabilities.openSession must be true');
      else ok(4, `manifest valid, gameId "${j.gameId}" -> "${canon}"`);
    } catch (e) { no(4, `manifest does not parse: ${e.message}`); }
  }
}

// 5 — THE DECLARED RTP. One string, and it must be the same one everywhere.
{
  const sol = read('contracts/Replay.sol') ?? '';
  const num = /RTP_NUM\s*=\s*(\d+)/.exec(sol)?.[1];
  const den = /RTP_DEN\s*=\s*(\d+)/.exec(sol)?.[1];
  const menu = read('src/game/menu.ts') ?? '';
  const ts = /RTP:\s*Fraction\s*=\s*frac\((\d+),\s*(\d+)\)/.exec(menu);
  const readme = read('README.md') ?? '';
  if (num !== '97' || den !== '100') no(5, `contract RTP is ${num}/${den}, expected 97/100 (decision B1)`);
  else if (!ts || ts[1] !== '97' || ts[2] !== '100') no(5, 'src/game/menu.ts RTP disagrees with the contract');
  else if (!/97%/.test(readme)) no(5, 'README does not state the 97% declared RTP');
  else if (!/96\.03/.test(readme) || /96\.0[^3]/.test(readme)) no(5, 'README must render the max payout as 96.03x, never 96.0x');
  else ok(5, 'RTP 97% agrees across contract, TS and README; max payout renders 96.03x');
}

// 6 — FEEDBACK.md at ROOT, linked from the README, and actually filed.
{
  if (!existsSync('FEEDBACK.md')) no(6, 'FEEDBACK.md missing from the repo root');
  else {
    const f = readFileSync('FEEDBACK.md', 'utf8');
    const head = readFileSync('README.md', 'utf8').split('\n').slice(0, 60).join('\n');
    if (!/FEEDBACK\.md/.test(head)) no(6, 'README first screen does not link FEEDBACK.md');
    else if (!/^\*\*FILED:\*\*/m.test(f)) no(6, 'FEEDBACK.md has no FILED: line');
    else if (/\*\(not yet/.test(f)) no(6, 'FEEDBACK.md is drafted but NOT FILED — a draft with no send is a scored loss');
    else ok(6, 'FEEDBACK.md at root, linked, and filed');
  }
}

// 7 — the tests, the coverage gate, and the contract all actually pass.
{
  try {
    execSync('npm test --silent', { stdio: 'pipe' });
    ok(7, 'npm test passes');
  } catch { no(7, 'npm test FAILS'); }
}
{
  const cfg = read('vitest.config.ts') ?? '';
  const th = ['lines', 'functions', 'branches', 'statements'].every(k => new RegExp(`${k}:\\s*100`).test(cfg));
  th ? ok(8, 'coverage thresholds pinned at 100 on src/game/**')
     : no(8, 'coverage thresholds are not all 100 — the gate can silently regress');
}

// 9 — no Math.random on any path that DECIDES MONEY.
//
// Scoped deliberately. The jam's rule is about outcomes, and src/audio uses Math.random to
// fill a noise buffer — that is a waveform, not a wager, and holding it to the same bar
// would be theatre. The money paths are the contract, the game logic and the bridge:
// src/bridge/demoHost draws its entropy from crypto.getRandomValues and must keep doing so.
{
  let hits = '';
  try { hits = execSync("grep -rn 'Math\\.random' src/game src/bridge contracts 2>/dev/null || true", { encoding: 'utf8' }); } catch { /* none */ }
  // strip the comment before matching: the first version of this check flagged
  // demoHost's own "never Math.random" comment, which is the opposite of a violation
  const bad = hits.split('\n').filter(l => {
    if (!l.trim()) return false;
    const code = l.split(':').slice(2).join(':').split('//')[0];
    return /Math\.random/.test(code);
  });
  if (bad.length) no(9, `Math.random on a money path: ${bad[0]}`);
  else {
    const demo = read('src/bridge/demoHost.ts') ?? '';
    /crypto\.getRandomValues/.test(demo)
      ? ok(9, 'no Math.random on any money path; demo entropy is crypto.getRandomValues')
      : no(9, 'demoHost does not use crypto.getRandomValues');
  }
}

// 10-12 — the live surface. SKIP without PROD, never a silent pass.
if (!PROD) {
  skip(10, 'pass the production URL to run the live checks');
  skip(11, '—');
  skip(12, '—');
} else {
  const curl = (args) => { try { return execSync(`curl -sS ${args}`, { encoding: 'utf8', timeout: 20000 }); } catch { return ''; } };
  const hdrs = curl(`-D- -o /dev/null "${PROD}/"`);
  /x-frame-options/i.test(hdrs) ? no(10, 'live response carries X-Frame-Options') :
    /frame-ancestors\s+\*/i.test(hdrs) ? ok(10, 'live headers: frame-ancestors *, no X-Frame-Options')
                                       : no(10, 'live response is missing frame-ancestors *');
  const html = curl(`"${PROD}/"`);
  const n = (html.match(/jam\.chain\.wtf\/widget\.js/g) ?? []).length;
  n === 1 ? ok(11, 'widget tag live on the production page')
          : no(11, `widget tag count live is ${n} — a missing tag is an AUTOMATIC REJECT`);
  const man = curl(`"${PROD}/game.manifest.json"`);
  try {
    const j = JSON.parse(man);
    j.gameId === 'ReplayGame' ? ok(12, 'manifest served at the production origin')
                              : no(12, `manifest gameId is "${j.gameId}"`);
  } catch { no(12, 'manifest is not served at the production origin'); }
}

// ---- report ----------------------------------------------------------------
const C = { PASS: '\x1b[32m', FAIL: '\x1b[31m', SKIP: '\x1b[33m' };
console.log('\nshipcheck' + (PROD ? ` — against ${PROD}` : ' — local only (pass a URL for rows 10-12)') + '\n');
for (const r of rows) console.log(`  ${C[r.s]}${r.s}\x1b[0m  ${String(r.n).padStart(2)}  ${r.d}`);
const fails = rows.filter(r => r.s === 'FAIL').length;
const skips = rows.filter(r => r.s === 'SKIP').length;
console.log(`\n${rows.length - fails - skips} pass · ${fails} fail · ${skips} skip\n`);
process.exit(fails ? 1 : 0);
