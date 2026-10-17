import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, house, houseTower, cityWall, paveRibbon, pavePoly, lamp, lantern, barrel, crate, stall, well, bench, wagon, haystack, fence, tree, bush, food, prop, tableware } from './Kit.js';
import { HealingCrystal, Brazier, QuestProp, Door } from '../Interactables.js';
import { TrainingDummy } from '../TrainingDummy.js';
import { ROOF_COLORS } from '../KitLibrary.js';
import { REGION, offsetPolygon } from '../MapData.js';
import { AXEL, WALL, RING, SQUARES, AREAS, STREETS, BUILDINGS, ENVELOPE, toWorld, FACE_ROT, streetLine, ringLine } from '../AxelPlan.js';
import { LOTS } from './AxelLots.js';
import { FY, weaponShop, alchemyShop, generalStore, bakeryShop, forgeShop, caravanOffice, guildExtras, tavernExtras, templeExtras } from './Interiors.js';

/**
 * Axel — the walled city of beginner adventurers (plan: docs/axel-city-plan.md, data:
 * world/AxelPlan.js + build/AxelLots.js).
 *
 *  - A closed curtain wall (Kenney castle-kit geometry in the village stone) with 16 towers and
 *    four gatehouses; a pomerium street runs round the inside.
 *  - Four main streets lead from the gates to the Fountain square (guild, tavern, town hall);
 *    secondary streets and lanes reach the districts: trade (market square, shops), caravan
 *    (yard, inns, stables), crafts (forge, workshops, lumber yard), the temple hill (temple,
 *    cemetery with the crypt, hospice), and three residential quarters.
 *  - Outside: the caravan camp at the south gate, the guild's training field north of town.
 *
 * Every place is an editable group (map editor); named spots (world.spot) keep the ids the NPC
 * schedules, quests and shops use.
 */

const P = (u, v) => toWorld(u, v);
let W = null;
/** Ground position of a local point. */
function G(u, v, dy = 0) {
  const [x, z] = P(u, v);
  return new THREE.Vector3(x, W.heightAt(x, z) + dy, z);
}
/** Frame on the ground at a local point; `rot` = world yaw. */
function F0(u, v, rot = 0, dy = 0) {
  const [x, z] = P(u, v);
  return new Frame(W, x, W.heightAt(x, z) + dy, z, rot);
}
const B = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
/** World placement of a key building: { x, z, rot }. */
function at(id) {
  const b = B[id];
  const [x, z] = P(b.u, b.v);
  return { x, z, rot: FACE_ROT[b.face] };
}

export function buildTown(world) {
  W = world;
  DOORS.length = 0;
  const rng = mulberry32(2024);

  walls();
  streets();
  // Key buildings.
  W.group('guild', at('guild'), (r) => guild(r), 'Гильдия');
  W.group('tavern', at('tavern'), (r) => tavern(r), 'Таверна «Кружка и посох»');
  W.group('temple', at('temple'), (r) => temple(r), 'Храм Эрис');
  W.group('crypt', at('crypt'), () => crypt(), 'Склеп');
  W.group('town_hall', at('town_hall'), (r) => townHall(r), 'Ратуша');
  W.group('exchange', at('exchange'), (r) => signHouse('exchange', r, { style: 'brick', roof: 'slate', sign: 0xd8b040 }), 'Меняльная контора');
  W.group('post', at('post'), (r) => signHouse('post', r, { style: 'plaster', roof: 'blue', sign: 0x3a6ab0, open: 'shop', awning: 0x3a6ab0 }), 'Почтовая станция');
  W.group('barracks', at('barracks'), (r) => barracks(r), 'Казармы стражи');
  W.group('market_hall', at('market_hall'), (r) => marketHall(r), 'Крытый рынок');
  W.group('bakery', at('bakery'), (r) => bakery(r), 'Пекарня');
  W.group('store', at('store'), (r) => store(r), 'Лавка Отто');
  W.group('alchemist', at('alchemist'), (r) => alchemist(r), 'Алхимик');
  W.group('weaponsmith', at('weaponsmith'), (r) => weaponsmith(r), 'Оружейник');
  W.group('magic_shop', at('magic_shop'), (r) => signHouse('magic_shop', r, { style: 'plaster', roof: 'purple', sign: 0x7a4aa8, open: 'shop', awning: 0x5a3a8a }), 'Лавка магических товаров');
  W.group('caravan_office', at('caravan_office'), (r) => office(r), 'Караванная контора');
  W.group('inn_axle', at('inn_axle'), (r) => inn('inn_axle', r, 0x8a3a2a, true), 'Постоялый двор «Ось и колесо»');
  W.group('inn_dust', at('inn_dust'), (r) => inn('inn_dust', r, 0xc2a05a, false), 'Постоялый двор «Пыльный тракт»');
  W.group('stables', at('stables'), (r) => stables('stables', r), 'Конюшни');
  W.group('rectory', at('rectory'), (r) => signHouse('rectory', r, { style: 'plaster', roof: 'slate' }), 'Дом настоятеля');
  W.group('hospice', at('hospice'), (r) => signHouse('hospice', r, { style: 'plaster', roof: 'blue', sign: 0xf0f0f0 }), 'Лечебница');
  W.group('forge', at('forge'), (r) => forge(r), 'Кузница');
  W.group('locksmith', at('locksmith'), (r) => workshop(B.locksmith, r, 'brick'), 'Слесарная мастерская');
  lots(rng);
  places(rng);
  lamps();
  W.group('caravan_camp', { x: -320, z: 158 }, (r) => caravanCamp(r), 'Караванная стоянка');
  trainingField();
  W.cityGround = groundMask();
}

// -----------------------------------------------------------------------------------------
// Wall, gates, streets
// -----------------------------------------------------------------------------------------
function walls() {
  const nodes = WALL.nodes.map((n) => { const [x, z] = P(n.u, n.v); return { ...n, x, z }; });
  let t = 0;
  const gates = cityWall(W, nodes, {
    height: WALL.height, thickness: WALL.thickness, gateWidth: WALL.gateWidth,
    wallGroup: 'axel_wall',
    groupFor: (n, i) => (n.gate ? 'gate_' + n.gate : n.big ? 'tower_' + ++t : 'wall_tower_' + i),
  });
  // Guard posts just inside each gate, facing out; paving through the passage.
  for (const { node, frame } of gates) {
    const p = frame.at(WALL.gateWidth / 2 - 1.4, 0, -6);
    p.y = W.heightAt(p.x, p.z);
    W.spot('gate_' + node.gate, p, frame.rot);
    const a = frame.at(0, 0, -9), b = frame.at(0, 0, 9);
    paveRibbon(W, [[a.x, a.z], [b.x, b.z]], WALL.gateWidth - 0.6, { tint: 0xd6ccb8, lift: PAVE_LIFT.gate, covered: underSquare });
  }
}

/**
 * Paving lifts over the ground (m): squares over main streets over secondary streets over lanes
 * over the pomerium and the gate passages — where they overlap, the higher one shows (no
 * coplanar faces). Streets of one kind that meet alternate by a few millimetres.
 */
const PAVE_LIFT = { square: 0.125, main: 0.105, secondary: 0.093, lane: 0.083, ring: 0.07, gate: 0.075 };
const TINT = { main: 0xf0e8d8, secondary: 0xe4dccb, lane: 0xd6ccb8 }; // the cobble texture carries the colour
const SQW = SQUARES.map((q) => q.pts.map(([u, v]) => P(u, v)));
const inPolygon = (pts, x, z) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const segDist = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const lineDist = (pts, x, z) => { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i], pts[i + 1])); return d; };
/** Under a square's paving (squares lie on top of the streets that run into them). */
const underSquare = (x, z) => SQW.some((q) => inPolygon(q, x, z));
/** Built centre lines (world) of the streets and the pomerium (AxelPlan, rounded bends). */
const STREET_W = Object.fromEntries(STREETS.map((s) => [s.id, streetLine(s).map(([u, v]) => P(u, v))]));
const RING_W = () => { const r = ringLine().map(([u, v]) => P(u, v)); return [...r, r[0]]; };
/** Streets of the same kind whose paving overlaps get different lifts (greedy colouring). */
const LIFT_STEP = Object.fromEntries((() => {
  const along = (pts) => pts.slice(1).flatMap((q, i) => { const p = pts[i], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2); return [...Array(n + 1).keys()].map((k) => [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]); });
  const near = (a, b) => along(STREET_W[a.id]).some(([x, z]) => lineDist(STREET_W[b.id], x, z) < (a.width + b.width) / 2 + 0.5);
  const col = {};
  for (const s of STREETS) {
    const used = new Set(STREETS.filter((o) => o.kind === s.kind && col[o.id] !== undefined && (near(s, o) || near(o, s))).map((o) => col[o.id]));
    let c = 0;
    while (used.has(c)) c++;
    col[s.id] = c;
  }
  return Object.entries(col);
})());

const mid = (pts) => pts[Math.floor(pts.length / 2)];
function streets() {
  // One editable part; inside it every street / square has its own builder (by id).
  W.group('axel_streets', { x: AXEL.x, z: AXEL.z }, () => {
    // Every street / square is a part of its own (Alt+click in the editor).
    for (const s of STREETS) { const [x, z] = mid(STREET_W[s.id]); W.group(s.id, { x, z }, () => paveStreet(s), s.name || s.id); }
    { const [x, z] = RING_W()[0]; W.group('pomerium', { x, z }, () => paveRing(), 'Пристенная улица'); }
    for (const q of SQUARES) { const [x, z] = P(...q.pts[0]); W.group('pave_' + q.id, { x, z }, () => paveSquare(q), 'Мостовая: ' + (q.name || q.id)); }
  }, 'Улицы и площади');
}

/** A street: draped paving (kerbs on the main streets, cut at squares and crossing streets). */
function paveStreet(s) {
  const pts = STREET_W[s.id];
  const others = STREETS.filter((o) => o.id !== s.id).map((o) => ({ pts: STREET_W[o.id], half: o.width / 2 + 0.4 }));
  const ring = RING_W();
  const kerbSkip = (x, z) => SQW.some((q) => inPolygon(q, x, z) || lineDist([...q, q[0]], x, z) < 0.6) || others.some((o) => lineDist(o.pts, x, z) < o.half) || lineDist(ring, x, z) < RING.width / 2 + 0.4;
  paveRibbon(W, pts, s.width, { tint: TINT[s.kind], lift: PAVE_LIFT[s.kind] + Math.min(2, LIFT_STEP[s.id]) * 0.004, kerb: s.kind === 'main', covered: underSquare, kerbSkip });
}

