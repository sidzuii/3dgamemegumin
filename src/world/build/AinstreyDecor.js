import * as THREE from 'three';
import { Frame, tree, lamp, bench, prop, stall, wagon } from './Kit.js';
import { toW } from './AinstreyBuildings.js';
import { nearStreet, polyDist, CLASS } from '../AinstreyCityPlan.js';
import * as AIN from '../AinstreyPlan.js';

/**
 * The dressing of the capital from the asset kits (docs/ainstrey/TZ_capital.md: «живая столица»): rows of trees round the
 * squares and along the axis and the avenues (boulevards), flower beds with benches, obelisks and statues on plinths, banners
 * at the squares, lamps on the squares, goods of the markets and the cargo square (Fantasy Props MegaKit, KayKit ResourceBits).
 * Nothing stands on a street line (`nearStreet`), on a key plot, a lot or another piece; every square is an editor group.
 */
const H = (W, x, z) => W.heightAt(x, z);
const nearStreetW = (x, z, pad) => nearStreet(x - AIN.ORIGIN.x, z - AIN.ORIGIN.z, pad);
const FLOWERS = ['flower_redA', 'flower_redB', 'flower_yellowA', 'flower_yellowB', 'flower_purpleA', 'flower_purpleB'];

/** A kit piece scaled to a height, standing on the ground at a local point of F. */
function kitH(W, F, name, h, lx, lz, opts = {}) {
  if (!W.kits.has(name)) return;
  const b = W.kits.box(name);
  const s = h / Math.max(0.05, b.max.y - b.min.y);
  F.kit(name, lx - ((b.min.x + b.max.x) / 2) * s, (opts.y ?? 0) - b.min.y * s, lz - ((b.min.z + b.max.z) / 2) * s, { s, collide: opts.collide ?? false, castShadow: opts.cast ?? true, ry: opts.ry ?? 0, tint: opts.tint ?? null });
}

/** Occupancy of one square: footprints already there (fountains, wells, stalls) + what we place. */
function occupancy(W, P, sq) {
  const [cx, cz] = toW(sq.u, sq.v), R = Math.hypot(sq.w, sq.d) / 2 + 4;
  // footprints already there as rectangles (a big lot at the edge must not blank half the square), our pieces as circles
  const rects = W.footprints.filter((f) => Math.hypot(f.x - cx, f.z - cz) < R + Math.max(f.w, f.d)).map((f) => ({ u: f.x, v: f.z, w: f.w, d: f.d, rot: f.rot || 0 }));
  const taken = [];
  return {
    taken,
    free(p, r) {
      if (nearStreetW(p.x, p.z, r + 0.5)) return false;
      if (P.keys.some((k) => near(k, p.x - AIN.ORIGIN.x, p.z - AIN.ORIGIN.z, r + 2))) return false;
      if (Object.values(W.npcSpots).some((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < r + 1.5)) return false; // story places, citizens, stops stay clear
      if (rects.some((q) => near(q, p.x, p.z, r + 0.8))) return false;
      return taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) > t.r + r);
    },
    add(p, r) { taken.push({ x: p.x, z: p.z, r }); },
  };
}
const near = (rect, u, v, m) => {
  const c = Math.cos(rect.rot), s = Math.sin(rect.rot), dx = u - rect.u, dz = v - rect.v;
  return Math.abs(dx * c - dz * s) <= rect.w / 2 + m && Math.abs(dx * s + dz * c) <= rect.d / 2 + m;
};

function flowerBed(W, F, lx, lz, r, rng) {
  F.cyl(r, 0.45, lx, 0, lz, 'stone', { seg: 16, tint: 0xd8ccb0, collide: true });
  F.cyl(r - 0.3, 0.06, lx, 0.42, lz, 'stoneDark', { seg: 16, collide: false, castShadow: false, tint: 0x4a3a28 }); // soil
  kitH(W, F, 'nature/plant_bushLarge', 1.6, lx, lz, { y: 0.45 });
  const n = Math.round(r * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3, rr = r - 0.75 - rng() * 0.5;
    kitH(W, F, 'nature/' + FLOWERS[(i + Math.floor(rng() * 2)) % FLOWERS.length], 0.55, lx + Math.cos(a) * rr, lz + Math.sin(a) * rr, { y: 0.45, cast: false });
  }
}

