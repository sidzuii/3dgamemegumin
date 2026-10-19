/**
 * Stage-2 plan checker + renderer (not part of the game).
 *
 *   node tools/plan/render_plan.mjs [--emit]
 *
 * Runs the terrain model (src/world/Terrain.js) on the overworld (src/world/MapData.js), checks
 * the city (src/world/AxelPlan.js) against it and writes docs/plan/region.svg, docs/plan/axel.svg
 * and docs/plan/report.json. `--emit` also writes the generated house lots to
 * src/world/build/AxelLots.js (the game builds exactly those).
 *
 * Checks: roads cross water only at bridges, road grades, route lengths / walking times,
 * wall vs river, buildings vs streets / squares / wall / each other, ground flatness, level
 * street cross-sections. Streets are the built centre lines (AxelPlan streetLine / ringLine,
 * rounded bends). Buildings are compared by their real built outline (AxelPlan ENVELOPE: roof
 * overhang, jetty, plinth, what stands at the door; key buildings' `annex` towers / steps), so
 * no two roofs, walls or plinths meet. The frontage generator fills the blocks with plots.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import zlib from 'node:zlib';
import * as P from '../../src/world/MapData.js';
import * as C from '../../src/world/AxelPlan.js';
import * as T from '../../src/world/Terrain.js';
import { mulberry32 } from '../../src/core/math.js';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = join(ROOT, 'docs/plan');
mkdirSync(OUT, { recursive: true });

const H = (x, z) => T.analyticHeight(x, z);

const WALK = 3.4, RUN = 6.4, NPC_WALK = 1.35; // CharacterController MOVE, NPCManager WALK_SPEED
const issues = [];
const issue = (where, msg) => issues.push(`${where}: ${msg}`);

// ---------------------------------------------------------------------------------------
// Geometry
const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
function sampleLine(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
const lineDist = (pts, x, z) => pts.slice(1).reduce((m, p, i) => Math.min(m, segDist(x, z, pts[i][0], pts[i][1], p[0], p[1])), Infinity);
function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const polyDist = (pts, x, z) => lineDist([...pts, pts[0]], x, z);
const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
/** Inset a closed polygon (clockwise in screen coords = u right, v down) by d metres. */
function inset(pts, d) {
  const n = pts.length, lines = [];
  // Interior side: the polygon centroid decides the normal sign.
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cz = pts.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let nx = -(b[1] - a[1]), nz = b[0] - a[0];
    const L = Math.hypot(nx, nz); nx /= L; nz /= L;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if ((cx - mx) * nx + (cz - mz) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push([[a[0] + nx * d, a[1] + nz * d], [b[0] + nx * d, b[1] + nz * d]]);
  }
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n];
    const [p1, p2] = m, [p3, p4] = l;
    const d1x = p2[0] - p1[0], d1z = p2[1] - p1[1], d2x = p4[0] - p3[0], d2z = p4[1] - p3[1];
    const den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-6) return p3;
    const t = ((p3[0] - p1[0]) * d2z - (p3[1] - p1[1]) * d2x) / den;
    return [p1[0] + d1x * t, p1[1] + d1z * t];
  });
}
/** Oriented rectangle of a building: face = where the front looks. */
const FACE = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
/** Rectangle x0..x1 × z0..z1 in the building frame (local x along the front, +z = front). */
function rectLocal(b, x0, x1, z0, z1) {
  const rot = b.rot ?? FACE[b.face];
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const W2 = (lx, lz) => [b.u + lx * cs + lz * sn, b.v - lx * sn + lz * cs];
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => W2(lx, lz));
  const [u, v] = W2((x0 + x1) / 2, (z0 + z1) / 2);
  return { corners, rot, u, v, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 };
}
const rect = (b) => rectLocal(b, -b.w / 2, b.w / 2, -b.d / 2, b.d / 2);
/** Built outline: the walls + C.ENVELOPE, and the annexes (towers, turrets, steps) of key buildings. */
const EN = C.ENVELOPE;
function envelope(b) {
  const out = [rectLocal(b, -b.w / 2 - EN.side, b.w / 2 + EN.side, -b.d / 2 - EN.back, b.d / 2 + (EN.front[b.kind] ?? 1))];
  for (const a of b.annex || []) out.push(rectLocal(b, a.x - a.w / 2, a.x + a.w / 2, a.z - a.d / 2, a.z + a.d / 2));
  return out;
}
function satOverlap(A, B, margin = 0) {
  for (const R of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const a = R.corners[i], b = R.corners[i + 1];
      let ax = b[0] - a[0], az = b[1] - a[1];
      const L = Math.hypot(ax, az); ax /= L; az /= L;
      const proj = (Q) => Q.corners.map((c) => c[0] * ax + c[1] * az);
      const pa = proj(A), pb = proj(B);
      if (Math.max(...pa) + margin <= Math.min(...pb) || Math.max(...pb) + margin <= Math.min(...pa)) return false;
    }
  }
  return true;
}
/** Distance from a point to a rectangle (0 inside). */
function rectPointDist(R, x, z) {
  const rot = R.rot, cs = Math.cos(rot), sn = Math.sin(rot);
  const dx = x - R.u, dz = z - R.v;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const ex = Math.max(0, Math.abs(lx) - R.hw), ez = Math.max(0, Math.abs(lz) - R.hd);
  return Math.hypot(ex, ez);
}
const rectLineDist = (R, pts) => sampleLine(pts, 0.5).reduce((m, [x, z]) => Math.min(m, rectPointDist(R, x, z)), Infinity);
function rectPolyOverlap(R, pts) {
  if (R.corners.some(([x, z]) => inPoly(pts, x, z))) return true;
  if (pts.some(([x, z]) => rectPointDist(R, x, z) === 0)) return true;
  return rectLineDist(R, [...pts, pts[0]]) < 0.05;
}

