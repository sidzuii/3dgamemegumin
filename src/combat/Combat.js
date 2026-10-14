import * as THREE from 'three';
import { clamp, rand } from '../core/math.js';
import { Shockwave } from '../vfx/ExplosionEffects.js';

/**
 * Player melee combat (staff) + shared combat FX.
 *
 * LMB (cursor locked) or F: 3-hit combo. Each attack has a wind-up, an active hit frame
 * and a recovery; pressing again during the chain window queues the next hit.
 *   1 — staff thrust, 2 — backhand sweep, 3 — lunging slash with a small fire burst (AoE).
 * From standing the whole body plays the swing (legs step); while moving only the torso.
 * Feel: auto-aim to the nearest enemy in front, forward lunge, hit-stop, camera shake,
 * sparks, damage numbers and a glowing staff trail.
 */
export const ATTACKS = {
  1: { anim: 'Attack1', duration: 0.48, hitTime: 0.22, chainFrom: 0.2, range: 2.4, arc: 0.9, damage: 12, knock: 4, stamina: 4, lunge: 2.2, trauma: 0.14, stop: 0.05 },
  2: { anim: 'Attack2', duration: 0.46, hitTime: 0.21, chainFrom: 0.2, range: 2.3, arc: 1.5, damage: 14, knock: 4.5, stamina: 4, lunge: 1.8, trauma: 0.16, stop: 0.055 },
  3: { anim: 'Attack3', duration: 0.7, hitTime: 0.38, chainFrom: 9, range: 2.6, arc: 1.3, damage: 26, knock: 8, stamina: 8, lunge: 3.4, trauma: 0.32, stop: 0.09, heavy: true, aoe: 2.4 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.queued = false;
    this.cooldown = 0;
    this.trail = new StaffTrail(game.scene);
    this.telegraphs = [];
  }

  get attacking() {
    return !!this.current;
  }

  /** Facing the player should hold while attacking (auto-aim target or camera forward). */
  get faceYaw() {
    return this.current ? this.current.yaw : undefined;
  }

  /** An attack can be cancelled into a dodge once its hit has landed. */
  canCancel() {
    return !this.current || this.current.t >= this.current.spec.hitTime + 0.05;
  }

  request() {
    const p = this.game.player;
    if (p.action === 'dodge') {
      this.buffer = 0.3; // starts as soon as the roll ends
      return true;
    }
    if (!p.canAttack()) return false;
    if (!this.current) {
      if (this.cooldown > 0) return false;
      return this._start(1);
    }
    const c = this.current;
    if (c.index < 3 && c.t >= c.spec.chainFrom * 0.5) this.queued = true;
    return true;
  }

  cancel() {
    this.current = null;
    this.queued = false;
  }

  _start(index) {
    const g = this.game;
    const p = g.player;
    // Timing comes from the retargeted mocap clip (duration + fastest-hand frame).
    const base = ATTACKS[index];
    const info = p.anim.info?.[base.anim];
    const a = info
      ? { ...base, duration: info.duration * 0.92, hitTime: info.hitTime, chainFrom: Math.min(info.hitTime + 0.06, info.duration * 0.8) }
      : base;
    if (p.stamina < a.stamina * 0.5) {
      g.hud.denyStamina();
      this.cancel();
      return false;
    }
    p.stamina = Math.max(0, p.stamina - a.stamina);
    p.staminaDelay = 0.8;
    // Auto-aim: nearest enemy roughly in front of the camera / character.
    g.cameraRig.getForward(_v);
    let yaw = Math.atan2(_v.x, _v.z);
    const target = g.enemies.aimTarget(p.position, yaw, 4.5) || g.enemies.aimTarget(p.position, p.controller.yaw, 3.2) || g.enemies.nearest(p.position, 2.6);
    if (target) yaw = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    // After a perfect dodge the next swing is a counter; from a sprint it hits harder.
    const counter = this.counterReady > 0;
    const sprint = p.controller.horizontalSpeed > 4.2;
    if (counter || sprint) a.damage = Math.round(a.damage * (counter ? 1.6 : 1.25));
    if (counter) { a.heavy = true; a.knock *= 1.4; this.counterReady = 0; g.worldUI?.text?.(p.position, 'Контратака!'); }
    if (sprint) a.lunge *= 1.6;
    g.audio?.play('swing');
    this.current = { index, t: 0, yaw, hit: false, target, spec: a };
    this.queued = false;
    // Standing still: the whole body swings (the clip's own step carries her forward).
    const fullBody = !p.moveInput && p.controller.grounded;
    p.anim.playAction(a.anim, fullBody);
    const dist = target ? Math.hypot(target.position.x - p.position.x, target.position.z - p.position.z) : 9;
    const lunge = target ? clamp((dist - 1.2) * 2.4, 0, a.lunge * 1.3) : a.lunge;
    p.controller.addImpulse(_v.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(lunge));
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.counterReady = Math.max(0, (this.counterReady || 0) - dt);
    if (this.buffer > 0) {
      this.buffer -= dt;
      if (!this.current && this.game.player.canAttack()) {
        this.buffer = 0;
        this.request();
      }
    }
    const c = this.current;
    const g = this.game;
    const p = g.player;
    if (c) {
      if (!p.canAttack(true)) {
        this.cancel();
      } else {
        const a = c.spec;
        c.t += dt;
        // Trail during the swing.
        const swinging = c.t > a.hitTime * 0.55 && c.t < a.hitTime + 0.12;
        if (swinging) {
          p.model.getStaffTipWorldPosition(_v);
          p.model.getGemWorldPosition(_v2);
          _v3.copy(_v2).lerp(p.model.staff.getWorldPosition(new THREE.Vector3()), 0.75);
          this.trail.push(_v, _v3, c.index === 3 ? 1.4 : 1);
        }
        if (!c.hit && c.t >= a.hitTime) {
          c.hit = true;
          this._resolve(c, a);
        }
        if (this.queued && c.t >= a.chainFrom && c.index < 3) {
          this._start(c.index + 1);
        } else if (c.t >= a.duration) {
          this.current = null;
          if (c.index === 3) this.cooldown = 0.3;
        }
      }
    }
    this.trail.update(dt);
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      if (!this.telegraphs[i].alive) this.telegraphs.splice(i, 1);
    }
  }

  _resolve(c, a) {
    const g = this.game;
    const p = g.player;
    const from = p.position;
    const hits = g.enemies.inArc(from, c.yaw, a.range, a.arc);
    let any = false;
    const fwd = _v.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    for (const e of hits) {
      const dmg = Math.round(a.damage * rand(0.9, 1.1) * (g.inventory?.passives().meleeMul ?? 1));
      const pt = e.chest(new THREE.Vector3()).addScaledVector(fwd, -e.type.radius * 0.6);
      e.takeHit(dmg, from, a.knock, !!a.heavy);
      g.worldUI.damage(pt, dmg, !!a.heavy);
      g.vfx.burst('hitSpark', pt, a.heavy ? 26 : 14);
      g.vfx.burst('sparks', pt, a.heavy ? 12 : 6, { scale: 0.22 });
      any = true;
    }
    // Training dummies react too.
    for (const d of g.world.dummies) {
      const dx = d.root.position.x - from.x, dz = d.root.position.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist < a.range + 0.3 && (dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-3) > 0.3) {
        d.blast(from, a.heavy ? 2.2 : 0.9, 8);
        g.vfx.burst('hitSpark', _v2.set(d.root.position.x, d.root.position.y + 1.1, d.root.position.z), 10);
        if (d.isDummy) g.rpg?.events.emit('custom', { name: 'dummy_hit' });
        any = true;
      }
    }
    if (a.aoe) {
      // Finisher: small fire burst where the staff lands.
      const c2 = _v2.copy(from).addScaledVector(fwd, 1.6);
      c2.y = g.world.groundAt(c2.x, c2.z, from.y + 2);
      g.vfx.burst('fire', c2, 14, { scale: 0.22 });
      g.vfx.burst('sparks', c2, 18, { scale: 0.35 });
      g.vfx.burst('energyRing', c2, 26, { scale: 0.25 });
      this.groundImpact(c2, a.aoe, 0xff8a3a);
      for (const e of g.enemies.near(c2, a.aoe)) {
        if (hits.includes(e) || !e.alive) continue;
        const dmg = Math.round(a.damage * 0.6);
        e.takeHit(dmg, c2, a.knock * 0.8, true);
        g.worldUI.damage(e.chest(new THREE.Vector3()), dmg, false);
        any = true;
      }
      g.cameraRig.addTrauma(0.12);
    }
    if (any) {
      g.hitStop(a.stop);
      g.cameraRig.addTrauma(a.trauma);
      g.audio?.play(a.heavy ? 'hitHeavy' : 'hit');
      // Fighting up close builds mana towards the next Explosion.
      if (hits.length) p.restoreMana(hits.length * (a.heavy ? 5 : 2.5));
    }
  }

  /** Red ground ring that fills up until an enemy's heavy attack lands. */
  telegraph(center, radius, duration) {
    const t = new Telegraph(this.game, center, radius, duration);
    this.telegraphs.push(t);
    return t;
  }

  /** Quick ground shockwave ring (enemy slams, finisher). */
  groundImpact(center, radius, color = 0xff6a3a) {
    const c = new THREE.Color(color);
    this.game.vfx.add(new Shockwave(center, radius * 1.3, 0.45, [c.r * 2.2, c.g * 2.2, c.b * 2.2]));
  }
}

