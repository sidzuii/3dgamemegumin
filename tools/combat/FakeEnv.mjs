// Minimal world for the combat core tests: flat ground, box walls, hostile dummies (no THREE).
import { PoiseState } from '../../src/combat/core/Damage.js';

export class FakeEnv {
  constructor() {
    this.targets = [];
    this.walls = []; // { x0, x1, z0, z1, h }
    this.cliffs = []; // { x0, x1, z0, z1 } ground wave cannot cross
    this.forbidden = null; // (heroId, spec, pos) => { ok, reason }
  }

  hostiles() {
    return this.targets;
  }

  addTarget(opts) {
    const t = makeTarget(this.targets.length + 1, opts);
    this.targets.push(t);
    return t;
  }

  _segHitsBox(a, b, w) {
    // Liang–Barsky in XZ.
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dz = b.z - a.z;
    const p = [-dx, dx, -dz, dz];
    const q = [a.x - w.x0, w.x1 - a.x, a.z - w.z0, w.z1 - a.z];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return Infinity; continue; }
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return Infinity; if (r > t0) t0 = r; }
      else { if (r < t0) return Infinity; if (r < t1) t1 = r; }
    }
    return t0;
  }

  los(a, b) {
    for (const w of this.walls) {
      if (Math.min(a.y, b.y) > (w.h ?? 3)) continue;
      if (this._segHitsBox(a, b, w) < Infinity) return false;
    }
    return true;
  }

  rayWall(o, d, maxLen) {
    let best = Infinity;
    const b = { x: o.x + d.x * maxLen, y: o.y + d.y * maxLen, z: o.z + d.z * maxLen };
    for (const w of this.walls) {
      if (o.y > (w.h ?? 3)) continue;
      const t = this._segHitsBox(o, b, w);
      if (t < Infinity) best = Math.min(best, t * maxLen);
    }
    return best;
  }

  groundAt() {
    return 0;
  }

  pickGround(o, d, maxLen) {
    if (d.y >= -1e-4) return null;
    const t = -o.y / d.y;
    if (t > maxLen) return null;
    return { x: o.x + d.x * t, y: 0, z: o.z + d.z * t };
  }

  groundLine(x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    let len = L, reason = '';
    const wall = this.rayWall({ x: x0, y: 0.5, z: z0 }, { x: (x1 - x0) / L, y: 0, z: (z1 - z0) / L }, L);
    if (wall < len) { len = wall; reason = 'wall'; }
    for (const c of this.cliffs) {
      const t = this._segHitsBox({ x: x0, z: z0 }, { x: x1, z: z1 }, c);
      if (t < Infinity && t * L < len) { len = t * L; reason = 'cliff'; }
    }
    return { len, reason };
  }

  allowed(heroId, spec, pos) {
    return this.forbidden ? this.forbidden(heroId, spec, pos) : { ok: true };
  }
}

export function makeTarget(id, { x = 0, z = 0, tier = 'light', hp = 240, defP = 0, defM = 0, r = 0.45, h = 1.5, elem } = {}) {
  const t = {
    id, alive: true, hp, maxHp: hp, pos: { x, y: 0, z }, r, h, defP, defM, tier, poise: new PoiseState(tier), wet: 0, elem,
    log: [],
    onHit(res) {
      t.log.push(res);
      if (t.hp <= 0) t.alive = false;
    },
  };
  return t;
}
