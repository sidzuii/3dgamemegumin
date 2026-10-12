import * as THREE from 'three';
import { ROOF_COLORS } from '../KitLibrary.js';
import { roadInfo, GRID_STEP } from '../Terrain.js';
import { HALF } from '../MapData.js';

/**
 * Building kit: parametric pieces of the anime-fantasy town (timber-framed houses with steep
 * roofs, shop fronts, walls and towers, bridges, stalls, props, trees).
 *
 * Every piece is placed through a `Frame` (position + yaw) and ends up in the world's merged
 * static batches (one draw call per material and map chunk); `tint` colours vertices so one
 * material serves many colour variants. Pieces that matter for navigation are added to the
 * world collider; small decoration is not.
 */

const Q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _mS = new THREE.Matrix4();
const _mR = new THREE.Matrix4();

// Shared unit geometries (cloned + transformed by addSolid).
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  cone12: new THREE.ConeGeometry(1, 1, 12),
  sphere: new THREE.SphereGeometry(1, 10, 8),
  sphereLo: new THREE.SphereGeometry(1, 6, 4),
  ico1: new THREE.DodecahedronGeometry(1, 0), // canopy blob (36 tris, low-poly look)
  dodeca: new THREE.DodecahedronGeometry(1, 0),
};
G.box.translate(0, 0.5, 0); // boxes grow up from their base
G.cyl8.translate(0, 0.5, 0);
G.cyl12.translate(0, 0.5, 0);
G.cyl16.translate(0, 0.5, 0);
G.cone6.translate(0, 0.5, 0);
G.cone8.translate(0, 0.5, 0);
G.cone12.translate(0, 0.5, 0);

/** Triangular prism (gable end): base width along x, apex height, thickness along z. */
function gableGeometry(width, rise, thick) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** Local coordinate frame: x right, z towards the front, y up. */
export class Frame {
  constructor(world, x, y, z, rot = 0) {
    this.w = world;
    this.origin = new THREE.Vector3(x, y, z);
    this.rot = rot;
    this.q = new THREE.Quaternion().setFromAxisAngle(UP, rot);
  }

  /** World position of a local point. */
  at(lx, ly, lz, target = new THREE.Vector3()) {
    return target.set(lx, ly, lz).applyQuaternion(this.q).add(this.origin);
  }

  /** Child frame offset/rotated inside this one. */
  sub(lx, ly, lz, rot = 0) {
    const p = this.at(lx, ly, lz);
    return new Frame(this.w, p.x, p.y, p.z, this.rot + rot);
  }

  /**
   * Place a shared geometry: (sx, sy, sz) scale, local position of its base, extra rotation.
   * opts: { collide, castShadow, tint, rx, ry, rz }
   */
  put(geo, sx, sy, sz, lx, ly, lz, mat, opts = {}) {
    _e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0, 'YXZ');
    _q.setFromEuler(_e).premultiply(this.q);
    this.at(lx, ly, lz, _p);
    _m.compose(_p, _q, _s.set(sx, sy, sz));
    return this.w.addSolid(geo, _m, mat, opts);
  }

  /**
   * Place a Kenney kit piece ('town/wall-wood', world/KitLibrary.js) with its origin at the
   * local point. opts: { s | sx, sy, sz, rx, ry, rz, collide (true | false | 'box'), castShadow, tint }
   */
  kit(name, lx, ly, lz, opts = {}) {
    _e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0, 'YXZ');
    _q.setFromEuler(_e).premultiply(this.q);
    this.at(lx, ly, lz, _p);
    const s = opts.s ?? 1;
    _m.compose(_p, _q, _s.set(opts.sx ?? s, opts.sy ?? s, opts.sz ?? s));
    return this.w.addKit(name, _m, opts);
  }

  box(w, h, d, lx, ly, lz, mat, opts) { return this.put(G.box, w, h, d, lx, ly, lz, mat, opts); }
  cyl(r, h, lx, ly, lz, mat, opts = {}) { return this.put(opts.seg === 8 ? G.cyl8 : opts.seg === 16 ? G.cyl16 : G.cyl12, r, h, r, lx, ly, lz, mat, opts); }
  cone(r, h, lx, ly, lz, mat, opts = {}) { return this.put(opts.seg === 6 ? G.cone6 : opts.seg === 12 ? G.cone12 : G.cone8, r, h, r, lx, ly, lz, mat, opts); }
  sphere(r, lx, ly, lz, mat, opts = {}) { return this.put(r < 0.4 ? G.sphereLo : G.sphere, r * (opts.sx || 1), r * (opts.sy || 1), r * (opts.sz || 1), lx, ly, lz, mat, opts); }
  geo(g, lx, ly, lz, mat, opts = {}) { return this.put(g, opts.sx || 1, opts.sy || 1, opts.sz || 1, lx, ly, lz, mat, opts); }
}

const deco = { collide: false };
const decoNS = { collide: false, castShadow: false };

// -----------------------------------------------------------------------------------------
// Houses (Quaternius Medieval Village MegaKit modules, world/KitLibrary.js 'village')
// -----------------------------------------------------------------------------------------
// Module facts: walls are 2 m wide (x -1..1), 3 m storeys (3.12 with the top beam), outer face
// on local +z (thickness z -0.31..0.09); windows / door leaves / shutters are separate inserts;
// roofs come pre-built per footprint ('Roof_RoundTiles_<across>x<along>', ridge along local z)
// with matching brick gable fronts ('Roof_Front_Brick<across>').
const PLASTER_CREAM = 0xeee4d0; // procedural plaster next to the village plaster texture
const TIMBER_DARK = 0x5a3a26;
const V = (n) => 'village/' + n;
const WINDOW_KINDS = [
  { wall: 'Window_Wide_Round', insert: 'Window_Wide_Round1', shutter: 'WindowShutters_Wide_Round' },
  { wall: 'Window_Wide_Flat', insert: 'Window_Wide_Flat1', shutter: 'WindowShutters_Wide_Flat' },
  { wall: 'Window_Thin_Round', insert: 'Window_Thin_Round1', shutter: 'WindowShutters_Thin_Round' },
];
const ROOFS = { 4: [4, 6, 8], 6: [6, 8, 10, 12, 14], 8: [8, 10, 12, 14] };
const ROOF_TINTS = { red: null, brown: 0xc09474, green: 0xa4b48c, blue: 0x8c9ac4, slate: 0x9c9ea8, purple: 0xb08cb4, straw: 0xe6cc90 };
/**
 * Roof module profile (model units, measured on the kit, same for every length of a width):
 * UNDER = underside height near the eaves [x, y] (piecewise linear, down to the tile lip),
 * ICPT = the main slope's underside at the ridge (its gable front follows that line).
 */
