import * as THREE from 'three';
import { ParticlePool, SparkPool } from './ParticlePool.js';
import { makeSoftSprite, makeSmokeSprite } from '../world/textures.js';
import { rand } from '../core/math.js';

/**
 * VFX hub: owns the particle pools (additive glow, alpha smoke, spark streaks)
 * and a list of timed effect objects (magic circles, fireball, shockwave...).
 *
 *   vfx.emit(type, position)        – one particle of a preset
 *   vfx.burst(type, position, n)    – n particles
 *   vfx.add(effect)                 – effect with update(dt) -> bool (false = finished)
 */
const TAU = Math.PI * 2;

export class VFX {
  constructor(scene) {
    this.scene = scene;
    const soft = makeSoftSprite(64);
    const smoke = makeSmokeSprite(128);
    this.glow = new ParticlePool({ max: 4000, texture: soft, blending: THREE.AdditiveBlending, renderOrder: 11, name: 'glow' });
    this.smoke = new ParticlePool({ max: 900, texture: smoke, blending: THREE.NormalBlending, renderOrder: 10, name: 'smoke' });
    this.sparks = new SparkPool(700);
    scene.add(this.smoke.points, this.glow.points, this.sparks.mesh);
    this.effects = [];
    this._v = new THREE.Vector3();
    this.ambientCenter = new THREE.Vector3();
    this._ambientAcc = 0;
  }

  add(effect) {
    this.effects.push(effect);
    if (effect.object) this.scene.add(effect.object);
    return effect;
  }

  emit(type, p, opts) {
    const fn = PRESETS[type];
    if (fn) fn(this, p, opts || {});
  }

  burst(type, p, n, opts) {
    for (let i = 0; i < n; i++) this.emit(type, p, opts);
  }

  update(dt, camera, width, height) {
    // Ambient floating motes around the camera focus.
    this._ambientAcc += dt * 14;
    while (this._ambientAcc > 1) {
      this._ambientAcc -= 1;
      this.emit('ambient', this.ambientCenter);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (e.update(dt, camera) === false) {
        if (e.object) this.scene.remove(e.object);
        e.dispose?.();
        this.effects.splice(i, 1);
      }
    }
    this.glow.update(dt, camera, height);
    this.smoke.update(dt, camera, height);
    this.sparks.update(dt, width, height);
  }
}

