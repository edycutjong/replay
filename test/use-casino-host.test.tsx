/**
 * src/bridge/useCasinoHost.ts — the sponsor bridge. This is the module the four shipped
 * defects doc calls out directly: a complete, correct implementation that nothing in
 * App.tsx imported, so a hosted round was always settled locally regardless of whether
 * a real host was present. These tests exercise the hook in isolation — its own
 * contract (§8.2's four numbered rules, quoted in the source) — against a mocked
 * `@chain/casino-sdk/guest`, since a real `penpal` handshake needs an actual host on the
 * other end of the iframe and would otherwise leave `connection.promise` pending forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCasinoHost } from '../src/bridge/useCasinoHost';
import type { HostApiV1, HostSnapshotV1 } from '../src/vendor/casino-sdk/types';

const { connectGameToHostMock, observeGameContentSizeMock } = vi.hoisted(() => ({
  connectGameToHostMock: vi.fn(),
  observeGameContentSizeMock: vi.fn(),
}));

vi.mock('@chain/casino-sdk/guest', () => ({
  connectGameToHost: connectGameToHostMock,
  observeGameContentSize: observeGameContentSizeMock,
}));

type Hex = `0x${string}`;
/** The SDK types every address/hash field as the branded `0x${string}` — these fixtures
 *  build theirs from plain string concatenation, so this casts once at the boundary
 *  rather than sprinkling `as Hex` through every literal below. */
const hex = (s: string): Hex => s as Hex;

/** A fixed-length, real-shaped gameState hex — l=5, propId=5, pathId=10, mask=0b101,
 *  maxDeficit=2, struckFirst=true, won=false — seven 32-byte words, matching the ABI
 *  `decodeGameState` (src/game/codec.ts) parses. */
const word = (n: number | boolean): string => (typeof n === 'boolean' ? (n ? 1 : 0) : n).toString(16).padStart(64, '0');
const GAME_STATE: Hex = hex(`0x${word(5)}${word(5)}${word(10)}${word(0b101)}${word(2)}${word(true)}${word(false)}`);
const ADDR: Hex = hex('0x0');

const snapshot = (overrides: Partial<HostSnapshotV1> = {}): HostSnapshotV1 => ({
  apiVersion: 1,
  integration: { chainId: 1, slug: 'replay', gameAddress: ADDR, manifest: {} as never },
  wallet: { status: 'ready' },
  token: {},
  balances: {},
  sessions: { items: [] },
  ui: { locale: 'en', theme: 'dark' },
  ...overrides,
});

const hostApi: HostApiV1 = {
  openSession: vi.fn(async () => ({ sessionKey: 'key-1', transactionHash: hex('0xabc') })),
  submitAction: vi.fn(),
  cancelStuckRandomness: vi.fn(),
  revealOutcome: vi.fn(async () => {}),
};

