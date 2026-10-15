import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { rand } from '../core/math.js';
import { DUNGEON } from '../world/build/Dungeon.js';

/**
 * Owns all hostile NPCs: spawning per camp, sleeping far-away enemies, spatial
 * queries for combat, kill bookkeeping and loot (healing orbs).
 */
const ACTIVE_RADIUS = 85;
const _v = new THREE.Vector3();

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.kills = 0;
    this.orbs = [];
    this._near = [];
    const g = new THREE.IcosahedronGeometry(0.16, 2);
    this.orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 1.2) });
    this.orbGeo = g;
    this.coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 16).rotateX(Math.PI / 2);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.3, emissive: new THREE.Color(0.5, 0.32, 0.05) });
    this.itemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 3.0) });
  }

  spawn(type, pos, camp) {
    // Underground the ray must start below the cave ceiling.
    const from = DUNGEON.contains(pos.x, pos.z) ? DUNGEON.floor + 2 : (pos.y ?? 0) + 8;
    const y = this.game.world.groundAt(pos.x, pos.z, from) + 0.05;
    const p = new THREE.Vector3(pos.x, y, pos.z);
    const e = new Enemy(this.game, type, p, camp);
    this.list.push(e);
    this.game.scene.add(e.root);
    this.game.world.dynamicColliders.push(e.collider);
    return e;
  }

  /** Enemies (alive) within radius r of p (horizontal). Reuses an internal array. */
  near(p, r) {
    const out = this._near;
    out.length = 0;
    for (const e of this.list) {
      if (!e.alive && e.state === 'dead') continue;
      const dx = e.position.x - p.x, dz = e.position.z - p.z;
      if (dx * dx + dz * dz < r * r) out.push(e);
    }
    return out;
  }

  /** Living enemies within an arc in front of `from`. */
  inArc(from, yaw, range, halfAngle, maxDy = 2.2) {
    const res = [];
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const cosA = Math.cos(halfAngle);
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.position.x - from.x, dz = e.position.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.type.hitRadius) continue;
      if (Math.abs(e.position.y - from.y) > maxDy + e.type.height * 0.3) continue;
      const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (facing < cosA && d > e.type.hitRadius + 0.35) continue;
      res.push(e);
    }
    return res;
  }

  /** Nearest living enemy in front within range (for attack auto-aim). */
  aimTarget(from, yaw, range) {
    let best = null, bestScore = Infinity;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.position.x - from.x, dz = e.position.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (facing < 0.2) continue;
      const score = d * (1.6 - facing);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Nearest living enemy within r (any direction). */
  nearest(p, r) {
    let best = null, bd = r;
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Engaged boss closest to the player (for the boss HP bar). */
  activeBoss() {
    let best = null, bd = Infinity;
    const pp = this.game.player.position;
    for (const e of this.list) {
      if (!e.isBoss || !e.aggroed || (e.state === 'dead' && e.dissolve >= 1)) continue;
      const d = e.position.distanceTo(pp);
      if (d < 45 && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  onKilled(e) {
    this.kills++;
    const hud = this.game.hud;
    if (e.isBoss) {
      hud.toast(`${e.type.name} повержен!`, 4);
      this.game.player.heal(40);
    }
    const rpg = this.game.rpg;
    if (rpg) {
      rpg.state.kills[e.typeKey] = (rpg.state.kills[e.typeKey] || 0) + 1;
      rpg.events.emit('kill', { type: e.typeKey, camp: e.camp });
      rpg.gainXp(e.type.xp || 8);
    }
  }

  /** Remove an enemy for good (temporary event / ambush spawns). */
  remove(e) {
    this.releaseSlot(e);
    const i = this.list.indexOf(e);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.game.scene.remove(e.root);
    const dc = this.game.world.dynamicColliders;
    const k = dc.indexOf(e.collider);
    if (k >= 0) dc.splice(k, 1);
    e.telegraph?.cancel();
  }

  dropLoot(e) {
    const spawn = (geo, mat, loot) => {
      const m = new THREE.Mesh(geo, mat);
      e.chest(m.position);
      this.game.scene.add(m);
      this.orbs.push({ mesh: m, vel: new THREE.Vector3(rand(-2.5, 2.5), rand(3, 5.5), rand(-2.5, 2.5)), t: 0, ground: e.position.y, loot });
    };
    const n = e.isBoss ? 5 : Math.random() < 0.4 ? 1 : 0;
    for (let i = 0; i < n; i++) spawn(this.orbGeo, this.orbMat, null);
    for (const [id, count] of this.game.inventory.rollEnemyLoot(e.typeKey)) {
      if (id === 'eris') {
        // Split coins into a few pickups.
        const piles = Math.min(4, Math.max(1, Math.round(count / 5)));
        for (let i = 0; i < piles; i++) spawn(this.coinGeo, this.coinMat, { id, n: Math.round(count / piles) });
      } else spawn(this.orbGeo, this.itemMat, { id, n: count });
    }
  }

  /**
   * Attack slots (docs/combat/04 §5): at most two melee enemies wind up / strike at once (a heavy one counts as two,
   * bosses always may) and one ranged attacker; the others circle, flank or prepare their next try.
   */
  takeSlot(e) {
    this.attackers = this.attackers || new Set();
    if (e.isBoss || this.attackers.has(e)) return true;
    for (const o of this.attackers) if (!o.alive || !this.list.includes(o)) this.attackers.delete(o);
    let used = 0;
    for (const o of this.attackers) used += o.type.style === 'brute' ? 2 : 1;
    if (used + (e.type.style === 'brute' ? 2 : 1) > 2) return false;
    this.attackers.add(e);
    return true;
  }

  takeRangedSlot(e) {
    this.shooters = this.shooters || new Set();
    if (this.shooters.has(e)) return true;
    for (const o of this.shooters) if (!o.alive || !this.list.includes(o) || (o.state !== 'windup' && o.state !== 'strike' && o.state !== 'recover')) this.shooters.delete(o);
    if (this.shooters.size >= 1) return false;
    this.shooters.add(e);
    return true;
  }

  slotFree(e) {
    if (!this.attackers) return true;
    let used = 0;
    for (const o of this.attackers) if (o.alive) used += o.type.style === 'brute' ? 2 : 1;
    return used + (e.type.style === 'brute' ? 2 : 1) <= 2;
  }

  releaseSlot(e) {
    this.attackers?.delete(e);
    this.shooters?.delete(e);
  }

  resetAggro() {
    for (const e of this.list) e.reset();
    this.game.projectiles.clear();
  }

  update(dt) {
    const pp = this.game.player.position;
    // Iterate a copy: dead temporary enemies remove themselves.
    for (const e of this.list.slice()) {
      const d = e.position.distanceTo(pp);
      // Far enemies are not drawn at all (their meshes skip frustum culling).
      const far = d > 110;
      if (far !== e._far) {
        e._far = far;
        e.pivot.visible = !far;
      }
      if (d < ACTIVE_RADIUS || e.aggroed || e.state === 'dead' || e.state === 'airborne') e.update(dt);
    }
    // Healing orbs.
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      const m = o.mesh;
      _v.set(pp.x, pp.y + 0.9, pp.z).sub(m.position);
      const d = _v.length();
      if (o.t > 0.6 && d < 4) {
        o.vel.lerp(_v.normalize().multiplyScalar(9), 1 - Math.exp(-6 * dt));
      } else {
        o.vel.y -= 12 * dt;
        o.vel.x *= Math.exp(-2 * dt);
        o.vel.z *= Math.exp(-2 * dt);
      }
      m.position.addScaledVector(o.vel, dt);
      const gy = o.ground + 0.35 + Math.sin(o.t * 3) * 0.08;
      if (m.position.y < gy && !(o.t > 0.6 && d < 4)) {
        m.position.y = gy;
        o.vel.y = Math.max(0, o.vel.y);
      }
      if (o.loot) {
        m.rotation.y += dt * 4;
        if (Math.random() < dt * 8) this.game.vfx.emit('goldMote', m.position);
      } else if (Math.random() < dt * 20) this.game.vfx.emit('healMote', m.position);
      if (d < 0.7 && o.t > 0.3) {
        if (o.loot) {
          this.game.inventory.add(o.loot.id, o.loot.n);
          this.game.vfx.burst('gold', m.position, 8);
        } else {
          this.game.player.heal(14);
          this.game.player.restoreStamina(20);
          this.game.vfx.burst('heal', m.position, 14);
        }
        this.game.scene.remove(m);
        this.orbs.splice(i, 1);
      } else if (o.t > 30) {
        this.game.scene.remove(m);
        this.orbs.splice(i, 1);
      }
    }
  }
}
