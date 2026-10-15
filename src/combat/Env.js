import * as THREE from 'three';
import { lockedReason } from './unlocks.js';

/**
 * The combat core's window to the game world (see the env contract in core/Sim.js): hostile targets, line of
 * sight, walls, ground height, camera-ray picking, the reach of a ground wave and the story / zone rules for
 * explosive spells. All points the core passes are plain `{ x, y, z }`.
 */
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const SAFE_TEXT = 'Здесь нельзя применять взрыв';
const SLOPE_STEP = Math.tan((35 * Math.PI) / 180) * 0.5; // largest allowed rise per 0.5 m of a ground wave
const MAX_STEP = 0.6;

/** A training dummy as a target: it never dies, wobbles or flies off. */
class DummyTarget {
  constructor(dummy, n) {
    this.d = dummy;
    this.id = 'dummy' + n;
    this.hp = 1e6;
    this.maxHp = 1e6;
    this.r = 0.45;
    this.h = 1.9;
    this.defP = 0;
    this.defM = 0;
    this.tier = 'heavy';
    this.poise = null;
    this.wet = 0;
    this.isDummy = true;
  }
  get alive() {
    return this.d.state === 'idle';
  }
  get pos() {
    return this.d.root.position;
  }
  onHit(res) {
    this.hp = this.maxHp;
    const hit = res.hit;
    const big = hit.push?.blast || res.dmg >= 120;
    const fx = hit.from?.x ?? this.pos.x, fz = hit.from?.z ?? this.pos.z + 1;
    if (big && !hit.push?.blast) {
      // A strong hit knocks the dummy over: the blast centre sits just behind it, on the line from the attacker.
      const dx = this.pos.x - fx, dz = this.pos.z - fz, l = Math.hypot(dx, dz) || 1;
      this.d.blast({ x: this.pos.x - (dx / l) * 0.7, z: this.pos.z - (dz / l) * 0.7 }, 2.2, 14);
    } else this.d.blast({ x: fx, z: fz }, big ? 10 : 0.9, big ? 14 : 8);
    const ev = this.game?.rpg?.events;
    if (!hit.push?.blast) ev?.emit('custom', { name: 'dummy_hit' });
    // The lessons of Bran and Roxy count real hits of the right skill on the right dummies.
    if (hit.id === 'M_F' && this.d.tag === 'lane') ev?.emit('custom', { name: 'breach_lane' });
    if (hit.id === 'M_E') ev?.emit('custom', { name: 'sweep_dummy' });
    if (hit.id === 'R_Q') ev?.emit('custom', { name: 'whip_dummy' });
    if (hit.id === 'R_F') ev?.emit('custom', { name: 'tidal_dummy' });
  }
}

export class GameEnv {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.dummyTargets = new Map();
    this.n = 0;
  }

  /** Rebuild the list of live targets (called once per frame before the core steps). */
  refresh() {
    const g = this.game;
    const L = this.list;
    L.length = 0;
    const hp = g.player.position;
    for (const e of g.enemies.list) {
      if (!e.alive || e.state === 'dead' || e.root.visible === false) continue;
      if (Math.abs(e.position.x - hp.x) > 70 || Math.abs(e.position.z - hp.z) > 70) continue;
      L.push(e);
    }
    for (const d of g.world.dummies) {
      if (!d.isDummy) continue;
      let t = this.dummyTargets.get(d);
      if (!t) {
        t = new DummyTarget(d, ++this.n);
        t.game = g;
        this.dummyTargets.set(d, t);
      }
      if (t.alive) L.push(t);
    }
  }

  hostiles() {
    return this.list;
  }

  los(a, b) {
    _o.set(a.x, a.y, a.z);
    _d.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const dist = _d.length();
    if (dist < 0.05) return true;
    _d.divideScalar(dist);
    const hit = this.game.world.raycast(_o, _d, dist);
    return !hit || hit.distance > dist - 0.3;
  }

  rayWall(o, d, maxLen) {
    _o.set(o.x, o.y, o.z);
    _d.set(d.x, d.y, d.z);
    const hit = this.game.world.raycast(_o, _d, maxLen);
    return hit ? hit.distance : Infinity;
  }

  groundAt(x, z, y) {
    return this.game.world.groundAt(x, z, y);
  }

  /** Where the camera ray meets the world (walkable ground or a wall). */
  pickGround(o, d, maxLen) {
    _o.set(o.x, o.y, o.z);
    _d.set(d.x, d.y, d.z);
    const hit = this.game.world.raycast(_o, _d, maxLen);
    return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
  }

  /**
   * How far a ground wave may travel from (x0,z0) towards (x1,z1): it stops at walls, closed doors, cliffs,
   * a rise of more than 0.6 m between samples and slopes steeper than 35° (docs/combat/02 M-F).
   */
  groundLine(x0, z0, x1, z1, y = 0) {
    const w = this.game.world;
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-3) return { len: 0, reason: '' };
    const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    let prev = w.groundAt(x0, z0, y + 1.5);
    let len = L, reason = '';
    for (let s = 0.5; s <= L + 1e-6; s += 0.5) {
      const x = x0 + dx * s, z = z0 + dz * s;
      const gy = w.groundAt(x, z, prev + 1.5);
      const dh = gy - prev;
      if (dh > Math.max(MAX_STEP * 0.75, SLOPE_STEP * 1.25)) { len = s - 0.5; reason = 'step'; break; }
      if (dh < -MAX_STEP) { len = s - 0.5; reason = 'cliff'; break; }
      const wall = this.rayWall({ x: x - dx * 0.5, y: prev + 0.7, z: z - dz * 0.5 }, { x: dx, y: 0, z: dz }, 0.5);
      if (wall < 0.5) { len = s - 0.5 + wall; reason = 'wall'; break; }
      prev = gy;
    }
    return { len: Math.max(0, len), reason };
  }

  /** A skill the story has not opened yet (Megumin's Выпад / Отбив / Алый пролом): the reason, or ''. */
  locked(heroId, specId) {
    return lockedReason(this.game.rpg, heroId, specId);
  }

  /** Story / zone rules for a spell (explosive tags). */
  allowed(heroId, spec, pos) {
    if (!spec.tags?.includes('explosive')) return { ok: true };
    const g = this.game;
    const here = g.currentLocation;
    if (here?.safe) return { ok: false, reason: SAFE_TEXT, safe: true };
    if (pos) {
      const loc = g.world.locationAt(_o.set(pos.x, pos.y ?? 0, pos.z));
      if (loc?.safe) return { ok: false, reason: SAFE_TEXT, safe: true };
    }
    return g.rpg?.explosiveAllowed?.(heroId, spec, pos) ?? { ok: true };
  }
}