const ROOF_UNDER = {
  4: [[1.95, 0.121], [2.15, -0.144], [2.2, -0.296], [2.35, -0.476]],
  6: [[2.9, 0.15], [3.75, -0.741]],
  8: [[3.5, 0.629], [4.75, -0.736]],
};
const ROOF_ICPT = { 4: 2.701, 6: 3.747, 8: 5.052 };
/** Overhang of the eaves / gable ends past the walls (m); the city plan spaces lots by it. */
export const ROOF_OVERHANG = 0.45;
const underAt = (across, x) => {
  const t = ROOF_UNDER[across];
  if (x <= t[0][0]) return t[0][1] + ((t[1][1] - t[0][1]) / (t[1][0] - t[0][0])) * (x - t[0][0]);
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (x - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
  return t[t.length - 1][1];
};

/** Nearest roof colour name for a tint. */
function roofVariant(hex) {
  if (hex === undefined) return null;
  const c = new THREE.Color(hex);
  let best = 'red', bd = Infinity;
  for (const [name, v] of Object.entries(ROOF_COLORS)) {
    const o = new THREE.Color(v);
    const dd = (c.r - o.r) ** 2 + (c.g - o.g) ** 2 + (c.b - o.b) ** 2;
    if (dd < bd) { bd = dd; best = name; }
  }
  return best;
}

/**
 * Timber-framed house. Front faces local +z.
 * spec: { x, z, rot, w, d, floors, floorH, roofTint, chimney, jetty, door: offset|false,
 *         open: false|'shop'|'hall', doorWidth, arcade, style: 'plaster'|'brick'|'wood', dormer, lantern }
 * The door snaps to a wall tile of the front (the step, the lantern and the returned `door` stand
 * in front of the real doorway); a hall's open tiles merge into one wide arch unless `arcade`.
 * The upper storeys jut out (jetty) at the front and the back only; the roof overhangs every wall
 * by ROOF_OVERHANG (houseEnvelope() gives the whole outline).
 * Returns { frame, top (eaves height), door (world pos), base, w, d }
 */
export function house(world, spec, rng) {
  const w = spec.w ?? 7, d = spec.d ?? 6;
  const floors = spec.floors ?? (rng() < 0.55 ? 2 : 1);
  const floorH = spec.floorH ?? 3.0;
  const gy = spec.y ?? world.heightAt(spec.x, spec.z);
  const F = new Frame(world, spec.x, gy, spec.z, spec.rot || 0);
  const roofVar = roofVariant(spec.roofTint) ?? Object.keys(ROOF_TINTS)[Math.floor(rng() * 5)];
  const open = spec.open || false;
  const jetty = spec.jetty ?? (floors > 1 && rng() < 0.5 ? 0.3 : 0);
  // Ground storey: stone or plaster; upper storeys: plaster, sometimes with a timber grid.
  const groundMat = spec.style === 'brick' || spec.style === 'wood' || (spec.style !== 'plaster' && rng() < 0.45) ? 'UnevenBrick' : 'Plaster';
  const grid = spec.style === 'wood' || rng() < 0.4;

  // Stone plinth absorbs the slope.
  F.box(w + PLINTH * 2, 0.9, d + PLINTH * 2, 0, -0.55, 0, 'stoneDark');
  const base = 0.35;
  world.addFootprint(spec.x, spec.z, w + PLINTH * 2, d + PLINTH * 2, spec.rot || 0, spec.kind || 'house');
  // Everything below is the near model; a proxy for the distance follows (World.lodDistance).
  const prevLod = world.lodMode;
  world.lodMode = 'near';
  // Door tiles of the front wall (walls() lays the front out in the same tiles).
  const n = Math.max(1, Math.round(w / 2)), tw = w / n;
  const tileX = (i) => -w / 2 + (i + 0.5) * tw;
  let doorX = typeof spec.door === 'number' ? spec.door : 0;
  let doorTiles = null; // [first, last] tile index of the doorway
  if (open === 'hall') {
    const gap = spec.doorWidth ?? 2.6;
    const hall = [...Array(n).keys()].filter((i) => Math.abs(tileX(i) - doorX) < gap / 2 + tw / 2 - 0.2);
    if (hall.length) doorTiles = [hall[0], hall[hall.length - 1]];
  } else if (!open && spec.door !== false) {
    const k = Math.min(n - 1, Math.max(0, Math.round((doorX + w / 2) / tw - 0.5)));
    doorTiles = [k, k];
  }
  if (doorTiles) doorX = (tileX(doorTiles[0]) + tileX(doorTiles[1])) / 2;

  let top = base;
  for (let f = 0; f < floors; f++) {
    const fd = d + (f > 0 ? jetty * 2 : 0);
    const y0 = base + f * floorH;
    // Tall halls get two rows of wall modules (the windows keep their proportions).
    const rows = Math.max(1, Math.round(floorH / 3.2));
    const rh = floorH / rows;
    for (let r = 0; r < rows; r++) {
      walls(F, w, fd, y0 + r * rh, rh, { spec, rng, mat: f === 0 && r === 0 ? groundMat : 'Plaster', grid: grid && (f > 0 || r > 0), ground: f === 0 && r === 0, open: f === 0 ? open : false, doorTiles });
    }
    if (f === 0 && open) openGround(F, w, d, y0, floorH, spec);
    if (f === 0 && spec.interior && !open) {
      // Walk-in ground floor: a plank floor and a ceiling under the upper storey / the roof.
      F.box(w - 0.62, 0.06, d - 0.62, 0, y0 - 0.02, 0, 'plank', { castShadow: false, tint: spec.floorTint ?? 0x8a6a44 });
      F.box(w - 0.5, 0.18, d - 0.5, 0, y0 + floorH - 0.2, 0, 'plank', { castShadow: false, tint: 0x6a4e34 });
      for (let k = -1; k <= 1; k++) F.box(0.22, 0.24, d - 0.6, (k * (w - 1)) / 3, y0 + floorH - 0.44, 0, 'timber', { collide: false, castShadow: false, tint: 0x4a3222 });
    }
    if (f > 0 && jetty) {
      // Corbels under the overhang.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(0.18, 0.4, 0.18, sx * (w / 2 - 0.1), y0 - 0.4, sz * (d / 2 + jetty * 0.5), 'timber', { ...deco, tint: TIMBER_DARK, rz: sx * 0.6 });
    }
    top = y0 + floorH;
  }
  // Door step (the closed houses' door is part of the front wall).
  let door = null;
  if (spec.door !== false && open !== 'shop') {
    const dz = d / 2 + 0.04;
    F.box(1.8, 0.57, 0.9, doorX, base - 0.55, dz + 0.4, 'stone', { castShadow: false }); // down to the plinth foot
    door = F.at(doorX, base, dz + 1.2);
    if (spec.lantern !== false && rng() < 0.7) lantern(world, F.sub(doorX + (doorX > 0.01 ? -1.3 : 1.3), base + 2.1, dz + 0.18)); // on the side towards the middle
  }
  // Climbing vines on a side wall now and then.
  if (spec.vines && rng() < spec.vines) {
    const vs = rng() < 0.5 ? -1 : 1;
    F.kit(V(['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine5'][Math.floor(rng() * 3)]), vs * (w / 2 + 0.1), base + 2.4, (rng() - 0.5) * (d - 2), { ry: vs * Math.PI / 2, s: 1.2, collide: false, castShadow: false, detail: true });
  }
  // A balcony on the first upper floor.
  if (spec.balcony && floors > 1) {
    const bx = (rng() - 0.5) * Math.max(0, w - 4);
    const by = base + floorH;
    F.kit(V('Balcony_Cross_Straight'), bx, by, d / 2 + (jetty || 0) - 0.9, { s: 1, collide: false, detail: false });
    F.box(2.0, 0.12, 1.1, bx, by - 0.12, d / 2 + (jetty || 0) + 0.45, 'plank', { collide: false, tint: 0x7a5c40 });
  }
  const ridge = villageRoof(F, w, d + jetty * 2, top, roofVar, spec);
  // Chimney.
  if (spec.chimney ?? rng() < 0.75) {
    const cx = (rng() < 0.5 ? -1 : 1) * (w / 2 - 1.1);
    const hgt = (ridge - top) * 0.8 + 1.0;
    F.kit(V('Prop_Chimney'), cx, top - 0.6, -d * 0.18, { sy: (hgt + 0.6) / 3.18, collide: false });
    world.addChimney(F.at(cx, top + hgt + 0.2, -d * 0.18));
  }
  world.lodMode = 'far';
  houseProxy(F, w, d, jetty, base, top, ridge, groundMat, roofVar, floors, floorH);
  world.lodMode = prevLod;
  return { frame: F, top, door, base: gy + base, w, d };
}

/** Plinth margin round the walls (m). */
const PLINTH = 0.15;
/**
 * Outline of a house() beyond its w × d walls (m): x = each side wall, z = front / back, for the
 * city plan (tools/plan/render_plan.mjs) — the roof overhang, the jetty of the upper storeys,
 * the plinth and the corner posts all stay inside it (the door step and signs stand in front).
 */
export function houseEnvelope(jetty = 0.3) {
  return { x: Math.max(ROOF_OVERHANG, PLINTH, 0.12), z: Math.max(ROOF_OVERHANG + jetty, PLINTH) };
}

/** Far version of a house: a box (wall colour), a gable roof prism and lit window strips. */
const PROXY_WALL = { Plaster: 0xe6dac2, UnevenBrick: 0x9a8e7c };
// Far roof colour = the near one: the village tile texture's mean albedo (linear 0.452, 0.095,
// 0.030, measured in the game) × the near tint (ROOF_TINTS) ÷ the mean of the proxy 'roof'
// material's noise map (0.69) — no colour pop at the LOD switch.
const PROXY_ROOF = { red: 0xd4683b, brown: 0x9f3915, green: 0x87471c, blue: 0x733c2b, slate: 0x813d23, purple: 0x913527, straw: 0xbf511d };
function houseProxy(F, w, d, jetty, base, top, ridge, groundMat, roofVar, floors, floorH) {
  const opts = { collide: false, castShadow: false };
  const dr = d + jetty * 2;
  F.box(w, top - base, dr, 0, base, 0, 'plaster', { ...opts, tint: PROXY_WALL[groundMat] ?? 0xe6dac2 });
  const roofTint = PROXY_ROOF[roofVar] ?? PROXY_ROOF.red;
  // Eaves ROOF_OVERHANG out and ~0.5 m below the wall top, like the near roof.
  F.put(gableGeometry(dr + ROOF_OVERHANG * 2, ridge - top + 0.5, w + ROOF_OVERHANG * 2), 1, 1, 1, 0, top - 0.5, 0, 'roof', { ...opts, tint: roofTint, ry: Math.PI / 2 });
  for (let f = 0; f < floors; f++) for (const s of [-1, 1]) F.box(w * 0.62, 0.9, 0.04, 0, base + f * floorH + 1.0, s * ((f > 0 ? dr : d) / 2 + 0.02), 'window', opts);
}

/** One storey (or one row of a tall hall) of wall modules around a w × d box. */
function walls(F, w, d, y0, h, o) {
  const { spec, rng, mat, grid, ground, open, doorTiles } = o;
  const sy = h / 3.0;
  const sides = [
    { along: 'x', len: w, off: d / 2, ry: 0, front: true },
    { along: 'x', len: w, off: -d / 2, ry: Math.PI },
    { along: 'z', len: d, off: w / 2, ry: Math.PI / 2 },
    { along: 'z', len: d, off: -w / 2, ry: -Math.PI / 2 },
  ];
  for (const s of sides) {
    const n = Math.max(1, Math.round(s.len / 2));
    const tw = s.len / n;
    const sx = tw / 2;
    for (let i = 0; i < n; i++) {
      const t = -s.len / 2 + (i + 0.5) * tw;
      // Module origin: its outer face (local z +0.09) lies on the wall plane.
      const inset = Math.sign(s.off) * 0.09;
      const px = s.along === 'x' ? t : s.off - inset;
      const pz = s.along === 'x' ? s.off - inset : t;
      const T = F.sub(px, y0, pz, s.ry);
      // `detail`: small inserts go into the distance-culled batches (World.detailDistance).
      const put = (name, opts = {}) => T.kit(V(name), opts.x ?? 0, 0, 0, { sx, sy, sz: 1, collide: opts.collide ?? true, castShadow: opts.cast ?? true, detail: !!opts.detail });
      const door = s.front && ground && doorTiles && i >= doorTiles[0] && i <= doorTiles[1];
      if (door && open === 'hall') {
        // Hall entrance: the open tiles make one wide arch (an arcade of single arches if `arcade`).
        const m = doorTiles[1] - doorTiles[0] + 1;
        if (spec.arcade || m === 1) put('Wall_Arch', { collide: false });
        else if (i === doorTiles[0]) T.kit(V('Wall_Arch'), (m - 1) * tw / 2, 0, 0, { sx: sx * m, sy, sz: 1, collide: false });
        continue;
      }
      const openTile = s.front && ground && (
        (open === 'shop' && (n <= 2 || i < n - 1)) || // the left end stays open: the way behind the counter
        (open === 'stable' || open === 'work'));
      if (openTile) {
        put('Wall_Arch', { collide: false });
        continue;
      }
      if (door) {
        if (spec.entrance === 'arch') {
          // Walk-in building: an open archway (≈ 1.8 m) with the leaf swung in flat against the
          // inner face of the side wall (the doorway is the corner tile next to it).
          put('Wall_Arch', { collide: false });
          const side = t < 0 ? -1 : 1;
          const lx = side * (w / 2 - 0.47) - t; // inner wall face (w/2 − 0.40) + half the leaf
          T.kit(V(spec.doorModel || 'Door_1_Round'), lx, 0, -0.36, { sx: sx * 0.9, sy, ry: Math.PI / 2, collide: false, detail: true });
          continue;
        }
        put(`Wall_${mat}_Door_Round`);
        put('DoorFrame_Round_WoodDark', { collide: false, detail: true });
        // A closed house: the shut leaf blocks the doorway (no walking into an empty shell).
        T.kit(V(spec.doorModel || 'Door_1_Round'), -0.5 * sx, 0, 0, { sx, sy, collide: 'box', detail: true });
        continue;
      }
      if (rng() < (ground ? 0.55 : 0.7)) {
        const W = WINDOW_KINDS[Math.floor(rng() * WINDOW_KINDS.length)];
        put(`Wall_${mat}_${W.wall}`);
        put(W.insert, { collide: false, detail: true });
        const sh = rng();
        if (sh < (spec.shutters ?? 0.55)) put(`${W.shutter}_${sh < 0.4 ? 'Open' : 'Closed'}`, { collide: false, cast: false, detail: true });
        if (!ground && spec.flowers && rng() < spec.flowers) {
          // Flower box under the window.
          T.box(1.2 * sx, 0.22, 0.3, 0, 0.92 * sy, 0.24, 'wood', { collide: false, castShadow: false, tint: 0x6a4428, detail: true });
          for (let k = 0; k < 3; k++) T.sphere(0.15, (-0.4 + k * 0.4) * sx, 0.92 * sy + 0.28, 0.24, 'flower', { collide: false, castShadow: false, tint: [0xe0506a, 0xf0c040, 0xc070e0, 0xf08040][(i + k) % 4], detail: true });
        }
        // A pane just inside the glass: lit at night.
        T.box(1.3 * sx, 1.45 * sy, 0.02, 0, 1.05 * sy, -0.27, 'window', { collide: false, castShadow: false });
        continue;
      }
      put(grid && mat === 'Plaster' && rng() < 0.6 ? 'Wall_Plaster_WoodGrid' : `Wall_${mat}_Straight`);
    }
  }
  // Timber corner posts.
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) F.kit(V('Corner_Exterior_Wood'), cx * w / 2, y0, cz * d / 2, { sy, collide: false });
}

