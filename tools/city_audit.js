// City geometry audit of Axel (dev tool, not loaded by the game).
//
// A page script: the BODY of `async (g) => { ... }`, run after the game has loaded and started
// (g = window.__game). In the dev page console:
//   await (async (g) => { eval(await (await fetch('/tools/city_audit.js')).text()) })(__game)
// is awkward because of the top-level return — use the headless runner instead
// (`node runp.mjs tools/city_audit.js <outdir>`, the scratch runner of the test sessions) or wrap the
// text in `new Function('g', 'return (async () => {' + text + '})()')(__game)`.
//
// It rebuilds the town (world/build/Town.js) through a recording proxy of the world — nothing is
// added to the scene — measures the real kit pieces, and raycasts the built scene where a
// see-through hole is the question. Every count in `summary` should be 0:
//   houses.*   — roofs inside a neighbour's wall / roof / gable, plinths and walls overlapping
//                (between different buildings = groups);
//   wall.*     — see-through slits at the curtain joints, curtain ends outside their tower, open
//                gatehouse side arches;
//   paving.*   — paving top floating (> 0.2 m) or buried (< 0) against the ground, overlapping
//                paving at the same height (z-fighting), kerbs inside squares;
//   doors.*    — door step off its door module, a step without a door module, home / door spots
//                that are not in front of a door.
// `details` lists the offenders (local city coordinates u, v = metres from the Fountain square).
const W = g.world, THREE_V = g.camera.position.constructor;
const AP = await import('/src/world/AxelPlan.js');
const Town = await import('/src/world/build/Town.js');
const AX = AP.AXEL;
const r2 = (n) => Math.round(n * 100) / 100;
const loc = (x, z) => [r2(x - AX.x), r2(z - AX.z)];
const t0 = performance.now();

// ---------------------------------------------------------------- 2D helpers
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
/** SAT penetration depth of two convex polygons (<= 0: apart). */
function pen(A, B) {
  let best = Infinity;
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      let nx = -(b[1] - a[1]), nz = b[0] - a[0];
      const L = Math.hypot(nx, nz); if (L < 1e-9) continue; nx /= L; nz /= L;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const q of A) { const d = q[0] * nx + q[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const q of B) { const d = q[0] * nx + q[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return o;
      best = Math.min(best, o);
    }
  }
  return best;
}
const inHull = (h, x, z) => { let s = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c < -1e-9) { if (s > 0) return false; s = -1; } else if (c > 1e-9) { if (s < 0) return false; s = 1; } } return true; };
const inPoly = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const ov = (A, B) => !(A[1] < B[0] || B[1] < A[0] || A[3] < B[2] || B[3] < A[2]);

