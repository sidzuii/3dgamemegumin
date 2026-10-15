// Is the Stone Ledge the only way from the Postal ascent to the rest of the sheet while the road is closed?
// A flood fill over the terrain grid (the same heightfield the game uses) with the walkable slope of the character (48 degrees);
// the dynamic colliders of the rubble are not included: this checks what the TERRAIN alone closes.
//   node tools/ledge_check.mjs        exit code 1 when the far side can be reached from the camp
import { Heightfield } from '../src/world/Terrain.js';
import * as AIN from '../src/world/AinstreyPlan.js';

const hf = new Heightfield();
const L = AIN.LEDGE;
const step = 1.25, MIN_NY = Math.cos((48 * Math.PI) / 180); // the character walks on triangles whose normal is steeper than 48 degrees from nothing
const S = AIN.SHEET;
const x0 = S.x0 + 4, x1 = S.x0 + 900, z0 = S.z1 - 1500, z1 = S.z1 - 4; // the south-west part of the sheet (u -1700.. -800, v 1650..3150) around the ascent
const nx = Math.floor((x1 - x0) / step) + 1, nz = Math.floor((z1 - z0) / step) + 1;
// walkable = the triangle of the height grid under the sample is not steeper than the slope limit (the same triangulation as the mesh)
const sh = hf.sheets[1], G = sh.step;
const walkable = new Uint8Array(nx * nz);
const H = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const x = x0 + i * step, z = z0 + j * step;
  const fx = (x - sh.x0) / G, fz = (z - sh.z0) / G;
  const ci = Math.min(sh.nx - 2, Math.floor(fx)), cj = Math.min(sh.nz - 2, Math.floor(fz));
  const tx = fx - ci, tz = fz - cj, N = sh.nx, d = sh.data;
  const a = d[cj * N + ci], b = d[cj * N + ci + 1], c = d[(cj + 1) * N + ci], e = d[(cj + 1) * N + ci + 1];
  const gx = tx + tz <= 1 ? (b - a) / G : (e - c) / G, gz = tx + tz <= 1 ? (c - a) / G : (e - b) / G;
  walkable[j * nx + i] = 1 / Math.sqrt(1 + gx * gx + gz * gz) >= MIN_NY ? 1 : 0;
  H[j * nx + i] = hf.sample(x, z);
}
const at = (f, l) => L.at(f, l);
const idx = ([x, z]) => Math.round((z - z0) / step) * nx + Math.round((x - x0) / step);

function flood(start, blocked = new Set()) {
  const seen = new Int32Array(nx * nz).fill(-1);
  const q = [idx(start)];
  seen[q[0]] = q[0];
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % nx, j = (k / nx) | 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const k2 = jj * nx + ii;
      if (seen[k2] >= 0 || blocked.has(k2)) continue;
      if (!walkable[k2]) continue;
      seen[k2] = k; q.push(k2);
    }
  }
  return { seen, count: q.length };
}
// the rubble of the closed ledge: the whole width of the gorge at f = +20 (the heaps) counts as closed
const blocked = new Set();
for (let l = -40; l <= 40; l += 0.5) for (let f = 18; f <= 26; f += 1) blocked.add(idx(at(f, l)));
const start = at(-120, 0);
const { seen, count } = flood(start, blocked);
const goals = { 'beyond the rockfall f+30': at(30, 0), 'f+60': at(60, 0), 'f+100': at(100, 0), 'f+150': at(150, 0), 'chalk viewpoint': AIN.toWorld(...AIN.SPOTS_LOCAL.chalk_view.slice(0, 2)), 'mills': AIN.toWorld(...AIN.SPOTS_LOCAL.mills_camp.slice(0, 2)) };
let bad = 0;
for (const [name, p] of Object.entries(goals)) {
  const ok = seen[idx(p)] >= 0;
  if (ok) bad++;
  console.log(`${ok ? 'REACHABLE (leak!)' : 'closed'}  ${name}`);
  if (ok && bad === 1) {
    // trace the path back and print where it goes
    let k = idx(p), n = 0; const pts = [];
    while (seen[k] !== k && n++ < 20000) { pts.push([x0 + (k % nx) * step, z0 + ((k / nx) | 0) * step, H[k]]); k = seen[k]; }
    const [ox, oz] = AIN.toWorld(L.u, L.v);
    const local = ([x, z, h]) => { const dx = x - ox, dz = z - oz; return `(${(dx * L.fu + dz * L.fv).toFixed(0)},${(dx * L.fv - dz * L.fu).toFixed(0)};y${h.toFixed(0)})`; };
    console.log('  path (f,l;y) every 15 m:', pts.filter((_, i) => i % 6 === 0).reverse().map(local).join(' '));
  }
}
console.log(`flooded cells from the camp: ${count}`);
process.exit(bad ? 1 : 0);