// ---------------------------------------------------------------------------------------
// World checks
const W2L = (x, z) => [x - P.AXEL.x, z - P.AXEL.z];
const L2W = (u, v) => [P.AXEL.x + u, P.AXEL.z + v];
const report = { routes: [], roads: [], city: {}, issues };
const nearBridge = (x, z) => P.BRIDGES.some((b) => segDist(x, z, b.a[0], b.a[1], b.b[0], b.b[1]) < 10);
for (const r of P.ROADS) {
  const pts = sampleLine(r.points, 2);
  let wet = 0, maxGrade = 0, steepRun = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (T.riverDistance(x, z) < 0 && !nearBridge(x, z)) wet++;
    for (const L of P.LAKES) if (Math.hypot(x - L.center.x, z - L.center.z) < L.radius) wet++;
    if (i >= 5) {
      const [x0, z0] = pts[i - 5];
      const g = Math.abs(H(x, z) - H(x0, z0)) / Math.hypot(x - x0, z - z0);
      maxGrade = Math.max(maxGrade, g);
      if (g > 0.3) steepRun++;
    }
  }
  report.roads.push({ id: r.id, length: Math.round(len(r.points)), maxGrade: +maxGrade.toFixed(2) });
  if (wet) issue('road ' + r.id, `${wet} samples in water away from a bridge`);
  if (steepRun > 3) issue('road ' + r.id, `steeper than 30% over ${steepRun * 2} m (max ${Math.round(maxGrade * 100)}%)`);
}
for (const R of P.ROUTES) {
  const road = P.ROADS.find((r) => r.id === R.road);
  let pts = road.points;
  if (R.to) {
    // Cut at the nearest point to `to`.
    let best = 0, bd = Infinity;
    sampleLine(pts, 1).forEach(([x, z], i) => { const d = Math.hypot(x - R.to[0], z - R.to[1]); if (d < bd) { bd = d; best = i; } });
    pts = sampleLine(pts, 1).slice(0, best + 1);
  }
  let L = len(pts);
  if (R.then) L += len(P.ROADS.find((r) => r.id === R.then).points);
  if (R.extra) { const q = pts[pts.length - 1]; L += Math.hypot(R.extra[0] - q[0], R.extra[1] - q[1]); }
  report.routes.push({ id: R.id, name: R.name, metres: Math.round(L), walk_min: +(L / WALK / 60).toFixed(1), run_min: +(L / RUN / 60).toFixed(1), npc_walk_min: +(L / NPC_WALK / 60).toFixed(1) });
}
const e = (x, z) => Math.max(Math.abs(x), Math.abs(z)) * 0.7 + Math.hypot(x, z) * 0.3;
for (const R of P.REGIONS) {
  if (R.interior) continue;
  const flat = P.FLATS.some((f) => Math.hypot(f.x - R.center.x, f.z - R.center.z) < 5);
  if (e(R.center.x, R.center.z) > P.HALF - 125 && !flat) issue('region ' + R.id, 'inside the edge mountains');
  if (R.id !== 'river' && T.riverDistance(R.center.x, R.center.z) < 4) issue('region ' + R.id, 'centre in the river');
}

