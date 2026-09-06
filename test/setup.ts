/**
 * Global test environment shims.
 *
 * jsdom implements neither the Canvas 2D API nor Web Audio — both are load-bearing for
 * this product (bulbs.ts is the renderer, voices.ts is the whole sound design) and both
 * are exactly the surface the old `coverage.include: ['src/game/**']` scope excused
 * itself from touching. Rather than pull in a native canvas binding (a build dependency
 * this repo has never needed, and one more thing to keep compiling across CI runners),
 * these are hand-rolled fakes that implement enough of each API's shape for the real
 * code to run its real branches to completion. They do not claim pixel- or sample-
 * accurate output — assertions in the render tests read the `Field` lamp lists the
 * composers build (the actual product logic), not rendered canvas bytes.
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

class FakeGradient {
  stops: Array<{ offset: number; color: string }> = [];
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

class FakeCanvasRenderingContext2D {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  globalCompositeOperation = 'source-over';
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  fillRect(): void {}
  clearRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  setTransform(): void {}
  resetTransform(): void {}
  drawImage(): void {}
  measureText(text: string): { width: number } {
    return { width: String(text).length * 6 };
  }
  createPattern(): CanvasPattern {
    return {} as CanvasPattern;
  }
  createRadialGradient(): CanvasGradient {
    return new FakeGradient() as unknown as CanvasGradient;
  }
  createLinearGradient(): CanvasGradient {
    return new FakeGradient() as unknown as CanvasGradient;
  }
  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    const width = Math.max(0, Math.floor(w));
    const height = Math.max(0, Math.floor(h));
    const data = new Uint8ClampedArray(width * height * 4);
    // A real radial gradient (bulbs.ts's sprite bake) is opaque at the centre and fades
    // to fully transparent at the corners; a flat fill here would leave both of
    // `renderCanvas`'s alpha branches — draw it, or skip a fully transparent texel —
    // untested, which is the same class of gap this whole harness exists to close.
    // A hard-edged circle is good enough: it is not a rendering fidelity fixture, just
    // something with both an inside and an outside.
    const cx = width / 2, cy = height / 2, radius = Math.min(width, height) / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
        data[i] = 200; data[i + 1] = 150; data[i + 2] = 100; data[i + 3] = inside ? 255 : 0;
      }
    }
    return { data, width, height, colorSpace: 'srgb' } as ImageData;
  }
  putImageData(): void {}
}

// `getContext('2d', ...)` is called both on the mounted board (via a ref) and on
// throwaway canvases `bulbs.ts` creates itself for sprite baking and the socket tile —
// stubbing the prototype covers both call sites the same way a real browser would.
HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, id: string) {
  if (id !== '2d') return null;
  return new FakeCanvasRenderingContext2D(this);
}) as unknown as HTMLCanvasElement['getContext'];

type Param = { value: number; setValueAtTime(): void; exponentialRampToValueAtTime(): void; linearRampToValueAtTime(): void; setTargetAtTime(): void };
const param = (value = 0): Param => ({
  value,
  setValueAtTime() {},
  exponentialRampToValueAtTime() {},
  linearRampToValueAtTime() {},
  setTargetAtTime() {},
});

/** A Web Audio graph is a write-only API from the test's point of view — every node is a
 *  bag of no-op setters and a `connect`. What matters for coverage is that every code
 *  path that builds a graph (relay/crowd/hum/horn in voices.ts) runs to completion
 *  without a host object throwing on a method or property it doesn't recognise. */
export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  destination = {};

  createGain() {
    return { gain: param(1), connect() {}, disconnect() {} };
  }
  createBiquadFilter() {
    return { type: 'lowpass', frequency: param(0), Q: param(0), connect() {}, disconnect() {} };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: param(0),
      detune: param(0),
      connect() {},
      start() {},
      stop() {},
    };
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      loop: false,
      connect() {},
      start() {},
      stop() {},
    };
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: () => data,
    };
  }
  createWaveShaper() {
    return { curve: null as Float32Array | null, connect() {} };
  }
  createDynamicsCompressor() {
    return { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0), connect() {} };
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// Not installed globally: `Voices` feature-detects `window.AudioContext`, and the test
// for that detection path (no host support) needs the real absence. Individual test
// files install it with `vi.stubGlobal` where they exercise the audio graph.
export {};
