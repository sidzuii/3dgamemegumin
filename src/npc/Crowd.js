import * as THREE from 'three';
import { cityPlan, CLASS, insideCity, polyDist } from '../world/AinstreyCityPlan.js';
import * as AIN from '../world/AinstreyPlan.js';

/**
 * The crowd of the capital: people walking the pavements of every street round the player and standing in groups on the squares
 * (not the story's townsfolk: no names, no talk, no schedule). A pool of bodies is recycled round the player: a walker that falls
 * behind (or reaches the end of its street) reappears ahead, off the camera's view when it can.
 *
 * Cheap on purpose: the bodies are the merged one-draw-call Quaternius people (npc/People.js), and they all borrow a few shared
 * skeletons ("drivers": a walk cycle at three phases, two idles, two talks per people pack) that are animated once a frame. Every
 * body is a SkinnedMesh in the detached bind mode on one of those skeletons, so its own transform places it in the world. The
 * count follows the quality preset and the hour (thin at night). Lanes keep off the boulevard trees, the lamps and the goods at
 * the shop fronts (world/build/AinstreyStreets.js puts the street furniture outside these lanes).
 */
const BASE = { m: ['Casual2_Head', 'Casual2_Body', 'Casual2_Legs', 'Casual2_Feet'], w: ['Formad_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'] };
const SCALE = { m: 0.94, w: 0.93 };
/** Outfits that are known to fit together (the same sets as the named townsfolk of data/npcs.js). */
const OUTFITS = {
  m: [
    ['Casual2_Head', 'Casual_Body', 'Worker_Legs', 'Worker_Feet'],
    ['Casual_Head', 'Adventurer_Body', 'Worker_Legs', 'Worker_Feet'],
    ['Farmer_Head', 'Farmer_Body', 'Farmer_Pants', 'Farmer_Feet'],
    ['Casual2_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet'],
    ['Suit_Head', 'King_Body', 'Worker_Legs', 'Worker_Feet'],
    ['Suit_Head', 'King_Body', 'Casual2_Legs', 'Adventurer_Feet'],
    ['Casual_Head', 'Casual2_Body', 'Worker_Legs', 'Adventurer_Feet'],
    ['King_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet'],
    ['Adventurer_Head', 'Adventurer_Body', 'Worker_Legs', 'Farmer_Feet'],
    ['Casual2_Head', 'Adventurer_Body', 'Worker_Legs', 'Worker_Feet', 'Backpack'],
  ],
  w: [
    ['Casual_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'],
    ['Formad_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'],
    ['Medieval_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'],
    ['Soldier_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'],
    ['Soldier_Head', 'Adventurer_Body', 'Medieval_Legs', 'Adventurer_Feet'],
    ['Casual_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'],
    ['Suit_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'],
  ],
};
const CLOTH = [0x7a5a3a, 0x5a6a7a, 0x8a4a3a, 0x4a6a4a, 0x6a5a7a, 0x9a7a4a, 0x3a4a6a, 0x7a3a3a, 0xa08a6a, 0x5a4a3a, 0x2f5a6a, 0x8a6a5a, 0x6a2a3a, 0x4a5a3a];
const HAIR = [0x1a1418, 0x3a2418, 0x6a3a1a, 0x4a3a2a, 0xb08a48, 0x8a8a90, 0x2a2a2a, 0xc89048, 0x5a2a1a];
const SKIN = [[0xf0d0b8, 0xd8b098], [0xe0b896, 0xc89878], [0xc89070, 0xa87050], [0xa87050, 0x8a5a40]];
const LEGS = [0x3a3a2a, 0x4a3a2a, 0x3a3a44, 0x2a2420, 0x5a4a3a];
const VARIANTS = { m: 12, w: 10 };
/** Pavement lanes (offsets from the street's centre line, both sides) per street class; see the header. */
const LANES = {
  axis: [CLASS.axis.width / 2 + 0.55, CLASS.axis.width / 2 + 1.2, CLASS.axis.width / 2 - 4.3],
  avenue: [CLASS.avenue.width / 2 + 0.45, CLASS.avenue.width / 2 + 1.0, CLASS.avenue.width / 2 - 4.0],
  street: [CLASS.street.width / 2 - 0.2, CLASS.street.width / 2 + 0.4],
  lane: [0.9, 1.5],
  quay: [CLASS.quay.width / 2 + 0.3, CLASS.quay.width / 2 - 2.4],
  path: [1.2],
};
/** Paving heights (world/build/AinstreyCity.js LIFT; the pavements beyond the carriageway are 5 cm higher). */
const LIFT = { axis: 0.1, avenue: 0.094, street: 0.088, lane: 0.082, quay: 0.09, path: 0.06 };
/** Walkers / standing groups per preset (the far ones are dropped first). */
const COUNT = { low: [18, 5], medium: [32, 9], high: [50, 13] };
const R_WALK = 72, R_STAND = 64;
/** Streets with raised pavements (a kerb wider than 0.8 m: AinstreyCity.streets). */
const paved = (st) => st.cls !== 'lane' && st.cls !== 'path' && CLASS[st.cls].kerb > 0.8;
const _box = new THREE.Box3();
const _id = new THREE.Matrix4();
const _f = new THREE.Vector3();
const _sph = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.25);
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export class Crowd {
  constructor(game, mgr) {
    this.game = game;
    this.people = game.people;
    this.mgr = mgr;
    this.enabled = !game.editorMode && !!mgr.clips?.m?.walk;
    this.walkers = [];
    this.groups = [];
    this.free = { m: [], w: [] };
    this.variants = { m: [], w: [] };
    this.active = false;
    this._rng = mulberry(7071);
    this._t = 0;
    if (!this.enabled) return;
    this.root = new THREE.Group();
    this.root.name = 'Crowd';
    game.scene.add(this.root);
    this._drivers();
    this._streets();
  }

  /** The shared skeletons: per pack walk ×3 (phases), idle, idle2, talk, talk2. */
  _drivers() {
    this.drivers = {};
    for (const pack of ['m', 'w']) {
      const set = (this.drivers[pack] = {});
      const add = (name, clipKey, phase) => {
        const tpl = this.people.create({ pack, parts: BASE[pack], scale: 1 });
        tpl.root.scale.setScalar(1);
        tpl.root.updateMatrixWorld(true);
        const mixer = new THREE.AnimationMixer(tpl.root);
        const clip = this.mgr.clips[pack][clipKey];
        const a = mixer.clipAction(clip);
        a.play();
        mixer.update(phase * clip.duration);
        tpl.root.updateMatrixWorld(true);
        (set[name] ||= []).push({ root: tpl.root, mixer, skeleton: tpl.mesh.skeleton });
      };
      for (const ph of [0, 0.33, 0.66]) add('walk', 'walk', ph);
      add('idle', 'idle', 0); add('idle', 'idle2', 0.4);
      add('talk', 'talk', 0); add('talk', 'talk2', 0.5);
    }
  }

  /** Street centre lines in world space with their lengths, and samples every 6 m in a 40 m grid (spawn places). */
  _streets() {
    const P = cityPlan();
    this.streets = [];
    this.cells = new Map();
    for (const S of P.streets) {
      if (S.cls === 'stair') continue;
      const cls = S.kind === 'path' ? 'path' : S.cls;
      const lanes = LANES[cls];
      if (!lanes) continue;
      const pts = S.pts.map(([u, v]) => AIN.toWorld(u, v));
      const acc = [0];
      for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const len = acc[acc.length - 1];
      if (len < 20) continue;
      const lanesOk = cls === 'path' ? [Math.max(0.6, S.width / 2 - 1)] : lanes;
      const st = { pts, acc, len, cls, lanes: lanesOk, lift: LIFT[cls] ?? 0.1, half: S.width / 2, id: S.id };
      const si = this.streets.push(st) - 1;
      for (let s = 3; s < len - 3; s += 6) {
        const [x, z] = this._at(st, s);
        const key = Math.floor(x / 40) + ',' + Math.floor(z / 40);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(si, s);
      }
    }
    this._plan = P;
  }

  /** Point and unit tangent at distance s along a street. */
  _at(st, s, out = [0, 0, 0, 0]) {
    const { pts, acc } = st;
    s = Math.max(0, Math.min(st.len, s));
    let lo = 1, hi = acc.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (acc[m] < s) lo = m + 1; else hi = m; }
    const k = lo, f = (s - acc[k - 1]) / (acc[k] - acc[k - 1] || 1);
    const tx = pts[k][0] - pts[k - 1][0], tz = pts[k][1] - pts[k - 1][1], L = Math.hypot(tx, tz) || 1;
    out[0] = pts[k - 1][0] + tx * f; out[1] = pts[k - 1][1] + tz * f; out[2] = tx / L; out[3] = tz / L;
    return out;
  }

  /** Bodies of every look (merged geometries are cached by People): a few a frame in the background. */
  async prepare(nap) {
    if (!this.enabled) return;
    for (const pack of ['m', 'w']) while (this.variants[pack].length < VARIANTS[pack]) { this._variant(pack); await nap(); }
    this._groupSpots(); // the places of the standing groups (collision queries): before the first visit, not on it
  }

  _variant(pack) {
    const i = this.variants[pack].length, r = mulberry(1000 + i * 17 + (pack === 'w' ? 500 : 0));
    const pick = (a) => a[Math.floor(r() * a.length)];
    const parts = OUTFITS[pack][i % OUTFITS[pack].length];
    const main = pick(CLOTH), sec = new THREE.Color(main).multiplyScalar(0.72 + r() * 0.2).getHex(), hair = pick(HAIR), [skin, skinD] = pick(SKIN), legs = pick(LEGS);
    const colors = {
      Hair: hair, Hair_Brown: hair, Hair_Blond: hair, Skin: skin, Skin_Darker: skinD,
      Green: main, LightGreen: sec, Blue: main, LightBrown: main, Beige: sec, LightBlue: sec, LimeGreen: main, DarkBrown: sec,
      'Adventurer_Legs:Brown': legs, 'Adventurer_Legs:Brown2': legs, 'Worker_Legs:Brown': legs, 'Worker_Legs:Brown2': legs,
    };
    const geo = this.people.geometry({ pack, parts, colors });
    this.variants[pack].push(geo);
    return geo;
  }

  /** A body from the pool (or a new one) on a driver skeleton. */
  _body(pack, driver) {
    let mesh = this.free[pack].pop();
    if (!mesh) {
      const V = this.variants[pack];
      const geo = V.length < VARIANTS[pack] ? this._variant(pack) : V[Math.floor(this._rng() * V.length)];
      mesh = new THREE.SkinnedMesh(geo, this.people.material);
      mesh.bindMode = THREE.DetachedBindMode;
      mesh.bind(driver.skeleton, _id);
      mesh.boundingSphere = _sph.clone();
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = true;
      mesh.userData.pack = pack;
      mesh.scale.setScalar(SCALE[pack] * (0.95 + this._rng() * 0.09));
      this.root.add(mesh);
    }
    mesh.skeleton = driver.skeleton;
    mesh.visible = true;
    return mesh;
  }

  _release(mesh) {
    mesh.visible = false;
    this.free[mesh.userData.pack].push(mesh);
  }

  /** Is there room for a person here (no wall, tree pit, lamp, stall: the static collision)? */
  _clear(x, y, z, r = 0.35) {
    const bvh = this.game.world.collider?.geometry?.boundsTree;
    if (!bvh) return true;
    _box.min.set(x - r, y + 0.35, z - r);
    _box.max.set(x + r, y + 1.7, z + r);
    return !bvh.intersectsBox(_box, _id);
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled) return;
    const g = this.game, pp = g.player.position;
    const [u, v] = AIN.toLocal(pp.x, pp.z);
    const inCity = !g.inDungeon && insideCity(u, v, -30);
    if (!inCity) { if (this.active) this._clearAll(); return; }
    if (!this.active) { this.active = true; this._jump = true; }
    // a teleport (fast travel, a load): everyone is placed anew round the new position
    if (this._last && Math.hypot(pp.x - this._last.x, pp.z - this._last.z) > 40) this._jump = true;
    this._last = pp.clone();
    const h = g.rpg.clock.hour;
    const dayF = h >= 7 && h < 20 ? 1 : h >= 20 && h < 22 ? 0.45 : h >= 5.5 && h < 7 ? 0.4 : 0.12;
    const [nW, nG] = COUNT[g.quality?.name] || COUNT.medium;
    // a fight (or a spell going off) clears the street: the people keep away until it is over
    const calm = g.player.inCombat ? 0 : 1;
    const wantW = Math.round(nW * dayF * calm), wantG = Math.round(nG * (dayF > 0.3 ? dayF : 0) * calm);
    // drivers: once a frame
    for (const pack of ['m', 'w']) for (const list of Object.values(this.drivers[pack])) for (const d of list) { d.mixer.update(dt); d.root.updateMatrixWorld(true); }
    this._updateGroups(pp, wantG);
    this._updateWalkers(dt, pp, wantW);
    this._jump = false;
    // shadows near the camera only
    const sh = !!g.quality?.preset?.shadows;
    for (const w of this.walkers) w.mesh.castShadow = sh && w.d < 26;
    for (const G of this.groups) for (const m of G.meshes) m.castShadow = sh && G.d < 26;
  }

  _clearAll() {
    for (const w of this.walkers) this._release(w.mesh);
    for (const G of this.groups) for (const m of G.meshes) this._release(m);
    this.walkers = [];
    this.groups = [];
    this.active = false;
  }

  /** A street sample at a distance between r0 and r1 from p (off the camera's view when `hidden`). */
  _sample(p, r0, r1, hidden) {
    const cam = this.game.camera;
    cam.getWorldDirection(_f);
    const cx = Math.floor(p.x / 40), cz = Math.floor(p.z / 40), n = Math.ceil(r1 / 40);
    const cand = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const c = this.cells.get(cx + i + ',' + (cz + j)); if (c) cand.push(c); }
    if (!cand.length) return null;
    const pt = [0, 0, 0, 0];
    for (let tries = 0; tries < 24; tries++) {
      const c = cand[Math.floor(this._rng() * cand.length)], k = Math.floor((this._rng() * c.length) / 2) * 2;
      const st = this.streets[c[k]], s = c[k + 1];
      this._at(st, s, pt);
      const d = Math.hypot(pt[0] - p.x, pt[1] - p.z);
      if (d < r0 || d > r1) continue;
      if (d > 40 && this._rng() < 0.5) continue; // more of them near the player (a ring is mostly its far part)
      if (hidden && tries < 18) {
        const dx = pt[0] - cam.position.x, dz = pt[1] - cam.position.z, L = Math.hypot(dx, dz) || 1;
        if ((dx * _f.x + dz * _f.z) / L > 0.35 && d < 55) continue; // in front of the camera and near: would pop in
      }
      return { st, s };
    }
    return null;
  }

  _spawnWalker(pp, r0, r1, hidden) {
    const q = this._sample(pp, r0, r1, hidden);
    if (!q) return null;
    const { st } = q;
    const side = this._rng() < 0.5 ? -1 : 1, dir = this._rng() < 0.5 ? -1 : 1;
    const lane = st.lanes[Math.floor(this._rng() * st.lanes.length)] + (this._rng() - 0.5) * 0.3;
    const pt = this._at(st, q.s);
    const x = pt[0] - pt[3] * side * lane, z = pt[1] + pt[2] * side * lane;
    const lift = st.lift + (paved(st) && lane > st.half ? 0.05 : 0);
    const y = this.game.world.heightAt(x, z) + lift;
    if (!this._clear(x, y, z)) return null;
    const pack = this._rng() < 0.5 ? 'm' : 'w';
    const D = this.drivers[pack].walk;
    const mesh = this._body(pack, D[Math.floor(this._rng() * D.length)]);
    return { mesh, st, s: q.s, side, dir, lane, lift, off: 0, speed: 1.22 + this._rng() * 0.22, d: 0 };
  }

  _updateWalkers(dt, pp, want) {
    const W = this.game.world;
    // recycle: too far, past the end of the street, or more than wanted
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (this._jump || w.d > R_WALK + 14 || w.s < 1 || w.s > w.st.len - 1 || this.walkers.length > want) {
        this._release(w.mesh);
        this.walkers.splice(i, 1);
      }
    }
    // top up (a jump fills the whole ring at once; otherwise two a frame, out of view)
    for (let k = 0; this.walkers.length < want && k < (this._jump ? 200 : 2); k++) {
      const w = this._spawnWalker(pp, this._jump ? 4 : 30, R_WALK, !this._jump);
      if (w) this.walkers.push(w);
    }
    const pt = [0, 0, 0, 0];
    for (const w of this.walkers) {
      // step aside for the player (and slow down when very close in front)
      const p0 = this._at(w.st, w.s, pt);
      const tx = p0[2] * w.dir, tz = p0[3] * w.dir;
      const nx = -p0[3] * w.side, nz = p0[2] * w.side; // outward of the walker's side
      const bx = p0[0] + nx * (w.lane + w.off), bz = p0[1] + nz * (w.lane + w.off);
      const rx = pp.x - bx, rz = pp.z - bz, along = rx * tx + rz * tz, across = rx * nx + rz * nz;
      let target = 0, slow = 1;
      if (along > -0.6 && along < 2.6 && Math.abs(across) < 1.1) { target = across > 0 ? -(1.15 - across) : 1.15 + across; if (along < 0.9) slow = 0.35; }
      // and for one another (walkers on the same street, face to face)
      for (const o of this.walkers) {
        if (o === w || o.st !== w.st || o.side !== w.side || o.dir === w.dir) continue;
        const ds = (o.s - w.s) * w.dir;
        if (ds > 0 && ds < 3 && Math.abs(o.lane + o.off - w.lane - w.off) < 0.6) target += (w.lane + w.off >= o.lane + o.off ? 0.45 : -0.45);
      }
      w.off += (Math.max(-1.2, Math.min(1.2, target)) - w.off) * Math.min(1, dt * 3);
      w.s += w.dir * w.speed * slow * dt;
      const p = this._at(w.st, w.s, pt);
      const x = p[0] + (-p[3] * w.side) * (w.lane + w.off), z = p[1] + (p[2] * w.side) * (w.lane + w.off);
      const m = w.mesh;
      m.position.set(x, W.heightAt(x, z) + w.lift, z);
      m.rotation.y = Math.atan2(p[2] * w.dir, p[3] * w.dir);
      w.d = Math.hypot(x - pp.x, z - pp.z);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  /** Places for the standing groups: free points of the squares, found once against the collision (lazy). */
  _groupSpots() {
    if (this._spots) return this._spots;
    const W = this.game.world, P = this._plan, out = [];
    const rng = mulberry(4242);
    const spots = Object.values(W.npcSpots);
    for (const sq of P.squares) {
      const c = Math.cos(sq.rot), s = Math.sin(sq.rot);
      for (let a = -sq.w / 2 + 7; a <= sq.w / 2 - 7; a += 9) {
        for (let b = -sq.d / 2 + 7; b <= sq.d / 2 - 7; b += 9) {
          if (rng() < 0.45) continue;
          const du = a + (rng() - 0.5) * 4, dv = b + (rng() - 0.5) * 4;
          const u = sq.u + du * c + dv * s, v = sq.v - du * s + dv * c;
          const [x, z] = AIN.toWorld(u, v);
          if (P.streets.some((S) => S.cls !== 'stair' && polyDist(S.pts, u, v) < S.width / 2 + 1.5)) continue; // off the carriageways
          if (spots.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 4)) continue; // the story's places and townsfolk stay clear
          const y = W.heightAt(x, z) + 0.125;
          if (!this._clear(x, y, z, 1.5)) continue;
          out.push({ x, y, z, n: rng() < 0.55 ? 2 : 3, yaw: rng() * Math.PI * 2, seed: Math.floor(rng() * 1e6) });
        }
      }
    }
    this._spots = out;
    return out;
  }

  _updateGroups(pp, want) {
    const spots = this._groupSpots();
    for (const G of this.groups) G.d = Math.hypot(G.spot.x - pp.x, G.spot.z - pp.z);
    // every half second (or at a jump): the nearest `want` places within reach keep / get their people
    this._t -= 1;
    if (this._t > 0 && !this._jump) return;
    this._t = 30;
    const near = spots.map((sp) => [Math.hypot(sp.x - pp.x, sp.z - pp.z), sp]).filter(([d]) => d < R_STAND).sort((a, b) => a[0] - b[0]).slice(0, want).map(([, sp]) => sp);
    const keep = new Set(near);
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const G = this.groups[i];
      if (keep.has(G.spot)) continue;
      for (const m of G.meshes) this._release(m);
      this.groups.splice(i, 1);
    }
    const have = new Set(this.groups.map((G) => G.spot));
    for (const sp of near) {
      if (have.has(sp)) continue;
      const r = mulberry(sp.seed), meshes = [];
      for (let k = 0; k < sp.n; k++) {
        const pack = r() < 0.5 ? 'm' : 'w';
        const talk = k === 0 || r() < 0.4;
        const D = this.drivers[pack][talk ? 'talk' : 'idle'];
        const m = this._body(pack, D[Math.floor(r() * D.length)]);
        const a = sp.yaw + (k / sp.n) * Math.PI * 2, rr = sp.n === 2 ? 0.55 : 0.7;
        m.position.set(sp.x + Math.sin(a) * rr, sp.y, sp.z + Math.cos(a) * rr);
        m.rotation.y = a + Math.PI + (r() - 0.5) * 0.4; // facing the middle of the group
        meshes.push(m);
      }
      this.groups.push({ spot: sp, meshes, d: Math.hypot(sp.x - pp.x, sp.z - pp.z) });
    }
  }
}
