import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, villageRoof, roofVariant, gableGeometry } from './Kit.js';

/**
 * The near model of a plain Ainstrey house: the Quaternius village kit (the same modules as the houses of Axel) fitted to the lot
 * of the plan. Built on demand by the CityStream (world/CityStream.js) round the camera; the collision and the far proxy are made
 * by lightHouse() (AinstreyBuildings.js) from the same record: { x, z, yBase, rot, w, d, floors, floorH, gfH, lowPart, H, roof,
 * roofColor, wall, shop, kind, district, seed }. Walls: 2 m tiles (scaled to fit), the outer face 2 cm outside the collision box.
 * Ground storeys of stone (brick) or plaster, timber grids in the old town and the posad, shop windows on the ground floor of the
 * shops, shutters, flower boxes, balconies, vines; the village roof (Kit.villageRoof) along the longer side, chimneys.
 */
const V = (n) => 'village/' + n;
// [0] round-headed, [1] wide flat (the light insert: most houses, shops, halls), [2] thin round
const WIN = [
  { wall: 'Window_Wide_Round', insert: 'Window_Wide_Round1', shutter: 'WindowShutters_Wide_Round' },
  { wall: 'Window_Wide_Flat', insert: 'Window_Wide_Flat1', shutter: 'WindowShutters_Wide_Flat' },
  { wall: 'Window_Thin_Round', insert: 'Window_Thin_Round1', shutter: 'WindowShutters_Thin_Round' },
];
const pickWin = (rng) => { const r = rng(); return WIN[r < 0.2 ? 0 : r < 0.85 ? 1 : 2]; };
const FLOWERS = [0xe0506a, 0xf0c040, 0xc070e0, 0xf08040, 0xf4f0e8];
const _c = new THREE.Color(), _w = new THREE.Color();
const deco = { collide: false, castShadow: false };

export function kitHouse(W, h) {
  const rng = mulberry32((h.seed * 7919) >>> 0 || 7);
  const F = new Frame(W, h.x, h.yBase, h.z, h.rot);
  const { w, d, lowPart: y0 } = h;
  const warehouse = h.kind === 'warehouse', shed = h.kind === 'shed';
  const oldTown = h.district === 'old' || h.district === 'posad';
  const groundMat = warehouse || (!shed && rng() < (oldTown ? 0.65 : 0.4)) ? 'UnevenBrick' : 'Plaster';
  const upperMat = warehouse && rng() < 0.5 ? 'UnevenBrick' : 'Plaster';
  const grid = !warehouse && (oldTown ? rng() < 0.7 : rng() < 0.15);
  // the plaster takes the colour of the lot (half way to white: the texture is already cream)
  const tint = _c.setHex(h.wall ?? 0xe8dcc4).lerp(_w.setHex(0xffffff), 0.45).getHex();
  const winA = pickWin(rng), winB = pickWin(rng);
  // the courtyard rows (h.simple): no shutters, flowers, balconies, vines or chimneys, a light roof of two tiled slabs
  const simple = !!h.simple;
  const shutterP = shed || simple ? 0 : 0.35 + rng() * 0.4;
  const flowers = !warehouse && !shed && !simple && rng() < 0.45 ? 0.35 : 0;

  // plinth up to the sill, a step at the door
  F.box(w + 0.3, y0 + 0.05, d + 0.3, 0, 0, 0, 'stone', { tint: 0xb4aa94, collide: false });

  const heights = [];
  for (let f = 0; f < h.floors; f++) heights.push(f === 0 ? h.gfH + (h.shop ? 0.5 : 0) : h.floorH);
  let y = y0;
  for (let f = 0; f < h.floors; f++) {
    storey(F, h, y, heights[f], f, { rng, mat: f === 0 ? groundMat : upperMat, grid: grid && f > 0, tint, win: f === 0 ? winA : winB, shutterP, flowers, warehouse, shed });
    y += heights[f];
  }
  const top = h.H;
  if (warehouse) {
    const n = Math.max(2, Math.round(w / 12));
    for (let k = 0; k < n; k++) {
      const dx = -w / 2 + (k + 0.5) * (w / n);
      F.box(3.0, 3.6, 0.2, dx, y0, d / 2 + 0.06, 'door', { tint: 0x5a4a38, collide: false });
      F.box(3.5, 0.35, 0.35, dx, y0 + 3.6, d / 2 + 0.08, 'stone', deco);
    }
  }
  // balcony / vines
  if (!warehouse && !shed && !simple && h.floors > 1 && rng() < 0.22) {
    const bx = (rng() - 0.5) * Math.max(0, w - 6);
    F.kit(V('Balcony_Cross_Straight'), bx, y0 + heights[0], d / 2 - 0.88, { s: 1, collide: false });
    F.box(2.0, 0.12, 1.1, bx, y0 + heights[0] - 0.12, d / 2 + 0.47, 'plank', { collide: false, tint: 0x7a5c40 });
  }
  if (!warehouse && !simple && rng() < 0.18) {
    const vs = rng() < 0.5 ? -1 : 1;
    F.kit(V(['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine5', 'Prop_Vine6'][Math.floor(rng() * 4)]), vs * (w / 2 + 0.12), y0 + 2.2, (rng() - 0.5) * (d - 2), { ry: vs * Math.PI / 2, s: 1.3, ...deco });
  }
  // roof: the village roof along the longer side; flat roofs keep a stone parapet
  if (h.roof === 'flat') {
    F.box(w + 0.3, 0.75, d + 0.3, 0, top, 0, 'stone', { tint: 0xc4b89c, collide: false });
    F.box(w + 0.5, 0.22, d + 0.5, 0, top - 0.22, 0, 'stone', { tint: 0xd8ccb0, ...deco });
    return;
  }
  const along = w >= d * 0.87;
  const span = along ? d : w, len = along ? w : d;
  const variant = roofVariant(h.roofColor) ?? 'red';
  const spec = { pitch: span > 9 ? 0.72 : span > 6.5 ? 0.82 : undefined };
  const R = along ? F : F.sub(0, 0, 0, Math.PI / 2);
  if (simple) { lightRoof(W, R, len, span, top, h); return; }
  const ridge = villageRoof(R, len, span, top, variant, spec);
  if (!warehouse && !shed && rng() < 0.7) {
    const cx = (rng() < 0.5 ? -1 : 1) * (len / 2 - 1.2), cz = -span * 0.16;
    const hgt = (ridge - top) * 0.8 + 1.0;
    R.kit(V('Prop_Chimney'), cx, top - 0.6, cz, { sy: (hgt + 0.6) / 3.18, sx: 1.15, sz: 1.15, collide: false });
  }
}

