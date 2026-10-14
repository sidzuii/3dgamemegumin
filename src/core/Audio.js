/**
 * Game audio, fully procedural (WebAudio, no files).
 *
 *  - Buses: master -> compressor -> out; sfx and music sit under master. Settings (master, sfx,
 *    music, mute, captions) live in localStorage 'megumin-audio'.
 *  - The context is created on the first user gesture (autoplay policy), suspended while the tab
 *    is hidden and resumed on return.
 *  - SFX voices carry a priority (see CUES). At the voice cap a louder-priority cue steals the
 *    quietest-priority oldest voice (a fade, no click); lower-priority cues are dropped instead.
 *    Critical cues (hurt, warning, perfect dodge) are never lost to crowd noise.
 *  - Music is a state machine on one persistent pad: calm (town by day), field, night, combat.
 *    State changes crossfade (gains and chord notes glide), never restart.
 *  - Cues the player must not miss can show a short caption (settings: «Подписи звуков»).
 */
const MAX_VOICES = 14;
const KEY = 'megumin-audio';

/** priority: 3 critical (hurt, warnings, perfect dodge), 2 gameplay (hits, swings, explosion),
 * 1 feedback (pickups, UI), 0 ambient detail. caption: text shown when captions are on. */
const CUES = {
  swing: { p: 1 },
  hit: { p: 2 },
  hitHeavy: { p: 2 },
  dodge: { p: 2 },
  perfect: { p: 3, caption: 'Точный уклон!' },
  hurt: { p: 3, caption: 'Удар по Мегумин' },
  windup: { p: 2, caption: 'Враг замахивается' },
  slam: { p: 2, caption: 'Мощный удар по земле' },
  bolt: { p: 2, caption: 'Выстрел врага' },
  charge: { p: 2 },
  explosion: { p: 3 },
  pickup: { p: 1 },
  questStart: { p: 1, caption: 'Новое задание' },
  questStage: { p: 1 },
  questDone: { p: 2, caption: 'Задание выполнено' },
  levelup: { p: 2, caption: 'Новый уровень!' },
  heartbeat: { p: 3, caption: 'Мало здоровья' },
  ui: { p: 0 },
};

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