let resolveConnection: (api: HostApiV1) => void;
let rejectConnection: (err: unknown) => void;
let destroySpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  destroySpy = vi.fn();
  disconnectSpy = vi.fn();
  observeGameContentSizeMock.mockReturnValue({ disconnect: disconnectSpy, report: vi.fn() });
  connectGameToHostMock.mockImplementation(() => {
    const promise = new Promise<HostApiV1>((res, rej) => {
      resolveConnection = res;
      rejectConnection = rej;
    });
    return { promise, destroy: destroySpy };
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useCasinoHost — connecting', () => {
  it('starts with no host, not ready, no pending round', () => {
    const { result } = renderHook(() => useCasinoHost(96.03));
    expect(result.current.hostApi).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('picks up the API once the bridge resolves, and starts observing content size', async () => {
    const { result } = renderHook(() => useCasinoHost(96.03));
    act(() => resolveConnection(hostApi));
    await waitFor(() => expect(result.current.hostApi).toBe(hostApi));
    expect(observeGameContentSizeMock).toHaveBeenCalledWith(hostApi);
  });

  it('stays standalone — hostApi null — when the bridge rejects (no host present)', async () => {
    const { result } = renderHook(() => useCasinoHost(96.03));
    act(() => rejectConnection(new Error('no host')));
    // nothing to await onto but the absence of a state change; give the microtask a turn
    await Promise.resolve();
    expect(result.current.hostApi).toBeNull();
  });

  it('tears down the connection and the content-size observer on unmount', async () => {
    const { result, unmount } = renderHook(() => useCasinoHost(96.03));
    act(() => resolveConnection(hostApi));
    await waitFor(() => expect(result.current.hostApi).toBe(hostApi));
    unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('unmounting before the bridge ever resolves still tears down cleanly (no observer yet)', () => {
    const { unmount } = renderHook(() => useCasinoHost(96.03));
    expect(() => unmount()).not.toThrow();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it('ready requires both a resolved host AND wallet.status === "ready"', async () => {
    const { result } = renderHook(() => useCasinoHost(96.03));
    const methods = connectGameToHostMock.mock.calls[0][0] as { setState(s: HostSnapshotV1): Promise<void> };

    act(() => resolveConnection(hostApi));
    await waitFor(() => expect(result.current.hostApi).toBe(hostApi));
    expect(result.current.ready).toBe(false); // host resolved, but no snapshot yet

    await act(async () => { await methods.setState(snapshot({ wallet: { status: 'disconnected' } })); });
    expect(result.current.ready).toBe(false); // host resolved, wallet not ready

    await act(async () => { await methods.setState(snapshot()); }); // wallet.status: 'ready' by default
    expect(result.current.ready).toBe(true);
  });
});

describe('useCasinoHost — snapshot -> pending (§8.2)', () => {
  /** Drive `setState` the way the real guest bridge would: grab the `setState` method
   *  handed to `connectGameToHost` and call it directly, exactly what the host does on
   *  every state change. */
  const withSnapshot = async () => {
    const rendered = renderHook(() => useCasinoHost(96.03));
    const methods = connectGameToHostMock.mock.calls[0][0] as { setState(s: HostSnapshotV1): Promise<void> };
    act(() => resolveConnection(hostApi));
    await waitFor(() => expect(rendered.result.current.hostApi).toBe(hostApi));
    return { ...rendered, setState: methods.setState };
  };

  it('ignores a snapshot with no sessions', async () => {
    const { result, setState } = await withSnapshot();
    await act(async () => { await setState(snapshot()); });
    expect(result.current.pending).toBeNull();
    expect(result.current.snapshot).not.toBeNull();
  });

  it('tolerates a snapshot missing `sessions` entirely — an older or malformed host', async () => {
    const { result, setState } = await withSnapshot();
    const malformed = { ...snapshot(), sessions: undefined } as unknown as HostSnapshotV1;
    await act(async () => { await setState(malformed); });
    expect(result.current.pending).toBeNull();
  });

  it('rule 3 — ignores sessions that are not ours once we have opened one', async () => {
    const { result, setState } = await withSnapshot();
    await act(async () => {
      await result.current.openSession('100', '0xdead');
    });
    await act(async () => {
      await setState(snapshot({
        sessions: {
          items: [{
            sessionId: 's-someone-elses', sessionKey: 'not-our-key', gameAddress: ADDR,
            isSettled: true, lastEventTimestamp: 1, raw: { gameState: GAME_STATE },
          }],
        },
      }));
    });
    expect(result.current.pending).toBeNull();
  });

  it('ignores an unsettled session, and a settled one with no gameState yet', async () => {
    const { result, setState } = await withSnapshot();
    await act(async () => {
      await setState(snapshot({
        sessions: {
          items: [
            { sessionId: 's1', sessionKey: 'k1', gameAddress: ADDR, isSettled: false, lastEventTimestamp: 1, raw: {} },
          ],
        },
      }));
    });
    expect(result.current.pending).toBeNull();

    await act(async () => {
      await setState(snapshot({
        sessions: {
          items: [
            { sessionId: 's2', sessionKey: 'k2', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 2, raw: {} },
          ],
        },
      }));
    });
    expect(result.current.pending).toBeNull();
  });

  it('decodes a newly settled session into `pending`, picking the newest by timestamp', async () => {
    const { result, setState } = await withSnapshot();
    await act(async () => {
      await setState(snapshot({
        sessions: {
          items: [
            { sessionId: 'older', sessionKey: 'k1', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 1, raw: { gameState: GAME_STATE } },
            { sessionId: 'newer', sessionKey: 'k2', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 5, raw: { gameState: GAME_STATE } },
          ],
        },
      }));
    });
    expect(result.current.pending?.sessionId).toBe('newer');
    expect(result.current.pending?.state.l).toBe(5);
    expect(result.current.pending?.state.propId).toBe(5);
    expect(result.current.pending?.state.won).toBe(false);
  });

  it('rule 2 — a phase change inside the SAME session and gameState is not a new round', async () => {
    const { result, setState } = await withSnapshot();
    const items = [{ sessionId: 's1', sessionKey: 'k1', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 1, raw: { gameState: GAME_STATE } }];
    await act(async () => { await setState(snapshot({ sessions: { items } })); });
    expect(result.current.pending?.sessionId).toBe('s1');

    act(() => result.current.reveal('s1'));
    expect(result.current.pending).toBeNull();

    // the exact same gameState arrives again (a re-push, not a new outcome) — must not
    // resurrect a session already revealed to the player.
    await act(async () => { await setState(snapshot({ sessions: { items } })); });
    expect(result.current.pending).toBeNull();
  });

  it('does not resurrect a session once revealed, even with a gameState it has not seen before', async () => {
    const { result, setState } = await withSnapshot();
    const first = [{ sessionId: 's1', sessionKey: 'k1', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 1, raw: { gameState: GAME_STATE } }];
    await act(async () => { await setState(snapshot({ sessions: { items: first } })); });
    act(() => result.current.reveal('s1'));

    const changedState: Hex = hex(`0x${word(4)}${word(2)}${word(3)}${word(1)}${word(1)}${word(false)}${word(true)}`);
    const second = [{ sessionId: 's1', sessionKey: 'k1', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 2, raw: { gameState: changedState } }];
    await act(async () => { await setState(snapshot({ sessions: { items: second } })); });
    expect(result.current.pending).toBeNull();
  });

  it('drops a gameState the codec cannot decode rather than crashing', async () => {
    const { result, setState } = await withSnapshot();
    await act(async () => {
      await setState(snapshot({
        sessions: {
          items: [{ sessionId: 's1', sessionKey: 'k1', gameAddress: ADDR, isSettled: true, lastEventTimestamp: 1, raw: { gameState: hex('0xdeadbeef') } }],
        },
      }));
    });
    expect(result.current.pending).toBeNull();
  });
});

describe('useCasinoHost — openSession / reveal', () => {
  it('openSession is a no-op returning null before the bridge resolves', async () => {
    const { result } = renderHook(() => useCasinoHost(96.03));
    await expect(result.current.openSession('10', '0xaa')).resolves.toBeNull();
    expect(hostApi.openSession).not.toHaveBeenCalled();
  });

  it('openSession calls the host and remembers the sessionKey it returned', async () => {
    const { result } = renderHook(() => useCasinoHost(96.03));
    act(() => resolveConnection(hostApi));
    await waitFor(() => expect(result.current.hostApi).toBe(hostApi));
    let key: string | null = null;
    await act(async () => { key = await result.current.openSession('10', '0xaa'); });
    expect(key).toBe('key-1');
    expect(hostApi.openSession).toHaveBeenCalledWith({ wager: '10', gameData: '0xaa' });
  });

  it('reveal() is idempotent and swallows a host error rather than throwing', async () => {
    const failing: HostApiV1 = { ...hostApi, revealOutcome: vi.fn(async () => { throw new Error('host went away'); }) };
    connectGameToHostMock.mockImplementationOnce(() => ({ promise: Promise.resolve(failing), destroy: destroySpy }));
    const { result } = renderHook(() => useCasinoHost(96.03));
    await waitFor(() => expect(result.current.hostApi).toBe(failing));
    act(() => result.current.reveal('s1'));
    act(() => result.current.reveal('s1')); // second call: already revealed, no second call to the host
    await Promise.resolve();
    expect(failing.revealOutcome).toHaveBeenCalledTimes(1);
  });
});

describe('useCasinoHost — computeMaxWager wiring', () => {
  it('is undefined with no casino limits on the snapshot', async () => {
    const { result, } = renderHook(() => useCasinoHost(96.03));
    expect(result.current.maxWager).toBeUndefined();
  });

  it('derives a wager ceiling once the snapshot carries casino limits', async () => {
    const { result } = renderHook(() => useCasinoHost(2));
    const methods = connectGameToHostMock.mock.calls[0][0] as { setState(s: HostSnapshotV1): Promise<void> };
    act(() => resolveConnection(hostApi));
    await waitFor(() => expect(result.current.hostApi).toBe(hostApi));
    await act(async () => {
      await methods.setState(snapshot({
        casino: { availableLiquidity: '1000000', maxBetRiskBps: 100, maxAllowedReservedProfit: '10000' },
      }));
    });
    expect(result.current.maxWager).toBeDefined();
    expect(typeof result.current.maxWager).toBe('bigint');
  });
});
