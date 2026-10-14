import { prop, food, barrel, crate, lantern } from './Kit.js';

/**
 * Furnishing of the walk-in buildings of Axel (stage 4). Interiors are built in place inside the
 * houses (`house({ interior: true, entrance: 'arch' })`): the same walls, a plank floor, a ceiling
 * under the upper storey; the player and the NPCs walk in through the archway. No separate scenes.
 *
 * Every function gets the house frame F (origin = centre of the footprint on the ground, front =
 * local +z, the floor top at FY) and the footprint w × d; the inner wall faces are at
 * ±(w/2 − 0.4), ±(d/2 − 0.4). They return the local points the NPCs use.
 * Kit models: Kenney furniture / survival / food / graveyard, Quaternius village + Fantasy Props
 * (swords, shields, anvil, cauldron, potions, chandelier, banners; every use falls back to the
 * simple modelled shape when the 'props' kit is missing). The oven is a modelled shape.
 */
export const FY = 0.39; // floor top inside (plinth 0.35 + plank 0.04)
const NC = { collide: false, castShadow: false };
const D = { collide: false, castShadow: false, detail: true }; // tiny things: distance-culled

const hasKit = (F, name) => F.w.kits.has(name);

function light(F, lx, ly, lz, color = 0xffc070, intensity = 6, distance = 11) {
  F.w.addLightSource(F.at(lx, ly, lz), { color, intensity, distance, always: true, flicker: true });
}

/** Iron ring chandelier with candles + its light. */
function chandelier(F, lx, lz, ceil, color = 0xffc070) {
  if (hasKit(F, 'props/Chandelier')) {
    prop(F, 'props/Chandelier', lx, ceil - 1.5, lz, { s: 1, collide: false, castShadow: false });
    light(F, lx, ceil - 1.1, lz, color, 7, 12);
    return;
  }
  F.cyl(0.7, 0.06, lx, ceil - 0.9, lz, 'metal', { ...NC, seg: 12 });
  F.box(0.03, 0.9, 0.03, lx, ceil - 0.9, lz, 'metal', NC);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    F.cyl(0.04, 0.16, lx + Math.cos(a) * 0.65, ceil - 0.84, lz + Math.sin(a) * 0.65, 'bone', { ...D, seg: 6 });
  }
  light(F, lx, ceil - 1.1, lz, color, 7, 12);
}

/** Shop counter: a wooden box with a plank top, `len` long along local x. */
function counter(F, lx, lz, len, opts = {}) {
  F.box(len, 1.0, 0.7, lx, FY, lz, 'wood', { tint: opts.tint ?? 0x7a5232 });
  F.box(len + 0.1, 0.08, 0.85, lx, FY + 1.0, lz, 'plank', { castShadow: false });
}

/** Wall shelves (uprights + `levels` boards) along local x at depth lz; items(x, y) fills them. */
function shelves(F, lx, lz, len, levels, items) {
  for (const s of [-1, 1]) F.box(0.08, 0.5 + levels * 0.62, 0.42, lx + (s * len) / 2, FY, lz, 'timber', { tint: 0x4a3222 });
  for (let k = 0; k < levels; k++) {
    const y = FY + 0.4 + k * 0.62;
    F.box(len, 0.06, 0.42, lx, y, lz, 'plank', { castShadow: false });
    if (items) for (let i = 0; i < Math.round(len / 0.45); i++) items(lx - len / 2 + 0.25 + i * 0.45, y + 0.06, lz, k, i);
  }
}

/** A sword hung on the wall (blade, guard, grip), lx/lz on the wall face, `ry` turns it. */
function sword(F, lx, ly, lz, ry, len = 1.0) {
  if (hasKit(F, 'props/Sword_Bronze')) return prop(F, 'props/Sword_Bronze', lx, ly - 0.1, lz, { s: len / 1.0, ry, collide: false, castShadow: false });
  const S = F.sub(lx, ly, lz, ry);
  S.box(0.07, len, 0.015, 0, 0.32, 0, 'metal', D);
  S.box(0.32, 0.05, 0.05, 0, 0.28, 0, 'metal', { ...D, tint: 0x8a7040 });
  S.box(0.045, 0.26, 0.045, 0, 0, 0, 'wood', { ...D, tint: 0x4a3020 });
}