/** Ground floor that opens to the street: a shop counter or a hall interior. */
function openGround(F, w, d, y0, h, spec) {
  if (spec.open === 'work') {
    // Workshop with an open front: a flagstone floor and a ceiling; the builder adds the tools.
    F.box(w - 0.6, 0.06, d - 0.6, 0, y0 - 0.02, 0, 'stone', { castShadow: false, tint: 0x9a9284 });
    F.box(w - 0.4, 0.2, d - 0.4, 0, y0 + h - 0.2, 0, 'plank', { tint: 0x5a4030 });
    return;
  }
  if (spec.open === 'stable') {
    // Stalls: a plank floor, partitions, hay and a trough along the back wall.
    F.box(w - 0.6, 0.06, d - 0.6, 0, y0 - 0.02, 0, 'plank', { castShadow: false, tint: 0x8a6a40 });
    const n = Math.max(2, Math.round(w / 3));
    for (let i = 1; i < n; i++) F.box(0.12, 1.3, d * 0.55, -w / 2 + (i * w) / n, y0, -d / 2 + d * 0.3, 'timber', { tint: TIMBER_DARK });
    F.box(w - 1.2, 0.5, 0.6, 0, y0, -d / 2 + 0.7, 'wood', { tint: 0x5a4030 });
    for (let i = 0; i < n; i++) F.kit('graveyard/hay-bale', -w / 2 + ((i + 0.5) * w) / n, y0, -d / 2 + 1.6, { s: 2.6, collide: 'box' });
    return;
  }
  if (spec.open === 'shop') {
    // Counter with a walk-through gap at one end (the owner comes and goes).
    const cw = w - 3.2;
    F.box(cw, 1.0, 0.7, 0.6, y0, d / 2 - 0.85, 'wood', { tint: 0x7a5232 });
    F.box(cw + 0.1, 0.08, 0.8, 0.6, y0 + 1.0, d / 2 - 0.8, 'plank', { ...deco });
    // Shelves along the back wall.
    for (const yy of [0.9, 1.6, 2.3]) F.box(w - 1.4, 0.08, 0.45, 0, y0 + yy, -d / 2 + 0.6, 'plank', deco);
    F.box(w - 0.6, 0.06, d - 0.6, 0, y0 - 0.02, 0, 'plank', { castShadow: false });
    // Awning.
    const aw = spec.awningTint ?? 0xb83a3a;
    F.box(w + 0.6, 0.06, 1.8, 0, y0 + h - 0.35, d / 2 + 0.75, 'cloth', { ...deco, tint: aw, rx: -0.32 });
  } else {
    F.box(w - 0.6, 0.06, d - 0.6, 0, y0 - 0.02, 0, 'plank', { castShadow: false });
    // Ceiling.
    F.box(w - 0.4, 0.2, d - 0.4, 0, y0 + h - 0.2, 0, 'plank', { tint: 0x8a6a4a });
  }
}

/**
 * Pre-built tiled roof (ridge along local x = the house's width) + brick gable fronts, fitted to
 * the w × d walls with ROOF_OVERHANG at the eaves and the gable ends (the module's own overhang
 * is ~1 m): the roof is scaled to the real kit bounds (asymmetric models re-centred) and lifted
 * until its underside meets the wall tops again; the gable fronts keep the pitch and fill the
 * triangle under the main slope down to the wall top. Returns the ridge height.
 */
