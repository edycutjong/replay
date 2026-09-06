## What this changes

<!-- One or two sentences. What does a player or a reviewer notice? -->

## Why

<!-- The defect or the gap. If it fixes something, say what was broken and how it showed. -->

## Checks

```sh
npm run check-types
npm test
npm run bench
npm run gates
```

- [ ] `npm run check-types` clean
- [ ] `npm test` green
- [ ] `npm run bench` green — the paytable block and the four render thresholds
- [ ] `npm run gates` green — no new `FAIL`, and no gate quietly turned into an `N/A`
- [ ] Commit messages follow Conventional Commits (`semantic-release` reads them for the version)

## If this touches money

- [ ] No `Math.random` on any path that decides an outcome
- [ ] Payouts still format from the exact rational, never through a float
- [ ] Declared RTP still agrees across `contracts/Replay.sol`, `src/`, `README.md` and `DEMO.md`

## If this touches the frame

- [ ] Checked at 390, 1024 and 1440 — no overlapping elements, board fully visible
- [ ] Offsets are in `--lamp` units, not viewport percentages
