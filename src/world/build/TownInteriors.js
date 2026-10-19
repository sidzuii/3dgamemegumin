import * as THREE from 'three';
import { Frame, prop, food, barrel, crate, tableware, heroKit } from './Kit.js';
import { QuestProp, Door, HealingCrystal } from '../Interactables.js';
import { ROOMS } from '../HouseRooms.js';
import { FY, weaponShop, alchemyShop, generalStore, bakeryShop, caravanOffice } from './Interiors.js';

/**
 * The rooms of Axel's buildings, beyond the map edge (HouseRooms.js): a shell (floor, walls with timber framing and wainscot,
 * windows that show the daylight of the hour, a beamed ceiling, the way out: a door leaf + the «Выйти» Door to `<id>_outside`),
 * then the furniture of the room. Every room has its own lights (always on, ≤ 8: the light pool picks the nearest 8 within 60 m,
 * the rooms stand 50+ m apart). Frames: origin = the middle of the floor (y 0), front wall (the door) = local +z.
 * The NPC spots of the rooms keep the names the schedules and the story use (guild_counter, tavern_bar, temple_altar…).
 */
const NC = { collide: false, castShadow: false };
const D = { collide: false, castShadow: false, detail: true };
const has = (R, name) => R.w.kits.has(name);

export function buildTownInteriors(W) {
  // window panes: the colour of the sky of the hour (updated every frame), not lit by the room
  const pane = new THREE.MeshBasicMaterial({ color: 0xdfefff, vertexColors: true });
  W.mats.roomWindow = pane;
  const day = new THREE.Color(0xe6f2ff), dusk = new THREE.Color(0xffc890), night = new THREE.Color(0x1c2846);
  W.updatables.push({ update: (dt, ctx) => { const n = ctx.night ?? 0; pane.color.copy(day).lerp(dusk, Math.max(0, 1 - Math.abs(n - 0.5) * 3) * 0.6).lerp(night, n); } });
  W.interiors = [];
  const B = { guild, tavern, temple, bakery: shop(bakeryShop), store: shop(generalStore), alchemist: shop(alchemyShop), weaponsmith: shop(weaponShop), caravan_office: shop(caravanOffice) };
  for (const r of ROOMS) {
    const R = new Frame(W, r.x, 0, r.z, 0);
    shell(W, R, r);
    B[r.id](W, R, r);
    W.interiors.push({ id: r.id, name: r.name, room: r, inside: r.id + '_inside', outside: r.id + '_outside' });
  }
}

// -----------------------------------------------------------------------------------------
// Shell
// -----------------------------------------------------------------------------------------
const STYLE = {
  guild: { wall: 0xe8dcc4, floor: 0x8a6440, wood: 0x5a3a24, base: 'plank' },
  tavern: { wall: 0xe2cfa8, floor: 0x7a5434, wood: 0x4a3020, base: 'plank' },
  temple: { wall: 0xf0ece4, floor: 0xcfc6b8, wood: 0x6a5a4a, base: 'stone' },
  shop: { wall: 0xeadfc8, floor: 0x8a6a44, wood: 0x5a3c26, base: 'plank' },
};

