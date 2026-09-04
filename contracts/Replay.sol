// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./ICasinoGameV2.sol";

/**
 * Replay — the final score is revealed BEFORE the bet.
 *
 * A 13-point game ends `w`-`l`. There are exactly C(13,l) orderings of those 13 points
 * that produce that score, and the player wagers on which KIND of ordering it was:
 * did the loser strike first, was the winner never behind, did they come back from
 * two down. Every price is an exact integer count over equally likely orderings, so
 * the whole paytable is arithmetic a reviewer can redo by hand.
 *
 * RTP is 97% BY CONSTRUCTION, not by calibration: every listed prop pays 0.97/p, so
 * E[return] = p * (0.97/p) * wager = 0.97 * wager on all 25 (board, prop) pairs. That
 * is `expectedPayout` below, and it is one line.
 *
 * NO CONSTRUCTOR ARGUMENTS — the local simulator watches simulator/contracts/, and it
 * skips any contract that has them.
 */
contract ReplayGame is ICasinoGameV2 {
    error Replay__BadBoard();
    error Replay__BadProp();
    error Replay__NotListed();
    error Replay__NoPlayerAction();

    /// The pricing numerator. Decision B1, closed 2026-08-27: 0.97, not 0.95.
    /// Declared RTP is 97%; the tail ticket pays 0.97 * 99 = 96.03x exactly.
    uint256 private constant RTP_NUM = 97;
    uint256 private constant RTP_DEN = 100;

    // ---------------------------------------------------------------------------
    // The enumeration engine. No loop over the ordering space exists anywhere in
    // this contract at any point in the lifecycle; the heaviest operation in a
    // session is 13 iterations.
    // ---------------------------------------------------------------------------

    /// The ONLY numeric constant in the contract. Solidity forbids `constant` arrays
    /// of non-value type, so it is a function. C(13,k) for k = 0..6.
    function _c13(uint256 k) private pure returns (uint256) {
        if (k == 0) return 1;
        if (k == 1) return 13;
        if (k == 2) return 78;
        if (k == 3) return 286;
        if (k == 4) return 715;
        if (k == 5) return 1287;
        return 1716; // k == 6
    }

    function _total(uint256 l) private pure returns (uint256) {
        return _c13(l);
    }

    /// The three closed forms. Each is exact; none is a simulation.
    ///   STRUCK FIRST = C(12, l-1) = C(13,l) * l / 13   (exact division)
    ///   NEVER BEHIND = C(13,l) - C(13,l-1)             (ballot number)
    ///   TRAILED k+   = C(13, l-k)                      (reflection principle)
    function _count(uint256 l, uint256 propId) private pure returns (uint256) {
        if (propId == 0) return (_c13(l) * l) / 13;
        if (propId == 1) return _c13(l) - _c13(l - 1);
        return _c13(l - (propId - 1));
    }

    /// TRAP 1 — the facet's payout cap has ZERO slack:
    ///   maxAllowedPayout = escrowedStake + reservedProfit
    /// so quoteCaps, quoteRiskParams and onRandomness MUST agree to the wei. They all
    /// call THIS function; any independent re-derivation that differs by one base unit
    /// in the wrong direction reverts every win on the 96.03x ticket.
    ///
    /// Multiply first, divide once. Truncation always favours the house, so the
    /// realised mean sits at or below the declared 97% and the 93-98% band cannot be
    /// breached from above.
    function _payout(uint256 wager, uint256 l, uint256 propId) private pure returns (uint256) {
        return (wager * RTP_NUM * _total(l)) / (RTP_DEN * _count(l, propId));
    }

    /// Three invariants in one comparison — see the last line.
    function _decodeAndRequireListed(bytes calldata gameData)
        private
        pure
        returns (uint256 l, uint256 propId)
    {
        (uint8 a, uint8 b) = abi.decode(gameData, (uint8, uint8));
        l = a;
        propId = b;
        if (l < 2 || l > 6) revert Replay__BadBoard();
        if (propId > 5) revert Replay__BadProp();
        if (propId >= 2 && (propId - 1) > l) revert Replay__BadProp();
        // The p >= 1% listing floor as exact integers. This one line simultaneously
        // enforces: every listed prop has p >= 1%; maxPayout < 100x (p >= 1% implies
        // 0.97/p <= 97x, realised max 96.03x); and the facet's heavy-tail path never
        // activates (it needs multiplier > 100 AND p < 0.1%, and this fails the second
        // leg outright). That is why there is no payout cap and no tail machinery here.
        if (_count(l, propId) * 100 < _total(l)) revert Replay__NotListed();
    }

    // ---------------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------------

    /// bytes32 -> uniform rank in [0, total), by rejection sampling over the sixteen
    /// 16-bit windows of the word. `byte % n` is forbidden (RANDOMNESS_DICE.md) and is
    /// on the reviewer's checklist; every C exceeds 256, so 65536 is the natural domain.
    ///
    /// Worst-case per-window rejection is 1186/65536 = 1.8097% (the 8-5 board), so all
    /// sixteen windows rejecting — the only path to the r = 0 fallback — has probability
    /// 0.018097^16 = 1.32e-28. The fallback is documented rather than removed because a
    /// while(true) rehash loop in a `view` handler is a worse artifact than a stated
    /// 1-in-10^28 bias.
    function _drawRank(bytes32 randomness, uint256 total) private pure returns (uint256) {
        uint256 limit = (65536 / total) * total;
        for (uint256 w = 0; w < 16; w++) {
            uint256 v = (uint256(uint8(randomness[2 * w])) << 8) | uint256(uint8(randomness[2 * w + 1]));
            if (v < limit) return v % total;
        }
        return 0;
    }

    /// Combinatorial-number-system unranking, lexicographic. A bijection onto the
    /// orderings, so uniformity holds BY CONSTRUCTION rather than by argument — and it
    /// yields the PATH ID for free. Returns a 13-bit mask whose set bits are the
    /// positions at which the LOSER scored.
    ///
    /// The walk needs C(m,k) for m <= 12 and gets every value from one seed via two
    /// exact integer recurrences, so there is no second table:
    ///   take: C(m-1, k-1) = c * k / m
    ///   skip: C(m-1, k)   = c * (m-k) / m
    function _unrank(uint256 l, uint256 r) private pure returns (uint256 mask) {
        uint256 c = (_c13(l) * l) / 13; // C(12, l-1) — already the STRUCK FIRST count
        uint256 m = 12;
        uint256 k = l - 1; // c == C(m, k)
        uint256 rem = l;
        for (uint256 i = 0; i < 13; i++) {
            if (rem == 0) break;
            if (r < c) {
                mask |= (1 << i); // the loser scores point i
                rem--;
                if (rem == 0) break;
                c = (c * k) / m;
                k--;
                m--;
            } else {
                r -= c;
                c = (c * (m - k)) / m;
                m--;
            }
        }
    }

    /// One pass over the mask yields both statistics the whole menu is built from.
    function _walk(uint256 mask) private pure returns (uint256 maxDeficit, bool struckFirst) {
        int256 d = 0;
        struckFirst = (mask & 1) != 0;
        for (uint256 i = 0; i < 13; i++) {
            d += ((mask >> i) & 1) != 0 ? -int256(1) : int256(1);
            if (d < 0 && uint256(-d) > maxDeficit) maxDeficit = uint256(-d);
        }
    }

    function _won(uint256 propId, uint256 maxDeficit, bool struckFirst) private pure returns (bool) {
        if (propId == 0) return struckFirst;      // the LOSER scored point #1
        if (propId == 1) return maxDeficit == 0;  // NEVER BEHIND
        return maxDeficit >= (propId - 1);        // CAME BACK / TWO / THREE / FOUR DOWN
    }

    // ---------------------------------------------------------------------------
    // ICasinoGameV2
    // ---------------------------------------------------------------------------

    function quoteCaps(uint256 wager, bytes calldata gameData)
        external
        pure
        returns (uint256 maxEscrowStake, uint256 maxReservedProfit)
    {
        (uint256 l, uint256 propId) = _decodeAndRequireListed(gameData);
        uint256 payout = _payout(wager, l, propId);
        // Escrow never increases, so maxEscrowStake == wager exactly.
        return (wager, payout > wager ? payout - wager : 0);
    }

    function quoteRiskParams(uint256 wager, bytes calldata gameData)
        external
        pure
        returns (
            uint256 maxPayout,
            uint256 probabilityWad,
            uint256 expectedPayout,
            uint256 subJackpotVarianceScaled
        )
    {
        (uint256 l, uint256 propId) = _decodeAndRequireListed(gameData);
        // A session carries exactly one prop, so the worst case IS the single winning
        // payout: the facet's cap is tight by construction (Trap 1).
        maxPayout = _payout(wager, l, propId);
        probabilityWad = (_count(l, propId) * 1e18) / _total(l);
        // RTP 97% by construction — the same line for all 25 (board, prop) pairs.
        expectedPayout = (wager * RTP_NUM) / RTP_DEN;
        subJackpotVarianceScaled = 0;
    }

    /// TRAP 3 — in production this is called TWICE: once as a simulation with
    /// sessionId == 0 before portfolio commit, then again with the real context. This
    /// implementation is a pure function of (wagerBase, gameData) — it reads no session
    /// id, no block, no state — so it is idempotent by construction. The local simulator
    /// does not reproduce the double call, so this cannot be caught locally.
    function onSessionStart(SessionContext calldata ctx) external pure returns (StepResult memory) {
        (uint256 l, uint256 propId) = _decodeAndRequireListed(ctx.gameData);
        uint256 payout = _payout(ctx.wagerBase, l, propId);
        return StepResult({
            newGameState: abi.encode(uint8(l), uint8(propId), uint16(0), uint16(0), uint8(0), false, false),
            escrowDelta: 0,
            reservedProfitDelta: int256(payout > ctx.wagerBase ? payout - ctx.wagerBase : 0),
            nextPhase: SessionPhase.WAITING_RANDOMNESS,
            requestRandomnessNow: true,
            payout: 0
        });
    }

    /// Zero in-round decisions by design (CUT LIST 12); capabilities.submitAction is false.
    function onPlayerAction(SessionContext calldata, bytes calldata)
        external
        pure
        returns (StepResult memory)
    {
        revert Replay__NoPlayerAction();
    }

    function onRandomness(SessionContext calldata ctx, bytes32 randomness)
        external
        pure
        returns (StepResult memory)
    {
        (uint256 l, uint256 propId) = _decodeAndRequireListed(ctx.gameData);
        uint256 total = _total(l);
        uint256 rank = _drawRank(randomness, total);
        uint256 mask = _unrank(l, rank);
        (uint256 maxDeficit, bool struckFirst) = _walk(mask);
        bool won = _won(propId, maxDeficit, struckFirst);
        uint256 payout = won ? _payout(ctx.wagerBase, l, propId) : 0;

        return StepResult({
            // The single source of truth for the animation. The contract writes the
            // mask; the client renders it. `pathId` is the rank r itself, zero-indexed.
            newGameState: abi.encode(
                uint8(l), uint8(propId), uint16(rank), uint16(mask), uint8(maxDeficit), struckFirst, won
            ),
            escrowDelta: 0,
            // TRAP 2 — do NOT release reserved profit here. _processStepResult applies
            // this delta BEFORE _finalizeSession. Returning -maxReservedProfit would
            // zero session.reservedProfit, collapse maxAllowedPayout to the wager, and
            // revert every win above 1x. _finalizeSession zeroes it itself.
            reservedProfitDelta: 0,
            nextPhase: SessionPhase.SETTLED,
            requestRandomnessNow: false,
            payout: payout
        });
    }
}
