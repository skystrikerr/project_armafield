/**
 * All sound is synthesised at runtime — noise bursts through filters for guns
 * and explosions, a couple of detuned oscillators for the engine. Nothing is
 * downloaded, and the whole battlefield costs a few kilobytes of code.
 */

const SPEED_OF_SOUND = 340;

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  muted = false;

  /** Browsers only allow audio after a gesture, so this is called on first click. */
  resume() {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(2);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Volume from distance, plus the travel delay that makes a far-off gun read as far off. */
  private spatial(distance: number, falloff: number) {
    const gain = Math.max(0, 1 / (1 + (distance / falloff) * (distance / falloff)));
    return { gain, delay: Math.min(1.6, distance / SPEED_OF_SOUND) };
  }

  private noiseBurst(
    when: number,
    duration: number,
    gain: number,
    filter: { type: BiquadFilterType; freq: number; q: number; sweepTo?: number },
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter.type;
    biquad.frequency.setValueAtTime(filter.freq, when);
    if (filter.sweepTo) biquad.frequency.exponentialRampToValueAtTime(filter.sweepTo, when + duration);
    biquad.Q.value = filter.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(biquad).connect(g).connect(this.master!);
    src.start(when, Math.random());
    src.stop(when + duration + 0.05);
  }

  private tone(when: number, freq: number, endFreq: number, duration: number, gain: number, type: OscillatorType = "sine") {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(g).connect(this.master!);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  rifle(distance: number) {
    if (!this.ctx || this.muted) return;
    const { gain, delay } = this.spatial(distance, 55);
    if (gain < 0.005) return;
    const t = this.ctx.currentTime + delay;
    this.noiseBurst(t, 0.09, 0.5 * gain, { type: "bandpass", freq: 2400, q: 0.7, sweepTo: 600 });
    this.tone(t, 220, 70, 0.12, 0.25 * gain, "square");
    // The crack comes back off the treeline a moment later.
    if (distance > 40) this.noiseBurst(t + 0.14, 0.4, 0.14 * gain, { type: "lowpass", freq: 700, q: 0.5 });
  }

  cannon(distance: number) {
    if (!this.ctx || this.muted) return;
    const { gain, delay } = this.spatial(distance, 180);
    if (gain < 0.004) return;
    const t = this.ctx.currentTime + delay;
    this.noiseBurst(t, 0.5, 0.85 * gain, { type: "lowpass", freq: 900, q: 0.6, sweepTo: 120 });
    this.tone(t, 90, 28, 0.55, 0.5 * gain, "triangle");
    this.noiseBurst(t + 0.2, 1.1, 0.2 * gain, { type: "lowpass", freq: 400, q: 0.4 });
  }

  explosion(distance: number, size = 1) {
    if (!this.ctx || this.muted) return;
    const { gain, delay } = this.spatial(distance, 200 * size);
    if (gain < 0.004) return;
    const t = this.ctx.currentTime + delay;
    this.noiseBurst(t, 0.8 * size, 0.9 * gain, { type: "lowpass", freq: 1200, q: 0.5, sweepTo: 80 });
    this.tone(t, 70 / size, 22, 0.9 * size, 0.6 * gain, "sine");
    this.noiseBurst(t + 0.25, 1.6 * size, 0.22 * gain, { type: "lowpass", freq: 320, q: 0.3 });
  }

  ricochet(distance: number) {
    if (!this.ctx || this.muted) return;
    const { gain, delay } = this.spatial(distance, 70);
    if (gain < 0.01) return;
    const t = this.ctx.currentTime + delay;
    this.tone(t, 1800 + Math.random() * 900, 400, 0.3, 0.22 * gain, "sawtooth");
  }

  penetration(distance: number) {
    if (!this.ctx || this.muted) return;
    const { gain, delay } = this.spatial(distance, 120);
    const t = this.ctx.currentTime + delay;
    this.noiseBurst(t, 0.25, 0.6 * gain, { type: "bandpass", freq: 900, q: 1.4, sweepTo: 200 });
    this.tone(t, 320, 90, 0.3, 0.3 * gain, "square");
  }

  /** Whipcrack of a round going past your head. */
  snap(distance: number) {
    if (!this.ctx || this.muted) return;
    const gain = Math.max(0, 1 - distance / 7);
    if (gain <= 0.02) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.05, 0.5 * gain, { type: "highpass", freq: 2600, q: 0.6 });
  }

  hitMarker() {
    if (!this.ctx || this.muted) return;
    this.tone(this.ctx.currentTime, 1500, 1100, 0.07, 0.2, "square");
  }

  reload() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.06, 0.18, { type: "bandpass", freq: 1500, q: 2 });
    this.noiseBurst(t + 0.18, 0.08, 0.2, { type: "bandpass", freq: 900, q: 2 });
  }

  ui(freq = 660) {
    if (!this.ctx || this.muted) return;
    this.tone(this.ctx.currentTime, freq, freq * 0.7, 0.09, 0.16, "triangle");
  }

  /** Continuous engine note. `load` is 0..1, `pitch` roughly the rev fraction. */
  engine(active: boolean, pitch: number, load: number, aircraft: boolean) {
    if (!this.ctx || !this.master) return;
    if (!active) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }
    if (!this.engineOsc) {
      const ctx = this.ctx;
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineSub = ctx.createOscillator();
      this.engineSub.type = "square";
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 500;
      this.engineFilter.Q.value = 3;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineSub.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.engineSub.start();
    }
    const t = this.ctx.currentTime;
    const base = aircraft ? 62 : 34;
    this.engineOsc!.frequency.setTargetAtTime(base + pitch * (aircraft ? 90 : 52), t, 0.08);
    this.engineSub!.frequency.setTargetAtTime((base + pitch * 40) * 0.5, t, 0.08);
    this.engineFilter!.frequency.setTargetAtTime(300 + load * 900, t, 0.1);
    this.engineGain!.gain.setTargetAtTime(this.muted ? 0 : 0.1 + load * 0.12, t, 0.12);
  }

  dispose() {
    this.engineOsc?.stop();
    this.engineSub?.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
