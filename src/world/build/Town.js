import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, house, townWall, tower, lamp, lantern, barrel, crate, stall, well, bench, wagon, haystack, fence, tree, bush, food, prop, tableware } from './Kit.js';
import { HealingCrystal, Brazier, QuestProp } from '../Interactables.js';
import { TrainingDummy } from '../TrainingDummy.js';

/**
 * Axel — the town of beginner adventurers.
 *
 *  - Octagonal wall (R 60) with four gatehouses; two cobbled avenues cross at the fountain
 *    square; back lanes lead to the residential corners.
 *  - North-east: the Adventurers' Guild (enterable hall) and its yard.
 *  - North-west: the tavern "Кружка и посох" (enterable) and the temple of Eris (enterable,
 *    healing crystal at the altar). A narrow gap behind the temple hides a small garden.
 *  - South-east: market stalls, the bakery, the general store, the alchemist.
 *  - South-west: the forge and the weaponsmith.
 *  - Outside: the caravan yard at the south gate, the guild's training field north of town.
 *
 * Named spots (world.spot) mark where NPCs work and where quests point.
 */

const Y = 0.8; // flattened town ground level

export function buildTown(world) {
  const rng = mulberry32(2024);
  const W = world;

  townWall(W, 0, 0, 60);
  streets(W);
  // Editable groups (map editor): id, builder pivot, label.
  W.group('square', { x: 0, z: 0 }, (r) => square(W, r), 'Площадь и фонтан');
  W.group('guild', { x: 22, z: -22 }, (r) => guild(W, r), 'Гильдия');
  W.group('tavern', { x: -22, z: -22 }, (r) => tavern(W, r), 'Таверна');
  W.group('temple', { x: -20, z: -38 }, (r) => temple(W, r), 'Храм Эрис');
  W.group('crypt', { x: -20, z: -51 }, () => crypt(W), 'Склеп за храмом');
  market(W, rng);
  crafts(W, rng);
  residential(W, rng);
  W.group('caravan_yard', { x: -20, z: 80 }, (r) => caravanYard(W, r), 'Стоянка караванов');
  trainingField(W, rng);
  W.group('secret_garden', { x: -30, z: -41 }, (r) => secretGarden(W, r), 'Тайный сад');
  // Lamps along the avenues.
  let li = 0;
  for (let t = -52; t <= 52; t += 13) {
    if (Math.abs(t) < 18) continue;
    W.group('lamp_s' + li, { x: 4.6, z: t }, () => lamp(W, new THREE.Vector3(4.6, Y, t), 0), 'Фонарь');
    W.group('lamp_w' + li, { x: t, z: -4.6, rot: Math.PI / 2 }, () => lamp(W, new THREE.Vector3(t, Y, -4.6), Math.PI / 2), 'Фонарь');
    li++;
  }
  // Gate guards' posts.
  // (just inside each gate, beside the passage — the gatehouse towers are solid)
  W.spot('gate_south', new THREE.Vector3(2.6, Y, 50.5), 0);
  W.spot('gate_north', new THREE.Vector3(-2.6, Y, -50.5), Math.PI);
  W.spot('gate_east', new THREE.Vector3(50.5, Y, 2.6), Math.PI / 2);
  W.spot('gate_west', new THREE.Vector3(-50.5, Y, -2.6), -Math.PI / 2);
}

// -----------------------------------------------------------------------------------------
function paving(W, x1, z1, x2, z2, width, tint = 0xb0a898) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const rot = Math.atan2(x2 - x1, z2 - z1);
  const F = new Frame(W, (x1 + x2) / 2, Y - 0.06, (z1 + z2) / 2, rot);
  F.box(width, 0.14, len, 0, 0, 0, 'cobble', { castShadow: false, tint });
  // Kerbs.
  for (const s of [-1, 1]) F.box(0.25, 0.2, len, s * (width / 2 + 0.1), -0.02, 0, 'stoneDark', { castShadow: false, collide: false });
}

function streets(W) {
  paving(W, 0, -70, 0, 70, 7);
  paving(W, -70, 0, 70, 0, 7);
  // Back lanes.
  paving(W, 36, -3.5, 36, -50, 3.6, 0xa69e8e);
  paving(W, -36, -3.5, -36, -50, 3.6, 0xa69e8e);
  paving(W, 3.5, 30, 40, 30, 3.6, 0xa69e8e);
  paving(W, -3.5, 28, -44, 28, 3.6, 0xa69e8e);
}

