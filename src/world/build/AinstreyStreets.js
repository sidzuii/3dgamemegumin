import { Frame, lantern } from './Kit.js';
import { toW } from './AinstreyBuildings.js';
import { nearPiece } from './AinstreyDecor.js';
import { CLASS, polyDist } from '../AinstreyCityPlan.js';
import * as AIN from '../AinstreyPlan.js';

/**
 * The life at the house fronts of the capital (docs/ainstrey/TZ_capital.md: «живая столица»): goods out by the shops (crates of
 * apples and carrots, barrels, sacks, cloth, pots), a bench or flower pots by the plain doors, lanterns on the walls of the
 * streets and the lanes, washing hung across the lanes. Everything stands within ~0.7 m of the wall: the pavement lanes of
 * the crowd (npc/Crowd.js) stay free, the doors stay clear (nothing in the middle of a front), the story's places too.
 * One editor group per block.
 */
const H = (W, x, z) => W.heightAt(x, z);
/** Goods by district: [kit piece, height] pairs, a shop shows two or three of them. */
const GOODS = {
  posad: [['props/FarmCrate_Apple', 0.55], ['props/FarmCrate_Carrot', 0.55], ['props/Barrel_Apples', 0.95], ['food/bag', 0.7], ['props/Bucket_Wooden_1', 0.45], ['food/pumpkin', 0.4]],
  steps: [['bits/Textiles_Stack_Large_Colored', 0.6], ['bits/Textiles_Stack_Small', 0.45], ['props/Vase_2', 0.75], ['props/Vase_4', 0.8], ['props/FarmCrate_Apple', 0.55], ['nature/pot_large', 0.7]],
  guilds: [['props/Crate_Wooden', 0.7], ['props/Barrel', 1.0], ['bits/Iron_Bars_Stack_Medium', 0.4], ['props/Chest_Wood', 0.6], ['props/Crate_Metal', 0.7]],
  old: [['props/Vase_4', 0.8], ['props/Barrel', 1.0], ['props/FarmCrate_Empty', 0.5], ['props/Pot_1', 0.5], ['nature/pot_large', 0.7]],
  academy: [['props/Vase_2', 0.75], ['props/Crate_Wooden', 0.7], ['nature/pot_large', 0.7], ['props/BookStand', 1.1]],
  port: [['props/Barrel', 1.0], ['props/Crate_Wooden', 0.7], ['props/Rope_2', 0.35], ['food/bag', 0.7], ['props/Bucket_Metal', 0.45]],
  garden: [['nature/pot_large', 0.7], ['props/Vase_4', 0.8]],
};
const CLOTH = [0xe8e0d0, 0xc8d8e8, 0xd8b0a0, 0xf0e0b0, 0xa8c0a0, 0xe0c8d8, 0xb8a888, 0xf4f0e8];
const near = (r, u, v, m) => {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), dx = u - r.u, dz = v - r.v;
  return Math.abs(dx * c - dz * s) <= r.w / 2 + m && Math.abs(dx * s + dz * c) <= r.d / 2 + m;
};

export function streetLife(W, P) {
  const spots = Object.values(W.npcSpots).map((s) => s.pos);
  // the carriageways of the plan in boxes, for the "not on another street" test
  const roads = P.streets.filter((o) => o.cls !== 'stair').map((o) => {
    const us = o.pts.map((p) => p[0]), vs = o.pts.map((p) => p[1]), r = o.width / 2 + 0.3;
    return { o, r, u0: Math.min(...us) - r, u1: Math.max(...us) + r, v0: Math.min(...vs) - r, v1: Math.max(...vs) + r };
  });
  const onRoad = (u, v) => roads.some((b) => u > b.u0 && u < b.u1 && v > b.v0 && v < b.v1 && polyDist(b.o.pts, u, v) < b.r);
  for (const B of P.blocks) {
    if (!B.lots?.length) continue;
    const [bx, bz] = toW(B.u, B.v);
    W.group('ain_life_' + B.id, { x: bx, z: bz }, (rng) => {
      for (const lot of B.lots) dressLot(W, P, B, lot, rng, spots, onRoad);
    }, 'Жизнь улицы: квартал ' + B.id);
  }
}

