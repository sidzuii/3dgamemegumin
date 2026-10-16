import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, paveRibbon, lamp, barrel, crate } from './Kit.js';
import { toW } from './AinstreyBuildings.js';
import { cityPlan, PIERS, BRIDGES, eastWallU } from '../AinstreyCityPlan.js';
import * as AIN from '../AinstreyPlan.js';

/**
 * The river port and the two bridges of Ainstrey (docs/ainstrey/TZ_capital.md §5): the quay along the east wall, the water gates
 * with the timber piers, the cranes, the boats, the cargo; the stairs of the high embankment; the north bridge (high, over the
 * bluff) and the great bridge (low). The bridges end at shut gatehouses on the east bank (a future part of the game).
 */
const H = (W, x, z) => W.heightAt(x, z);
const WATER = AIN.BIG_RIVER.level;

export function buildPort(W) {
  const P = cityPlan();
  quay(W, P);
  PIERS.forEach((pr, i) => { if (pr.v > -100) pier(W, pr, i); else riverStair(W, pr); });
  cranes(W);
  boats(W);
  for (const b of BRIDGES) bridge(W, b);
}

function quay(W, P) {
  // the apron between the quay road and the wall (the promenade) and the loading platforms
  const pts = P.quayRoad.pts.map(([u, v]) => toW(u + 17, v));
  const mid = pts[Math.floor(pts.length / 2)];
  W.group('ain_quay_apron', { x: mid[0], z: mid[1] }, () => {
    paveRibbon(W, pts, 18, { tint: 0xd0c8b4, lift: 0.1 });
    // the stone edge of the quay is the wall; bollards and lamps every 24 m on the promenade
    for (let k = 1; k < pts.length - 1; k += 1) {
      const [x, z] = pts[k];
      if (k % 2) continue;
      const F = new Frame(W, x + 9.5, H(W, x + 9.5, z), z, 0);
      F.cyl(0.28, 0.6, 0, 0, 0, 'metal', { seg: 8, collide: true });
    }
  }, 'Набережная: площадка');
}