function plinthStatue(W, F, lx, lz, kind, rng) {
  F.box(3.4, 0.4, 3.4, lx, 0, lz, 'stone', { tint: 0xcfc4a8 });
  F.box(2.6, 1.6, 2.6, lx, 0.4, lz, 'stone', { tint: 0xd8ccb0 });
  F.box(3.0, 0.25, 3.0, lx, 2.0, lz, 'stone', { tint: 0xcfc4a8, collide: false });
  if (kind === 'obelisk') kitH(W, F, 'nature/statue_obelisk', 7.5, lx, lz, { y: 2.25, tint: 0xe6dcc4 });
  else if (kind === 'head') kitH(W, F, 'nature/statue_head', 3.2, lx, lz, { y: 2.25, tint: 0xe6dcc4, ry: rng() * 0.3 });
  else kitH(W, F, 'nature/statue_column', 4.5, lx, lz, { y: 2.25, tint: 0xe6dcc4 });
}

function banner(W, F, lx, lz, ry, tint) {
  F.cyl(0.12, 8, lx, 0, lz, 'metal', { seg: 8, tint: 0x3a3836 });
  F.sphere(0.22, lx, 8.05, lz, 'metal', { tint: 0xc8a050, collide: false });
  F.box(1.6, 0.08, 0.08, lx, 7.6, lz, 'timber', { collide: false, ry });
  F.box(1.4, 3.6, 0.05, lx, 3.9, lz, 'cloth', { collide: false, ry, tint });
  F.box(1.4, 0.3, 0.06, lx, 3.8, lz, 'cloth', { collide: false, ry, tint: 0xd8b050 });
}

/** The squares: tree rows (or planters on the busy ones), lamps, beds with benches, a statue, banners, goods. */
export function decorateSquares(W, P) {
  for (const sq of P.squares) {
    const [cx, cz] = toW(sq.u, sq.v);
    W.group('ain_sqd_' + sq.id, { x: cx, z: cz, rot: sq.rot }, (rng) => {
      const F = new Frame(W, cx, H(W, cx, cz), cz, sq.rot);
      const O = occupancy(W, P, sq);
      const at = (lx, lz) => F.at(lx, 0, lz);
      const L = (lx, lz) => { const p = at(lx, lz); return new Frame(W, p.x, H(W, p.x, p.z), p.z, sq.rot); };
      const busy = sq.kind === 'market' || sq.kind === 'wagons' || sq.kind === 'cargo';
      // perimeter: trees every ~13 m (planters on the busy squares), a lamp now and then
      const inset = 5.5, hw = sq.w / 2 - inset, hd = sq.d / 2 - inset;
      const edge = [];
      for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) {
        const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 13));
        for (let i = 0; i <= n; i++) edge.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, i]);
      }
      let k = 0;
      for (const [lx, lz, i] of edge) {
        const p = at(lx, lz);
        if (!O.free(p, 2.2)) continue;
        k++;
        if (k % 4 === 0) { lamp(W, new THREE.Vector3(p.x, H(W, p.x, p.z) + 0.12, p.z), 0); O.add(p, 1); continue; }
        if (busy) {
          const G = L(lx, lz);
          G.cyl(0.9, 0.8, 0, 0, 0, 'stone', { seg: 12, tint: 0xcfc4a8 });
          kitH(W, G, 'nature/plant_bushDetailed', 1.3, 0, 0, { y: 0.8 });
        } else tree(W, p.x, p.z, 0.85 + rng() * 0.3, rng, (i + k) % 3 === 0 ? 'birch' : 'oak');
        O.add(p, 2.5);
      }
      if (!busy) parterres(W, F, sq, O, rng);
      if (!busy) {
        // two or four flower beds with benches facing them
        const beds = sq.w > 120 ? [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]] : [[-0.27, 0], [0.27, 0]];
        for (const [fx, fz] of beds) {
          const lx = fx * sq.w, lz = fz * sq.d, p = at(lx, lz);
          if (!O.free(p, 6)) continue;
          flowerBed(W, F, lx, lz, 3.4, rng);
          O.add(p, 4);
          for (const s of [-1, 1]) {
            const bz = lz + s * 5.4, q = at(lx, bz);
            if (O.free(q, 1.2)) { bench(W, F, lx, bz, s > 0 ? Math.PI : 0); O.add(q, 1.5); }
          }
        }
        // a statue on the axis of the square (the first free place)
        const kind = sq.kind === 'academy' ? 'head' : sq.kind === 'steps' || sq.kind === 'council' ? 'obelisk' : 'column';
        for (const [lx, lz] of [[0, -sq.d * 0.28], [0, sq.d * 0.28], [-sq.w * 0.12, 0], [sq.w * 0.12, 0], [0, 0]]) {
          const p = at(lx, lz);
          if (!O.free(p, 3.5)) continue;
          plinthStatue(W, F, lx, lz, kind, rng);
          O.add(p, 3);
          break;
        }
      } else {
        // goods: crates, barrels, carts, stacks
        const goods = sq.kind === 'cargo'
          ? ['bits/Wood_Planks_Stack_Large', 'bits/Stone_Bricks_Stack_Medium', 'bits/Textiles_Stack_Large_Colored', 'props/Crate_Wooden', 'bits/Wood_Log_Stack', 'props/Barrel']
          : sq.kind === 'market'
            ? ['props/FarmCrate_Apple', 'props/FarmCrate_Carrot', 'props/Barrel_Apples', 'props/Stall_Cart_Empty', 'props/Crate_Wooden', 'bits/Textiles_Stack_Small']
            : ['props/Stall_Cart_Empty', 'props/Crate_Wooden', 'props/Barrel', 'bits/Wood_Log_Stack', 'props/FarmCrate_Empty'];
        for (let i = 0; i < 26; i++) {
          const lx = (rng() - 0.5) * (sq.w - 16), lz = (rng() - 0.5) * (sq.d - 16), p = at(lx, lz);
          if (!O.free(p, 2.2)) continue;
          const G = L(lx, lz);
          const name = goods[i % goods.length];
          if (W.kits.has(name)) prop(G, name, 0, 0, 0, { s: name.startsWith('bits/') ? 1.3 : 1, ry: rng() * 6.28 });
          if (rng() < 0.5 && W.kits.has('props/Barrel')) prop(G, 'props/Barrel', 1.2, 0, 0.6, { s: 1 });
          O.add(p, 2.4);
        }
      }
      if (sq.kind === 'market' || sq.kind === 'wagons') stallRows(W, F, sq, O, rng);
      // banners at the two long sides
      const tint = [0x8a2a2a, 0x2a4a8a, 0x2a6a4a, 0x6a2a6a][Math.abs(Math.round(sq.u + sq.v)) % 4];
      for (const s of [-1, 1]) for (const fx of [-0.42, 0.42]) {
        const lx = fx * sq.w, lz = s * (sq.d / 2 - 2.5), p = at(lx, lz);
        if (!O.free(p, 1.5)) continue;
        banner(W, F, lx, lz, 0, tint);
        O.add(p, 1.2);
      }
    }, 'Убранство: ' + sq.name);
  }
}