function square(W, rng) {
  const F = new Frame(W, 0, Y, 0, 0);
  F.cyl(16, 0.14, 0, -0.06, 0, 'cobble', { seg: 16, castShadow: false, tint: 0xbab2a2 });
  F.cyl(13.5, 0.15, 0, -0.04, 0, 'stoneDark', { seg: 16, castShadow: false, collide: false, tint: 0x9a9284 });
  // Fountain: basin, water, column, statue of the goddess.
  F.kit('town/fountain-round', 0, 0, 0, { s: 4.3 });
  F.cyl(0.9, 2.2, 0, 0.5, 0, 'stone', { seg: 12, tint: 0xd6ccbc });
  F.cyl(1.6, 0.3, 0, 2.6, 0, 'stone', { seg: 12, tint: 0xd6ccbc });
  F.cyl(0.38, 1.4, 0, 2.9, 0, 'stone', { seg: 10, tint: 0xece4d8, collide: false });
  F.sphere(0.26, 0, 4.45, 0, 'stone', { tint: 0xece4d8, collide: false });
  F.cone(0.75, 1.5, 0, 2.9, 0, 'stone', { tint: 0xece4d8, collide: false, seg: 12 });
  for (const s of [-1, 1]) F.box(0.9, 0.12, 0.25, s * 0.55, 3.9, 0, 'stone', { tint: 0xece4d8, collide: false, rz: s * 0.6 });
  W.fountain = F.at(0, 3.4, 0);
  W.spot('square', new THREE.Vector3(0, Y, 7), 0);
  W.spot('square_east', new THREE.Vector3(8, Y, -7), 0);
  W.spot('square_west', new THREE.Vector3(-8, Y, 8), 0);
  // Benches + planters + lamps around the square.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 9.5, z = Math.sin(a) * 9.5;
    bench(W, new Frame(W, x, Y, z, -a + Math.PI / 2), 0, 0, 0);
    if (i === 3) W.spot('tom_bench', new THREE.Vector3(Math.cos(a) * 9.3, Y, Math.sin(a) * 9.3), -a - Math.PI / 2);
    const lx = Math.cos(a + 0.2) * 13, lz = Math.sin(a + 0.2) * 13;
    if (i % 2 === 0) lamp(W, new THREE.Vector3(lx, Y, lz), -a);
  }
  for (const [x, z] of [[11, 11], [-11, 11], [11, -11], [-11, -11]]) {
    const P = new Frame(W, x, Y, z, 0);
    P.box(2.2, 0.6, 2.2, 0, 0, 0, 'stone', { tint: 0xc8bca8 });
    tree(W, x, z, 0.75, rng, 'oak');
  }
  // Guild notice board (the job board stands inside the guild; this is the town board).
  const B = new Frame(W, 7.5, Y, -13.5, Math.PI + 0.35);
  for (const s of [-1, 1]) B.box(0.18, 2.6, 0.18, s * 1.3, 0, 0, 'log');
  B.box(2.9, 1.5, 0.12, 0, 0.9, 0, 'wood', { tint: 0x7a5232 });
  B.box(3.2, 0.3, 0.6, 0, 2.6, 0, 'roof', { tint: 0x7d3a3a, collide: false });
  const papers = [0xf2ead8, 0xe8dcc0, 0xf8f0e0, 0xe0d8c8];
  for (let i = 0; i < 7; i++) B.box(0.42, 0.5, 0.02, -1.0 + (i % 4) * 0.66, 1.1 + Math.floor(i / 4) * 0.62, 0.08, 'plaster', { tint: papers[i % 4], collide: false, castShadow: false });
  W.townBoard = B.at(0, 1.6, 0.6);
  W.addInteractable(new QuestProp({ id: 'town_board', name: 'Городская доска', prompt: 'Читать объявления', position: B.at(0, 1.2, 0.3), shape: 'none' }));
  W.spot('town_board', B.at(0, 0, 1.6), Math.PI + 0.35);
}

