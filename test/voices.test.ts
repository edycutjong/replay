/**
 * src/audio/voices.ts — WebAudio synthesis. jsdom implements none of the Web Audio API,
 * so `FakeAudioContext` (test/setup.ts) stands in: every node is a bag of no-op setters
 * and a `connect`, enough for the real code to build its real graphs — relay, crowd,
 * hum, horn — to completion. Assertions are on Voices' own observable state (enabled,
 * localStorage, the muted/on transitions), not on synthesised samples.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeAudioContext } from './setup';
import { Voices } from '../src/audio/voices';
import { sfx } from '../src/audio/bindings';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Voices — the mute state', () => {
  it('is muted by default on first ever load', () => {
    expect(new Voices().enabled).toBe(false);
  });

  it('reads a persisted "on" choice back on construction', () => {
    localStorage.setItem('replay_sound_v1', '1');
    expect(new Voices().enabled).toBe(true);
  });

  it('does not throw when storage access itself throws (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => new Voices()).not.toThrow();
    expect(new Voices().enabled).toBe(false);
    spy.mockRestore();
  });

  it('toggle() flips state, persists it, and starts/stops the hum path', () => {
    const v = new Voices();
    expect(v.toggle()).toBe(true);
    expect(v.enabled).toBe(true);
    expect(localStorage.getItem('replay_sound_v1')).toBe('1');
    expect(v.toggle()).toBe(false);
    expect(localStorage.getItem('replay_sound_v1')).toBe('0');
  });

  it('toggle() does not throw when storage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const v = new Voices();
    expect(() => v.toggle()).not.toThrow();
    spy.mockRestore();
  });
});

describe('Voices — ensure()', () => {
  it('never constructs an AudioContext while muted', () => {
    const v = new Voices();
    expect(v.ensure()).toBeNull();
  });

  it('returns null when the host has no AudioContext at all', () => {
    vi.stubGlobal('AudioContext', undefined);
    localStorage.setItem('replay_sound_v1', '1');
    const v = new Voices();
    expect(v.ensure()).toBeNull();
  });

  it('falls back to webkitAudioContext when AudioContext is absent', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    localStorage.setItem('replay_sound_v1', '1');
    const v = new Voices();
    expect(v.ensure()).toBeInstanceOf(FakeAudioContext);
  });

  it('builds the context once, reuses it, and resumes it if suspended', () => {
    localStorage.setItem('replay_sound_v1', '1');
    const v = new Voices();
    const ctx = v.ensure();
    expect(ctx).toBeInstanceOf(FakeAudioContext);
    expect(v.ensure()).toBe(ctx); // same instance, not rebuilt
  });
});

describe('Voices — the three graphs', () => {
  const on = (): Voices => {
    localStorage.setItem('replay_sound_v1', '1');
    return new Voices();
  };

  it('relay() builds its graph without throwing, at every default and overridden gain/Q', () => {
    const v = on();
    expect(() => v.relay(900, 40)).not.toThrow();
    expect(() => v.relay(900, 40, 0.2, 2)).not.toThrow();
  });

  it('relay() is a no-op while muted (no context to build against)', () => {
    const v = new Voices();
    expect(() => v.relay(900, 40)).not.toThrow();
  });

  it('crowd starts, adjusts to distance (clamped both ends), and stops idempotently', () => {
    const v = on();
    v.startCrowd();
    expect(() => v.startCrowd()).not.toThrow(); // second call is a no-op, not a second node
    v.setCrowd(0);
    v.setCrowd(20); // far beyond the clamp range on both gain and centre frequency
    v.stopCrowd();
    expect(() => v.stopCrowd()).not.toThrow(); // stopping twice does not throw
  });

  it('setCrowd before startCrowd, or after sound is off, is a no-op', () => {
    const v = new Voices();
    expect(() => v.setCrowd(1)).not.toThrow();
  });

  it('hum starts, is idempotent, and stops idempotently', () => {
    const v = on();
    v.startHum();
    expect(() => v.startHum()).not.toThrow();
    v.stopHum();
    expect(() => v.stopHum()).not.toThrow();
  });

  it('horn() builds an up-sweep major-triad graph and a down-sweep bent graph without throwing', () => {
    const v = on();
    expect(() => v.horn([220, 277, 330], 700, 'up')).not.toThrow();
    expect(() => v.horn([220, 233, 311], 420, 'down', 100)).not.toThrow();
  });

  it('horn() is a no-op while muted, same as every other graph', () => {
    const v = new Voices();
    expect(() => v.horn([220, 277, 330], 700, 'up')).not.toThrow();
  });

  it('stopCrowd swallows an exception from an already-stopped source node', () => {
    class ThrowingCtx extends FakeAudioContext {
      createBufferSource() {
        const node = super.createBufferSource();
        node.stop = () => { throw new DOMException('already stopped'); };
        return node;
      }
    }
    vi.stubGlobal('AudioContext', ThrowingCtx);
    const v = on();
    v.startCrowd();
    expect(() => v.stopCrowd()).not.toThrow();
  });

  it('stopHum swallows an exception from an already-stopped source node', () => {
    class ThrowingCtx extends FakeAudioContext {
      createBufferSource() {
        const node = super.createBufferSource();
        node.stop = () => { throw new DOMException('already stopped'); };
        return node;
      }
    }
    vi.stubGlobal('AudioContext', ThrowingCtx);
    const v = on();
    v.startHum();
    expect(() => v.stopHum()).not.toThrow();
  });
});

describe('sfx bindings — every event maps to a graph call without throwing', () => {
  it('plays every binding once a real context is available', () => {
    localStorage.setItem('replay_sound_v1', '1');
    const v = new Voices();
    v.ensure();
    expect(() => sfx.boot(v)).not.toThrow();
    expect(() => sfx.deal(v)).not.toThrow();
    expect(() => sfx.scoreStrike(v, 'HOME')).not.toThrow();
    expect(() => sfx.scoreStrike(v, 'AWAY')).not.toThrow();
    expect(() => sfx.rowLand(v, 2)).not.toThrow();
    expect(() => sfx.focus(v, 4)).not.toThrow();
    expect(() => sfx.ticketTear(v)).not.toThrow();
    expect(() => sfx.point(v, true)).not.toThrow();
    expect(() => sfx.point(v, false)).not.toThrow();
    expect(() => sfx.reconcile(v)).not.toThrow();
    expect(() => sfx.win(v)).not.toThrow();
    expect(() => sfx.loss(v)).not.toThrow();
    expect(() => sfx.nearMiss(v)).not.toThrow();
  });

  it('betLock() schedules five descending calls', () => {
    vi.useFakeTimers();
    localStorage.setItem('replay_sound_v1', '1');
    const v = new Voices();
    v.ensure();
    const spy = vi.spyOn(v, 'relay');
    sfx.betLock(v);
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });
});