function dressLot(W, P, B, lot, rng, spots, onRoad) {
  if (lot.back || lot.inner) return;
  const cls = lot.laneLot ? 'lane' : lot.side >= 0 && lot.side < 10 ? B.sides[lot.side]?.cls : null;
  if (!cls || cls === 'stair') return;
  if (P.keys.some((k) => near(k, lot.u, lot.v, 8)) || P.squares.some((q) => near(q, lot.u, lot.v, -2))) return;
  const [x0, z0] = toW(lot.u, lot.v);
  const F0 = new Frame(W, x0, 0, z0, lot.rot);
  const front = lot.d / 2;
  // a point in front of the wall (lx along the front, out = metres out of the wall): world position if the place is free
  const at = (lx, out, r = 0.5) => {
    const p = F0.at(lx, 0, front + out);
    const u = p.x - AIN.ORIGIN.x, v = p.z - AIN.ORIGIN.z;
    if (onRoad(u, v) || P.squares.some((q) => near(q, u, v, 0.5)) || P.keys.some((k) => near(k, u, v, 1.5))) return null;
    if (spots.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 2.5 + r)) return null;
    return p;
  };
  const piece = (lx, out, name, h, opts = {}) => {
    const p = at(lx, out, opts.r);
    if (!p) return false;
    const F = new Frame(W, p.x, H(W, p.x, p.z), p.z, lot.rot);
    nearPiece(W, F, name, h, 0, 0, { ry: opts.ry ?? (rng() - 0.5) * 0.6, collide: opts.collide ?? true, cast: opts.cast ?? false, tint: opts.tint, y: opts.y });
    return true;
  };
  const goods = GOODS[lot.district] || GOODS.posad;
  const wide = lot.w / 2 - 0.9; // the free length on each side of the door
  if (lot.kind === 'warehouse') {
    // a few barrels and crates at a store's gate
    if (rng() < 0.4) { const s = rng() < 0.5 ? -1 : 1; piece(s * Math.min(wide, 3.5), 0.55, 'props/Barrel', 1.0); piece(s * Math.min(wide, 3.5) - s * 0.95, 0.5, 'props/Crate_Wooden', 0.7); }
    return;
  }
  if (lot.shop && wide > 1.8) {
    // goods out on both sides of the door (the door is 1.6 m wide in the middle)
    for (const s of [-1, 1]) {
      let lx = s * 1.45;
      const n = 1 + Math.floor(rng() * 2.2);
      for (let i = 0; i < n && Math.abs(lx) + 0.4 < wide; i++) {
        const [name, h] = goods[Math.floor(rng() * goods.length)];
        lx += s * 0.4;
        piece(lx, 0.42, name, h);
        lx += s * 0.5;
      }
    }
  } else if (cls !== 'lane' && rng() < 0.28 && wide > 2.4) {
    // a plain house: a bench or a pair of flower pots by the door
    const s = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.45) piece(s * 2.1, 0.4, 'furniture/bench', 0.8, { ry: Math.PI });
    else for (const k of [0, 1]) if (piece(s * (1.35 + k * 0.7), 0.35, 'nature/pot_small', 0.45, { tint: 0xb06a48 })) { const p = at(s * (1.35 + k * 0.7), 0.35); if (p) nearPiece(W, new Frame(W, p.x, H(W, p.x, p.z), p.z, lot.rot), 'nature/plant_bushSmall', 0.55, 0, 0, { y: 0.32 }); }
  } else if (cls === 'lane' && rng() < 0.3 && wide > 1.6) {
    // the lanes: a barrel, a bucket, a pot of flowers by a wall
    const s = rng() < 0.5 ? -1 : 1;
    const [name, h] = [['props/Barrel', 1.0], ['props/Bucket_Wooden_1', 0.45], ['nature/pot_large', 0.6]][Math.floor(rng() * 3)];
    piece(s * Math.min(wide, 2.2), 0.4, name, h);
  }
  // lanterns on the walls of the streets and the lanes (the axis and the avenues have lamp posts in their rows of trees)
  if ((cls === 'street' || cls === 'lane' || cls === 'quay') && rng() < (cls === 'lane' ? 0.3 : 0.4) && lot.w > 6) {
    const s = rng() < 0.5 ? -1 : 1, lx = s * (lot.w / 2 - 0.7);
    const p = F0.at(lx, 0, front + 0.22);
    const F = new Frame(W, p.x, H(W, p.x, p.z) + 2.9, p.z, lot.rot);
    F.box(0.06, 0.06, 0.32, 0, 0.38, -0.1, 'metal', { collide: false, castShadow: false, detail: true }); // the bracket
    lantern(W, F);
  }
  // washing across the lanes (from a first floor to the house opposite)
  if (cls === 'lane' && lot.floors >= 2 && rng() < 0.3) {
    const span = CLASS.lane.width + 1.6, lx = (rng() - 0.5) * Math.max(0, lot.w - 4);
    const p = F0.at(lx, 0, front);
    const y = H(W, p.x, p.z) + 4.6 + rng() * 0.8;
    const F = new Frame(W, p.x, y, p.z, lot.rot);
    F.box(0.025, 0.025, span, 0, 0, span / 2, 'wood', { tint: 0x8a7a60, collide: false, castShadow: false, detail: true });
    for (let z = 0.8; z < span - 0.6; z += 0.55 + rng() * 0.45) {
      if (rng() < 0.25) continue;
      const w = 0.35 + rng() * 0.4, h = 0.45 + rng() * 0.45;
      F.box(0.02, h, w, 0, -h, z + w / 2, 'cloth', { tint: CLOTH[Math.floor(rng() * CLOTH.length)], collide: false, castShadow: false, detail: true });
      z += w;
    }
  }
}