function villageRoof(F, w, d, top, variant, spec) {
  const across = [4, 6, 8].reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  const along = ROOFS[across].reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  const name = V(`Roof_RoundTiles_${across}x${along}`);
  const bb = F.w.kits.box(name);
  const e = (bb.max.x - bb.min.x) / 2; // eave half-width of the model
  // Eaves: the wall plane must stay on the straight part of the underside (before the tile lip).
  const lip = ROOF_UNDER[across][ROOF_UNDER[across].length - 1][0];
  const oh = Math.max(spec.roofOverhang ?? ROOF_OVERHANG, (d / 2) * (e / lip - 1) + 0.02);
  const k = (d / 2 + oh) / e; // across scale
  const pitch = spec.pitch ? Math.tan(spec.pitch) / Math.tan(0.9) : 1;
  const ky = k * pitch;
  const lift = -ky * underAt(across, d / 2 / k); // underside meets the wall top at the wall plane
  const sz = (w + ROOF_OVERHANG * 2) / (bb.max.z - bb.min.z);
  const tint = ROOF_TINTS[variant] ?? null;
  // Roof model: across = local x, ridge = local z  ->  turn so the ridge runs along our x.
  F.kit(name, -((bb.min.z + bb.max.z) / 2) * sz, top + lift, ((bb.min.x + bb.max.x) / 2) * k, { ry: Math.PI / 2, sx: k, sy: ky, sz, collide: false, tint });
  // Gable fronts: the same main slope as the roof, standing on the wall top; thinned so their
  // purlin ends (0.79 out) stay under the trimmed overhang.
  const kg = k * (1 - underAt(across, d / 2 / k) / ROOF_ICPT[across]);
  const gz = Math.min(1, (ROOF_OVERHANG - 0.05 + 0.09) / 0.79);
  for (const s of [1, -1]) {
    F.kit(V(`Roof_Front_Brick${across}`), s * (w / 2 - 0.09), top, 0, { ry: s * Math.PI / 2, sx: kg, sy: kg * pitch, sz: gz, collide: false });
  }
  const ridge = { 4: 3.73, 6: 4.89, 8: 6.0 }[across];
  return top + lift + ridge * ky;
}

// -----------------------------------------------------------------------------------------
// Fortifications
// -----------------------------------------------------------------------------------------
/** Octagonal town wall with corner towers and four gatehouses on the cardinal axes. */
export function townWall(world, cx, cz, R, gateWidth = 7) {
  const sides = 8;
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / 8;
    verts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
  }
  const H = 6.5, T = 1.8;
  for (let i = 0; i < sides; i++) {
    const [ax, az] = verts[i];
    const [bx, bz] = verts[(i + 1) % sides];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    // Midpoints of these edges sit on the cardinal axes => gates.
    const onAxis = Math.abs(mx - cx) < 1 || Math.abs(mz - cz) < 1;
    const F = new Frame(world, mx, world.heightAt(mx, mz), mz, rot);
    const pieces = onAxis ? [[-len / 2, -gateWidth / 2 - 2.6], [gateWidth / 2 + 2.6, len / 2]] : [[-len / 2, len / 2]];
    for (const [a, b] of pieces) {
      const l = b - a, c = (a + b) / 2;
      F.box(l, H + 1.5, T, c, -1.5, 0, 'stone', { tint: 0xc8bca8 });
      F.box(l, 0.35, T + 0.5, c, H - 0.2, 0, 'stoneDark');
      // Crenellations.
      for (let x = a + 0.8; x < b - 0.6; x += 1.6) F.box(0.8, 0.8, T + 0.3, x, H + 0.15, 0, 'stone', { tint: 0xc8bca8, collide: false });
    }
    if (onAxis) gatehouse(world, F, gateWidth, H);
  }
  for (const [x, z] of verts) tower(world, x, z, 3.4, H + 4.5, 0x3e4a6a);
  return verts;
}

function gatehouse(world, F, gap, H) {
  for (const sx of [-1, 1]) {
    F.box(5, H + 4.5, 5.2, sx * (gap / 2 + 2.5), -1, 0, 'stone', { tint: 0xd0c4b0 });
    F.box(5.6, 0.4, 5.8, sx * (gap / 2 + 2.5), H + 3.5, 0, 'stoneDark');
    for (let k = -2; k <= 2; k += 2) F.box(0.8, 0.9, 0.8, sx * (gap / 2 + 2.5) + k, H + 3.9, 2.5, 'stone', { collide: false, tint: 0xd0c4b0 });
    F.cone(3.9, 3.4, sx * (gap / 2 + 2.5), H + 3.9, 0, 'roof', { tint: 0x3e4a6a, seg: 4, ry: Math.PI / 4 });
    // Banner.
    F.box(1.3, 2.6, 0.06, sx * (gap / 2 + 2.5), H - 1.0, 2.7, 'cloth', { ...deco, tint: 0xa82a2a });
    F.box(0.5, 0.5, 0.07, sx * (gap / 2 + 2.5), H + 0.4, 2.71, 'cloth', { ...decoNS, tint: 0xf0c050 });
  }
  // Arch over the road.
  F.box(gap + 1, 2.2, 5.2, 0, H + 0.3, 0, 'stone', { tint: 0xd0c4b0 });
  F.box(gap + 0.2, 0.5, 5.4, 0, H + 0.0, 0, 'stoneDark');
  // Opened gate leaves.
  for (const sx of [-1, 1]) F.box(0.25, 5.4, gap / 2, sx * (gap / 2 - 0.15), 0, 2.6 + gap / 4, 'door', { tint: 0x5a3a22, rx: 0 });
  world.addLightSource(F.at(-gap / 2 - 0.4, 4.2, 2.8), { color: 0xffa050, intensity: 6, distance: 12, night: true });
  world.addLightSource(F.at(gap / 2 + 0.4, 4.2, 2.8), { color: 0xffa050, intensity: 6, distance: 12, night: true });
}

export function tower(world, x, z, r, h, roofTint, opts = {}) {
  const y = world.heightAt(x, z);
  const F = new Frame(world, x, y, z, 0);
  F.cyl(r, h + 1.5, 0, -1.5, 0, 'stone', { seg: 12, tint: 0xc8bca8 });
  F.cyl(r + 0.35, 0.4, 0, h - 0.3, 0, 'stoneDark', { seg: 12 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    F.box(0.7, 0.8, 0.7, Math.cos(a) * (r + 0.1), h + 0.1, Math.sin(a) * (r + 0.1), 'stone', { collide: false, tint: 0xc8bca8, ry: -a });
  }
  if (roofTint !== null) F.cone(r + 0.9, r * 1.6, 0, h + 0.8, 0, 'roof', { tint: roofTint, seg: 12 });
  // Arrow slits.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    F.box(0.25, 1.1, 0.1, Math.cos(a) * r, h * 0.55, Math.sin(a) * r, 'window', { ...decoNS, ry: -a + Math.PI / 2 });
  }
  world.addFootprint(x, z, r * 2, r * 2, 0, 'tower');
  return F;
}

/**
 * City wall from the Kenney castle kit (geometry: 'wall', 'tower-square-*', 'wall-doorway', 'gate'),
 * faced with the Medieval Village stone texture (world-space UVs) so it matches the houses;
 * tower roofs are the village 'Roof_Tower_RoundTiles'.
 *
 * nodes: [{ x, z, gate?, big?, name? }] in order around the city (closed loop). Towers stand on
 * plain nodes, gatehouses on gate nodes; the curtain wall runs between them without gaps.
 * opts: { height, thickness, gateWidth, groupFor(node, i) -> group id | null }
 * Returns [{ node, frame }] of the gates (frame: +z = outside, x along the wall).
 */