/** Boulevards: trees along both sides of the axis and the avenues, inside the kerb (not at crossings, gates, squares). */
export function boulevards(W, P) {
  for (const S of P.streets) {
    if (S.cls !== 'axis' && S.cls !== 'avenue') continue;
    const [mx, mz] = toW(...S.pts[Math.floor(S.pts.length / 2)]);
    W.group('ain_blv_' + S.id, { x: mx, z: mz }, (rng) => {
      const off = S.width / 2 - 2.0;
      let acc = 9, side = 0;
      for (let i = 1; i < S.pts.length; i++) {
        const [ax, az] = S.pts[i - 1], [bx, bz] = S.pts[i];
        const seg = Math.hypot(bx - ax, bz - az);
        if (seg < 0.01) continue;
        const dx = (bx - ax) / seg, dz = (bz - az) / seg;
        for (let t = acc; t < seg; t += 15) {
          const cu = ax + dx * t, cv = az + dz * t;
          side++;
          for (const sd of [-1, 1]) {
            const u = cu - dz * sd * off, v = cv + dx * sd * off;
            if (P.streets.some((o) => o !== S && polyDist(o.pts, u, v) < o.width / 2 + (CLASS[o.cls].kerb ?? 1) + 4)) continue;
            if (P.squares.some((q) => near(q, u, v, 3)) || P.keys.some((q) => near(q, u, v, 4))) continue;
            if (wallDist(u, v) < 28) continue; // not in the gate passages
            const [x, z] = toW(u, v);
            const y = H(W, x, z);
            // a ring of stone round the trunk, the tree inside
            new Frame(W, x, y, z, 0).cyl(1.1, 0.25, 0, 0, 0, 'stone', { seg: 10, tint: 0xcfc4a8, collide: false, castShadow: false });
            tree(W, x, z, 0.75 + rng() * 0.2, rng, side % 4 === 0 ? 'birch' : 'oak');
          }
        }
        acc = Math.max(0, (acc - seg) % 15);
      }
    }, 'Бульвар: ' + S.name);
  }
}
/**
 * Formal parterres filling the rest of a quiet square: lawns with a stone kerb, clipped hedges along the long sides (gaps in the
 * middle), a tree or a flower bed in the middle, topiary at the corners; walks of ~5 m between them and round the streets.
 */