// ---------------------------------------------------------------------------
// Presets: (vfx, position, opts) => spawn
// ---------------------------------------------------------------------------
const PRESETS = {
  // --- Explosion ---------------------------------------------------------
  fire(v, p, o) {
    // Billowing flame puffs: alpha-blended HDR (no additive pile-up => no white-out).
    const s = o.scale || 1;
    const a = Math.random() * TAU;
    const el = rand(0.05, 1.2);
    const sp = rand(6, 20) * s;
    v.smoke.spawn({
      x: p.x + rand(-1, 1) * s, y: p.y + rand(0, 1.5) * s, z: p.z + rand(-1, 1) * s,
      vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp * 0.8 + 3, vz: Math.sin(a) * Math.cos(el) * sp,
      life: rand(0.8, 1.6), size: rand(1.6, 3.0) * s, sizeEnd: rand(3.5, 5.5) * s,
      color: [3.4, 1.5, 0.45], colorEnd: [0.35, 0.08, 0.03], fadeIn: 0.05, alpha: 0.9,
      drag: 2.4, gravity: -2.5, spin: rand(-1, 1),
    });
  },
  fireCore(v, p, o) {
    const s = o.scale || 1;
    v.smoke.spawn({
      x: p.x + rand(-1.5, 1.5) * s, y: p.y + rand(0.5, 3) * s, z: p.z + rand(-1.5, 1.5) * s,
      vx: rand(-3, 3), vy: rand(4, 12), vz: rand(-3, 3),
      life: rand(1.0, 1.8), size: rand(3, 5) * s, sizeEnd: rand(5, 8) * s,
      color: [3.0, 1.25, 0.35], colorEnd: [0.3, 0.07, 0.03], fadeIn: 0.06, alpha: 0.85, drag: 1.5, gravity: -3, spin: rand(-0.6, 0.6),
    });
  },
  smoke(v, p, o) {
    const s = o.scale || 1;
    const a = Math.random() * TAU;
    const r = rand(0, 4) * s;
    const g = rand(0.18, 0.3);
    v.smoke.spawn({
      x: p.x + Math.cos(a) * r, y: p.y + rand(0.5, 3) * s, z: p.z + Math.sin(a) * r,
      vx: Math.cos(a) * rand(2, 9) * s, vy: rand(2, 7) * s, vz: Math.sin(a) * rand(2, 9) * s,
      life: rand(5, 8.5), size: rand(3, 5) * s, sizeEnd: rand(10, 16) * s,
      color: [0.9, 0.42, 0.18], colorEnd: [g, g * 0.95, g * 0.9], alpha: rand(0.6, 0.85), fadeIn: 0.1,
      drag: 1.6, gravity: -0.7, spin: rand(-0.3, 0.3),
    });
  },
  smokeColumn(v, p, o) {
    const s = o.scale || 1;
    const g = rand(0.16, 0.26);
    v.smoke.spawn({
      x: p.x + rand(-1.5, 1.5), y: p.y + rand(1, 4), z: p.z + rand(-1.5, 1.5),
      vx: rand(-1.5, 1.5), vy: rand(8, 14) * s, vz: rand(-1.5, 1.5),
      life: rand(5, 8), size: rand(3, 4.5) * s, sizeEnd: rand(11, 18) * s,
      color: [1.2, 0.5, 0.2], colorEnd: [g, g, g * 0.95], alpha: 0.8, fadeIn: 0.08,
      drag: 0.75, gravity: 0.25, spin: rand(-0.25, 0.25),
    });
  },
  ember(v, p, o) {
    const s = o.spread ?? 0.3;
    v.glow.spawn({
      x: p.x + rand(-s, s), y: p.y + rand(0, s), z: p.z + rand(-s, s),
      vx: rand(-0.6, 0.6) * (o.speed || 1), vy: rand(0.8, 2.5) * (o.speed || 1), vz: rand(-0.6, 0.6) * (o.speed || 1),
      life: rand(1.2, 3.5), size: rand(0.03, 0.07), sizeEnd: 0.01,
      color: [6, 2.4, 0.5], colorEnd: [3, 0.5, 0.05], fadeIn: 0.05, drag: 0.6, gravity: -0.4, flicker: 0.5,
    });
  },
  bigEmber(v, p) {
    const a = Math.random() * TAU;
    const sp = rand(4, 16);
    v.glow.spawn({
      x: p.x, y: p.y + rand(0.5, 3), z: p.z,
      vx: Math.cos(a) * sp, vy: rand(4, 16), vz: Math.sin(a) * sp,
      life: rand(2.5, 5), size: rand(0.08, 0.16), sizeEnd: 0.02,
      color: [10, 4, 0.8], colorEnd: [4, 0.6, 0.05], fadeIn: 0.02, drag: 0.9, gravity: 2.2, flicker: 0.6,
    });
  },
  energyRing(v, p, o) {
    // Flat ring of energy expanding at ground level.
    const a = Math.random() * TAU;
    const sp = rand(16, 26) * (o.scale || 1);
    v.glow.spawn({
      x: p.x + Math.cos(a), y: p.y + 0.3, z: p.z + Math.sin(a),
      vx: Math.cos(a) * sp, vy: rand(0, 1.5), vz: Math.sin(a) * sp,
      life: rand(0.6, 1.0), size: rand(0.5, 1.0), sizeEnd: 2.5,
      color: [3.5, 1.7, 0.6], colorEnd: [1.0, 0.15, 0.03], fadeIn: 0.02, drag: 2.2,
    });
  },
  sparks(v, p, o) {
    const a = Math.random() * TAU;
    const el = rand(0.15, 1.35);
    const sp = rand(10, 34) * (o.scale || 1);
    v.sparks.spawn({
      x: p.x, y: p.y + rand(0.5, 2), z: p.z,
      vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: Math.sin(a) * Math.cos(el) * sp,
      life: rand(0.8, 2.0), color: Math.random() < 0.3 ? [9, 7, 4] : [8, 3, 0.7], gravity: 14, drag: 0.9, stretch: 0.03,
    });
  },
  dust(v, p, o) {
    const a = Math.random() * TAU;
    const sp = rand(1, 3) * (o.speed || 1);
    const g = rand(0.55, 0.7);
    v.smoke.spawn({
      x: p.x + Math.cos(a) * 0.2, y: p.y + 0.05, z: p.z + Math.sin(a) * 0.2,
      vx: Math.cos(a) * sp, vy: rand(0.2, 0.9), vz: Math.sin(a) * sp,
      life: rand(0.6, 1.1), size: rand(0.25, 0.4) * (o.scale || 1), sizeEnd: rand(0.8, 1.3) * (o.scale || 1),
      color: [g, g * 0.9, g * 0.78], alpha: o.alpha ?? 0.5, fadeIn: 0.1, drag: 3.5, gravity: -0.1, spin: rand(-1, 1),
    });
  },
  groundDust(v, p, o) {
    // Big dust ring pushed by the shockwave.
    const a = Math.random() * TAU;
    const r = rand(2, 5);
    const sp = rand(12, 24);
    const g = rand(0.45, 0.6);
    v.smoke.spawn({
      x: p.x + Math.cos(a) * r, y: p.y + rand(0.2, 1.0), z: p.z + Math.sin(a) * r,
      vx: Math.cos(a) * sp, vy: rand(0.5, 3), vz: Math.sin(a) * sp,
      life: rand(1.8, 3.2), size: rand(1.5, 2.5) * (o.scale || 1), sizeEnd: rand(5, 8) * (o.scale || 1),
      color: [g, g * 0.88, g * 0.74], alpha: 0.6, fadeIn: 0.05, drag: 2.0, gravity: -0.3, spin: rand(-0.5, 0.5),
    });
  },

  // --- Casting -------------------------------------------------------------
  castSwirl(v, p, o) {
    // Motes spiralling up and inward around the caster.
    const a = Math.random() * TAU;
    const r = rand(1.1, 2.0);
    const hot = Math.random() < 0.3;
    v.glow.spawn({
      x: p.x + Math.cos(a) * r, y: p.y + rand(0, 0.4), z: p.z + Math.sin(a) * r,
      vy: rand(0.8, 2.4) * (o.intensity || 1),
      orbit: rand(2.2, 3.6), ox: p.x, oz: p.z, inward: rand(0.3, 0.8),
      life: rand(0.9, 1.6), size: rand(0.05, 0.12), sizeEnd: 0.02,
      color: hot ? [3.6, 1.6, 0.5] : [3.2, 0.45, 0.18], colorEnd: [1.6, 0.15, 0.03], fadeIn: 0.15, flicker: 0.3,
    });
  },
  castGather(v, p, o) {
    // Energy converging onto the staff gem.
    const a = Math.random() * TAU;
    const el = rand(-0.5, 1.2);
    const r = rand(1.2, 2.4);
    const sx = p.x + Math.cos(a) * Math.cos(el) * r;
    const sy = p.y + Math.sin(el) * r;
    const sz = p.z + Math.sin(a) * Math.cos(el) * r;
    const life = rand(0.35, 0.6);
    v.glow.spawn({
      x: sx, y: sy, z: sz, vx: (p.x - sx) / life, vy: (p.y - sy) / life, vz: (p.z - sz) / life,
      life, size: rand(0.04, 0.09), sizeEnd: 0.12,
      color: [3, 0.6, 0.25], colorEnd: [4.5, 2.2, 0.8], fadeIn: 0.3,
    });
  },
  gemGlow(v, p, o) {
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z, life: 0.05, size: 0.3 * (o.scale || 1), sizeEnd: 0.4 * (o.scale || 1),
      color: [3.2, 0.6, 0.22], colorEnd: [2.6, 0.45, 0.16], fadeIn: 0.3, alpha: o.alpha ?? 0.6,
    });
  },
  circleEmber(v, p, o) {
    // Embers rising from the target magic circle.
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * (o.radius || 5);
    v.glow.spawn({
      x: p.x + Math.cos(a) * r, y: p.y + 0.1, z: p.z + Math.sin(a) * r,
      vx: rand(-0.3, 0.3), vy: rand(1.5, 5), vz: rand(-0.3, 0.3),
      life: rand(0.8, 1.8), size: rand(0.06, 0.16), sizeEnd: 0.02,
      color: [7, 1.4, 0.4], colorEnd: [3, 0.3, 0.05], fadeIn: 0.1, flicker: 0.4,
    });
  },

  // --- Combat ----------------------------------------------------------------
  hitSpark(v, p) {
    const a = Math.random() * TAU;
    const el = rand(-0.6, 1.2);
    const sp = rand(2, 7);
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z,
      vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: Math.sin(a) * Math.cos(el) * sp,
      life: rand(0.15, 0.35), size: rand(0.08, 0.16), sizeEnd: 0.01,
      color: [5, 3, 1.4], colorEnd: [2.5, 0.6, 0.1], fadeIn: 0.02, drag: 5, gravity: 6,
    });
  },
  waterTrail(v, p) {
    v.glow.spawn({
      x: p.x + rand(-0.06, 0.06), y: p.y + rand(-0.06, 0.06), z: p.z + rand(-0.06, 0.06),
      vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.4), vz: rand(-0.3, 0.3),
      life: rand(0.3, 0.6), size: rand(0.12, 0.22), sizeEnd: 0.02,
      color: [0.6, 1.8, 3.2], colorEnd: [0.2, 0.6, 1.4], fadeIn: 0.05, drag: 2,
    });
  },
  waterSplash(v, p) {
    const a = Math.random() * TAU;
    const el = rand(0.1, 1.3);
    const sp = rand(1.5, 5.5);
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z,
      vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: Math.sin(a) * Math.cos(el) * sp,
      life: rand(0.4, 0.8), size: rand(0.06, 0.14), sizeEnd: 0.02,
      color: [0.7, 1.9, 3.0], colorEnd: [0.3, 0.8, 1.6], fadeIn: 0.03, drag: 1.5, gravity: 9,
    });
  },
  splash(v, p) {
    // Wading splash (feet in shallow water).
    const a = Math.random() * TAU;
    const sp = rand(0.6, 1.8);
    v.smoke.spawn({
      x: p.x, y: p.y, z: p.z,
      vx: Math.cos(a) * sp, vy: rand(1.2, 2.6), vz: Math.sin(a) * sp,
      life: rand(0.35, 0.6), size: rand(0.08, 0.14), sizeEnd: rand(0.22, 0.32),
      color: [0.85, 0.95, 1.05], alpha: 0.6, fadeIn: 0.05, drag: 1, gravity: 9,
    });
  },
  lavaBubble(v, p, o) {
    const r = o.radius || 4;
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
    v.glow.spawn({
      x: p.x + Math.cos(a) * d, y: p.y + 0.05, z: p.z + Math.sin(a) * d,
      vx: rand(-0.2, 0.2), vy: rand(0.8, 2.2), vz: rand(-0.2, 0.2),
      life: rand(0.6, 1.4), size: rand(0.08, 0.2), sizeEnd: 0.02,
      color: [5, 1.6, 0.3], colorEnd: [2, 0.3, 0.05], fadeIn: 0.1, gravity: 1.2, flicker: 0.4,
    });
  },

  // --- Interactables & movement -------------------------------------------
  gold(v, p) {
    const a = Math.random() * TAU;
    const sp = rand(1, 3.5);
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rand(2, 5), vz: Math.sin(a) * sp,
      life: rand(0.8, 1.6), size: rand(0.05, 0.12), sizeEnd: 0.01,
      color: [6, 4.4, 1.4], colorEnd: [3, 1.6, 0.3], gravity: 5, drag: 1.2, flicker: 0.4,
    });
  },
  goldMote(v, p) {
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z, vx: rand(-0.1, 0.1), vy: rand(0.3, 0.8), vz: rand(-0.1, 0.1),
      life: rand(1, 2), size: rand(0.03, 0.06), sizeEnd: 0.01, color: [5, 3.6, 1.2], flicker: 0.5,
    });
  },
  heal(v, p) {
    const a = Math.random() * TAU;
    const sp = rand(0.5, 2.5);
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rand(0.5, 3), vz: Math.sin(a) * sp,
      life: rand(0.8, 1.5), size: rand(0.06, 0.14), sizeEnd: 0.02,
      color: [1.2, 5, 3.6], colorEnd: [0.4, 2, 1.6], drag: 1.5, flicker: 0.3,
    });
  },
  healRing(v, p) {
    const a = Math.random() * TAU;
    v.glow.spawn({
      x: p.x + Math.cos(a) * 0.7, y: p.y + rand(0, 0.3), z: p.z + Math.sin(a) * 0.7,
      vy: rand(1.5, 3.5), orbit: 2.5, ox: p.x, oz: p.z,
      life: rand(0.8, 1.4), size: rand(0.06, 0.12), sizeEnd: 0.02, color: [1.5, 6, 4], colorEnd: [0.6, 2.4, 2],
    });
  },
  healMote(v, p) {
    v.glow.spawn({
      x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), z: p.z + rand(-0.3, 0.3),
      vy: rand(0.2, 0.6), life: rand(1, 2), size: rand(0.03, 0.06), sizeEnd: 0.01, color: [1, 4, 3.2], flicker: 0.4,
    });
  },
  brazierFire(v, p) {
    v.glow.spawn({
      x: p.x + rand(-0.25, 0.25), y: p.y, z: p.z + rand(-0.25, 0.25),
      vx: rand(-0.2, 0.2), vy: rand(1.2, 2.4), vz: rand(-0.2, 0.2),
      life: rand(0.45, 0.8), size: rand(0.35, 0.55), sizeEnd: 0.08,
      color: [6, 2.6, 0.7], colorEnd: [2.4, 0.35, 0.05], fadeIn: 0.15, spin: rand(-2, 2), drag: 0.5,
    });
  },
  brazierSmoke(v, p) {
    v.smoke.spawn({
      x: p.x + rand(-0.15, 0.15), y: p.y + 0.8, z: p.z + rand(-0.15, 0.15),
      vx: rand(-0.15, 0.15), vy: rand(0.6, 1.1), vz: rand(-0.15, 0.15),
      life: rand(2, 3.2), size: 0.35, sizeEnd: rand(1.4, 2),
      color: [0.3, 0.28, 0.27], alpha: 0.28, fadeIn: 0.2, spin: rand(-0.4, 0.4),
    });
  },
  fireBurst(v, p) {
    const a = Math.random() * TAU;
    const sp = rand(0.5, 2);
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rand(1.5, 4), vz: Math.sin(a) * sp,
      life: rand(0.4, 0.8), size: rand(0.3, 0.6), sizeEnd: 0.05, color: [8, 3.5, 1], colorEnd: [2, 0.3, 0.05], drag: 1.5,
    });
  },
  smokePuff(v, p) {
    v.smoke.spawn({
      x: p.x + rand(-0.2, 0.2), y: p.y + rand(0, 0.3), z: p.z + rand(-0.2, 0.2),
      vx: rand(-0.4, 0.4), vy: rand(0.6, 1.4), vz: rand(-0.4, 0.4),
      life: rand(1.2, 2), size: 0.4, sizeEnd: 1.4, color: [0.42, 0.4, 0.38], alpha: 0.5, fadeIn: 0.1,
    });
  },
  magicPop(v, p) {
    const a = Math.random() * TAU;
    const el = rand(-1, 1);
    const sp = rand(1, 3);
    v.glow.spawn({
      x: p.x, y: p.y, z: p.z,
      vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: Math.sin(a) * Math.cos(el) * sp,
      life: rand(0.4, 0.8), size: rand(0.06, 0.12), sizeEnd: 0.01, color: [3, 1.6, 6], colorEnd: [1, 0.6, 3], drag: 2,
    });
  },
  ambient(v, center) {
    // Floating pollen / tiny motes drifting in the air around the player.
    const a = Math.random() * TAU;
    const r = rand(1.5, 14);
    v.glow.spawn({
      x: center.x + Math.cos(a) * r, y: center.y + rand(-0.5, 4), z: center.z + Math.sin(a) * r,
      vx: rand(-0.15, 0.15) + 0.12, vy: rand(-0.05, 0.12), vz: rand(-0.15, 0.15),
      life: rand(4, 7), size: rand(0.018, 0.035), sizeEnd: 0.012,
      color: [1.6, 1.5, 1.1], alpha: 0.75, fadeIn: 0.3, flicker: 0.35,
    });
  },
};