// -----------------------------------------------------------------------------------------
function guild(W, rng) {
  const g = house(W, { x: 22, z: -22, rot: 0, w: 18, d: 13, floors: 1, floorH: 6.2, open: 'hall', wallTint: 0xf0e2c4, roofTint: 0x2f5a8a, chimney: true, dormer: true, door: 0, doorWidth: 3.4, kind: 'guild', lantern: false }, rng);
  const F = g.frame;
  const fy = 0.35; // floor height inside the frame
  // Steps + banners.
  F.box(5, 0.8, 1.6, 0, -0.55, 7.6, 'stone', { tint: 0xc8bca8 });
  for (const s of [-1, 1]) {
    F.box(1.1, 3.2, 0.06, s * 3.2, 2.6, 6.62, 'cloth', { collide: false, tint: 0x2f5a8a });
    F.box(0.6, 0.6, 0.07, s * 3.2, 4.2, 6.64, 'cloth', { collide: false, castShadow: false, tint: 0xf0c050 });
    lantern(W, F.sub(s * 2.3, 2.6, 6.75));
  }
  // Sign over the door: crossed staff and sword.
  F.box(4.2, 1.0, 0.12, 0, 4.9, 6.7, 'wood', { tint: 0x6a4428, collide: false });
  F.box(3.0, 0.12, 0.05, 0, 5.4, 6.78, 'metal', { collide: false, rz: 0.4 });
  F.box(3.0, 0.12, 0.05, 0, 5.4, 6.78, 'metal', { collide: false, rz: -0.4 });
  // Bell tower on the east corner.
  const T = F.sub(9.6, 0, -5);
  T.box(3.6, 13, 3.6, 0, -0.5, 0, 'stone', { tint: 0xd8ccb8 });
  T.box(4.2, 0.4, 4.2, 0, 12.5, 0, 'stoneDark');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.box(0.5, 2.4, 0.5, sx * 1.6, 12.9, sz * 1.6, 'stone', { tint: 0xd8ccb8 });
  T.cone(3.1, 4.4, 0, 15.3, 0, 'roof', { tint: 0x2f5a8a, seg: 6, ry: Math.PI / 6 });
  T.box(0.9, 1.1, 0.06, 0, 8.5, 1.84, 'window', { collide: false, castShadow: false });
  T.cyl(0.05, 2, 0, 19.6, 0, 'metal', { seg: 6, collide: false });
  T.box(1.3, 0.8, 0.04, 0.68, 20.6, 0, 'cloth', { collide: false, tint: 0xd84040 });
  // --- Interior ---
  // Reception counter at the back.
  F.box(7.5, 1.1, 1.0, 0, fy, -4.0, 'wood', { tint: 0x7a5232 });
  F.box(7.7, 0.08, 1.2, 0, fy + 1.1, -4.0, 'plank');
  F.box(8.5, 3.6, 0.2, 0, fy, -6.25, 'wood', { tint: 0x6a4428, collide: false }); // wall panel
  for (const yy of [1.5, 2.4]) F.box(7, 0.08, 0.4, 0, fy + yy, -6.05, 'plank', { collide: false });
  W.spot('guild_counter', F.at(0, fy, -5.0), 0);
  W.spot('guild_front', F.at(0, fy, -2.6), Math.PI);
  // Job board (interactable placed by the guild system).
  F.box(3.6, 2.2, 0.15, -7.5, fy + 0.9, -1.2, 'wood', { tint: 0x5a3a22 });
  for (const s of [-1, 1]) F.box(0.16, 3.2, 0.16, -7.5 + s * 1.65, fy, -1.3, 'timber', { tint: 0x4a3020 }); // legs
  for (let i = 0; i < 8; i++) F.box(0.5, 0.6, 0.02, -8.3 + (i % 4) * 0.55 + 0.25, fy + 1.35 + Math.floor(i / 4) * 0.75, -1.1, 'plaster', { collide: false, castShadow: false, tint: i % 3 ? 0xf2ead8 : 0xe8d0a0 });
  W.guildBoard = { pos: F.at(-7.5, fy + 1.6, -0.7), yaw: Math.PI / 2 };
  W.addInteractable(new QuestProp({ id: 'guild_board', name: 'Доска заказов', prompt: 'Посмотреть заказы', position: F.at(-7.5, fy + 1.4, -0.6), shape: 'none' }));
  // Supplier counter (left side).
  F.box(1.0, 1.1, 4.0, 7.6, fy, 0.5, 'wood', { tint: 0x7a5232 });
  for (let i = 0; i < 3; i++) crate(W, F.sub(8.2, fy, 3.4 + i * 0.8), 0, 0, 0.6, i * 0.3);
  crate(W, F.sub(8.2, fy + 0.6, 4.2), 0, 0, 0.5, 0.7);
  W.spot('guild_supplier', F.at(8.4, fy, 0.5), -Math.PI / 2);
  // Tables with benches.
  for (const [tx, tz] of [[-4, 2.5], [3.5, 2.5], [-4, -0.8]]) {
    const T2 = F.sub(tx, fy, tz);
    T2.box(2.4, 0.08, 1.1, 0, 0.78, 0, 'plank', { tint: 0x8a6440 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) T2.box(0.1, 0.78, 0.1, sx * 1.05, 0, sz * 0.42, 'timber', { tint: 0x4a3020 });
    for (const sz of [-1, 1]) T2.box(2.2, 0.45, 0.3, 0, 0, sz * 0.95, 'plank', { tint: 0x7a5432 });
    tableware(T2, 0, 0.86, 0, rng, 'guild');
  }
  // Bookcases behind the reception, papers on the counter.
  for (const bx of [-5.6, 5.6]) prop(F, 'furniture/bookcaseClosedWide', bx, fy, -5.7, { s: 2.4 });
  prop(F, 'furniture/books', -2.5, fy + 1.18, -4.0, { s: 2, collide: false });
  food(F, 'cup-tea', 2.2, fy + 1.18, -3.8);
  W.spot('guild_table', F.at(-4, fy, 3.6), Math.PI);
  W.spot('guild_table2', F.at(3.5, fy, 3.6), Math.PI);
  // Chandeliers (always-on lights inside).
  for (const lx of [-4.5, 4.5]) {
    F.cyl(0.9, 0.08, lx, 4.6, 0.5, 'metal', { seg: 12, collide: false });
    W.addLightSource(F.at(lx, 4.3, 0.5), { color: 0xffc070, intensity: 9, distance: 14, always: true, flicker: true });
  }
  // Trophy on the wall.
  F.sphere(0.5, 0, 4.4, -6.1, 'bone', { collide: false, sz: 0.6 });
  W.guild = { frame: F, door: F.at(0, fy, 7.6), inside: F.at(0, fy, 1) };
  W.spot('guild_door', F.at(0, fy, 8.6), 0);
  // Yard behind the guild.
  const Yd = new Frame(W, 22, Y, -38, 0);
  fence(W, [[13, -31], [13, -46], [31, -46], [31, -31]], { tint: 0x7a5a3a });
  for (let i = 0; i < 3; i++) {
    const Tg = Yd.sub(-5 + i * 5, 0, -5);
    Tg.cyl(0.6, 0.12, 0, 1.0, 0, 'cloth', { tint: i % 2 ? 0xd84040 : 0xf2ead8, rx: Math.PI / 2, seg: 12, collide: false });
    Tg.box(0.12, 1.6, 0.12, 0, 0, 0.1, 'log');
  }
  W.addInteractable(new Brazier(new THREE.Vector3(22, Y, -33)));
}

function tavern(W, rng) {
  // Hall on the ground floor, guest rooms upstairs.
  const t = house(W, { x: -22, z: -22, rot: 0, w: 16, d: 12, floors: 2, floorH: 4.2, open: 'hall', wallTint: 0xead6b0, roofTint: 0x8a3a2a, chimney: true, door: 0, doorWidth: 2.6, kind: 'tavern', lantern: false, jetty: 0.3 }, rng);
  const F = t.frame;
  const fy = 0.35;
  // Hanging sign.
  F.box(0.1, 0.1, 1.6, 4.5, 3.6, 6.9, 'metal', { collide: false });
  F.box(1.4, 1.0, 0.08, 4.5, 2.5, 7.55, 'wood', { collide: false, tint: 0x6a4428 });
  food(F, 'mug', 4.4, 2.35, 7.64, { s: 3.4, ry: -Math.PI / 2 }); // a big tankard on the sign
  for (const s of [-1, 1]) lantern(W, F.sub(s * 2.0, 2.5, 6.4));
  barrel(W, F.sub(-6.5, 0, 7), 0, 0);
  barrel(W, F.sub(-5.6, 0, 7.4), 0, 0);
  // --- Interior ---
  F.box(1.2, 1.15, 7, -6.2, fy, -1.5, 'wood', { tint: 0x6a4428 }); // bar counter
  F.box(1.4, 0.08, 7.2, -6.2, fy + 1.15, -1.5, 'plank');
  for (let i = 0; i < 6; i++) barrel(W, F.sub(-7.4, fy, -4.5 + i * 1.2), 0, 0, 0x6a4428);
  W.spot('tavern_bar', F.at(-7.1, fy, -1.5), Math.PI / 2);
  W.spot('tavern_bar_front', F.at(-4.8, fy, -1.5), -Math.PI / 2);
  // Fireplace on the back wall.
  F.box(3.2, 2.8, 1.0, 3.0, fy, -5.6, 'stone', { tint: 0xa89c8c });
  F.box(2.0, 1.2, 0.3, 3.0, fy + 0.2, -5.05, 'metal', { collide: false });
  W.addLightSource(F.at(3.0, fy + 0.8, -4.6), { color: 0xff8a3a, intensity: 10, distance: 13, always: true, flicker: true });
  W.tavernFire = F.at(3.0, fy + 0.5, -4.8);
  // Tables.
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
    // Seat on the first stool, facing the table.
    const sx = Math.cos(i) * 1.15, sz = Math.sin(i) * 1.15;
    W.spot('tavern_table' + i, F.at(tx + sx * 0.92, fy, tz + sz * 0.92), Math.atan2(-sx, -sz));
  });
  // Mugs and bottles on the bar, bottles on the back barrels.
  for (let i = 0; i < 5; i++) food(F, i % 2 ? 'mug' : 'glass-wine', -6.0, fy + 1.23, -4.4 + i * 1.3, { ry: i });
  for (let i = 0; i < 6; i++) food(F, ['wine-red', 'wine-white', 'mug'][i % 3], -7.4, fy + 1.0, -4.5 + i * 1.2, { ry: i });
  // Bard's corner.
  F.box(3, 0.3, 2.4, 5.6, fy, 3.9, 'plank', { tint: 0x7a5432 });
  W.spot('tavern_stage', F.at(5.6, fy + 0.3, 3.9), -Math.PI * 0.75);
  for (const lx of [-1, 4]) W.addLightSource(F.at(lx, 3.4, 0), { color: 0xffb060, intensity: 6, distance: 11, always: true, flicker: true });
  W.tavern = { frame: F, inside: F.at(0, fy, 0) };
  W.spot('tavern_door', F.at(0, fy, 7.5), 0);
}

