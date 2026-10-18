import * as THREE from 'three';
import { Frame, tree, lamp, bench, prop, stall, wagon, heroKit } from './Kit.js';
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
export function kitH(W, F, name, h, lx, lz, opts = {}) {
  if (!W.kits.has(name)) return;
  const b = W.kits.box(name);
  const s = h / Math.max(0.05, b.max.y - b.min.y);
  // the centre of the box (rotated with the piece) lands on the point
  const ry = opts.ry ?? 0, c = Math.cos(ry), sn = Math.sin(ry), cx = ((b.min.x + b.max.x) / 2) * s, cz = ((b.min.z + b.max.z) / 2) * s;
  F.kit(name, lx - (cx * c + cz * sn), (opts.y ?? 0) - b.min.y * s, lz - (-cx * sn + cz * c), { s, collide: opts.collide ?? false, castShadow: opts.cast ?? true, ry, tint: opts.tint ?? null, detail: !!opts.detail });
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
      // the shopping arcades along the long sides (the market, the square of the Steps) and the covered hall of the market
      if (sq.kind === 'market' || sq.kind === 'steps') arcades(W, F, sq, O, rng);
      if (sq.kind === 'market') marketHall(W, F, sq, O, rng);
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
          if (!O.free(p, sq.kind === 'steps' ? 4.5 : 3.5)) continue;
          // the founder of the capital on the square of the Steps (obj/founder_statue: the pedestal is part of the model)
          const st = sq.kind === 'steps' ? heroKit(F, 'obj/founder_statue', { h: 8.5 }, lx, 0, lz, { ry: lz > 0 ? Math.PI : 0 }) : null;
          if (st) F.box(st.w * 0.75, 2.2, st.d * 0.75, lx, 0, lz, 'stone', { collideOnly: true });
          else plinthStatue(W, F, lx, lz, kind, rng);
          O.add(p, st ? 4.2 : 3);
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
      // a noble carriage waiting by the halls; vendor carts on the busy squares
      const vehicles = sq.kind === 'council' || sq.kind === 'guild' || sq.kind === 'theatre' || sq.kind === 'cathedral' ? [['obj/noble_carriage', 5.4, 1]]
        : sq.kind === 'market' || sq.kind === 'wagons' || sq.kind === 'steps' ? [['obj/vendor_cart', 3.0, 3]] : [];
      for (const [name, w, n] of vehicles) {
        let left = n;
        for (let i = 0; i < 30 && left > 0; i++) {
          const lx = (rng() - 0.5) * (sq.w - 18), lz = (rng() < 0.5 ? -1 : 1) * (sq.d / 2 - 8 - rng() * 6), p = at(lx, lz);
          if (!O.free(p, w * 0.6 + 0.6)) continue;
          const ry = (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.4;
          const m = heroKit(F, name, { w }, lx, 0, lz, { ry });
          if (!m) break;
          F.box(m.w * 0.85, 1.6, m.d * 0.85, lx, 0, lz, 'wood', { collideOnly: true, ry });
          O.add(p, w * 0.6);
          left--;
        }
      }
      // what is left of the open paving: market goods / trees, planters, kiosks / topiary and pergolas, with walks of 5 m and more
      if (sq.kind === 'market' || sq.kind === 'steps' || sq.kind === 'council') pavingFill(W, F, sq, O, rng);
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
      // the row of trees on the flagstone band (AinstreyCity.streets), 2 m inside the kerb: a slot every 7.5 m; the even slots
      // are trees, the odd ones between them hold a lamp (every 45 m, the sides alternating), a bench, a planter or a café table
      const off = S.width / 2 - 2.0;
      const slots = alongLine(S.pts, 9, 7.5);
      slots.forEach(({ u: cu, v: cv, dx, dz }, k) => {
        for (const sd of [-1, 1]) {
          const u = cu - dz * sd * off, v = cv + dx * sd * off;
          if (P.streets.some((o) => o !== S && polyDist(o.pts, u, v) < o.width / 2 + (CLASS[o.cls].kerb ?? 1) + 4)) continue;
          if (P.squares.some((q) => near(q, u, v, 3)) || P.keys.some((q) => near(q, u, v, 4))) continue;
          if (wallDist(u, v) < 28) continue; // not in the gate passages
          const [x, z] = toW(u, v);
          const y = H(W, x, z);
          const ry = Math.atan2(dx, dz);
          if (k % 2 === 0) {
            // a ring of stone round the trunk, the tree inside
            new Frame(W, x, y, z, 0).cyl(1.1, 0.25, 0, 0, 0, 'stone', { seg: 10, tint: 0xcfc4a8, collide: false, castShadow: false });
            tree(W, x, z, 0.75 + rng() * 0.2, rng, (k / 2) % 4 === 0 ? 'birch' : 'oak');
            continue;
          }
          if (Object.values(W.npcSpots).some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 3)) continue;
          const F = new Frame(W, x, y + 0.03, z, ry);
          if (k % 6 === 1 && sd === (((k - 1) / 6) % 2 ? 1 : -1)) { lamp(W, new THREE.Vector3(x, y + 0.03, z), 0); continue; }
          const r = rng();
          if (r < 0.34) {
            // a bench along the row, its back to the carriageway
            kitH(W, F, 'furniture/bench', 0.85, 0, 0, { ry: sd > 0 ? Math.PI / 2 : -Math.PI / 2, collide: 'box' });
          } else if (r < 0.5) {
            // a café table with two chairs
            kitH(W, F, 'furniture/tableRound', 0.78, 0, 0, { collide: 'box' });
            for (const s2 of [-1, 1]) kitH(W, F, 'furniture/chair', 0.95, 0, s2 * 0.85, { ry: s2 > 0 ? Math.PI : 0, collide: false });
            if (rng() < 0.6) kitH(W, F, 'food/mug', 0.16, 0.15, 0.1, { y: 0.78, cast: false });
          } else if (r < 0.68) {
            // a planter
            kitH(W, F, 'nature/pot_large', 0.75, 0, 0, { collide: 'box', tint: 0xb06a48 });
            kitH(W, F, 'nature/plant_bushDetailed', 1.0, 0, 0, { y: 0.55 });
          }
        }
        // carts left at the kerb of the axis (the carriageway keeps 8 m), now and then
        if (S.cls === 'axis' && k % 11 === 5 && rng() < 0.45) {
          const sd = rng() < 0.5 ? -1 : 1, o2 = S.width / 2 - 6.2;
          const u = cu - dz * sd * o2, v = cv + dx * sd * o2;
          if (!P.streets.some((o) => o !== S && polyDist(o.pts, u, v) < o.width / 2 + (CLASS[o.cls].kerb ?? 1) + 6) && !P.squares.some((q) => near(q, u, v, 6)) && wallDist(u, v) > 40) {
            const [x, z] = toW(u, v);
            if (!Object.values(W.npcSpots).some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 5)) {
              const F = new Frame(W, x, H(W, x, z), z, Math.atan2(dx, dz) + (rng() < 0.5 ? 0 : Math.PI));
              kitH(W, F, rng() < 0.5 ? 'town/cart' : 'town/cart-high', 1.7, 0, 0, { collide: 'box' });
              if (rng() < 0.6) kitH(W, F, 'bits/' + (rng() < 0.5 ? 'Textiles_Stack_Large_Colored' : 'Wood_Planks_Stack_Medium'), 0.5, 0, 0, { y: 0.9, cast: false });
            }
          }
        }
      });
    }, 'Бульвар: ' + S.name);
  }
}

