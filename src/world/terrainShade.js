import * as THREE from 'three';
import { fbm, smoothstep, clamp } from '../core/math.js';
import { CITY_WALL as AIN_WALL, toWorld as AIN_TO_WORLD, ORIGIN as AIN_ORIGIN } from './AinstreyPlan.js';
import { REGION, LAKES, FORESTS } from './MapData.js';
import { roadInfo, riverDistance, polygonDistance } from './Terrain.js';
import { WALL, toWorld } from './AxelPlan.js';

/**
 * The look of the ground: vertex normals of a height grid and the colours of the terrain (grass, forest floor, roads, river mud,
 * rock on slopes, the cities…). No DOM: used by the height workers (heightWorker.js, in parallel with the asset downloads) and by
 * World._buildTerrainSheet when no worker result is there.
 */

/** The city wall as a world polygon (+ bbox) for the "inside Axel" tests. */
export const CITIES = [WALL.nodes.map((n) => toWorld(n.u, n.v)), AIN_WALL.map((n) => AIN_TO_WORLD(n.u, n.v))].map((pts) => ({
  pts, box: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
}));
/** Signed distance to the nearest city wall line (negative inside the walls; Axel and Ainstrey); far away: a cheap lower bound. */
export function cityDistance(x, z) {
  let best = Infinity;
  for (const C of CITIES) {
    const dx = Math.max(C.box[0] - x, 0, x - C.box[2]), dz = Math.max(C.box[1] - z, 0, z - C.box[3]);
    best = Math.min(best, dx > 30 || dz > 30 ? Math.hypot(dx, dz) : polygonDistance(C.pts, x, z));
  }
  return best;
}
export const FOREST_BOX = FORESTS.map((f) => [Math.min(...f.pts.map((p) => p[0])), Math.min(...f.pts.map((p) => p[1])), Math.max(...f.pts.map((p) => p[0])), Math.max(...f.pts.map((p) => p[1]))]);
/** Signed distance to the nearest forest polygon (negative inside) and that forest. */
export function forestAt(x, z) {
  let best = Infinity, forest = null;
  FORESTS.forEach((f, i) => {
    const b = FOREST_BOX[i];
    if (x < b[0] - 40 || x > b[2] + 40 || z < b[1] - 40 || z > b[3] + 40) return;
    const d = polygonDistance(f.pts, x, z);
    if (d < best) { best = d; forest = f; }
  });
  return { d: best, forest };
}