// ---------------------------------------------------------------------------------------
// City checks
const wallPts = C.WALL.nodes.map((n) => [n.u, n.v]);
const wallLoop = [...wallPts, wallPts[0]];
const ring = C.ringLine();
const buildLimit = inset(wallPts, C.RING.inset + C.RING.width / 2 + 0.6); // houses stay inside the pomerium
report.city.wall = { perimeter: Math.round(len(wallLoop)), area: Math.round(area(wallPts)), towers: C.WALL.nodes.filter((n) => !n.gate).length, gates: C.WALL.nodes.filter((n) => n.gate).length, segments: Math.round(len(wallLoop) / 4) };
let minRiver = Infinity;
for (const [u, v] of sampleLine(wallLoop, 1)) minRiver = Math.min(minRiver, T.riverDistance(...L2W(u, v)));
report.city.wall.minDistanceToWater = +minRiver.toFixed(1);
if (minRiver < 6) issue('wall', `only ${minRiver.toFixed(1)} m from the water`);
function corridorsOf() { return corridors; }
const LINE = Object.fromEntries(C.STREETS.map((s) => [s.id, C.streetLine(s)]));
const corridors = [
  ...C.STREETS.map((s) => ({ id: s.id, pts: LINE[s.id], half: s.width / 2 })),
  { id: 'ring', pts: [...ring, ring[0]], half: C.RING.width / 2 },
];
for (const s of C.STREETS) {
  for (const [u, v] of sampleLine(LINE[s.id], 2)) {
    if (!inPoly(wallPts, u, v) && polyDist(wallPts, u, v) > 1.5) { issue('street ' + s.id, `leaves the wall at (${u.toFixed(0)}, ${v.toFixed(0)})`); break; }
  }
}
// The ground across every street (and the pomerium) is level (Terrain.js levels it): the draped
// paving lies flush, no cross slope.
let worstCross = { d: 0 };
for (const c of corridors) {
  const pts = sampleLine(c.pts, 2);
  for (let i = 0; i < pts.length - 1; i++) {
    const [u, v] = pts[i], [u2, v2] = pts[i + 1];
    const L = Math.hypot(u2 - u, v2 - v) || 1, nu = -(v2 - v) / L, nv = (u2 - u) / L;
    for (const s of [-1, 1]) {
      // Edge point vs the centre-line point it is across from (its nearest point on the line);
      // junctions (the edge within another street) blend both streets and are skipped.
      const eu = u + nu * s * c.half, ev = v + nv * s * c.half;
      if (corridors.some((o) => o !== c && lineDist(o.pts, eu, ev) < o.half + 3)) continue;
      let best = Infinity, cu = u, cv = v;
      for (let k = 0; k < c.pts.length - 1; k++) {
        const [au, av] = c.pts[k], [bu, bv] = c.pts[k + 1], du = bu - au, dv = bv - av;
        const t = Math.max(0, Math.min(1, ((eu - au) * du + (ev - av) * dv) / (du * du + dv * dv || 1)));
        const dd = Math.hypot(eu - au - du * t, ev - av - dv * t);
        if (dd < best) { best = dd; cu = au + du * t; cv = av + dv * t; }
      }
      const d = Math.abs(H(...L2W(eu, ev)) - H(...L2W(cu, cv)));
      if (d > worstCross.d) worstCross = { d, id: c.id, at: [Math.round(eu), Math.round(ev)] };
    }
  }
}
report.city.streetCrossSlope = { max: +worstCross.d.toFixed(3), at: worstCross.at, street: worstCross.id };
if (worstCross.d > 0.1) issue('street ' + worstCross.id, `cross slope ${worstCross.d.toFixed(2)} m at (${worstCross.at})`);
// The map editor's layout (public/data/placements.json) may have moved key buildings and yards: the generated houses keep clear of
// them where they stand in the game, not where the plan first put them (the overrides of generated lots are not applied: a new
// generation makes new lots).
const LAYOUT = existsSync(join(ROOT, 'public/data/placements.json')) ? JSON.parse(readFileSync(join(ROOT, 'public/data/placements.json'), 'utf8')) : {};
const OV = LAYOUT.overrides || {};
const KEYS = C.BUILDINGS.map((b) => {
  const o = OV[b.id];
  return o ? { ...b, u: o.x - P.AXEL.x, v: o.z - P.AXEL.z, rot: o.rot } : b;
});
const AREAS = C.AREAS.map((A) => {
  const o = OV[A.id];
  if (!o) return A;
  // the group pivot is the centre of the area's box (Town.js); the override moves and turns it about that pivot
  const us = A.pts.map((p) => p[0]), vs = A.pts.map((p) => p[1]);
  const cu = (Math.min(...us) + Math.max(...us)) / 2, cv = (Math.min(...vs) + Math.max(...vs)) / 2;
  const tu = o.x - P.AXEL.x, tv = o.z - P.AXEL.z, c = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
  return { ...A, pts: A.pts.map(([u, v]) => { const du = u - cu, dv = v - cv; return [tu + du * c + dv * sn, tv - du * sn + dv * c]; }) };
});
const obstacles = [...C.SQUARES, ...AREAS];
// Open areas (cemetery, yards, gardens) must not reach into the streets or the pomerium.
for (const A of AREAS) {
  for (const c of corridorsOf()) {
    const d = Math.min(...sampleLine([...A.pts, A.pts[0]], 0.5).map(([u, v]) => lineDist(c.pts, u, v)));
    if (d < c.half + 0.3 && !(A.id.endsWith('forecourt') || A.id.endsWith('terrace') || A.id.endsWith('steps') || A.id.endsWith('_front') || (A.id === 'secret_garden' && c.id === 'garden_lane'))) issue('area ' + A.id, 'touches ' + c.id);
  }
}
const placed = [];
const groundRange = (R) => {
  const hs = [];
  for (const [u, v] of [...R.corners, [R.u, R.v]]) hs.push(H(...L2W(u, v)));
  return Math.max(...hs) - Math.min(...hs);
};
function check(b, R, strict) {
  const why = [];
  if (R.corners.some(([u, v]) => !inPoly(buildLimit, u, v))) why.push('wall/pomerium');
  for (const c of corridors) {
    if (c.id === 'ring' && why.includes('wall/pomerium')) continue;
    if (rectLineDist(R, c.pts) < c.half + 0.4) why.push('street ' + c.id);
  }
  for (const o of obstacles) if (o.id !== b.inside && rectPolyOverlap(R, o.pts)) why.push(o.id);
  const E = envelope(b);
  for (const p of placed) if (E.some((A) => p.E.some((Q) => satOverlap(A, Q, EN.gap)))) why.push('building ' + p.id);
  if (groundRange(R) > (strict ? 0.6 : 0.8)) why.push(`slope ${groundRange(R).toFixed(1)} m`);
  return why;
}
for (const b0 of KEYS) {
  const b = { ...b0, key: true };
  const R = rect(b);
  const why = check(b, R, true);
  if (why.length) issue('building ' + b.id, why.join(', '));
  placed.push({ ...b, R, E: envelope(b), key: true });
}