function shell(W, R, r) {
  const S = STYLE[r.id] || STYLE.shop;
  const w2 = r.w / 2, d2 = r.d / 2, h = r.h, T = 0.5;
  // floor slab (collides), its surface, the ceiling slab
  R.box(r.w + 2, 1, r.d + 2, 0, -1, 0, 'stoneDark');
  R.box(r.w, 0.03, r.d, 0, -0.02, 0, S.base, { ...NC, tint: S.floor });
  R.box(r.w + 2, 0.6, r.d + 2, 0, h, 0, 'plank', { tint: 0x5a4030, castShadow: false });
  // walls (outside the floor), the front one round the door (1.7 x 2.7)
  const wall = (w, hh, d, x, y, z) => R.box(w, hh, d, x, y, z, 'plaster', { tint: S.wall });
  wall(r.w + 2 * T, h + 0.6, T, 0, -0.3, -d2 - T / 2);
  for (const s of [-1, 1]) wall(T, h + 0.6, r.d, s * (w2 + T / 2), -0.3, 0);
  const dl = r.door - 0.85, dr = r.door + 0.85;
  wall(dl + w2 + T, h + 0.6, T, (-w2 - T + dl) / 2, -0.3, d2 + T / 2);
  wall(w2 + T - dr, h + 0.6, T, (dr + w2 + T) / 2, -0.3, d2 + T / 2);
  wall(1.7, h - 2.7 + 0.3, T, r.door, 2.7, d2 + T / 2);
  // wainscot and skirting, timber posts, the wall beam, ceiling beams
  for (const s of [-1, 1]) {
    R.box(0.05, 1.0, r.d, s * (w2 - 0.025), 0, 0, 'plank', { ...NC, tint: S.wood });
    R.box(0.08, 0.1, r.d, s * (w2 - 0.04), 1.0, 0, 'timber', { ...NC, tint: S.wood });
  }
  R.box(r.w, 1.0, 0.05, 0, 0, -d2 + 0.025, 'plank', { ...NC, tint: S.wood });
  R.box(r.w, 0.1, 0.08, 0, 1.0, -d2 + 0.04, 'timber', { ...NC, tint: S.wood });
  if (dl + w2 > 0.1) R.box(dl + w2, 1.0, 0.05, (-w2 + dl) / 2, 0, d2 - 0.025, 'plank', { ...NC, tint: S.wood });
  if (w2 - dr > 0.1) R.box(w2 - dr, 1.0, 0.05, (dr + w2) / 2, 0, d2 - 0.025, 'plank', { ...NC, tint: S.wood });
  const posts = (len, at) => { const n = Math.max(1, Math.round(len / 3.6)); for (let i = 0; i <= n; i++) at(-len / 2 + (i * len) / n); };
  posts(r.d, (z) => { for (const s of [-1, 1]) R.box(0.22, h, 0.22, s * (w2 - 0.11), 0, z, 'timber', { ...NC, tint: S.wood }); });
  posts(r.w, (x) => R.box(0.22, h, 0.22, x, 0, -d2 + 0.11, 'timber', { ...NC, tint: S.wood }));
  for (const s of [-1, 1]) R.box(0.2, 0.26, r.d, s * (w2 - 0.1), h - 0.26, 0, 'timber', { ...NC, tint: S.wood });
  for (const s of [-1, 1]) R.box(r.w, 0.26, 0.2, 0, h - 0.26, s * (d2 - 0.1), 'timber', { ...NC, tint: S.wood });
  const nb = Math.max(2, Math.round(r.d / 2.6));
  for (let i = 1; i < nb; i++) R.box(r.w, 0.3, 0.24, 0, h - 0.3, -d2 + (i * r.d) / nb, 'timber', { ...NC, tint: S.wood });
  // the door: a leaf in its frame, the way out
  if (has(R, 'village/Door_1_Round')) heroKit(R, 'village/Door_1_Round', { h: 2.6 }, r.door, 0, d2 - 0.04, { ry: Math.PI, castShadow: false });
  else R.box(1.6, 2.6, 0.08, r.door, 0, d2 - 0.06, 'door', { ...NC, tint: 0x6a4428 });
  for (const s of [-1, 1]) R.box(0.16, 2.8, 0.16, r.door + s * 0.88, 0, d2 - 0.08, 'timber', { ...NC, tint: S.wood });
  R.box(1.92, 0.18, 0.16, r.door, 2.7, d2 - 0.08, 'timber', { ...NC, tint: S.wood });
  prop(R, 'furniture/rugRectangle', r.door, 0.01, d2 - 1.1, { s: 1.4, collide: false, tint: 0x8a5a3a });
  W.addInteractable(new Door({ id: r.id + '_exit', name: 'На улицу', prompt: 'Выйти', position: R.at(r.door, 0, d2 - 0.55), target: r.id + '_outside', rotY: Math.PI }));
  W.spot(r.id + '_inside', R.at(r.door, 0, d2 - 2.0), Math.PI);
}

