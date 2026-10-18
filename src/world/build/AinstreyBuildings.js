import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, GEOMETRY as G, heroKit } from './Kit.js';
import { ORIGIN } from '../AinstreyPlan.js';
import { kitHouse, keySkin } from './AinstreyFacade.js';

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
const CONE = (() => { const g = new THREE.ConeGeometry(1, 1, 12); g.translate(0, 0.5, 0); return g; })();
const AWNING = [0xb8453a, 0x3a6a8a, 0x4a7a4a, 0xc89a3a, 0xd8cfb8, 0x7a4a6a];
const SHUTTER = [0x4a6a4a, 0x7a4a34, 0x3a5a7a, 0x5a4a3a];

/**
 * A box (w x h x d, base at y 0) whose sides carry facade UVs: u counts window bays (a tile = 4 bays), v counts storeys from
 * the sill (a tile = 2 storeys); the top is mapped to a plain plaster corner of the tile.
 */
const _fbCache = new Map();
function facadeBox(w, h, d, sill, floorH, uo = 0, vo = 0) {
  const key = [w, h, d, sill, floorH, uo, vo].map((v) => v.toFixed(2)).join('|');
  if (_fbCache.has(key)) return _fbCache.get(key);
  const pos = [], nor = [], uv = [];
  const quad = (a, b, c, e, n, uvs) => { for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [e, uvs[3]]]) { pos.push(...p); nor.push(...n); uv.push(...t); } };
  // the tile (World makeFacadeTextures) is 8 bays x 4 storeys: (uo, vo) = the bay and the storey row this house starts at
  const V = (y) => vo + (y - sill) / (4 * floorH);
  let k = 0;
  const side = (len, at, n) => { // at(s, y) -> point; s from -len/2 to len/2 left to right seen from outside
    const nb = Math.max(1, Math.round(len / 2.4)), u0 = uo + (k++ * 3) / 8, u1 = u0 + nb / 8;
    quad(at(-len / 2, 0), at(len / 2, 0), at(len / 2, h), at(-len / 2, h), n, [[u0, V(0)], [u1, V(0)], [u1, V(h)], [u0, V(h)]]);
  };
  const hw = w / 2, hd = d / 2;
  side(w, (s, y) => [s, y, hd], [0, 0, 1]);
  side(w, (s, y) => [-s, y, -hd], [0, 0, -1]);
  side(d, (s, y) => [hw, y, -s], [1, 0, 0]);
  side(d, (s, y) => [-hw, y, s], [-1, 0, 0]);
  const t = [0.01, 0.01];
  quad([-hw, h, hd], [hw, h, hd], [hw, h, -hd], [-hw, h, -hd], [0, 1, 0], [t, t, t, t]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  _fbCache.set(key, g);
  return g;
}

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
  const I = opt.interior; // { floorH, doorW, doorH, doorX }: a walk-in ground storey (hollow, with a doorway)
  const yF = hi + 0.2 + (opt.podium || 0); // the floor of the ground storey (the door sill)
  const lowPart = yF - yBase;
  const gfH = I ? I.floorH : floorH;
  const H = lowPart + (I ? gfH + (lot.floors - 1) * floorH : lot.floors * floorH) + (lot.shop ? 0.5 : 0);
  const F = new Frame(W, x, yBase, z, rot);
  // the village kit's plaster (planar UVs) when it is loaded: the far proxy matches the near kit model; tint half way to white
  const PL = opt.palace ? 'stone' : W.mats.kit_village_MI_Plaster ? 'kit_village_MI_Plaster' : 'plaster'; // a palace is dressed stone
  const wallT = PL === 'plaster' ? lot.wall : new THREE.Color(lot.wall ?? 0xe8dcc4).lerp(new THREE.Color(0xffffff), 0.45).getHex();
  const storeyY = (f) => lowPart + (f === 0 ? 0 : gfH + (f - 1) * floorH);
  // A plain house of the big city: the near model is the village kit, built on demand round the camera (CityStream, AinstreyFacade
  // kitHouse); here its collision and a light far proxy that is always drawn: it sits a little inside the kit walls and under the
  // kit roof, so near the camera it simply hides inside the kit model (no swap, big static batches, few draw calls).
  const streamed = !!W.stream && !I && !opt.noStream;
  if (streamed) {
    F.box(w, H, d, 0, 0, 0, 'plaster', { collideOnly: true });
    const c = new THREE.Vector3(x, 0, z);
    if (W._D) c.applyMatrix4(W._D);
    const rec = { x, z, yBase, rot, w, d, floors: lot.floors, floorH, gfH, lowPart, H, roof: lot.roof, roofColor: lot.roofColor, wall: lot.wall, shop: !!lot.shop, kind: lot.kind, district: lot.district, seed: lot.seed || 1, simple: !!lot.simple };
    W.stream.add(c.x, c.z, (w2) => kitHouse(w2, rec), W._D ? W._D.clone() : null);
    const o = { collide: false, castShadow: false };
    const iw = w - 0.4, id = d - 0.4;
    // the body wears the facade tile (windows in bays of ~2.4 m, two storeys a tile): see World makeFacadeTextures
    const FT = W.mats.facade ? 'facade' : PL;
    if (FT === 'facade') F.put(facadeBox(iw, H, id, lowPart, floorH, ((lot.seed || 1) % 8) / 8, ((Math.floor((lot.seed || 1) / 8) % 4) / 4)), 1, 1, 1, 0, 0, 0, FT, { ...o, keepUV: true, tint: new THREE.Color(lot.wall ?? 0xe8dcc4).lerp(new THREE.Color(0xffffff), 0.1).getHex() });
    else F.box(iw, H, id, 0, 0, 0, PL, { ...o, tint: wallT });
    F.box(w + 0.1, lowPart, d + 0.1, 0, 0, 0, PL, { ...o, tint: 0xb4aa94 });
    let top = H;
    if (lot.roof === 'flat') F.box(iw, 0.6, id, 0, H, 0, PL, { ...o, tint: 0xc4b89c });
    else {
      const along = w >= d * 0.87; // as the kit roof (kitHouse); its pitch is steeper, so this prism stays under it
      const span = (along ? d : w) - 0.4, len = (along ? w : d) - 0.4, rise = span * (warehouse ? 0.3 : 0.4);
      F.put(GABLE, span, rise, len, 0, H, 0, 'roof', { ...o, tint: lot.roofColor, ry: along ? Math.PI / 2 : 0 });
      top = H + rise;
    }
    if (lot.shop) {
      const cl = AWNING[Math.floor(rng() * AWNING.length)];
      F.box(Math.min(w - 1, 6), 0.07, 1.7, 0, lowPart + 3.0, d / 2 + 0.95, 'cloth', { tint: cl, rx: 0.3, collide: false, detail: true });
      F.box(2.4, 0.55, 0.12, w * 0.28, lowPart + 3.55, d / 2 + 0.3, 'wood', { tint: 0x5a4030, collide: false, detail: true });
    }
    return { frame: F, door: F.at(0, lowPart, d / 2 + 1.6), top, sill: yF, size: [w, d], localSill: lowPart, base: yBase };
  }
  const ST = 'stone', DR = 'door';
  const prevLod = W.lodMode;
  // body + plinth + cornice
  if (I) {
    // a solid podium up to the floor, the walls of the ground storey round the hall, a ceiling, the solid upper storeys above
    const t = 0.6, top = lowPart + gfH, dX = I.doorX ?? 0, dW = I.doorW ?? 3.4, dH = I.doorH ?? 3.4;
    const pit = I.pit; // { x0, x1, z0, z1 }: a sunk pit with a ramp (the pump hall): the podium is split round it
    if (pit) {
      const pd = opt.podium || 2.8, bot = lowPart - pd;
      F.box(w, lowPart, pit.z0 + d / 2, 0, 0, (-d / 2 + pit.z0) / 2, 'stone', { tint: 0xa89e8c });
      F.box(w, lowPart, d / 2 - pit.z1, 0, 0, (pit.z1 + d / 2) / 2, 'stone', { tint: 0xa89e8c });
      F.box(pit.x0 + w / 2, lowPart, pit.z1 - pit.z0, (-w / 2 + pit.x0) / 2, 0, (pit.z0 + pit.z1) / 2, 'stone', { tint: 0xa89e8c });
      F.box(w / 2 - pit.x1, lowPart, pit.z1 - pit.z0, (pit.x1 + w / 2) / 2, 0, (pit.z0 + pit.z1) / 2, 'stone', { tint: 0xa89e8c });
      F.box(pit.x1 - pit.x0, bot, pit.z1 - pit.z0, (pit.x0 + pit.x1) / 2, 0, (pit.z0 + pit.z1) / 2, 'stoneDark', { tint: 0x6a6458 });
      const run = pit.z1 - pit.z0, len = Math.hypot(run, pd), ang = Math.atan2(pd, run);
      F.box(pit.x1 - pit.x0 - 0.2, 0.4, len, (pit.x0 + pit.x1) / 2, bot + pd / 2 - 0.2, (pit.z0 + pit.z1) / 2, 'plank', { rx: -ang, tint: 0x7a6a50 });
      for (let k = 0; k < 6; k++) { const f = pit.z0 + 0.5 + k * ((run - 1) / 5); F.box(pit.x1 - pit.x0 - 0.3, 0.05, 0.12, (pit.x0 + pit.x1) / 2, bot + pd * ((f - pit.z0) / run) + 0.04, f, 'metal', { ...{ collide: false, castShadow: false }, rx: -ang, tint: 0x4a4a4a }); }
    } else F.box(w, lowPart, d, 0, 0, 0, 'stone', { tint: opt.plinth ?? 0xb4aa94 });
    F.box(w, gfH, t, 0, lowPart, -d / 2 + t / 2, PL, { tint: wallT });
    for (const sx of [-1, 1]) F.box(t, gfH, d - 2 * t, sx * (w / 2 - t / 2), lowPart, 0, PL, { tint: wallT });
    const l0 = -w / 2, l1 = dX - dW / 2, r0 = dX + dW / 2, r1 = w / 2;
    F.box(l1 - l0, gfH, t, (l0 + l1) / 2, lowPart, d / 2 - t / 2, PL, { tint: wallT });
    F.box(r1 - r0, gfH, t, (r0 + r1) / 2, lowPart, d / 2 - t / 2, PL, { tint: wallT });
    F.box(dW, gfH - dH, t, dX, lowPart + dH, d / 2 - t / 2, PL, { tint: wallT });
    for (const sx of [-1, 1]) F.box(0.45, dH, 0.7, dX + sx * (dW / 2 + 0.22), lowPart, d / 2 - 0.1, 'stone', { tint: 0xd8ccb0, collide: false });
    F.box(dW + 1.2, 0.45, 0.8, dX, lowPart + dH, d / 2 - 0.05, 'stone', { tint: 0xd8ccb0, collide: false });
    if (!pit) F.box(w - 2 * t, 0.05, d - 2 * t, 0, lowPart, 0, 'plank', { tint: opt.floorTint ?? 0x8a6a44, collide: false, castShadow: false });
    F.box(w - 2 * t, 0.3, d - 2 * t, 0, top - 0.3, 0, 'plank', { tint: 0x6a4e34, castShadow: false });
    F.box(w, H - top, d, 0, top, 0, PL, { tint: wallT });
  } else F.box(w, H, d, 0, 0, 0, PL, { tint: wallT });
  if (I) { // a hall: the plinth is a ring round the walls (a solid box would be a slab above the floor inside)
    const ph = lowPart + 0.85, pc = { tint: opt.plinth ?? 0xb4aa94, collide: false };
    for (const sz of [-1, 1]) F.box(w + 0.3, ph, 0.18, 0, 0, sz * (d / 2 + 0.06), ST, pc);
    for (const sx of [-1, 1]) F.box(0.18, ph, d, sx * (w / 2 + 0.06), 0, 0, ST, pc);
  } else F.box(w + 0.3, lowPart + 0.85, d + 0.3, 0, 0, 0, ST, { tint: opt.plinth ?? 0xb4aa94, collide: false });
  if (!shed) F.box(w + 0.5, 0.32, d + 0.5, 0, H - 0.32, 0, ST, { tint: opt.cornice ?? 0xcfc4a8, collide: false });
  // roof
  const kind = lot.roof;
  let top = H;
  if (kind === 'flat') {
    F.box(w + 0.2, 0.7, d + 0.2, 0, H, 0, ST, { tint: 0xc4b89c, collide: false });
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
    F.put(GABLE, span - 0.9, rise - 0.35, len - 0.9, 0, H, 0, PL, { tint: wallT, collide: false, ry: along ? Math.PI / 2 : 0, castShadow: false });
    top = H + rise;
    if (!shed && !warehouse && rng() < 0.5) {
      const cx = (rng() - 0.5) * (along ? w * 0.6 : 0), cz = (rng() - 0.5) * (along ? 0 : d * 0.6);
      F.box(0.9, 2.1, 0.9, cx, H + rise * 0.35, cz, ST, { tint: 0xa89a84, collide: false });
    }
  }
  // door
  const sill = yF - yBase;
  const frontZ = d / 2;
  let stepsLen = 0; // the length of the steps in front of a walk-in door
  if (warehouse) {
    const n = Math.max(2, Math.round(w / 12));
    for (let k = 0; k < n; k++) {
      const dx = -w / 2 + (k + 0.5) * (w / n);
      F.box(3.0, 3.6, 0.2, dx, sill, frontZ + 0.02, DR, { tint: 0x5a4a38, collide: false });
      F.box(3.5, 0.35, 0.35, dx, sill + 3.6, frontZ + 0.05, ST, { collide: false });
    }
  } else if (I) {
    // an open doorway (the frame is part of the shell): steps down to the ground in front (a sill on a slope or a podium may be high)
    const fg = groundUnder(W, x, z, w, d, rot)[3] - yBase, drop = sill - fg, n = I.noSteps ? 0 : drop > 0.25 ? Math.ceil(drop / 0.2) : 1;
    stepsLen = n > 1 ? n * 0.55 : 1.4;
    for (let i = 0; i < n; i++) {
      const top = sill - (n === 1 ? 0.0 : (i + 1) * (drop / n)), base = Math.min(fg, sill - 0.2) - 0.35;
      F.box((I.doorW ?? 3.4) + 1.4, top - base, n === 1 ? 1.4 : 0.55, I.doorX ?? 0, base, frontZ + (n === 1 ? 0.6 : 0.2 + i * 0.55 + 0.275), ST, { tint: 0xb4aa94 });
    }
  } else if (!shed) {
    F.box(1.6, 2.6, 0.2, 0, sill, frontZ + 0.02, DR, { tint: lot.shop ? 0x4a3a2c : 0x5a3c28, collide: false });
    F.box(2.2, 0.32, 0.32, 0, sill + 2.6, frontZ + 0.05, ST, { collide: false });
    F.box(2.6, 0.3, 1.0, 0, sill - 0.3, frontZ + 0.5, ST, { tint: 0xb4aa94, collide: false });
  } else F.box(1.3, 2.2, 0.15, 0, sill, frontZ + 0.02, DR, { tint: 0x4a3a2c, collide: false });
  // A key building of the big city: the village kit walls are a skin streamed round the camera; the plain windows below are then
  // its far version (tier 's' of the same stream cell).
  const skin = !!W.stream && !!opt.skin;
  if (skin) {
    const c = new THREE.Vector3(x, 0, z);
    if (W._D) c.applyMatrix4(W._D);
    W._forceCell = { x: c.x, z: c.z };
    W.lodMode = 'stream';
    const rec = { x, z, yBase, rot, w, d, floors: lot.floors, floorH, gfH, lowPart, H, wall: lot.wall, seed: lot.seed || 1, door: I ? { x: I.doorX ?? 0, w: I.doorW ?? 3.4 } : { x: 0, w: 2.4 }, colonnade: opt.colonnade };
    W.stream.add(c.x, c.z, (w2) => keySkin(w2, rec), W._D ? W._D.clone() : null);
  }
  // windows (detail): front and back, every storey. A palace (opt.palace: the academy hall) has tall windows with a lintel and a
  // keystone on every side, no shutters, string courses between the storeys; they are its silhouette, so they are not culled.
  const pal = !!opt.palace;
  const win = (wx, wy, wz, ry = 0, wh = 2.3) => {
    if (pal) {
      const o = { collide: false, castShadow: false, ry };
      F.box(1.15, wh, 0.16, wx, wy, wz, 'window', o);
      F.box(1.55, 0.24, 0.28, wx, wy + wh, wz, 'stone', { ...o, tint: 0xd2c6aa });
      F.box(0.34, 0.44, 0.32, wx, wy + wh - 0.02, wz, 'stone', { ...o, tint: 0xe6dfcf });
      F.box(1.45, 0.14, 0.34, wx, wy - 0.12, wz, 'stone', { ...o, tint: 0xd2c6aa });
      return;
    }
    F.box(0.95, 1.4, 0.16, wx, wy, wz, 'window', { collide: false, castShadow: false, detail: true, ry });
    F.box(1.3, 0.16, 0.24, wx, wy + 1.4, wz, 'stone', { collide: false, castShadow: false, detail: true, ry, tint: 0xcfc4a8 });
    F.box(1.2, 0.12, 0.3, wx, wy - 0.1, wz, 'stone', { collide: false, castShadow: false, detail: true, ry, tint: 0xb4aa94 });
  };
  const cols = Math.max(1, Math.floor((w - 1.6) / 3.4));
  const shut = SHUTTER[Math.floor(rng() * SHUTTER.length)];
  if (pal) {
    for (let f = 0; f < lot.floors; f++) {
      const wh = f === 0 ? 3.3 : 2.3, wy = storeyY(f) + (f === 0 ? 2.0 : 0.5);
      if (f > 0) F.box(w + 0.24, 0.3, d + 0.24, 0, storeyY(f) - 0.15, 0, ST, { collide: false, castShadow: false, tint: 0xd2c6aa });
      for (let k = 0; k < cols; k++) {
        const wx = -w / 2 + (k + 0.5) * (w / cols);
        if (!(f === 0 && Math.abs(wx - (I?.doorX ?? 0)) < (I?.doorW ?? 3.4) / 2 + 0.9)) win(wx, wy, frontZ + 0.02, 0, wh);
        win(wx, wy, -frontZ - 0.02, Math.PI, wh);
      }
      const sc = Math.max(1, Math.floor((d - 1.6) / 3.4));
      for (let k = 0; k < sc; k++) for (const sx of [-1, 1]) win(sx * (w / 2 + 0.02), wy, -d / 2 + (k + 0.5) * (d / sc), sx * Math.PI / 2, wh);
    }
  }
  for (let f = 0; f < lot.floors && !pal; f++) {
    const wy = storeyY(f) + (f === 0 && warehouse ? 2.6 : f === 0 && I ? (I.winY ?? 1.5) : 1.1);
    for (let k = 0; k < cols; k++) {
      const wx = -w / 2 + (k + 0.5) * (w / cols);
      const skip = f === 0 && !warehouse && Math.abs(wx - (I?.doorX ?? 0)) < (I ? (I.doorW ?? 3.4) / 2 + 0.9 : 1.7);
      if (!skip && !(warehouse && f === 0)) {
        win(wx, wy, frontZ + 0.02);
        if (!lot.shop || f > 0) for (const s of [-1, 1]) F.box(0.42, 1.4, 0.08, wx + s * 0.72, wy, frontZ + 0.04, 'wood', { tint: shut, collide: false, castShadow: false, detail: true });
      }
      if (!(warehouse && f === 0) && (k % 2 === 0 || cols < 3)) win(wx, wy, -frontZ - 0.02, Math.PI);
    }
  }
  if (skin) { W.lodMode = prevLod; W._forceCell = null; }
  // timber, jetty beams, awning, sign, lantern (detail)
  if (!warehouse && !shed) {
    if ((lot.district === 'old' || lot.district === 'posad') && !skin) {
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
  const door = F.at(I?.doorX ?? 0, sill, frontZ + 1.6 + (I ? stepsLen : 0));
  return { frame: F, door, top, sill: yF, size: [w, d], localSill: sill, base: yBase };
}

/** The tall tower of a public building: a masonry shaft with a clock or a bell and a pyramidal roof. */
function tower(F, lx, lz, s, h, o = {}) {
  F.box(s, h, s, lx, 0, lz, F.w.mats.kit_village_MI_Plaster ? 'kit_village_MI_Plaster' : 'plaster', { tint: o.wall ?? 0xe8e0cc });
  F.box(s + 0.7, 0.5, s + 0.7, lx, h - 0.5, lz, 'stone', { tint: 0xcfc4a8, collide: false });
  F.put(PYRAMID, s + 1.2, s * 1.4, s + 1.2, lx, h, lz, 'roof', { tint: o.roof ?? 0x6a7c92, collide: false });
  if (o.clock) for (const [dx, dz, ry] of [[0, s / 2 + 0.06, 0], [0, -s / 2 - 0.06, Math.PI], [s / 2 + 0.06, 0, Math.PI / 2], [-s / 2 - 0.06, 0, -Math.PI / 2]]) F.cyl(1.0, 0.1, lx + dx, h - 3.2, lz + dz, 'lampGlass', { collide: false, castShadow: false, rx: Math.PI / 2, ry, tint: 0xf4efe0 });
}

/**
 * A key building of the plan: a bigger light house with the features of its kind (towers, dome, colonnade, arcade).
 * k: { u, v, w, d, rot, floors, kind, tower, dome }; returns { frame, door, top }.
 */
export function keyBuilding(W, k, seedBase = 7, extra = {}) {
  const hall = k.kind === 'academy' && k.dome; // the main hall of the academy: a palace of its own (academyHall)
  const lot = { ...k, wall: PAL[k.kind]?.wall ?? 0xd8ccb0, roofColor: PAL[k.kind]?.roof ?? 0x6a7c92, roof: hall || k.kind === 'arcade' ? 'flat' : 'gable', shop: false, district: k.district, seed: seedBase + k.id.length * 31 };
  const r = lightHouse(W, lot, { plinth: 0xb4aa94, cornice: 0xd8ccb0, noStream: true, skin: !hall, palace: hall, ...extra });
  const F = r.frame, [w, d] = r.size;
  const H = r.top;
  if (k.tower) tower(F, w / 2 - 3.2, d / 2 - 3.5, 5.2, H + 7, { clock: k.kind === 'guild', roof: k.kind === 'archive' ? 0x5d7189 : 0x6a7c92 });
  if (hall) academyHall(F, r, k);
  else if (k.dome && !heroKit(F, 'obj/academy_dome', { w: 13 }, 0, H - 0.2, 0)) {
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
/**
 * The main hall of the academy: a flat roof with a balustrade, the dome on a stepped base in the middle of it, two end pavilions
 * with an attic and a hipped slate roof, two observatory spires flanking the dome, a giant-order portico with a pediment over the
 * door and stone pilasters. Everything sits on or against the collision body (only the body collides), so the walkable ground
 * and the spots round the hall stay as they were.
 */
function academyHall(F, r, k) {
  const W = F.w, [w, d] = r.size, top = r.top, s0 = r.localSill;
  const gfH = r.top - 0.7 - s0; // the body up to the cornice (flat roof slab 0.7 above it)
  const STONE = 0xe6dfcf, TRIM = 0xd2c6aa, SLATE = 0x3d5578, GOLD = 0xc8a04a;
  const NC = { collide: false }, DT = { collide: false, detail: true, castShadow: false };
  const pw = 3 * (w / Math.max(1, Math.floor((w - 1.6) / 3.4))); // the end pavilions: three window bays (pilasters fall between windows)
  // pilasters: the corners of the body and the inner edges of the pavilions, front and back
  for (const sz of [-1, 1]) for (const px of [-w / 2 + 0.35, -w / 2 + pw, w / 2 - pw, w / 2 - 0.35]) F.box(0.8, gfH - 0.3, 0.3, px, s0, sz * (d / 2 + 0.25), 'stone', { ...NC, tint: TRIM, castShadow: false });
  // balustrade along the roof between the pavilions (front and back) and along nothing else (the pavilions rise there)
  const bal = (x0, x1, z) => {
    const len = x1 - x0, cx = (x0 + x1) / 2;
    F.box(len, 0.22, 0.45, cx, top, z, 'stone', { ...NC, tint: TRIM });
    F.box(len, 0.16, 0.5, cx, top + 0.92, z, 'stone', { ...NC, tint: TRIM });
    const n = Math.round(len / 0.9);
    for (let i = 0; i <= n; i++) F.box(i % 7 === 0 ? 0.5 : 0.2, 0.7, i % 7 === 0 ? 0.5 : 0.2, x0 + (i * len) / n, top + 0.22, z, 'stone', { ...DT, tint: STONE });
  };
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2 - 0.15);
    if (sz > 0) { bal(-w / 2 + pw, -10.6, z); bal(10.6, w / 2 - pw, z); } else bal(-w / 2 + pw, w / 2 - pw, z);
  }
  // the end pavilions: an attic storey with round windows, a cornice and a hipped slate roof with a gilt finial
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 - pw / 2), ah = 3.2;
    F.box(pw, ah, d, cx, top - 0.1, 0, 'stone', { ...NC, tint: STONE });
    F.box(pw + 0.6, 0.4, d + 0.6, cx, top + ah - 0.1, 0, 'stone', { ...NC, tint: TRIM });
    for (const sz of [-1, 1]) for (const dx of [-2.2, 2.2]) F.cyl(0.75, 0.12, cx + dx, top + ah / 2 - 0.1, sz * (d / 2 + 0.02), 'window', { ...DT, rx: Math.PI / 2, seg: 16 });
    const rise = 5.2;
    F.put(PYRAMID, pw + 0.9, rise, d + 0.9, cx, top + ah + 0.3, 0, 'roof', { ...NC, tint: SLATE });
    F.cyl(0.12, 2.2, cx, top + ah + 0.3 + rise - 0.2, 0, 'metal', { ...NC, seg: 8, tint: GOLD });
    F.sphere(0.35, cx, top + ah + 0.3 + rise + 1.6, 0, 'metal', { ...NC, tint: GOLD });
  }
  // the dome on a stepped base in the middle of the roof
  F.box(17, 1.3, 17, 0, top - 0.1, 0, 'stone', { ...NC, tint: STONE });
  F.box(17.6, 0.35, 17.6, 0, top + 1.2, 0, 'stone', { ...NC, tint: TRIM });
  F.box(15.4, 0.7, 15.4, 0, top + 1.55, 0, 'stone', { ...NC, tint: STONE });
  if (!heroKit(F, 'obj/academy_dome', { w: 14.5 }, 0, top + 2.2, 0)) {
    F.cyl(6.2, 4.5, 0, top + 2.2, 0, 'stone', { ...NC, seg: 16, tint: TRIM });
    F.sphere(6.4, 0, top + 6.7, 0, 'roof', { ...NC, tint: 0x5c8b80, sy: 0.85 });
    F.cyl(0.3, 3.2, 0, top + 12, 0, 'metal', { ...NC, seg: 8, tint: GOLD });
  }
  // two observatory spires flanking the dome at the back: a round shaft with a ring of windows, a slate cone and a gilt finial
  for (const sx of [-1, 1]) {
    const cx = sx * 11.6, cz = -(d / 2 - 4), sh = 9.5, rr = 2.4;
    F.cyl(rr + 0.4, 0.6, cx, top - 0.1, cz, 'stone', { ...NC, seg: 16, tint: TRIM });
    F.cyl(rr, sh, cx, top, cz, 'stone', { ...NC, seg: 16, tint: STONE });
    F.cyl(rr + 0.35, 0.35, cx, top + sh, cz, 'stone', { ...NC, seg: 16, tint: TRIM });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      F.box(0.7, 1.6, 0.12, cx + Math.sin(a) * (rr + 0.02), top + sh - 3.2, cz + Math.cos(a) * (rr + 0.02), 'window', { ...DT, ry: a });
    }
    F.put(CONE, rr + 0.6, 6.5, rr + 0.6, cx, top + sh + 0.35, cz, 'roof', { ...NC, tint: SLATE });
    F.cyl(0.1, 2.0, cx, top + sh + 6.6, cz, 'metal', { ...NC, seg: 8, tint: GOLD });
    F.sphere(0.3, cx, top + sh + 8.6, cz, 'metal', { ...NC, tint: GOLD });
  }
  // the portico over the door: six giant columns on pedestals, an entablature and a pediment with the gilt seal of the academy
  const fp = F.at(0, 0, d / 2 + 4.2), fg = Math.min(s0, W.heightAt(fp.x, fp.z) - r.base);
  const colTop = s0 + 9.7, zc = d / 2 + 4.2, pd = 5.6, pz = d / 2 + pd / 2;
  F.box(20.4, 0.12, pd + 0.6, 0, fg - 0.06, pz + 0.3, 'stone', { ...DT, tint: TRIM });
  for (const cx of [-8.6, -5.6, -2.6, 2.6, 5.6, 8.6]) {
    F.box(1.4, s0 - fg + 1.0, 1.4, cx, fg, zc, 'stone', { ...NC, tint: TRIM });
    F.cyl(0.55, colTop - s0 - 1.6, cx, s0 + 1.0, zc, 'stone', { ...NC, seg: 16, tint: STONE });
    F.box(1.3, 0.6, 1.3, cx, colTop - 0.6, zc, 'stone', { ...NC, tint: TRIM });
  }
  F.box(19.6, 1.1, pd, 0, colTop, pz, 'stone', { ...NC, tint: STONE });
  F.box(20.2, 0.3, pd + 0.4, 0, colTop + 1.1, pz + 0.2, 'stone', { ...NC, tint: TRIM });
  F.put(GABLE, 21.4, 4.0, pd + 0.4, 0, colTop + 1.4, pz + 0.1, 'roof', { ...NC, tint: SLATE });
  F.put(GABLE, 20.4, 3.55, pd + 0.6, 0, colTop + 1.4, pz + 0.2, 'stone', { ...NC, tint: STONE });
  F.cyl(1.3, 0.16, 0, colTop + 2.6, d / 2 + pd + 0.5, 'metal', { ...NC, rx: Math.PI / 2, seg: 16, tint: GOLD });
  F.cyl(0.8, 0.2, 0, colTop + 2.6, d / 2 + pd + 0.52, 'lampGlass', { ...DT, rx: Math.PI / 2, seg: 16, tint: 0x6a9ad8 });
  F.box(0.4, 0.6, 0.4, 0, colTop + 1.4 + 3.55, pz + 0.2 + pd / 2 - 0.2, 'stone', { ...NC, tint: TRIM });
  F.sphere(0.35, 0, colTop + 1.4 + 3.55 + 0.9, pz + 0.2 + pd / 2 - 0.2, 'metal', { ...NC, tint: GOLD });
}
const PAL = {
  guild: { wall: 0xc9bda4, roof: 0x5d7189 }, public: { wall: 0xc9bda4, roof: 0x6a7c92 }, archive: { wall: 0xd0c4aa, roof: 0x5d7189 }, academy: { wall: 0xeae2d0, roof: 0x3d5578 },
  theatre: { wall: 0xe3d6bb, roof: 0xa9664c }, inn: { wall: 0xe3d6bb, roof: 0xa9664c }, port: { wall: 0xc9bda4, roof: 0x6a7c92 }, pump: { wall: 0xb09a78, roof: 0x5c8b80 },
  council: { wall: 0xe3d6bb, roof: 0x5c8b80 }, market: { wall: 0xe3d6bb, roof: 0xa9664c }, cathedral: { wall: 0xcfc4a8, roof: 0x6a7c92 }, arcade: { wall: 0xd8ccb0, roof: 0x6a7c92 },
};
export { G };