/** Points every `step` metres along a polyline [u, v] from `start`, with the unit direction there. */
export function alongLine(pts, start, step) {
  const out = [];
  let next = start, cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg < 0.01) continue;
    const dx = (bx - ax) / seg, dz = (bz - az) / seg;
    while (next <= cum + seg) { const t = next - cum; out.push({ u: ax + dx * t, v: az + dz * t, dx, dz }); next += step; }
    cum += seg;
  }
  return out;
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
  // rows of stalls with aisles of ~5 m between them
  const dx = sq.kind === 'market' ? 7.5 : 8.5, dz = sq.kind === 'market' ? 8 : 9.5;
  for (let lx = -sq.w / 2 + 12; lx <= sq.w / 2 - 12; lx += dx) for (let lz = -sq.d / 2 + 12; lz <= sq.d / 2 - 12; lz += dz) {
    const p = F.at(lx, 0, lz);
    if (rng() < 0.05 || !O.free(p, 3.2)) continue;
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

/**
 * Shopping arcades along the two long sides of a square: bays of 6 m under a tiled lean-to roof on stone columns, a plastered back
 * wall with a door, a window and a sign for every shop, goods by the doors. A bay that would stand on a street, a story place or
 * another piece is left out (the arcade breaks there and gets an end wall).
 */
function arcades(W, F, sq, O, rng) {
  const bay = 6, depth = 5.4, hgt = 4.4;
  const walls = [0xe3d6bb, 0xd8ccb0, 0xe8d8b8], signs = [0x5a3a24, 0x2f4f6a, 0x4a5a2a, 0x6a2a2a];
  for (const s of [-1, 1]) {
    const zb = s * (sq.d / 2 - 0.9), zf = s * (sq.d / 2 - 0.9 - depth), zc = (zb + zf) / 2;
    const n = Math.floor((sq.w - 20) / bay), x0 = -((n - 1) * bay) / 2;
    const ok = [];
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * bay;
      ok.push([[0, zc], [-bay / 2 + 0.6, zc], [bay / 2 - 0.6, zc]].every(([a, b]) => O.free(F.at(bx + a, 0, b), 1.9)));
    }
    const tint = walls[(s + 1) / 2 + (Math.abs(Math.round(sq.u)) % 2)] ?? walls[0];
    for (let i = 0; i < n; i++) {
      if (!ok[i]) continue;
      const bx = x0 + i * bay;
      F.box(bay, 0.12, depth, bx, 0, zc, 'stone', { tint: 0xd8ccb0, collide: false, castShadow: false });
      F.box(bay, hgt + 0.3, 0.45, bx, 0, zb, 'plaster', { tint });
      F.box(bay + 0.1, 0.5, 0.6, bx, 0, zb, 'stone', { tint: 0xb4aa94, collide: false });
      // the shop front on the inner face: a door, a window, a sign board, goods by the door now and then
      const fz = zb - s * 0.25;
      F.box(1.3, 2.4, 0.1, bx - 1.3, 0, fz, 'door', { tint: 0x5a3c28, collide: false });
      F.box(1.8, 1.3, 0.1, bx + 1.2, 0.95, fz, 'window', { collide: false, castShadow: false, detail: true });
      F.box(2.6, 0.55, 0.08, bx, 2.85, fz - s * 0.02, 'wood', { tint: signs[i % signs.length], collide: false, detail: true });
      if (rng() < 0.45 && W.kits.has('props/Barrel')) prop(F, rng() < 0.5 ? 'props/Barrel' : 'props/Crate_Wooden', bx + 2.3, 0, zb - s * 0.9, { s: 0.9, ry: rng() * 6 });
      // the roof (a lean-to falling towards the square) and the columns at the front line
      F.box(bay + 0.06, 0.28, depth + 0.6, bx, hgt - 0.1, zc - s * 0.3, 'roof', { tint: 0x8a5040, collide: false, rx: -s * 0.08 });
      F.box(bay, 0.45, 0.5, bx, hgt - 0.55, zf, 'stone', { tint: 0xd8ccb0, collide: false });
      for (const e of [-1, 1]) {
        if (e < 0 && i > 0 && ok[i - 1]) continue; // the column between two bays is placed once
        F.cyl(0.3, hgt - 0.55, bx + e * bay / 2, 0, zf, 'stone', { seg: 10, tint: 0xe6dfcf });
      }
      // end walls where the arcade breaks
      for (const e of [-1, 1]) if (!(ok[i + e] ?? false)) F.box(0.4, hgt, depth, bx + e * (bay / 2 - 0.2), 0, zc, 'plaster', { tint });
      O.add(F.at(bx, 0, zc), 3.2);
      O.add(F.at(bx - 2, 0, zc), 2.6);
      O.add(F.at(bx + 2, 0, zc), 2.6);
    }
  }
}