/**
 * A cheap gable roof for the courtyard rows: two slabs of the village tiles (planar UVs) over the ridge (local x) and two
 * plaster gable triangles — a few dozen triangles instead of the kit roof's thousands.
 */
function lightRoof(W, R, len, span, top, h) {
  const TILE = W.mats.kit_village_MI_RoundTiles ? 'kit_village_MI_RoundTiles' : 'roof';
  const rise = span * 0.42, half = span / 2 + 0.45, ang = Math.atan2(rise, span / 2), slope = Math.hypot(half, rise * (half / (span / 2)));
  const tint = TILE === 'roof' ? h.roofColor : _c.setHex(h.roofColor ?? 0xa9664c).lerp(_w.setHex(0xffffff), 0.35).getHex();
  for (const s of [-1, 1]) R.box(len + 0.9, 0.16, slope, 0, top + rise / 2 - 0.12, s * (half / 2 - 0.1), TILE, { rx: s * ang, tint, collide: false });
  const PL = W.mats.kit_village_MI_Plaster ? 'kit_village_MI_Plaster' : 'plaster';
  const wall = _c.setHex(h.wall ?? 0xe8dcc4).lerp(_w.setHex(0xffffff), 0.45).getHex();
  for (const s of [-1, 1]) R.put(gableGeometry(span - 0.1, rise - 0.05, 0.2), 1, 1, 1, s * (len / 2 - 0.12), top, 0, PL, { ry: Math.PI / 2, tint: wall, collide: false, castShadow: false });
}