/** A window on a wall: side 'l' | 'r' (local x = ∓w/2, `at` = z) or 'b' | 'f' (back / front wall, `at` = x). */
function windowOn(R, r, side, at, ww = 1.1, wh = 1.5, y0 = 1.25, tint = 0xffffff) {
  const w2 = r.w / 2, d2 = r.d / 2, S = STYLE[r.id] || STYLE.shop;
  const put = (w, hh, d, a, y, b, mat, o) => (side === 'l' || side === 'r' ? R.box(d, hh, w, side === 'l' ? -w2 + b : w2 - b, y, a, mat, o) : R.box(w, hh, d, a, y, side === 'b' ? -d2 + b : d2 - b, mat, o));
  put(ww, wh, 0.02, at, y0, 0.012, 'roomWindow', { ...NC, tint });
  put(ww + 0.2, 0.12, 0.14, at, y0 - 0.12, 0.07, 'timber', { ...NC, tint: S.wood }); // sill
  put(ww + 0.2, 0.12, 0.1, at, y0 + wh, 0.05, 'timber', { ...NC, tint: S.wood });
  for (const s of [-1, 1]) put(0.1, wh, 0.1, at + s * (ww / 2 + 0.05), y0, 0.05, 'timber', { ...NC, tint: S.wood });
  put(0.05, wh, 0.04, at, y0, 0.03, 'timber', { ...NC, tint: S.wood }); // mullion
  put(ww, 0.05, 0.04, at, y0 + wh * 0.55, 0.03, 'timber', { ...NC, tint: S.wood }); // transom
}

const light = (W, R, x, y, z, color = 0xffc070, intensity = 7, distance = 12, flicker = true) => W.addLightSource(R.at(x, y, z), { color, intensity, distance, always: true, flicker });

function chandelier(W, R, x, z, h, color) {
  if (has(R, 'props/Chandelier')) prop(R, 'props/Chandelier', x, h - 1.6, z, { s: 1.1, collide: false, castShadow: false });
  R.box(0.04, 0.8, 0.04, x, h - 0.8, z, 'metal', NC);
  light(W, R, x, h - 1.3, z, color ?? 0xffc070, 8, 14);
}

function wallTorch(W, R, x, y, z, ry) {
  if (has(R, 'props/Torch_Metal')) prop(R, 'props/Torch_Metal', x, y - 0.4, z, { s: 1.0, collide: false, castShadow: false, ry });
  else R.box(0.1, 0.5, 0.1, x, y - 0.4, z, 'metal', NC);
  light(W, R, x, y + 0.2, z, 0xffa050, 4, 8);
}