/** The covered market hall: a stone floor, two rows of columns, a hipped roof, trestle tables with produce under it. */
function marketHall(W, F, sq, O, rng) {
  const hw = 26, hd = 13;
  for (const [lx, lz] of [[0, -sq.d * 0.2], [0, sq.d * 0.2], [-sq.w * 0.22, 0], [sq.w * 0.22, 0]]) {
    const probe = [[0, 0], [-hw / 2, -hd / 2], [hw / 2, -hd / 2], [hw / 2, hd / 2], [-hw / 2, hd / 2], [0, -hd / 2], [0, hd / 2], [-hw / 2, 0], [hw / 2, 0], [-hw / 4, 0], [hw / 4, 0]];
    if (!probe.every(([a, b]) => O.free(F.at(lx + a, 0, lz + b), 2))) continue;
    F.box(hw + 1, 0.18, hd + 1, lx, 0, lz, 'stone', { tint: 0xcfc4a8, collide: false, castShadow: false });
    const cols = 6;
    for (let k = 0; k < cols; k++) for (const s of [-1, 1]) F.cyl(0.38, 5.2, lx - hw / 2 + 1 + k * ((hw - 2) / (cols - 1)), 0.18, lz + s * (hd / 2 - 0.5), 'stone', { seg: 10, tint: 0xe6dfcf });
    for (const s of [-1, 1]) F.box(hw, 0.6, 0.7, lx, 5.3, lz + s * (hd / 2 - 0.5), 'timber', { collide: false });
    F.put(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), hw + 2.4, 4.2, hd + 2.4, lx, 5.9, lz, 'roof', { tint: 0x9a5a44, collide: false });
    const goods = ['props/FarmCrate_Apple', 'props/FarmCrate_Carrot', 'props/Barrel_Apples', 'props/FarmCrate_Empty'];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const tx = lx - hw / 2 + 4 + i * ((hw - 8) / 3), tz = lz + s * 2.6;
      F.box(3.2, 0.85, 1.1, tx, 0.18, tz, 'wood', { tint: 0x7a5232 });
      for (const o of [-0.9, 0.9]) { const g = goods[(i + (s > 0 ? 2 : 0) + (o > 0 ? 1 : 0)) % goods.length]; if (W.kits.has(g)) prop(F, g, tx + o, 1.03, tz, { s: 0.75, ry: rng() * 0.4 }); }
    }
    O.add(F.at(lx, 0, lz), hd / 2 + 1);
    for (const a of [-1, -0.5, 0.5, 1]) O.add(F.at(lx + a * (hw / 2 - 3), 0, lz), hd / 2 + 1);
    return;
  }
}