/**
 * A paved footpath from a door straight out along the house's front to the nearest street, ring
 * road or square (stops at its edge, reaching a little under it so the two paving layers meet
 * without a gap). Nothing is built if the street is already at the door or farther than 9 m.
 */
function doorPath(door, rot) {
  const dx = Math.sin(rot), dz = Math.cos(rot);
  const lines = [...Object.values(STREET_W).map((pts, i) => [pts, STREETS[i].width / 2]), [RING_W(), RING.width / 2]];
  const hit = (x, z) => underSquare(x, z) || lines.some(([pts, half]) => lineDist(pts, x, z) < half - 0.05);
  const x0 = door.x - dx * 1.2, z0 = door.z - dz * 1.2; // from the house front
  if (hit(door.x, door.z)) return;
  let t = 0;
  while (t < 9 && !hit(door.x + dx * t, door.z + dz * t)) t += 0.25;
  if (t >= 9) return;
  const x1 = door.x + dx * (t + 0.4), z1 = door.z + dz * (t + 0.4);
  if (Math.hypot(x1 - x0, z1 - z0) < 1.2) return;
  W.part('path', door.x, door.z, rot, () => paveRibbon(W, [[x0, z0], [x1, z1]], 1.7, { tint: TINT.lane, lift: PAVE_LIFT.lane + 0.006, covered: underSquare }), 'Дорожка к двери');
}

/** Pomerium: a darker, rougher ring inside the wall. */
function paveRing() {
  paveRibbon(W, RING_W().slice(0, -1), RING.width, { tint: 0xcfc6b4, lift: PAVE_LIFT.ring, closed: true, covered: underSquare });
}

function paveSquare(q) {
  pavePoly(W, q.pts.map(([u, v]) => P(u, v)), { tint: q.id === 'fountain_square' ? 0xf6eedc : q.id === 'caravan_yard' ? 0xcdbfa6 : 0xeee6d4, lift: PAVE_LIFT.square });
}

// -----------------------------------------------------------------------------------------
// Key buildings
// -----------------------------------------------------------------------------------------
function guild(rng) {
  const { x, z, rot } = at('guild');
  // Interior below is laid out for the plan size 18 × 13 (AxelPlan; the bell tower is its annex).
  const g = house(W, { x, z, rot, w: B.guild.w, d: B.guild.d, floors: 1, floorH: 6.2, open: 'hall', arcade: true, wallTint: 0xf0e2c4, roofTint: 0x2f5a8a, chimney: true, door: 0, doorWidth: 3.4, kind: 'guild', lantern: false }, rng);
  const F = g.frame;
  const fy = 0.35;
  F.box(5, 0.8, 1.6, 0, -0.55, 7.6, 'stone', { tint: 0xc8bca8 });
  for (const s of [-1, 1]) {
    F.box(1.1, 3.2, 0.06, s * 3.2, 2.6, 6.62, 'cloth', { collide: false, tint: 0x2f5a8a });
    F.box(0.6, 0.6, 0.07, s * 3.2, 4.2, 6.64, 'cloth', { collide: false, castShadow: false, tint: 0xf0c050 });
    lantern(W, F.sub(s * 2.3, 2.6, 6.75));
  }
  F.box(4.2, 1.0, 0.12, 0, 4.9, 6.7, 'wood', { tint: 0x6a4428, collide: false });
  F.box(3.0, 0.12, 0.05, 0, 5.4, 6.78, 'metal', { collide: false, rz: 0.4 });
  F.box(3.0, 0.12, 0.05, 0, 5.4, 6.78, 'metal', { collide: false, rz: -0.4 });
  // Bell tower on the east corner (the guild's landmark: a blue spire).
  const T = F.sub(9.6, -0.6, -5);
  houseTower(T, 3.8, 3.8, 15.5, { roofTint: 0x2f5a8a });
  T.cyl(0.05, 2, 0, 15.5 + 2.6, 0, 'metal', { seg: 6, collide: false });
  T.box(1.3, 0.8, 0.04, 0.68, 15.5 + 3.6, 0, 'cloth', { collide: false, tint: 0xd84040 });
  // --- Interior ---
  F.box(6.0, 1.1, 1.0, 0, fy, -4.0, 'wood', { tint: 0x7a5232 }); // walk-round ends ≥ 1.5 m (NPC grid)
  F.box(6.2, 0.08, 1.2, 0, fy + 1.1, -4.0, 'plank');
  F.box(8.5, 3.6, 0.2, 0, fy, -6.25, 'wood', { tint: 0x6a4428, collide: false });
  for (const yy of [1.5, 2.4]) F.box(7, 0.08, 0.4, 0, fy + yy, -6.05, 'plank', { collide: false });
  W.spot('guild_counter', F.at(0, fy, -5.0), rot);
  W.spot('guild_front', F.at(0, fy, -2.6), rot + Math.PI);
  F.box(3.6, 2.2, 0.15, -7.5, fy + 0.9, -1.2, 'wood', { tint: 0x5a3a22 });
  for (const s of [-1, 1]) F.box(0.16, 3.2, 0.16, -7.5 + s * 1.65, fy, -1.3, 'timber', { tint: 0x4a3020 });
  for (let i = 0; i < 8; i++) F.box(0.5, 0.6, 0.02, -8.3 + (i % 4) * 0.55 + 0.25, fy + 1.35 + Math.floor(i / 4) * 0.75, -1.1, 'plaster', { collide: false, castShadow: false, tint: i % 3 ? 0xf2ead8 : 0xe8d0a0 });
  W.addInteractable(new QuestProp({ id: 'guild_board', name: 'Доска заказов', prompt: 'Посмотреть заказы', position: F.at(-7.5, fy + 1.4, -0.6), shape: 'none' }));
  F.box(1.0, 1.1, 4.0, 7.6, fy, 0.5, 'wood', { tint: 0x7a5232 });
  for (let i = 0; i < 3; i++) crate(W, F.sub(8.2, fy, 3.4 + i * 0.8), 0, 0, 0.6, i * 0.3);
  crate(W, F.sub(8.2, fy + 0.6, 4.2), 0, 0, 0.5, 0.7);
  W.spot('guild_supplier', F.at(8.4, fy, 0.5), rot - Math.PI / 2);
  for (const [tx, tz] of [[-4, 2.5], [3.5, 2.5], [-4, -0.8]]) {
    const T2 = F.sub(tx, fy, tz);
    T2.box(2.4, 0.08, 1.1, 0, 0.78, 0, 'plank', { tint: 0x8a6440 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) T2.box(0.1, 0.78, 0.1, sx * 1.05, 0, sz * 0.42, 'timber', { tint: 0x4a3020 });
    for (const sz of [-1, 1]) T2.box(2.2, 0.45, 0.3, 0, 0, sz * 0.95, 'plank', { tint: 0x7a5432 });
    tableware(T2, 0, 0.86, 0, rng, 'guild');
  }
  for (const bx of [-6.9, 6.9]) prop(F, 'furniture/bookcaseClosedWide', bx, fy, -5.7, { s: 2.4 });
  prop(F, 'furniture/books', -2.5, fy + 1.18, -4.0, { s: 2, collide: false });
  food(F, 'cup-tea', 2.2, fy + 1.18, -3.8);
  W.spot('guild_table', F.at(-4, fy, 3.6), rot + Math.PI);
  W.spot('guild_table2', F.at(3.5, fy, 3.6), rot + Math.PI);
  for (const lx of [-4.5, 4.5]) {
    F.cyl(0.9, 0.08, lx, 4.6, 0.5, 'metal', { seg: 12, collide: false });
    W.addLightSource(F.at(lx, 4.3, 0.5), { color: 0xffc070, intensity: 9, distance: 14, always: true, flicker: true });
  }
  F.sphere(0.5, 0, 4.4, -6.1, 'bone', { collide: false, sz: 0.6 });
  inside(() => guildExtras(F));
  W.spot('guild_door', F.at(0, fy, 8.6), rot);
}

function tavern(rng) {
  const { x, z, rot } = at('tavern');
  // One wide arch over the two middle tiles; the interior is laid out for 16 × 12 (AxelPlan).
  const t = house(W, { x, z, rot, w: B.tavern.w, d: B.tavern.d, floors: 2, floorH: 4.2, open: 'hall', wallTint: 0xead6b0, roofTint: 0x8a3a2a, chimney: true, door: 0, doorWidth: 2.6, kind: 'tavern', lantern: false, jetty: 0.3, flowers: 0.6 }, rng);
  const F = t.frame;
  const fy = 0.35;
  F.box(0.1, 0.1, 1.6, 4.5, 3.6, 6.9, 'metal', { collide: false });
  F.box(1.4, 1.0, 0.08, 4.5, 2.5, 7.55, 'wood', { collide: false, tint: 0x6a4428 });
  food(F, 'mug', 4.4, 2.35, 7.64, { s: 3.4, ry: -Math.PI / 2 });
  for (const s of [-1, 1]) lantern(W, F.sub(s * 2.0, 2.5, 6.4));
  barrel(W, F.sub(-6.5, 0, 7), 0, 0);
  barrel(W, F.sub(-5.6, 0, 7.4), 0, 0);
  // Terrace tables in front (on the square side).
  for (const sx of [-5, 5]) {
    const T2 = F.sub(sx, 0, 9.6);
    T2.cyl(0.6, 0.06, 0, 0.74, 0, 'plank', { seg: 10, tint: 0x8a6440 });
    T2.cyl(0.08, 0.74, 0, 0, 0, 'timber', { seg: 6, tint: 0x4a3020 });
    tableware(T2, 0, 0.8, 0, rng, 'tavern');
  }
  // --- Interior ---
  F.box(1.2, 1.15, 7, -6.2, fy, -1.5, 'wood', { tint: 0x6a4428 });
  F.box(1.4, 0.08, 7.2, -6.2, fy + 1.15, -1.5, 'plank');
  for (let i = 0; i < 6; i++) barrel(W, F.sub(-7.4, fy, -4.5 + i * 1.2), 0, 0, 0x6a4428);
  W.spot('tavern_bar', F.at(-7.1, fy, -1.5), rot + Math.PI / 2);
  W.spot('tavern_bar_front', F.at(-4.8, fy, -1.5), rot - Math.PI / 2);
  F.box(3.2, 2.8, 1.0, 3.0, fy, -5.6, 'stone', { tint: 0xa89c8c });
  F.box(2.0, 1.2, 0.3, 3.0, fy + 0.2, -5.05, 'metal', { collide: false });
  W.addLightSource(F.at(3.0, fy + 0.8, -4.6), { color: 0xff8a3a, intensity: 10, distance: 13, always: true, flicker: true });
  W.tavernFire = F.at(3.0, fy + 0.5, -4.8);
  const tables = [[1, 1.5], [4.5, 2.5], [1, -2.5], [5.5, -1.8], [-2.5, 3.8]];
  tables.forEach(([tx, tz], i) => {
    const T2 = F.sub(tx, fy, tz);
    T2.cyl(0.75, 0.08, 0, 0.76, 0, 'plank', { seg: 12, tint: 0x8a6440 });
    T2.cyl(0.1, 0.76, 0, 0, 0, 'timber', { seg: 8, tint: 0x4a3020 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      T2.cyl(0.24, 0.45, Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15, 'wood', { seg: 8, tint: 0x7a5432 });
    }
    tableware(T2, 0, 0.84, 0, rng, 'tavern');
    const sx = Math.cos(i) * 1.15, sz = Math.sin(i) * 1.15;
    W.spot('tavern_table' + i, F.at(tx + sx * 0.92, fy, tz + sz * 0.92), rot + Math.atan2(-sx, -sz));
  });
  for (let i = 0; i < 5; i++) food(F, i % 2 ? 'mug' : 'glass-wine', -6.0, fy + 1.23, -4.4 + i * 1.3, { ry: i });
  for (let i = 0; i < 6; i++) food(F, ['wine-red', 'wine-white', 'mug'][i % 3], -7.4, fy + 1.0, -4.5 + i * 1.2, { ry: i });
  F.box(3, 0.3, 2.4, 5.6, fy, 3.9, 'plank', { tint: 0x7a5432 });
  W.spot('tavern_stage', F.at(5.6, fy + 0.3, 3.9), rot - Math.PI * 0.75);
  for (const lx of [-1, 4]) W.addLightSource(F.at(lx, 3.4, 0), { color: 0xffb060, intensity: 6, distance: 11, always: true, flicker: true });
  inside(() => tavernExtras(F));
  W.spot('tavern_door', F.at(0, fy, 7.5), rot);
}

/** Temple of Eris: a long nave (14 × 24) with a bell spire over the entrance, the altar at the back. */
function temple(rng) {
  const { x, z, rot } = at('temple');
  const { w, d } = B.temple; // 12 × 22
  const t = house(W, { x, z, rot, w, d, floors: 1, floorH: 7, open: 'hall', wallTint: 0xf4f0e8, roofTint: 0x3a6a8a, chimney: false, door: 0, doorWidth: 2.6, kind: 'temple', lantern: false, pitch: 0.95, style: 'plaster' }, rng);
  const F = t.frame;
  const fy = 0.35;
  // Steps up from the temple square.
  F.box(5, 0.8, 1.8, 0, -0.55, d / 2 + 0.9, 'stone', { tint: 0xd8d0c0 });
  // Spire over the entrance: the city's highest landmark.
  // A belfry tower on the front-left corner of the nave (stands on the ground, not on the roof).
  const S = F.sub(-(w / 2 + 0.9), -0.6, d / 2 - 1.2);
  houseTower(S, 3.4, 3.4, 20, { roofTint: 0x3a6a8a });
  S.cyl(0.05, 1.8, 0, 20 + 2.9, 0, 'metal', { seg: 6, collide: false });
  S.box(0.8, 0.1, 0.1, 0, 20 + 4.2, 0, 'metal', { collide: false });
  // Interior: altar, crystal, pews, tall windows.
  const back = -d / 2 + 1.6;
  F.box(4, 0.5, 2.6, 0, fy, back, 'stone', { tint: 0xe8e2d8 });
  for (const sx of [-1.5, 1.5]) prop(F, 'graveyard/candle-multiple', sx, fy + 0.5, back + 0.6, { s: 1.2, collide: false });
  for (const sx of [-3.4, 3.4]) prop(F, 'graveyard/urn-round', sx, fy, back - 0.2, { s: 1.6 });
  W.spot('temple_altar', F.at(0, fy + 0.5, back + 0.8), rot);
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) F.box(3.4, 0.45, 0.6, sx * 2.6, fy, d / 2 - 4.5 - i * 2.0, 'plank', { tint: 0x8a6440 });
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) F.box(0.9, 2.6, 0.06, sx * (w / 2 + 0.03), fy + 2.6, d / 2 - 3 - i * 4, 'window', { collide: false, castShadow: false, ry: Math.PI / 2 });
  W.addLightSource(F.at(0, fy + 2.5, back + 0.5), { color: 0x9ff0ff, intensity: 5, distance: 12, always: true });
  W.addLightSource(F.at(0, 5.2, 0), { color: 0xffd8a0, intensity: 6, distance: 16, always: true });
  W.addInteractable(new HealingCrystal(F.at(0, fy + 0.5, back - 0.3)));
  // C00: the service room under the stairs (people must be led out before the crypt is opened).
  W.addInteractable(new QuestProp({ id: 'temple_room', name: 'Служебная комната', prompt: 'Проверить, не остался ли кто внизу', position: F.at(3.2, fy + 0.9, back - 0.3), shape: 'none' }));
  inside(() => templeExtras(F, w, d));
  W.spot('temple_door', F.at(0, fy, d / 2 + 2.4), rot);
}