/** One storey of wall modules round the w × d box (front = +z, the door tile in the middle of the front). */
function storey(F, h, y0, sh, f, o) {
  const { w, d } = h;
  const { rng, mat, grid, tint, win, shutterP, flowers, warehouse, shed } = o;
  const sy = sh / 3.0;
  const ground = f === 0;
  const sides = [
    { along: 'x', len: w, off: d / 2, ry: 0, front: true, p: ground ? 0.6 : 0.8 },
    { along: 'x', len: w, off: -d / 2, ry: Math.PI, p: 0.35 },
    { along: 'z', len: d, off: w / 2, ry: Math.PI / 2, p: 0.15 },
    { along: 'z', len: d, off: -w / 2, ry: -Math.PI / 2, p: 0.15 },
  ];
  for (const s of sides) {
    let n = Math.max(1, Math.round(s.len / 2));
    if (s.front && n % 2 === 0) n += s.len / (n + 1) >= 1.55 ? 1 : -1;
    n = Math.max(1, n);
    const tw = s.len / n, sx = tw / 2;
    // module origin = the plane of its plaster / brick face (the timber trims stand 9 cm proud of it): 7 cm inside the collision box
    // for a house (nothing behind), 2 cm outside the body of a key building (`push`)
    const sg = Math.sign(s.off), off = s.off + sg * (o.push ? 0.02 : -0.07);
    for (let i = 0; i < n; i++) {
      const t = -s.len / 2 + (i + 0.5) * tw;
      const T = F.sub(s.along === 'x' ? t : off, y0, s.along === 'x' ? off : t, s.ry);
      const put = (name, opt = {}) => T.kit(V(name), opt.x ?? 0, 0, 0, { sx, sy, sz: 1, collide: false, castShadow: opt.cast ?? true, tint: opt.tint, tintOnly: opt.tint !== undefined ? 'Plaster' : null });
      const wallTint = mat === 'Plaster' ? tint : undefined;
      if (s.front && o.gap && Math.abs(t - o.gap.x) < o.gap.w / 2 + tw / 2 - 0.1) continue; // the open doorway of a hall
      const door = s.front && ground && !warehouse && o.door !== false && i === (n - 1) / 2;
      if (door) {
        put(`Wall_${mat}_Door_Round`, { tint: wallTint });
        put('DoorFrame_Round_WoodDark', { cast: false });
        T.kit(V('Door_1_Round'), -0.5 * sx, 0, 0, { sx, sy, collide: false });
        T.box(2.2, h.lowPart + 0.06, 1.0, 0, -h.lowPart - 0.05 + 0.0, 0.62, 'stone', { tint: 0xb4aa94, collide: false });
        continue;
      }
      const shopWin = s.front && ground && h.shop;
      if (!warehouse || !ground) {
        if (shopWin || rng() < s.p * (shed ? 0.5 : 1)) {
          const K = shopWin ? WIN[1] : win;
          put(`Wall_${mat}_${K.wall}`, { tint: wallTint });
          put(K.insert, { cast: false });
          if (!shopWin && rng() < shutterP) put(`${K.shutter}_${rng() < 0.45 ? 'Open' : 'Closed'}`, { cast: false });
          if (!ground && s.front && rng() < flowers) {
            T.box(1.2 * sx, 0.22, 0.3, 0, 0.92 * sy, 0.24, 'wood', { ...deco, tint: 0x6a4428 });
            for (let k = 0; k < 3; k++) T.sphere(0.15, (-0.4 + k * 0.4) * sx, 0.92 * sy + 0.28, 0.24, 'flower', { ...deco, tint: FLOWERS[(i + k + f) % FLOWERS.length] });
          }
          if (o.push) T.box(1.0 * sx, 1.25 * sy, 0.008, 0, 1.12 * sy, -0.012, 'window', deco); // between the face and the body behind
          else T.box(1.3 * sx, 1.45 * sy, 0.02, 0, 1.05 * sy, -0.27, 'window', deco); // the pane lit at night
          continue;
        }
      }
      put(grid && mat === 'Plaster' && rng() < 0.7 ? 'Wall_Plaster_WoodGrid' : `Wall_${mat}_Straight`, { tint: wallTint });
    }
  }
  const co = o.push ? 0.02 : -0.07;
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) F.kit(V('Corner_Exterior_Wood'), cx * (w / 2 + co), y0, cz * (d / 2 + co), { sy, collide: false });
}

/**
 * The skin of a key building (guild, archive, academy, inn, offices…): village kit walls over its light body, streamed like the
 * houses (the body stays: it carries the halls inside). Stone (brick) ground storey in rows of ~3 m, plaster storeys above in the
 * colour of the building, wide windows; the doorway of a hall stays open. rec: lightHouse's numbers + door { x, w }.
 */
export function keySkin(W, k) {
  const rng = mulberry32((k.seed * 104729) >>> 0 || 11);
  const F = new Frame(W, k.x, k.yBase, k.z, k.rot);
  const tint = _c.setHex(k.wall ?? 0xe3d6bb).lerp(_w.setHex(0xffffff), 0.4).getHex();
  const gRows = Math.max(1, Math.round(k.gfH / 3.2));
  const rows = [];
  for (let r = 0; r < gRows; r++) rows.push({ h: k.gfH / gRows, ground: r === 0, mat: 'UnevenBrick', gap: true });
  for (let f = 1; f < k.floors; f++) rows.push({ h: k.floorH, ground: false, mat: 'Plaster' });
  const winA = WIN[1], winB = WIN[rng() < 0.5 ? 0 : 2];
  let y = k.lowPart;
  for (const r of rows) {
    storey(F, { ...k, shop: false }, y, r.h, r.ground ? 0 : 1, { rng, mat: r.mat, grid: false, tint, win: r.mat === 'Plaster' ? winB : winA, shutterP: 0.25, flowers: 0.15, warehouse: false, shed: false, door: false, push: true, gap: r.gap ? { x: k.door.x, w: k.door.w + 0.6 } : null });
    y += r.h;
  }
}