/** A timber pier through a water gate: planks on piles, bollards, a canopy (the city pier), a pipe housing (the pump pier). */
function pier(W, pr, idx) {
  const wallU = eastWallU(pr.v);
  const [x0, z0] = toW(wallU + 5, pr.v);
  const len = pr.id === 'pier3' ? 70 : pr.id === 'pier4' ? 100 : 80;
  const deck = Math.max(1.0, H(W, x0, z0) + 0.12);
  W.group('ain_' + pr.id, { x: x0 + len / 2, z: z0, rot: Math.PI / 2 }, () => {
    const F = new Frame(W, x0 + len / 2, deck, z0, Math.PI / 2); // local z along the pier (to the east)
    const w = 7.5;
    F.box(w, 0.35, len, 0, -0.35, 0, 'plank', { tint: 0x8a6a44 });
    for (let k = 0; k < len; k += 5) F.box(w + 0.6, 0.22, 0.4, 0, -0.55, -len / 2 + k, 'log', { collide: false, tint: 0x5a402a, castShadow: false });
    // piles down into the river bed (they stand in the bank / the water)
    for (let k = 0; k <= len; k += 6) for (const s of [-1, 1]) {
      const p = F.at(s * (w / 2 - 0.4), 0, -len / 2 + k);
      const g = Math.min(H(W, p.x, p.z), -1);
      F.cyl(0.32, deck - g + 0.3, s * (w / 2 - 0.4), g - deck - 0.1, -len / 2 + k, 'log', { seg: 8, collide: false, tint: 0x4e3824, castShadow: false });
    }
    // rails with gaps for the boats, bollards
    for (const s of [-1, 1]) for (let k = 0; k < len; k += 4) {
      F.box(0.14, 1.0, 0.14, s * (w / 2 - 0.1), 0, -len / 2 + k, 'log', { collide: false, castShadow: false, tint: 0x5a402a });
      if (k % 16 !== 8) F.box(0.1, 0.1, 4.0, s * (w / 2 - 0.1), 0.9, -len / 2 + k + 2, 'log', { collide: false, castShadow: false, tint: 0x5a402a });
    }
    for (let k = 10; k < len; k += 12) for (const s of [-1, 1]) F.cyl(0.25, 0.5, s * (w / 2 - 0.5), 0, -len / 2 + k, 'metal', { seg: 8, collide: true });
    if (pr.id === 'pier3') {
      // the passenger landing: a canopy on posts, benches
      for (const zz of [-6, 6]) for (const s of [-1, 1]) F.cyl(0.22, 4.2, s * 3.0, 0, -len / 2 + 22 + zz, 'log', { seg: 8, collide: false, tint: 0x5a402a });
      F.box(8.2, 0.25, 15, 0, 4.2, -len / 2 + 22, 'roof', { tint: 0x566c86, collide: false });
      F.box(1.8, 0.45, 0.5, 2.4, 0, -len / 2 + 22, 'plank', { collide: false, tint: 0x7a5a3a });
    }
    if (pr.id === 'pier5') {
      // the pump pier: a housing for the pipes at the root and the white mark of the coupling (D22-D24) is added by the pump builder
      F.box(7.4, 3.2, 8, 0, 0, -len / 2 + 10, 'plaster', { tint: 0xb09a78 });
      F.put(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), 9, 2.2, 9.5, 0, 3.2, -len / 2 + 10, 'roof', { tint: 0x5c8b80, collide: false });
    }
    // cargo
    if (pr.id === 'pier4') for (let k = 0; k < 6; k++) { const p = F.at((k % 2 ? 1 : -1) * 2, 0, -len / 2 + 14 + k * 6); crate(W, new Frame(W, p.x, deck, p.z, k), 0, 0, 1.2, 0.2); }
  }, pr.name);
  W.spot(pr.id + '_root', new THREE.Vector3(x0, deck, z0), Math.PI / 2);
  W.spot(pr.id + '_end', new THREE.Vector3(x0 + len - 2, deck, z0), Math.PI / 2);
  // loading platform numbers on boards beside the pier roads
  const [sx, sz] = toW(wallU - 26, pr.v + 9);
  W.group('ain_' + pr.id + '_sign', { x: sx, z: sz }, () => W.addSign(new THREE.Vector3(sx, 0, sz), -Math.PI / 2, [`Грузовая площадка ${idx - 1}`, pr.name]), 'Табличка: ' + pr.name);
}

/** The high embankment (bluff): a stair down to a landing at the river with a rail and a lantern. */
function riverStair(W, pr) {
  const [edgeX, z] = toW(860, pr.v);
  W.group('ain_' + pr.id + '_stair', { x: edgeX, z }, () => {
    const topY = H(W, edgeX - 4, z);
    const n = Math.min(60, Math.max(8, Math.round((topY - (WATER + 0.3)) / 0.28)));
    for (let k = 0; k < n; k++) {
      const x = edgeX - 6 + k * 1.6, yy = topY - k * ((topY - WATER - 0.2) / n);
      const g = H(W, x, z);
      const F = new Frame(W, x, Math.min(yy, topY) - 0.5, z, 0);
      F.box(1.7, 0.5 + Math.max(0, yy - g), 4.2, 0, 0, 0, 'stone', { tint: 0xcfc4a8 });
      if (k % 3 === 0) for (const s of [-1, 1]) F.box(0.2, 1.0, 0.2, 0, 0.5 + Math.max(0, yy - g), s * 2.0, 'log', { collide: false, tint: 0x5a402a });
    }
    const [lx, lz] = [edgeX - 6 + n * 1.6, z];
    const F = new Frame(W, lx + 2, WATER + 0.25, lz, Math.PI / 2);
    F.box(6, 0.3, 8, 0, 0, 0, 'plank', { tint: 0x8a6a44 });
    for (const s of [-1, 1]) F.cyl(0.25, 1.4, s * 2.6, -0.8, 3.6, 'log', { seg: 8, collide: false, tint: 0x4e3824 });
    lamp(W, new THREE.Vector3(lx - 2, WATER + 0.3, lz + 3), 0);
    W.spot(pr.id + '_landing', new THREE.Vector3(lx + 2, WATER + 0.55, lz), Math.PI / 2);
  }, pr.name + ': лестница к воде');
}