/** The old crypt in the cemetery (chapter 5 hook: sealed, nothing inside yet). */
function crypt() {
  const { x, z, rot } = at('crypt');
  const C = new Frame(W, x, W.heightAt(x, z), z, rot);
  C.kit('graveyard/crypt-small', 0, 0, 0, { s: 2.8 });
  C.kit('graveyard/crypt-small-roof', 0, 2.8, 0, { s: 2.8, collide: false });
  W.spot('crypt_door', C.at(0, 0, 2.6), rot + Math.PI);
  // C02: Clara breaks the seal (flag crypt_open); the stair leads down to the crypt level (build/Crypt.js).
  W.addInteractable(new Door({ id: 'crypt_gate', name: 'Спуск в крипту', prompt: 'Спуститься', position: C.at(0, 0, 1.3), target: 'crypt_in', rotY: rot }));
  W.addInteractable(new QuestProp({ id: 'crypt_sealed', name: 'Запертая крипта', prompt: 'Осмотреть дверь', position: C.at(0, 1.0, 1.6), shape: 'none' }));
}

/** Town hall: a two-storey stone hall with a clock tower over the door. */
function townHall(rng) {
  const { x, z, rot } = at('town_hall');
  // The entrance is the clock tower's door (the tower stands in front of the middle of the facade).
  const h = house(W, { x, z, rot, w: B.town_hall.w, d: B.town_hall.d, floors: 2, floorH: 3.6, style: 'brick', roofTint: ROOF_COLORS.slate, chimney: true, door: false, kind: 'public', lantern: false, shutters: 0.2 }, rng);
  const F = h.frame;
  // The clock tower stands out of the facade (4.4 x 3.0, front at z 7.4) and carries the door.
  const T = F.sub(0, -0.6, 5.9);
  houseTower(T, 4.4, 3.0, 16, { roofTint: ROOF_COLORS.slate, clock: true });
  const D = F.sub(0, 0, 5.9 + 1.5); // front face of the tower
  D.box(2.0, 2.6, 0.12, 0, 0.3, 0.02, 'door', { collide: false, tint: 0x5a3a22 });
  for (const s of [-1, 1]) D.box(0.3, 2.9, 0.22, s * 1.15, 0.3, 0.05, 'stone', { collide: false, tint: 0xb0a492 });
  D.box(2.6, 0.35, 0.22, 0, 3.05, 0.05, 'stone', { collide: false, tint: 0xb0a492 });
  D.box(0.04, 2.5, 0.04, 0, 0.35, 0.1, 'metal', { collide: false });
  for (const s of [-1, 1]) lantern(W, D.sub(s * 1.7, 2.4, 0.2));
  D.box(5, 0.5, 1.0, 0, -0.3, 0.55, 'stone', { tint: 0xc8bca8 }); // steps
  W.spot('town_hall_door', D.at(0, 0, 1.8), rot);
  // Chapter 8: the shelter of the residents in front of the hall: cots, crates, a chalk line, a stuck handcart, a barrier.
  const S = F.sub(0, 0, 5.9 + 1.5 + 5.5);
  for (let i = 0; i < 5; i++) {
    const c = S.sub(-5 + i * 2.2, 0, 1.2 + (i % 2) * 0.6);
    c.box(0.9, 0.22, 1.9, 0, 0, 0, 'plank', { collide: false, tint: 0x8a6a4a });
    c.box(0.7, 0.12, 0.5, 0, 0.22, -0.6, 'cloth', { collide: false, tint: [0xd8b0a0, 0xa8c0d0, 0xc8d0a0][i % 3] });
  }
  for (let i = 0; i < 3; i++) crate(W, S.sub(5.5, 0, -1 + i * 1.0), 0, 0, 0.8, i * 0.4);
  S.box(11, 0.03, 0.12, 0, 0.01, 3.2, 'stone', { collide: false, castShadow: false, tint: 0xf0f0e8 }); // the chalk line
  W.spot('shelter', S.at(0, 0, 0.5), rot + Math.PI);
  W.spot('shelter_lina', S.at(-2, 0, 0), rot + Math.PI);
  W.spot('shelter_mia', S.at(0.6, 0, 0.2), rot + Math.PI);
  const cart = F.sub(-9, 0, 5.9 + 1.5 + 9);
  cart.box(1.3, 0.12, 1.9, 0, 0.55, 0, 'wood', { tint: 0x7a5232 });
  cart.box(1.3, 0.5, 0.1, 0, 0.67, 0.9, 'wood', { tint: 0x7a5232, collide: false });
  for (const s of [-1, 1]) cart.cyl(0.42, 0.1, s * 0.75, 0.42, -0.2, 'wood', { seg: 12, rz: Math.PI / 2, collide: false, tint: 0x5a3a22 });
  W.spot('shelter_cart', cart.at(0, 0, 0), rot);
  W.addInteractable(new QuestProp({ id: 'shelter_cart', name: 'Застрявшая тележка', prompt: 'Вытолкнуть тележку', position: cart.at(0, 0.9, 0), shape: 'none' }));
  const bar = F.sub(11, 0, 5.9 + 1.5 + 12);
  for (const s of [-1, 1]) bar.box(0.12, 1.0, 0.12, s * 0.9, 0, 0, 'wood', { collide: false, tint: 0x7a5232 });
  bar.box(2.2, 0.14, 0.08, 0, 0.7, 0, 'plank', { collide: false, tint: 0xd8a040 });
  W.spot('street_block', bar.at(0, 0, 0), rot);
  W.addInteractable(new QuestProp({ id: 'street_block', name: 'Опасный проход', prompt: 'Перекрыть проход заграждением', position: bar.at(0, 0.9, 0), shape: 'none' }));
}

