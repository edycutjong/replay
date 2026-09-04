/**
 * The host bridge — architecture.md §8.1/§8.2, per CHAIN_WTF_CASINO_GAMES.md §3.4.
 *
 * This is the sponsor integration: penpal to the chain.wtf host, the chain decides every
 * outcome, and the client only renders what `gameState` says. The TypeScript unrank in
 * demoHost exists ONLY for standalone mode and must never decide a hosted round —
 * recomputing client-side is the defect that capped Overhang under LESSONS R11.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { connectGameToHost, observeGameContentSize } from '@chain/casino-sdk/guest';
import { computeMaxWager, type HostApiV1, type HostSnapshotV1 } from '@chain/casino-sdk';
import { decodeGameState, type GameState } from '../game/codec';

export interface HostBridge {
  hostApi: HostApiV1 | null;
  snapshot: HostSnapshotV1 | null;
  /** betting is enabled only once the bridge resolves AND the wallet says ready */
  ready: boolean;
  maxWager: bigint | undefined;
  /** a session that has settled and has not been revealed to the player yet */
  pending: { sessionId: string; state: GameState } | null;
  openSession: (wager: string, gameData: `0x${string}`) => Promise<string | null>;
  reveal: (sessionId: string) => void;
}

export function useCasinoHost(maxMultiplierX: number): HostBridge {
  const [hostApi, setHostApi] = useState<HostApiV1 | null>(null);
  const [snapshot, setSnapshot] = useState<HostSnapshotV1 | null>(null);
  const [pending, setPending] = useState<HostBridge['pending']>(null);
  /** §8.2 rule 1 — DERIVE, DON'T ACCUMULATE. setState fires on every host-side change
   *  (balances, locale, viewport, unrelated sessions), not only on ours: it is "here is
   *  the current state", never "something happened". We animate only the difference. */
  const rendered = useRef<Map<string, string>>(new Map());
  const revealed = useRef<Set<string>>(new Set());
  const ourKey = useRef<string | null>(null);

  useEffect(() => {
    const connection = connectGameToHost({
      setState: async (snap) => { setSnapshot(snap); },
    });
    let observer: { disconnect(): void } | null = null;
    connection.promise
      .then(api => {
        setHostApi(api);
        // capabilities.resize is true, so the host sizes the iframe from what we report
        observer = observeGameContentSize(api);
      })
      .catch(() => { /* no host: standalone mode owns the round (demoHost) */ });
    return () => { observer?.disconnect(); connection.destroy(); };
  }, []);

  // Fold each snapshot into "is there a settled round we have not shown yet?"
  useEffect(() => {
    if (!snapshot) return;
    const items = snapshot.sessions?.items ?? [];
    if (items.length === 0) return;
    const newest = [...items].sort((a, b) => b.lastEventTimestamp - a.lastEventTimestamp)[0];

    // §8.2 rule 3 — THE OPTIMISTIC ROW. The host pushes a `pending:<uuid>` row the moment
    // openSession is called and later reconciles it to the real id. Match on sessionKey,
    // which openSession returned, and never treat the reconciliation as a second round.
    const isOurs = ourKey.current === null || newest.sessionKey === ourKey.current;
    if (!isOurs) return;

    const raw = newest.raw?.gameState;
    if (!newest.isSettled || !raw) return;

    // §8.2 rule 2 — a session is NEW only when its sessionId is new. A phase change
    // inside a known session is progress, not a fresh round.
    const seen = rendered.current.get(newest.sessionId);
    if (seen === raw || revealed.current.has(newest.sessionId)) return;
    rendered.current.set(newest.sessionId, raw);

    const state = decodeGameState(raw);
    if (state) setPending({ sessionId: newest.sessionId, state });
    // §8.2 rule 4 — RECOVER ON REFRESH is this same path: if we mount and the newest
    // session is SETTLED and unrevealed, it replays once from gameState and then reveals.
    // It does not start blank and it does not replay twice.
  }, [snapshot]);

  const openSession = useCallback(async (wager: string, gameData: `0x${string}`) => {
    if (!hostApi) return null;
    const res = await hostApi.openSession({ wager, gameData });
    ourKey.current = res.sessionKey;
    return res.sessionKey;
  }, [hostApi]);

  /**
   * Called when the replay animation finishes — AT BOTH TEMPOS. Until this fires the host
   * clamps its balance displays downward-only so the top bar cannot spoil the result. A
   * 13-beat replay is exactly the case that mechanism exists for, and forgetting it on the
   * TURBO path is the easy bug.
   */
  const reveal = useCallback((sessionId: string) => {
    if (revealed.current.has(sessionId)) return;
    revealed.current.add(sessionId);
    setPending(null);
    void hostApi?.revealOutcome({ sessionId }).catch(() => { /* host went away */ });
  }, [hostApi]);

  const ready = hostApi !== null && snapshot?.wallet?.status === 'ready';
  const maxWager = computeMaxWager(snapshot, { maxMultiplierX });

  return { hostApi, snapshot, ready, maxWager, pending, openSession, reveal };
}
