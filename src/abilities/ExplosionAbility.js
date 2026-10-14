import * as THREE from 'three';
import { MagicCircle, Fireball, CoreFlash, Shockwave, DustWall, LightBeam, Scorch, Debris } from '../vfx/ExplosionEffects.js';
import { clamp, damp, smoothstep } from '../core/math.js';

/**
 * Megumin's signature spell — "Explosion!"
 *
 * Timeline (seconds from pressing Q):
 *   0.00  wind-up: staff raised, magic circle drawn at her feet, motes swirl
 *   0.35  target circle on the ground (aimed with the crosshair)
 *   0.70+ stacked circles appear in the sky above the target
 *   CHARGE  energy gathers into the staff gem, world darkens, rising camera shake
 *   CHARGE  release: pillar of light strikes the target + screen flash
 *   +0.08 detonation: fireball, core flash, shockwave, dust wall, sparks, smoke, debris
 *   +0.55 Megumin collapses (Exhausted) for a few seconds
 *
 * Performance: all heavy effects are a handful of draw calls; particles come from
 * fixed-size pools. Effects are pre-warmed at startup so the first cast doesn't hitch.
 */

export const EXPLOSION = {
  name: 'Explosion',
  cooldown: 14,
  charge: 2.1,
  minRange: 12,
  maxRange: 34,
  defaultRange: 18,
  radius: 10, // damage / knockback radius
  exhaustDuration: 3.4,
  mana: 100, // all of it (capped by max mana)
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class ExplosionAbility {
  constructor(game) {
    this.game = game;
    this.state = 'ready'; // ready | charging | released
    this.t = 0;
    this.cooldownLeft = 0;
    this.target = new THREE.Vector3();
    this.circles = [];
    this.skyCircles = [];
    this.exploded = false;
    this.collapsed = false;

    const scene = game.scene;
    // Pre-created lights (no shader recompiles when the spell is cast).
    this.blastLight = new THREE.PointLight(0xff8a3a, 0, 0, 2);
    this.blastLight.castShadow = false;
    scene.add(this.blastLight);
    this.gemLight = new THREE.PointLight(0xff3a1a, 0, 6, 2);
    scene.add(this.gemLight);
  }

  get ready() {
    return this.state === 'ready' && this.cooldownLeft <= 0;
  }

  get cooldownFraction() {
    return clamp(this.cooldownLeft / EXPLOSION.cooldown, 0, 1);
  }

  get casting() {
    return this.state === 'charging';
  }

  /** Try to start casting. Returns false if unavailable. */
  tryCast() {
    const player = this.game.player;
    if (!this.ready || !player.canCast()) return false;
    if (this.game.currentLocation?.safe) {
      this.game.hud.toast('Только не здесь! Взрывы в поселениях запрещены. (И стража смотрит.)', 3);
      return false;
    }
    const cost = Math.min(EXPLOSION.mana, player.maxMana);
    if (player.mana < cost) {
      this.game.hud.toast(`Не хватает маны: нужно ${cost}. Отдохни или выпей эликсир (5).`, 3);
      return false;
    }
    player.mana -= cost;
    this._pickTarget();
    this.state = 'charging';
    this.t = 0;
    this.exploded = false;
    this.collapsed = false;
    this.cooldownLeft = EXPLOSION.cooldown;
    player.beginCast(this.target);
    this.game.audio?.play('charge');

    const vfx = this.game.vfx;
    // Feet circle.
    const feet = player.position.clone();
    const c1 = new MagicCircle({ radius: 1.7, color: [3.2, 0.55, 0.15], variant: 0, spin: 0.8, position: feet });
    const c2 = new MagicCircle({ radius: 1.15, color: [3.6, 1.4, 0.4], variant: 1, spin: -1.4, position: feet, groundOffset: 0.06 });
    this.circles.push(vfx.add(c1), vfx.add(c2));
    this.feetCircles = [c1, c2];
    return true;
  }

  _pickTarget() {
    const { camera, player, world } = this.game;
    const origin = camera.position;
    camera.getWorldDirection(_dir);
    const hit = world.raycast(origin, _dir, 80);
    let ok = false;
    if (hit) {
      const d = Math.hypot(hit.point.x - player.position.x, hit.point.z - player.position.z);
      if (d >= EXPLOSION.minRange && d <= EXPLOSION.maxRange) {
        this.target.copy(hit.point);
        ok = true;
      } else if (d > EXPLOSION.maxRange) {
        _v.set(hit.point.x - player.position.x, 0, hit.point.z - player.position.z).normalize();
        this.target.copy(player.position).addScaledVector(_v, EXPLOSION.maxRange);
        ok = true;
      }
    }
    if (!ok) {
      _v.set(_dir.x, 0, _dir.z);
      if (_v.lengthSq() < 1e-4) _v.set(Math.sin(player.controller.yaw), 0, Math.cos(player.controller.yaw));
      _v.normalize();
      this.target.copy(player.position).addScaledVector(_v, EXPLOSION.defaultRange);
    }
    this.target.y = world.groundAt(this.target.x, this.target.z, this.target.y + 30);
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'ready') {
      this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
      this._relaxWorld(dt);
      return;
    }
    this.t += dt;
    const t = this.t;
    const C = EXPLOSION.charge;
    const player = g.player;
    const vfx = g.vfx;

    if (this.state === 'charging') {
      const charge = clamp(t / C, 0, 1);
      player.castCharge = charge;

      // Feet circles follow the player (she may shuffle slightly while turning).
      for (const c of this.feetCircles) {
        c.object.position.copy(player.position);
        c.radius = (c === this.feetCircles[0] ? 1.7 : 1.15) * (1 + charge * 0.25);
      }

      // Target circle on the ground.
      if (t > 0.35 && !this.targetCircle) {
        this.targetCircle = vfx.add(new MagicCircle({ radius: 7.5, color: [3.4, 0.5, 0.14], variant: 0, spin: 0.35, position: this.target, groundOffset: 0.12 }));
        this.targetCircle2 = vfx.add(new MagicCircle({ radius: 5.2, color: [3.6, 1.25, 0.35], variant: 1, spin: -0.6, position: this.target, groundOffset: 0.16 }));
        this.circles.push(this.targetCircle, this.targetCircle2);
      }
      // Stacked sky circles (the iconic look).
      const skyTimes = [0.7, 1.0, 1.3, 1.55];
      for (let i = 0; i < skyTimes.length; i++) {
        if (t > skyTimes[i] && !this.skyCircles[i]) {
          const pos = this.target.clone();
          pos.y += 7 + i * 4.5;
          const c = vfx.add(new MagicCircle({
            radius: 6 - i * 1.15, color: i % 2 ? [3.6, 1.35, 0.36] : [3.2, 0.55, 0.14],
            variant: i % 2, spin: (i % 2 ? -1 : 1) * (0.4 + i * 0.2), position: pos, groundOffset: 0,
          }));
          this.skyCircles[i] = c;
          this.circles.push(c);
        }
      }

      // Particles.
      const feet = player.position;
      const swirlRate = 40 + charge * 120;
      this._emitRate('castSwirl', feet, swirlRate, dt, { intensity: 1 + charge });
      const gem = player.model.getGemWorldPosition(_v2);
      this._emitRate('castGather', gem, 30 + charge * 90, dt);
      this._emitRate('gemGlow', gem, 60, dt, { scale: 0.4 + charge * 0.8, alpha: 0.35 + charge * 0.45 });
      if (this.targetCircle) this._emitRate('circleEmber', this.target, 60 + charge * 100, dt, { radius: 6.5 });

      // Lights & world mood.
      this.gemLight.position.copy(gem);
      this.gemLight.intensity = 2 + charge * 14;
      player.model.gemMaterial.emissiveIntensity = 0.6 + charge * 8;
      player.model.uniforms.uMagicGlow.value.setRGB(0.75 * charge, 0.12 * charge, 0.04 * charge);
      this._darken(dt, 0.55 * smoothstep(0.2, 1, charge));
      g.cameraRig.addTrauma(dt * (0.05 + charge * charge * 0.6));

      if (t >= C) this._release();
      return;
    }

    // ---- released ----
    const rt = t - C;
    if (!this.exploded && rt >= 0.08) this._detonate();
    if (this.exploded) {
      const et = rt - 0.08;
      // Blast light curve.
      const L = et < 0.06 ? et / 0.06 : Math.exp(-(et - 0.06) * 2.2);
      this.blastLight.intensity = 1400 * L;
      this.blastLight.position.copy(this.target).add(_v.set(0, 5 + et * 2, 0));
      this.blastLight.color.setRGB(1, 0.55 + 0.25 * Math.exp(-et * 3), 0.25);
      // Eye adaptation: exposure dips with the flash so the fireball keeps its structure.
      g.renderer.toneMappingExposure = 1 / (1 + 0.9 * L);
      // Continuous fire / smoke feed for the first seconds.
      if (et < 1.4) {
        this._emitRate('fireCore', this.target, 70 * (1 - et / 1.4), dt, { scale: 1 });
        this._emitRate('smokeColumn', this.target, 26, dt);
      }
      if (et < 3) this._emitRate('bigEmber', this.target, 40 * (1 - et / 3), dt);
      // Shockwave reaching the player.
      if (this.shock && !this.shockHitPlayer) {
        const d = Math.hypot(player.position.x - this.target.x, player.position.z - this.target.z);
        if (this.shock.radius >= d) {
          this.shockHitPlayer = true;
          g.cameraRig.addTrauma(clamp(1.1 - d / 40, 0.3, 0.8));
          player.shockwaveHit(this.target, d);
        }
      }
      // Character lit by the blast (rim).
      const glow = L * clamp(1.4 - Math.hypot(player.position.x - this.target.x, player.position.z - this.target.z) / 40, 0.2, 1);
      player.model.uniforms.uMagicGlow.value.setRGB(1.4 * glow, 0.6 * glow, 0.18 * glow);
      this._darken(dt, 0.4 * Math.max(0, 1 - et / 2.5));
      if (!this.collapsed && et > 0.45) {
        this.collapsed = true;
        player.collapse(EXPLOSION.exhaustDuration);
      }
      this.gemLight.intensity = damp(this.gemLight.intensity, 0, 4, dt);
      player.model.gemMaterial.emissiveIntensity = damp(player.model.gemMaterial.emissiveIntensity, 0.6, 2, dt);
      if (et > 4.5) {
        this.blastLight.intensity = 0;
        g.renderer.toneMappingExposure = 1;
        player.model.uniforms.uMagicGlow.value.setRGB(0, 0, 0);
        this.state = 'ready';
        this.targetCircle = this.targetCircle2 = null;
        this.skyCircles = [];
        this.circles = [];
      }
    }
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
  }

  _release() {
    const g = this.game;
    this.state = 'released';
    g.player.release();
    for (const c of this.circles) c.kill(c === this.targetCircle || c === this.targetCircle2 ? 2.5 : 6);
    // Pillar of light + flash.
    g.vfx.add(new LightBeam(this.target, 70, 3.2, 0.6));
    g.hud.flash(0.55, 0.25);
    g.cameraRig.addTrauma(0.35);
    this.shockHitPlayer = false;
  }

  _detonate() {
    const g = this.game;
    const vfx = g.vfx;
    const T = this.target;
    this.exploded = true;
    g.audio?.play('explosion', { dist: g.player.position.distanceTo(T) * 0.5 });
    vfx.add(new CoreFlash(_v.copy(T).add(_v2.set(0, 1.5, 0)), 7));
    vfx.add(new Fireball(T.clone(), 7.5));
    this.shock = vfx.add(new Shockwave(T, 34, 1.2));
    vfx.add(new Shockwave(T, 18, 0.7, [2.2, 1.3, 0.55]));
    vfx.add(new DustWall(T, 26, 1.7));
    vfx.add(new Scorch(g.world, T, 9));
    vfx.add(new Debris(g.world, T, 34));
    vfx.burst('fire', T, 90, { scale: 1 });
    vfx.burst('sparks', T, 260, { scale: 1 });
    vfx.burst('smoke', T, 70, { scale: 1 });
    vfx.burst('energyRing', T, 90);
    vfx.burst('groundDust', T, 60);
    g.hud.flash(0.95, 0.7);
    // Camera shake scaled by distance.
    const d = g.camera.position.distanceTo(T);
    g.cameraRig.addTrauma(clamp(1.2 - d / 60, 0.45, 1));
    // World reactions.
    g.world.grass.triggerBlast(T.x, T.z);
    for (const dm of g.world.dummies) dm.blast(T, EXPLOSION.radius, 14);
    for (const e of g.enemies.list) e.blast(T, EXPLOSION.radius + 1, 420);
    g.player.explosionNearby(T);
    g.rpg?.events.emit('explosion', { pos: T.clone() });
  }

  /** Frame-rate independent emission: `rate` particles per second. */
  _emitRate(type, p, rate, dt, opts) {
    const acc = this._acc || (this._acc = {});
    let a = (acc[type] || 0) + rate * dt;
    while (a >= 1) {
      a -= 1;
      this.game.vfx.emit(type, p, opts);
    }
    acc[type] = a;
  }

  /** World mood: the day/night system applies `spellDim` to sun, sky and ambient light. */
  _darken(dt, amount) {
    const dn = this.game.dayNight;
    if (dn) dn.spellDim = damp(dn.spellDim, amount, 4, dt);
  }

  _relaxWorld(dt) {
    const dn = this.game.dayNight;
    if (dn && dn.spellDim > 0.001) this._darken(dt, 0);
    this.gemLight.intensity = damp(this.gemLight.intensity, 0, 4, dt);
  }

  /**
   * Create every effect once and render it through the real pipeline (HDR target +
   * shadow pass) so all shader variants are compiled before the first cast.
   * Runs behind the start overlay; the frame is never shown.
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
    // dispose() returns each material to its effect's pool, so the compiled programs stay
    // alive and the real cast reuses the very same materials.
    for (const e of list) {
      g.scene.remove(e.object);
      e.dispose();
    }
  }
}