// ---------------------------------------------------------------- recording rebuild
const pieces = [], paving = [], spots = {};
const rec = Object.create(W);
const corners = (b, m) => {
  const e = m.elements, res = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) res.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]);
  return res;
};
// the map editor's moves of the groups (layout overrides): World applies the group delta `_D` in every sink
const moved = (self, m) => (self._D ? new m.constructor().multiplyMatrices(self._D, m) : m);
const push = (self, name, box, m, opts) => {
  m = moved(self, m);
  const c = corners(box, m);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of c) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const h = hull(c.map((p) => [p[0], p[2]]));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  pieces.push({ gid: root(self._group), name, lod: self.lodMode, detail: !!opts.detail, collide: opts.collide, hull: h, bb: [x0, x1, z0, z1], y0, y1, c, box, e: Array.from(m.elements) });
};
rec.addSolid = function (geo, m, mat, opts = {}) {
  const gid = root(this._group);
  // Paving (draped ribbons / squares, kerbs): keep the triangles themselves.
  if (((mat === 'cobble' || mat === 'plaza') || (mat === 'stoneDark' && gid === 'axel_streets')) && !geo.index && geo.attributes.position.count > 6) {
    const p = geo.attributes.position.array.slice();
    const tmp = new THREE_V();
    m = moved(this, m);
    for (let i = 0; i < p.length; i += 3) { tmp.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m); p[i] = tmp.x; p[i + 1] = tmp.y; p[i + 2] = tmp.z; }
    paving.push({ gid, mat, pos: p });
    return geo;
  }
  if (!geo.boundingBox) geo.computeBoundingBox();
  push(this, 'solid:' + mat, geo.boundingBox, m, opts);
  return geo;
};
rec.addKit = function (name, m, opts = {}) { push(this, name, this.kits.box(name), m, opts); };
rec.footprints = [];
rec.addFootprint = function (x, z, w, d, rot, kind) { const q = this.xf(new THREE_V(x, 0, z)); this.footprints.push({ x: q.x, z: q.z, w, d, rot: rot + (this._D ? this._group.dyaw : 0), kind, gid: root(this._group) }); };
rec.spot = function (name, pos, yaw = 0) { pos = this.xf(pos.clone()); yaw += this._D ? this._group.dyaw : 0; spots[name] = { x: pos.x, y: pos.y, z: pos.z, yaw, gid: root(this._group) }; this.npcSpots[name] = { pos: pos.clone(), yaw }; };
for (const k of ['addInteractable', 'addLightSource', 'addChimney', 'addChest', 'addObject']) rec[k] = () => null;
rec.npcSpots = {};
rec.trees = { add() {} };
rec.dummies = []; rec.dynamicColliders = []; rec.updatables = []; rec.cameraBlockers = []; rec.entrances = []; rec._staticCollision = [];
rec.scene = { add() {} };
rec.groups = new Map();
// Parts ("tavern/step", "axel_wall/side_3") count as their top-level group.
const root = (g) => { while (g?.parent) g = g.parent; return g?.id ?? null; };
rec._group = null; rec._D = null; rec.lodMode = null;
const out = { summary: {}, details: {} };
try { Town.buildTown(rec); } catch (e) { out.buildError = String(e) + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | '); return out; }

// ---------------------------------------------------------------- houses: intersections between buildings
const KEY = new Set(AP.BUILDINGS.map((b) => b.id));
const isHouse = (id) => id && (KEY.has(id) || (id.startsWith('axel_') && id !== 'axel_streets' && id !== 'axel_wall'));
const cls = (p) => /Roof_RoundTiles|Roof_Tower/.test(p.name) ? 'roof' : /Roof_Front/.test(p.name) ? 'gable' : /Wall_|Corner_|Balcony/.test(p.name) ? 'wall' : p.name === 'solid:stoneDark' ? 'plinth' : (p.collide === true || p.collide === 'box' || p.collide === undefined) && /solid:(stone|plaster)$/.test(p.name) ? 'solid' : null;
const byG = new Map();
for (const p of pieces) {
  if (p.lod === 'far' || !isHouse(p.gid)) continue;
  const k = cls(p); if (!k) continue;
  p.k = k;
  if (!byG.has(p.gid)) byG.set(p.gid, []);
  byG.get(p.gid).push(p);
}
// Roof top surface at (x, z) (null outside): ridge along the model's local z at x = 0, eaves at |x| = max.x.
const roofY = (p, x, z) => {
  const e = p.e, b = p.box;
  const L0 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2], L2 = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
  const dx = x - e[12], dz = z - e[14];
  const lx = (dx * e[0] + dz * e[2]) / L0, lz = (dx * e[8] + dz * e[10]) / L2;
  if (lz < b.min.z || lz > b.max.z || lx < b.min.x || lx > b.max.x) return null;
  const half = (b.max.x - b.min.x) / 2, cx = (b.max.x + b.min.x) / 2;
  const ym = b.max.y - (Math.abs(lx - cx) / half) * (b.max.y - b.min.y);
  return e[13] + ym * Math.hypot(e[4], e[5], e[6]);
};
const ids = [...byG.keys()];
const gbb = new Map(ids.map((id) => { const l = byG.get(id); return [id, [Math.min(...l.map((p) => p.bb[0])), Math.max(...l.map((p) => p.bb[1])), Math.min(...l.map((p) => p.bb[2])), Math.max(...l.map((p) => p.bb[3]))]]; }));
const pairs = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  if (!ov(gbb.get(ids[i]), gbb.get(ids[j]))) continue;
  const r = { a: ids[i], b: ids[j], wallWall: 0, plinth: 0, roofWall: 0, roofRoof: 0, gable: 0, at: null };
  for (const [P, Q] of [[byG.get(ids[i]), byG.get(ids[j])], [byG.get(ids[j]), byG.get(ids[i])]]) {
    for (const p of P) for (const q of Q) {
      if (!ov(p.bb, q.bb)) continue;
      const x0 = Math.max(p.bb[0], q.bb[0]), x1 = Math.min(p.bb[1], q.bb[1]), z0 = Math.max(p.bb[2], q.bb[2]), z1 = Math.min(p.bb[3], q.bb[3]);
      if (p.k === 'roof' && (q.k === 'wall' || q.k === 'gable' || q.k === 'solid')) {
        for (let x = x0; x <= x1; x += 0.15) for (let z = z0; z <= z1; z += 0.15) {
          if (!inHull(q.hull, x, z)) continue;
          const yr = roofY(p, x, z); if (yr === null) continue;
          const dep = Math.min(q.y1 - yr, yr - q.y0);
          if (dep > 0.05 && dep > r.roofWall) { r.roofWall = r2(dep); r.at = [...loc(x, z), r2(yr)]; }
        }
      } else if (p.k === 'roof' && q.k === 'roof' && p.gid < q.gid) {
        for (let x = x0; x <= x1; x += 0.2) for (let z = z0; z <= z1; z += 0.2) {
          if (roofY(p, x, z) === null || roofY(q, x, z) === null) continue;
          r.roofRoof = r2(r.roofRoof + 0.04);
          if (!r.at) r.at = loc(x, z);
        }
      } else if (p.gid < q.gid && p.k !== 'roof' && q.k !== 'roof') {
        if (Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) < 0.05) continue;
        const d = pen(p.hull, q.hull);
        if (d <= 0.02) continue;
        if (p.k === 'wall' && q.k === 'wall') r.wallWall = Math.max(r.wallWall, r2(d));
        else if (p.k === 'plinth' || q.k === 'plinth') r.plinth = Math.max(r.plinth, r2(d));
        else r.gable = Math.max(r.gable, r2(d));
        if (!r.at) r.at = loc((x0 + x1) / 2, (z0 + z1) / 2);
      }
    }
  }
  if (r.wallWall || r.plinth || r.roofWall || r.roofRoof || r.gable) pairs.push(r);
}
pairs.sort((a, b) => b.roofWall - a.roofWall || b.wallWall - a.wallWall || b.roofRoof - a.roofRoof);
out.summary.houses = {
  buildings: ids.length,
  roofInWall: pairs.filter((p) => p.roofWall).length,
  roofOverRoof: pairs.filter((p) => p.roofRoof).length,
  wallInWall: pairs.filter((p) => p.wallWall || p.gable).length,
  plinthOverlap: pairs.filter((p) => p.plinth).length,
};
out.details.housePairs = pairs.slice(0, 30);

