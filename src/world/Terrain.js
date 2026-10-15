import { fbm, smoothstep, clamp } from '../core/math.js';
import { HALF, RIVER, RIVERS, LAKES, LAVA, ROADS, FLATS, HILLS, RIDGES, REGION, BRIDGES } from './MapData.js';
import { STREETS, RING, streetLine, ringLine, toWorld } from './AxelPlan.js';
import { SHEET, inSheet, LEDGE_CLIFFS } from './AinstreyPlan.js';

/**
 * Terrain height model.
 *
 * `analyticHeight(x, z)` composes the geography from MapData (broad hills, ridges with
 * passes, edge mountains, river valley + channel, lakes, flattened settlements, levelled
 * roads, lava basin). It is evaluated once per grid cell at load; afterwards `heightAt`
 * samples the cached grid bilinearly, so gameplay queries are cheap and match the mesh.
 * Roads and rivers are looked up through a coarse grid of their segments (only the ones near a
 * point are measured; farther than their reach the distance is reported as Infinity).
 * Inside Axel the overworld road levelling is off (the city is flat); instead the ground across
 * every city street (AxelPlan, built centre lines) is levelled to the height of its centre line,
 * so the paving lies flush on slopes (the temple hill) and the cross-section is level.
 */

export const GRID_STEP = 2.5;
export const GRID_N = Math.round((HALF * 2) / GRID_STEP) + 1;
/** The height grids: the old map and the Ainstrey sheet (a separate rectangle east of it, docs/ainstrey). */
export const SHEETS = [
  { id: 'main', x0: -HALF, z0: -HALF, step: GRID_STEP, nx: GRID_N, nz: GRID_N },
  { id: 'ainstrey', x0: SHEET.x0, z0: SHEET.z0, step: SHEET.step, nx: Math.round((SHEET.x1 - SHEET.x0) / SHEET.step) + 1, nz: Math.round((SHEET.z1 - SHEET.z0) / SHEET.step) + 1 },
];

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function polylineDistance(points, x, z) {
  let d = Infinity;
  for (let i = 0; i < points.length - 1; i++) d = Math.min(d, distToSeg(x, z, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
  return d;
}

/** Segments of polylines bucketed into CELL x CELL squares (each within `reach` of its cell). */
const CELL = 32;
function segmentGrid(lines, reach) {
  const grid = new Map();
  for (const L of lines) {
    const P = L.points;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const r = reach + (L.width || 0) / 2;
      const seg = { ax, az, bx, bz, line: L };
      for (let cx = Math.floor((Math.min(ax, bx) - r) / CELL); cx <= Math.floor((Math.max(ax, bx) + r) / CELL); cx++) {
        for (let cz = Math.floor((Math.min(az, bz) - r) / CELL); cz <= Math.floor((Math.max(az, bz) + r) / CELL); cz++) {
          const k = cx * 4099 + cz;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(seg);
        }
      }
    }
  }
  return grid;
}
const NONE = [];
const ROAD_GRID = segmentGrid(ROADS, 16);
const STREET_FEATHER = 3;
const CITY_LINES = [
  ...STREETS.map((s) => ({ points: streetLine(s).map(([u, v]) => toWorld(u, v)), width: s.width })),
  { points: [...ringLine(), ringLine()[0]].map(([u, v]) => toWorld(u, v)), width: RING.width },
];
const CITY_GRID = segmentGrid(CITY_LINES, STREET_FEATHER);
const RIVER_GRID = segmentGrid(RIVERS, 70);
const _near = (grid, x, z) => grid.get(Math.floor(x / CELL) * 4099 + Math.floor(z / CELL)) || NONE;

/** Distance to the nearest road edge (negative inside), and that road's kind (Infinity far from roads). */
export function roadInfo(x, z) {
  let best = Infinity, kind = null;
  for (const s of _near(ROAD_GRID, x, z)) {
    const d = distToSeg(x, z, s.ax, s.az, s.bx, s.bz) - s.line.width / 2;
    if (d < best) { best = d; kind = s.line.kind; }
  }
  return { d: best, kind };
}

export function roadDistance(x, z) {
  return roadInfo(x, z).d;
}

/** Nearest water ribbon (river or creek): { d: distance to its bank (negative in the water), river }. */
export function riverInfo(x, z) {
  let best = Infinity, river = RIVERS[0];
  for (const s of _near(RIVER_GRID, x, z)) {
    const d = distToSeg(x, z, s.ax, s.az, s.bx, s.bz) - s.line.width / 2;
    if (d < best) { best = d; river = s.line; }
  }
  return { d: best, river };
}

export function riverDistance(x, z) {
  return riverInfo(x, z).d;
}

/** Signed distance to a polygon [[x, z]...] (negative inside). */
export function polygonDistance(pts, x, z) {
  let inside = false, d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    d = Math.min(d, distToSeg(x, z, xi, zi, xj, zj));
  }
  return inside ? -d : d;
}