/** Pad chords (MIDI) and the music state table: gains of the pad / wind / pulse layers, lowpass. */
const CHORDS = {
  calm: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 66]],
  field: [[50, 57, 62, 66], [47, 54, 59, 62], [55, 59, 62, 69], [52, 59, 62, 67]],
  night: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [45, 52, 57, 64]],
  combat: [[45, 52, 57, 60], [43, 50, 55, 58], [41, 48, 53, 56], [40, 47, 52, 56]],
};
const MUSIC = {
  calm: { pad: 0.5, wind: 0.0, pulse: 0.0, cut: 1500 },
  field: { pad: 0.42, wind: 0.07, pulse: 0.0, cut: 1100 },
  night: { pad: 0.4, wind: 0.05, pulse: 0.0, cut: 800 },
  combat: { pad: 0.55, wind: 0.0, pulse: 0.55, cut: 2200 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.voices = [];
    this.settings = { master: 0.7, sfx: 1, music: 0.5, muted: false, captions: false };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        for (const k of Object.keys(this.settings)) if (k in s) this.settings[k] = s[k];
      } else {
        const old = localStorage.getItem('megumin-volume'); // earlier single volume
        if (old !== null && Number.isFinite(+old)) this.settings.master = Math.max(0, Math.min(1, +old));
      }
    } catch { /* storage blocked */ }
    this.state = 'calm';
    this.target = 'calm';
    this.chordIdx = 0;
    this.chordT = 0;
    this.pulseT = 0;
    this.hbT = 0;
    this.duck = 1;
    this.hud = null;
    const unlock = () => this._ensure();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.unlocked) this.ctx.resume();
    });
  }

  get muted() { return this.settings.muted; }

  set(key, value) {
    this.settings[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this._apply();
  }

  toggleMute() {
    this.set('muted', !this.settings.muted);
    return this.settings.muted;
  }

  _apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.settings;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.music * this.duck, t, 0.15);
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.sfxBus = c.createGain();
      this.musicBus = c.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.comp).connect(c.destination);
      const n = c.sampleRate;
      this.noise = c.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this._buildMusic();
      this._apply();
    }
    this.unlocked = true;
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
    return this.ctx;
  }

  // ------------------------------------------------------------------------------ SFX
  /** play(name, { vol, dist }) — dist (m) attenuates and delays slightly. */
  play(name, o = {}) {
    const ctx = this.ctx, cue = CUES[name], S = SOUNDS[name];
    if (!ctx || !cue || !S || ctx.state !== 'running' || this.settings.muted) return;
    const att = o.dist ? Math.max(0, 1 - o.dist / 45) : 1;
    const vol = (o.vol ?? 1) * att;
    if (vol < 0.02) return;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= MAX_VOICES) {
      // Steal the lowest-priority, oldest voice only for a cue of higher priority.
      let low = null;
      for (const v of this.voices) if (!low || v.p < low.p || (v.p === low.p && v.start < low.start)) low = v;
      if (!low || low.p >= cue.p) return;
      low.bus.gain.cancelScheduledValues(now);
      low.bus.gain.setTargetAtTime(0, now, 0.01);
      low.end = now;
      this.voices.splice(this.voices.indexOf(low), 1);
    }
    const bus = ctx.createGain();
    bus.connect(this.sfxBus);
    const t = now + (o.dist ? o.dist / 340 : 0);
    this._bus = bus;
    const end = S(this, t, vol);
    this._bus = null;
    this.voices.push({ bus, p: cue.p, start: now, end });
    setTimeout(() => bus.disconnect(), Math.max(0, (end - now) * 1000) + 80);
    if (cue.caption && this.settings.captions && (!o.dist || o.dist < 25)) this._caption(cue.caption);
  }

  _caption(text) {
    const now = performance.now();
    if (this._lastCaption === text && now - this._capT < 1500) return;
    this._lastCaption = text;
    this._capT = now;
    this.hud?.toast?.('♪ ' + text, 1.4);
  }

  _out() { return this._bus || this.sfxBus; }

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
    src.connect(f).connect(this._env(t, dur, vol)).connect(this._out());
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
    o.connect(this._env(t, dur, vol)).connect(this._out());
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

  // ------------------------------------------------------------------------------ music
  _buildMusic() {
    const c = this.ctx;
    this.pad = { out: c.createGain(), lp: c.createBiquadFilter(), oscs: [] };
    this.pad.lp.type = 'lowpass';
    this.pad.lp.frequency.value = 1200;
    this.pad.out.gain.value = 0;
    this.pad.lp.connect(this.pad.out).connect(this.musicBus);
    for (let i = 0; i < 4; i++) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.detune.value = det;
        o.frequency.value = midi(CHORDS.calm[0][i]);
        const g = c.createGain();
        g.gain.value = i === 0 ? 0.22 : 0.13;
        o.connect(g).connect(this.pad.lp);
        o.start();
        this.pad.oscs.push({ o, i });
      }
    }
    // Wind / air: slow-filtered noise.
    const w = c.createBufferSource();
    w.buffer = this.noise;
    w.loop = true;
    this.wind = { out: c.createGain() };
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 500;
    wf.Q.value = 0.6;
    this.wind.out.gain.value = 0;
    w.connect(wf).connect(this.wind.out).connect(this.musicBus);
    w.start();
    // Combat pulse: a soft low drum, scheduled from update().
    this.pulse = { out: c.createGain() };
    this.pulse.out.gain.value = 0;
    this.pulse.out.connect(this.musicBus);
  }

  _drum(t, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.pulse.out);
    o.start(t);
    o.stop(t + 0.25);
  }

  _setMusicState(name) {
    if (!this.ctx || name === this.state) return;
    this.state = name;
    const t = this.ctx.currentTime, M = MUSIC[name];
    this.pad.out.gain.setTargetAtTime(M.pad, t, 1.2);
    this.pad.lp.frequency.setTargetAtTime(M.cut, t, 1.2);
    this.wind.out.gain.setTargetAtTime(M.wind, t, 1.5);
    this.pulse.out.gain.setTargetAtTime(M.pulse, t, name === 'combat' ? 0.4 : 1.5);
    this._chord(t, 1.5);
  }

  _chord(t, glide) {
    const ch = CHORDS[this.state][this.chordIdx % 4];
    for (const { o, i } of this.pad.oscs) o.frequency.setTargetAtTime(midi(ch[i]), t, glide / 3);
  }

  /**
   * Per-frame driver. ctx: { dt, paused (menu / dialogue), combat, night, safe, hp (0..1) }.
   * Music state follows the situation; menus duck the music instead of cutting it.
   */
  update(ctx) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const dt = Math.min(ctx.dt, 0.1);
    const want = ctx.combat ? 'combat' : ctx.night ? 'night' : ctx.safe ? 'calm' : 'field';
    // Leave combat music only after a quiet moment (no flicker between swings).
    if (want === 'combat') { this.combatHold = 4; this.target = 'combat'; }
    else if (this.combatHold > 0 && !ctx.paused) { this.combatHold -= dt; } else this.target = want;
    this._setMusicState(this.target);
    const duck = ctx.paused ? 0.35 : 1;
    if (duck !== this.duck) { this.duck = duck; this._apply(); }
    const now = this.ctx.currentTime;
    if (!ctx.paused) {
      this.chordT += dt;
      if (this.chordT > 8) { this.chordT = 0; this.chordIdx++; this._chord(now, 4); }
      if (this.state === 'combat') {
        this.pulseT -= dt;
        if (this.pulseT <= 0) { this._drum(now + 0.02, 0.5); this.pulseT = 0.52; }
      }
      if (ctx.hp > 0 && ctx.hp < 0.25) {
        this.hbT -= dt;
        if (this.hbT <= 0) { this.play('heartbeat'); this.hbT = 1.1; }
      }
    }
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
  pickup: (a, t, v) => Math.max(a._tone(t, 0.12, 0.16 * v, 'triangle', 660, 990), a._tone(t + 0.07, 0.16, 0.14 * v, 'triangle', 990, 1320)),
  questStart: (a, t, v) => Math.max(a._tone(t, 0.25, 0.16 * v, 'sine', 523, 523), a._tone(t + 0.12, 0.3, 0.16 * v, 'sine', 659, 659), a._tone(t + 0.24, 0.4, 0.16 * v, 'sine', 784, 784)),
  questStage: (a, t, v) => Math.max(a._tone(t, 0.2, 0.14 * v, 'sine', 659, 659), a._tone(t + 0.1, 0.3, 0.14 * v, 'sine', 880, 880)),
  questDone: (a, t, v) => Math.max(a._tone(t, 0.3, 0.2 * v, 'triangle', 523, 523), a._tone(t + 0.14, 0.3, 0.2 * v, 'triangle', 659, 659), a._tone(t + 0.28, 0.3, 0.2 * v, 'triangle', 784, 784), a._tone(t + 0.42, 0.7, 0.22 * v, 'triangle', 1047, 1047)),
  levelup: (a, t, v) => Math.max(a._tone(t, 0.9, 0.2 * v, 'triangle', 392, 784), a._tone(t + 0.15, 0.9, 0.16 * v, 'sine', 587, 1175), a._noise(t, 0.5, 0.06 * v, 'highpass', 4000, 9000)),
  heartbeat: (a, t, v) => Math.max(a._tone(t, 0.14, 0.4 * v, 'sine', 70, 45), a._tone(t + 0.22, 0.12, 0.3 * v, 'sine', 65, 42)),
  ui: (a, t, v) => a._tone(t, 0.05, 0.08 * v, 'square', 900, 700),
};