// ---------------------------------------------------------------- city wall
// Visual raycasts against the built static meshes (far LOD proxies excluded), BVH per mesh.
const farMeshes = new Set((W.lodMeshes || []).filter((l) => l.far).map((l) => l.mesh));
const statics = [];
g.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !farMeshes.has(o) && o.geometry?.attributes?.position) statics.push(o); });
const near = (o, p, r) => { const g2 = o.geometry; if (!g2.boundingSphere) g2.computeBoundingSphere(); const s = g2.boundingSphere; return Math.hypot(s.center.x - p.x, s.center.y - p.y, s.center.z - p.z) < s.radius + r; };
// World.raycast() tests `this.collider`: borrow it for one mesh at a time (no THREE import needed).
const ray = (from, dir, far) => {
  let best = null;
  for (const o of statics) {
    if (!near(o, from, far + 1)) continue;
    if (!o.geometry.boundsTree && o.geometry.computeBoundsTree) o.geometry.computeBoundsTree();
    const h = W.raycast.call({ collider: o }, from, dir, far);
    if (h && (!best || h.distance < best.distance)) best = h;
  }
  return best;
};
const nodes = AP.WALL.nodes.map((n) => ({ ...n, x: AX.x + n.u, z: AX.z + n.v }));
const wallPieces = pieces.filter((p) => p.gid === 'axel_wall' && p.name === 'castle/wall');
const wp = wallPieces.map((p) => {
  const e = p.e;
  const sxH = Math.hypot(e[0], e[2]), sz = Math.hypot(e[8], e[9], e[10]), sy = e[5];
  return { e, ax: [e[0] / sxH, e[2] / sxH], nz: [e[8] / sz, e[10] / sz], cx: e[12], cz: e[14], sx: sxH, sz, sy, slope: e[1] / sxH };
});
// Top height of a piece at the horizontal position (x, z) (merlon tops, model y 1.31).
const topAt = (w, x, z) => w.e[13] + w.slope * ((x - w.cx) * w.ax[0] + (z - w.cz) * w.ax[1]) + 1.31 * w.sy;
const joints = [];
for (let i = 0; i < wp.length - 1; i++) {
  const A = wp[i], B = wp[i + 1];
  if (A.ax[0] * B.ax[0] + A.ax[1] * B.ax[1] < 0.999) continue; // a tower / gatehouse between them
  const d = Math.hypot(B.cx - A.cx, B.cz - A.cz);
  if (d > (A.sx + B.sx) / 2 + 0.5) continue;
  const overlap = (A.sx + B.sx) / 2 - d;
  // Open end columns of the model: x -0.5..-0.465 and 0.468..0.5 (rays across the wall find nothing there).
  const slit = 0.032 * A.sx + 0.035 * B.sx - overlap;
  const jx = A.cx + A.ax[0] * (A.sx / 2 - overlap / 2), jz = A.cz + A.ax[1] * (A.sx / 2 - overlap / 2);
  const ground = W.heightAt(jx, jz);
  // Raycast across the wall at the joint (from 0.2 m outside one face to the other face).
  let open = 0;
  for (let s = -overlap / 2 - 0.1; s <= overlap / 2 + 0.1 + 1e-6; s += 0.05) for (const hy of [1.5, 3.5, 5.5]) {
    const px = jx + A.ax[0] * s, pz = jz + A.ax[1] * s;
    const from = new THREE_V(px + A.nz[0] * (A.sz / 2 + 0.2), ground + hy, pz + A.nz[1] * (A.sz / 2 + 0.2));
    const hit = ray(from, new THREE_V(-A.nz[0], 0, -A.nz[1]), A.sz + 0.4);
    if (!hit) open++;
  }
  joints.push({ at: loc(jx, jz), overlap: r2(overlap), slit: r2(slit), open, topStep: r2(topAt(B, jx, jz) - topAt(A, jx, jz)) });
}
// Curtain ends inside their tower / gatehouse (the end's outer corners, 0.16 m in, incl. the end slit).
const towerHulls = pieces.filter((p) => /tower-square-(base|arch)$/.test(p.name) && (p.gid === null || /^(tower_|wall_tower_|gate_)/.test(p.gid)) && Math.hypot(p.e[0], p.e[2]) > 3);
const wallEnds = [];
let towerEnds = 0;
for (const w of wp) for (const s of [-1, 1]) {
  const ex = w.cx + w.ax[0] * s * w.sx / 2, ez = w.cz + w.ax[1] * s * w.sx / 2;
  // An end inside the next piece of the same run is a joint, not a tower end.
  if (wp.some((o) => o !== w && Math.abs(o.ax[0] * w.ax[0] + o.ax[1] * w.ax[1]) > 0.999 && Math.abs((ex - o.cx) * o.ax[0] + (ez - o.cz) * o.ax[1]) < o.sx / 2 && Math.abs((ex - o.cx) * o.nz[0] + (ez - o.cz) * o.nz[1]) < 0.5)) continue;
  towerEnds++;
  const nearT = towerHulls.filter((t) => Math.hypot(t.e[12] - ex, t.e[14] - ez) < 12);
  if (!nearT.length) { wallEnds.push({ at: loc(ex, ez), note: 'no tower' }); continue; }
  const pts = [-0.5, 0.5].map((o) => [ex + w.nz[0] * o * w.sz - w.ax[0] * s * 0.16, ez + w.nz[1] * o * w.sz - w.ax[1] * s * 0.16]);
  if (!pts.every(([x, z]) => nearT.some((t) => inHull(t.hull, x, z)))) wallEnds.push({ at: loc(ex, ez) });
}
// Gatehouse side arches: rays along the wall at the gap between the curtain face and the arch edge.
const gateSlots = [];
for (const N of nodes.filter((n) => n.gate)) {
  const gp = pieces.find((p) => p.name === 'castle/tower-square-arch' && Math.hypot(p.e[12] - N.x, p.e[14] - N.z) < 3);
  if (!gp) { gateSlots.push({ gate: N.gate, note: 'no gatehouse' }); continue; }
  const e = gp.e, SX = Math.hypot(e[0], e[2]), SZ = Math.hypot(e[8], e[10]);
  const ax = [e[0] / SX, e[2] / SX], nz = [e[8] / SZ, e[10] / SZ];
  const ground = W.heightAt(N.x, N.z);
  let open = 0, n = 0;
  for (const side of [-1, 1]) for (const zs of [-1, 1]) for (const zo of [1.6, 1.75, 1.9]) for (const hy of [0.5, 2, 3.5, 5]) {
    // From 1 m outside the side face towards the passage wall (stops before the passage).
    const sx = side * (SX * 0.47 + 1), z = zs * zo;
    const from = new THREE_V(N.x + ax[0] * sx + nz[0] * z, ground + hy, N.z + ax[1] * sx + nz[1] * z);
    const hit = ray(from, new THREE_V(-side * ax[0], 0, -side * ax[1]), SX * 0.47 + 1 - SX * 0.274 - 0.1);
    n++;
    if (!hit) open++;
  }
  if (open) gateSlots.push({ gate: N.gate, open, of: n });
}
out.summary.wall = {
  pieces: wp.length, joints: joints.length,
  slitJoints: joints.filter((j) => j.slit > 0).length,
  seeThroughJoints: joints.filter((j) => j.open).length,
  maxTopStep: Math.max(0, ...joints.map((j) => Math.abs(j.topStep))),
  towerEnds, wallEndsOutsideTower: wallEnds.length,
  openGateSides: gateSlots.length,
};
out.details.wall = { joints: joints.filter((j) => j.open || j.slit > 0).slice(0, 12), example: joints.slice(0, 3), wallEnds: wallEnds.slice(0, 12), gateSlots };