/**
 * The cliff bands of the Stone Ledge (AinstreyPlan LEDGE_CLIFFS): a flat top and a steep face (steeper than the walkable
 * slope of the character), so the gorge of the Postal ascent is closed and the rockfall is the only way through.
 */
const CLIFFS = LEDGE_CLIFFS.map((C) => {
  const segs = [];
  let s = 0;
  for (let i = 0; i < C.pts.length - 1; i++) {
    const [ax, az] = C.pts[i], [bx, bz] = C.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, s0: s });
    s += len;
  }
  const xs = C.pts.map((p) => p[0]), zs = C.pts.map((p) => p[1]), m = C.top + C.face + 1;
  return { ...C, segs, total: s, bbox: [Math.min(...xs) - m, Math.min(...zs) - m, Math.max(...xs) + m, Math.max(...zs) + m] };
});

function cliffHeight(x, z) {
  let h = 0;
  for (const C of CLIFFS) {
    if (x < C.bbox[0] || x > C.bbox[2] || z < C.bbox[1] || z > C.bbox[3]) continue;
    let best = Infinity, bs = 0;
    for (const g of C.segs) {
      const dx = g.bx - g.ax, dz = g.bz - g.az;
      const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / (g.len * g.len), 0, 1);
      const d = Math.hypot(x - (g.ax + dx * t), z - (g.az + dz * t));
      if (d < best) { best = d; bs = g.s0 + t * g.len; }
    }
    if (best >= C.top + C.face) continue;
    const k = 1 - smoothstep(C.top, C.top + C.face, best);
    const fade = smoothstep(C.total, C.total - C.fadeEnd, bs); // the band sinks into the ground at its far end
    const n = 0.88 + 0.24 * (fbm(x * 0.045 + 11, z * 0.045 - 5, 3) * 0.5 + 0.5);
    h += (C.height * k * n + fbm(x * 0.16, z * 0.16, 2) * 1.6 * k * (1 - k) * 4) * fade;
  }
  return h;
}

function ridgeHeight(x, z) {
  let h = 0;
  for (const R of RIDGES) {
    const d = polylineDistance(R.points, x, z);
    if (d > R.width) continue;
    const k = 1 - d / R.width;
    let gap = 1;
    for (const g of R.gaps) gap = Math.min(gap, smoothstep(g.r * 0.45, g.r * 1.3, Math.hypot(x - g.x, z - g.z)));
    const n = 0.65 + 0.55 * (fbm(x * 0.03 + 4, z * 0.03 - 9, 3) * 0.5 + 0.5);
    h += R.height * k * k * (3 - 2 * k) * gap * n;
  }
  return h;
}

/** The natural ground before settlements, roads and water are cut in. */
function naturalHeight(x, z) {
  const ain = inSheet(x, z);
  let h = fbm(x * 0.0065 + 3.1, z * 0.0065 - 7.4, 4) * (ain ? 9 : 11) + (ain ? 3 : 0);
  h += fbm(x * 0.03, z * 0.03, 3) * (ain ? 1.0 : 0.9);
  for (const H of HILLS) {
    const dx = x - H.x, dz = z - H.z;
    h += H.h * Math.exp(-(dx * dx + dz * dz) / (2 * H.r * H.r));
  }
  h += ridgeHeight(x, z);
  // Mountains around the edge of the world (the Ainstrey sheet has its own rectangle).
  if (ain) {
    const d = Math.min(x - SHEET.x0, SHEET.x1 - x, z - SHEET.z0, SHEET.z1 - z);
    if (d < 160) h += (1 - smoothstep(20, 160, d)) * 62 * (0.7 + 0.3 * fbm(x * 0.012, z * 0.012, 3));
    h += (1 - smoothstep(6, 16, d)) * 55; // a wall at the very edge of the sheet: steeper than the walkable slope, nobody climbs out of the region
    return h;
  }
  const e = Math.max(Math.abs(x), Math.abs(z)) * 0.7 + Math.hypot(x, z) * 0.3;
  if (e > HALF - 120) h += smoothstep(HALF - 120, HALF - 20, e) * 60 * (0.7 + 0.3 * fbm(x * 0.012, z * 0.012, 3));
  return h;
}

