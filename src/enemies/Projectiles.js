import * as THREE from 'three';
import { rand } from '../core/math.js';

/**
 * Pooled magic projectiles (Roxy's water bolts). Each bolt is a bright additive core
 * plus a particle trail; it collides with the world (ray segment) and the player.
 */
const MAX = 24;
const _seg = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.items = [];
    const geo = new THREE.SphereGeometry(0.16, 16, 12);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 4.0), toneMapped: true, fog: false });
    this.shellMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.25, 0.7, 1.6),
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < MAX; i++) {
      const core = new THREE.Mesh(geo, this.mat);
      const shell = new THREE.Mesh(geo, this.shellMat);
      shell.scale.setScalar(1.9);
      core.add(shell);
      core.visible = false;
      game.scene.add(core);
      this.items.push({ mesh: core, vel: new THREE.Vector3(), life: 0, active: false, damage: 0, homing: 0 });
    }
  }

  /** friendly = fired by the player (homes on enemies, hurts enemies). */
  spawn(pos, vel, damage, homing = 0.6, friendly = false) {
    const it = this.items.find((i) => !i.active);
    if (!it) return;
    it.active = true;
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    it.vel.copy(vel);
    it.life = 4;
    it.damage = damage;
    it.homing = homing;
    it.friendly = friendly;
    it.target = null;
    it.mesh.scale.setScalar(friendly ? 0.8 : 1);
  }

  clear() {
    for (const it of this.items) {
      it.active = false;
      it.mesh.visible = false;
    }
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    for (const it of this.items) {
      if (!it.active) continue;
      it.life -= dt;
      const m = it.mesh;
      if (it.friendly) {
        this._updateFriendly(it, dt);
        continue;
      }
      // Mild homing towards the player's chest.
      _p.set(player.position.x, player.position.y + 1.0, player.position.z).sub(m.position);
      const dist = _p.length();
      if (it.homing > 0 && dist > 1.5) {
        const speed = it.vel.length();
        it.vel.addScaledVector(_p.divideScalar(dist), speed * it.homing * dt).setLength(speed);
      }
      _seg.copy(it.vel).multiplyScalar(dt);
      const len = _seg.length();
      const hit = g.world.raycast(m.position, _seg.clone().divideScalar(len), len);
      m.position.add(_seg);
      m.rotation.y += dt * 8;
      if (Math.random() < dt * 90) g.vfx.emit('waterTrail', m.position);
      const dp = m.position.distanceTo(_p.set(player.position.x, player.position.y + 1.0, player.position.z));
      if (dp < 0.65 && !player.iframes) {
        player.takeHit(it.damage, m.position, 5);
        this._splash(it);
      } else if (dp < 0.65) {
        if (!player.dodgePerfect) player.takeHit(it.damage, m.position, 5); // counts the perfect dodge; the bolt flies on
      } else if (hit || it.life <= 0) {
        if (hit) m.position.copy(hit.point);
        this._splash(it);
      }
    }
  }

  _updateFriendly(it, dt) {
    const g = this.game;
    const m = it.mesh;
    // Acquire / keep a target: nearest living enemy roughly ahead.
    if (!it.target || !it.target.alive) {
      let best = null, bd = 30;
      _q.copy(it.vel).normalize();
      // Spread the volley: enemies already chased by other bolts count as farther away.
      for (const e of g.enemies.list) {
        if (!e.alive) continue;
        e.chest(_p).sub(m.position);
        let d = _p.length();
        if (_p.dot(_q) / d <= 0.3) continue;
        let taken = 0;
        for (const o of this.items) if (o !== it && o.active && o.target === e) taken++;
        d += taken * 6;
        if (d < bd) { bd = d; best = e; }
      }
      it.target = best;
    }
    if (it.target) {
      it.target.chest(_p).sub(m.position);
      const d = _p.length();
      const speed = it.vel.length();
      it.vel.addScaledVector(_p.divideScalar(d), speed * it.homing * 3 * dt).setLength(speed);
    }
    _seg.copy(it.vel).multiplyScalar(dt);
    const len = _seg.length();
    const hit = g.world.raycast(m.position, _seg.clone().divideScalar(len), len);
    m.position.add(_seg);
    if (Math.random() < dt * 90) g.vfx.emit('waterTrail', m.position);
    for (const e of g.enemies.near(m.position, 3)) {
      if (!e.alive) continue;
      if (e.chest(_p).distanceTo(m.position) < e.type.hitRadius + 0.35) {
        const dmg = Math.round(it.damage * (0.9 + Math.random() * 0.2));
        e.takeHit(dmg, m.position, 3);
        g.worldUI.damage(_p.clone(), dmg, false);
        this._splash(it);
        return;
      }
    }
    if (hit || it.life <= 0) {
      if (hit) m.position.copy(hit.point);
      this._splash(it);
    }
  }

  _splash(it) {
    const g = this.game;
    g.vfx.burst('waterSplash', it.mesh.position, 26);
    it.active = false;
    it.mesh.visible = false;
  }
}

export function spread(base, angle) {
  return base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle + rand(-0.03, 0.03));
}
