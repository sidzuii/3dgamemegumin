import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, GEOMETRY as G } from './Kit.js';
import { ORIGIN } from '../AinstreyPlan.js';

/**
 * The buildings of Ainstrey (docs/ainstrey/TZ_capital.md): light procedural houses for the ~900 lots of the plan and the massing of
 * the key buildings. A house is a body, a stone plinth, a roof and a door (always there: the silhouette); the windows, shutters,
 * timber, awnings, signs and chimneys are `detail` parts that the quality preset culls beyond its detail distance. Only the body
 * collides. The front of a house is local +z (the plan's lot rectangle: x along the street).
 */
const GABLE = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
})();
const PYRAMID = (() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; })();
const AWNING = [0xb8453a, 0x3a6a8a, 0x4a7a4a, 0xc89a3a, 0xd8cfb8, 0x7a4a6a];
const SHUTTER = [0x4a6a4a, 0x7a4a34, 0x3a5a7a, 0x5a4a3a];

export const toW = (u, v) => [ORIGIN.x + u, ORIGIN.z + v];

/** Heights of the ground under a rectangle: [min, max, centre, front-centre]. */
export function groundUnder(W, x, z, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => W.heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
  let lo = Infinity, hi = -Infinity;
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0], [0, d / 2], [0, -d / 2]]) { const h = at(lx, lz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return [lo, hi, at(0, 0), at(0, d / 2 + 1.2)];
}

/**
 * One house of the plan. lot: { u, v, w, d, rot, floors, wall, roofColor, roof: 'gable'|'hip'|'flat', shop, kind, seed }.
 * Returns { frame, door (world position in front of the door), top }.
 */
export function lightHouse(W, lot, opt = {}) {
  const rng = mulberry32(lot.seed || 1);
  const [x, z] = toW(lot.u, lot.v);
  const { w, d, rot } = lot;
  const [lo, hi] = groundUnder(W, x, z, w, d, rot);
  const warehouse = lot.kind === 'warehouse', shed = lot.kind === 'shed';
  const floorH = warehouse ? 4.6 : shed ? 3.0 : 3.15;
  const yBase = lo - 0.5;
  const yF = hi + 0.2; // the floor of the ground storey (the door sill)
  const lowPart = yF - yBase;
  const H = lowPart + lot.floors * floorH + (lot.shop ? 0.5 : 0);
  const F = new Frame(W, x, yBase, z, rot);
  // body + plinth + cornice
  F.box(w, H, d, 0, 0, 0, 'plaster', { tint: lot.wall });
  F.box(w + 0.3, lowPart + 0.85, d + 0.3, 0, 0, 0, 'stone', { tint: opt.plinth ?? 0xb4aa94, collide: false });
  if (!shed) F.box(w + 0.5, 0.32, d + 0.5, 0, H - 0.32, 0, 'stone', { tint: opt.cornice ?? 0xcfc4a8, collide: false });
  // roof
  const kind = lot.roof;
  let top = H;
  if (kind === 'flat') {
    F.box(w + 0.2, 0.7, d + 0.2, 0, H, 0, 'stone', { tint: 0xc4b89c, collide: false });
    F.box(w - 0.8, 0.1, d - 0.8, 0, H + 0.62, 0, 'roof', { tint: lot.roofColor, collide: false });
    top = H + 0.7;
  } else if (kind === 'hip') {
    const rise = Math.min(w, d) * 0.5 + 0.8;
    F.put(PYRAMID, w + 1.0, rise, d + 1.0, 0, H, 0, 'roof', { tint: lot.roofColor, collide: false });
    top = H + rise;
  } else {
    const along = w >= d; // the ridge runs along the longer side
    const span = (along ? d : w) + 1.0, len = (along ? w : d) + 1.0;
    const rise = span * (warehouse ? 0.3 : 0.4);
    F.put(GABLE, span, rise, len, 0, H, 0, 'roof', { tint: lot.roofColor, collide: false, ry: along ? Math.PI / 2 : 0 });
    // gable walls above the cornice (the triangle of the plaster under the roof)
    F.put(GABLE, span - 0.9, rise - 0.35, len - 0.9, 0, H, 0, 'plaster', { tint: lot.wall, collide: false, ry: along ? Math.PI / 2 : 0, castShadow: false });
    top = H + rise;
    if (!shed && !warehouse && rng() < 0.5) {
      const cx = (rng() - 0.5) * (along ? w * 0.6 : 0), cz = (rng() - 0.5) * (along ? 0 : d * 0.6);
      F.box(0.9, 2.1, 0.9, cx, H + rise * 0.35, cz, 'stone', { tint: 0xa89a84, collide: false });
    }
  }
  // door
  const sill = yF - yBase;
  const frontZ = d / 2;
  if (warehouse) {
    const n = Math.max(2, Math.round(w / 12));
    for (let k = 0; k < n; k++) {
      const dx = -w / 2 + (k + 0.5) * (w / n);
      F.box(3.0, 3.6, 0.2, dx, sill, frontZ + 0.02, 'door', { tint: 0x5a4a38, collide: false });
      F.box(3.5, 0.35, 0.35, dx, sill + 3.6, frontZ + 0.05, 'stone', { collide: false });
    }
  } else if (!shed) {
    F.box(1.6, 2.6, 0.2, 0, sill, frontZ + 0.02, 'door', { tint: lot.shop ? 0x4a3a2c : 0x5a3c28, collide: false });
    F.box(2.2, 0.32, 0.32, 0, sill + 2.6, frontZ + 0.05, 'stone', { collide: false });
    F.box(2.6, 0.3, 1.0, 0, sill - 0.3, frontZ + 0.5, 'stone', { tint: 0xb4aa94, collide: false });
  } else F.box(1.3, 2.2, 0.15, 0, sill, frontZ + 0.02, 'door', { tint: 0x4a3a2c, collide: false });
  // windows (detail): front and back, every storey
  const win = (wx, wy, wz, ry = 0) => {
    F.box(0.95, 1.4, 0.16, wx, wy, wz, 'window', { collide: false, castShadow: false, detail: true, ry });
    F.box(1.3, 0.16, 0.24, wx, wy + 1.4, wz, 'stone', { collide: false, castShadow: false, detail: true, ry, tint: 0xcfc4a8 });
    F.box(1.2, 0.12, 0.3, wx, wy - 0.1, wz, 'stone', { collide: false, castShadow: false, detail: true, ry, tint: 0xb4aa94 });
  };
  const cols = Math.max(1, Math.floor((w - 1.6) / 3.4));
  const shut = SHUTTER[Math.floor(rng() * SHUTTER.length)];
  for (let f = 0; f < lot.floors; f++) {
    const wy = sill + f * floorH + (f === 0 && warehouse ? 2.6 : 1.1);
    for (let k = 0; k < cols; k++) {
      const wx = -w / 2 + (k + 0.5) * (w / cols);
      const skip = f === 0 && !warehouse && Math.abs(wx) < 1.7;
      if (!skip && !(warehouse && f === 0)) {
        win(wx, wy, frontZ + 0.02);
        if (!lot.shop || f > 0) for (const s of [-1, 1]) F.box(0.42, 1.4, 0.08, wx + s * 0.72, wy, frontZ + 0.04, 'wood', { tint: shut, collide: false, castShadow: false, detail: true });
      }
      if (!(warehouse && f === 0) && (k % 2 === 0 || cols < 3)) win(wx, wy, -frontZ - 0.02, Math.PI);
    }
  }
  // timber, jetty beams, awning, sign, lantern (detail)
  if (!warehouse && !shed) {
    if (lot.district === 'old' || lot.district === 'posad') {
      for (let f = 1; f <= lot.floors; f++) F.box(w + 0.1, 0.2, 0.22, 0, sill + f * floorH - 0.18, frontZ + 0.05, 'timber', { collide: false, detail: true, castShadow: false });
      for (const s of [-1, 1]) F.box(0.22, H - sill, 0.22, s * (w / 2 - 0.05), sill, frontZ + 0.05, 'timber', { collide: false, detail: true, castShadow: false });
    }
    if (lot.shop) {
      const c = AWNING[Math.floor(rng() * AWNING.length)];
      F.box(Math.min(w - 1, 6), 0.07, 1.7, 0, sill + 3.0, frontZ + 0.95, 'cloth', { tint: c, rx: 0.3, collide: false, detail: true });
      F.box(2.4, 0.55, 0.12, w * 0.28, sill + 3.55, frontZ + 0.3, 'wood', { tint: 0x5a4030, collide: false, detail: true });
      F.box(0.2, 0.3, 0.2, -w * 0.3, sill + 2.7, frontZ + 0.25, 'lampGlass', { collide: false, detail: true, castShadow: false });
    }
  }
  const door = F.at(0, sill, frontZ + 1.6);
  return { frame: F, door, top, sill: yF, size: [w, d] };
}

/** The tall tower of a public building: a masonry shaft with a clock or a bell and a pyramidal roof. */
function tower(F, lx, lz, s, h, o = {}) {
  F.box(s, h, s, lx, 0, lz, 'plaster', { tint: o.wall ?? 0xcfc4a8 });
  F.box(s + 0.7, 0.5, s + 0.7, lx, h - 0.5, lz, 'stone', { tint: 0xcfc4a8, collide: false });
  F.put(PYRAMID, s + 1.2, s * 1.4, s + 1.2, lx, h, lz, 'roof', { tint: o.roof ?? 0x6a7c92, collide: false });
  if (o.clock) for (const [dx, dz, ry] of [[0, s / 2 + 0.06, 0], [0, -s / 2 - 0.06, Math.PI], [s / 2 + 0.06, 0, Math.PI / 2], [-s / 2 - 0.06, 0, -Math.PI / 2]]) F.cyl(1.0, 0.1, lx + dx, h - 3.2, lz + dz, 'lampGlass', { collide: false, castShadow: false, rx: Math.PI / 2, ry, tint: 0xf4efe0 });
}

/**
 * A key building of the plan: a bigger light house with the features of its kind (towers, dome, colonnade, arcade).
 * k: { u, v, w, d, rot, floors, kind, tower, dome }; returns { frame, door, top }.
 */
export function keyBuilding(W, k, seedBase = 7) {
  const lot = { ...k, wall: PAL[k.kind]?.wall ?? 0xd8ccb0, roofColor: PAL[k.kind]?.roof ?? 0x6a7c92, roof: k.kind === 'academy' || k.kind === 'theatre' ? 'gable' : k.kind === 'arcade' ? 'flat' : 'gable', shop: false, district: k.district, seed: seedBase + k.id.length * 31 };
  const r = lightHouse(W, lot, { plinth: 0xb4aa94, cornice: 0xd8ccb0 });
  const F = r.frame, [w, d] = r.size;
  const H = r.top;
  if (k.tower) tower(F, w / 2 - 3.2, d / 2 - 3.5, 5.2, H + 7, { clock: k.kind === 'guild', roof: k.kind === 'archive' ? 0x5d7189 : 0x6a7c92 });
  if (k.dome) {
    F.cyl(5.4, 3.5, 0, H, 0, 'stone', { seg: 16, tint: 0xcfc4a8, collide: false });
    F.sphere(5.6, 0, H + 3.4, 0, 'roof', { tint: 0x5c8b80, collide: false, sy: 0.85 });
    F.cyl(0.3, 3.2, 0, H + 8.0, 0, 'metal', { seg: 8, collide: false });
  }
  if (k.kind === 'theatre' || k.kind === 'guild' || k.kind === 'public' || k.kind === 'council' || k.kind === 'archive') {
    // a colonnade of the front: columns carrying a stone beam
    const n = Math.max(4, Math.round(w / 6));
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + 1.5 + i * ((w - 3) / (n - 1));
      F.cyl(0.42, 4.4, cx, r.sill - F.origin.y, d / 2 + 1.6, 'stone', { seg: 12, tint: 0xd8ccb0, collide: false });
    }
    F.box(w - 0.5, 0.6, 2.6, 0, r.sill - F.origin.y + 4.4, d / 2 + 1.1, 'stone', { tint: 0xd8ccb0, collide: false });
    // wide steps up to the portico
    for (let i = 0; i < 3; i++) F.box(w * 0.5 + i * 0.8, 0.2, 1.0, 0, r.sill - F.origin.y - 0.55 + i * 0.2, d / 2 + 3.2 - i * 1.0, 'stone', { tint: 0xcfc4a8, collide: false });
  }
  if (k.kind === 'arcade') {
    const n = Math.round(w / 4.2);
    for (let i = 0; i < n; i++) F.box(0.7, 3.4, 0.7, -w / 2 + 0.5 + i * ((w - 1) / (n - 1)), r.sill - F.origin.y, d / 2 + 1.4, 'stone', { tint: 0xd8ccb0, collide: false });
  }
  return r;
}
const PAL = {
  guild: { wall: 0xc9bda4, roof: 0x5d7189 }, public: { wall: 0xc9bda4, roof: 0x6a7c92 }, archive: { wall: 0xd0c4aa, roof: 0x5d7189 }, academy: { wall: 0xe3d6bb, roof: 0x4f6888 },
  theatre: { wall: 0xe3d6bb, roof: 0xa9664c }, inn: { wall: 0xe3d6bb, roof: 0xa9664c }, port: { wall: 0xc9bda4, roof: 0x6a7c92 }, pump: { wall: 0xb09a78, roof: 0x5c8b80 },
  council: { wall: 0xe3d6bb, roof: 0x5c8b80 }, market: { wall: 0xe3d6bb, roof: 0xa9664c }, cathedral: { wall: 0xcfc4a8, roof: 0x6a7c92 }, arcade: { wall: 0xd8ccb0, roof: 0x6a7c92 },
};
export { G };