function temple(W, rng) {
  const t = house(W, { x: -20, z: -38, rot: 0, w: 11, d: 14, floors: 1, floorH: 6.5, open: 'hall', wallTint: 0xf4f0e8, roofTint: 0x3a6a8a, chimney: false, door: 0, doorWidth: 2.6, kind: 'temple', lantern: false, pitch: 0.95 }, rng);
  const F = t.frame;
  const fy = 0.35;
  // Bell spire over the entrance.
  const S = F.sub(0, 6.8, 5.4);
  S.box(3.0, 5.5, 3.0, 0, 0, 0, 'plaster', { tint: 0xf4f0e8 });
  S.box(1.2, 1.6, 0.06, 0, 2.4, 1.53, 'window', { collide: false, castShadow: false });
  S.cone(2.4, 6.5, 0, 5.5, 0, 'roof', { tint: 0x3a6a8a, seg: 4, ry: Math.PI / 4 });
  S.cyl(0.05, 1.6, 0, 11.9, 0, 'metal', { seg: 6, collide: false });
  S.box(0.8, 0.1, 0.1, 0, 12.9, 0, 'metal', { collide: false });
  // Interior: altar + crystal + benches.
  F.box(4, 0.5, 2.6, 0, fy, -6, 'stone', { tint: 0xe8e2d8 });
  for (const sx of [-1.5, 1.5]) prop(F, 'graveyard/candle-multiple', sx, fy + 0.5, -5.4, { s: 1.2, collide: false });
  for (const sx of [-3.4, 3.4]) prop(F, 'graveyard/urn-round', sx, fy, -6.2, { s: 1.6 });
  W.spot('temple_altar', F.at(0, fy + 0.5, -5.2), 0);
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) F.box(3.0, 0.45, 0.6, sx * 2.4, fy, 3.5 - i * 1.8, 'plank', { tint: 0x8a6440 });
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) F.box(0.9, 2.2, 0.06, sx * 5.53, fy + 2.4, 3 - i * 4, 'window', { collide: false, castShadow: false, ry: Math.PI / 2 });
  W.addLightSource(F.at(0, fy + 2.5, -5.5), { color: 0x9ff0ff, intensity: 5, distance: 12, always: true });
  W.addLightSource(F.at(0, 4.6, 2), { color: 0xffd8a0, intensity: 5, distance: 14, always: true });
  W.addInteractable(new HealingCrystal(F.at(0, fy + 0.5, -6.3)));
  W.spot('temple_door', F.at(0, fy, 8.4), 0);
}

