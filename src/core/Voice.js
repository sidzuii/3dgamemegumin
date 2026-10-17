import VOICES from 'virtual:voice-manifest';

/**
 * Recorded lines (public/audio/voice/<line id>.mp3|.ogg; the list is made at build time by vite.config.js). A line plays when
 * it is shown — a dialogue node, a bark or a combat call (RPG.say) — and stops when the next one comes or the window closes.
 * Lines without a file stay text only (Megumin is never voiced). Volume = the sound master (and mute) × `volume` (settings
 * «Голоса»). An HTML audio element of its own: the mixer of core/Audio.js is not involved.
 */
export class Voice {
  constructor(game) {
    this.game = game;
    this.volume = 1;
    this.current = null;
    this.count = Object.keys(VOICES).length;
    this.el = document.createElement('audio');
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => { this.current = null; });
  }

  has(id) {
    return !!(id && VOICES[id]);
  }

  /** Play the line `id` (stopping the one before); false when it has no recording or the sound is off. */
  play(id) {
    this.stop();
    if (!this.has(id)) return false;
    const A = this.game.audio?.settings;
    const vol = A?.muted ? 0 : (A?.master ?? 1) * this.volume;
    if (vol <= 0.001) return false;
    this.el.src = `${import.meta.env.BASE_URL}audio/voice/${id}.${VOICES[id]}`;
    this.el.volume = Math.min(1, vol);
    this.current = id;
    // a play() cut short by the next line rejects later: it must not clear the line that replaced it
    this.el.play().catch(() => { if (this.current === id && this.el.paused) this.current = null; });
    return true;
  }

  stop() {
    if (!this.current) return;
    this.el.pause();
    this.current = null;
  }
}
