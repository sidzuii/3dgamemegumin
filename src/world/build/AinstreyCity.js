import * as THREE from 'three';
import { mulberry32, fbm } from '../../core/math.js';
import { Frame, cityWall, paveRibbon, pavePoly, lamp, tree, stall, wagon, well, bench, barrel, crate, fence, heroKit } from './Kit.js';
import { lightHouse, keyBuilding, toW } from './AinstreyBuildings.js';
import { interiorBuilding, INTERIOR_IDS } from './AinstreyInteriors.js';
import { pumpHouse } from './AinstreyPump.js';
import { cityPlan, CLASS, PIERS, BRIDGES, GARDEN_ALLEYS, eastWallU, nearStreet, rectCorners, polyDist } from '../AinstreyCityPlan.js';
import { buildPort } from './AinstreyPort.js';
import { QuestProp } from '../Interactables.js';
import { CITIZEN_SPOTS } from '../../data/citizens.js';
import { CityStream } from '../CityStream.js';
import { decorateSquares, boulevards } from './AinstreyDecor.js';
import { streetLife } from './AinstreyStreets.js';
import * as AIN from '../AinstreyPlan.js';

/**
 * The capital (docs/ainstrey/TZ_capital.md): the streets, squares, lots and key buildings of the plan (AinstreyCityPlan.js), the wall
 * with its gates, the terrace stairs, the garden of the Council and the closed citadel. The port, the bridges and the quay
 * are in AinstreyPort.js. Everything is built in groups (the map editor moves them): one group per quarter, per street, per square.
 */
const LIFT = { axis: 0.1, avenue: 0.094, street: 0.088, lane: 0.082, quay: 0.09, stair: 0.092 };
const TINT = { axis: 0xf0e8d8, avenue: 0xe8dfcb, street: 0xdcd2bc, lane: 0xcdc2a8, quay: 0xd6cdbb, stair: 0xe6dcc4 };
const w2 = (u, v) => toW(u, v);
const nearStreetW = (x, z, pad) => nearStreet(x - AIN.ORIGIN.x, z - AIN.ORIGIN.z, pad);
const H = (W, x, z) => W.heightAt(x, z);

/** A polyline moved sideways by d (metres, to the left of the direction of travel), mitred. */
/** covered(x, z) for the strips of a street S: on another street's carriageway or a square (grown by m metres). */
function crossings(P, S, m) {
  const others = P.streets.filter((o) => o !== S && o.cls !== 'stair' && o.kind !== 'path').map((o) => {
    const us = o.pts.map((p) => p[0]), vs = o.pts.map((p) => p[1]), r = o.width / 2 + m;
    return { o, r, u0: Math.min(...us) - r, u1: Math.max(...us) + r, v0: Math.min(...vs) - r, v1: Math.max(...vs) + r };
  });
  return (x, z) => {
    const u = x - AIN.ORIGIN.x, v = z - AIN.ORIGIN.z;
    if (P.squares.some((q) => pointNear(q, u, v, m))) return true;
    return others.some((b) => u > b.u0 && u < b.u1 && v > b.v0 && v < b.v1 && polyDist(b.o.pts, u, v) < b.r);
  };
}

function offsetLine(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    out.push([pts[i][0] - (dz / L) * d, pts[i][1] + (dx / L) * d]);
  }
  return out;
}

export function buildCity(W) {
  const P = cityPlan();
  // nobody plants a tree inside the walls
  W.keepClear.push({ poly: AIN.CITY_WALL.map((n) => w2(n.u, n.v)), margin: 22 });

  // ---- named places (fast travel stops, the story, the NPCs): squares and gates
  for (const sq of P.squares) {
    const [x, z] = w2(sq.u, sq.v);
    W.spot('ain_sq_' + sq.id, new THREE.Vector3(x, H(W, x, z), z), Math.PI);
  }
  // the plain houses get their kit models on demand round the camera (the editor shows the light ones)
  if (!W.editorMode) W.stream ??= new CityStream(W);
  W._bigChunk = 256;
  try { buildParts(W, P); } finally { W._bigChunk = 0; }
}

function buildParts(W, P) {
  const rng0 = mulberry32(8080);
  streets(W, P);
  squares(W, P, rng0);
  terraces(W, P);
  quarters(W, P);
  keys(W, P);
  capitalSpots(W, P);
  wall(W);
  buildPort(W);
  garden(W, P, rng0);
  citadel(W);
  northIntake(W, P);
  signs(W, P);
  lamps(W, P);
  // the dressing goes last: it keeps clear of every named place and piece already there
  decorateSquares(W, P);
  boulevards(W, P);
  streetLife(W, P);
}

// -----------------------------------------------------------------------------------------------------------------
// Streets
// -----------------------------------------------------------------------------------------------------------------
function streets(W, P) {
  for (const S of P.streets) {
    if (S.cls === 'stair' || S.kind === 'path') continue; // the terrace rows are slopes with stairs and trees (terraces()), not streets
    const pts = S.pts.map(([u, v]) => w2(u, v));
    const mid = pts[Math.floor(pts.length / 2)];
    W.group('ain_st_' + S.id, { x: mid[0], z: mid[1] }, () => {
      const cls = S.cls;
      const width = cls === 'stair' ? 22 : S.width;
      const lift = LIFT[cls] ?? 0.088;
      paveRibbon(W, pts, width, { tint: TINT[cls] ?? TINT.street, lift });
      const kerb = CLASS[cls].kerb;
      if (kerb > 0.8 && cls !== 'lane') {
        // the pavements: flagstones along the fronts, a darker gutter at the edge of the carriageway
        for (const side of [-1, 1]) paveRibbon(W, offsetLine(pts, side * (width / 2 + kerb / 2)), kerb, { mat: 'plaza', tint: 0xe4dac6, lift: lift + 0.05 });
        const cov = crossings(P, S, 4);
        for (const side of [-1, 1]) paveRibbon(W, offsetLine(pts, side * (width / 2 - 0.3)), 0.45, { tint: 0x9a9182, lift: lift + 0.014, covered: cov });
        // the boulevards: a band of flagstones under the row of trees (AinstreyDecor.boulevards) narrows the open cobbles
        if (cls === 'axis' || cls === 'avenue') {
          const cov5 = crossings(P, S, 5);
          for (const side of [-1, 1]) paveRibbon(W, offsetLine(pts, side * (width / 2 - 2.0)), 2.6, { mat: 'plaza', tint: 0xbcb19a, lift: lift + 0.03, covered: cov5 });
        }
      }
    }, 'Улица: ' + S.name);
  }
}

