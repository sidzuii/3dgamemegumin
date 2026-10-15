import * as THREE from 'three';
import { GroundFlash } from './Water.js';
import { clamp } from '../../core/math.js';

/**
 * Crimson Breach (M-F): a compact gathering at the staff, then a front of short ragged bursts that runs along the
 * ground at 16 m/s. Each burst has its own flash, low dust and a few sparks; the trace disappears behind the
 * front (no laser strip), the smoke lives under a second and never builds a wall in front of the camera
 * (fire-smoke-skill-vfx). The big round cap of the Explosion is deliberately absent: a narrow movement, not a dome.
 */
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

export class BreachFX {
  constructor(game, fx) {
    this.game = game;
    this.fx = fx;
    this.prep = null;
    this.light = new THREE.PointLight(0xff4a1a, 0, 7, 2);
    game.scene.add(this.light);
    this.flash = 0;
    this._acc = {};
  }

  start(hero, act) {
    this.prep = { hero, act };
  }

  cancel() {
    this.prep = null;
  }

  update(dt) {
    const g = this.game;
    const p = this.prep;
    if (p) {
      const { hero, act } = p;
      const s = act.spec;
      const k = clamp(act.t / s.release, 0, 1);
      g.player.slots[hero.id].model.getGemWorldPosition(_p);
      // Light is concentrated at the staff head.
      this.light.position.copy(_p);
      this.light.intensity = (1 + k * 9) * this.fx.flashK;
      this._rate('castGather', _p, 18 + k * 70, dt);
      this._rate('gemGlow', _p, 40, dt, { scale: 0.25 + k * 0.5, alpha: 0.3 + k * 0.4 });
      const model = g.player.slots[hero.id].model;
      model.gemMaterial.emissiveIntensity = 0.6 + k * 5;
      model.uniforms.uMagicGlow.value.setRGB(0.5 * k, 0.1 * k, 0.03 * k);
      if (act.released) this.prep = null;
    } else if (this.light.intensity > 0.01) {
      this.flash = Math.max(0, this.flash - dt * 4);
      this.light.intensity = Math.max(0, this.light.intensity - dt * 30);
      const m = g.player.model;
      if (m.gemMaterial) m.gemMaterial.emissiveIntensity = Math.max(0.6, m.gemMaterial.emissiveIntensity - dt * 8);
      m.uniforms?.uMagicGlow.value.setRGB(0, 0, 0);
    }
  }

  /** The wave leaves the staff (1.10 s). */
  onBreach(ev) {
    const g = this.game;
    const slot = g.player.slots[ev.hero];
    slot.model.getGemWorldPosition(_p);
    g.vfx.burst('sparks', _p, 30, { scale: 0.5 });
    g.vfx.burst('fire', _p, 8, { scale: 0.3 });
    this.light.intensity = 10 * this.fx.flashK;
    this.fx.shake(0.18);
    this.fx.flash(0.15, 0.2);
    g.audio?.play('explosion', { dist: 18, vol: 0.45 });
    this.prep = null;
    // A hit on a short line still reads: mark the stop point.
    if (ev.stopped) g.hud.toast('Волна упрётся в препятствие.', 1.2);
  }

  /** One burst per metre of the front. */
  onMark(ev) {
    const g = this.game;
    const pos = ev.pos;
    const y = g.world.groundAt(pos.x, pos.z, pos.y + 2);
    _p.set(pos.x + (Math.random() - 0.5) * 0.5, y + 0.1, pos.z + (Math.random() - 0.5) * 0.5);
    g.vfx.add(new GroundFlash(g.world, _p, 1.3 + Math.random() * 0.4, 0.32, [2.8, 1.0, 0.25], 0.09));
    g.vfx.burst('groundDust', _p, 5, { scale: 0.45 });
    g.vfx.burst('fire', _p, 4, { scale: 0.32 });
    g.vfx.burst('sparks', _p, 7, { scale: 0.3 });
    if (ev.dist % 3 === 0) g.vfx.burst('ember', _q.copy(_p).setY(y + 0.5), 3);
    if (ev.dist % 2 === 0) g.audio?.play('slam', { dist: g.player.position.distanceTo(_p), vol: 0.35 });
    this.fx.shake(0.015);
  }

  onHit(ev) {
    const g = this.game;
    ev.target.chest ? ev.target.chest(_p) : _p.set(ev.target.pos.x, ev.target.pos.y + 1, ev.target.pos.z);
    g.vfx.burst('fire', _p, 16, { scale: 0.45 });
    g.vfx.burst('sparks', _p, 22, { scale: 0.45 });
    g.vfx.burst('smoke', _p, 4, { scale: 0.5 });
  }

  _rate(type, p, rate, dt, opts) {
    const k = type + (opts ? '1' : '');
    let a = (this._acc[k] || 0) + rate * dt;
    while (a >= 1) {
      a -= 1;
      this.game.vfx.emit(type, p, opts);
    }
    this._acc[k] = a;
  }
}