/**
 * The rest of the open paving, on a 10 m grid (one piece per cell, so the walks between them stay 5 m wide or more): market goods
 * and carts; on the square of the Steps trees in stone rings, planters, benches round a lamp, kiosks; in the garden topiary,
 * flower planters and small pergolas.
 */
function pavingFill(W, F, sq, O, rng) {
  const g = sq.kind === 'market' ? 10 : 8.5, nx = Math.floor((sq.w - 16) / g), nz = Math.floor((sq.d - 16) / g);
  const x0 = -((nx - 1) * g) / 2, z0 = -((nz - 1) * g) / 2;
  let k = Math.floor(rng() * 5);
  const planter = (lx, lz) => {
    F.cyl(1.1, 0.7, lx, 0, lz, 'stone', { seg: 12, tint: 0xd2c6aa });
    F.cyl(0.95, 0.06, lx, 0.66, lz, 'stoneDark', { seg: 12, collide: false, castShadow: false, tint: 0x4a3a28 });
    for (let f = 0; f < 6; f++) { const a = (f / 6) * Math.PI * 2; kitH(W, F, 'nature/' + FLOWERS[(f + k) % FLOWERS.length], 0.5, lx + Math.cos(a) * 0.55, lz + Math.sin(a) * 0.55, { y: 0.7, cast: false }); }
    kitH(W, F, 'nature/plant_bushDetailed', 0.9, lx, lz, { y: 0.7 });
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lx = x0 + i * g + (rng() - 0.5) * 1.5, lz = z0 + j * g + (rng() - 0.5) * 1.5, p = F.at(lx, 0, lz);
    if (!O.free(p, 2.4)) continue;
    k++;
    if (sq.kind === 'market') {
      const G = new Frame(W, p.x, H(W, p.x, p.z), p.z, sq.rot + rng() * 6.28);
      const list = ['props/FarmCrate_Apple', 'props/Barrel_Apples', 'props/Crate_Wooden', 'props/FarmCrate_Carrot', 'bits/Textiles_Stack_Small'];
      if (k % 5 === 0) { const m = heroKit(F, 'obj/vendor_cart', { w: 3 }, lx, 0, lz, { ry: rng() * 6.28 }); if (m) F.box(m.w * 0.8, 1.4, m.d * 0.8, lx, 0, lz, 'wood', { collideOnly: true }); }
      else for (let c = 0; c < 3; c++) { const nm = list[(k + c) % list.length]; if (W.kits.has(nm)) prop(G, nm, (c - 1) * 1.1, 0, (c % 2) * 0.8, { s: nm.startsWith('bits/') ? 1.2 : 1, ry: rng() * 0.6 }); }
      O.add(p, 2.4);
    } else if (sq.kind === 'steps') {
      const m = k % 4;
      if (m === 0 || m === 2) { F.cyl(1.2, 0.3, lx, 0, lz, 'stone', { seg: 12, tint: 0xd2c6aa, collide: false, castShadow: false }); tree(W, p.x, p.z, 0.75 + rng() * 0.2, rng, m === 0 ? 'oak' : 'birch'); }
      else if (m === 1) { planter(lx, lz); }
      else {
        lamp(W, new THREE.Vector3(p.x, H(W, p.x, p.z) + 0.12, p.z), 0);
        for (const s of [-1, 1]) bench(W, F, lx + s * 1.8, lz, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      O.add(p, 2.6);
    } else {
      // the garden: a grove of trees in lawn rounds, clipped topiary, planters and rose pergolas
      const m = k % 4;
      if (m === 0 || m === 2) {
        F.cyl(1.6, 0.25, lx, 0, lz, 'lawn', { seg: 14, tint: 0x6a9a44, collide: false, castShadow: false });
        tree(W, p.x, p.z, 0.85 + rng() * 0.25, rng, m === 0 ? 'oak' : 'birch');
      } else if (m === 1) {
        F.cyl(1.5, 0.35, lx, 0, lz, 'stone', { seg: 12, tint: 0xd2c6aa });
        kitH(W, F, 'nature/plant_bushTriangle', 3.0, lx, lz, { y: 0.35 });
      } else if (rng() < 0.5) planter(lx, lz);
      else {
        for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) F.box(0.22, 2.8, 0.22, lx + a, 0, lz + b, 'wood', { tint: 0xe8e0cc, collide: a < 0 && b < 0 });
        for (let r = -2; r <= 2; r++) F.box(3.6, 0.12, 0.14, lx, 2.8, lz + r * 0.8, 'wood', { tint: 0xe8e0cc, collide: false });
        for (const [a, b] of [[-1.6, -1.6], [1.6, 1.6]]) kitH(W, F, 'nature/plant_bushLarge', 1.6, lx + a, lz + b, {});
        kitH(W, F, 'nature/' + FLOWERS[k % FLOWERS.length], 0.7, lx, lz, { cast: false });
      }
      O.add(p, 2.6);
    }
  }
}
