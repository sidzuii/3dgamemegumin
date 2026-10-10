import { fbm, smoothstep, clamp } from '../core/math.js';
import { HALF, RIVER, RIVERS, LAKES, LAVA, ROADS, FLATS, HILLS, RIDGES, REGION } from './MapData.js';

/**
 * Terrain height model.
 *
 * `analyticHeight(x, z)` composes the geography from MapData (broad hills, ridges with
 * passes, edge mountains, river valley + channel, lakes, flattened settlements, levelled
 * roads, lava basin). It is evaluated once per grid cell at load; afterwards `heightAt`
 * samples the cached grid bilinearly, so gameplay queries are cheap and match the mesh.
 * Roads and rivers are looked up through a coarse grid of their segments (only the ones near a
 * point are measured; farther than their reach the distance is reported as Infinity).
 */

export const GRID_STEP = 2.5;
export const GRID_N = Math.round((HALF * 2) / GRID_STEP) + 1;

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
  let h = fbm(x * 0.0065 + 3.1, z * 0.0065 - 7.4, 4) * 11;
  h += fbm(x * 0.03, z * 0.03, 3) * 0.9;
  for (const H of HILLS) {
    const dx = x - H.x, dz = z - H.z;
    h += H.h * Math.exp(-(dx * dx + dz * dz) / (2 * H.r * H.r));
  }
  h += ridgeHeight(x, z);
  // Mountains around the edge of the world.
  const e = Math.max(Math.abs(x), Math.abs(z)) * 0.7 + Math.hypot(x, z) * 0.3;
  if (e > HALF - 120) h += smoothstep(HALF - 120, HALF - 20, e) * 60 * (0.7 + 0.3 * fbm(x * 0.012, z * 0.012, 3));
  return h;
}

const autoLevels = new Map();

function polyBox(pts) {
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

export function analyticHeight(x, z) {
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
    if (level === 'auto') {
      const key = F.x + ',' + F.z;
      if (!autoLevels.has(key)) autoLevels.set(key, naturalHeight(F.x, F.z));
      level = autoLevels.get(key);
    }
    const w = 1 - smoothstep(r, r + F.feather, d);
    h = h * (1 - w) + level * w;
  }
  // Roads: levelled (small bumps removed, steep slopes softened).
  const road = roadInfo(x, z);
  if (road.d < 5) {
    const w = 1 - smoothstep(-1, 5, road.d);
    const smooth = naturalHeightSmooth(x, z, h);
    h = h * (1 - w * 0.55) + smooth * w * 0.55;
  }
  // Bank floor (after the road levelling, which can dig below it).
  const fw = 1 - smoothstep(V / 2, V * 1.16, rd);
  if (fw > 0) h += Math.max(0, R.level + 0.35 + Math.max(0, rd) * 0.03 - h) * fw;
  // River channel.
  const ch = 1 - smoothstep(-R.width * 0.15, R.width * 0.25, rd);
  if (ch > 0) h = h * (1 - ch) + R.bed * ch;
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
  return h;
}

/** Cheap low-pass of the ground under a road (removes the high-frequency detail). */
function naturalHeightSmooth(x, z, h) {
  return h - fbm(x * 0.03, z * 0.03, 3) * 0.9;
}

/** Cached height grid + bilinear sampling. */
export class Heightfield {
  constructor() {
    const N = GRID_N;
    this.data = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * GRID_STEP;
      for (let i = 0; i < N; i++) this.data[j * N + i] = analyticHeight(-HALF + i * GRID_STEP, z);
    }
  }

  /** Height at a grid vertex. */
  vertex(i, j) {
    return this.data[clamp(j, 0, GRID_N - 1) * GRID_N + clamp(i, 0, GRID_N - 1)];
  }

  sample(x, z) {
    const fx = (x + HALF) / GRID_STEP, fz = (z + HALF) / GRID_STEP;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= GRID_N - 1 || j >= GRID_N - 1) return analyticHeight(x, z);
    const tx = fx - i, tz = fz - j;
    const N = GRID_N, d = this.data;
    const a = d[j * N + i], b = d[j * N + i + 1], c = d[(j + 1) * N + i], e = d[(j + 1) * N + i + 1];
    // Same triangulation as PlaneGeometry (a-c-b / c-e-b) so feet match the mesh exactly.
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return e + (c - e) * (1 - tx) + (b - e) * (1 - tz);
  }
}

/** 'water' | 'lava' | null at a world position. */
export function surfaceAt(x, y, z) {
  if (y < RIVER.level - 0.05 && riverDistance(x, z) < 1.5) return 'water';
  for (const L of LAKES) if (y < L.level - 0.05 && Math.hypot(x - L.center.x, z - L.center.z) < L.radius * 1.1) return 'water';
  if (y < LAVA.level + 0.15) for (const [px, pz, r] of LAVA.pools) if (Math.hypot(x - px, z - pz) < r * 1.05) return 'lava';
  return null;
}

export function isLavaXZ(x, z, pad = 0.6) {
  for (const [px, pz, r] of LAVA.pools) if (Math.hypot(x - px, z - pz) < r * 1.05 + pad) return true;
  return false;
}
