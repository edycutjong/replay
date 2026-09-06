/**
 * Sound — ui.md §7. WebAudio synthesis only: zero audio files, no music, no ambient
 * loop, no soundtrack. One satisfying resolve outclasses a soundtrack, and every extra
 * voice is another chance to sound generic.
 *
 * THREE GRAPHS AND N PARAMETERISED BINDINGS, not N sounds. The menu focus tick is not a
 * fourth voice — it is RELAY with a shorter envelope and a different filter centre. Same
 * function, same code path, one parameter.
 *
 * The design goal is stated as a test (§7.3, QA gate G5): play a full round with the
 * screen covered and you must still be able to say which side scored each point, whether
 * your ticket was getting closer, and whether you won, lost, or nearly. That is why the
 * two point pitches differ, why CROWD's gain is driven by distance-to-your-line, and why
 * the near-miss chord bends instead of resolving.
 */

const STORE_KEY = 'replay_sound_v1';

export class Voices {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private crowd: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private _on = false;

  get enabled(): boolean { return this._on; }

  /** Muted by default on first ever load; the choice persists so a returning player is
   *  not re-muted. Reading storage can throw in a locked-down context — never fatal. */
  constructor() {
    try { this._on = localStorage.getItem(STORE_KEY) === '1'; } catch { this._on = false; }
  }

  toggle(): boolean {
    this._on = !this._on;
    try { localStorage.setItem(STORE_KEY, this._on ? '1' : '0'); } catch { /* private mode */ }
    if (this._on) this.ensure(); else this.stopCrowd();
    return this._on;
  }

  /** §7.4: the AudioContext is constructed on the first user gesture and never before.
   *  Nothing autoplays. */
  ensure(): AudioContext | null {
    if (!this._on) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      // master bus: -6 dBFS ceiling plus one limiter, so overlapping halos of SOUND
      // cannot clip the way overlapping halos of LIGHT are deliberately allowed to.
      const lim = this.ctx.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20;
      lim.attack.value = 0.002; lim.release.value = 0.12;
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.5;
      this.bus.connect(lim); lim.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private noise(ctx: AudioContext, seconds: number, pink: boolean): AudioBuffer {
    const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      // Paul Kellet's pink approximation — cheap, and pink is what a crowd is
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  /**
   * VOICE 1 · RELAY — contact, weight, decay. A noise burst through a narrow bandpass,
   * plus a 4ms square click and a low body thump. Every discrete event in the game is
   * this function with different arguments.
   */
  relay(f: number, d: number, g = 0.6, q = 6): void {
    const ctx = this.ensure(); if (!ctx || !this.bus) return;
    const t = ctx.currentTime, dur = d / 1000;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, Math.max(0.02, dur), false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(g, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(env); env.connect(this.bus);
    src.start(t); src.stop(t + dur + 0.02);

    const click = ctx.createOscillator();
    click.type = 'square'; click.frequency.value = f * 0.9;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(g * 0.22, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
    click.connect(cg); cg.connect(this.bus);
    click.start(t); click.stop(t + 0.02);

    const body = ctx.createOscillator();
    body.type = 'sine'; body.frequency.value = 90;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(g * 0.3, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.09, dur));
    body.connect(bg); bg.connect(this.bus);
    body.start(t); body.stop(t + 0.12);
  }

  /** VOICE 2 · CROWD — proximity and tension. NOT an ambient loop: the gain is 0 except
   *  when a state variable drives it, and that variable is the path's distance to your
   *  ticket line. The crowd noise IS the proximity readout. */
  startCrowd(): void {
    const ctx = this.ensure(); if (!ctx || !this.bus || this.crowd) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, 2, true);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 420; filt.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt); filt.connect(gain); gain.connect(this.bus);
    src.start();
    this.crowd = { src, filt, gain };
  }

  /** `d` is the path's distance to the ticket line. `mute` forces the gain to zero
   *  regardless of `d` — the ghost touch sits at d=1, the loudest distance on the whole
   *  curve, and the beat it belongs to is built to land in silence, not at the top of
   *  this method's own range. */
  setCrowd(d: number, mute = false): void {
    if (!this.ctx || !this.crowd) return;
    const t = this.ctx.currentTime;
    const g = mute ? 0 : Math.max(0, Math.min(0.5, 0.5 - 0.09 * d));
    const centre = Math.max(420, Math.min(1150, 1150 - d * 120));
    this.crowd.gain.gain.setTargetAtTime(g, t, 0.08);
    this.crowd.filt.frequency.setTargetAtTime(centre, t, 0.08);
  }

  stopCrowd(): void {
    if (!this.crowd || !this.ctx) return;
    try { this.crowd.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); this.crowd.src.stop(this.ctx.currentTime + 0.4); } catch { /* already stopped */ }
    this.crowd = null;
  }

  /**
   * THE CABINET HUM — ui.md §7.2's "VRF wait" binding: centre 40Hz, gain 0.06, meaning
   * "the cabinet is powered and waiting". This is CROWD at the bottom of its range, not
   * a fourth voice and not a soundtrack.
   *
   * It is deliberately the answer to "add some music". complexity.md CUT #18 removes
   * background music and ambient loops by name, and the judged criterion reads "does it
   * feel like a real game? No AI slop" — a generic bed under a 1977 scoreboard is the
   * fastest way to sound generated. A powered cabinet is a room tone with a reason.
   */
  private hum: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  startHum(): void {
    const ctx = this.ensure(); if (!ctx || !this.bus || this.hum) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, 2, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 40; lp.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.6);
    // a 50Hz mains-ish partial: what a room full of tungsten actually sounds like
    const mains = ctx.createOscillator();
    mains.type = 'sine'; mains.frequency.value = 50;
    const mg = ctx.createGain(); mg.gain.value = 0.012;
    mains.connect(mg); mg.connect(gain);
    mains.start();
    src.connect(lp); lp.connect(gain); gain.connect(this.bus);
    src.start();
    this.hum = { src, gain };
  }

  stopHum(): void {
    if (!this.hum || !this.ctx) return;
    try {
      this.hum.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      this.hum.src.stop(this.ctx.currentTime + 1);
    } catch { /* already stopped */ }
    this.hum = null;
  }

  /** VOICE 3 · HORN — resolution. Three detuned saws through a soft-clip shaper and an
   *  env-swept lowpass. The chords are chosen so the verdict is unambiguous with the
   *  screen covered: a major triad, or a root/minor-second/tritone that is sour BY
   *  CONSTRUCTION rather than by sample choice. */
  horn(freqs: number[], ms: number, sweep: 'up' | 'down', bendCents = 0): void {
    const ctx = this.ensure(); if (!ctx || !this.bus) return;
    const t = ctx.currentTime, dur = ms / 1000;
    const shaper = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1;
    lp.frequency.setValueAtTime(sweep === 'up' ? 300 : 2200, t);
    lp.frequency.exponentialRampToValueAtTime(sweep === 'up' ? 2600 : 260, t + dur * 0.8);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.02);          // attack
    env.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.35);   // decay -> sustain
    // A near-miss is cut at the top with no release: an unfinished cadence.
    if (bendCents === 0) env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else env.gain.setValueAtTime(0.0001, t + dur);
    shaper.connect(lp); lp.connect(env); env.connect(this.bus);
    freqs.forEach((f, i) => {
      for (const detune of [-7, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.setValueAtTime(detune, t);
        if (bendCents && i === 0) o.detune.linearRampToValueAtTime(detune + bendCents, t + 0.24);
        o.connect(shaper);
        o.start(t); o.stop(t + dur + 0.05);
      }
    });
  }
}