/** The old crypt behind the temple (chapter 5 hook: sealed, nothing inside yet). */
function crypt(W) {
  const C = new Frame(W, -20, Y, -51, 0); // door (+z) towards the temple
  C.kit('graveyard/crypt-small', 0, 0, 0, { s: 2.8 });
  C.kit('graveyard/crypt-small-roof', 0, 2.8, 0, { s: 2.8, collide: false });
  for (const [dx, dz, n] of [[-4, 1.5, 'gravestone-cross-large'], [4, 1.2, 'pillar-obelisk'], [-5.5, -0.5, 'gravestone-decorative']]) prop(C, 'graveyard/' + n, dx, 0, dz, { s: 1.5 });
  W.spot('crypt_door', C.at(0, 0, 2.6), Math.PI);
}

// -----------------------------------------------------------------------------------------
function market(W, rng) {
  const cloths = [0xc83a3a, 0x3a7ac8, 0xd8a030, 0x4a9a5a, 0xa84aa8];
  const goods = ['bread', 'fruit', 'mixed', 'fruit', 'mixed'];
  const vendorSpot = ['', 'market_fruit', '', 'market_stall'];
  [[11, 9.5], [17, 9.5], [23, 9.5], [29, 9.5]].forEach(([x, z], i) => W.group('stall_' + i, { x, z, rot: Math.PI }, (r) => {
    stall(W, x, z, Math.PI, cloths[i], goods[i], r);
    if (vendorSpot[i]) W.spot(vendorSpot[i], new THREE.Vector3(x, Y, 10.3), Math.PI);
  }, 'Прилавок ' + (i + 1)));
  // Bakery (food shop).
  W.group('bakery', { x: 13, z: 20, rot: Math.PI }, (r) => {
    const b = house(W, { x: 13, z: 20, rot: Math.PI, w: 8, d: 6, floors: 2, open: 'shop', roofTint: 0xa0522d, awningTint: 0xd8a030, chimney: true, kind: 'shop' }, r);
    b.frame.box(1.6, 1.2, 0.08, 0, 3.1, 3.2, 'wood', { collide: false, tint: 0x6a4428 });
    b.frame.sphere(0.35, 0, 3.7, 3.28, 'hay', { collide: false, sx: 1.3, sy: 0.7 });
    shopGoods(b.frame, 8, 6, 'bakery', r);
    W.spot('bakery_counter', b.frame.at(0, 0.35, 1.2), Math.PI);
    W.spot('bakery_front', b.frame.at(0, 0.35, 4.2), 0);
  }, 'Пекарня');
  // General store.
  W.group('store', { x: 31, z: 20, rot: Math.PI }, (r) => {
    const s = house(W, { x: 31, z: 20, rot: Math.PI, w: 9, d: 7, floors: 2, open: 'shop', roofTint: 0x4c6e5a, awningTint: 0x3a7ac8, kind: 'shop' }, r);
    for (let i = 0; i < 3; i++) crate(W, s.frame.sub(-3.6 + i * 0.9, 0.35, 4.6), 0, 0, 0.7, i);
    barrel(W, s.frame.sub(3.6, 0.35, 4.4), 0, 0);
    shopGoods(s.frame, 9, 7, 'store', r);
    W.spot('store_counter', s.frame.at(0, 0.35, 1.6), Math.PI);
    W.spot('store_front', s.frame.at(0, 0.35, 4.6), 0);
  }, 'Лавка Отто');
  // Alchemist (tall, narrow, purple roof) faces the avenue.
  W.group('alchemist', { x: 12, z: 38, rot: -Math.PI / 2 }, (r) => {
    const a = house(W, { x: 12, z: 38, rot: -Math.PI / 2, w: 8, d: 7, floors: 2, open: 'shop', roofTint: 0x5a4a6e, awningTint: 0x7a4aa8, chimney: true, kind: 'shop' }, r);
    for (let i = 0; i < 6; i++) a.frame.cyl(0.09, 0.3, -2.4 + i * 0.95, 1.43, 2.6, 'glass', { seg: 8, collide: false, tint: [0xe04050, 0x4080f0, 0x50d080][i % 3] });
    shopGoods(a.frame, 8, 7, 'alchemist', r);
    W.addLightSource(a.frame.at(0, 2.2, 1.0), { color: 0xc080ff, intensity: 3, distance: 7, always: true });
    W.spot('alchemist_counter', a.frame.at(0, 0.35, 1.6), -Math.PI / 2);
    W.spot('alchemist_front', a.frame.at(0, 0.35, 4.6), Math.PI / 2);
  }, 'Алхимик');
}

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