/** Round shield on a wall (faces local +z of `ry`). */
function shield(F, lx, ly, lz, ry, tint) {
  if (hasKit(F, 'props/Shield_Wooden')) return prop(F, 'props/Shield_Wooden', lx, ly - 0.4, lz, { s: 1.4, ry, collide: false, castShadow: false });
  const S = F.sub(lx, ly, lz, ry);
  S.cyl(0.45, 0.06, 0, 0, 0, 'wood', { ...NC, seg: 12, rx: Math.PI / 2, tint });
  S.cyl(0.12, 0.08, 0, 0, 0.02, 'metal', { ...D, seg: 8, rx: Math.PI / 2 });
}

/** Armour stand: a post, a breastplate and a helmet. */
function armourStand(F, lx, lz, ry) {
  const S = F.sub(lx, FY, lz, ry);
  S.cyl(0.25, 0.06, 0, 0, 0, 'wood', { seg: 8, tint: 0x4a3020 });
  S.box(0.08, 1.3, 0.08, 0, 0, 0, 'wood', { tint: 0x4a3020 });
  S.box(0.55, 0.7, 0.32, 0, 0.75, 0, 'metal', { tint: 0x9aa0a8 });
  S.box(0.75, 0.16, 0.36, 0, 1.38, 0, 'metal', { ...NC, tint: 0x8a9098 });
  S.sphere(0.2, 0, 1.68, 0, 'metal', { ...NC, tint: 0x9aa0a8, sy: 1.15 });
}

// -----------------------------------------------------------------------------------------
/** Rolf's weapon shop: counter on the right, racks of blades on the back wall, shields, armour. */
export function weaponShop(F, w, d, rng) {
  const bw = w / 2 - 0.4, bd = d / 2 - 0.4;
  counter(F, 1.7, 0, 4.4, { tint: 0x6a4428 });
  // Back wall: a board with eight blades and two crossed spears.
  F.box(w - 1.4, 1.8, 0.08, 0, FY + 0.7, -bd + 0.04, 'wood', { tint: 0x5a3a22 });
  for (let i = 0; i < 8; i++) sword(F, -bw + 1.1 + i * ((w - 2.4) / 7), FY + 1.1, -bd + 0.12, 0, 0.8 + (i % 3) * 0.15);
  // Left wall: shields; a barrel of spears; armour stands in the back-left corner.
  for (let i = 0; i < 3; i++) shield(F, -bw + 0.06, FY + 1.7, -1.6 + i * 1.3, Math.PI / 2, [0xa82a2a, 0x2f5a8a, 0x8a6a3a][i]);
  barrel(F.w, F.sub(-bw + 0.5, FY, -0.2), 0, 0);
  for (let i = 0; i < 4; i++) F.box(0.05, 2.0, 0.05, -bw + 0.4 + (i % 2) * 0.2, FY + 0.3, -0.3 + Math.floor(i / 2) * 0.2, 'wood', { ...D, tint: 0x6a4a30, rz: (i - 1.5) * 0.06 });
  armourStand(F, -bw + 0.7, -bd + 0.8, 0.5);
  armourStand(F, bw - 0.7, -bd + 0.8, -0.4);
  // Grindstone behind the counter, a display table by the window with daggers.
  if (hasKit(F, 'props/Whetstone')) prop(F, 'props/Whetstone', bw - 1.6, FY, -bd + 0.8, { s: 1.0 });
  else prop(F, 'survival/workbench-grind', bw - 1.6, FY, -bd + 0.7, { s: 2.4 });
  prop(F, 'furniture/sideTable', bw - 0.6, FY, bd - 0.8, { s: 2.3 });
  for (let i = 0; i < 3; i++) F.box(0.06, 0.02, 0.4, bw - 0.85 + i * 0.22, FY + 0.72, bd - 0.8, 'metal', D);
  chandelier(F, 0, 0, FY + 3.0);
  return { counter: [1.7, -1.2], front: [1.7, 1.3] };
}