const autoLevels = new Map();

function polyBox(pts) {
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

/** Final ground height: the base terrain with the city streets levelled across. */
export function analyticHeight(x, z) {
  const h = baseHeight(x, z);
  const segs = _near(CITY_GRID, x, z);
  if (!segs.length) return h;
  // The nearest point of every street within reach (one per street), blended by distance.
  const best = new Map();
  for (const s of segs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(x - px, z - pz);
    const b = best.get(s.line);
    if (d < s.line.width / 2 + STREET_FEATHER && (!b || d < b.d)) best.set(s.line, { d, px, pz });
  }
  let W = 0, sw = 0, sh = 0;
  for (const [line, { d, px, pz }] of best) {
    const w = 1 - smoothstep(line.width / 2, line.width / 2 + STREET_FEATHER, d);
    W = Math.max(W, w);
    sw += w;
    sh += w * baseHeight(px, pz);
  }
  return sw > 0 ? h * (1 - W) + (sh / sw) * W : h;
}

function baseHeight(x, z) {
  let h = naturalHeight(x, z);
  // River valley: the land eases down towards the water (a creek has a narrow valley).
  const { d: rd, river: R } = riverInfo(x, z);
  const V = R.valley ?? 48;
  // Banks never sink below the water (no dry hollows beside the river, no water above the bank):
  // they rise gently from just over the surface towards the valley sides.
  const valley = 1 - smoothstep(V / 12, V, rd);
  if (valley > 0) {
    const bank = Math.max(Math.min(h, 0.45), R.level + 0.35 + Math.max(0, rd) * 0.03);
    h = h * (1 - valley) + bank * valley;
  }
  // Settlements, camps and landmarks sit on flattened ground.
  let city = 0; // weight of the walled city's flat
  for (const F of FLATS) {
    let d, r = F.r;
    if (F.poly) {
      F.bbox ??= polyBox(F.poly);
      if (x < F.bbox[0] - F.feather || x > F.bbox[2] + F.feather || z < F.bbox[1] - F.feather || z > F.bbox[3] + F.feather) continue;
      d = polygonDistance(F.poly, x, z);
      r = 0;
    } else d = Math.hypot(x - F.x, z - F.z);
    if (d > r + F.feather) continue;
    let level = F.level;
    if (typeof level === 'function') level = level(x, z);
    else if (level === 'auto') {
      const key = F.x + ',' + F.z;
      if (!autoLevels.has(key)) autoLevels.set(key, naturalHeight(F.x, F.z));
      level = autoLevels.get(key);
    }
    const w = 1 - smoothstep(r, r + F.feather, d);
    h = h * (1 - w) + level * w;
    if (F.city) city = w;
  }
  // Roads: levelled (small bumps removed, steep slopes softened) — outside the city.
  const road = roadInfo(x, z);
  if (road.d < 5 && city < 1) {
    const w = (1 - smoothstep(-1, 5, road.d)) * (1 - city);
    const smooth = naturalHeightSmooth(x, z, h);
    const k = inSheet(x, z) ? 0.8 : 0.55; // the trakt is a built road: its bed is levelled harder
    h = h * (1 - w * k) + smooth * w * k;
  }
  // Bank floor (after the road levelling, which can dig below it).
  const fw = 1 - smoothstep(V / 2, V * 1.16, rd);
  if (fw > 0) h += Math.max(0, R.level + 0.35 + Math.max(0, rd) * 0.03 - h) * fw;
  // River channel (bankW: the width the shore ramp scales with; a wide river has steep banks).
  const bw = R.bankW ?? R.width;
  const ch = 1 - smoothstep(-bw * 0.15, bw * 0.25, rd);
  if (ch > 0) h = h * (1 - ch) + R.bed * ch;
  // Fords: a shallow gravel bed (0.3 m of water) where a road wades the creek.
  for (const F of FORDS) {
    const df = polylineDistance([F.a, F.b], x, z);
    if (df < F.width / 2 + 3) {
      const w = 1 - smoothstep(F.width / 2, F.width / 2 + 3, df);
      h = Math.max(h, h * (1 - w) + (R.level - 0.3) * w);
    }
  }
  // Lakes.
  for (const L of LAKES) {
    const d = Math.hypot(x - L.center.x, z - L.center.z);
    const w = 1 - smoothstep(L.radius * 0.75, L.radius * 1.12, d);
    if (w > 0) h = h * (1 - w) + (L.bottom + (d / L.radius) * 0.8) * w;
    if (L.island) {
      const di = Math.hypot(x - L.island.x, z - L.island.z);
      const wi = 1 - smoothstep(L.island.r * 0.6, L.island.r * 1.15, di);
      if (wi > 0) h = h * (1 - wi) + 0.6 * wi;
    }
  }
  // Crimson gorge: a scorched basin with sunken lava pools.
  const G = REGION.crimson_gorge.center;
  const dg = Math.hypot(x - G.x, z - G.z);
  if (dg < 80) {
    const w = 1 - smoothstep(40, 78, dg);
    h = h * (1 - w) + (0.3 + fbm(x * 0.08, z * 0.08, 2) * 1.2) * w;
    for (const [px, pz, r] of LAVA.pools) {
      const dp = Math.hypot(x - px, z - pz);
      const wp = 1 - smoothstep(r * 0.65, r * 1.15, dp);
      if (wp > 0) h = Math.min(h, h * (1 - wp) + (LAVA.level - 0.9) * wp);
    }
  }
  if (CLIFFS.length) h += cliffHeight(x, z);
  return h;
}

const FORDS = BRIDGES.filter((b) => b.kind === 'ford');

/** Cheap low-pass of the ground under a road (removes the high-frequency detail). */
function naturalHeightSmooth(x, z, h) {
  return h - fbm(x * 0.03, z * 0.03, 3) * 0.9;
}

/** Cached height grids (one per sheet) + bilinear sampling. */
export class Heightfield {
  constructor() {
    this.sheets = SHEETS.map((sh) => {
      const data = new Float32Array(sh.nx * sh.nz);
      for (let j = 0; j < sh.nz; j++) {
        const z = sh.z0 + j * sh.step;
        for (let i = 0; i < sh.nx; i++) data[j * sh.nx + i] = analyticHeight(sh.x0 + i * sh.step, z);
      }
      return { ...sh, data };
    });
    this.main = this.sheets[0];
    this.data = this.main.data; // the old map's grid (the map screen reads it)
  }

  /** The sheet whose grid covers (x, z), else null. */
  sheetAt(x, z) {
    for (const sh of this.sheets) {
      if (x >= sh.x0 && z >= sh.z0 && x <= sh.x0 + (sh.nx - 1) * sh.step && z <= sh.z0 + (sh.nz - 1) * sh.step) return sh;
    }
    return null;
  }

  sample(x, z) {
    const sh = this.sheetAt(x, z);
    if (!sh) return analyticHeight(x, z);
    const fx = (x - sh.x0) / sh.step, fz = (z - sh.z0) / sh.step;
    const i = Math.min(sh.nx - 2, Math.floor(fx)), j = Math.min(sh.nz - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j;
    const N = sh.nx, d = sh.data;
    const a = d[j * N + i], b = d[j * N + i + 1], c = d[(j + 1) * N + i], e = d[(j + 1) * N + i + 1];
    // Same triangulation as PlaneGeometry (a-c-b / c-e-b) so feet match the mesh exactly.
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return e + (c - e) * (1 - tx) + (b - e) * (1 - tz);
  }
}

/** 'water' | 'lava' | null at a world position. */
export function surfaceAt(x, y, z) {
  const ri = riverInfo(x, z);
  if (y < ri.river.level - 0.05 && ri.d < 1.5) return 'water';
  for (const L of LAKES) if (y < L.level - 0.05 && Math.hypot(x - L.center.x, z - L.center.z) < L.radius * 1.1) return 'water';
  if (y < LAVA.level + 0.15) for (const [px, pz, r] of LAVA.pools) if (Math.hypot(x - px, z - pz) < r * 1.05) return 'lava';
  return null;
}

export function isLavaXZ(x, z, pad = 0.6) {
  for (const [px, pz, r] of LAVA.pools) if (Math.hypot(x - px, z - pz) < r * 1.05 + pad) return true;
  return false;
}