function crafts(W) {
  W.group('forge', { x: -16, z: 19, rot: Math.PI / 2 }, (r) => forge(W, r), 'Кузница');
  W.group('weaponsmith', { x: -16, z: 36, rot: Math.PI / 2 }, (r) => weaponsmith(W, r), 'Оружейник');
}

function forge(W, rng) {
  // Blacksmith's forge: open front, furnace, anvil, trough.
  const f = house(W, { x: -16, z: 19, rot: Math.PI / 2, w: 9, d: 7, floors: 1, floorH: 3.4, open: 'shop', roofTint: 0x5a4a40, awningTint: 0x6a5a4a, chimney: true, kind: 'shop' }, rng);
  const F = f.frame;
  F.box(2.2, 1.6, 1.6, 2.6, 0.35, -1.8, 'stone', { tint: 0x8a7e70 });
  F.box(1.2, 0.5, 0.2, 2.6, 0.9, -0.95, 'metal', { collide: false });
  W.addLightSource(F.at(2.6, 1.2, -0.6), { color: 0xff7a2a, intensity: 7, distance: 9, always: true, flicker: true });
  W.forgeFire = F.at(2.6, 1.3, -1.2);
  prop(F, 'survival/workbench-anvil', -1.5, 0.35, 5.0, { s: 2.6, ry: Math.PI / 2 });
  prop(F, 'survival/workbench', -3.0, 0.35, -1.8, { s: 2.6 });
  for (const [t, x] of [['tool-hammer', -2.4], ['tool-pickaxe', -3.0], ['tool-axe', -3.6]]) prop(F, 'survival/' + t, x, 0.35, -3.1, { s: 2.4, collide: false, ry: Math.PI / 2 });
  F.box(1.6, 0.6, 0.7, 2.4, 0.35, 5.2, 'wood', { tint: 0x5a4a3a });
  F.box(1.4, 0.05, 0.5, 2.4, 0.9, 5.2, 'water', { collide: false });
  W.spot('forge_anvil', F.at(-1.5, 0.35, 4.2), 0);
  W.spot('forge_counter', F.at(0, 0.35, 1.6), Math.PI / 2);
  W.spot('forge_front', F.at(0, 0.35, 4.4), -Math.PI / 2);
}