function parterres(W, F, sq, O, rng) {
  const cw = 18, cd = 12, gap = 5.5;
  const nx = Math.floor((sq.w - 22 + gap) / (cw + gap)), nz = Math.floor((sq.d - 22 + gap) / (cd + gap));
  if (nx < 1 || nz < 1) return;
  const x0 = -((nx - 1) * (cw + gap)) / 2, z0 = -((nz - 1) * (cd + gap)) / 2;
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lx = x0 + i * (cw + gap), lz = z0 + j * (cd + gap);
    const probe = [[0, 0], [-cw / 2, -cd / 2], [cw / 2, -cd / 2], [cw / 2, cd / 2], [-cw / 2, cd / 2], [0, -cd / 2], [0, cd / 2], [-cw / 2, 0], [cw / 2, 0]];
    if (!probe.every(([a, b]) => O.free(F.at(lx + a, 0, lz + b), 1.2))) continue;
    k++;
    F.box(cw + 0.5, 0.3, cd + 0.5, lx, -0.05, lz, 'stone', { tint: 0xd8ccb0, collide: false, castShadow: false });
    F.box(cw - 0.3, 0.06, cd - 0.3, lx, 0.22, lz, 'lawn', { collide: false, castShadow: false, tint: 0x6a9a44 });
    // hedges along the long sides, open in the middle
    for (const s of [-1, 1]) for (const hx of [-1, 1]) {
      const len = cw / 2 - 2.2;
      F.box(len, 0.9, 0.8, lx + hx * (len / 2 + 1.6), 0.25, lz + s * (cd / 2 - 0.7), 'leavesDark', { collide: true, tint: 0x3e6a32 });
    }
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kitH(W, F, 'nature/plant_bushTriangle', 1.8, lx + cx * (cw / 2 - 1.1), lz + cz * (cd / 2 - 1.1), { y: 0.25 });
    const p = F.at(lx, 0, lz);
    if ((i + j + k) % 3 === 0) flowerBed(W, F, lx, lz, 2.6, rng);
    else tree(W, p.x, p.z, 0.8 + rng() * 0.25, rng, (i + j) % 2 ? 'oak' : 'birch');
    for (const fx of [-0.3, 0.3]) for (let f = 0; f < 4; f++) kitH(W, F, 'nature/' + FLOWERS[(i * 3 + j + f) % FLOWERS.length], 0.5, lx + fx * cw + (f - 1.5) * 0.9, lz + (f % 2 ? 1 : -1) * 1.6, { y: 0.25, cast: false });
    O.add(p, Math.hypot(cw, cd) / 2);
    if (rng() < 0.6) { const b = F.at(lx, 0, lz + cd / 2 + 1.8); if (O.free(b, 1)) { bench(W, F, lx, lz + cd / 2 + 1.8, Math.PI); O.add(b, 1.2); } }
  }
}

/** Rows of stalls / carts on the market and the wagon square (the existing ones and the well stay). */
function stallRows(W, F, sq, O, rng) {
  const cols = [0xb8453a, 0x3a6a8a, 0x4a7a4a, 0xc89a3a, 0x8a4a7a, 0xd8cfb8];
  for (let lx = -sq.w / 2 + 14; lx <= sq.w / 2 - 14; lx += 11) for (let lz = -sq.d / 2 + 14; lz <= sq.d / 2 - 14; lz += 13) {
    const p = F.at(lx, 0, lz);
    if (rng() < 0.3 || !O.free(p, 3.6)) continue;
    if (sq.kind === 'market') stall(W, p.x, p.z, sq.rot + (rng() < 0.5 ? 0 : Math.PI), cols[Math.floor(rng() * cols.length)], ['fruit', 'mixed', 'bread'][Math.floor(rng() * 3)], rng);
    else wagon(W, p.x, p.z, sq.rot + (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.3, [0xe8dcc0, 0xd8c8a0, 0xc8d0d8][Math.floor(rng() * 3)]);
    O.add(p, 3.4);
  }
}

const wallDist = (u, v) => {
  const N = AIN.CITY_WALL;
  let d = Infinity;
  for (let i = 0, j = N.length - 1; i < N.length; j = i++) {
    const ax = N[j].u, az = N[j].v, dx = N[i].u - ax, dz = N[i].v - az;
    const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(u - ax - dx * t, v - az - dz * t));
  }
  return d;
};