const STONE = { mat: 'kit_village_MI_UnevenBrick', scale: 0.42, only: 'kit_castle' };
export function cityWall(world, nodes, opts = {}) {
  const H = opts.height ?? 7.5, T = opts.thickness ?? 3, GW = opts.gateWidth ?? 7;
  const n = nodes.length;
  const cx = nodes.reduce((s, p) => s + p.x, 0) / n, cz = nodes.reduce((s, p) => s + p.z, 0) / n;
  // Wall direction at a node (bisector of the two segments) and the outward normal.
  const dirAt = (i) => {
    const a = nodes[(i + n - 1) % n], b = nodes[i], c = nodes[(i + 1) % n];
    const dx = (b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z) + (c.x - b.x) / Math.hypot(c.x - b.x, c.z - b.z);
    const dz = (b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z) + (c.z - b.z) / Math.hypot(c.x - b.x, c.z - b.z);
    const L = Math.hypot(dx, dz);
    return [dx / L, dz / L];
  };
  // Half-length of the curtain-free zone around a node (tower half-size / half a gatehouse); at a
  // bend the outer corner of the wall end reaches (T/2)·tan(bend/2) further, so the end steps back.
  const TW = (node) => (node.big ? 8 : 6);
  const bendAt = (i) => {
    const a = nodes[(i + n - 1) % n], b = nodes[i], c = nodes[(i + 1) % n];
    const t = Math.atan2(c.z - b.z, c.x - b.x) - Math.atan2(b.z - a.z, b.x - a.x);
    return Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
  };
  const keep = (i) => (nodes[i].gate ? GW * 0.94 - 0.4 : TW(nodes[i]) / 2 - 0.4 - (T / 2) * Math.tan(bendAt(i) / 2));
  const gates = [];
  const groupFor = opts.groupFor || (() => null);
  const inGroup = (id, pivot, fn, label) => (id ? world.group(id, pivot, fn, label) : fn());
  // Curtain wall segments: pieces overlap by OVER (the castle-kit 'wall' has open end columns
  // ~0.16 m deep — less overlap leaves see-through slits at the joints); each piece is sheared to
  // follow the ground between its ends (no steps between neighbours, no floating corner).
  const OVER = 0.45;
  inGroup(opts.wallGroup, { x: cx, z: cz }, () => {
    for (let i = 0; i < n; i++) {
      const A = nodes[i], B = nodes[(i + 1) % n];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const tx = (B.x - A.x) / L, tz = (B.z - A.z) / L;
      const s0 = keep(i), s1 = L - keep((i + 1) % n);
      const m = Math.max(1, Math.round((s1 - s0) / 4.2));
      const len = (s1 - s0) / m;
      const rot = Math.atan2(tx, tz) - Math.PI / 2; // local x along the wall
      const ground = (t) => Math.min(world.heightAt(A.x + tx * t - tz * T / 2, A.z + tz * t + tx * T / 2), world.heightAt(A.x + tx * t + tz * T / 2, A.z + tz * t - tx * T / 2));
      for (let k = 0; k < m; k++) {
        const t = s0 + (k + 0.5) * len, sx = len + OVER;
        const y0 = ground(t - sx / 2), y1 = ground(t + sx / 2);
        _m.makeScale(sx, (H + 1.2) / 1.31, T)
          .premultiply(_mS.set(1, 0, 0, 0, (y1 - y0) / sx, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))
          .premultiply(_mR.makeRotationY(rot))
          .setPosition(A.x + tx * t, (y0 + y1) / 2 - 1.2, A.z + tz * t);
        world.addKit('castle/wall', _m, { collide: 'box', retex: STONE });
      }
    }
  });
  // Towers and gatehouses.
  for (let i = 0; i < n; i++) {
    const N = nodes[i];
    const [dx, dz] = dirAt(i);
    let rot = Math.atan2(dx, dz) - Math.PI / 2;
    // Local +z must point outside the city.
    const ox = Math.sin(rot), oz = Math.cos(rot);
    if ((N.x - cx) * ox + (N.z - cz) * oz < 0) rot += Math.PI;
    if (N.gate) {
      inGroup(groupFor(N, i), { x: N.x, z: N.z, rot }, () => {
        const F = new Frame(world, N.x, world.heightAt(N.x, N.z), N.z, rot);
        gatehouse2(world, F, GW, H, N);
        gates.push({ node: N, frame: F });
      }, N.name || 'Ворота');
    } else {
      inGroup(groupFor(N, i), { x: N.x, z: N.z, rot }, () => {
        const S = TW(N);
        const F = new Frame(world, N.x, world.heightAt(N.x, N.z) - 1.2, N.z, rot);
        kitTower(world, F, S, H + 1.2 + (N.big ? 6 : 3.5));
        world.addFootprint(N.x, N.z, S, S, rot, 'tower');
      }, N.name || 'Башня');
    }
  }
  return gates;
}

/** Square tower: castle-kit base / mid floors / crenellated top, village tile roof. Base at the frame. */
function kitTower(world, F, S, height) {
  const baseH = Math.min(5, height * 0.4);
  F.kit('castle/tower-square-base', 0, 0, 0, { sx: S, sy: baseH / 1.01, sz: S, collide: 'box', retex: STONE });
  const mids = Math.max(1, Math.round((height - baseH - 1) / 4.5));
  const midH = (height - baseH - 0.9) / mids;
  for (let k = 0; k < mids; k++) F.kit(k === mids - 1 ? 'castle/tower-square-mid-windows' : 'castle/tower-square-mid', 0, baseH + k * midH, 0, { sx: S, sy: midH / 1.01, sz: S, collide: 'box', retex: STONE });
  F.kit('castle/tower-square-top', 0, height - 0.9, 0, { sx: S * 1.04, sy: 3, sz: S * 1.04, collide: false, retex: STONE });
  const rs = (S * 1.08) / 5.66;
  F.kit('village/Roof_Tower_RoundTiles', 0, height - 0.9 + 0.57 * rs + 0.25, 0, { s: rs, collide: false });
}

/**
 * Gatehouse: the castle kit's 'tower-square-arch' stretched into a gate tower with a carriage
 * passage (≈ gw wide, 5.6 m high at the crown), a floor and a tiled roof above; open gate leaves.
 */
function gatehouse2(world, F, gw, H, node) {
  const SX = gw * 2, SZ = 7, SY = (H + 1.2) / 1.01;
  const y = -1.2;
  F.kit('castle/tower-square-arch', 0, y, 0, { sx: SX, sy: SY, sz: SZ, collide: true, retex: STONE });
  F.kit('castle/tower-square-mid-windows', 0, y + SY * 1.01, 0, { sx: SX * 0.9, sy: 3.4, sz: SZ * 0.9, collide: 'box', retex: STONE });
  F.kit('castle/tower-square-top', 0, y + SY * 1.01 + 3.4, 0, { sx: SX * 0.94, sy: 3, sz: SZ * 0.94, collide: false, retex: STONE });
  F.kit('village/Roof_Tower_RoundTiles', 0, y + SY * 1.01 + 3.4 + 0.9, 0, { sx: (SX * 0.95) / 5.66, sy: 1.1, sz: (SZ * 0.95) / 5.42, collide: false });
  // The arch model is open on all four faces: its side arches (±0.274·SZ, wider than the curtain
  // wall) are walled up from the passage wall to the side face, up into the vault.
  const clear = SX * 0.274; // passage half-width
  const p0 = clear - 0.03, p1 = SX * 0.47 - 0.02; // a hair off the arch faces (no z-fight)
  for (const sx of [-1, 1]) F.kit('castle/tower-square-base', (sx * (p0 + p1)) / 2, y, 0, { sx: p1 - p0, sy: (SY * 0.86) / 1.01, sz: SZ * 0.274 * 2 + 0.3, collide: 'box', retex: STONE });
  // Opened gate leaves folded flat against the passage walls.
  for (const sx of [-1, 1]) F.kit('castle/gate', sx * (p0 - 0.1), 0, -0.4, { sx: 1.2, sy: 4.2, sz: 4.4, collide: false });
  // Banners on the outer face, lanterns at night.
  const tint = { north: 0x2f5a8a, east: 0xa82a2a, south: 0xc89a30, west: 0x3a7a4a }[node.gate] ?? 0xa82a2a;
  const face = (SZ * 0.94) / 2 + 0.05;
  for (const sx of [-1, 1]) {
    F.box(1.4, 3.0, 0.06, sx * (gw / 2 + 2.2), H - 3.4, face, 'cloth', { ...deco, tint });
    F.box(0.6, 0.6, 0.07, sx * (gw / 2 + 2.2), H - 1.8, face + 0.02, 'cloth', { ...decoNS, tint: 0xf0c050 });
  }
  world.addLightSource(F.at(-gw / 2 - 1, 4.0, face + 0.6), { color: 0xffa050, intensity: 6, distance: 12, night: true });
  world.addLightSource(F.at(gw / 2 + 1, 4.0, -face - 0.6), { color: 0xffa050, intensity: 6, distance: 12, night: true });
  world.addFootprint(F.origin.x, F.origin.z, SX * 0.94, SZ * 0.94, F.rot, 'gate');
}

// -----------------------------------------------------------------------------------------
// Paving
// -----------------------------------------------------------------------------------------
/**
 * Paving is draped on the terrain: every vertex sits `lift` m above the ground (heightAt), so no
 * slab floats over a slope or sinks into it. Overlapping paving uses distinct lifts (Town.js
 * PAVE_LIFT: squares over streets over lanes over the pomerium) — no coplanar faces to z-fight.
 * A skirt along the edges reaches into the ground. Geometry goes to the static batches.
 */
const SKIRT = 0.14;
const _tri = (pos, a, b, c, up) => {
  // Keep the winding so the face looks along `up` ([x, y, z]).
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  if (n[0] * up[0] + n[1] * up[1] + n[2] * up[2] < 0) [b, c] = [c, b];
  pos.push(...a, ...b, ...c);
};
function pavingSolid(world, pos, mat, opts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  world.addSolid(g, _m.identity(), mat, opts);
}

