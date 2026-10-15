import * as THREE from 'three';
import { MagicCircle, Fireball, CoreFlash, Shockwave, DustWall, LightBeam, Scorch, Debris } from '../../vfx/ExplosionEffects.js';
import { clamp, damp, smoothstep } from '../../core/math.js';

/**
 * Visuals of Megumin's Explosion (M_R). The rules (2.40 s preparation, the aim point, the burst at the release,
 * zones, Exhaustion) come from the combat core; this only draws them from the action's own clock:
 *   prep    0 – 2.4 s : circle at her feet, target circles on the ground, stacked circles in the sky, the gem gathers light
 *   2.2 s            : the pillar of light comes down (the last 0.2 s: the final part of the incantation)
 *   2.4 s (release)  : the burst — short hot core, pressure ring, dust, sparks; then low dust and a rising, darkening smoke
 * Particles come from the shared pools; heavy effects are a handful of draw calls and are pre-warmed at start.
 */
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class ExplosionFX {
  constructor(game, fx) {
    this.game = game;
    this.fx = fx;
    this.circles = [];
    this.skyCircles = [];
    this.active = null; // { hero, act }
    this.exploded = false;
    this.beam = false;
    this.postT = -1;
    this._acc = {};
    const scene = game.scene;
    this.blastLight = new THREE.PointLight(0xff8a3a, 0, 0, 2);
    this.blastLight.castShadow = false;
    scene.add(this.blastLight);
    this.gemLight = new THREE.PointLight(0xff3a1a, 0, 6, 2);
    scene.add(this.gemLight);
  }

  start(hero, act) {
    const g = this.game;
    this.active = { hero, act };
    this.exploded = false;
    this.beam = false;
    this.skyCircles = [];
    this.targetCircle = this.targetCircle2 = null;
    const feet = g.player.slots[hero.id].controller.position.clone();
    const c1 = new MagicCircle({ radius: 1.7, color: [3.2, 0.55, 0.15], variant: 0, spin: 0.8, position: feet });
    const c2 = new MagicCircle({ radius: 1.15, color: [3.6, 1.4, 0.4], variant: 1, spin: -1.4, position: feet, groundOffset: 0.06 });
    this.circles.push(g.vfx.add(c1), g.vfx.add(c2));
    this.feetCircles = [c1, c2];
    g.audio?.play('charge');
  }

  /** The preparation was cancelled before the release: everything fades out quietly. */
  cancel() {
    for (const c of this.circles) c.kill(0.4);
    this.circles = [];
    this.skyCircles = [];
    this.targetCircle = this.targetCircle2 = null;
    this.active = null;
    this._relax = true;
  }

  update(dt) {
    const g = this.game;
    const a = this.active;
    if (a) {
      const { hero, act } = a;
      const s = act.spec;
      const t = act.t;
      const C = s.release;
      const slot = g.player.slots[hero.id];
      const model = slot.model;
      const vfx = g.vfx;
      if (!act.released) {
        const charge = clamp(t / C, 0, 1);
        const target = act.point;
        for (const c of this.feetCircles) {
          c.object.position.copy(slot.controller.position);
          c.radius = (c === this.feetCircles[0] ? 1.7 : 1.15) * (1 + charge * 0.25);
        }
        if (t > 0.35 && !this.targetCircle && target) {
          this.targetCircle = vfx.add(new MagicCircle({ radius: 5.5, color: [3.4, 0.5, 0.14], variant: 0, spin: 0.35, position: _v.set(target.x, target.y, target.z), groundOffset: 0.12 }));
          this.targetCircle2 = vfx.add(new MagicCircle({ radius: 2.5, color: [3.6, 1.25, 0.35], variant: 1, spin: -0.6, position: _v, groundOffset: 0.16 }));
          this.circles.push(this.targetCircle, this.targetCircle2);
        }
        if (this.targetCircle && target) {
          this.targetCircle.object.position.set(target.x, target.y + 0.12, target.z);
          this.targetCircle2.object.position.set(target.x, target.y + 0.16, target.z);
          // The last 0.4 s the aim is fixed: the contour gets denser.
          const locked = act.locked ? 1 : 0;
          this.targetCircle.radius = 5.5 * (1 - 0.04 * locked);
        }
        const skyTimes = [0.7, 1.0, 1.3, 1.55];
        for (let i = 0; i < skyTimes.length; i++) {
          if (t > skyTimes[i] && !this.skyCircles[i] && target) {
            const pos = _v.set(target.x, target.y + 7 + i * 4.5, target.z).clone();
            const c = vfx.add(new MagicCircle({
              radius: 6 - i * 1.15, color: i % 2 ? [3.6, 1.35, 0.36] : [3.2, 0.55, 0.14],
              variant: i % 2, spin: (i % 2 ? -1 : 1) * (0.4 + i * 0.2), position: pos, groundOffset: 0,
            }));
            this.skyCircles[i] = c;
            this.circles.push(c);
          }
        }
        // Particles: breath and weight shift, not a swirl of fireworks.
        const feetPos = slot.controller.position;
        this._rate('castSwirl', feetPos, 40 + charge * 120, dt, { intensity: 1 + charge });
        const gem = model.getGemWorldPosition(_v2);
        this._rate('castGather', gem, 30 + charge * 90, dt);
        this._rate('gemGlow', gem, 60, dt, { scale: 0.4 + charge * 0.8, alpha: 0.35 + charge * 0.45 });
        if (this.targetCircle && target) this._rate('circleEmber', _v.set(target.x, target.y, target.z), 40 + charge * 80, dt, { radius: 5.2 });
        this.gemLight.position.copy(gem);
        this.gemLight.intensity = 2 + charge * 14;
        model.gemMaterial.emissiveIntensity = 0.6 + charge * 8;
        model.uniforms.uMagicGlow.value.setRGB(0.75 * charge, 0.12 * charge, 0.04 * charge);
        this._darken(dt, 0.55 * smoothstep(0.2, 1, charge) * this.fx.flashK);
        this.fx.shake(dt * (0.05 + charge * charge * 0.6));
        // The pillar of light: the last 0.2 s before the release.
        if (!this.beam && t >= C - 0.2 && target) {
          this.beam = true;
          vfx.add(new LightBeam(_v.set(target.x, target.y, target.z).clone(), 70, 3.2, 0.5));
          this.fx.flash(0.35, 0.25);
        }
      }
    }
    this._post(dt);
  }

  /** The burst at the release (2.40 s of the action's clock). */
  release(hero, act, ev) {
    const g = this.game;
    const vfx = g.vfx;
    const T = new THREE.Vector3(act.point.x, act.point.y, act.point.z);
    this.exploded = true;
    this.postT = 0;
    this.target = T;
    for (const c of this.circles) c.kill(0.35);
    this.circles = [];
    this.skyCircles = [];
    this.active = null;
    const R = ev.radius;
    g.audio?.play('explosion', { dist: g.player.position.distanceTo(T) * 0.5 });
    vfx.add(new CoreFlash(_v.copy(T).add(_v2.set(0, 1.5, 0)).clone(), R * 1.2));
    vfx.add(new Fireball(T.clone(), R * 1.3));
    this.shock = vfx.add(new Shockwave(T, 24, 1.0));
    vfx.add(new Shockwave(T, 12, 0.6, [2.2, 1.3, 0.55]));
    vfx.add(new DustWall(T, 18, 1.5));
    vfx.add(new Scorch(g.world, T, R * 1.5));
    vfx.add(new Debris(g.world, T, 24));
    vfx.burst('fire', T, 90, { scale: 1 });
    vfx.burst('sparks', T, 220, { scale: 1 });
    vfx.burst('smoke', T, 60, { scale: 1 });
    vfx.burst('energyRing', T, 60);
    vfx.burst('groundDust', T, 60);
    this.fx.flash(0.8, 0.5);
    const d = g.camera.position.distanceTo(T);
    this.fx.shake(clamp(1.1 - d / 60, 0.4, 0.9));
    g.world.grass.triggerBlast(T.x, T.z);
    this.shockHit = false;
    this.hero = hero;
  }

  _post(dt) {
    const g = this.game;
    if (this.postT >= 0) {
      this.postT += dt;
      const et = this.postT;
      const T = this.target;
      const L = et < 0.06 ? et / 0.06 : Math.exp(-(et - 0.06) * 2.6);
      this.blastLight.intensity = 1400 * L * this.fx.flashK;
      this.blastLight.position.copy(T).add(_v.set(0, 4 + et * 2, 0));
      this.blastLight.color.setRGB(1, 0.55 + 0.25 * Math.exp(-et * 3), 0.25);
      // Eye adaptation: exposure dips with the flash so the fireball keeps its structure.
      g.renderer.toneMappingExposure = 1 / (1 + 0.9 * L * this.fx.flashK);
      // Hot flame leaves first, then the smoke; the dense part is gone in about a second.
      if (et < 0.9) this._rate('fireCore', T, 60 * (1 - et / 0.9), dt, { scale: 1 });
      if (et < 1.6) this._rate('smokeColumn', T, 22 * (1 - et / 1.6), dt);
      if (et < 2.2) this._rate('bigEmber', T, 36 * (1 - et / 2.2), dt);
      // The pressure ring reaches the heroines: cloak and hair whip.
      if (this.shock && !this.shockHit) {
        const p = g.player.position;
        const d = Math.hypot(p.x - T.x, p.z - T.z);
        if (this.shock.radius >= d) {
          this.shockHit = true;
          this.fx.shake(clamp(1.0 - d / 40, 0.2, 0.6));
          g.player.shockwaveHit(T, d);
        }
      }
      const hs = g.player.slots[this.hero.id].model;
      const glow = L * clamp(1.4 - Math.hypot(g.player.position.x - T.x, g.player.position.z - T.z) / 40, 0.2, 1);
      hs.uniforms.uMagicGlow.value.setRGB(1.4 * glow, 0.6 * glow, 0.18 * glow);
      this._darken(dt, 0.4 * Math.max(0, 1 - et / 2) * this.fx.flashK);
      this.gemLight.intensity = damp(this.gemLight.intensity, 0, 4, dt);
      hs.gemMaterial.emissiveIntensity = damp(hs.gemMaterial.emissiveIntensity, 0.6, 2, dt);
      if (et > 3.5) {
        this.blastLight.intensity = 0;
        g.renderer.toneMappingExposure = 1;
        hs.uniforms.uMagicGlow.value.setRGB(0, 0, 0);
        this.postT = -1;
        this._relax = true;
      }
      return;
    }
    if (this._relax) {
      const dn = g.dayNight;
      if (dn && dn.spellDim > 0.001) this._darken(dt, 0);
      else this._relax = false;
      this.gemLight.intensity = damp(this.gemLight.intensity, 0, 4, dt);
    }
  }

  _rate(type, p, rate, dt, opts) {
    let a = (this._acc[type] || 0) + rate * dt;
    while (a >= 1) {
      a -= 1;
      this.game.vfx.emit(type, p, opts);
    }
    this._acc[type] = a;
  }

  _darken(dt, amount) {
    const dn = this.game.dayNight;
    if (dn) dn.spellDim = damp(dn.spellDim, amount, 4, dt);
  }

  /**
   * Create every effect once and render it through the real pipeline (HDR target + shadow pass) so all shader
   * variants are compiled before the first cast. Runs behind the start overlay; the frame is never shown.
   */
  prewarm(composer, camera) {
    const g = this.game;
    const p = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6));
    p.y = g.world.groundAt(p.x, p.z);
    const list = [
      new MagicCircle({ radius: 1, position: p }),
      new MagicCircle({ radius: 1, variant: 1, position: p }),
      new Fireball(p, 1), new CoreFlash(p, 1), new Shockwave(p, 1), new DustWall(p, 1),
      new LightBeam(p, 1), new Scorch(g.world, p, 1), new Debris(g.world, p, 1),
    ];
    for (const e of list) {
      g.scene.add(e.object);
      e.update?.(0.016);
    }
    g.vfx.burst('fire', p, 2);
    g.vfx.burst('sparks', p, 2);
    composer.render();
    for (const e of list) {
      g.scene.remove(e.object);
      e.dispose();
    }
  }
}