function weaponsmith(W, rng) {
  const w = house(W, { x: -16, z: 36, rot: Math.PI / 2, w: 8, d: 7, floors: 2, open: 'shop', roofTint: 0x7d3a3a, awningTint: 0x8a2a2a, kind: 'shop' }, rng);
  for (let i = 0; i < 5; i++) w.frame.box(0.06, 1.6, 0.06, -2.5 + i * 1.2, 1.3, -2.9, 'wood', { collide: false, tint: 0x8a6a48, rz: 0.12 });
  for (let i = 0; i < 3; i++) w.frame.sphere(0.3, -2 + i * 2, 2.2, -2.95, 'metal', { collide: false, sz: 0.2 });
  W.spot('weapons_counter', w.frame.at(0, 0.35, 1.6), Math.PI / 2);
  W.spot('weapons_front', w.frame.at(0, 0.35, 4.6), -Math.PI / 2);
}

function residential(W, rng) {
  // All corners stay inside the wall's inner radius (~53 m).
  const list = [
    // [x, z, rot, w, d, floors]
    [44, -12, -Math.PI / 2, 7, 6, 2], [42, -24, -Math.PI / 2, 6, 6, 1],
    [-44, -12, Math.PI / 2, 7, 6, 2], [-42, -24, Math.PI / 2, 6, 6, 2],
    [44, 14, -Math.PI / 2, 7, 6, 2], [41, 24, -Math.PI / 2, 6, 6, 1],
    [-36, 14, 0, 7, 6, 2], [-30, 38, Math.PI, 7, 6, 2], [-43, 22, Math.PI / 2, 6, 6, 1],
    [28, 40, Math.PI, 7, 6, 2], // Mia's family home (index 9)
    [-14, 46, Math.PI / 2, 6, 5, 1], [14, 46, -Math.PI / 2, 6, 5, 2],
    [-8, -46, 0, 6, 5, 2], [9, -40, -Math.PI / 2, 5, 5, 1], [-8, -30, Math.PI / 2, 6, 6, 2], [9, -30, -Math.PI / 2, 5, 6, 1],
  ];
  list.forEach(([x, z, rot, w, d, floors], i) => W.group('house_' + i, { x, z, rot }, (rng) => {
    const h = house(W, { x, z, rot, w, d, floors }, rng);
    if (i === 9) {
      W.spot('mia_home', h.door, rot);
      const cp = h.frame.at(1.6, 0.06, d / 2 + 0.9);
      W.addInteractable(new QuestProp({ id: 'cat_home', name: 'Уголёк', prompt: 'Погладить', position: cp, shape: 'cat', rotY: rot + 0.5 }));
    }
    W.spot('house_' + i, h.door, rot);
    // A little garden / clutter next to some houses.
    if (rng() < 0.6) {
      const F = h.frame;
      barrel(W, F.sub(w / 2 + 0.8, 0.35, d / 2 - 0.5), 0, 0);
      if (rng() < 0.5) crate(W, F.sub(w / 2 + 0.9, 0.35, d / 2 - 1.6), 0, 0, 0.7, 0.4);
    }
  }, i === 9 ? 'Дом Мии' : 'Жилой дом ' + (i + 1)));
  // Laundry line between two houses (NE).
  W.group('laundry', { x: 40, z: -33 }, () => {
    const L = new Frame(W, 40, Y, -33, 0);
    for (const s of [-1, 1]) L.box(0.1, 2.4, 0.1, 0, 0, s * 2.5, 'log');
    L.box(0.03, 0.03, 5, 0, 2.3, 0, 'log', { collide: false });
    for (let i = 0; i < 4; i++) L.box(0.6, 0.7, 0.02, 0, 1.6, -1.6 + i * 1.05, 'cloth', { collide: false, castShadow: true, tint: [0xf2f2f2, 0x8ab0e0, 0xe0a0a0, 0xf0e0a0][i], ry: Math.PI / 2 });
  }, 'Бельевая верёвка');
  W.group('town_well', { x: -24, z: 9 }, () => {
    well(W, -24, 9);
    W.spot('well', new THREE.Vector3(-24, Y, 6.5), 0);
  }, 'Колодец');
}