// -----------------------------------------------------------------------------------------
// The guild hall: Luna's counter at the back, the board on the left, Pell's supply corner on the right, tables, a fireplace.
// -----------------------------------------------------------------------------------------
function guild(W, R, r) {
  const rng = rnd(11), w2 = r.w / 2, d2 = r.d / 2;
  for (const z of [-3.5, 0.5, 4.5]) { windowOn(R, r, 'r', z); }
  for (const x of [-6, 6]) windowOn(R, r, 'f', x, 1.3, 2.0, 1.3);
  for (const z of [3.2]) windowOn(R, r, 'l', z);
  // reception counter (Luna) with its back wall: bookcases, the emblem, banners
  R.box(7, 1.1, 1.0, 0, 0, -3.9, 'wood', { tint: 0x7a5232 });
  R.box(7.2, 0.08, 1.2, 0, 1.1, -3.9, 'plank', { tint: 0x9a7448 });
  for (const s of [-1, 1]) R.box(0.9, 1.1, 1.8, s * 3.9, 0, -4.8, 'wood', { tint: 0x7a5232 }); // the counter's wings
  prop(R, 'furniture/books', -2.2, 1.18, -3.9, { s: 2, collide: false });
  food(R, 'cup-tea', 2.0, 1.18, -3.7);
  if (has(R, 'props/Scroll_1')) prop(R, 'props/Scroll_1', 0.8, 1.18, -3.8, { s: 1, collide: false, castShadow: false, ry: 0.4 });
  if (has(R, 'props/Coin_Pile')) prop(R, 'props/Coin_Pile', -0.9, 1.18, -3.8, { s: 1, collide: false, castShadow: false });
  for (const x of [-7.5, -5.0, 5.0, 7.5]) prop(R, 'furniture/bookcaseClosedWide', x, 0, -d2 + 0.35, { s: 2.4 });
  R.cyl(1.3, 0.08, 0, 4.0, -d2 + 0.05, 'cloth', { ...NC, seg: 16, rx: Math.PI / 2, tint: 0x2f5a8a });
  R.cyl(0.7, 0.1, 0, 4.0, -d2 + 0.09, 'cloth', { ...NC, seg: 5, rx: Math.PI / 2, tint: 0xf0c050 });
  for (const s of [-1, 1]) {
    if (has(R, 'props/Banner_2')) prop(R, 'props/Banner_2', s * 2.6, 2.6, -d2 + 0.12, { s: 1.2, collide: false, castShadow: false, tint: 0x4a78b8 });
    else R.box(1.2, 2.4, 0.06, s * 2.6, 2.8, -d2 + 0.05, 'cloth', { ...NC, tint: 0x2f5a8a });
  }
  W.spot('guild_counter', R.at(0, 0, -5.0), 0);
  W.spot('guild_front', R.at(0, 0, -2.6), Math.PI);
  // the board of orders on the left wall
  R.box(0.15, 2.4, 4.0, -w2 + 0.08, 0.8, -0.8, 'wood', { tint: 0x5a3a22 });
  R.box(0.25, 0.14, 4.2, -w2 + 0.12, 3.2, -0.8, 'timber', { tint: 0x4a3020 });
  for (let i = 0; i < 12; i++) R.box(0.02, 0.55, 0.45, -w2 + 0.17, 1.15 + Math.floor(i / 4) * 0.68, -2.4 + (i % 4) * 1.05 + (rng() - 0.5) * 0.2, 'plaster', { ...NC, tint: i % 3 ? 0xf2ead8 : 0xe8d0a0, ry: (rng() - 0.5) * 0.1 });
  W.addInteractable(new QuestProp({ id: 'guild_board', name: 'Доска заказов', prompt: 'Посмотреть заказы', position: R.at(-w2 + 0.6, 1.4, -0.8), shape: 'none' }));
  // the fireplace on the left, by the board
  const fp = R.sub(-w2 + 0.6, 0, -4.6, Math.PI / 2);
  fp.box(2.8, 2.2, 1.0, 0, 0, 0, 'stone', { tint: 0x9a8e80 });
  fp.box(1.5, 1.0, 0.1, 0, 0.25, 0.48, 'metal', { ...NC, tint: 0x1a1210 });
  fp.box(1.1, 0.5, 0.05, 0, 0.3, 0.52, 'lampGlass', NC);
  fp.box(3.2, 0.16, 1.2, 0, 2.2, 0.05, 'stone', { tint: 0x8a7e70 });
  fp.box(1.4, r.h - 2.4, 0.9, 0, 2.36, -0.1, 'stone', { tint: 0x9a8e80 });
  light(W, R, -w2 + 1.4, 0.8, -4.6, 0xff8a3a, 7, 10);
  for (let i = 0; i < 2; i++) prop(R, 'furniture/chairCushion', -w2 + 2.6, 0, -5.6 + i * 2.0, { s: 2.3, ry: -Math.PI / 2 });
  // Pell's supply corner on the right: a counter, crates, barrels, shelves
  R.box(1.0, 1.1, 4.2, w2 - 2.2, 0, 1.0, 'wood', { tint: 0x7a5232 });
  R.box(1.2, 0.08, 4.4, w2 - 2.2, 1.1, 1.0, 'plank', { tint: 0x9a7448 });
  for (let i = 0; i < 3; i++) crate(W, R.sub(w2 - 0.6, 0, -0.6 + i * 0.9), 0, 0, 0.7, i * 0.3);
  crate(W, R.sub(w2 - 0.6, 0.7, 0.3), 0, 0, 0.55, 0.6);
  for (let i = 0; i < 2; i++) barrel(W, R.sub(w2 - 0.6, 0, 2.6 + i * 0.95), 0, 0);
  if (has(R, 'props/Shelf_Simple')) prop(R, 'props/Shelf_Simple', w2 - 0.25, 1.6, 1.0, { s: 1.2, collide: false, ry: -Math.PI / 2 });
  for (let i = 0; i < 4; i++) food(R, ['bag', 'apple', 'carrot', 'bread'][i], w2 - 2.2, 1.18, -0.4 + i * 0.8, { ry: i });
  W.spot('guild_supplier', R.at(w2 - 1.2, 0, 1.0), -Math.PI / 2);
  // tables with benches
  const tables = [[-4.6, 1.4], [0.4, 1.4], [-4.6, 4.4], [3.6, 4.4]];
  for (const [tx, tz] of tables) {
    const T = R.sub(tx, 0, tz);
    T.box(2.6, 0.08, 1.1, 0, 0.78, 0, 'plank', { tint: 0x8a6440 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.box(0.1, 0.78, 0.1, sx * 1.15, 0, sz * 0.42, 'timber', { tint: 0x4a3020 });
    for (const sz of [-1, 1]) T.box(2.4, 0.45, 0.32, 0, 0, sz * 0.95, 'plank', { tint: 0x7a5432 });
    tableware(T, 0, 0.86, 0, rng, 'guild');
  }
  W.spot('guild_table', R.at(-4.6, 0, 2.55), Math.PI);
  W.spot('guild_table2', R.at(3.6, 0, 5.55), Math.PI);
  // the hall's furnishing: a rug, plants, a coat rack, a weapon stand, trophies
  prop(R, 'furniture/rugRectangle', 0, 0.01, 0.2, { s: 4.2, collide: false, tint: 0x8a6a9a });
  for (const [x, z] of [[-w2 + 0.6, d2 - 0.6], [w2 - 0.6, d2 - 0.6], [w2 - 0.6, -d2 + 2.2]]) prop(R, 'furniture/pottedPlant', x, 0, z, { s: 2.3 });
  prop(R, 'furniture/coatRackStanding', 2.0, 0, d2 - 0.5, { s: 2.3 });
  if (has(R, 'props/WeaponStand')) prop(R, 'props/WeaponStand', -3.2, 0, d2 - 0.6, { s: 1.1, ry: Math.PI });
  for (let i = 0; i < 3; i++) if (has(R, 'props/Shield_Wooden')) prop(R, 'props/Shield_Wooden', -7.5 + i * 2.0, 2.6, d2 - 0.1, { s: 1.3, collide: false, castShadow: false, ry: Math.PI });
  chandelier(W, R, -4, 0.8, r.h);
  chandelier(W, R, 4, 0.8, r.h);
  for (const s of [-1, 1]) wallTorch(W, R, r.door + s * 1.6, 2.4, d2 - 0.15, Math.PI);
}

// -----------------------------------------------------------------------------------------
// The tavern: the bar along the left wall, the hearth at the back, round tables, the bard's stage, a guest room for the night.
// -----------------------------------------------------------------------------------------
function tavern(W, R, r) {
  const rng = rnd(22), w2 = r.w / 2, d2 = r.d / 2;
  for (const x of [-5, 5]) windowOn(R, r, 'f', x);
  for (const z of [1.5, 5]) windowOn(R, r, 'r', z);
  // the bar: counter, stools, the barrel rack and bottle shelves behind it, hams overhead
  R.box(1.0, 1.15, 7.4, -5.6, 0, -2.2, 'wood', { tint: 0x6a4428 });
  R.box(1.2, 0.08, 7.6, -5.6, 1.15, -2.2, 'plank', { tint: 0x8a6440 });
  for (let i = 0; i < 5; i++) food(R, i % 2 ? 'mug' : 'glass-wine', -5.5, 1.23, -5.0 + i * 1.3, { ry: i });
  for (let i = 0; i < 5; i++) {
    if (has(R, 'props/Stool')) prop(R, 'props/Stool', -4.6, 0, -5.0 + i * 1.4, { s: 1.3, ry: i * 0.7 });
    else prop(R, 'furniture/stoolBar', -4.6, 0, -5.0 + i * 1.4, { s: 2.3 });
  }
  for (let i = 0; i < 6; i++) barrel(W, R.sub(-w2 + 0.6, 0, -5.6 + i * 1.15), 0, 0, 0x6a4428);
  for (let k = 0; k < 2; k++) {
    R.box(0.4, 0.06, 6.8, -w2 + 0.22, 1.6 + k * 0.6, -2.4, 'plank', { castShadow: false });
    for (let i = 0; i < 8; i++) food(R, ['wine-red', 'wine-white', 'mug'][(i + k) % 3], -w2 + 0.22, 1.66 + k * 0.6, -5.4 + i * 0.85, { ry: i });
  }
  for (let i = 0; i < 3; i++) {
    R.box(0.02, 0.4, 0.02, -5.6, r.h - 0.6, -4.8 + i * 1.8, 'log', D);
    food(R, i % 2 ? 'sausage' : 'whole-ham', -5.6, r.h - 0.95, -4.8 + i * 1.8, { s: 1.4 });
  }
  W.spot('tavern_bar', R.at(-6.8, 0, -2.2), Math.PI / 2);
  W.spot('tavern_bar_front', R.at(-4.0, 0, -1.6), -Math.PI / 2);
  // the hearth at the back with a rug and two armchairs
  const fp = R.sub(-1.0, 0, -d2 + 0.55);
  fp.box(3.6, 2.4, 1.1, 0, 0, 0, 'stone', { tint: 0x9a8070 });
  fp.box(1.8, 1.1, 0.1, 0, 0.25, 0.52, 'metal', { ...NC, tint: 0x1a1210 });
  fp.box(1.4, 0.55, 0.05, 0, 0.3, 0.57, 'lampGlass', NC);
  fp.box(4.0, 0.18, 1.3, 0, 2.4, 0.05, 'stone', { tint: 0x8a7e70 });
  fp.box(1.6, r.h - 2.6, 1.0, 0, 2.58, -0.1, 'stone', { tint: 0x9a8070 });
  food(fp, 'mug', -1.4, 2.6, 0.4); food(fp, 'wine-red', 1.3, 2.6, 0.4);
  light(W, R, -1.0, 0.9, -d2 + 1.5, 0xff8a3a, 10, 13);
  prop(R, 'furniture/rugRound', -1.0, 0.01, -d2 + 2.6, { s: 3.6, collide: false, tint: 0xb07058 });
  for (const s of [-1, 1]) prop(R, 'furniture/chairCushion', -1.0 + s * 1.5, 0, -d2 + 2.4, { s: 2.3, ry: Math.PI + s * 0.5 });
  // round tables with stools
  const tables = [[0.6, 1.6], [4.0, 2.2], [-1.4, -2.0], [2.6, -2.6], [-2.2, 4.6]];
  tables.forEach(([tx, tz], i) => {
    const T = R.sub(tx, 0, tz);
    T.cyl(0.75, 0.08, 0, 0.76, 0, 'plank', { seg: 12, tint: 0x8a6440 });
    T.cyl(0.1, 0.76, 0, 0, 0, 'timber', { seg: 8, tint: 0x4a3020 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      T.cyl(0.24, 0.45, Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15, 'wood', { seg: 8, tint: 0x7a5432 });
    }
    tableware(T, 0, 0.84, 0, rng, 'tavern');
    const sx = Math.cos(i) * 1.15, sz = Math.sin(i) * 1.15;
    W.spot('tavern_table' + i, R.at(tx + sx * 0.92, 0, tz + sz * 0.92), Math.atan2(-sx, -sz));
  });
  // the bard's stage in the front-right corner
  R.box(3.0, 0.3, 2.4, w2 - 1.6, 0, d2 - 1.6, 'plank', { tint: 0x7a5432 });
  if (has(R, 'props/Banner_1')) prop(R, 'props/Banner_1', w2 - 0.12, 1.4, d2 - 1.6, { s: 1.0, collide: false, castShadow: false, ry: -Math.PI / 2, tint: 0xa83a3a });
  W.spot('tavern_stage', R.at(w2 - 1.6, 0.3, d2 - 1.6), -Math.PI * 0.75);
  // the guest room for the night (back-right): partitions, a doorway, a bed, a nightstand, a chest, a candle
  const gx0 = w2 - 4.2, gz1 = -d2 + 4.2;
  R.box(0.16, r.h, 4.2, gx0, 0, -d2 + 2.1, 'plaster', { tint: 0xe2cfa8 });
  R.box(1.2, r.h, 0.16, gx0 + 0.6, 0, gz1, 'plaster', { tint: 0xe2cfa8 });
  R.box(1.6, r.h, 0.16, w2 - 0.8, 0, gz1, 'plaster', { tint: 0xe2cfa8 });
  R.box(1.4, r.h - 2.5, 0.16, gx0 + 1.9, 2.5, gz1, 'plaster', { tint: 0xe2cfa8 });
  R.box(1.5, 0.14, 0.2, gx0 + 1.9, 2.4, gz1, 'timber', { tint: 0x4a3020 });
  R.box(1.0, 0.3, 0.04, gx0 + 1.9, 2.75, gz1 + 0.1, 'wood', { ...NC, tint: 0x8a6a40 }); // «Комнаты»
  if (has(R, 'props/Bed_Twin1')) prop(R, 'props/Bed_Twin1', w2 - 1.0, 0, -d2 + 1.4, { s: 1.0, ry: 0 });
  else prop(R, 'furniture/bedSingle', w2 - 1.0, 0, -d2 + 1.4, { s: 2.3 });
  if (has(R, 'props/Nightstand_Shelf')) prop(R, 'props/Nightstand_Shelf', w2 - 2.3, 0, -d2 + 0.5, { s: 1.0 });
  if (has(R, 'props/Chest_Wood')) prop(R, 'props/Chest_Wood', gx0 + 0.7, 0, -d2 + 0.8, { s: 0.85, ry: Math.PI / 2 });
  if (has(R, 'props/CandleStick')) prop(R, 'props/CandleStick', w2 - 2.3, 0.75, -d2 + 0.5, { s: 1, collide: false, castShadow: false });
  windowOn(R, r, 'r', -d2 + 2.4, 0.9, 1.2, 1.3);
  light(W, R, w2 - 2.2, 1.6, -d2 + 1.2, 0xffb060, 4, 6);
  // light: two iron rings over the tables
  chandelier(W, R, 0.6, 0.2, r.h);
  chandelier(W, R, 2.6, 4.2, r.h, 0xffb860);
  wallTorch(W, R, -w2 + 0.15, 2.3, 2.2, Math.PI / 2);
}

// -----------------------------------------------------------------------------------------
// The temple of Eris: a nave with columns and pews, stained windows, the altar dais with the healing crystal and the goddess.
// -----------------------------------------------------------------------------------------
function temple(W, R, r) {
  const w2 = r.w / 2, d2 = r.d / 2, h = r.h;
  // stained windows between the columns
  const glass = [0x9fd0ff, 0xffe08a, 0xb8f0d0, 0xffc8e0];
  for (let i = 0; i < 4; i++) for (const side of ['l', 'r']) windowOn(R, r, side, -6 + i * 4, 1.0, 3.2, 2.0, glass[(i + (side === 'l' ? 0 : 2)) % 4]);
  windowOn(R, r, 'b', 0, 1.4, 2.6, 4.4, 0xfff0c0); // over the altar
  // columns along the nave
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const z = -8 + i * 4;
    R.cyl(0.36, h - 0.6, s * (w2 - 1.4), 0, z, 'stone', { seg: 12, tint: 0xe8e2d8 });
    R.box(0.95, 0.3, 0.95, s * (w2 - 1.4), 0, z, 'stone', { tint: 0xd8d0c4 });
    R.box(0.95, 0.3, 0.95, s * (w2 - 1.4), h - 0.6, z, 'stone', { tint: 0xd8d0c4 });
  }
  // pews and the aisle runner
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const z = 7 - i * 2.0, x = s * 2.7;
    R.box(3.2, 0.45, 0.55, x, 0, z, 'plank', { tint: 0x8a6440 });
    R.box(3.2, 0.5, 0.08, x, 0.45, z + 0.28, 'plank', { tint: 0x7a5434, collide: false });
  }
  R.box(1.6, 0.02, r.d - 6, 0, 0.01, 1.5, 'cloth', { ...NC, tint: 0x8a2a3a });
  // the dais, the altar, the crystal, the goddess
  R.box(7, 0.4, 3.4, 0, 0, -d2 + 1.9, 'stone', { tint: 0xe8e2d8 });
  R.box(7.6, 0.2, 0.3, 0, 0, -d2 + 3.75, 'stone', { tint: 0xd0c8bc }); // the step
  R.box(3.0, 0.95, 1.1, 0, 0.4, -d2 + 2.4, 'stone', { tint: 0xf4efe6 });
  R.box(3.3, 0.08, 1.3, 0, 1.35, -d2 + 2.4, 'cloth', { ...NC, tint: 0x3a6a8a });
  for (const sx of [-1.2, 1.2]) prop(R, 'graveyard/candle-multiple', sx, 1.43, -d2 + 2.4, { s: 1.1, collide: false });
  W.addInteractable(new HealingCrystal(R.at(2.6, 0.4, -d2 + 2.2)));
  const G = R.sub(0, 0.4, -d2 + 0.75);
  G.box(1.4, 1.0, 1.0, 0, 0, 0, 'stone', { tint: 0xd8d0c4 });
  G.cone(0.75, 2.6, 0, 1.0, 0, 'stone', { seg: 12, tint: 0xf4f0ea });
  G.sphere(0.32, 0, 3.75, 0, 'stone', { tint: 0xf4f0ea });
  G.cyl(0.55, 0.05, 0, 4.15, -0.05, 'metal', { ...NC, seg: 16, rx: -0.3, tint: 0xf0d080 }); // the halo
  for (const s of [-1, 1]) G.box(0.14, 1.2, 0.14, s * 0.55, 2.2, 0.15, 'stone', { ...NC, tint: 0xf4f0ea, rz: s * 0.7 });
  W.spot('temple_altar', R.at(0, 0.4, -d2 + 3.3), 0);
  for (const s of [-1, 1]) for (const z of [-d2 + 1.2, -d2 + 3.2]) prop(R, 'graveyard/urn-round', s * 3.0, 0.4, z, { s: 1.4 });
  // C00: the door of the service room (the stairs down), banners of Eris
  R.box(1.3, 2.4, 0.1, w2 - 0.06, 0, -d2 + 5.0, 'door', { ...NC, tint: 0x5a3a22, ry: Math.PI / 2 });
  W.addInteractable(new QuestProp({ id: 'temple_room', name: 'Служебная комната', prompt: 'Проверить, не остался ли кто внизу', position: R.at(w2 - 0.6, 1.0, -d2 + 5.0), shape: 'none' }));
  for (const s of [-1, 1]) R.box(1.0, 3.2, 0.06, s * 3.6, 3.2, -d2 + 0.05, 'cloth', { ...NC, tint: 0x3a6a8a });
  // candle stands along the walls, two lights over the nave, the crystal's glow
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    if (has(R, 'props/CandleStick_Stand')) prop(R, 'props/CandleStick_Stand', s * (w2 - 0.6), 0, 6 - i * 6, { s: 1.0, collide: false });
    else prop(R, 'graveyard/candle', s * (w2 - 0.6), 0, 6 - i * 6, { s: 1.6, collide: false });
  }
  light(W, R, 0, 2.2, -d2 + 2.2, 0x9ff0ff, 7, 12, false);
  chandelier(W, R, 0, 4, h, 0xffd8a0);
  chandelier(W, R, 0, -4, h, 0xffd8a0);
  light(W, R, -(w2 - 0.6), 1.6, 0, 0xffc070, 3, 7);
  light(W, R, w2 - 0.6, 1.6, 0, 0xffc070, 3, 7);
}