/** Wiss's alchemy shop: counter, bottle shelves, a bubbling cauldron, an alembic table, herbs. */
export function alchemyShop(F, w, d, rng) {
  const bw = w / 2 - 0.4, bd = d / 2 - 0.4;
  counter(F, 1.4, 0.6, 3.6, { tint: 0x5a4060 });
  for (let i = 0; i < 6; i++) F.cyl(0.08, 0.26, 0.1 + i * 0.5, FY + 1.08, 0.6, 'glass', { ...D, seg: 8, tint: [0xe04050, 0x4080f0, 0x50d080][i % 3] });
  shelves(F, 0.6, -bd + 0.25, w - 2.6, 4, (x, y, z, k, i) => {
    if ((i + k) % 3 === 2) return;
    const pk = ['props/Potion_1', 'props/Potion_2', 'props/Potion_4', 'props/Bottle_1'][(i + k * 2) % 4];
    if (hasKit(F, pk)) prop(F, pk, x, y, z, { s: 1.15, collide: false, ry: i });
    else prop(F, (i + k) % 2 ? 'survival/bottle' : 'survival/bottle-large', x, y, z, { s: 1.3, collide: false });
  });
  // Cauldron on a stone ring, green brew, glow.
  const C = F.sub(-bw + 1.3, FY, -bd + 1.4);
  C.cyl(0.75, 0.25, 0, 0, 0, 'stone', { seg: 10, tint: 0x8a8278 });
  if (hasKit(F, 'props/Cauldron')) {
    prop(F, 'props/Cauldron', -bw + 1.3, FY + 0.25, -bd + 1.4, { s: 1.15 });
    C.cyl(0.36, 0.03, 0, 0.98, 0, 'crystal', { ...NC, seg: 12 });
  } else {
    C.cyl(0.6, 0.7, 0, 0.25, 0, 'metal', { seg: 12, tint: 0x2a2626 });
    C.cyl(0.52, 0.04, 0, 0.92, 0, 'crystal', { ...NC, seg: 12 });
  }
  F.w.addLightSource(C.at(0, 1.3, 0), { color: 0x60ff90, intensity: 4, distance: 7, always: true, flicker: true });
  // Alembic table: flasks and coils.
  prop(F, 'furniture/table', bw - 1.0, FY, -bd + 1.0, { s: 2.3 });
  for (let i = 0; i < 4; i++) F.sphere(0.13, bw - 1.5 + i * 0.32, FY + 0.95, -bd + 1.0 + (i % 2) * 0.2, 'glass', { ...D, tint: [0xc080ff, 0x60d0ff, 0xffa040, 0x80ff80][i] });
  F.cyl(0.03, 0.5, bw - 0.6, FY + 0.8, -bd + 0.9, 'metal', { ...D, seg: 6, rz: 0.6 });
  // Bookcase by the door, herbs drying under the ceiling.
  prop(F, 'furniture/bookcaseOpen', -bw + 0.35, FY, 0.2, { s: 2.3, ry: Math.PI / 2 });
  for (let i = 0; i < 6; i++) F.box(0.18, 0.5, 0.14, -2 + i * 0.8, FY + 2.15, -0.8 + (i % 2) * 0.5, 'cloth', { ...D, tint: [0x5a7a3a, 0x7a6a3a, 0x4a6a4a][i % 3] });
  prop(F, 'furniture/pottedPlant', bw - 0.5, FY, bd - 0.6, { s: 2.3 }); // the door is on the left: keep it clear
  light(F, 0, FY + 2.4, 0.2, 0xd0a0ff, 5, 10);
  return { counter: [1.4, -0.6], front: [1.4, 1.9] };
}