function cranes(W) {
  // a tall port crane at the end of the cargo pier and a lighter one on the great quay
  for (const [u, v, rot, h] of [[889, 385, -Math.PI / 2, 21], [771, 470, 0, 15]]) {
    const [x, z] = toW(u, v);
    W.group('ain_crane_' + v, { x, z, rot }, () => {
      const y = Math.max(H(W, x, z), 1.0) + 0.1;
      const F = new Frame(W, x, y, z, rot);
      F.box(4, 1, 4, 0, 0, 0, 'stoneDark', { tint: 0x6a645c });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(0.5, h, 0.5, sx * 1.4, 0.5, sz * 1.4, 'log', { collide: sx > 0 && sz > 0, tint: 0x4e3824 });
      for (let k = 0; k < 3; k++) F.box(3.4, 0.3, 0.3, 0, 4 + k * 5.5, 1.4, 'log', { collide: false, tint: 0x4e3824 });
      F.box(1.4, 1.2, 30, 0, h + 0.5, 6, 'log', { collide: false, tint: 0x4e3824 });
      F.box(2.6, 1.6, 4, 0, h - 0.2, -7, 'metal', { collide: false });
      F.box(0.1, 12, 0.1, 0, h - 11.5, 18, 'metal', { collide: false });
      F.box(0.7, 0.9, 0.7, 0, h - 12.4, 18, 'metal', { collide: false });
    }, 'Портовый кран');
  }
}

function hull(F, len, wid, tint) {
  F.box(wid, 0.9, len * 0.7, 0, -0.4, 0, 'wood', { tint, collide: false });
  F.box(wid * 0.7, 0.9, len * 0.2, 0, -0.4, len * 0.45, 'wood', { tint, collide: false });
  F.box(wid * 0.55, 0.8, len * 0.2, 0, -0.4, -len * 0.45, 'wood', { tint, collide: false });
  F.box(wid * 0.8, 0.12, len * 0.9, 0, 0.5, 0, 'plank', { tint: 0x7a5a3a, collide: false });
}

function boats(W) {
  const rng = mulberry32(61);
  const spots = [[905, 270, 0.1], [930, 330, -0.15], [922, 458, 0.05], [912, 560, 0.2], [880, 700, 0], [905, -270, 0.1], [930, -120, 0.1], [960, 60, -0.1]];
  spots.forEach(([u, v, r], i) => {
    const [x, z] = toW(u, v);
    W.group('ain_boat_' + i, { x, z, rot: Math.PI / 2 + r }, () => {
      const len = 9 + rng() * 6, wid = 2.6 + rng();
      const F = new Frame(W, x, WATER - 0.2, z, Math.PI / 2 + r);
      hull(F, len, wid, [0x6a4630, 0x5a4636, 0x7a5a3a][i % 3]);
      F.cyl(0.14, 8.5, 0, 0.5, len * 0.1, 'log', { seg: 6, collide: false, tint: 0x4e3824 });
      if (i % 2) F.box(0.06, 5.5, 4, 0, 2.5, len * 0.1 + 0.4, 'cloth', { collide: false, tint: 0xe0d6bc });
      else F.box(wid * 0.55, 1.5, len * 0.28, 0, 0.6, -len * 0.1, 'plaster', { collide: false, tint: 0xd0c4aa });
      F.box(0.1, 1.0, len * 0.3, 0, 0.62, len * 0.05, 'door', { collide: false });
    }, 'Лодка ' + (i + 1));
  });
}

