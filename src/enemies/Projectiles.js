import * as THREE from 'three';

/**
 * Pooled hostile projectiles (thrown daggers / stones of the throwers). They fly a straight line fixed at the
 * throw — the trajectory is visible and a heroine who steps aside is missed; a projectile in flight never
 * re-aims at a newly controlled heroine after Tab (docs/combat/04 §5). They stop at walls and hit the first
 * heroine they touch (blocked for 60% by the guard, dodged by the i-frames).
 * Roxy's own water arrows are simulated by the combat core and drawn by combat/fx/WaterFX.js.
 */
const MAX = 24;
const _seg = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.items = [];
    const geo = new THREE.OctahedronGeometry(0.13, 0).scale(1, 1, 2.2);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x9a9aa4, metalness: 0.8, roughness: 0.35, emissive: new THREE.Color(0.9, 0.18, 0.05), emissiveIntensity: 0.55 });
    for (let i = 0; i < MAX; i++) {
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.visible = false;
      game.scene.add(mesh);
      this.items.push({ mesh, vel: new THREE.Vector3(), life: 0, active: false, damage: 0, owner: null, hit: new Set(), trail: 0 });
    }
  }

  /** A thrown projectile from `pos` along unit `dir` at `speed` m/s. */
  spawnEnemy(pos, dir, speed, damage, owner) {
    const it = this.items.find((i) => !i.active);
    if (!it) return;
    it.active = true;
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    it.vel.copy(dir).multiplyScalar(speed);
    it.mesh.lookAt(_p.copy(pos).add(dir));
    it.life = 2.2;
    it.damage = damage;
    it.owner = owner;
    it.hit.clear();
    this.game.audio?.play?.('swing');
  }

  clear() {
    for (const it of this.items) {
      it.active = false;
      it.mesh.visible = false;
    }
  }

  update(dt) {
    const g = this.game;
    for (const it of this.items) {
      if (!it.active) continue;
      it.life -= dt;
      const m = it.mesh;
      _seg.copy(it.vel).multiplyScalar(dt);
      const len = _seg.length();
      const hit = g.world.raycast(m.position, _p.copy(_seg).divideScalar(len), len);
      m.position.add(_seg);
      m.rotateZ(dt * 14);
      it.trail -= dt;
      if (it.trail <= 0) { it.trail = 0.03; g.vfx.emit('ember', m.position, { spread: 0.05, speed: 0.4 }); }
      let done = false;
      for (const h of g.combat.livingHeroes()) {
        if (it.hit.has(h.id)) continue;
        const dp = Math.hypot(m.position.x - h.pos.x, m.position.z - h.pos.z);
        if (dp < 0.55 && Math.abs(m.position.y - (h.pos.y + 1.0)) < 0.9) {
          it.hit.add(h.id);
          const res = g.combat.hitParty(h.id, { dmg: it.damage, kind: 'projectile', from: m.position, attacker: it.owner, knock: 3 });
          if (!res?.dodged) { done = true; break; } // a dodged projectile flies on
        }
      }
      if (done) this._end(it, false);
      else if (hit) { m.position.copy(hit.point); this._end(it, true); }
      else if (it.life <= 0) this._end(it, false);
    }
  }

  _end(it, wall) {
    if (wall) this.game.vfx.burst('sparks', it.mesh.position, 6, { scale: 0.2 });
    it.active = false;
    it.mesh.visible = false;
  }
}