// ---------------------------------------------------------------- paving
const squaresW = AP.SQUARES.map((q) => q.pts.map(([u, v]) => [AX.x + u, AX.z + v]));
let pTris = 0, floating = 0, buried = 0, minLift = Infinity, maxLift = -Infinity;
const worst = [];
const tops = []; // top triangles for the overlap test: [ax, ay, az, bx, ..., gid/mat index]
paving.forEach((pv, k) => {
  const p = pv.pos;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5], cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const area = Math.abs(ny) / 2;
    if (area < 1e-4) continue;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], L = Math.hypot(...n);
    if (n[1] / L < 0.7) continue; // skirts / kerb sides
    if (pv.mat === 'cobble') tops.push([ax, ay, az, bx, by, bz, cx, cy, cz, k]);
    if (pv.mat !== 'cobble') continue;
    pTris++;
    // Vertices + centroid + edge midpoints against the ground.
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz], [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3], [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], [(bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2], [(ax + cx) / 2, (ay + cy) / 2, (az + cz) / 2]]) {
      const d = y - W.heightAt(x, z);
      minLift = Math.min(minLift, d); maxLift = Math.max(maxLift, d);
      if (d > 0.2 || d < 0) { if (d > 0.2) floating++; else buried++; if (worst.length < 10) worst.push({ at: loc(x, z), d: r2(d) }); }
    }
  }
});
// Overlapping paving at (nearly) the same height = z-fighting: 1 m grid, every top triangle over a point.
const cell = new Map();
tops.forEach((t, i) => {
  const xs = [t[0], t[3], t[6]], zs = [t[2], t[5], t[8]];
  for (let cx = Math.floor(Math.min(...xs) / 4); cx <= Math.floor(Math.max(...xs) / 4); cx++) for (let cz = Math.floor(Math.min(...zs) / 4); cz <= Math.floor(Math.max(...zs) / 4); cz++) {
    const k = cx * 100003 + cz; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i);
  }
});
const yOn = (t, x, z) => {
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-9) return null;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
  if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return null;
  return l1 * ay + l2 * by + l3 * cy;
};
let zfight = 0; const zEx = [];
for (let x = AX.x - 112; x < AX.x + 108; x += 1) for (let z = AX.z - 112; z < AX.z + 112; z += 1) {
  const list = cell.get(Math.floor(x / 4) * 100003 + Math.floor(z / 4)); if (!list || list.length < 2) continue;
  const hs = [];
  for (const i of list) { const y = yOn(tops[i], x + 0.5, z + 0.5); if (y !== null) hs.push([y, tops[i][9]]); }
  hs.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < hs.length; k++) if (hs[k][1] !== hs[k - 1][1] && hs[k][0] - hs[k - 1][0] < 0.003) { zfight++; if (zEx.length < 8) zEx.push({ at: loc(x + 0.5, z + 0.5), dy: r2(hs[k][0] - hs[k - 1][0]) }); break; }
}
// Kerbs (stoneDark paving of axel_streets): any kerb triangle centre inside a square.
let kerbTris = 0, kerbInSquare = 0; const kEx = [];
for (const pv of paving.filter((q) => q.mat === 'stoneDark')) {
  const p = pv.pos;
  for (let i = 0; i < p.length; i += 9) {
    kerbTris++;
    const x = (p[i] + p[i + 3] + p[i + 6]) / 3, z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    const q = squaresW.findIndex((s) => inPoly(s, x, z));
    if (q >= 0) { kerbInSquare++; if (kEx.length < 6) kEx.push({ sq: AP.SQUARES[q].id, at: loc(x, z) }); }
  }
}
out.summary.paving = { meshes: paving.length, topTriangles: pTris, liftRange: [r2(minLift), r2(maxLift)], floating, buried, zFighting: zfight, kerbTriangles: kerbTris, kerbsInSquares: kerbInSquare };
out.details.paving = { worst, zFighting: zEx, kerbs: kEx };

