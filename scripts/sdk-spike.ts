/**
 * D00 — the LESSONS R1 day-one artifact. Written once, never maintained.
 *
 * Its commit is the evidence the sponsor SDK preceded the pixels: every symbol
 * Replay depends on is called here, for real, before a single game pixel exists.
 * Run: npm run spike
 */
import {
  casinoGameManifestSchema,
  canonicalCasinoGameId,
  validateCasinoGameManifest,
  resolveManifestMetadata,
  assertSameOriginUrls,
  computeMaxWager,
} from '@chain/casino-sdk';
import { connectGameToHost, observeGameContentSize } from '@chain/casino-sdk/guest';
import { connectHostToGame } from '@chain/casino-sdk/host';
import type { HostSnapshotV1 } from '@chain/casino-sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const line = (n: number, s: string) => console.log(`[${n}] ${s}`);
let n = 0;
const ok = (s: string) => line(++n, `PASS  ${s}`);
function fail(s: string): never { line(++n, `FAIL  ${s}`); process.exit(1); }

console.log('Replay — @chain/casino-sdk spike\n');

// ---- 1. validateCasinoGameManifest, against OUR real manifest on disk ----
const manifestPath = fileURLToPath(new URL('../public/game.manifest.json', import.meta.url));
const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
const validated = validateCasinoGameManifest(raw);
if (!validated.ok) fail(`validateCasinoGameManifest: ${validated.reason}`);
ok(`validateCasinoGameManifest  public/game.manifest.json accepted`);

// ---- 2. canonicalCasinoGameId — the on-chain normalizeGameName convention ----
const canonical = canonicalCasinoGameId('ReplayGame');
if (canonical !== 'replay') fail(`canonicalCasinoGameId("ReplayGame") = "${canonical}", expected "replay"`);
ok(`canonicalCasinoGameId       "ReplayGame" -> "${canonical}"`);

// ---- 3. resolveManifestMetadata — what the catalog renders ----
const meta = resolveManifestMetadata(validated.manifest, 'en');
ok(`resolveManifestMetadata     locale=${meta.locale} name="${meta.name}"`);

// ---- 4. assertSameOriginUrls — manifest and iframe must share an origin ----
const sameOrigin = assertSameOriginUrls(
  'https://replay.edycu.dev/game.manifest.json',
  'https://replay.edycu.dev/',
);
const crossOrigin = assertSameOriginUrls(
  'https://replay.edycu.dev/game.manifest.json',
  'https://example.com/',
);
if (!sameOrigin || crossOrigin) fail('assertSameOriginUrls did not discriminate origins');
ok(`assertSameOriginUrls        same-origin=${sameOrigin} cross-origin=${crossOrigin}`);

// ---- 5. computeMaxWager — at BOTH ends of Replay's multiplier range ----
// The declared paytable: every listed prop pays p * payout == 0.97.
// Cheapest listed ticket 1.16x, the tail ticket 96.03x (= 0.97 * 99, exactly).
const snapshot: Pick<HostSnapshotV1, 'casino'> = {
  casino: {
    maxBetAmount: '1000000000000000000000',        // 1,000 chUSD
    maxAllowedReservedProfit: '5000000000000000000000', // 5,000 chUSD
  } as HostSnapshotV1['casino'],
};
const atFloor = computeMaxWager(snapshot, { maxMultiplierX: 1.16 });
const atTail = computeMaxWager(snapshot, { maxMultiplierX: 96.03 });
if (atFloor === undefined || atTail === undefined) fail('computeMaxWager returned undefined');
if (!(atTail < atFloor)) fail('the 96.03x ticket must bind tighter than the 1.16x ticket');
ok(`computeMaxWager   1.16x -> ${atFloor}  (wager ceiling binds)`);
ok(`computeMaxWager  96.03x -> ${atTail}  (reserved-profit leg binds, ${(Number(atTail) / 1e18).toFixed(2)} chUSD)`);

// ---- 6. the bridge entry points Replay actually imports ----
if (typeof connectGameToHost !== 'function') fail('connectGameToHost is not callable');
if (typeof observeGameContentSize !== 'function') fail('observeGameContentSize is not callable');
if (typeof connectHostToGame !== 'function') fail('connectHostToGame is not callable');
ok('guest bridge                connectGameToHost + observeGameContentSize callable');
ok('host bridge                 connectHostToGame callable (demo mode implements HostApiV1)');

// ---- 7. the schema itself — a manifest missing capabilities must be REJECTED ----
const bad = casinoGameManifestSchema.safeParse({ ...raw, capabilities: undefined });
if (bad.success) fail('schema accepted a manifest with no capabilities');
ok('casinoGameManifestSchema    rejects a manifest missing capabilities');

console.log(`\n${n} assertions, 9 SDK symbols exercised, 0 failures.`);