/** Otto's general store: counter, shelves of goods, barrels, crates and sacks, hams on hooks. */
export function generalStore(F, w, d, rng) {
  const bw = w / 2 - 0.4, bd = d / 2 - 0.4;
  counter(F, 1.9, 0.4, 3.8);
  const GOODS = ['cheese', 'honey', 'apple', 'carrot', 'cabbage', 'fish', 'sausage', 'wine-red', 'onion', 'loaf', 'bag', 'pumpkin'];
  shelves(F, 0.8, -bd + 0.25, w - 2.4, 3, (x, y, z, k, i) => food(F, GOODS[(i * 3 + k) % GOODS.length], x, y, z, { ry: rng() * 6 }));
  for (const name of ['cheese', 'apple', 'bread']) if (F.w.kits.has('food/' + name)) food(F, name, 1.0 + ['cheese', 'apple', 'bread'].indexOf(name) * 0.9, FY + 1.08, 0.4);
  // Stock along the left wall.
  for (let i = 0; i < 2; i++) barrel(F.w, F.sub(-bw + 0.5, FY, -bd + 0.6 + i * 0.9), 0, 0);
  for (let i = 0; i < 3; i++) crate(F.w, F.sub(-bw + 0.5, FY, -0.4 + i * 0.8), 0, 0, 0.7, i * 0.4);
  crate(F.w, F.sub(-bw + 0.5, FY + 0.7, 0.0), 0, 0, 0.6, 0.2);
  for (let i = 0; i < 3; i++) food(F, 'bag', -bw + 1.3, FY, -bd + 0.7 + i * 0.6, { s: 2.2, ry: i });
  // Hams and sausages hanging from the beam.
  for (let i = 0; i < 4; i++) {
    F.box(0.02, 0.4, 0.02, -1 + i * 0.7, FY + 2.3, -0.6, 'log', D);
    food(F, i % 2 ? 'whole-ham' : 'sausage', -1 + i * 0.7, FY + 1.95, -0.6, { s: 1.4 });
  }
  prop(F, 'furniture/coatRackStanding', bw - 0.4, FY, bd - 0.5, { s: 2.3 });
  chandelier(F, 0.5, 0, FY + 3.0);
  return { counter: [1.9, -0.6], front: [1.9, 1.8] };
}

/** Lina's bakery: a brick oven with fire, a counter of bread, a kneading table, flour sacks. */
export function bakeryShop(F, w, d, rng) {
  const bw = w / 2 - 0.4, bd = d / 2 - 0.4;
  counter(F, 1.9, 0.4, 3.8, { tint: 0x8a6440 });
  const BREAD = ['loaf', 'loaf-round', 'loaf-baguette', 'bread', 'croissant', 'pie'];
  for (let i = 0; i < 6; i++) food(F, BREAD[i], 0.4 + i * 0.6, FY + 1.08, 0.4, { ry: rng() * 6 });
  // Oven in the back-left corner: brick body, dark mouth, fire glow.
  const O = F.sub(-bw + 1.2, FY, -bd + 0.85);
  O.box(2.2, 1.6, 1.5, 0, 0, 0, 'stone', { tint: 0xa0644a });
  O.cyl(1.0, 0.6, 0, 1.6, 0, 'stone', { seg: 10, tint: 0xa0644a, sz: 0.65 });
  O.box(0.8, 0.55, 0.06, 0, 0.55, 0.76, 'metal', { ...NC, tint: 0x1a1010 });
  O.box(0.6, 0.25, 0.04, 0, 0.6, 0.79, 'lampGlass', NC);
  F.w.addLightSource(O.at(0, 0.8, 1.0), { color: 0xff8a3a, intensity: 6, distance: 8, always: true, flicker: true });
  // Bread shelves on the back wall, kneading table, flour sacks.
  shelves(F, 1.6, -bd + 0.25, 3.8, 3, (x, y, z, k, i) => food(F, BREAD[(i + k * 2) % BREAD.length], x, y, z, { ry: rng() * 6 }));
  // Kneading table on the left (1.5 m left free between it and the counter: the way behind it).
  prop(F, 'furniture/table', -2.4, FY, -0.4, { s: 2.3 });
  F.sphere(0.25, -2.4, FY + 0.86, -0.4, 'hay', { ...D, sy: 0.5, tint: 0xf0e2c0 });
  prop(F, 'food/cutting-board', -2.1, FY + 0.78, -0.2, { s: 0.42, collide: false });
  for (let i = 0; i < 2; i++) food(F, 'bag', -1.1, FY, -bd + 0.4 + i * 0.55, { s: 2.4, ry: i });
  chandelier(F, 0.6, 0.2, FY + 3.0);
  return { counter: [1.9, -0.6], front: [1.9, 1.8] };
}

