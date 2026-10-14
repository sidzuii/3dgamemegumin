/**
 * Procedural combat sounds (WebAudio, no files): swings, hits, the dodge whoosh, enemy wind-ups,
 * slams and the Explosion. The context is created on the first user gesture (autoplay policy);
 * voices are capped so a big fight stays cheap. Volume: localStorage 'megumin-volume' (0..1).
 */
const MAX_VOICES = 16;

export class Audio {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    let v = 0.7;
    try {
      const s = localStorage.getItem('megumin-volume');
      if (s !== null && Number.isFinite(+s)) v = Math.max(0, Math.min(1, +s));
    } catch { /* storage blocked */ }
    this.volume = v;
    const unlock = () => this._ensure();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
    try { localStorage.setItem('megumin-volume', String(this.volume)); } catch { /* ignore */ }
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** play(name, { vol, dist }) — dist (m) attenuates and delays slightly. */
  play(name, o = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.volume <= 0 || this.voices >= MAX_VOICES) return;
    const att = o.dist ? Math.max(0, 1 - o.dist / 45) : 1;
    const vol = (o.vol ?? 1) * att;
    if (vol < 0.02) return;
    const t = ctx.currentTime + (o.dist ? o.dist / 340 : 0);
    const S = SOUNDS[name];
    if (!S) return;
    this.voices++;
    const end = S(this, t, vol);
    setTimeout(() => this.voices--, (end - ctx.currentTime) * 1000 + 50);
  }

  /** Filtered noise burst. */
  _noise(t, dur, vol, type, f0, f1, q = 1) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this._env(t, dur, vol);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return t + dur;
  }

  /** Oscillator sweep. */
  _tone(t, dur, vol, type, f0, f1) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this._env(t, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return t + dur;
  }

  _env(t, dur, vol) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
}

const SOUNDS = {
  swing: (a, t, v) => a._noise(t, 0.16, 0.35 * v, 'bandpass', 900, 2600, 1.4),
  hit: (a, t, v) => Math.max(a._noise(t, 0.09, 0.5 * v, 'lowpass', 2400, 600), a._tone(t, 0.12, 0.45 * v, 'sine', 160, 70)),
  hitHeavy: (a, t, v) => Math.max(a._noise(t, 0.18, 0.7 * v, 'lowpass', 1800, 300), a._tone(t, 0.25, 0.7 * v, 'sine', 120, 45)),
  dodge: (a, t, v) => a._noise(t, 0.26, 0.3 * v, 'bandpass', 500, 1600, 0.8),
  perfect: (a, t, v) => Math.max(a._tone(t, 0.35, 0.25 * v, 'triangle', 880, 1320), a._tone(t + 0.05, 0.3, 0.18 * v, 'sine', 1320, 1760)),
  hurt: (a, t, v) => Math.max(a._noise(t, 0.12, 0.45 * v, 'lowpass', 1500, 400), a._tone(t, 0.18, 0.35 * v, 'square', 220, 110)),
  windup: (a, t, v) => a._tone(t, 0.3, 0.12 * v, 'sawtooth', 180, 420),
  slam: (a, t, v) => Math.max(a._noise(t, 0.45, 0.8 * v, 'lowpass', 900, 120), a._tone(t, 0.5, 0.8 * v, 'sine', 90, 35)),
  bolt: (a, t, v) => a._tone(t, 0.25, 0.2 * v, 'triangle', 600, 1400),
  charge: (a, t, v) => Math.max(a._tone(t, 2.1, 0.18 * v, 'sawtooth', 60, 420), a._noise(t, 2.1, 0.12 * v, 'bandpass', 300, 3000, 2)),
  explosion: (a, t, v) => Math.max(a._noise(t, 2.6, 1.0 * v, 'lowpass', 2400, 60), a._tone(t, 2.2, 0.9 * v, 'sine', 70, 22)),
};