/** House with an optional open shop front and a hanging sign; spots <id>_door / <id>_counter. */
function signHouse(id, rng, o = {}) {
  const b = B[id];
  const { x, z, rot } = at(id);
  const h = house(W, { x, z, rot, w: b.w, d: b.d, floors: b.floors || 2, style: o.style, roofTint: ROOF_COLORS[o.roof] ?? ROOF_COLORS.red, open: o.open || false, awningTint: o.awning, kind: o.open ? 'shop' : 'house', flowers: 0.4 }, rng);
  const F = h.frame;
  if (o.sign !== undefined) {
    F.box(0.08, 0.08, 1.2, b.w / 2 - 1.2, 3.3, b.d / 2 + 0.6, 'metal', { collide: false });
    F.box(1.0, 0.7, 0.06, b.w / 2 - 1.2, 2.6, b.d / 2 + 1.1, 'wood', { collide: false, tint: o.sign });
  }
  if (o.open === 'shop') {
    shopGoods(F, b.w, b.d, 'store', rng);
    W.spot(id + '_counter', F.at(0, 0.35, 1.2), rot);
  } else if (h.door) W.spot(id + '_door', h.door, rot);
  return h;
}

function barracks(rng) {
  const h = signHouse('barracks', rng, { style: 'brick', roof: 'slate' });
  const F = h.frame;
  for (const s of [-1, 1]) F.box(1.2, 3.0, 0.06, s * 4, 2.4, 4.53, 'cloth', { collide: false, tint: 0x2f5a8a });
  // Weapon rack and a practice post by the door.
  for (let i = 0; i < 4; i++) F.box(0.06, 1.7, 0.06, 5.5 + i * 0.35, 0.35, 5.6, 'metal', { collide: false, rz: 0.15 });
  F.box(1.8, 0.1, 0.4, 6, 1.2, 5.6, 'wood', { collide: false });
}

/** Covered market: an open timber arcade with a tiled roof and stalls under it. */
function marketHall(rng) {
  const b = B.market_hall;
  const { x, z, rot } = at('market_hall');
  const F = new Frame(W, x, W.heightAt(x, z), z, rot);
  const w = b.w, d = b.d, h = 3.6;
  F.box(w + 0.6, 0.3, d + 0.6, 0, -0.1, 0, 'stone', { tint: 0xc0b6a4 });
  for (let i = 0; i <= 4; i++) for (const sz of [-1, 1]) F.box(0.4, h, 0.4, -w / 2 + (i * w) / 4, 0.2, sz * (d / 2), 'timber', { tint: 0x5a3a26 });
  F.box(w + 0.4, 0.3, 0.3, 0, h, d / 2, 'timber', { tint: 0x5a3a26 });
  F.box(w + 0.4, 0.3, 0.3, 0, h, -d / 2, 'timber', { tint: 0x5a3a26 });
  F.kit('village/Roof_RoundTiles_8x14', 0, h + 0.2, 0, { ry: Math.PI / 2, sx: d / 8, sy: d / 8, sz: w / 14, collide: false, tint: 0xb8b8c8 });
  // Clock over the north gable.
  F.cyl(0.8, 0.1, 0, h + 2.6, d / 2 + 0.2, 'plaster', { seg: 14, rx: Math.PI / 2, collide: false, tint: 0xf4ecd8 });
  // Tables with goods inside.
  for (let i = 0; i < 3; i++) {
    const T2 = F.sub(-w / 2 + 2.4 + i * ((w - 4.8) / 2), 0.2, 0);
    T2.box(2.6, 0.9, 1.2, 0, 0, 0, 'wood', { tint: 0x7a5232 });
    const list = ['cabbage', 'apple', 'cheese', 'fish', 'pumpkin', 'bread', 'carrot', 'honey'];
    for (let k = 0; k < 5; k++) food(T2, list[(i * 3 + k) % list.length], -1 + k * 0.5, 0.95, (rng() - 0.5) * 0.6, { ry: rng() * 6 });
  }
  W.addLightSource(F.at(0, h - 0.4, 0), { color: 0xffc070, intensity: 4, distance: 10, night: true });
  W.addFootprint(x, z, w, d, rot, 'shop');
}

/** Interior furniture: shown with the building's near model only (World.lodMode). */
function inside(fn) {
  const prev = W.lodMode;
  W.lodMode = 'near';
  try { return fn(); } finally { W.lodMode = prev; }
}

/**
 * Walk-in shop: an archway at the left end of the front, a plank floor, a ceiling; `furnish`
 * fills it (Interiors.js) and returns the NPC points; spots <prefix>_counter / _front.
 */
function walkIn(id, rng, spec, furnish, prefix = id) {
  const b = B[id];
  const { x, z, rot } = at(id);
  const h = house(W, { x, z, rot, w: b.w, d: b.d, floors: b.floors || 2, interior: true, entrance: 'arch', door: -b.w / 2 + 1.0, lantern: false, ...spec }, rng);
  const F = h.frame;
  const pts = inside(() => furnish(F, b.w, b.d, rng));
  if (pts.counter) W.spot(prefix + '_counter', F.at(pts.counter[0], FY, pts.counter[1]), rot);
  if (pts.front) W.spot(prefix + '_front', F.at(pts.front[0], FY, pts.front[1]), rot + Math.PI);
  // Shop sign over the archway.
  F.box(0.08, 0.08, 1.2, -b.w / 2 + 1.0, 3.2, b.d / 2 + 0.6, 'metal', { collide: false });
  F.box(1.0, 0.7, 0.06, -b.w / 2 + 1.0, 2.5, b.d / 2 + 1.15, 'wood', { collide: false, tint: spec.sign ?? 0x6a4428 });
  W.spot(id + '_entrance', F.at(-b.w / 2 + 1.0, 0, b.d / 2 + 1.8), rot);
  return { h, F, pts };
}

function bakery(rng) {
  const { F } = walkIn('bakery', rng, { roofTint: 0xa0522d, chimney: true, flowers: 0.5, sign: 0xd8a030 }, bakeryShop);
  F.sphere(0.3, -B.bakery.w / 2 + 1.0, 2.5, B.bakery.d / 2 + 1.22, 'hay', { collide: false, sx: 1.3, sy: 0.7 });
}

function store(rng) {
  const b = B.store;
  const { F } = walkIn('store', rng, { roofTint: 0x4c6e5a, sign: 0x3a7ac8 }, generalStore);
  for (let i = 0; i < 2; i++) crate(W, F.sub(b.w / 2 - 0.9 - i * 0.9, 0, b.d / 2 + 0.9), 0, 0, 0.7, i);
  barrel(W, F.sub(b.w / 2 - 2.8, 0, b.d / 2 + 0.9), 0, 0);
}

function alchemist(rng) {
  const b = B.alchemist;
  const { F } = walkIn('alchemist', rng, { floors: 3, roofTint: 0x5a4a6e, chimney: true, vines: 1, sign: 0x7a4aa8 }, alchemyShop);
  // The purple turret (landmark) corbelled out over the back corner, from the first floor up.
  const T = F.sub(b.w / 2 + 1.4, -0.6, -b.d / 2 + 0.4); // a slim stone tower touching the back corner from outside
  houseTower(T, 2.8, 2.8, 12.5, { roofTint: 0x6a4e80 });
}

function weaponsmith(rng) {
  walkIn('weaponsmith', rng, { roofTint: 0x7d3a3a, style: 'brick', sign: 0x8a2a2a }, weaponShop, 'weapons');
}

function forge(rng) {
  const b = B.forge;
  const { x, z, rot } = at('forge');
  // Open-fronted smithy (stone floor, a ceiling under the roof); tall chimney over the furnace.
  const f = house(W, { x, z, rot, w: b.w, d: b.d, floors: 1, floorH: 3.8, open: 'work', door: false, roofTint: 0x5a4a40, chimney: false, kind: 'shop', style: 'brick' }, rng);
  const F = f.frame;
  F.box(1.6, 10, 1.6, b.w / 2 - 2, 0.35, -b.d / 2 + 0.6, 'stone', { tint: 0x8a7e70 });
  W.addChimney(F.at(b.w / 2 - 2, 10.7, -b.d / 2 + 0.6));
  W.addChimney(F.at(b.w / 2 - 2, 10.9, -b.d / 2 + 0.6));
  const pts = inside(() => forgeShop(F, b.w, b.d, rng));
  W.spot('forge_anvil', F.at(pts.anvil[0], FY, pts.anvil[1]), rot);
  W.spot('forge_counter', F.at(pts.counter[0], FY, pts.counter[1]), rot);
  W.spot('forge_front', F.at(0, 0, b.d / 2 + 2.6), rot);
  // The trough outside for the horses, a sign.
  F.box(0.08, 0.08, 1.2, -b.w / 2 + 1.2, 3.4, b.d / 2 + 0.6, 'metal', { collide: false });
  F.box(1.0, 0.7, 0.06, -b.w / 2 + 1.2, 2.7, b.d / 2 + 1.15, 'wood', { collide: false, tint: 0x4a4440 });
}