/** Sutherland–Hodgman: polygon [[x, z]…] clipped to a counter-clockwise triangle. */
function clipToTri(subject, tri) {
  let out = subject;
  for (let i = 0; i < 3 && out.length; i++) {
    const A = tri[i], B = tri[(i + 1) % 3], inp = out;
    out = [];
    const side = (P) => (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]);
    for (let k = 0; k < inp.length; k++) {
      const P = inp[k], Q = inp[(k + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
const ccwTri = (t) => ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) >= 0 ? t : [t[0], t[2], t[1]]);
/**
 * A triangle [[x, z] ×3] laid exactly on the terrain mesh: cut by the height grid's own triangles
 * (Terrain.Heightfield: a-c-b / c-e-b per cell), every piece `lift` above them. Where the ground
 * under it is one plane anyway the triangle stays whole.
 */
function drapeTri(world, tri, lift, pos) {
  const H = (x, z) => world.heightAt(x, z);
  const T = ccwTri(tri);
  const v3 = ([x, z]) => [x, H(x, z) + lift, z];
  // Planar enough? Compare the flat triangle with the ground inside it.
  const [p0, p1, p2] = T.map(v3);
  let flat = true;
  for (const [u, v] of [[1 / 3, 1 / 3], [0.5, 0], [0, 0.5], [0.5, 0.5], [0.25, 0.25], [0.6, 0.2], [0.2, 0.6]]) {
    const x = p0[0] + (p1[0] - p0[0]) * u + (p2[0] - p0[0]) * v, z = p0[2] + (p1[2] - p0[2]) * u + (p2[2] - p0[2]) * v;
    const y = p0[1] + (p1[1] - p0[1]) * u + (p2[1] - p0[1]) * v;
    if (Math.abs(y - H(x, z) - lift) > 0.01) { flat = false; break; }
  }
  if (flat) { _tri(pos, p0, p1, p2, [0, 1, 0]); return; }
  const xs = T.map((q) => q[0]), zs = T.map((q) => q[1]);
  const i0 = Math.floor((Math.min(...xs) + HALF) / GRID_STEP), i1 = Math.ceil((Math.max(...xs) + HALF) / GRID_STEP);
  const j0 = Math.floor((Math.min(...zs) + HALF) / GRID_STEP), j1 = Math.ceil((Math.max(...zs) + HALF) / GRID_STEP);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const x0 = -HALF + i * GRID_STEP, z0 = -HALF + j * GRID_STEP, x1 = x0 + GRID_STEP, z1 = z0 + GRID_STEP;
    for (const cell of [[[x0, z0], [x0, z1], [x1, z0]], [[x0, z1], [x1, z1], [x1, z0]]]) {
      const piece = clipToTri(ccwTri(cell), T);
      for (let k = 1; k + 1 < piece.length; k++) _tri(pos, v3(piece[0]), v3(piece[k]), v3(piece[k + 1]), [0, 1, 0]);
    }
  }
}

/** Polyline resampled to points ≤ `step` apart (closed: back to the first point). */
function resample(pts, step, closed) {
  const src = closed ? [...pts, pts[0]] : pts, out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const [ax, az] = src[i], [bx, bz] = src[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  if (!closed) out.push(src[src.length - 1]);
  return out;
}

/** Mitred side vector (left normal / cos of the half bend) at every point of a polyline. */
function sideVectors(p, closed) {
  const n = p.length, out = [];
  const dir = (i, j) => { const dx = p[j][0] - p[i][0], dz = p[j][1] - p[i][1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? dir(i - 1, i) : closed ? dir(n - 1, 0) : null;
    const next = i < n - 1 ? dir(i, i + 1) : closed ? dir(n - 1, 0) : null;
    const t = prev && next ? [prev[0] + next[0], prev[1] + next[1]] : prev || next;
    const L = Math.hypot(t[0], t[1]) || 1;
    const nx = -t[1] / L, nz = t[0] / L;
    const ref = next || prev;
    const k = Math.min(2, 1 / Math.max(0.5, nx * -ref[1] + nz * ref[0]));
    out.push([nx * k, nz * k]);
  }
  return out;
}

/**
 * Street paving along a centre line (world [x, z]): a ribbon `width` wide, `lift` above the
 * ground, mitred at the bends. opts: { tint, lift, closed, kerb, covered(x, z), kerbSkip(x, z) } —
 * `covered`: points under higher paving (a square): runs inside it are left out; `kerbSkip`:
 * no kerb there (squares, crossing streets). Returns the resampled centre line.
 */
export function paveRibbon(world, pts, width, opts = {}) {
  const lift = opts.lift ?? 0.08, closed = !!opts.closed;
  const p = resample(pts, 2, closed), side = sideVectors(p, closed);
  const n = p.length, segs = closed ? n : n - 1;
  const cols = Math.max(2, Math.ceil(width / 2.2) + 1);
  const H = (x, z) => world.heightAt(x, z);
  const at = (i, o, dy) => { const [x, z] = p[i % n], [sx, sz] = side[i % n]; const X = x + sx * o, Z = z + sz * o; return [X, H(X, Z) + dy, Z]; };
  const cov = p.map(([x, z]) => !!opts.covered?.(x, z));
  const keep = (i) => !(cov[i % n] && cov[(i + 1) % n] && (closed || i > 0 ? cov[(i + n - 1) % n] : true) && (closed || i + 2 < n ? cov[(i + 2) % n] : true));
  const pos = [], up = [0, 1, 0];
  for (let i = 0; i < segs; i++) {
    if (!keep(i)) continue;
    for (let j = 0; j < cols - 1; j++) {
      const o0 = -width / 2 + (j * width) / (cols - 1), o1 = -width / 2 + ((j + 1) * width) / (cols - 1);
      const a = at(i, o0, lift), b = at(i + 1, o0, lift), c = at(i, o1, lift), d = at(i + 1, o1, lift);
      const xz = (q) => [q[0], q[2]];
      drapeTri(world, [xz(a), xz(c), xz(b)], lift, pos);
      drapeTri(world, [xz(b), xz(c), xz(d)], lift, pos);
    }
    // Skirts along both edges, end caps where the run starts / stops.
    for (const o of [-width / 2, width / 2]) {
      const [sx, sz] = side[i % n], out = [Math.sign(o) * sx, 0, Math.sign(o) * sz];
      const a = at(i, o, lift), b = at(i + 1, o, lift), a2 = at(i, o, -SKIRT), b2 = at(i + 1, o, -SKIRT);
      _tri(pos, a, a2, b, out);
      _tri(pos, b, a2, b2, out);
    }
    for (const [k, prevOk] of [[i, closed || i > 0 ? keep((i + segs - 1) % segs) : false], [i + 1, closed || i + 1 < segs ? keep((i + 1) % segs) : false]]) {
      if (prevOk) continue;
      const t = [p[(i + 1) % n][0] - p[i][0], 0, p[(i + 1) % n][1] - p[i][1]];
      const out = k === i ? [-t[0], 0, -t[2]] : t;
      const a = at(k, -width / 2, lift), b = at(k, width / 2, lift), a2 = at(k, -width / 2, -SKIRT), b2 = at(k, width / 2, -SKIRT);
      _tri(pos, a, a2, b, out);
      _tri(pos, b, a2, b2, out);
    }
  }
  if (pos.length) pavingSolid(world, pos, 'cobble', { castShadow: false, tint: opts.tint ?? 0xb0a898 });
  if (opts.kerb) {
    // Kerb stones along both edges (mitred like the street), cut where squares / streets meet.
    const kp = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < segs; i++) {
        const mid = at(i, s * (width / 2 + 0.13), 0), mid2 = at(i + 1, s * (width / 2 + 0.13), 0);
        if (opts.kerbSkip?.(mid[0], mid[2]) || opts.kerbSkip?.(mid2[0], mid2[2]) || !keep(i)) continue;
        const [sx, sz] = side[i % n];
        const inner = s * (width / 2), outer = s * (width / 2 + 0.26);
        const a = at(i, inner, lift + 0.07), b = at(i + 1, inner, lift + 0.07), c = at(i, outer, lift + 0.07), d = at(i + 1, outer, lift + 0.07);
        _tri(kp, a, c, b, up);
        _tri(kp, b, c, d, up);
        const out = [s * sx, 0, s * sz];
        const c2 = at(i, outer, -0.05), d2 = at(i + 1, outer, -0.05);
        _tri(kp, c, c2, d, out);
        _tri(kp, d, c2, d2, out);
        const a2 = at(i, inner, lift - 0.02), b2 = at(i + 1, inner, lift - 0.02), inn = [-s * sx, 0, -s * sz];
        _tri(kp, a, a2, b, inn);
        _tri(kp, b, a2, b2, inn);
      }
    }
    if (kp.length) pavingSolid(world, kp, 'stoneDark', { castShadow: false, collide: false, detail: true });
  }
  return p;
}

/**
 * Paved polygon (a square, world [x, z]) draped on the ground: its triangles cut by the terrain's
 * grid triangles, `lift` above them, with a skirt round the edge. opts: { tint, lift }
 */
export function pavePoly(world, pts, opts = {}) {
  const lift = opts.lift ?? 0.1;
  const H = (x, z) => world.heightAt(x, z);
  // Counter-clockwise copy (x, z) for the clipping, then fan triangles of the polygon itself.
  let poly = pts.map(([x, z]) => [x, z]);
  const area = poly.reduce((s, q, i) => { const r = poly[(i + 1) % poly.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0);
  if (area < 0) poly = poly.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []).map((t) => t.map((k) => poly[k]));
  const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
  const pos = [];
  for (const T of tris) drapeTri(world, T, lift, pos);
  // Skirt round the edge (outward).
  const ring = resample(poly, 2, true);
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length, cz = zs.reduce((s, v) => s + v, 0) / zs.length;
  for (let k = 0; k < ring.length; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % ring.length];
    const out = [(ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz];
    const a = [ax, H(ax, az) + lift, az], b = [bx, H(bx, bz) + lift, bz], a2 = [ax, H(ax, az) - SKIRT, az], b2 = [bx, H(bx, bz) - SKIRT, bz];
    _tri(pos, a, a2, b, out);
    _tri(pos, b, a2, b2, out);
  }
  pavingSolid(world, pos, 'cobble', { castShadow: false, tint: opts.tint ?? 0xbab2a2 });
}

// -----------------------------------------------------------------------------------------
// Bridges, fences, small structures
// -----------------------------------------------------------------------------------------
/** Stone arch bridge from (ax,az) to (bx,bz) with deck at `deckY`. */
export function bridge(world, ax, az, bx, bz, width, deckY) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(bx - ax, bz - az);
  const F = new Frame(world, mx, deckY, mz, rot);
  // Deck (z along the bridge).
  F.box(width, 0.5, len, 0, -0.5, 0, 'stone', { tint: 0xbcb2a0 });
  F.box(width - 0.6, 0.06, len, 0, 0, 0, 'cobble', { castShadow: false });
  // Ramps at both ends.
  // Ramps at both ends run down to the actual ground (no slab hanging in the air) and an
  // abutment fills the bank under each deck end.
  for (const s of [-1, 1]) {
    const endAt = (dz) => { const p = F.at(0, 0, s * (len / 2 + dz)); return world.heightAt(p.x, p.z); };
    let L = 4;
    let drop = deckY - endAt(L);
    L = Math.min(12, Math.max(4, drop * 5));
    drop = Math.max(0, deckY - endAt(L));
    const th = Math.atan2(drop, L);
    const len2 = Math.hypot(L, drop) + 0.4;
    F.box(width, 0.6, len2, 0, -drop / 2 - 0.6, s * (len / 2 + L / 2), 'stone', { tint: 0xbcb2a0, rx: s * th });
    const bank = Math.max(0.5, deckY - endAt(0.6) + 1.2);
    F.box(width, bank, 1.4, 0, -bank, s * (len / 2 + 0.5), 'stone', { tint: 0xa89e8c });
  }
  // Parapets.
  for (const sx of [-1, 1]) {
    F.box(0.45, 0.9, len, sx * (width / 2 - 0.22), 0, 0, 'stone', { tint: 0xc8bca8 });
    F.box(0.6, 0.15, len + 0.2, sx * (width / 2 - 0.22), 0.9, 0, 'stoneDark');
  }
  // Arch piers in the water.
  for (const s of [-0.3, 0.3]) F.box(width - 0.4, 3.0, 2.2, 0, -3.4, s * len, 'stone', { tint: 0xa89e8c });
  F.box(width - 0.8, 0.7, len * 0.5, 0, -1.2, 0, 'stoneDark');
  // Lamps.
  for (const s of [-1, 1]) lamp(world, F.at(-width / 2 + 0.3, 0.9, s * len * 0.42), 0);
  world.addFootprint(mx, mz, width, len, rot, 'bridge');
  return F;
}

/** Wooden plank bridge (smaller crossings, interiors). */
export function plankBridge(world, ax, az, bx, bz, width, deckY) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(bx - ax, bz - az);
  const F = new Frame(world, mx, deckY, mz, rot);
  for (let z = -len / 2 + 0.3; z < len / 2; z += 0.62) F.box(width, 0.12, 0.56, 0, -0.12, z, 'plank', { tint: 0x8a6a48 });
  for (const sx of [-1, 1]) {
    F.box(0.14, 0.14, len, sx * (width / 2), 0.85, 0, 'log', deco);
    for (let z = -len / 2; z <= len / 2; z += 2) F.box(0.14, 0.95, 0.14, sx * (width / 2), -0.1, z, 'log', deco);
    for (let z = -len / 2; z <= len / 2; z += 4) F.box(0.25, 2.5, 0.25, sx * (width / 2), -2.4, z, 'log', deco);
  }
  // Invisible rails so nobody walks off by accident.
  for (const sx of [-1, 1]) F.box(0.1, 1, len, sx * (width / 2 + 0.05), 0, 0, 'plank', { collideOnly: true });
  world.addFootprint(mx, mz, width, len, rot, 'bridge');
}