/** Vertex normals of a height grid triangulated as PlaneGeometry (rotated flat): the same as its computeVertexNormals. */
export function planeNormals(sh, data) {
  const { nx, nz, step } = sh, n = new Float32Array(nx * nz * 3);
  const face = (a, b, c) => {
    // three's computeVertexNormals: (C - B) x (A - B), added to the three corners
    const ax = (a % nx) * step, az = Math.floor(a / nx) * step, bx = (b % nx) * step, bz = Math.floor(b / nx) * step, cx = (c % nx) * step, cz = Math.floor(c / nx) * step;
    const cbx = cx - bx, cby = data[c] - data[b], cbz = cz - bz, abx = ax - bx, aby = data[a] - data[b], abz = az - bz;
    const x = cby * abz - cbz * aby, y = cbz * abx - cbx * abz, z = cbx * aby - cby * abx;
    for (const v of [a, b, c]) { n[v * 3] += x; n[v * 3 + 1] += y; n[v * 3 + 2] += z; }
  };
  for (let iy = 0; iy < nz - 1; iy++) for (let ix = 0; ix < nx - 1; ix++) {
    const a = iy * nx + ix, b = a + nx, c = b + 1, d = a + 1;
    face(a, b, d);
    face(b, c, d);
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Colours of one height grid (Terrain.SHEETS entry `sh`, heights `data`, normals from planeNormals). */
export function shadeTerrain(sh, data, normals) {
const count = sh.nx * sh.nz, main = sh.id === 'main';
const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  const T = {
    grassA: new THREE.Color(0x5f8f3a), grassB: new THREE.Color(0x87a74a),
    forest: new THREE.Color(0x3f6a2c), meadow: new THREE.Color(0x9bb456), farm: new THREE.Color(0xa8ae58),
    dirt: new THREE.Color(0x8d7454), trail: new THREE.Color(0x9a8a62), rock: new THREE.Color(0x857d70),
    snow: new THREE.Color(0xe8eef2), scorch: new THREE.Color(0x3b2a24), mud: new THREE.Color(0x6e5e44),
    sand: new THREE.Color(0xb9a77e), town: new THREE.Color(0x8e8a64), ruin: new THREE.Color(0x9a9a86),
    chalk: new THREE.Color(0xc9c4b0), stone: new THREE.Color(0xa59d88), dry: new THREE.Color(0x9aa35a), gravel: new THREE.Color(0x9c927c), earth: new THREE.Color(0x7e7258), patch: new THREE.Color(0x6d8c46),
  };
  const farms = REGION.farms.center;
  const gorge = REGION.crimson_gorge.center, astra = REGION.astrarium.center;
  const chalkC = REGION.chalk.center;
  for (let i = 0; i < count; i++) {
    const x = sh.x0 + (i % sh.nx) * sh.step, z = sh.z0 + Math.floor(i / sh.nx) * sh.step, y = data[i];
    const n = fbm(x * 0.08, z * 0.08, 3) * 0.5 + 0.5;
    const big = fbm(x * 0.012 + 40, z * 0.012, 2) * 0.5 + 0.5;
    c.copy(T.grassA).lerp(T.grassB, n * 0.7 + big * 0.3);
    const df = forestAt(x, z).d;
    c.lerp(T.forest, (1 - smoothstep(-25, 15, df)) * 0.75);
    if (main) {
      const dfa = Math.hypot(x - farms.x, z - farms.z);
      c.lerp(T.farm, (1 - smoothstep(30, 70, dfa)) * 0.45);
    } else {
      // Ainstrey: dry meadows, chalk on the slopes of the south-west, worn stone in and around the city.
      c.lerp(T.dry, smoothstep(0.35, 0.7, big) * 0.4);
      c.lerp(T.chalk, (1 - smoothstep(60, 240, Math.hypot(x - chalkC.x, z - chalkC.z))) * 0.55 * smoothstep(3, 9, y));
    }
    c.lerp(T.meadow, smoothstep(0.62, 0.8, big) * 0.35);
    const dt = cityDistance(x, z);
    if (dt < 6) c.lerp(main ? T.town : T.stone, (1 - smoothstep(-6, 6, dt)) * (main ? 0.55 : 0.92));
    if (!main && dt < -10) {
      // Ainstrey: the garden of the Council stays green (lawns), everything else inside the walls is trodden earth and gravel
      const gu = x - AIN_ORIGIN.x, gv = z - AIN_ORIGIN.z;
      if (gu > -310 && gu < 410 && gv < -690 && gv > -910) c.lerp(T.grassB, 0.8);
      else {
        const w = 1 - smoothstep(-40, -10, dt), g2 = fbm(x * 0.05 + 9, z * 0.05 - 4, 3) * 0.5 + 0.5;
        c.lerp(T.gravel, (0.75 + 0.2 * n) * w);
        c.lerp(T.earth, smoothstep(0.38, 0.62, g2) * 0.45 * w);
        c.lerp(T.patch, smoothstep(0.7, 0.85, g2) * 0.22 * w); // a little worn grass in the yards (a capital is trodden ground)
      }
    }
    const rd = riverDistance(x, z);
    c.lerp(T.mud, (1 - smoothstep(-1, 4, rd)) * 0.9);
    c.lerp(T.sand, (1 - smoothstep(2, 7, rd)) * smoothstep(-1, 2, rd) * 0.45);
    for (const L of LAKES) {
      const dl = Math.hypot(x - L.center.x, z - L.center.z);
      c.lerp(T.sand, (1 - smoothstep(L.radius * 0.95, L.radius * 1.25, dl)) * 0.8);
    }
    const r = roadInfo(x, z);
    const edge = 0.6 + fbm(x * 0.3, z * 0.3, 2) * 0.5;
    c.lerp(r.kind === 'trail' ? T.trail : T.dirt, smoothstep(edge + 0.6, edge - 0.6, r.d) * (r.kind === 'trail' ? 0.7 : 0.9));
    const slope = 1 - normals[i * 3 + 1];
    c.lerp(T.rock, clamp(smoothstep(0.2, 0.42, slope) + smoothstep(main ? 14 : 30, main ? 26 : 50, y) * 0.75, 0, 1));
    c.lerp(T.snow, smoothstep(40, 52, y) * 0.85);
    if (main) {
      c.lerp(T.scorch, (1 - smoothstep(30, 70, Math.hypot(x - gorge.x, z - gorge.z))) * 0.9);
      c.lerp(T.ruin, (1 - smoothstep(28, 46, Math.hypot(x - astra.x, z - astra.z))) * 0.4);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  return colors;
}