function office(rng) {
  const { F, pts } = walkIn('caravan_office', rng, { style: 'wood', roofTint: ROOF_COLORS.brown, sign: 0xb08a5a }, caravanOffice);
  W.spot('caravan_office_desk', F.at(pts.desk[0], FY, pts.desk[1]), at('caravan_office').rot);
}

function workshop(b, rng, style) {
  const [x, z] = P(b.u, b.v);
  const rot = b.rot ?? FACE_ROT[b.face];
  const h = house(W, { x, z, rot, w: b.w, d: b.d, floors: b.floors ?? (rng() < 0.5 ? 2 : 1), open: 'shop', style, roofTint: [ROOF_COLORS.brown, ROOF_COLORS.slate, ROOF_COLORS.straw][Math.floor(rng() * 3)], awningTint: [0x6a5a4a, 0x7a6a50, 0x5a4a3a][Math.floor(rng() * 3)], chimney: rng() < 0.6, kind: 'shop' }, rng);
  const F = h.frame;
  prop(F, 'survival/workbench', b.w / 2 - 1.2, 0, b.d / 2 + 1.0, { s: 2.6 });
  for (const [t, xx] of [['tool-hammer', -1], ['tool-axe', 0], ['tool-shovel', 1]]) if (F.w.kits.has('survival/' + t)) prop(F, 'survival/' + t, xx, 0.35, -b.d / 2 + 0.5, { s: 2.4, collide: false, ry: Math.PI / 2 });
  if (rng() < 0.6) prop(F, 'nature/log_stack', -b.w / 2 + 1.2, 0, b.d / 2 + 1.2, { s: 2.2 });
  return h;
}

function inn(id, rng, roof, wheel) {
  const b = B[id];
  const { x, z, rot } = at(id);
  const h = house(W, { x, z, rot, w: b.w, d: b.d, floors: b.floors, floorH: 3.2, style: 'wood', roofTint: roof, chimney: true, door: -b.w / 4, kind: 'inn', jetty: 0.3, flowers: 0.7, balcony: true }, rng);
  const F = h.frame;
  // Sign: a cart wheel ("Ось и колесо") or a dusty boot board.
  F.box(0.08, 0.08, 1.4, -b.w / 4 + 2, 3.4, b.d / 2 + 0.7, 'metal', { collide: false });
  if (wheel) {
    F.put(new THREE.TorusGeometry(0.7, 0.08, 6, 16), 1, 1, 1, -b.w / 4 + 2, 2.6, b.d / 2 + 1.3, 'wood', { collide: false, tint: 0x6a4428 });
    for (let k = 0; k < 4; k++) F.box(0.06, 1.4, 0.06, -b.w / 4 + 2, 1.9, b.d / 2 + 1.3, 'wood', { collide: false, tint: 0x6a4428, rz: (k * Math.PI) / 4 });
  } else F.box(1.2, 0.8, 0.06, -b.w / 4 + 2, 2.4, b.d / 2 + 1.3, 'wood', { collide: false, tint: 0xa88a5a });
  for (let i = 0; i < 3; i++) barrel(W, F.sub(b.w / 2 - 0.8 - i * 0.9, 0, b.d / 2 + 0.9), 0, 0);
  W.spot(id + '_door', h.door, rot);
}

function stables(id, rng) {
  const b = B[id];
  const { x, z, rot } = at(id);
  const h = house(W, { x, z, rot, w: b.w, d: b.d, floors: 1, floorH: 3.4, open: 'stable', door: false, style: 'wood', roofTint: ROOF_COLORS.straw, chimney: false, kind: 'stable' }, rng);
  const F = h.frame;
  F.box(3, 0.5, 0.6, -b.w / 2 + 2, 0, b.d / 2 + 1.2, 'wood', { tint: 0x5a4030 });
  F.box(2.8, 0.05, 0.45, -b.w / 2 + 2, 0.45, b.d / 2 + 1.2, 'water', { collide: false });
  haystack(W, ...lp(F, b.w / 2 - 1.2, b.d / 2 + 1.5), 0.7);
  return h;
}
const lp = (F, lx, lz) => { const p = F.at(lx, 0, lz); return [p.x, p.z]; };

/** Goods on an open shop's counter and back shelves (layout of Kit.js openGround). */
function shopGoods(F, w, d, kind, rng) {
  const LISTS = {
    bakery: ['loaf', 'loaf-round', 'loaf-baguette', 'bread', 'croissant', 'pie', 'cake', 'muffin', 'donut'],
    store: ['cheese', 'bag', 'honey', 'apple', 'carrot', 'cabbage', 'fish', 'sausage', 'wine-red', 'pumpkin', 'onion', 'whole-ham'],
    alchemist: ['bottle', 'bottle-large'],
  };
  const list = LISTS[kind];
  const place = (x, y, z) => {
    const name = list[Math.floor(rng() * list.length)];
    if (kind === 'alchemist') prop(F, 'survival/' + name, x, y, z, { s: 1.4, collide: false });
    else if (F.w.kits.has('food/' + name)) food(F, name, x, y, z, { ry: rng() * 6.28 });
  };
  const cw = w - 3.2;
  for (let i = 0; i < 5; i++) place(0.6 - cw / 2 + 0.3 + (i * (cw - 0.6)) / 4, 1.43, d / 2 - 0.85);
  for (const y of [0.98, 1.68, 2.38]) for (let i = 0; i < 6; i++) place(-(w - 2) / 2 + (i * (w - 2)) / 5, 0.35 + y, -d / 2 + 0.6);
}

// -----------------------------------------------------------------------------------------
// Ordinary buildings (generated lots): districts set the look.
// -----------------------------------------------------------------------------------------
const LOOK = {
  center: { floors: [2, 3], styles: ['plaster', 'brick'], roofs: ['red', 'slate', 'blue', 'brown'], jetty: 0.5, flowers: 0.4, balcony: 0.25, vines: 0.15 },
  trade: { floors: [2, 3], styles: ['plaster', 'brick', 'wood'], roofs: ['red', 'brown', 'green', 'slate'], jetty: 0.5, flowers: 0.3, balcony: 0.2, vines: 0.1 },
  caravan: { floors: [1, 2], styles: ['wood', 'brick'], roofs: ['brown', 'straw', 'red'], jetty: 0.2, flowers: 0.1, vines: 0.1 },
  craft: { floors: [1, 2], styles: ['brick', 'wood'], roofs: ['brown', 'slate', 'straw'], jetty: 0.15, flowers: 0.05, vines: 0.1 },
  temple: { floors: [1, 2], styles: ['plaster'], roofs: ['slate', 'blue'], jetty: 0.2, flowers: 0.4, vines: 0.4 },
  res_ne: { floors: [2, 3], styles: ['plaster', 'plaster', 'brick'], roofs: ['red', 'slate', 'blue', 'green'], jetty: 0.6, flowers: 0.55, balcony: 0.3, vines: 0.3 },
  res_w: { floors: [1, 2], styles: ['plaster', 'wood'], roofs: ['straw', 'brown', 'red'], jetty: 0.2, flowers: 0.25, vines: 0.3 },
  res_s: { floors: [1, 2], styles: ['plaster', 'wood', 'brick'], roofs: ['red', 'straw', 'brown', 'green'], jetty: 0.3, flowers: 0.3, vines: 0.25 },
};
const pickOf = (list, rng) => list[Math.floor(rng() * list.length)];

function lots() {
  // Named homes: house_0..15 (old spots, NPC schedules), Mia's family home (cat) = house_9,
  // grandmother Greta's = house_6.
  const homes = LOTS.filter((l) => l.kind === 'house' && l.district.startsWith('res_'));
  const near = (u, v, list) => list.reduce((a, l) => (Math.hypot(l.u - u, l.v - v) < Math.hypot(a.u - u, a.v - v) ? l : a));
  const mia = near(-14, 66, homes.filter((l) => l.district === 'res_s'));
  const greta = near(-70, 0, homes.filter((l) => l.district === 'res_w'));
  const named = new Map([[mia.id, 9], [greta.id, 6]]);
  let k = 0;
  for (const l of homes) {
    if (named.size >= 16) break;
    if (named.has(l.id)) continue;
    while ([6, 9].includes(k)) k++;
    named.set(l.id, k++);
  }
  for (const l of LOTS) {
    const [x, z] = P(l.u, l.v);
    W.group('axel_' + l.id, { x, z, rot: l.rot }, (r) => {
      const h = lotBuilding(l, x, z, r);
      if (!h?.door) return;
      DOORS.push([h.door.x, h.door.z]);
      doorPath(h.door, l.rot);
      const n = named.get(l.id);
      if (n !== undefined) W.spot('house_' + n, h.door, l.rot);
      if (l.id === mia.id) {
        W.spot('mia_home', h.door, l.rot);
        const cp = h.frame.at(1.6, 0.06, l.d / 2 + 0.9);
        W.addInteractable(new QuestProp({ id: 'cat_home', name: 'Уголёк', prompt: 'Погладить', position: cp, shape: 'cat', rotY: l.rot + 0.5 }));
      }
      if (l.id === greta.id) W.spot('greta_home', h.door, l.rot);
    }, (l.id === mia.id ? 'Дом Мии · ' : l.id === greta.id ? 'Дом бабушки Греты · ' : '') + KIND_LABEL[l.kind] + ' ' + l.id);
  }
}
const KIND_LABEL = { house: 'Дом', shop: 'Лавка', workshop: 'Мастерская', warehouse: 'Склад', stable: 'Конюшня' };

const STREET_UV = STREETS.map((s) => [s, streetLine(s)]);
/** Local (lx, lz) of a lot / key building (front = +z) -> plan (u, v). */
const lotUV = (l, lx, lz) => { const c = Math.cos(l.rot), sn = Math.sin(l.rot); return [l.u + lx * c + lz * sn, l.v - lx * sn + lz * c]; };
/** Is the plan point inside another building's envelope (walls + ENVELOPE) or a street? */
function blocked(u, v, self) {
  for (const o of [...LOTS, ...BUILDINGS.map((b) => ({ ...b, rot: FACE_ROT[b.face] }))]) {
    if (o === self || o.id === self.id) continue;
    const c = Math.cos(o.rot), sn = Math.sin(o.rot), du = u - o.u, dv = v - o.v;
    const lx = du * c - dv * sn, lz = du * sn + dv * c;
    if (Math.abs(lx) < o.w / 2 + ENVELOPE.side && lz > -o.d / 2 - ENVELOPE.back && lz < o.d / 2 + (ENVELOPE.front[o.kind] ?? 1)) return true;
  }
  return STREET_UV.some(([s, pts]) => lineDist(pts, u, v) < s.width / 2 + 0.3);
}
/** Room for barrels / crates by the +x side wall of a lot (a 1.4 × 2.6 m strip). */
function sideRoom(l) {
  for (const lx of [0.2, 0.8, 1.4]) for (const lz of [0, -1.3, -2.6]) if (blocked(...lotUV(l, l.w / 2 + lx, l.d / 2 + lz), l)) return false;
  return true;
}