function caravanYard(W, rng) {
  // Outside the south gate: wagons, hay, a stable roof, the arrival spot.
  wagon(W, -20, 76, 1.2, 0xe8dcc0);
  wagon(W, -12, 82, -0.3, 0xd8c8a0);
  const S = new Frame(W, -26, W.heightAt(-26, 86), 86, 0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.25, 3.2, 0.25, sx * 4, -0.2, sz * 2.5, 'log');
  S.box(9, 0.2, 6, 0, 3.0, 0, 'thatch', { rx: 0.15 });
  for (let i = 0; i < 3; i++) haystack(W, -28 + i * 2.5, 86 + (i % 2), 0.7);
  fence(W, [[-32, 70], [-32, 92], [-18, 94]], { tint: 0x8a6a48 });
  barrel(W, new Frame(W, -16, W.heightAt(-16, 72), 72, 0), 0, 0);
  W.spot('caravan_arrival', new THREE.Vector3(-12, W.heightAt(-12, 76), 76), 0.6);
  W.spot('caravan_master', new THREE.Vector3(-17, W.heightAt(-17, 79), 79), 1.2);
  W.addLightSource(new THREE.Vector3(-20, W.heightAt(-20, 78) + 1.6, 78), { color: 0xffa050, intensity: 5, distance: 11, night: true });
}

function trainingField(W, rng) {
  // The guild's proving ground north of the walls (room for an Explosion!).
  const cx = 26, cz = -86;
  const y = W.heightAt(cx, cz);
  fence(W, [[cx - 20, cz + 14], [cx - 20, cz - 16], [cx + 22, cz - 16], [cx + 22, cz + 14]], { open: true, tint: 0x7a5a3a });
  const spots = [[cx - 4, cz - 8], [cx + 2, cz - 10], [cx + 8, cz - 7], [cx - 9, cz - 4], [cx + 13, cz - 3]];
  for (const [x, z] of spots) {
    const d = new TrainingDummy(W, new THREE.Vector3(x, W.heightAt(x, z), z));
    W.dummies.push(d);
    W.dynamicColliders.push(d.collider);
    W.scene.add(d.root);
    W.updatables.push(d);
  }
  // Scorched practice circle.
  new Frame(W, cx + 2, y, cz - 7, 0).cyl(6, 0.05, 0, -0.02, 0, 'stoneDark', { seg: 16, collide: false, castShadow: false, tint: 0x5a5048 });
  W.spot('training_field', new THREE.Vector3(cx - 6, y, cz + 10), Math.PI);
  W.trainingTarget = new THREE.Vector3(cx + 2, y, cz - 7);
  W.spot('training_center', W.trainingTarget, 0);
  W.addFootprint(cx, cz, 40, 30, 0, 'field');
}

function secretGarden(W, rng) {
  // Hidden between the temple's west wall and the back lane, ringed by bushes; the only gap
  // faces the temple wall, so it is easy to walk past.
  const cx = -30, cz = -41;
  for (let i = 0; i < 11; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12; // leaves a gap towards +x (the temple)
    bush(W, cx + Math.cos(a) * 3.2, cz + Math.sin(a) * 3.2, 0.95, rng, 0xffffff);
  }
  // Crates stacked against the lane side.
  for (let i = 0; i < 3; i++) crate(W, new Frame(W, cx - 3.6, Y, cz - 1.2 + i * 1.1, 0), 0, 0, 0.9, i * 0.4);
  const F = new Frame(W, cx, Y, cz, 0);
  const cols = [0xff6a8a, 0xffd04a, 0xb080ff, 0xffffff];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 2.4;
    F.sphere(0.12, Math.cos(a) * r, 0.15, Math.sin(a) * r, 'flower', { collide: false, castShadow: false, tint: cols[i % 4] });
  }
  bench(W, F, 1.4, -1.4, 0.6);
  W.addChest(new THREE.Vector3(cx - 0.8, Y, cz - 1.6), 0.6, 'garden_secret');
}