// Frontage generator: walk along every street (and square edge), both sides, and try plots.
const rng = mulberry32(2026);
const districtAt = (u, v) => C.DISTRICTS.find((d) => inPoly(d.pts, u, v))?.id ?? 'res_s';
// Squares first (the best addresses), then main streets, secondary streets, lanes, the pomerium.
const RANK = { main: 1, secondary: 2, lane: 3 };
const fronts = [
  ...C.SQUARES.filter((s) => !s.id.endsWith('gate_place')).map((s) => ({ pts: [...s.pts, s.pts[0]], half: 0, sides: [1, -1] })),
  ...[...C.STREETS].sort((a, b) => RANK[a.kind] - RANK[b.kind]).map((s) => ({ pts: LINE[s.id], half: s.width / 2, sides: [-1, 1] })),
  { pts: [...ring, ring[0]], half: C.RING.width / 2, sides: [1, -1] },
];
let tries = 0;
/** Point at arc length s along a polyline. */
function walker(pts) {
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = acc[acc.length - 1];
  const at = (q) => {
    q = Math.max(0, Math.min(total, q));
    let k = 1;
    while (k < acc.length - 1 && acc[k] < q) k++;
    const f = (q - acc[k - 1]) / (acc[k] - acc[k - 1] || 1);
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f];
  };
  return { total, at };
}
// Rows along the whole length of every front (not segment by segment: the rounded bends are short segments): a plot of width w at
// arc length t stands square to the chord under it, its front on the line `half + 0.8` from the centre, the next plot after the
// envelope gap — so the houses of a street form an even row that follows its bends.
for (const f of fronts) {
  const { total, at } = walker(f.pts);
  for (const side of f.sides) {
    let t = 1.5;
    while (t < total - 3) {
      if (placed.length >= C.TARGET.max) break;
      let ok = null;
      for (let k = 0; k < 4 && !ok; k++) {
        const probe = at(t + 3);
        const dist = districtAt(probe[0], probe[1]);
        const F = C.FILL[dist];
        let w = F.w[1] - (k + rng()) * (F.w[1] - F.w[0]) / 3, d = F.d[0] + rng() * (F.d[1] - F.d[0]);
        if (k === 3) { w = F.w[0]; d = F.d[0]; }
        if (t + w > total - 1) continue;
        const [ax, az] = at(t), [bx, bz] = at(t + w);
        const L = Math.hypot(bx - ax, bz - az);
        if (L < w * 0.9) continue; // too sharp a bend under the plot
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        const nx = -tz * side, nz = tx * side;
        const back = f.half + 0.8 + d / 2;
        const cu = (ax + bx) / 2 + nx * back, cv = (az + bz) / 2 + nz * back;
        // Front faces the street: front direction = -n.
        const b = { id: 'p' + placed.length, u: cu, v: cv, w, d, rot: Math.atan2(-nx, -nz), kind: F.kinds[Math.floor(rng() * F.kinds.length)], district: dist };
        const R = rect(b);
        tries++;
        if (!check(b, R, false).length) ok = { ...b, R, E: envelope(b) };
      }
      if (ok) {
        placed.push(ok);
        t += ok.w + EN.side * 2 + EN.gap + (rng() < 0.08 ? 3.5 : 0); // an even row; now and then a passage to the yards
      } else t += 1;
    }
  }
}
// The space in front of a key building's door stays open (no house standing with its back a few metres before the entrance of the
// hospice / the guild…): a forecourt as wide as the front and FORECOURT deep; generated plots on it are dropped (after the
// generation, so the random stream and the rest of the rows stay as they are).
const FORECOURT = 5.5;
const forecourts = placed.filter((p) => p.key).map((p) => ({ id: p.id, R: rectLocal(p, -p.w / 2, p.w / 2, p.d / 2, p.d / 2 + FORECOURT) }));
const gen = placed.filter((p) => {
  if (p.key) return false;
  const f = forecourts.find((q) => p.E.some((A) => satOverlap(A, q.R)));
  if (f) console.log('plot', p.id, 'stands in front of', f.id, '- dropped');
  return !f;
});
for (let i = placed.length - 1; i >= 0; i--) if (!placed[i].key && !gen.includes(placed[i])) placed.splice(i, 1); // (the report and the drawings too)
if (process.argv.includes('--emit')) {
  const seq = {};
  const rows = gen.map((p) => {
    seq[p.district] = (seq[p.district] || 0) + 1;
    const f = (n) => +n.toFixed(2);
    return `  { id: '${p.district}_${seq[p.district]}', district: '${p.district}', kind: '${p.kind}', u: ${f(p.u)}, v: ${f(p.v)}, w: ${f(p.w)}, d: ${f(p.d)}, rot: ${f(p.rot)} },`;
  });
  writeFileSync(join(ROOT, 'src/world/build/AxelLots.js'), `/**
 * Lots of the ordinary buildings of Axel (houses, shops, workshops, warehouses, stables).
 * GENERATED by \`node tools/plan/render_plan.mjs --emit\` from src/world/AxelPlan.js — each lot
 * faces its street (front = local +z of rot), clears the streets, squares, the pomerium and
 * the other buildings. Local city coordinates (see AxelPlan.js). Hand edits are fine; the
 * generator overwrites them, so prefer moving houses with the map editor (group id = 'axel_' + id).
 */
export const LOTS = [
${rows.join('\n')}
];
`);
  console.log('emitted', rows.length, 'lots');
}
const count = (list, key) => list.reduce((m, p) => ((m[p[key]] = (m[p[key]] || 0) + 1), m), {});
for (const p of placed) if (p.key) p.district = districtAt(p.u, p.v);
report.city.buildings = {
  key: C.BUILDINGS.length,
  generated: gen.length,
  total: placed.length,
  byDistrict: count(placed, 'district'),
  byKind: count(placed, 'kind'),
  footprint_m2: Math.round(placed.reduce((s, p) => s + p.w * p.d, 0)),
};
report.city.streets = Object.fromEntries(['main', 'secondary', 'lane'].map((k) => [k, Math.round(C.STREETS.filter((s) => s.kind === k).reduce((s, x) => s + len(x.pts), 0))]));
report.city.streets.ring = Math.round(len([...ring, ring[0]]));
report.city.districts = C.DISTRICTS.map((d) => ({ id: d.id, name: d.name, area: Math.round(area(d.pts)), buildings: placed.filter((p) => p.district === d.id).length }));
report.forests = P.FORESTS.map((f) => ({ id: f.id, name: f.name, area_ha: +(area(f.pts) / 10000).toFixed(1) }));
report.city.squares = C.SQUARES.map((s) => ({ id: s.id, name: s.name, area: Math.round(area(s.pts)) }));
const gates = C.WALL.nodes.filter((n) => n.gate);
const sq = (s) => C.STREETS.find((x) => x.id === s);
report.city.gateToSquare = { north: Math.round(len(sq('north_street').pts)), east: Math.round(len(sq('market_street').pts)), south: Math.round(len(sq('caravan_street').pts)), west: Math.round(len(sq('forge_street').pts)) };
report.city.gates = gates.map((g) => ({ gate: g.gate, local: [g.u, g.v], world: L2W(g.u, g.v) }));
report.city.keyBuildings = C.BUILDINGS.map((b) => ({ id: b.id, label: b.label, local: [b.u, b.v], world: L2W(b.u, b.v), size: [b.w, b.d], face: b.face, floors: b.floors }));
// Terrace slope on the temple rise.
const rise = sq('temple_rise').pts;
const hA = H(...L2W(...rise[0])), hB = H(...L2W(...rise[rise.length - 1]));
report.city.templeRise = { climb: +(hB - hA).toFixed(1), length: Math.round(len(rise)), grade: +((hB - hA) / len(rise)).toFixed(2) };