function lotBuilding(l, x, z, rng) {
  const L = LOOK[l.district] || LOOK.res_s;
  const roof = ROOF_COLORS[pickOf(L.roofs, rng)];
  const style = pickOf(L.styles, rng);
  if (l.kind === 'workshop') return workshop({ ...l, floors: undefined }, rng, style === 'plaster' ? 'brick' : style);
  if (l.kind === 'warehouse') {
    const h = house(W, { x, z, rot: l.rot, w: l.w, d: l.d, floors: 1, floorH: 4.4, style: rng() < 0.6 ? 'wood' : 'brick', roofTint: roof, chimney: false, door: false, kind: 'warehouse', shutters: 0.9 }, rng);
    const F = h.frame;
    F.box(3.0, 3.2, 0.12, 0, 0.35, l.d / 2 + 0.06, 'door', { tint: 0x6a4428, collide: false });
    for (const s of [-1, 1]) F.box(0.12, 3.2, 0.12, s * 0.75, 0.35, l.d / 2 + 0.14, 'timber', { tint: 0x3a2a1e, collide: false, rz: s * 0.8 });
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) crate(W, F.sub(l.w / 2 - 0.8 - i * 0.85, 0, l.d / 2 + 0.9), 0, 0, 0.75, i * 0.4);
    if (rng() < 0.5) barrel(W, F.sub(-l.w / 2 + 0.8, 0, l.d / 2 + 0.8), 0, 0);
    return h;
  }
  if (l.kind === 'stable') {
    const h = house(W, { x, z, rot: l.rot, w: l.w, d: l.d, floors: 1, floorH: 3.4, open: 'stable', door: false, style: 'wood', roofTint: ROOF_COLORS.straw, chimney: false, kind: 'stable' }, rng);
    haystack(W, ...lp(h.frame, l.w / 2 - 1.0, l.d / 2 + 1.4), 0.7);
    return h;
  }
  const floors = L.floors[0] + Math.floor(rng() * (L.floors[1] - L.floors[0] + 1)) - (l.w < 6 ? 1 : 0);
  if (l.kind === 'shop') {
    const h = house(W, { x, z, rot: l.rot, w: l.w, d: l.d, floors: Math.max(2, floors), open: 'shop', style, roofTint: roof, awningTint: pickOf([0xc83a3a, 0x3a7ac8, 0xd8a030, 0x4a9a5a, 0xa84aa8, 0x8a6a40], rng), kind: 'shop', flowers: L.flowers, jetty: rng() < L.jetty ? 0.3 : 0 }, rng);
    shopGoods(h.frame, l.w, l.d, 'store', rng);
    return h;
  }
  const h = house(W, {
    x, z, rot: l.rot, w: l.w, d: l.d, floors: Math.max(1, floors), style, roofTint: roof, kind: 'house',
    jetty: floors > 1 && rng() < L.jetty ? 0.3 : 0, flowers: L.flowers, vines: L.vines, balcony: rng() < (L.balcony || 0),
    door: l.w >= 7 ? (rng() - 0.5) * (l.w - 4) : 0, doorModel: pickOf(['Door_1_Round', 'Door_1_Round', 'Door_4_Round', 'Door_8_Round'], rng),
  }, rng);
  // Yard clutter by the side wall (on the ground; only where the next house leaves room).
  if (rng() < 0.55) {
    const F = h.frame;
    const room = sideRoom(l);
    if (room) barrel(W, F.sub(l.w / 2 + 0.75, 0, l.d / 2 - 0.8), 0, 0);
    if (rng() < 0.5 && room) crate(W, F.sub(l.w / 2 + 0.65, 0, l.d / 2 - 1.9), 0, 0, 0.7, 0.4);
  }
  return h;
}

// -----------------------------------------------------------------------------------------
// Squares, yards and gardens
// -----------------------------------------------------------------------------------------
const SQ = Object.fromEntries([...SQUARES, ...AREAS].map((q) => [q.id, q]));
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

function places(rng) {
  W.group('square', { x: AXEL.x, z: AXEL.z }, (r) => fountainSquare(r), 'Площадь Фонтана');
  W.group('market_square', { x: P(56, 30)[0], z: P(56, 30)[1] }, (r) => marketSquare(r), 'Рыночная площадь');
  W.group('town_well', { x: P(58, -61)[0], z: P(58, -61)[1] }, (r) => {
    well(W, ...P(58, -61));
    W.spot('well', G(58, -58), 0);
    // Chapter 8: the cistern hatch beside the well — the way down to the pump station (build/Pump.js).
    const H0 = F0(62.5, -57, 0.3);
    H0.box(2.2, 0.16, 1.6, 0, 0, 0, 'stoneDark', { collide: false, tint: 0x8a8478 });
    H0.box(1.7, 0.08, 1.1, 0, 0.16, 0, 'metal', { collide: false, tint: 0x5a5048 });
    H0.cyl(0.14, 0.12, 0.5, 0.2, 0, 'metal', { seg: 8, collide: false });
    W.spot('pump_gate_out', G(62.5, -55), Math.PI);
    W.addInteractable(new Door({ id: 'pump_gate', name: 'Люк цистерны', prompt: 'Спуститься к насосной', position: G(62.5, -57, 0.1), target: 'pump_in', shape: 'none' }));
    W.addSign(G(62.5, -50), Math.PI, ['Насосный двор: работы по плану гильдии. Вход со стороны колодца.']);
    tree(W, ...P(64, -66), 1.25, r, 'oak'); // the old linden (landmark)
    bench(W, F0(52, -56, 0.4), 0, 0, 0);
  }, 'Колодезная площадь');
  W.group('craft_square', { x: P(-67, 54)[0], z: P(-67, 54)[1] }, (r) => {
    well(W, ...P(-68, 56));
    const F = F0(-62, 50, 0.3);
    prop(F, 'survival/workbench', 0, 0, 0, { s: 2.6 });
    for (let i = 0; i < 3; i++) crate(W, F0(-76 + i * 1.1, 50, 0), 0, 0, 0.8, i * 0.5);
    prop(F0(-74, 62, 1.2), 'nature/log_stackLarge', 0, 0, 0, { s: 3 });
  }, 'Мастеровая площадь');
  W.group('temple_square', { x: P(-56, -44)[0], z: P(-56, -44)[1] }, (r) => {
    for (const [u, v, a] of [[-66, -40, 0.2], [-46, -40, -0.3]]) bench(W, F0(u, v, a), 0, 0, 0);
    for (const [u, v] of [[-68, -48], [-44, -50]]) tree(W, ...P(u, v), 0.7, r, 'birch');
  }, 'Храмовая площадь');
  W.group('caravan_yard', { x: P(46, 66)[0], z: P(46, 66)[1] }, (r) => caravanYard(r), 'Караванный двор');
  W.group('cemetery', { x: P(-78, -69)[0], z: P(-78, -69)[1] }, (r) => cemetery(r), 'Кладбище');
  W.group('secret_garden', { x: P(-84, -38)[0], z: P(-84, -38)[1] }, (r) => secretGarden(r), 'Тайный сад');
  W.group('guild_yard', { x: P(8, -56)[0], z: P(8, -56)[1] }, () => guildYard(), 'Двор гильдии');
  W.group('lumber_yard', { x: P(-91, 29)[0], z: P(-91, 29)[1] }, (r) => {
    for (let i = 0; i < 3; i++) prop(F0(-93.5 + i * 3.2, 27 + (i % 2) * 3.5, 0.1 * i), 'nature/log_stackLarge', 0, 0, 0, { s: 3 });
    prop(F0(-88.5, 32, 0.6), 'survival/workbench', 0, 0, 0, { s: 2.6 });
  }, 'Лесной склад');
  // Laundry lines in the residential yards.
  for (const [i, [u, v, a]] of [[30, -96, 0.3], [-62, 2, 1.2], [-22, 84, -0.4]].entries()) {
    W.group('laundry_' + i, { x: P(u, v)[0], z: P(u, v)[1] }, () => {
      const L = F0(u, v, a);
      for (const s of [-1, 1]) L.box(0.1, 2.4, 0.1, 0, 0, s * 2.5, 'log');
      L.box(0.03, 0.03, 5, 0, 2.3, 0, 'log', { collide: false });
      for (let k = 0; k < 4; k++) L.box(0.6, 0.7, 0.02, 0, 1.6, -1.6 + k * 1.05, 'cloth', { collide: false, castShadow: true, tint: [0xf2f2f2, 0x8ab0e0, 0xe0a0a0, 0xf0e0a0][k], ry: Math.PI / 2 });
    }, 'Бельевая верёвка');
  }
}