/** Garret's forge: open front, furnace and bellows at the back, anvil, quench trough, tools. */
export function forgeShop(F, w, d, rng) {
  const bw = w / 2 - 0.4, bd = d / 2 - 0.4;
  // Furnace (the tall chimney is part of the building) with a glowing mouth and bellows.
  const K = F.sub(bw - 1.6, FY, -bd + 1.0);
  K.box(2.6, 1.7, 1.8, 0, 0, 0, 'stone', { tint: 0x8a7e70 });
  K.box(1.2, 0.5, 0.06, 0, 0.75, 0.92, 'lampGlass', NC);
  F.w.addLightSource(K.at(0, 1.0, 1.3), { color: 0xff7a2a, intensity: 8, distance: 10, always: true, flicker: true });
  F.w.forgeFire = K.at(0, 1.1, 0.8);
  const Bl = F.sub(bw - 3.4, FY, -bd + 0.9);
  Bl.box(1.0, 0.5, 0.7, 0, 0.3, 0, 'fabric', { tint: 0x5a3a26 });
  Bl.box(1.1, 0.06, 0.8, 0, 0.82, 0, 'wood', { tint: 0x6a4428 });
  // Coal heap by the furnace.
  for (let i = 0; i < 7; i++) F.sphere(0.22, bw - 0.5 - (i % 3) * 0.3, FY + 0.12 + Math.floor(i / 3) * 0.18, -bd + 2.4 + (i % 2) * 0.2, 'rockDark', { ...D, tint: 0x2a2624 });
  // Anvil in the middle, quench trough, grindstone, workbench and tool rack on the left wall.
  if (hasKit(F, 'props/Anvil_Log')) prop(F, 'props/Anvil_Log', 0.4, FY, 0.6, { s: 1.15, ry: Math.PI / 2 });
  else prop(F, 'survival/workbench-anvil', 0.4, FY, 0.6, { s: 2.6, ry: Math.PI / 2 });
  F.box(1.6, 0.6, 0.7, bw - 1.0, FY, 1.0, 'wood', { tint: 0x5a4a3a });
  F.box(1.4, 0.05, 0.5, bw - 1.0, FY + 0.55, 1.0, 'water', NC);
  if (hasKit(F, 'props/Whetstone')) prop(F, 'props/Whetstone', -bw + 1.0, FY, 1.6, { s: 1.0, ry: Math.PI / 2 });
  else prop(F, 'survival/workbench-grind', -bw + 1.0, FY, 1.6, { s: 2.4, ry: Math.PI / 2 });
  if (hasKit(F, 'props/Workbench')) prop(F, 'props/Workbench', -bw + 1.2, FY, -bd + 0.85, { s: 1.25 });
  else prop(F, 'survival/workbench', -bw + 1.2, FY, -bd + 0.8, { s: 2.6 });
  F.box(2.4, 0.08, 0.1, -bw + 1.5, FY + 1.8, -bd + 0.06, 'wood', { ...NC, tint: 0x4a3020 });
  const TOOLS = { 'tool-pickaxe': ['props/Pickaxe_Bronze', 1.0, 0.7], 'tool-axe': ['props/Axe_Bronze', 1.1, 1.0] };
  for (const [t, x] of [['tool-hammer', -0.5], ['tool-pickaxe', 0.2], ['tool-axe', 0.9], ['tool-shovel', 1.6]]) {
    const alt = TOOLS[t];
    if (alt && hasKit(F, alt[0])) prop(F, alt[0], -bw + 0.4 + x, FY + alt[2] + 0.5, -bd + 0.12, { s: alt[1], collide: false, castShadow: false });
    else prop(F, 'survival/' + t, -bw + 0.4 + x, FY + 1.0, -bd + 0.12, { s: 2.2, collide: false, ry: Math.PI / 2 });
  }
  // Finished blades on the left wall, a barrel of iron bars.
  for (let i = 0; i < 4; i++) sword(F, -bw + 0.12, FY + 1.1, -0.6 + i * 0.5, Math.PI / 2, 0.85);
  barrel(F.w, F.sub(-bw + 0.6, FY, -1.6), 0, 0);
  for (let i = 0; i < 3; i++) F.box(0.06, 1.2, 0.06, -bw + 0.6 + (i - 1) * 0.12, FY + 0.6, -1.6, 'metal', { ...D, tint: 0x6a6460 });
  // KayKit ResourceBits: ingots, nuggets and a bar on the bench.
  if (hasKit(F, 'bits/Iron_Bars_Stack_Small')) {
    prop(F, 'bits/Iron_Bars_Stack_Small', -bw + 0.75, FY, -bd + 2.5, { s: 0.7 });
    prop(F, 'bits/Iron_Nuggets', bw - 3.4, FY, -bd + 2.5, { s: 0.55, collide: false, ry: 0.5 });
    prop(F, 'bits/Copper_Bar', -bw + 1.2, FY + 1.11, -bd + 0.85, { s: 0.55, collide: false, castShadow: false, ry: 0.4 });
  }
  return { anvil: [0.4, -0.5], counter: [-1.5, 2.2] };
}