// ---------------------------------------------------------------------------------------
// PNG + SVG output
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => {
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8);
    b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])) >>> 0, 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * Math.max(0, Math.min(1, t)));
function shade(x0, z0, x1, z1, px) {
  const w = Math.round((x1 - x0) / px), h = Math.round((z1 - z0) / px);
  const hs = new Float32Array((w + 1) * (h + 1));
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) hs[j * (w + 1) + i] = H(x0 + i * px, z0 + j * px);
  const rgb = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) * px, z = z0 + (j + 0.5) * px;
    const y = hs[j * (w + 1) + i];
    const dx = (hs[j * (w + 1) + i + 1] - y) / px, dz = (hs[(j + 1) * (w + 1) + i] - y) / px;
    const light = Math.max(0.35, Math.min(1.25, 1 - dx * 0.9 - dz * 0.6));
    let c = mix([116, 150, 82], [150, 160, 96], (y - 0) / 10);
    c = mix(c, [140, 128, 108], (y - 12) / 14);
    c = mix(c, [235, 238, 242], (y - 40) / 12);
    c = c.map((v) => Math.max(0, Math.min(255, v * light)));
    if (T.riverDistance(x, z) < 0 || P.LAKES.some((L) => Math.hypot(x - L.center.x, z - L.center.z) < L.radius * 0.95) || lineDist(P.CREEK.points, x, z) < P.CREEK.width / 2) c = [70, 120, 170];
    if (T.isLavaXZ(x, z, 0)) c = [220, 90, 30];
    const k = (j * w + i) * 3;
    rgb[k] = c[0]; rgb[k + 1] = c[1]; rgb[k + 2] = c[2];
  }
  return { w, h, data: png(w, h, rgb).toString('base64') };
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const path = (pts, close = false) => 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L') + (close ? ' Z' : '');