function fountainSquare(rng) {
  const F = new Frame(W, AXEL.x, AXEL.level, AXEL.z, 0);
  // Inlay on the square's paving (PAVE_LIFT.square): dark rings, a light band and eight spokes
  // round the fountain, then the fountain itself (three stone basins, running water).
  const top = PAVE_LIFT.square;
  const ring = (r0, r1, y, tint) => F.put(new THREE.RingGeometry(r0, r1, 72), 1, 1, 1, 0, top + y, 0, 'stoneDark', { rx: -Math.PI / 2, collide: false, castShadow: false, tint });
  ring(12.4, 13.3, 0.02, 0x6f685c);
  ring(11.5, 12.2, 0.02, 0xd9d0bc);
  ring(5.9, 6.5, 0.02, 0x6f685c);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    F.sub(Math.cos(a) * 8.9, 0, Math.sin(a) * 8.9, -a + Math.PI / 2).box(0.55, 0.02, 5.0, 0, top + 0.02, 0, 'stone', { collide: false, castShadow: false, tint: 0xe2d9c4 });
  }
  const lathe = (pts, y, tint) => F.put(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 40), 1, 1, 1, 0, top + y, 0, 'stone', { tint });
  const STONE_TONE = 0xd9d0bc, TRIM = 0xc8bca6;
  // Lower basin: a thick rounded rim, the water a hand below it.
  lathe([[0, 0], [5.6, 0], [5.6, 0.85], [5.45, 1.05], [5.0, 1.05], [4.85, 0.9], [4.85, 0.6], [0, 0.6]], 0, STONE_TONE);
  lathe([[5.7, 0.2], [5.7, 0.35], [5.55, 0.4], [5.55, 0.2]], 0, TRIM); // plinth moulding
  F.cyl(4.85, 0.05, 0, top + 0.78, 0, 'water', { seg: 24, collide: false, castShadow: false });
  // Pedestal and middle bowl.
  lathe([[0, 0.6], [1.25, 0.6], [1.25, 0.95], [0.8, 1.25], [0.62, 1.6], [0.62, 2.7], [1.0, 2.95], [2.55, 3.15], [2.55, 3.5], [2.35, 3.62], [1.95, 3.62], [1.8, 3.45], [0.45, 3.4], [0, 3.4]], 0, STONE_TONE);
  F.cyl(1.85, 0.05, 0, top + 3.48, 0, 'water', { seg: 20, collide: false, castShadow: false });
  // Crown: slender column, small bowl and a finial.
  lathe([[0.4, 3.4], [0.4, 4.5], [0.9, 4.75], [0.95, 4.95], [0.7, 4.98], [0.55, 4.85], [0.18, 4.8], [0.18, 5.4], [0.3, 5.5], [0, 5.9]], 0, TRIM);
  F.cyl(0.62, 0.04, 0, top + 4.88, 0, 'water', { seg: 14, collide: false, castShadow: false });
  // Streams: from the middle bowl's rim down into the lower basin, and a jet from the crown.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const S = F.sub(Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3, -a + Math.PI / 2);
    S.box(0.14, 2.75, 0.05, 0, top + 0.85, 0.12 + 0.25, 'water', { collide: false, castShadow: false, rx: -0.12 });
  }
  F.cyl(0.07, 1.0, 0, top + 5.0, 0, 'water', { seg: 6, collide: false, castShadow: false });
  F.sphere(0.2, 0, top + 6.0, 0, 'stone', { tint: 0xece4d8, collide: false });
  W.fountain = F.at(0, 3.4, 0);
  W.spot('square', G(0, 9), 0);
  W.spot('square_east', G(10, -8), 0);
  W.spot('square_west', G(-12, 7), 0);
  // Benches round the fountain, planters with trees at the edges.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (i === 6) continue; // the side towards the south street stays open
    const x = Math.cos(a) * 9.5, z = Math.sin(a) * 9.5;
    bench(W, F0(x, z, -a + Math.PI / 2), 0, 0, 0);
    if (i === 3) W.spot('tom_bench', G(Math.cos(a) * 9.3, Math.sin(a) * 9.3), -a - Math.PI / 2);
  }
  for (const [u, v] of [[-15, -12], [12, -15], [17, 9], [-14, 10]]) {
    const P2 = F0(u, v, 0);
    P2.box(2.2, 0.6, 2.2, 0, 0, 0, 'stone', { tint: 0xc8bca8 });
    tree(W, ...P(u, v), 0.75, rng, 'oak');
  }
  // Town notice board.
  const Bd = F0(19, -2, -Math.PI / 2 - 0.35);
  for (const s of [-1, 1]) Bd.box(0.18, 2.6, 0.18, s * 1.3, 0, 0, 'log');
  Bd.box(2.9, 1.5, 0.12, 0, 0.9, 0, 'wood', { tint: 0x7a5232 });
  Bd.box(3.2, 0.3, 0.6, 0, 2.6, 0, 'roof', { tint: 0x7d3a3a, collide: false });
  const papers = [0xf2ead8, 0xe8dcc0, 0xf8f0e0, 0xe0d8c8];
  for (let i = 0; i < 7; i++) Bd.box(0.42, 0.5, 0.02, -1.0 + (i % 4) * 0.66, 1.1 + Math.floor(i / 4) * 0.62, 0.08, 'plaster', { tint: papers[i % 4], collide: false, castShadow: false });
  W.townBoard = Bd.at(0, 1.6, 0.6);
  W.addInteractable(new QuestProp({ id: 'town_board', name: 'Городская доска', prompt: 'Читать объявления', position: Bd.at(0, 1.2, 0.3), shape: 'none' }));
  W.spot('town_board', Bd.at(0, 0, 1.6), Bd.rot);
}

function marketSquare(rng) {
  const q = SQ.market_square.pts;
  // Stalls along the square's edges, fronts inwards (the hall stands in the middle).
  const cloths = [0xc83a3a, 0x3a7ac8, 0xd8a030, 0x4a9a5a, 0xa84aa8, 0xc86a3a];
  const goods = ['bread', 'fruit', 'veg', 'mixed', 'fruit', 'veg'];
  const spots = { 1: 'market_fruit', 3: 'market_stall' };
  const [cu, cv] = centroid(q);
  const slots = [[44, 21], [52, 20], [68, 21], [72, 30], [46, 39], [62, 41]];
  slots.forEach(([u, v], i) => {
    const rot = Math.atan2(cu - u, cv - v);
    const [x, z] = P(u, v);
    stall(W, x, z, rot, cloths[i], goods[i], rng);
    if (spots[i]) {
      const p = G(u - Math.sin(rot) * 0.9, v - Math.cos(rot) * 0.9);
      W.spot(spots[i], p, rot);
    }
  });
}

function caravanYard(rng) {
  wagon(W, ...P(36, 64), 1.2, 0xe8dcc0);
  wagon(W, ...P(52, 70), -0.3, 0xd8c8a0);
  wagon(W, ...P(40, 74), 2.6, 0xe0d0b0);
  for (let i = 0; i < 3; i++) haystack(W, ...P(58 + (i % 2) * 2.2, 60 + i * 2.4), 0.7);
  for (let i = 0; i < 4; i++) crate(W, F0(30 + i * 1.0, 58, 0.2 * i), 0, 0, 0.8, i * 0.3);
  for (let i = 0; i < 3; i++) barrel(W, F0(56 + i * 0.9, 76, 0), 0, 0);
  W.spot('caravan_master', G(48, 58), Math.PI);
  W.addLightSource(G(46, 66, 2.2), { color: 0xffa050, intensity: 5, distance: 12, night: true });
}

function cemetery(rng) {
  const q = SQ.cemetery.pts;
  // Iron fence round the yard (gap on the temple side).
  const S = 2.2;
  for (let i = 0; i < q.length; i++) {
    if (i === 1) continue; // east side: the gate towards the temple
    const [ax, az] = P(...q[i]), [bx, bz] = P(...q[(i + 1) % q.length]);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / S)), rot = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      new Frame(W, x, W.heightAt(x, z) - 0.05, z, rot).kit('graveyard/iron-fence', 0, 0, 0, { sx: S, sy: 2.2, sz: len / n, ry: Math.PI / 2, collide: 'box' });
    }
  }
  const stones = ['gravestone-cross', 'gravestone-round', 'gravestone-bevel', 'gravestone-decorative', 'gravestone-roof', 'gravestone-wide', 'gravestone-broken', 'cross-wood'];
  const c = B.crypt;
  const inside = (u, v) => { let k = false; for (let a = 0, b = q.length - 1; a < q.length; b = a++) { const [ua, va] = q[a], [ub, vb] = q[b]; if (va > v !== vb > v && u < ((ub - ua) * (v - va)) / (vb - va) + ua) k = !k; } return k; };
  const edge = (u, v) => Math.min(...q.map((p, a) => { const n = q[(a + 1) % q.length]; const dx = n[0] - p[0], dv = n[1] - p[1]; const t = Math.max(0, Math.min(1, ((u - p[0]) * dx + (v - p[1]) * dv) / (dx * dx + dv * dv))); return Math.hypot(u - p[0] - dx * t, v - p[1] - dv * t); }));
  for (let v = -84; v < -54; v += 4.2) for (let u = -86; u < -68; u += 3) {
    if (!inside(u, v) || edge(u, v) < 1.4 || Math.hypot(u - c.u, v - c.v) < 5) continue;
    const [x, z] = P(u, v);
    const g = new Frame(W, x, W.heightAt(x, z) - 0.03, z, Math.PI / 2 + (rng() - 0.5) * 0.2);
    prop(g, 'graveyard/' + stones[Math.floor(rng() * stones.length)], 0, 0, 0, { s: 1.4 });
    if (rng() < 0.5) prop(g, 'graveyard/grave', 0, 0, -0.9, { s: 1.3, collide: false });
  }
  for (const [u, v] of [[-82, -58], [-75, -82]]) tree(W, ...P(u, v), 0.8, rng, 'dark');
  const lpF = F0(-72.5, -63, 0);
  prop(lpF, 'graveyard/lightpost-single', 0, 0, 0, { s: 2.2 });
  W.addLightSource(G(-72.5, -63, 2.3), { color: 0xffc070, intensity: 3, distance: 9, night: true });
}

function secretGarden(rng) {
  // Hidden between the cemetery and the west wall, ringed by bushes; the gap faces the garden lane.
  const [cu, cv] = centroid(SQ.secret_garden.pts);
  for (let i = 0; i < 11; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12 + Math.PI; // gap towards +u (the lane)
    bush(W, ...P(cu + Math.cos(a) * 4.2, cv + Math.sin(a) * 4.2), 0.95, rng, 0xffffff);
  }
  const F = F0(cu, cv, 0);
  const cols = [0xff6a8a, 0xffd04a, 0xb080ff, 0xffffff];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 2.6;
    F.sphere(0.12, Math.cos(a) * r, 0.15, Math.sin(a) * r, 'flower', { collide: false, castShadow: false, tint: cols[i % 4] });
  }
  bench(W, F, 1.2, -1.2, 0.6);
  W.addChest(G(cu - 1.4, cv - 1.4), 0.6, 'garden_secret');
}