// -----------------------------------------------------------------------------------------
// Shops: the furnishing of Interiors.js (its frame: floor top at FY, inner walls at ±(w/2 − 0.4)) + windows, a shop sign, lights.
// -----------------------------------------------------------------------------------------
function shop(furnish) {
  return (W, R, r) => {
    const F = new Frame(W, r.x, -FY, r.z, 0);
    const pts = furnish(F, r.w + 0.8, r.d + 0.8, rnd(r.x)) || {};
    const prefix = r.prefix || r.id;
    const at = (p) => R.at(p[0], 0, p[1]);
    if (pts.counter) W.spot(prefix + '_counter', at(pts.counter), 0);
    if (pts.front) W.spot(prefix + '_front', at(pts.front), Math.PI);
    if (pts.desk) W.spot(r.id + '_desk', at(pts.desk), 0);
    // windows on the front wall right of the door, one on the right wall
    windowOn(R, r, 'f', r.w / 2 - 1.6);
    if (r.w > 9) windowOn(R, r, 'f', r.door + 2.8, 0.9);
    windowOn(R, r, 'r', 0.8, 0.9);
    // a lantern by the door
    wallTorch(W, R, r.door + 1.3, 2.2, r.d / 2 - 0.12, Math.PI);
  };
}

function rnd(seed) {
  let s = (Math.abs(Math.floor(seed)) * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