// Region map (world coords).
{
  const px = 4, S = 0.5; // 4 m per image pixel, 0.5 svg px per metre
  const img = shade(-P.HALF, -P.HALF, P.HALF, P.HALF, px);
  const X = (x) => (x + P.HALF) * S, Z = (z) => (z + P.HALF) * S;
  const map = (pts) => pts.map(([x, z]) => [X(x), Z(z)]);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${P.HALF * 2 * S}" height="${P.HALF * 2 * S + 190}" font-family="Segoe UI, sans-serif">`;
  s += `<rect width="100%" height="100%" fill="#f4efe4"/><image href="data:image/png;base64,${img.data}" width="${P.HALF * 2 * S}" height="${P.HALF * 2 * S}"/>`;
  for (const f of P.FORESTS) s += `<path d="${path(map(f.pts), true)}" fill="#2f5a2a" fill-opacity="0.35" stroke="#2f5a2a" stroke-opacity="0.6"/><text x="${X(f.pts.reduce((a, p) => a + p[0], 0) / f.pts.length)}" y="${Z(f.pts.reduce((a, p) => a + p[1], 0) / f.pts.length)}" font-size="10" font-style="italic" text-anchor="middle" fill="#eef5e6">${esc(f.name)}</text>`;
  for (const r of P.ROADS) s += `<path d="${path(map(r.points))}" fill="none" stroke="${r.kind === 'road' ? '#7a5a36' : '#9c8460'}" stroke-width="${r.kind === 'road' ? 2.6 : 1.6}" stroke-dasharray="${r.kind === 'road' ? '' : '4 3'}"/>`;
  for (const b of P.BRIDGES) if (b.kind !== 'none') s += `<path d="${path(map([b.a, b.b]))}" stroke="#3a3330" stroke-width="4"/>`;
  s += `<path d="${path(map(wallPts.map(([u, v]) => L2W(u, v))), true)}" fill="#c9b79a" stroke="#4a4038" stroke-width="2"/>`;
  for (const R of P.REGIONS) {
    if (R.interior) continue;
    s += `<circle cx="${X(R.center.x)}" cy="${Z(R.center.z)}" r="${R.r * S}" fill="none" stroke="${R.safe ? '#2f6fb0' : '#a0402a'}" stroke-width="1" stroke-dasharray="3 3" opacity="0.8"/>`;
    s += `<text x="${X(R.center.x)}" y="${Z(R.center.z) - R.r * S - 3}" font-size="11" text-anchor="middle" fill="#1e1a16" stroke="#f4efe4" stroke-width="3" paint-order="stroke">${esc(R.icon + ' ' + R.name)}</text>`;
  }
  for (const p of P.POIS) s += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="2.5" fill="#1e1a16"/><text x="${X(p.x) + 4}" y="${Z(p.z) + 3}" font-size="8" fill="#1e1a16" stroke="#f4efe4" stroke-width="2.5" paint-order="stroke">${esc(p.id)}</text>`;
  // Grid every 100 m.
  for (let g = -P.HALF; g <= P.HALF; g += 100) {
    s += `<line x1="${X(g)}" y1="0" x2="${X(g)}" y2="${P.HALF * 2 * S}" stroke="#000" stroke-opacity="0.08"/><line y1="${Z(g)}" x1="0" y2="${Z(g)}" x2="${P.HALF * 2 * S}" stroke="#000" stroke-opacity="0.08"/>`;
    if (g % 200 === 0) s += `<text x="${X(g) + 2}" y="10" font-size="8" fill="#555">${g}</text><text x="2" y="${Z(g) - 2}" font-size="8" fill="#555">${g}</text>`;
  }
  let y = P.HALF * 2 * S + 18;
  s += `<text x="10" y="${y}" font-size="13" font-weight="600">Маршруты (ходьба ${WALK} м/с · бег ${RUN} м/с · NPC ${NPC_WALK} м/с)</text>`;
  for (const r of report.routes) { y += 15; s += `<text x="10" y="${y}" font-size="11">${esc(r.name)}: ${r.metres} м · пешком ${r.walk_min} мин · бегом ${r.run_min} мин</text>`; }
  s += '</svg>';
  writeFileSync(join(OUT, 'region.svg'), s);
}

// City map (local coords).
{
  const pad = 34, u0 = -112 - pad, v0 = -110 - pad, u1 = 106 + pad, v1 = 110 + pad, S = 3.2;
  const [wx0, wz0] = L2W(u0, v0), [wx1, wz1] = L2W(u1, v1);
  const img = shade(wx0, wz0, wx1, wz1, 0.8);
  const X = (u) => (u - u0) * S, Z = (v) => (v - v0) * S;
  const map = (pts) => pts.map(([u, v]) => [X(u), Z(v)]);
  const W = (u1 - u0) * S, Hh = (v1 - v0) * S;
  const KC = { public: '#c0392b', guild: '#1f5fa8', tavern: '#a85a1f', inn: '#8a5a2a', shop: '#e07a3a', workshop: '#6a5a4a', warehouse: '#9a8a70', stable: '#b89a60', temple: '#5a6ab0', house: '#efe3c8', military: '#55606a' };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh + 170}" font-family="Segoe UI, sans-serif">`;
  s += `<rect width="100%" height="100%" fill="#f4efe4"/><image href="data:image/png;base64,${img.data}" width="${W}" height="${Hh}" opacity="0.55"/>`;
  for (const d of C.DISTRICTS) s += `<path d="${path(map(d.pts), true)}" fill="${d.color}" fill-opacity="0.16" stroke="${d.color}" stroke-opacity="0.5" stroke-dasharray="6 4"/>`;
  for (const a of C.AREAS) s += `<path d="${path(map(a.pts), true)}" fill="#8fae6a" fill-opacity="0.6" stroke="#5a7a40"/>`;
  s += `<path d="${path(map([...ring, ring[0]]))}" fill="none" stroke="#cbbfa8" stroke-width="${C.RING.width * S}" stroke-linejoin="round"/>`;
  for (const st of C.STREETS) s += `<path d="${path(map(LINE[st.id]))}" fill="none" stroke="${st.kind === 'main' ? '#b9ad96' : st.kind === 'secondary' ? '#c6bba6' : '#d2c8b4'}" stroke-width="${st.width * S}" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const q of C.SQUARES) s += `<path d="${path(map(q.pts), true)}" fill="#ddd2bd" stroke="#a89c86"/>`;
  s += `<path d="${path(map(wallLoop))}" fill="none" stroke="#5a5048" stroke-width="${C.WALL.thickness * S}" stroke-linejoin="round"/>`;
  for (const n of C.WALL.nodes) {
    if (n.gate) s += `<rect x="${X(n.u) - 7 * S}" y="${Z(n.v) - 7 * S}" width="${14 * S}" height="${14 * S}" fill="#3a3330" opacity="0.85"/><rect x="${X(n.u) - 3.5 * S}" y="${Z(n.v) - 3.5 * S}" width="${7 * S}" height="${7 * S}" fill="#ddd2bd"/>`;
    else s += `<rect x="${X(n.u) - (n.big ? 4.5 : 3.2) * S}" y="${Z(n.v) - (n.big ? 4.5 : 3.2) * S}" width="${(n.big ? 9 : 6.4) * S}" height="${(n.big ? 9 : 6.4) * S}" fill="#4a4038"/>`;
  }
  for (const p of placed) {
    // Built outline (roof overhang, door zone) dashed under the walls; annexes solid.
    s += `<path d="${path(map(p.E[0].corners), true)}" fill="none" stroke="#3a3330" stroke-opacity="0.45" stroke-width="0.6" stroke-dasharray="2 2"/>`;
    for (const A of p.E.slice(1)) s += `<path d="${path(map(A.corners), true)}" fill="${KC[p.kind] || '#efe3c8'}" stroke="#3a3330" stroke-width="0.8"/>`;
    s += `<path d="${path(map(p.R.corners), true)}" fill="${KC[p.kind] || '#efe3c8'}" stroke="#3a3330" stroke-width="${p.key ? 1.6 : 0.8}"/>`;
    // Front door tick.
    const fx = p.u + Math.sin(p.R.rot) * p.d / 2, fz = p.v + Math.cos(p.R.rot) * p.d / 2;
    s += `<circle cx="${X(fx)}" cy="${Z(fz)}" r="1.6" fill="#3a3330"/>`;
  }
  C.BUILDINGS.forEach((b, i) => { s += `<text x="${X(b.u)}" y="${Z(b.v) + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#fff" stroke="#1e1a16" stroke-width="3" paint-order="stroke">${i + 1}</text>`; });
  for (const q of C.SQUARES) {
    const cu = q.pts.reduce((a, p) => a + p[0], 0) / q.pts.length, cv = q.pts.reduce((a, p) => a + p[1], 0) / q.pts.length;
    if (q.id.endsWith('gate_place')) continue;
    s += `<text x="${X(cu)}" y="${Z(cv)}" font-size="10" font-style="italic" text-anchor="middle" fill="#3a3330">${esc(q.name)}</text>`;
  }
  for (const d of C.DISTRICTS) {
    const cu = d.pts.reduce((a, p) => a + p[0], 0) / d.pts.length, cv = d.pts.reduce((a, p) => a + p[1], 0) / d.pts.length;
    s += `<text x="${X(cu)}" y="${Z(cv) - 14}" font-size="13" font-weight="700" text-anchor="middle" fill="${d.color}" stroke="#f4efe4" stroke-width="3" paint-order="stroke">${esc(d.name)}</text>`;
  }
  for (const l of C.LANDMARKS) s += `<text x="${X(l.u)}" y="${Z(l.v) - 8}" font-size="14" text-anchor="middle" fill="#d4a017" stroke="#1e1a16" stroke-width="1">★</text>`;
  for (const n of C.WALL.nodes.filter((x) => x.gate)) s += `<text x="${X(n.u)}" y="${Z(n.v) + (n.gate === 'north' ? -26 : n.gate === 'south' ? 34 : 4)}" dx="${n.gate === 'east' ? 30 : n.gate === 'west' ? -30 : 0}" font-size="11" font-weight="700" text-anchor="middle">${esc(n.name)}</text>`;
  // Scale bar.
  s += `<line x1="20" y1="${Hh - 20}" x2="${20 + 50 * S}" y2="${Hh - 20}" stroke="#1e1a16" stroke-width="3"/><text x="20" y="${Hh - 26}" font-size="11">50 м</text>`;
  let y = Hh + 18;
  const lines = [''];
  C.BUILDINGS.forEach((b, i) => { const t = `${i + 1} ${b.label}`; if ((lines[lines.length - 1] + t).length > 120) lines.push(''); lines[lines.length - 1] += (lines[lines.length - 1] ? ' · ' : '') + t; });
  for (const l of lines) { s += `<text x="10" y="${y}" font-size="12">${esc(l)}</text>`; y += 16; }
  y += 6;
  let x = 10;
  for (const [k, c] of Object.entries(KC)) { s += `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="${c}" stroke="#3a3330"/><text x="${x + 16}" y="${y}" font-size="11">${k}</text>`; x += 90; }
  y += 20; s += `<text x="10" y="${y}" font-size="11">Сетка не показана; ● — входная дверь; ★ — ориентир. Масштаб: ${S} px = 1 м. Генерированные участки — проверка вместимости, не окончательная застройка.</text>`;
  s += '</svg>';
  writeFileSync(join(OUT, 'axel.svg'), s);
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ routes: report.routes, wall: report.city.wall, buildings: report.city.buildings, streets: report.city.streets, templeRise: report.city.templeRise, gateToSquare: report.city.gateToSquare }, null, 1));
console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : 'no issues');