// -----------------------------------------------------------------------------------------------------------------
// Squares
// -----------------------------------------------------------------------------------------------------------------
function fountain(W, x, z, r = 3.4, tint = 0xcfc4a8) {
  const y = H(W, x, z);
  const F = new Frame(W, x, y, z, 0);
  // the three-tier fountain model (obj/grand_fountain) when it is there; its basin collides as a low drum
  const m = heroKit(F, 'obj/grand_fountain', { w: r * 2 + 1.6 }, 0, 0.05, 0);
  if (m) {
    F.cyl(m.w / 2 - 0.2, 1.1, 0, 0, 0, 'stone', { seg: 16, collideOnly: true });
    W.addFootprint(x, z, m.w, m.w, 0, 'fountain');
    return;
  }
  F.cyl(r, 0.9, 0, 0, 0, 'stone', { seg: 16, tint });
  F.cyl(r - 0.35, 0.18, 0, 0.75, 0, 'water', { seg: 16, collide: false, castShadow: false });
  F.cyl(0.5, 2.4, 0, 0, 0, 'stone', { seg: 12, tint });
  F.cyl(1.3, 0.35, 0, 1.9, 0, 'stone', { seg: 12, tint, collide: false });
  F.cyl(0.9, 0.12, 0, 2.2, 0, 'water', { seg: 12, collide: false, castShadow: false });
  W.addFootprint(x, z, r * 2, r * 2, 0, 'fountain');
}

function squares(W, P, rng0) {
  for (const sq of P.squares) {
    const corners = rectCorners(sq, 0).map(([u, v]) => w2(u, v));
    const [cx, cz] = w2(sq.u, sq.v);
    W.group('ain_sq_' + sq.id, { x: cx, z: cz, rot: sq.rot }, (rng) => {
      pavePoly(W, corners, { tint: 0xf0e8d8, lift: 0.125 });
      const F = new Frame(W, cx, H(W, cx, cz), cz, sq.rot);
      // the pattern of the paving: a darker frame round the square and bands of flagstones every ~22 m, so a large square reads
      // as laid out in fields instead of one even sheet of tiles
      {
        const L = (a, b) => [a, b].map(([x, z]) => { const p = F.at(x, 0, z); return [p.x, p.z]; });
        const hw = sq.w / 2 - 2.5, hd = sq.d / 2 - 2.5;
        paveRibbon(W, L([-hw, -hd], [hw, -hd]).concat(L([hw, hd], [-hw, hd])), 1.6, { mat: 'plaza', tint: 0xc9bea6, lift: 0.15, closed: true });
        const nx = Math.max(1, Math.round(sq.w / 22)), nz = Math.max(1, Math.round(sq.d / 22));
        for (let i = 1; i < nx; i++) { const x = -sq.w / 2 + (i * sq.w) / nx; paveRibbon(W, L([x, -hd], [x, hd]), 0.9, { mat: 'plaza', tint: 0xd6ccb6, lift: 0.15 }); }
        for (let j = 1; j < nz; j++) { const z = -sq.d / 2 + (j * sq.d) / nz; paveRibbon(W, L([-hw, z], [hw, z]), 0.9, { mat: 'plaza', tint: 0xd6ccb6, lift: 0.15 }); }
      }
      switch (sq.kind) {
        case 'steps': {
          // the low water cascade beside the stair (north-west corner) and benches under the arcade
          for (let i = 0; i < 5; i++) F.box(3, 0.5, 4, -sq.w / 2 + 6, 0.3 - i * 0.12, 0, 'stone', { collide: false, tint: 0xcfc4a8, rz: 0 });
          for (const bx of [-30, -12, 12, 30]) bench(W, F, bx, sq.d / 2 - 6, 0);
          break;
        }
        case 'market':
        case 'wagons': {
          const n = sq.kind === 'market' ? 12 : 6;
          for (let i = 0; i < n; i++) {
            const a = rng() * 6.28, px = (rng() - 0.5) * (sq.w - 24), pz = (rng() - 0.5) * (sq.d - 20);
            const p = F.at(px, 0, pz);
            if (nearStreetW(p.x, p.z, 6)) continue; // never on the way
            if (sq.kind === 'market') stall(W, p.x, p.z, sq.rot + Math.round(a / 1.57) * 1.57, [0xb8453a, 0x3a6a8a, 0x4a7a4a, 0xc89a3a][i % 4], ['fruit', 'mixed', 'bread'][i % 3], rng);
            else wagon(W, p.x, p.z, a, [0xe8dcc0, 0xd8c8a0, 0xc8d0d8][i % 3]);
          }
          if (!nearStreetW(cx, cz, 4)) well(W, cx, cz);
          break;
        }
        case 'cargo': {
          for (let i = 0; i < 10; i++) { const p = F.at((rng() - 0.5) * (sq.w - 20), 0, (rng() - 0.5) * (sq.d - 20)); if (nearStreetW(p.x, p.z, 4)) continue; crate(W, new Frame(W, p.x, H(W, p.x, p.z), p.z, rng() * 3), 0, 0, 1 + rng() * 0.6, rng() * 3); }
          for (let i = 0; i < 6; i++) { const p = F.at((rng() - 0.5) * (sq.w - 20), 0, (rng() - 0.5) * (sq.d - 20)); if (nearStreetW(p.x, p.z, 4)) continue; barrel(W, new Frame(W, p.x, H(W, p.x, p.z), p.z, 0), 0, 0); }
          // painted numbers of the loading platforms: low stone slabs
          for (let i = 0; i < 4; i++) F.box(10, 0.04, 6, -sq.w / 2 + 14 + i * 24, 0.14, sq.d / 2 - 8, 'stoneDark', { collide: false, castShadow: false, tint: 0x9a9484 });
          break;
        }
        case 'academy': {
          // the measuring circle and two water channels (the court of the academy)
          F.cyl(7, 0.05, 0, 0.14, 0, 'stoneDark', { seg: 24, collide: false, castShadow: false, tint: 0x8a8478 });
          F.cyl(6.2, 0.06, 0, 0.16, 0, 'plaza', { seg: 24, collide: false, castShadow: false, tint: 0xf0e8d8 });
          for (const s of [-1, 1]) { F.box(sq.w - 14, 0.5, 1.4, 0, -0.1, s * 16, 'stone', { collide: false, tint: 0xcfc4a8 }); F.box(sq.w - 16, 0.1, 0.8, 0, 0.2, s * 16, 'water', { collide: false, castShadow: false }); }
          for (const [bx, bz] of [[-26, 0], [26, 0]]) bench(W, F, bx, bz, 0);
          break;
        }
        case 'council':
          // a pair of fountains beside the axis of the garden (the axis walks through the middle of the square)
          for (const s of [-1, 1]) { const p = F.at(s * 26, 0, 16); fountain(W, p.x, p.z, 3.2); }
          break;
        case 'cathedral':
        case 'theatre':
        case 'guild': {
          // the fountain in the middle, or beside it when a street crosses the middle
          const r = sq.kind === 'cathedral' ? 4.2 : 3.2;
          const at = [[0, 0], [-sq.w * 0.22, 0], [sq.w * 0.22, 0], [0, -sq.d * 0.22], [0, sq.d * 0.22]].map(([x, z]) => F.at(x, 0, z)).find((p) => !nearStreetW(p.x, p.z, r + 3));
          if (at) fountain(W, at.x, at.z, r);
          break;
        }
        default: { const at = [[0, 0], [-sq.w * 0.22, 0], [sq.w * 0.22, 0], [0, sq.d * 0.22]].map(([x, z]) => F.at(x, 0, z)).find((p) => !nearStreetW(p.x, p.z, 5)); if (at) well(W, at.x, at.z); }
      }
      if (sq.kind === 'cathedral' || sq.kind === 'guild' || sq.kind === 'theatre') {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = F.at(sx * (sq.w / 2 - 6), 0, sz * (sq.d / 2 - 6)); tree(W, p.x, p.z, 0.9 + rng() * 0.3, rng, 'oak'); }
      }
    }, 'Площадь: ' + sq.name);
  }
}