/** Marta's caravan office: a desk with ledgers, a route map on the wall, a strongbox, a waiting bench. */
export function caravanOffice(F, w, d, rng) {
  const bw = w / 2 - 0.4, bd = d / 2 - 0.4;
  prop(F, 'furniture/table', 1.8, FY, -1.0, { s: 2.6 });
  prop(F, 'furniture/chairCushion', 1.8, FY, -2.0, { s: 2.3, collide: false, ry: Math.PI }); // Marta sits here
  prop(F, 'furniture/books', 1.3, FY + 0.82, -1.0, { s: 2.0, collide: false });
  prop(F, 'furniture/lampRoundTable', 2.4, FY + 0.82, -1.1, { s: 2.0, collide: false });
  for (let i = 0; i < 3; i++) F.box(0.32, 0.01, 0.42, 1.6 + i * 0.12, FY + 0.83 + i * 0.006, -0.9, 'plaster', { ...D, tint: 0xf2ead8, ry: i * 0.2 });
  // Route map of the valley on the back wall.
  F.box(3.2, 2.0, 0.05, 0.2, FY + 0.9, -bd + 0.03, 'plaster', { ...NC, tint: 0xe8d8b0 });
  for (const [x, y, l, a] of [[-0.6, 1.9, 1.6, 0.2], [0.6, 1.6, 1.4, -0.4], [0.9, 2.3, 1.0, 0.9]]) F.box(l, 0.05, 0.02, 0.2 + x, FY + y, -bd + 0.07, 'cloth', { ...D, tint: 0x8a3a2a, rz: a });
  F.box(0.6, 0.4, 0.02, 0.2 + 1.2, FY + 1.3, -bd + 0.07, 'cloth', { ...D, tint: 0x4a7aa8 });
  if (hasKit(F, 'props/Chest_Wood')) prop(F, 'props/Chest_Wood', bw - 0.9, FY, -bd + 0.6, { s: 0.9 });
  else prop(F, 'survival/chest', bw - 0.7, FY, -bd + 0.6, { s: 2.2 });
  prop(F, 'furniture/bookcaseOpen', -bw + 0.35, FY, -1.0, { s: 2.3, ry: Math.PI / 2 });
  prop(F, 'furniture/books', -bw + 0.4, FY + 1.35, -1.0, { s: 2.0, collide: false, ry: Math.PI / 2 });
  prop(F, 'furniture/bench', bw - 0.6, FY, 1.4, { s: 2.3, ry: -Math.PI / 2 });
  for (let i = 0; i < 2; i++) crate(F.w, F.sub(-bw + 0.6, FY, 1.6 - i * 0.85), 0, 0, 0.75, i * 0.5);
  prop(F, 'furniture/rugRectangle', 0, FY + 0.01, 0.6, { s: 2.6, collide: false, tint: 0xb07058 });
  chandelier(F, 0.4, 0, FY + 3.0);
  return { desk: [1.8, -2.0] };
}

