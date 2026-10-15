import { AXEL, BUILDINGS, ENVELOPE, FACE_ROT, STREETS, streetLine } from './AxelPlan.js';
import { LOTS } from './build/AxelLots.js';

/**
 * Geometry check of Axel's buildings against the editor layout (placements.json `overrides`).
 * Pure data (no scene): used by the map editor ("Проверить дома") and tools/layout_check.mjs.
 *
 * Every building is an oriented envelope (AxelPlan.ENVELOPE: walls + roof overhang + what stands
 * in front of the door) plus the annex rects of the key buildings. Reported:
 *   overlaps — pairs of buildings whose envelopes overlap (houses inside each other);
 *   onStreet — buildings that reach into a street band deeper than the generated baseline does
 *              (the generator leaves the plan 0.2 m – 1.4 m of front furniture over the kerb).
 * Only problems the layout adds are reported (compared with the untouched generated plan).
 */
const OVERLAP_MIN = 0.05; // m of penetration along every axis
const STREET_SLACK = 0.5; // m deeper than the baseline

function build(overrides) {
  const OV = overrides || {};
  const items = [];
  const add = (id, kind, x, z, rot, w, d, annex = []) => {
    const o = OV[id];
    if (o?.deleted) return;
    const X = o?.x ?? x, Z = o?.z ?? z, R = o?.rot ?? rot;
    const front = ENVELOPE.front[kind] ?? 1;
    const rects = [{ cx: 0, cz: (front - ENVELOPE.back) / 2, hw: w / 2 + ENVELOPE.side, hd: (d + front + ENVELOPE.back) / 2 }];
    for (const a of annex) rects.push({ cx: a.x, cz: a.z, hw: a.w / 2, hd: a.d / 2 });
    items.push({ id, x: X, z: Z, rot: R, rects, moved: o ? Math.hypot(X - x, Z - z) : 0 });
  };
  for (const l of LOTS) add('axel_' + l.id, l.kind, AXEL.x + l.u, AXEL.z + l.v, l.rot, l.w, l.d);
  for (const b of BUILDINGS) add(b.id, b.kind, AXEL.x + b.u, AXEL.z + b.v, FACE_ROT[b.face], b.w, b.d, b.annex || []);
  return items;
}

/** World corners of a rect of an item (local x axis = (cos, -sin), local z axis = (sin, cos)). */
function corners(it, r) {
  const c = Math.cos(it.rot), s = Math.sin(it.rot);
  const P = (lx, lz) => [it.x + lx * c + lz * s, it.z - lx * s + lz * c];
  return [P(r.cx - r.hw, r.cz - r.hd), P(r.cx + r.hw, r.cz - r.hd), P(r.cx + r.hw, r.cz + r.hd), P(r.cx - r.hw, r.cz + r.hd)];
}
const edgeNormals = (q) => [[q[1][0] - q[0][0], q[1][1] - q[0][1]], [q[3][0] - q[0][0], q[3][1] - q[0][1]]].map(([x, z]) => { const L = Math.hypot(x, z) || 1; return [-z / L, x / L]; });
function rectsOverlap(A, B) {
  for (const ax of [...edgeNormals(A), ...edgeNormals(B)]) {
    const pa = A.map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = B.map((p) => p[0] * ax[0] + p[1] * ax[1]);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= OVERLAP_MIN) return false;
  }
  return true;
}
const segDist = (px, pz, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
};

let LINES = null;
function analyse(overrides) {
  const items = build(overrides);
  const overlaps = new Set();
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 45) continue;
    if (a.rects.some((ra) => b.rects.some((rb) => rectsOverlap(corners(a, ra), corners(b, rb))))) overlaps.add(a.id + '|' + b.id);
  }
  LINES ||= STREETS.map((s) => ({ id: s.id, name: s.name, half: s.width / 2, pts: streetLine(s) }));
  const depth = new Map(); // 'id|street' -> m into the band
  for (const it of items) {
    const q = corners(it, it.rects[0]);
    const samples = [];
    for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; for (const t of [0, 0.25, 0.5, 0.75]) samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    for (const L of LINES) {
      let best = Infinity;
      for (const [sx, sz] of samples) for (let i = 0; i < L.pts.length - 1; i++) best = Math.min(best, segDist(sx - AXEL.x, sz - AXEL.z, L.pts[i], L.pts[i + 1]));
      if (best < L.half - 0.1) depth.set(it.id + '|' + L.id, L.half - best);
    }
  }
  return { items, overlaps, depth };
}

let BASE = null;

/** { overlaps: [[idA, idB]], onStreet: [{ id, street, name, depth }], moved: n } for a layout's overrides. */
export function checkAxelLayout(overrides) {
  BASE ||= analyse({});
  const cur = analyse(overrides);
  const overlaps = [...cur.overlaps].filter((k) => !BASE.overlaps.has(k)).map((k) => k.split('|'));
  const onStreet = [];
  for (const [k, d] of cur.depth) {
    if (d <= (BASE.depth.get(k) ?? 0) + STREET_SLACK) continue;
    const [id, street] = k.split('|');
    onStreet.push({ id, street, name: LINES.find((l) => l.id === street)?.name ?? street, depth: Math.round(d * 10) / 10 });
  }
  onStreet.sort((a, b) => b.depth - a.depth);
  return { overlaps, onStreet, moved: cur.items.filter((i) => i.moved > 0.01).length };
}