/** A bridge over the river: piers, a deck with parapets, lamps, and a shut gatehouse on the east bank. */
function bridge(W, B) {
  const wallU = eastWallU(B.v);
  const [ax, az] = toW(wallU + 4, B.v), [bx, bz] = toW(B.endU, B.v);
  const y0 = H(W, ax, az) + 0.25, y1 = Math.max(H(W, bx, bz) + 0.3, B.endY ?? 3.0);
  const len = bx - ax;
  const [mx, mz] = [(ax + bx) / 2, az];
  W.group('ain_' + B.id, { x: mx, z: mz, rot: Math.PI / 2 }, () => {
    const F = new Frame(W, ax, 0, az, Math.PI / 2); // local z = along the bridge, to the east
    const deckAt = (t) => y0 + (y1 - y0) * t; // linear fall to the east bank
    const n = Math.ceil(len / 6);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, y = deckAt(t), seg = len / n;
      F.box(B.width, 0.6, seg + 0.1, 0, y - 0.6, k * seg + seg / 2, 'stone', { tint: 0xc6bba4 });
      F.box(B.width - 0.8, 0.06, seg + 0.1, 0, y, k * seg + seg / 2, 'cobble', { castShadow: false, tint: 0xd6ccb8 });
      for (const s of [-1, 1]) {
        F.box(0.5, 1.0, seg + 0.1, s * (B.width / 2 - 0.25), y, k * seg + seg / 2, 'stoneDark', { tint: 0xc0b49c });
        F.box(0.8, 0.18, seg + 0.14, s * (B.width / 2 - 0.25), y + 1.0, k * seg + seg / 2, 'stone', { tint: 0xd8ccb0, collide: false });
      }
    }
    // piers: stone blocks from the river bed (and the bank) to the underside of the deck, every 30 m
    for (let k = 24; k < len - 12; k += 30) {
      const t = k / len, y = deckAt(t);
      const p = F.at(0, 0, k);
      const g = Math.min(H(W, p.x, p.z), WATER - 3.4);
      F.box(B.width - 3, y - 0.6 - g, 4.2, 0, g, k, 'stoneDark', { tint: 0xa89e8c, collide: false });
      F.box(B.width - 1.6, 0.4, 5.2, 0, y - 1.0, k, 'stone', { tint: 0xc6bba4, collide: false });
    }
    // lamps every 40 m
    for (let k = 20; k < len - 10; k += 40) for (const s of [-1, 1]) {
      const p = F.at(s * (B.width / 2 - 0.5), 0, k);
      lamp(W, new THREE.Vector3(p.x, deckAt(k / len) + 0.1, p.z), 0);
    }
    // the shut gatehouse at the east end
    const e = F.at(0, 0, len - 6), ey = deckAt(1);
    const G = new Frame(W, e.x, ey - 0.3, e.z, Math.PI / 2);
    for (const s of [-1, 1]) G.box(2.2, 8, 6, s * (B.width / 2 + 0.2), 0, 0, 'stoneDark', { tint: 0xb4aa94 });
    G.box(B.width + 4.4, 2.4, 6, 0, 6.2, 0, 'stoneDark', { tint: 0xb4aa94 });
    G.box(B.width, 6.4, 0.7, 0, 0, 0.5, 'door', { tint: 0x4a3a2c });
    for (const y of [1.0, 3.2, 5.4]) G.box(B.width + 0.1, 0.3, 0.85, 0, y, 0.5, 'metal', { collide: false });
    W.addSign(new THREE.Vector3(e.x - 6, 0, e.z + 3), -Math.PI / 2, [B.name, 'Восточный берег закрыт: дорога откроется в одном из следующих обновлений']);
    const front = F.at(0, 0, len - 12);
    W.spot(B.id + '_end', new THREE.Vector3(front.x, deckAt((len - 12) / len) + 0.1, front.z), Math.PI / 2);
    const start = F.at(0, 0, 6);
    W.spot(B.id + '_start', new THREE.Vector3(start.x, deckAt(6 / len) + 0.1, start.z), Math.PI / 2);
  }, B.name);
}