/** Extra furniture for the guild hall (plants, rug, notice papers, coat rack). */
export function guildExtras(F) {
  prop(F, 'furniture/rugRectangle', 0, 0.39, 1.2, { s: 4.2, collide: false, tint: 0x8a6a9a });
  for (const sx of [-1, 1]) prop(F, 'furniture/pottedPlant', sx * 7.9, 0.39, 5.3, { s: 2.3 });
  prop(F, 'furniture/coatRackStanding', -2.4, 0.39, 5.6, { s: 2.3 });
  for (const sx of [-1, 1]) {
    if (hasKit(F, 'props/Banner_2')) prop(F, 'props/Banner_2', sx * 2.6, 3.0, -5.9, { s: 1.15, collide: false, castShadow: false, tint: 0x4a78b8 });
    else F.box(1.2, 2.4, 0.06, sx * 2.6, 3.2, -6.05, 'cloth', { ...NC, tint: 0x2f5a8a });
  }
}

/** Extra furniture for the tavern (bar stools, a rug by the fire, hams over the bar). */
export function tavernExtras(F) {
  for (let i = 0; i < 4; i++) {
    if (hasKit(F, 'props/Stool')) prop(F, 'props/Stool', -5.0, 0.35, -4.2 + i * 1.3, { s: 1.3, ry: i * 0.7 });
    else prop(F, 'furniture/stoolBar', -5.0, 0.35, -4.2 + i * 1.3, { s: 2.3 });
  }
  prop(F, 'furniture/rugRound', 3.0, 0.36, -3.6, { s: 3.6, collide: false, tint: 0xb07058 });
  for (let i = 0; i < 3; i++) {
    F.box(0.02, 0.4, 0.02, -6.4, 3.4, -3.8 + i * 1.6, 'log', D);
    food(F, i % 2 ? 'sausage' : 'whole-ham', -6.4, 3.05, -3.8 + i * 1.6, { s: 1.4 });
  }
  lantern(F.w, F.sub(-7.4, 2.4, 1.8));
}

/** Extra furniture for the temple (aisle runner, candle stands, banners of Eris). */
export function templeExtras(F, w, d) {
  F.box(1.6, 0.02, d - 5, 0, 0.36, 0.6, 'cloth', { ...NC, tint: 0x8a2a3a });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      if (hasKit(F, 'props/CandleStick_Stand')) prop(F, 'props/CandleStick_Stand', sx * (w / 2 - 0.8), 0.35, d / 2 - 4 - i * 5, { s: 1.0, collide: false });
      else prop(F, 'graveyard/candle', sx * (w / 2 - 0.8), 0.35, d / 2 - 4 - i * 5, { s: 1.6, collide: false });
    }
    F.box(1.0, 3.0, 0.06, sx * 3.2, 3.0, -d / 2 + 0.45, 'cloth', { ...NC, tint: 0x3a6a8a });
  }
}