/** Fence (Kenney town fence modules, 2.6 m each) along a polyline of [x, z] points. */
export function fence(world, points, opts = {}) {
  const S = 2.6;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / S));
    const rot = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (roadInfo(x, z).d < 1.6) continue; // never fence a road off
      const y = world.heightAt(x, z);
      // The module stands on its tile's +x edge (x 0.42..0.5): shift it onto the line.
      new Frame(world, x, y - 0.05, z, rot).kit('town/fence', -0.46 * S, 0, 0, { sx: S, sy: 2.7, sz: len / n, collide: opts.open ? false : 'box' });
    }
  }
}

/** Street lamp: Kenney lantern post + a glass that glows at night. */
export function lamp(world, pos, rot = 0) {
  const F = new Frame(world, pos.x, pos.y, pos.z, rot);
  F.kit('town/lantern', 0, 0, 0, { s: 1.75, collide: 'box', tint: 0x4a4642 }); // wrought iron
  F.box(0.2, 0.28, 0.2, 0, 2.2, 0, 'lampGlass', decoNS);
  world.addLightSource(F.at(0, 2.35, 0), { color: 0xffb060, intensity: 4, distance: 10, night: true });
}

export function lantern(world, F) {
  F.box(0.24, 0.34, 0.24, 0, 0, 0, 'metal', deco);
  F.box(0.18, 0.26, 0.18, 0, 0.04, 0, 'lampGlass', decoNS);
  F.cone(0.2, 0.16, 0, 0.34, 0, 'metal', { ...deco, seg: 6 });
  world.addLightSource(F.at(0, 0.15, 0), { color: 0xffb060, intensity: 4, distance: 10, night: true });
}

export function barrel(world, F, lx, lz) {
  F.kit('food/barrel', lx, 0, lz, { s: 1.45, ry: lx * 7.1 + lz * 3.3, collide: 'box' });
}

export function crate(world, F, lx, lz, s = 0.8, ry = 0) {
  F.kit('village/Prop_Crate', lx, 0, lz, { s: s / 1.06, ry, collide: 'box' });
}

/** Food kit model at real size (the kit is modelled ~2.5× too large). */
export function food(F, name, lx, ly, lz, opts = {}) {
  F.kit('food/' + name, lx, ly, lz, { s: 0.42 * (opts.s ?? 1), ry: opts.ry ?? 0, collide: false, castShadow: false, detail: true });
}

/**
 * Any kit piece centred on a local point (furniture models have their origin at a corner).
 * opts: { s (scale, default 2.3 = the furniture kit at real size), ry, collide }
 */
export function prop(F, name, lx, ly, lz, opts = {}) {
  const s = opts.s ?? 2.3;
  const b = F.w.kits.box(name);
  const S = F.sub(lx, ly, lz, opts.ry ?? 0);
  S.kit(name, -(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s, { s, collide: opts.collide ?? 'box', castShadow: opts.castShadow ?? true, tint: opts.tint ?? null });
}

/** A laid table top: a few food-kit dishes around (lx, y, lz). */
export function tableware(F, lx, y, lz, rng, kind = 'tavern') {
  const sets = {
    tavern: [['mug', 0.9], ['mug', 0.9], ['plate', 0.7], ['meat-cooked', 0.7], ['bread', 0.8], ['wine-red', 0.7], ['cheese', 0.6], ['bowl-soup', 0.7]],
    guild: [['mug', 0.9], ['plate', 0.7], ['apple', 0.9], ['cup-tea', 0.9], ['bread', 0.8]],
    bakery: [['loaf', 1], ['loaf-round', 1], ['loaf-baguette', 1], ['croissant', 1], ['pie', 0.8], ['bread', 1]],
  }[kind];
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const [name, s] = sets[Math.floor(rng() * sets.length)];
    const a = rng() * Math.PI * 2, r = 0.15 + rng() * 0.3;
    if (F.w.kits.has('food/' + name)) food(F, name, lx + Math.cos(a) * r, y, lz + Math.sin(a) * r, { s, ry: rng() * 6.28 });
  }
}