function guildYard() {
  const q = SQ.guild_yard.pts;
  fence(W, [q[3], q[0], q[1], q[2]].map(([u, v]) => P(u, v)), { tint: 0x7a5a3a });
  for (let i = 0; i < 3; i++) {
    const Tg = F0(0 + i * 6, -58, 0);
    Tg.cyl(0.6, 0.12, 0, 1.0, 0, 'cloth', { tint: i % 2 ? 0xd84040 : 0xf2ead8, rx: Math.PI / 2, seg: 12, collide: false });
    Tg.box(0.12, 1.6, 0.12, 0, 0, 0.1, 'log');
  }
  W.addInteractable(new Brazier(G(16, -53)));
}

// -----------------------------------------------------------------------------------------
// Lamps: along the main streets (alternating sides), on the squares and on the pomerium.
// -----------------------------------------------------------------------------------------
const DOORS = []; // world [x, z] in front of the lots' doors (filled by lots())
function lamps() {
  // Keep lamps off doorsteps and entrances.
  const doors = [...DOORS, ...Object.entries(W.npcSpots).filter(([k]) => /_(door|entrance|front)$/.test(k)).map(([, s]) => [s.pos.x, s.pos.z])];
  const clear = (x, z) => doors.every(([dx, dz]) => Math.hypot(dx - x, dz - z) > 2.6);
  let n = 0;
  const put = (u, v, rot) => {
    const [x, z] = P(u, v);
    if (!clear(x, z)) return false;
    W.group('lamp_' + n++, { x, z, rot }, () => lamp(W, G(u, v), rot), 'Фонарь');
    return true;
  };
  for (const s of STREETS) {
    if (s.kind === 'lane') continue;
    const step = s.kind === 'main' ? 17 : 24;
    const pts = streetLine(s);
    let acc = 6, side = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [au, av] = pts[i], [bu, bv] = pts[i + 1];
      const L = Math.hypot(bu - au, bv - av), tu = (bu - au) / L, tv = (bv - av) / L;
      for (; acc < L; acc += step) {
        const off = s.width / 2 - 0.45;
        if (put(au + tu * acc - tv * off * side, av + tv * acc + tu * off * side, Math.atan2(tu, tv))) side = -side;
      }
      acc -= L;
    }
  }
  for (const id of ['fountain_square', 'market_square', 'temple_square', 'caravan_yard', 'craft_square', 'well_square']) {
    const q = SQ[id].pts;
    const [cu, cv] = centroid(q);
    q.forEach(([u, v], i) => {
      if (i % 2) return;
      const k = 2.2 / Math.hypot(u - cu, v - cv);
      put(u + (cu - u) * k, v + (cv - v) * k, 0);
    });
  }
}

// -----------------------------------------------------------------------------------------
// Outside the walls
// -----------------------------------------------------------------------------------------
function caravanCamp(rng) {
  // At the south gate: waiting wagons, a stable roof, hay.
  const H = (x, z) => W.heightAt(x, z);
  wagon(W, -312, 156, 1.2, 0xe8dcc0);
  // A00 (the new game): the caravan has stopped here, before the south gate. Marta checks the harness of her cart; two sacks lie
  // by its rear wheel (option 1 of the scene); Megumin stands on the road side, the gate to the north (A01: Bernard).
  const M = new Frame(W, -312, H(-312, 156), 156, 1.2);
  [[1.7, -1.5, 0.5], [1.5, -2.5, -0.4]].forEach(([lx, lz, rot], i) => {
    const p = M.at(lx, 0, lz);
    p.y = H(p.x, p.z);
    W.addInteractable(new QuestProp({ id: 'caravan_bag_' + 'ab'[i], name: 'Мешок', prompt: 'Взять мешок', position: p, shape: 'sack', rotY: 1.2 + rot }));
  });
  const mp = M.at(1.5, 0, 3.4), cp = M.at(4.6, 0, 5.0);
  mp.y = H(mp.x, mp.z);
  cp.y = H(cp.x, cp.z);
  W.spot('marta_road', mp, Math.atan2(cp.x - mp.x, cp.z - mp.z));
  W.spot('caravan_arrival', cp, Math.atan2(mp.x - cp.x, mp.z - cp.z));
  wagon(W, -328, 166, -0.3, 0xd8c8a0);
  const S = new Frame(W, -336, H(-336, 150), 150, 0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.25, 3.2, 0.25, sx * 4, -0.2, sz * 2.5, 'log');
  S.box(9, 0.2, 6, 0, 3.0, 0, 'thatch', { rx: 0.15 });
  for (let i = 0; i < 3; i++) haystack(W, -338 + i * 2.5, 156 + (i % 2), 0.7);
  fence(W, [[-344, 140], [-344, 170], [-326, 174]], { tint: 0x8a6a48 });
  barrel(W, new Frame(W, -306, H(-306, 150), 150, 0), 0, 0);
  W.addLightSource(new THREE.Vector3(-318, H(-318, 160) + 1.6, 160), { color: 0xffa050, intensity: 5, distance: 11, night: true });
}

function trainingField() {
  // The guild's proving ground north of the walls (room for an Explosion!).
  const c = REGION.guild_field.center;
  W.group('training_field', { x: c.x, z: c.z }, () => trainingFieldBody(c), 'Тренировочное поле гильдии');
}

function trainingFieldBody(c) {
  const cx = c.x, cz = c.z;
  const y = W.heightAt(cx, cz);
  fence(W, [[cx - 20, cz + 14], [cx - 20, cz - 16], [cx + 22, cz - 16], [cx + 22, cz + 14]], { open: true, tint: 0x7a5a3a });
  const spots = [[cx - 4, cz - 8], [cx + 2, cz - 10], [cx + 8, cz - 7], [cx - 9, cz - 4], [cx + 13, cz - 3]];
  for (const [x, z] of spots) {
    const dp = W.xf(new THREE.Vector3(x, W.heightAt(x, z), z)); // the group's move carries the dummy
    const d = new TrainingDummy(W, dp);
    W.dummies.push(d);
    W.dynamicColliders.push(d.collider);
    W.scene.add(d.root);
    W.updatables.push(d);
  }
  // Lesson lanes (docs/combat/04 §1-2): a straight lane of two dummies for Crimson Breach (the side posts stay), and
  // a tight cluster of three for Tidal Collapse. `tag` tells the combat which exercise a hit counts for.
  const lane = [[cx - 14, cz + 6], [cx - 14, cz + 2]];
  for (const [x, z] of lane) {
    const d = new TrainingDummy(W, W.xf(new THREE.Vector3(x, W.heightAt(x, z), z)));
    d.tag = 'lane';
    W.dummies.push(d);
    W.dynamicColliders.push(d.collider);
    W.scene.add(d.root);
    W.updatables.push(d);
    for (const s of [-1, 1]) new Frame(W, x + s * 2.3, W.heightAt(x + s * 2.3, z), z, 0).cyl(0.1, 1.5, 0, 0.75, 0, 'wood', { seg: 8, collide: false, tint: 0x6a4428, castShadow: false });
  }
  const cluster = [[cx + 15.2, cz + 5.5], [cx + 17.2, cz + 4.2], [cx + 14.6, cz + 3.4]];
  for (const [x, z] of cluster) {
    const d = new TrainingDummy(W, W.xf(new THREE.Vector3(x, W.heightAt(x, z), z)));
    d.tag = 'cluster';
    W.dummies.push(d);
    W.dynamicColliders.push(d.collider);
    W.scene.add(d.root);
    W.updatables.push(d);
  }
  new Frame(W, cx + 2, y, cz - 7, 0).cyl(6, 0.05, 0, -0.02, 0, 'stoneDark', { seg: 16, collide: false, castShadow: false, tint: 0x5a5048 });
  W.spot('training_lane', new THREE.Vector3(cx - 14, W.heightAt(cx - 14, cz + 10.5), cz + 10.5), Math.PI);
  W.spot('training_cluster', new THREE.Vector3(cx + 16, W.heightAt(cx + 16, cz + 4.4), cz + 4.4), 0);
  W.spot('training_field', new THREE.Vector3(cx - 6, y, cz + 10), Math.PI);
  W.trainingTarget = W.xf(new THREE.Vector3(cx + 2, y, cz - 7));
  W.spot('training_center', W.trainingTarget, 0);
  W.addFootprint(cx, cz, 40, 30, 0, 'field');
}

// -----------------------------------------------------------------------------------------
/** 1 m mask of the city: true where the ground is open (gardens, yards) — for the grass. */
function groundMask() {
  const [x0, z0] = P(-116, -116);
  const N = 236;
  const mask = new Uint8Array(N * N); // 1 = paved / built
  const mark = (x, z) => { const i = Math.floor(x - x0), j = Math.floor(z - z0); if (i >= 0 && j >= 0 && i < N && j < N) mask[j * N + i] = 1; };
  const line = (pts, half) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 0.7) for (let o = -half - 0.5; o <= half + 0.5; o += 0.7) {
        const x = ax + ((bx - ax) * t) / L - ((bz - az) / L) * o, z = az + ((bz - az) * t) / L + ((bx - ax) / L) * o;
        mark(x, z);
      }
    }
  };
  for (const s of STREETS) line(STREET_W[s.id], s.width / 2);
  line(RING_W(), RING.width / 2);
  const inPoly = (pts, x, z) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const wallIn = offsetPolygon(WALL.nodes.map((n) => P(n.u, n.v)), -3);
  const sq = SQUARES.map((q) => q.pts.map(([u, v]) => P(u, v)));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + i + 0.5, z = z0 + j + 0.5;
    if (!inPoly(wallIn, x, z) || sq.some((q) => inPoly(q, x, z))) mask[j * N + i] = 1;
  }
  for (const f of W.footprints) {
    if (Math.abs(f.x - AXEL.x) > 120 || Math.abs(f.z - AXEL.z) > 120) continue;
    const r = Math.max(f.w, f.d) / 2 + 1;
    for (let z = f.z - r; z <= f.z + r; z += 0.7) for (let x = f.x - r; x <= f.x + r; x += 0.7) mark(x, z);
  }
  return (x, z) => {
    const i = Math.floor(x - x0), j = Math.floor(z - z0);
    return i >= 0 && j >= 0 && i < N && j < N && !mask[j * N + i];
  };
}
