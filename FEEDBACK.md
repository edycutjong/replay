# SDK feedback — @chain/casino-sdk v0.2.0

**SEND-BY: 2026-09-13** · Chain Discord `discord.gg/3kpZHvvTq`
**FILED:** *(not yet — this line carries the message link and UTC timestamp once posted)*

Findings from building [Replay](./README.md) against the casino SDK, in the order they cost
us time. Every one is reproducible; four of them are one-line fixes.

---

## 1. `_bulb.js`-class bug in your own docs: the bloom rule is documented but not implemented

**Not your file — but the same class of defect, and worth naming because we hit it.**
`docs/VISUAL_AND_UX.md` and the shipped renderer disagree about a density rule. We ported
the implementation faithfully and inherited the bug. Where a doc header states a
three-band rule and the code below implements two, the doc is the more expensive half.

**Ask:** a test that asserts documented constants against the implementation, even a trivial one.

---

## 2. The interface import path differs between `examples/` and `simulator/contracts/`

`docs/LOCAL_SIMULATOR.md` says to import the interface as `../../solidity/ICasinoGameV2.sol`,
which is correct **for the simulator's contracts folder only**. A contract that lives in its
own repo — i.e. every jam submission — needs a different path, so the same file cannot be
dropped into both places without a rewrite.

```
ParserError: Source "ICasinoGameV2.sol" not found: Import not found: ICasinoGameV2.sol
 --> Replay.sol:4:1
```

The failure surfaces only in the `npm start` log, several screens up, while the harness
carries on serving a stale deployment — so it reads as "my contract silently did not
deploy" rather than as a compile error.

**Ask:** either resolve `@chain/solidity/ICasinoGameV2.sol` via a remapping, or surface
compile failures in the harness UI rather than only in stdout.

---

## 3. `computeMaxWager` returns `undefined` for two very different reasons

`undefined` means both "this host publishes no applicable limit" and "the multiplier is
≤ 1× so the risk leg never binds". The doc comment is careful about it — *"fall back to
your own limits instead of treating it as unlimited"* — but a caller who checks
`if (max === undefined)` cannot tell which case they are in, and the two want different
fallbacks.

**Ask:** a discriminated result, e.g. `{ kind: 'limit', value } | { kind: 'no-limit-published' } | { kind: 'not-applicable' }`.

---

## 4. The `SessionPhase` enum is not exported from the TypeScript surface

`solidity/ICasinoGameV2.sol` defines the six phases; `HostSnapshotV1.sessions.items[].phase`
is typed `number | undefined`. Consumers end up hardcoding `3` for `SETTLED`, which is
exactly the sort of constant that drifts.

**Ask:** export the enum from `@chain/casino-sdk` so `phase === SessionPhase.SETTLED` is
possible.

---

## 5. The two payout traps deserve to be in `CONTRACT_CONSTRAINTS.md`, not discovered

Both cost real time and both are silent until a large win reverts:

- **Payout cap has zero slack.** `maxAllowedPayout = escrowedStake + reservedProfit`, so
  `quoteCaps`, `quoteRiskParams` and `onRandomness` must agree **to the wei**. Any
  independent re-derivation that differs by one base unit in the wrong direction reverts
  every win at the top multiplier — the rarest outcome, so it survives casual testing and
  fails on the one round a judge remembers.
- **Do not release reserved profit at settle.** `_processStepResult` applies
  `reservedProfitDelta` *before* `_finalizeSession`, so returning `-maxReservedProfit`
  collapses the cap to the wager and reverts every win above 1×. `_finalizeSession` zeroes
  it itself.

**Ask:** both as named subsections in `CONTRACT_CONSTRAINTS.md`, with the failing symptom
next to each, since the symptom is what a developer searches for.

---

## 6. `onSessionStart` being called twice cannot be reproduced locally

`CONTRACT_CONSTRAINTS.md` says production calls it once as a simulation with
`sessionId == 0` and then again for real. The local simulator does not reproduce this, so a
game that accidentally depends on session identity passes locally and breaks in production.

**Ask:** a toggle in the harness setup panel that double-calls `onSessionStart`. It would
have turned "closed by construction, untestable" into "closed and tested".

---

## What worked well, since a bug list is not a review

The bundled simulator is the best thing in this SDK. A real ECVRF node rather than a mock,
`LocalCasinoHost` emitting byte-identical events, and a watched `contracts/` folder that
compiles, deploys and registers on save with no external toolchain — that is a two-second
edit loop against a real chain, and it is why the contract was settling on all five boards
on day one. The deliberate production quirks (indexer lag, forced wallet states, optimistic
session rows) are the right instinct: we hit them on day one instead of after shipping.

`llms.txt` / `llms-full.txt` being present and complete is also worth saying out loud.