// -----------------------------------------------------------------------------------------------------------------
// The terraces: stairs over the bands of the terrain (the ground itself is a slope; the stairs are the way for people and the landmark)
// -----------------------------------------------------------------------------------------------------------------
function terraces(W) {
  const stairs = [
    { T: AIN.TERRACES[0], u: -33, width: 76, name: 'Лестница Ступеней', cascade: true },
    { T: AIN.TERRACES[1], u: 190, width: 46, name: 'Театральная лестница' },
    { T: AIN.TERRACES[1], u: -430, width: 30, name: 'Гильдейская лестница' },
    { T: AIN.TERRACES[2], u: -33, width: 54, name: 'Лестница Сада' },
  ];
  for (const S of stairs) {
    const [cx, cz] = w2(S.u, S.T.edge(S.u));
    W.group('ain_stair_' + S.T.id + '_' + Math.round(S.u), { x: cx, z: cz, rot: 0 }, () => {
      const half = S.T.half, e = S.T.edge(S.u);
      const n = Math.max(6, Math.round(S.T.rise / 0.3));
      const run = (2 * half) / n;
      for (let k = 0; k < n; k++) {
        // tread k, from the low (south) side up to the north
        const vk = e + half - (k + 0.5) * run;
        const [x, z] = w2(S.u, vk);
        const zUp = w2(S.u, vk - run / 2)[1];
        const top = Math.max(H(W, x, zUp), H(W, x, z)) + 0.05;
        const F = new Frame(W, x, top - 1.2, z, 0);
        F.box(S.width, 1.2, run + 0.05, 0, 0, 0, 'stone', { tint: k % 2 ? 0xd8ccb0 : 0xcfc4a8 });
        for (const s of [-1, 1]) F.box(0.9, 1.15, run + 0.05, s * (S.width / 2 + 0.45), 1.2, 0, 'stone', { tint: 0xc9bda4 });
        if (S.cascade && k < n - 1) F.box(2.4, 0.18, run + 0.05, -S.width / 2 + 5, 1.2, 0, 'water', { collide: false, castShadow: false });
      }
      // lanterns at the top corners
      for (const s of [-1, 1]) { const p = w2(S.u + s * (S.width / 2 + 2), e - half - 3); lamp(W, new THREE.Vector3(p[0], H(W, p[0], p[1]), p[1]), 0); }
      void cx; void cz;
    }, S.name);
  }
  // the boulevards along the bands: a row of trees on both sides of each terrace street
  const rng = mulberry32(555);
  for (const T of AIN.TERRACES) {
    W.group('ain_blvd_' + T.id, { x: ORIGIN_X(), z: w2(0, T.edge(0))[1] }, () => {
      for (let u = -700; u <= 690; u += 26 + rng() * 6) {
        if (Math.abs(u + 33) < 70 || Math.abs(u - 190) < 40 || Math.abs(u + 430) < 25) continue; // stairs
        for (const s of [-1, 1]) {
          const [x, z] = w2(u, T.edge(u) + s * (T.half + 6));
          if (!AIN.CITY_WALL || !insideWall(u, T.edge(u))) continue;
          tree(W, x, z, 0.8 + rng() * 0.3, rng, rng() < 0.3 ? 'birch' : 'oak');
        }
      }
    }, 'Бульвар вдоль террасы');
  }
}
const ORIGIN_X = () => AIN.ORIGIN.x;
const _wallPts = AIN.CITY_WALL.map((n) => [n.u, n.v]);
function insideWall(u, v) {
  let c = false;
  for (let i = 0, j = _wallPts.length - 1; i < _wallPts.length; j = i++) {
    const [xi, zi] = _wallPts[i], [xj, zj] = _wallPts[j];
    if (zi > v !== zj > v && u < ((xj - xi) * (v - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// -----------------------------------------------------------------------------------------------------------------
// Houses
// -----------------------------------------------------------------------------------------------------------------
function quarters(W, P) {
  const byBlock = new Map(P.blocks.map((b) => [b.id, b]));
  const quay = P.lots.filter((l) => l.block === 'quay');
  const lotsOf = new Map();
  for (const l of P.lots) { const q = l.block === 'quay' ? 'quay' : byBlock.get(l.block)?.quarter; if (!lotsOf.has(q)) lotsOf.set(q, []); lotsOf.get(q).push(l); }
  void quay;
  for (const q of P.quarters.concat([{ id: 'quay', u: 700, v: 130, district: 'port' }])) {
    const lots = lotsOf.get(q.id);
    if (!lots?.length) continue;
    const [gx, gz] = w2(q.u, q.v);
    W.group('ain_q_' + q.id, { x: gx, z: gz }, () => {
      for (const lot of lots) {
        const r = lightHouse(W, { ...lot, district: lot.district });
        const [x, z] = w2(lot.u, lot.v);
        W.addFootprint(x, z, lot.w, lot.d, lot.rot, lot.warehouse ? 'warehouse' : 'house');
        void r;
      }
      for (const B of P.blocks.filter((b) => b.quarter === q.id)) frontage(W, P, B);
      yardDecor(W, P, q);
    }, 'Квартал ' + (q.id === 'quay' ? 'складов на набережной' : q.id));
  }
}

/**
 * The street frontage of a block where no house stands (vacant lots, the gaps between houses): a stone wall of the yards with now
 * and then a gap for a gate, so the street is enclosed. It stays off the lanes, the squares, the key plots and the corners.
 */
function frontage(W, P, B) {
  const rng = mulberry32(Math.round(B.u * 13 + B.v * 7));
  for (const S of B.sides) {
    if (S.cls === 'stair') continue;
    const pts = S.pts, acc = [0];
    for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const total = acc[acc.length - 1];
    const at = (s) => {
      s = Math.max(0, Math.min(total, s));
      let k = 1;
      while (k < acc.length - 1 && acc[k] < s) k++;
      const f = (s - acc[k - 1]) / (acc[k] - acc[k - 1] || 1);
      const tx = pts[k][0] - pts[k - 1][0], tz = pts[k][1] - pts[k - 1][1], L = Math.hypot(tx, tz) || 1;
      return [pts[k - 1][0] + tx * f, pts[k - 1][1] + tz * f, tx / L, tz / L];
    };
    const [mx, mz, mtx, mtz] = at(total / 2);
    let nx = -mtz, nz = mtx;
    if ((B.u - mx) * nx + (B.v - mz) * nz < 0) { nx = -nx; nz = -nz; }
    const off = S.hw + 0.75;
    const step = 4;
    const free = [];
    for (let s = S.hw + 5; s <= total - S.hw - 5; s += step) {
      const [x, z, tx, tz] = at(s);
      let lnx = -tz, lnz = tx;
      if (lnx * nx + lnz * nz < 0) { lnx = -lnx; lnz = -lnz; }
      const u = x + lnx * off, v = z + lnz * off;
      const blocked = B.lots.some((l) => pointNear(l, u, v, 1.2)) || P.keys.some((k) => pointNear(k, u, v, 2.5)) || P.squares.some((q) => pointNear(q, u, v, 14)) || P.lanes.some((L) => polyDist(L.pts, u, v) < L.width / 2 + 3.2) || !insideCityPt(u, v, 18);
      free.push(blocked ? null : [u, v]);
    }
    // runs of free samples -> walls (a gate gap every 5th-9th piece)
    let run = [];
    const flush = () => { if (run.length >= 2) wallRun(W, run, rng); run = []; };
    let count = 0;
    for (const p of free) {
      if (!p) { flush(); count = 0; continue; }
      if (++count > 5 + Math.floor(rng() * 4)) { flush(); count = 0; continue; }
      run.push(p);
    }
    flush();
  }
}
const insideCityPt = (u, v, m) => AIN_CITY_SDF(u, v) < -m;
const AIN_CITY_SDF = (u, v) => {
  let inside = false, d = Infinity;
  for (let i = 0, j = _wallPts.length - 1; i < _wallPts.length; j = i++) {
    const [xi, zi] = _wallPts[i], [xj, zj] = _wallPts[j];
    if (zi > v !== zj > v && u < ((xj - xi) * (v - zi)) / (zj - zi) + xi) inside = !inside;
    const dx = xj - xi, dz = zj - zi, t = Math.max(0, Math.min(1, ((u - xi) * dx + (v - zi) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(u - xi - dx * t, v - zi - dz * t));
  }
  return inside ? -d : d;
};
function wallRun(W, run, rng) {
  const tint = [0xc9bda4, 0xd0c4aa, 0xbfb398][Math.floor(rng() * 3)];
  for (let i = 0; i + 1 < run.length; i++) {
    const [ax, az] = w2(...run[i]), [bx, bz] = w2(...run[i + 1]);
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    const y = Math.min(H(W, ax, az), H(W, bx, bz), H(W, (ax + bx) / 2, (az + bz) / 2)) - 0.35;
    const F = new Frame(W, (ax + bx) / 2, y, (az + bz) / 2, Math.atan2(bx - ax, bz - az));
    F.box(0.55, 3.15, L + 0.15, 0, 0, 0, W.mats.kit_village_MI_UnevenBrick ? 'kit_village_MI_UnevenBrick' : 'stone', { tint: W.mats.kit_village_MI_UnevenBrick ? 0xf0ece4 : tint });
    F.box(0.9, 0.22, L + 0.2, 0, 3.15, 0, 'stone', { tint: 0xe0d6bc, collide: false });
    if (i % 3 === 0) F.box(0.95, 3.5, 0.95, 0, 0, -L / 2, 'stone', { tint: 0xd8ccb0, collide: false });
  }
}

/** The courtyard of a quarter: trees, a well or a few crates, depending on its kind (the free middle of its first block). */
function yardDecor(W, P, q) {
  const Y = P.yards.find((y) => y.quarter === q.id);
  if (!Y) return;
  const B = P.blocks.find((b) => b.quarter === q.id);
  if (!B) return;
  const rng = mulberry32(Math.round(Y.u * 7 + Y.v * 3));
  const free = (u, v) => P.lots.every((l) => !(Math.abs(l.u - u) < 40 && Math.abs(l.v - v) < 40) || !pointNear(l, u, v, 4.5)) && P.streets.every((S) => polyDist(S.pts, u, v) > S.width / 2 + (CLASS[S.cls].kerb ?? 1) + 3) && P.squares.every((s) => !pointNear(s, u, v, 4)) && P.keys.every((k) => !pointNear(k, u, v, 4));
  let placed = 0;
  for (let k = 0; k < 40 && placed < 6; k++) {
    const f1 = 0.3 + rng() * 0.4, f2 = 0.3 + rng() * 0.4;
    const [a, b, c, d] = B.corners;
    const u = (a[0] * (1 - f1) + b[0] * f1) * (1 - f2) + (d[0] * (1 - f1) + c[0] * f1) * f2, v = (a[1] * (1 - f1) + b[1] * f1) * (1 - f2) + (d[1] * (1 - f1) + c[1] * f1) * f2;
    if (!free(u, v)) continue;
    const [x, z] = w2(u, v);
    const y = H(W, x, z);
    if (Y.kind === 'garden' || Y.kind === 'cloister' || Y.kind === 'academy' || Y.kind === 'guild') {
      if (placed === 0 && Y.kind !== 'garden') well(W, x, z);
      else tree(W, x, z, 0.8 + rng() * 0.35, rng, rng() < 0.3 ? 'birch' : 'oak');
    } else if (Y.kind === 'shipyard' || Y.kind === 'workshop') {
      const F = new Frame(W, x, y, z, rng() * 3);
      crate(W, F, 0, 0, 1.1, 0.3); crate(W, F, 1.2, 0.3, 0.9, 0.6); barrel(W, F, -1.3, 0.2);
    } else if (placed === 0) well(W, x, z);
    else wagon(W, x, z, rng() * 6);
    placed++;
  }
}
const pointNear = (r, u, v, m) => {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), dx = u - r.u, dz = v - r.v;
  return Math.abs(dx * c - dz * s) <= r.w / 2 + m && Math.abs(dx * s + dz * c) <= r.d / 2 + m;
};

/** The named places of the story outside the halls: the people at the gate and the yards, the bench of the garden, the store of the port, the houses of N01. */
function capitalSpots(W, P) {
  const lotFront = (r, dx = 0, out = 2.2) => { const c = Math.cos(r.rot), sn = Math.sin(r.rot), lz = r.d / 2 + out; return [r.u + dx * c + lz * sn, r.v - dx * sn + lz * c]; };
  const sp = (name, u, v, yaw = 0) => { const [x, z] = w2(u, v); W.spot(name, new THREE.Vector3(x, H(W, x, z), z), yaw); };
  sp('oskar_post', -9, 1062, Math.PI);
  const kg = (id) => P.keys.find((k) => k.id === id);
  { const k = kg('guild_hall'); const [u, v] = lotFront(k, 8, 5.5); sp('guild_yard_nera', u, v, k.rot + Math.PI); }
  { // a bench in the garden near the pair of fountains (the short talk D28)
    const [bx, bz] = w2(-47, -748);
    W.group('ain_garden_bench', { x: bx, z: bz }, () => bench(W, new Frame(W, bx, H(W, bx, bz), bz, Math.PI), 0, 0, 0), 'Скамья в саду');
    sp('garden_bench', -47, -752, 0);
  }
  { // the river store: a first-row warehouse of the quay by the square of the cargo; the people of D20 stand before its doors
    const stores = P.lots.filter((l) => l.warehouse && l.side === 0).sort((a, b) => Math.hypot(a.u - 740, a.v - 330) - Math.hypot(b.u - 740, b.v - 330));
    const l = stores[0];
    if (l) for (const [name, dx] of [['port_store_varlen', 0], ['port_store_nera', -4.5], ['port_store_selia', 4.5]]) { const [u, v] = lotFront(l, dx, 3.2); sp(name, u, v, l.rot + Math.PI); }
  }
  { // N01: the old house of the family (a workshop now) and the new house by the boat yard
    const homes = P.lots.filter((l) => !l.warehouse && l.w >= 7 && (l.district === 'port' || l.district === 'posad'));
    const nearest = (u, v, skip) => homes.filter((l) => l !== skip).sort((a, b) => Math.hypot(a.u - u, a.v - v) - Math.hypot(b.u - u, b.v - v))[0];
    const old = nearest(470, 520), nw = nearest(615, 430, old);
    for (const [name, l] of [['n01_old_workshop', old], ['n01_new_house', nw]]) if (l) { const [u, v] = lotFront(l, 0, 2.0); sp(name, u, v, l.rot + Math.PI); }
  }
  { // the stops of the carts of the city (fast travel, data/travel.js): the nearest point of a paved street to each place, facing the place
    const nearestStreetPoint = (u, v, pad = 0) => {
      let best = null;
      for (const S of P.streets) {
        if (S.cls === 'stair') continue;
        for (let i = 0; i + 1 < S.pts.length; i++) {
          const [ax, az] = S.pts[i], [bx, bz] = S.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - u, pz - v);
          if (!best || d < best.d) best = { u: px, v: pz, d, S };
        }
      }
      void pad;
      return best;
    };
    const stopAt = (name, u, v) => { const b = nearestStreetPoint(u, v); if (b) sp(name, b.u, b.v, Math.atan2(u - b.u, v - b.v)); };
    stopAt('stop_market', -365, 700); stopAt('stop_steps', -33, 412); stopAt('stop_academy', 306, -470); stopAt('stop_port', 735, 246); stopAt('stop_garden', -33, -750);
    sp('stop_gate', -20, 1062, Math.PI);
    for (const [name, id] of [['stop_guild', 'guild_hall'], ['stop_archive', 'archive']]) { const k = kg(id); const [u, v] = lotFront(k, 6, 4.5); sp(name, u, v, k.rot + Math.PI); }
  }
  { // the ambient people: a point at each place that is not on a street (shifted along u until it is clear)
    const byId = Object.fromEntries(P.squares.map((q) => [q.id, q]));
    CITIZEN_SPOTS.forEach(([sq, du, dv], i) => {
      const q = byId[sq];
      if (!q) return;
      let u = q.u + du, v = q.v + dv;
      for (let k = 0; k < 6 && nearStreet(u, v, 3.5); k++) u += 5;
      sp('ain_cit_' + (i + 1), u, v, (i * 1.7) % 6.28);
    });
  }
  { // N02: the chimney of the inn from the yard
    const k = kg('inn_tavia'), c = Math.cos(k.rot), sn = Math.sin(k.rot), lx = k.w / 2 + 2.4, lz = -4;
    sp('n02_roof', k.u + lx * c + lz * sn, k.v - lx * sn + lz * c, k.rot + Math.PI / 2);
  }
}

function keys(W, P) {
  for (const k of P.keys) {
    const [x, z] = w2(k.u, k.v);
    W.group('ain_key_' + k.id, { x, z, rot: k.rot }, () => {
      const r = INTERIOR_IDS.includes(k.id) ? interiorBuilding(W, k) : k.id === 'pump_house' ? pumpHouse(W, k) : keyBuilding(W, k);
      W.addFootprint(x, z, k.w, k.d, k.rot, 'public');
      W.spot(k.id + '_door', new THREE.Vector3(r.door.x, H(W, r.door.x, r.door.z), r.door.z), k.rot + Math.PI);
    }, k.name);
  }
}

// -----------------------------------------------------------------------------------------------------------------
// The wall: the castle-kit curtain with towers, the south gate and the water gates at the piers
// -----------------------------------------------------------------------------------------------------------------
function wall(W) {
  const nodes = [];
  const east = AIN.CITY_WALL.filter((n) => n.quay);
  const eastIn = (i) => AIN.CITY_WALL.indexOf(east[i]);
  const waterGates = [...PIERS.filter((p) => p.v > -100), ...BRIDGES].map((p) => ({ u: eastWallU(p.v), v: p.v, gate: p.id, h: 6.5, name: p.name })).sort((a, b) => a.v - b.v);
  AIN.CITY_WALL.forEach((n, i) => {
    nodes.push({ ...n, x: toW(n.u, n.v)[0], z: toW(n.u, n.v)[1], gate: n.gate, h: n.quay ? 6.5 : undefined, big: !!n.tower });
    // the water gates go between the quay nodes, in the order of the walk (v grows to the south)
    const next = AIN.CITY_WALL[i + 1];
    if (n.quay && next?.quay) {
      for (const g of waterGates.filter((g) => g.v > n.v && g.v <= next.v)) nodes.push({ ...g, x: toW(g.u, g.v)[0], z: toW(g.u, g.v)[1] });
    }
  });
  void eastIn;
  const gates = cityWall(W, nodes, {
    height: AIN.WALL_HEIGHT, thickness: 3, gateWidth: 8, wallGroup: 'ain_wall',
    groupFor: (n, i) => (n.gate ? 'ain_gate_' + n.gate : 'ain_wall_tower_' + i),
  });
  for (const { node, frame } of gates) {
    const out = frame.at(0, 0, 9), inn = frame.at(0, 0, -9);
    paveRibbon(W, [[inn.x, inn.z], [out.x, out.z]], 7.4, { tint: 0xd6ccb8, lift: 0.09 });
    W.spot('ain_gate_' + node.gate + '_in', new THREE.Vector3(inn.x, H(W, inn.x, inn.z), inn.z), frame.rot);
    W.spot('ain_gate_' + node.gate + '_out', new THREE.Vector3(out.x, H(W, out.x, out.z), out.z), frame.rot + Math.PI);
  }
}

// -----------------------------------------------------------------------------------------------------------------
// The garden of the Council and the citadel behind it
// -----------------------------------------------------------------------------------------------------------------
function garden(W, P, rng0) {
  const [cx, cz] = w2(-33, -800);
  W.group('ain_garden', { x: cx, z: cz }, (rng) => {
    // alleys
    for (const A of GARDEN_ALLEYS) paveRibbon(W, A.map(([u, v]) => w2(u, v)), 6, { tint: 0xe6dcc4, lift: 0.09 });
    // the pond (a hexagon of water in a stone rim)
    const [px, pz] = w2(100, -770);
    const F = new Frame(W, px, H(W, px, pz) - 0.2, pz, 0.3);
    F.cyl(24, 0.7, 0, 0, 0, 'stone', { seg: 6, tint: 0xcfc4a8 });
    F.cyl(22.6, 0.3, 0, 0.55, 0, 'water', { seg: 6, collide: false, castShadow: false });
    // pavilions
    for (const [u, v, rot] of [[-190, -815, 0], [200, -790, 0.4], [30, -870, 0]]) {
      const [x, z] = w2(u, v);
      const G = new Frame(W, x, H(W, x, z), z, rot);
      G.box(9, 0.4, 9, 0, 0, 0, 'stone', { tint: 0xd8ccb0 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.cyl(0.35, 3.6, sx * 3.8, 0.4, sz * 3.8, 'stone', { seg: 10, tint: 0xd8ccb0 });
      G.put(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), 10.5, 3.2, 10.5, 0, 4.0, 0, 'roof', { tint: 0x5c8b80, collide: false });
      bench(W, G, 0, 0, 0);
    }
    // trees with gaps: a jittered grid, thinned by noise, never on an alley, the pond, the plaza or a building
    const inGardenArea = (u, v) => u > -300 && u < 400 && v < -700 && v > -900;
    for (let u = -290; u < 400; u += 17) {
      for (let v = -880; v < -705; v += 17) {
        const uu = u + (rng() - 0.5) * 9, vv = v + (rng() - 0.5) * 9;
        if (!inGardenArea(uu, vv) || fbm(uu * 0.03 + 5, vv * 0.03, 2) < -0.05) continue;
        if (GARDEN_ALLEYS.some((A) => polyDist(A, uu, vv) < 6) || Math.hypot(uu - 100, vv + 770) < 30 || (Math.abs(uu + 33) < 85 && Math.abs(vv + 775) < 45)) continue;
        if (P.keys.some((k) => pointNear(k, uu, vv, 6))) continue;
        const [x, z] = w2(uu, vv);
        tree(W, x, z, 0.9 + rng() * 0.5, rng, rng() < 0.2 ? 'birch' : rng() < 0.25 ? 'pine' : 'oak');
      }
    }
    // low fences on the south edge of the garden, with the gaps of the stair and the alleys
    const gaps = [-215, -120, 65, 200]; // the alleys leave the garden here
    const runs = [[-290, -90], [20, 390]].flatMap(([a, b]) => {
      const cuts = gaps.filter((g) => g > a && g < b).sort((x, y) => x - y), out = []; let u0 = a;
      for (const g of cuts) { out.push([u0, g - 6]); u0 = g + 6; }
      out.push([u0, b]);
      return out.filter(([x, y]) => y - x > 3);
    });
    for (const [a, b] of runs) fence(W, [w2(a, -706), w2(b, -706)], { tint: 0xcfc4a8 });
  }, 'Сад Совета');
  void rng0;
}

/** The lower Northern intake: a closed portal in the north-east corner of the city (a future part): bars, a lock, a notice; nothing inside. */
function northIntake(W, P) {
  // a spot near the wall of the north-east corner with no lot, street or square within reach
  const wallPts = AIN.CITY_WALL.map((n) => [n.u, n.v]);
  let best = null;
  for (let i = 0; i < wallPts.length; i++) {
    const [a, b] = [wallPts[i], wallPts[(i + 1) % wallPts.length]];
    if (!(a[1] < -700 && a[0] > 300) || !(b[1] < -700 && b[0] > 300)) continue; // the north-east stretch of the wall
    for (let t = 0.2; t <= 0.8; t += 0.1) {
      const u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t;
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L; // normal (to the inside it points toward the city)
      for (const sgn of [1, -1]) {
        const pu = u + nx * sgn * 9, pv = v + nz * sgn * 9;
        if (!insideWall(pu, pv)) continue;
        if (P.lots.some((l) => Math.hypot(l.u - pu, l.v - pv) < 22) || nearStreet(pu, pv, 8) || P.keys.some((k) => Math.hypot(k.u - pu, k.v - pv) < 40)) continue;
        if (!best) best = { u: pu, v: pv, face: Math.atan2(-nx * sgn, -nz * sgn) + Math.PI, wu: u, wv: v };
      }
    }
  }
  if (!best) return;
  const [x, z] = w2(best.u, best.v);
  W.group('ain_north_intake', { x, z, rot: best.face }, () => {
    const F = new Frame(W, x, H(W, x, z), z, best.face);
    F.box(9, 4.6, 4, 0, 0, 0, 'stone', { tint: 0xa89e8c });
    F.box(5.2, 0.5, 4.4, 0, 3.6, 0, 'stone', { tint: 0xcfc4a8, collide: false });
    F.box(3.0, 3.2, 0.5, 0, 0, 2.05, 'stoneDark', { collide: false, tint: 0x2a2a2e }); // the dark mouth
    for (let i = 0; i < 7; i++) F.box(0.1, 3.2, 0.1, -1.35 + i * 0.45, 0, 2.3, 'metal', { collide: false }); // the bars
    F.box(3.0, 0.1, 0.12, 0, 1.2, 2.3, 'metal', { collide: false });
    F.box(0.3, 0.36, 0.14, 0.9, 1.1, 2.38, 'metal', { collide: false, tint: 0xa8903a }); // the lock
    const front = F.at(0, 0, 4.4);
    W.spot('north_intake_gate', new THREE.Vector3(front.x, H(W, front.x, front.z), front.z), best.face + Math.PI);
    W.addSign(new THREE.Vector3(front.x + 3.4 * Math.cos(best.face), 0, front.z - 3.4 * Math.sin(best.face)), best.face + Math.PI, ['Нижний Северный водозабор: закрыто', 'Служба готовит отдельное обследование', 'Внутри нет задач для отряда']);
    W.addInteractable(new QuestProp({ id: 'north_intake_gate', name: 'Решётка водозабора', prompt: 'Осмотреть решётку', position: new THREE.Vector3(front.x, H(W, front.x, front.z) + 1.3, front.z), shape: 'none' }));
  }, 'Нижний Северный водозабор (закрыт)');
}

/** The inner citadel: a high wall, a closed gate facing the garden, the roofs of its keep over the wall. A future part of the game. */
function citadel(W) {
  const pts = AIN.CITADEL.pts;
  const nodes = pts.map(([u, v], i) => ({ u, v, x: toW(u, v)[0], z: toW(u, v)[1], big: true }));
  // the gate on the long south side (between the two southern corners)
  const south = nodes.findIndex((n, i) => n.v === -905 && nodes[(i + 1) % nodes.length].v === -905);
  const g0 = nodes[south], g1 = nodes[(south + 1) % nodes.length];
  const gate = { u: (g0.u + g1.u) / 2, v: -905, gate: 'citadel', big: false };
  gate.x = toW(gate.u, gate.v)[0]; gate.z = toW(gate.u, gate.v)[1];
  nodes.splice(south + 1, 0, gate);
  const gates = cityWall(W, nodes, { height: AIN.CITADEL.wallHeight, thickness: 3.4, gateWidth: 7, wallGroup: 'ain_citadel_wall', groupFor: (n, i) => (n.gate ? 'ain_citadel_gate' : 'ain_citadel_tower_' + i) });
  for (const { frame } of gates) {
    // the leaves are shut: the way is closed, the sign says why
    const F = frame;
    F.box(7.6, 8.6, 0.8, 0, 0, 0, 'door', { tint: 0x4a3a2c });
    for (const y of [1.2, 4.0, 7.2]) F.box(7.7, 0.35, 0.95, 0, y, 0, 'metal', { collide: false });
    F.box(0.5, 8.6, 0.95, 0, 0, 0, 'metal', { collide: false });
    // the outer side of the gate: the city lies south (+z) of the citadel; the gate frame's local z may point either way
    const out = F.at(0, 0, 1).z > F.origin.z ? 1 : -1;
    const yaw = out > 0 ? frame.rot + Math.PI : frame.rot; // facing the gate from outside
    // two watchtowers outside the gate (obj/watchtower), solid as round drums
    for (const sx of [-1, 1]) {
      const p = F.at(sx * 13, 0, 9 * out);
      const T = new Frame(W, p.x, H(W, p.x, p.z) - 0.1, p.z, F.rot + (sx > 0 ? Math.PI : 0));
      const m = heroKit(T, 'obj/watchtower', { h: 15 }, 0, 0, 0);
      if (m) T.cyl(m.w * 0.42, 13, 0, 0, 0, 'stone', { seg: 12, collideOnly: true });
    }
    const front = frame.at(0, 0, 7 * out);
    W.spot('ain_citadel_gate', new THREE.Vector3(front.x, H(W, front.x, front.z), front.z), yaw);
    W.addSign(new THREE.Vector3(front.x + 4, 0, front.z), yaw, ['Внутренняя цитадель закрыта', 'Проход откроется в одном из следующих обновлений']);
    // the leaf answers when examined (the status of the closed part: it is shown on the map as well)
    W.addInteractable(new QuestProp({ id: 'citadel_gate', name: 'Ворота цитадели', prompt: 'Осмотреть закрытые ворота', position: new THREE.Vector3(front.x, H(W, front.x, front.z) + 1.4, front.z), shape: 'none' }));
  }
  // the roofs of the keep over the wall: a tall tower and two lower halls (no collision: nobody gets there)
  const [kx, kz] = toW(0, -1010);
  const F = new Frame(W, kx, H(W, kx, kz), kz, 0);
  F.box(34, 20, 22, 0, 0, 0, 'stone', { tint: 0xb4aa94, collide: false });
  F.put(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), 38, 14, 26, 0, 20, 0, 'roof', { tint: 0x5d7189, collide: false });
  F.box(9, 38, 9, -18, 0, 4, 'stone', { tint: 0xb4aa94, collide: false });
  F.put(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), 11, 12, 11, -18, 38, 4, 'roof', { tint: 0x5d7189, collide: false });
  for (const [dx, dz] of [[-120, 20], [110, 10]]) { F.box(30, 12, 16, dx, 0, dz, 'stone', { tint: 0xb4aa94, collide: false }); F.put(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), 33, 9, 19, dx, 12, dz, 'roof', { tint: 0x6a7c92, collide: false }); }
}

// -----------------------------------------------------------------------------------------------------------------
// Signposts and lamps
// -----------------------------------------------------------------------------------------------------------------
function signs(W, P) {
  const text = {
    steps: ['Площадь Ступеней', 'Гильдия — на запад', 'Речной порт — на восток', 'Городской архив — на северо-запад', 'Южные ворота — назад по главному проспекту'],
    market: ['Большой рынок', 'Постоялый двор «Двор Тавии» — на восток', 'Площадь Ступеней — на север'],
    wagons: ['Площадь Обозов', 'Южные ворота — на юго-запад', 'Речной порт — на север и восток'],
    theatre: ['Театральная площадь', 'Академические улицы — на север', 'Речной порт — на восток'],
    guild: ['Гильдейская площадь', 'Гильдия Айнстрея — здесь, под часами', 'Площадь Ступеней — на восток'],
    cathedral: ['Соборная площадь', 'Городской архив — на запад', 'Сад Совета — на север'],
    academy: ['Малый академический двор', 'Академия — на север', 'Архив — на запад'],
    cargo: ['Грузовая площадь', 'Портовая контора — на север', 'Насосный склад — на юг (служебная зона)'],
    council: ['Сад Совета', 'Закрытые ворота цитадели — на север'],
  };
  for (const sq of P.squares) {
    const lines = text[sq.kind];
    if (!lines) continue;
    const [x, z] = w2(sq.u + sq.w / 2 - 5, sq.v + sq.d / 2 - 4);
    W.group('ain_sign_' + sq.id, { x, z, rot: Math.PI }, () => W.addSign(new THREE.Vector3(x, 0, z), Math.PI, lines), 'Указатель: ' + sq.name);
  }
}

function lamps(W, P) {
  const rng = mulberry32(2024);
  for (const S of P.streets) {
    if (S.cls !== 'quay') continue; // the axis and the avenues: in the rows of trees (AinstreyDecor.boulevards); streets and lanes: lanterns on the walls (AinstreyStreets)
    const [mx, mz] = w2(...S.pts[Math.floor(S.pts.length / 2)]);
    W.group('ain_lamps_' + S.id, { x: mx, z: mz }, () => {
      // one lamp every ~46 m, alternating sides, on the kerb
      let acc = 0, side = 1;
      for (let i = 1; i < S.pts.length; i++) {
        const [ax, az] = S.pts[i - 1], [bx, bz] = S.pts[i];
        const L = Math.hypot(bx - ax, bz - az);
        acc += L;
        if (acc < 46) continue;
        acc = 0; side = -side;
        const dx = (bx - ax) / L, dz = (bz - az) / L;
        const off = S.width / 2 + CLASS[S.cls].kerb * 0.7;
        const u = bx - dz * side * off, v = bz + dx * side * off;
        if (!insideWall(u, v)) continue;
        if (P.streets.some((o) => o !== S && o.cls !== 'stair' && polyDist(o.pts, u, v) < o.width / 2 + 1.2)) continue; // not in the middle of a crossing street
        const [x, z] = w2(u, v);
        // never in front of a door of a lot or on a square
        if (P.squares.some((s) => pointNear(s, u, v, 1)) || P.lots.some((l) => Math.abs(l.u - u) < 30 && Math.abs(l.v - v) < 30 && pointNear(l, u, v, 0.6))) continue;
        lamp(W, new THREE.Vector3(x, H(W, x, z) + 0.12, z), 0);
      }
    }, 'Фонари: ' + S.name);
  }
  void rng;
}