// ---------------------------------------------------------------- doors
const byGid = new Map();
for (const p of pieces) { if (!p.gid || p.lod === 'far') continue; if (!byGid.has(p.gid)) byGid.set(p.gid, []); byGid.get(p.gid).push(p); }
const ctr = (p) => [p.c.reduce((a, q) => a + q[0], 0) / 8, p.c.reduce((a, q) => a + q[2], 0) / 8];
let checked = 0; const misaligned = [], noDoor = [], doorModules = [];
for (const [id, list] of byGid) {
  const fp = rec.footprints.find((f) => f.gid === id && ['house', 'inn', 'public', 'shop', 'warehouse', 'tavern', 'guild', 'temple', 'stable'].includes(f.kind));
  if (!fp) continue;
  const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
  const toL = (x, z) => { const dx = x - fp.x, dz = z - fp.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const front = (fp.d - 0.3) / 2 - 0.6;
  const doors = list.filter((p) => /^village\/(Wall_\w+_Door_Round|Wall_Arch)$/.test(p.name)).map((p) => ({ p, l: toL(...ctr(p)) })).filter((q) => q.l[1] > front);
  for (const q of doors) doorModules.push({ id, x: ctr(q.p)[0], z: ctr(q.p)[1], rot: fp.rot, closed: /Door_Round/.test(q.p.name) });
  // Door steps: 0.57 high, 0.9 deep, 1.8 m wide (a hall's step spans its arch).
  const steps = list.filter((p) => p.name === 'solid:stone' && Math.hypot(p.e[0], p.e[1], p.e[2]) > 1.8 - 1e-3 && Math.abs(Math.hypot(p.e[4], p.e[5], p.e[6]) - 0.57) < 1e-3 && Math.abs(Math.hypot(p.e[8], p.e[9], p.e[10]) - 0.9) < 1e-3).map((p) => toL(...ctr(p)));
  if (!steps.length) continue;
  checked++;
  const closed = doors.filter((q) => /Door_Round$/.test(q.p.name)).map((q) => q.l);
  const cand = closed.length ? closed : doors.map((q) => q.l);
  if (!cand.length) { noDoor.push({ id, step: steps[0].map(r2) }); continue; }
  const off = Math.min(...cand.map(([lx]) => Math.abs(lx - steps[0][0])));
  if (off > 0.25) misaligned.push({ id, off: r2(off), stepX: r2(steps[0][0]), doorX: cand.map(([lx]) => r2(lx)) });
}
// Home / door spots: in front of a door module of their building (laterally within 0.3 m).
const spotNames = Object.keys(spots).filter((k) => /^(house_\d+|mia_home|greta_home)$|_door$/.test(k));
const offSpots = [];
for (const k of spotNames) {
  const sp = spots[k];
  if (k === 'crypt_door' || k === 'town_hall_door') continue; // the crypt kit / the clock tower's door (no wall module)
  const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw);
  let best = Infinity;
  for (const d of doorModules) {
    const dx = sp.x - d.x, dz = sp.z - d.z, along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < 4 && lat < best) best = lat;
  }
  if (best > 0.3) offSpots.push({ spot: k, lateral: best === Infinity ? 'no door near' : r2(best), at: loc(sp.x, sp.z) });
}
out.summary.doors = { buildingsWithStep: checked, misaligned: misaligned.length, stepWithoutDoor: noDoor.length, spots: spotNames.length, spotsOffDoor: offSpots.length };
out.details.doors = { misaligned, noDoor, offSpots };
out.summary.ms = Math.round(performance.now() - t0);
return out;