const GOODS = {
  bread: ['loaf', 'loaf-round', 'loaf-baguette', 'bread', 'croissant', 'pie', 'loaf'],
  fruit: ['apple', 'pear', 'orange', 'grapes', 'lemon', 'strawberry', 'cherries', 'watermelon', 'apple'],
  veg: ['cabbage', 'carrot', 'pumpkin', 'onion', 'tomato', 'corn', 'eggplant', 'leek', 'beet', 'radish'],
  mixed: ['cheese', 'fish', 'meat-raw', 'whole-ham', 'honey', 'sausage', 'mushroom', 'wine-red', 'bag'],
};

/** Market stall (Kenney stall with a cloth canopy) with real goods on the counter. Front = +z. */
export function stall(world, x, z, rot, clothTint, goods = 'mixed', rng) {
  const y = world.heightAt(x, z);
  const F = new Frame(world, x, y, z, rot);
  const c = new THREE.Color(clothTint);
  const kind = c.g > c.r ? 'town/stall-green' : 'town/stall-red';
  F.kit(kind, 0, 0, 0.3, { s: 2.8, ry: Math.PI / 2, collide: 'box' });
  const list = GOODS[goods] || GOODS.mixed;
  for (let i = 0; i < 7; i++) {
    const name = list[Math.floor(rng() * list.length)];
    if (!world.kits.has('food/' + name)) continue;
    food(F, name, -1.05 + i * 0.35, 1.04, 0.75 + (rng() - 0.5) * 0.3, { ry: rng() * 6.28 });
  }
  world.addFootprint(x, z, 3.4, 2.6, rot, 'stall');
  return F;
}

export function well(world, x, z) {
  const y = world.heightAt(x, z);
  const F = new Frame(world, x, y, z, 0);
  F.cyl(1.1, 1.0, 0, -0.1, 0, 'stone', { seg: 16, tint: 0xb8ae9c });
  F.cyl(0.9, 0.06, 0, 0.7, 0, 'water', decoNS);
  for (const sx of [-1, 1]) F.box(0.16, 2.2, 0.16, sx * 1.0, 0.8, 0, 'log', deco);
  F.box(2.4, 0.14, 0.14, 0, 2.5, 0, 'log', deco);
  F.box(2.5, 0.14, 1.6, 0, 2.75, 0, 'roof', { ...deco, tint: 0x8a3a2a, rx: 0 });
  F.cyl(0.18, 0.3, 0, 1.6, 0, 'wood', { ...deco, seg: 8 });
  world.addFootprint(x, z, 2.2, 2.2, 0, 'well');
}

export function bench(world, F, lx, lz, ry = 0) {
  F.kit('town/stall-bench', lx, 0, lz, { s: 2, ry: ry + Math.PI / 2, collide: false });
}

/** Covered merchant wagon (caravans). */
export function wagon(world, x, z, rot, coverTint = 0xe8dcc0) {
  const y = world.heightAt(x, z);
  const F = new Frame(world, x, y, z, rot);
  F.box(1.8, 0.7, 3.6, 0, 0.6, 0, 'wood', { tint: 0x7a5232 });
  for (const sz of [-1.2, 1.2]) for (const sx of [-1, 1]) F.cyl(0.55, 0.12, sx * 1.0, 0.55, sz, 'wood', { tint: 0x5a3a22, rz: Math.PI / 2, seg: 12, collide: false });
  // Canvas cover: half cylinder.
  // Canvas cover: the upper half of a cylinder lying along the wagon.
  F.put(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, Math.PI / 2, Math.PI).translate(0, 0.5, 0), 0.95, 3.2, 0.95, 0, 1.3, -1.6, 'cloth', { tint: coverTint, rx: Math.PI / 2 });
  F.box(0.08, 0.08, 1.8, 0, 0.9, 2.6, 'log', deco); // shaft
  world.addFootprint(x, z, 2, 3.8, rot, 'wagon');
  return F;
}

export function haystack(world, x, z, s = 1) {
  const y = world.heightAt(x, z);
  new Frame(world, x, y - 0.05, z, x * 1.7 + z).kit(s > 0.8 ? 'graveyard/hay-bale-bundled' : 'graveyard/hay-bale', 0, 0, 0, { s: 3.2 * s, collide: 'box' });
}

// -----------------------------------------------------------------------------------------
// Vegetation
// -----------------------------------------------------------------------------------------
// Quaternius Stylized Nature trees / bushes / rocks ('wilds' kit). Trees and bushes are drawn
// instanced with distance LOD (world/TreeField.js); inside an editable group in the map editor
// they are merged into the group instead, so they move with it.
const TREES = {
  oak: ['CommonTree_1', 'CommonTree_2', 'CommonTree_4', 'CommonTree_1'],
  birch: ['CommonTree_3', 'CommonTree_5'],
  pine: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'],
  dark: ['Pine_2', 'Pine_3', 'Pine_4', 'CommonTree_2'],
};
const TREE_H = { oak: 8.2, pine: 10.5, birch: 8.5, dark: 10 };
const BUSHES = ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'];
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** Place a kit model scaled to a wanted height (m). */
function kitToHeight(world, F, name, height, opts = {}) {
  const b = world.kits.box(name);
  const s = height / Math.max(0.05, b.max.y - b.min.y);
  F.kit(name, 0, -b.min.y * s, 0, { ...opts, s });
  return s;
}

/** Instanced vegetation (or merged into the editor group being built). */
function plant(world, name, x, y, z, rot, height, opts) {
  const b = world.kits.box(name);
  const s = height / Math.max(0.05, b.max.y - b.min.y);
  if (world.editorMode && world._group) {
    new Frame(world, x, y, z, rot).kit(name, 0, -b.min.y * s, 0, { s, collide: false, castShadow: !opts.nearOnly });
    return s;
  }
  const p = world.xf(new THREE.Vector3(x, y - b.min.y * s, z));
  const g = world._group;
  world.trees.add(name, p.x, p.y, p.z, rot + (g?.dyaw || 0), s * (g?.ds || 1), { radius: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2, ...opts });
  return s;
}

/** Tree: 'oak' | 'pine' | 'birch' | 'dark' (deep forest). Only the trunk collides. */
export function tree(world, x, z, s, rng, kind = 'oak') {
  const y = world.heightAt(x, z) - 0.15;
  const name = 'wilds/' + pick(TREES[kind] || TREES.oak, rng);
  const rot = rng() * 6.28;
  const tint = (kind === 'dark' ? 0.72 : 0.9) + rng() * 0.18;
  plant(world, name, x, y, z, rot, (TREE_H[kind] ?? 8) * s * (0.85 + rng() * 0.3), { tint });
  new Frame(world, x, y, z, 0).cyl(0.32 * s, 3.4 * s, 0, 0, 0, 'bark', { seg: 6, collideOnly: true });
}

export function bush(world, x, z, s, rng) {
  const y = world.heightAt(x, z) - 0.08;
  plant(world, 'wilds/' + pick(BUSHES, rng), x, y, z, rng() * 6.28, 1.2 * s, { nearOnly: true, near: 120, tint: 0.85 + rng() * 0.2 });
}

export function rock(world, x, z, s, rng, mat = 'rock') {
  const y = world.heightAt(x, z);
  const F = new Frame(world, x, y - s * 0.15, z, rng() * 6);
  // Sized by the largest dimension.
  const name = 'wilds/' + pick(ROCKS, rng);
  const b = world.kits.box(name);
  const k = (1.8 * s) / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  F.kit(name, 0, -b.min.y * k, 0, { s: k, collide: true, tint: mat === 'rockDark' ? 0x8a8078 : null });
}
/** Small ground decoration (flowers, mushrooms, stumps, logs) — no collision, no shadow. */
export function decor(world, x, z, name, height, rng, opts = {}) {
  const y = world.heightAt(x, z);
  const F = new Frame(world, x, y - 0.03, z, rng() * 6.28);
  kitToHeight(world, F, 'nature/' + name, height, { collide: false, castShadow: false, ...opts });
}

export { G as GEOMETRY, gableGeometry, pick };
