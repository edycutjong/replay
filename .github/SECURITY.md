# Security Policy

## Scope

Replay is a casino game submitted to [Chain Jam Vol. 1](https://jam.chain.wtf). It holds no
user accounts, no credentials and no personal data. It ships two things worth attacking:

- **`contracts/Replay.sol`** — an `ICasinoGameV2` facet that decides payouts. A bug here is
  a money bug.
- **the standalone demo host** — `src/bridge/demoHost.ts`, which draws entropy locally when
  no casino host is present. It is play money by construction and says so on screen.

## Reporting a vulnerability

Email **edy.cu@live.com** with a description and, ideally, a failing case. Please do not open
a public issue for anything that affects settlement.

Expect an acknowledgement within 72 hours.

## What is already asserted mechanically

These are tests and gates in this repo, not claims in a paragraph:

| Property | Where it is enforced |
|---|---|
| No `Math.random` on any path that decides money | `scripts/shipcheck.mjs` row 9 |
| Demo entropy comes from `crypto.getRandomValues` | `scripts/shipcheck.mjs` row 9 |
| Randomness is unbiased — rejection sampling over sixteen 16-bit windows, never `byte % n` | `test/enumeration.test.ts`, `npm run bench` Block A |
| The paytable pays exactly 97% on all 25 (board, prop) pairs, in integer rationals | `npm run bench` Block A |
| The 96.03× tail is proved exhaustively, not sampled — all 1,287 ranks swept | `npm run bench` Block A |
| The shipped client enumerates the same orderings as the reference implementation | six golden digests, `npm run bench` Block A |
| History carries no secrets | `.github/workflows/gitleaks.yml`, full-history scan |
| Dependencies carry no known advisories | Dependabot alerts + CodeQL |

## Deliberate non-secrets

`public/game.manifest.json`, the declared RTP and the entire paytable are public on purpose.
The whole premise of the game is that its odds are integers a player can recount by hand.