// ---------------------------------------------------------------------------
class Telegraph {
  constructor(game, center, radius, duration) {
    this.game = game;
    this.alive = true;
    this.duration = duration;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uFill: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uFill, uAlpha; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          if (r > 1.0) discard;
          float ring = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float fill = step(r, uFill) * 0.35 + smoothstep(uFill - 0.05, uFill, r) * step(r, uFill) * 0.6;
          vec3 col = vec3(2.4, 0.25, 0.12) * (ring * 1.2 + fill);
          gl_FragColor = vec4(col * uAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.material);
    this.mesh.position.copy(center);
    this.mesh.position.y = game.world.groundAt(center.x, center.z, center.y + 2) + 0.06;
    this.mesh.scale.setScalar(radius);
    this.mesh.renderOrder = 8;
    game.scene.add(this.mesh);
  }
  update(n) {
    this.material.uniforms.uFill.value = clamp(n, 0, 1);
  }
  finish() {
    this._remove();
  }
  cancel() {
    this._remove();
  }
  _remove() {
    if (!this.alive) return;
    this.alive = false;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    // Material intentionally not disposed: keeps its compiled program cached for the next telegraph.
  }
}

// ---------------------------------------------------------------------------
/** Additive ribbon following the staff during swings. */
class StaffTrail {
  constructor(scene) {
    this.max = 18;
    this.samples = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(4.0, 1.6, 0.5) * vA, 1.0); }',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
  }
  push(tip, base, strength) {
    this.samples.unshift({ tip: tip.clone(), base: base.clone(), age: 0, s: strength });
    if (this.samples.length > this.max) this.samples.pop();
  }
  update(dt) {
    const life = 0.16;
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[this.samples.length - 1].age > life) this.samples.pop();
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const a = Math.max(0, 1 - s.age / life) * (1 - i / this.max) * 0.5 * s.s;
      this.pos.set([s.tip.x, s.tip.y, s.tip.z, s.base.x, s.base.y, s.base.z], i * 6);
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = a * 0.15;
    }
    this.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

