import { mulberry32 } from '../../core/math.js';
import { prop, tableware } from './Kit.js';
import { keyBuilding } from './AinstreyBuildings.js';
import { QuestProp } from '../Interactables.js';

/**
 * The walk-in halls of the capital (version 2.0): the guild of Ainstrey (Selia), the inn «Двор Тавии», the city archive (Ilar), the
 * main hall of the academy (Mirena), the port office (Varlen). Built in place inside the key buildings of the plan: the ground
 * storey is hollow (a wide doorway, a plank floor, a ceiling), the storeys above are solid. Furniture is near-only
 * (world.lodMode 'near'): no interiors are loaded for the far city. Each hall returns the local points of its people and props,
 * registered as world spots; every light has a visible emitter (a chandelier, a hearth, a lamp on a table).
 * G = the frame of the floor (y = 0 is the floor top), local +z = the front (the doorway side).
 */
const NC = { collide: false, castShadow: false };
const D = { collide: false, castShadow: false, detail: true };
const has = (G, name) => G.w.kits.has(name);
const P = (G, name, lx, ly, lz, o = {}) => { if (has(G, name)) prop(G, name, lx, ly, lz, o); };

function light(G, lx, ly, lz, color = 0xffc070, intensity = 6, distance = 13) {
  G.w.addLightSource(G.at(lx, ly, lz), { color, intensity, distance, always: true, flicker: true });
}
/** Iron ring chandelier with candles and its light (the emitter of the hall). */
function chandelier(G, lx, lz, ceil, color = 0xffc070) {
  if (has(G, 'props/Chandelier')) prop(G, 'props/Chandelier', lx, ceil - 1.5, lz, { s: 1.15, collide: false, castShadow: false });
  else {
    G.cyl(0.8, 0.06, lx, ceil - 1.0, lz, 'metal', { ...NC, seg: 12 });
    G.box(0.03, 1.0, 0.03, lx, ceil - 1.0, lz, 'metal', NC);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; G.cyl(0.04, 0.16, lx + Math.cos(a) * 0.75, ceil - 0.94, lz + Math.sin(a) * 0.75, 'bone', { ...D, seg: 6 }); }
  }
  light(G, lx, ceil - 1.4, lz, color, ceil >= 5 ? 34 : 24, 26);
}
function counter(G, lx, lz, len, tint = 0x7a5232) {
  G.box(len, 1.05, 0.8, lx, 0, lz, 'wood', { tint });
  G.box(len + 0.12, 0.09, 1.0, lx, 1.05, lz, 'plank', { castShadow: false });
}
function board(G, lx, ly, lz, w, h, ry = 0, tint = 0xb89a6a) {
  const S = G.sub(lx, ly, lz, ry);
  S.box(w, h, 0.08, 0, 0, 0, 'plank', { ...NC, tint });
  const rng = mulberry32(Math.round(lx * 31 + lz * 17));
  for (let i = 0; i < Math.round(w * 2.2); i++) S.box(0.34, 0.44, 0.012, -w / 2 + 0.3 + (i / Math.round(w * 2.2)) * (w - 0.5), 0.2 + rng() * (h - 0.8), 0.05, 'plaster', { ...D, tint: 0xf2ead8, rz: (rng() - 0.5) * 0.25 });
}
function table(G, lx, lz, n = 2, ry = 0, name = 'furniture/table') {
  P(G, name, lx, 0, lz, { s: 2.6, ry });
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, off = (Math.floor(i / 2) - (n / 4 - 0.5)) * 1.3;
    P(G, 'furniture/chair', lx + (ry ? side * 1.2 : off), 0, lz + (ry ? off : side * 1.2), { s: 2.3, ry: ry ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0, collide: false });
  }
}
function banner(G, lx, ly, lz, ry, tint) {
  if (has(G, 'props/Banner_2')) prop(G, 'props/Banner_2', lx, ly - 0.5, lz, { s: 1.3, ry, collide: false, castShadow: false, tint });
  else G.sub(lx, ly, lz, ry).box(1.2, 2.6, 0.06, 0, 0, 0, 'cloth', { ...NC, tint });
}
/** A wooden wainscot along the inner walls (the doorway is left open) and a dark skirting: the halls are warm, not bare plaster. */
function wainscot(G, w, d, doorW) {
  const bw = w / 2 - 0.62, bd = d / 2 - 0.62, h = 1.35, o = { collide: false, castShadow: false, tint: 0x6a4a30 };
  G.box(w - 1.2, h, 0.1, 0, 0, -bd, 'wood', o);
  for (const sx of [-1, 1]) G.box(0.1, h, d - 1.2, sx * bw, 0, 0, 'wood', o);
  const half = (w - 1.2 - doorW) / 2;
  for (const sx of [-1, 1]) G.box(half, h, 0.1, sx * (doorW / 2 + half / 2), 0, bd, 'wood', o);
  G.box(w - 1.2, 0.12, 0.14, 0, h, -bd, 'timber', { ...o, tint: 0x4a3222 });
  for (const sx of [-1, 1]) G.box(0.14, 0.12, d - 1.2, sx * bw, h, 0, 'timber', { ...o, tint: 0x4a3222 });
}
function column(G, lx, lz, h, r = 0.5) {
  G.cyl(r + 0.12, 0.3, lx, 0, lz, 'stone', { seg: 12, tint: 0xcfc4a8 });
  G.cyl(r, h - 0.6, lx, 0.3, lz, 'stone', { seg: 12, tint: 0xd8ccb0 });
  G.cyl(r + 0.12, 0.3, lx, h - 0.3, lz, 'stone', { ...NC, seg: 12, tint: 0xcfc4a8 });
}

// ---------------------------------------------------------------------------------------------------------------
// the guild of Ainstrey (40 x 26): a long counter at the back, notice boards, tables for the contract-takers
// ---------------------------------------------------------------------------------------------------------------
function guildHall(G, w, d, h) {
  const bw = w / 2 - 0.6, bd = d / 2 - 0.6;
  P(G, 'furniture/rugRectangle', 0, 0.02, 3.0, { s: 6.0, collide: false, tint: 0x8a6a9a });
  counter(G, 0, -6.2, 11, 0x6a4428);
  G.box(11.4, 0.9, 0.5, 0, 0, -8.6, 'wood', { tint: 0x5a3a22 }); // the back desk behind the counter
  for (const sx of [-1, 1]) board(G, sx * 11, 1.2, -bd + 0.1, 5.0, 2.4);
  board(G, 0, 1.6, -bd + 0.1, 6.0, 2.6, 0, 0xa8864e);
  for (const sx of [-1, 1]) { P(G, 'furniture/bookcaseOpen', sx * 5.4, 0, -bd + 0.5, { s: 2.6 }); P(G, 'furniture/bookcaseClosedWide', sx * 8.0, 0, -bd + 0.5, { s: 2.6 }); }
  for (const x of [-12, -8.5]) for (const z of [3, 7]) table(G, x, z, 4);
  for (const sz of [-1, 1]) P(G, 'furniture/bench', bw - 0.6, 0, sz * 4 + 2, { s: 2.4, ry: -Math.PI / 2 });
  P(G, 'furniture/tableCross', 12.5, 0, 6.5, { s: 2.8 });
  for (const [x, z] of [[-6.5, 0], [6.5, 0], [-6.5, 8], [6.5, 8]]) column(G, x, z, h, 0.45);
  for (const [x, y] of [[-16, 3.2], [-8, 3.2], [8, 3.2], [16, 3.2]]) banner(G, x, y, -bd + 0.15, 0, 0x2f5a8a);
  for (const sx of [-1, 1]) P(G, 'furniture/pottedPlant', sx * (bw - 0.6), 0, bd - 0.8, { s: 2.4 });
  P(G, 'furniture/coatRackStanding', -3.4, 0, bd - 0.8, { s: 2.4 });
  for (const [x, z] of [[-12, 4], [12, 4], [0, 4], [-12, -5], [12, -5]]) chandelier(G, x, z, h);
  // the post box of the guild: Lissa's letters
  G.box(0.9, 1.1, 0.5, bw - 1.2, 0, -bd + 0.9, 'wood', { tint: 0x5a4030 });
  G.box(0.6, 0.12, 0.3, bw - 1.2, 1.1, -bd + 0.9, 'metal', NC);
  return { guild_selia: [0, -7.4, 0], guild_board: [-11, -bd + 1.4, 0], guild_lissa: [bw - 2.6, -bd + 1.9, 0] };
}

// ---------------------------------------------------------------------------------------------------------------
// the inn «Двор Тавии» (42 x 26): the bar, tables, the map table at the window, a hearth, the oven, the ladder to the attic hatch
// ---------------------------------------------------------------------------------------------------------------
function inn(G, w, d, h) {
  const bw = w / 2 - 0.6, bd = d / 2 - 0.6;
  P(G, 'furniture/rugRound', -6, 0.02, 2, { s: 4.4, collide: false, tint: 0xb07058 });
  counter(G, 9, -6.2, 13, 0x5a3a22);
  for (let i = 0; i < 5; i++) P(G, 'furniture/stoolBar', 4 + i * 2.5, 0, -4.9, { s: 2.3, ry: i * 0.6 });
  G.box(13.4, 2.4, 0.5, 9, 0, -bd + 0.4, 'wood', { tint: 0x4a3020 }); // the back shelves
  for (let i = 0; i < 12; i++) G.cyl(0.13, 0.32, 3.4 + i * 1.1, 1.65 + (i % 2) * 0.55, -bd + 0.7, 'wood', { ...D, seg: 8, tint: 0x8a6a44 });
  const rng = mulberry32(5150);
  for (const [x, z] of [[-14, 2], [-9, 2], [-4, 2], [-14, 7], [-9, 7], [-4, 7], [3, 7], [8, 7]]) { table(G, x, z, 4, 0, 'furniture/tableCloth'); tableware(G, x, 0.85, z, rng, 'tavern'); }
  table(G, -16.5, 9.4, 4, Math.PI / 2, 'furniture/table'); // the big table by the window: the map of the road
  table(G, -16.5, 6.2, 4, Math.PI / 2, 'furniture/table');
  // the hearth (left wall): a stone mass with a fire and its light
  G.box(3.0, 3.2, 1.6, -bw + 0.8, 0, -3.0, 'stone', { tint: 0x8a7e70 });
  G.box(1.7, 0.9, 0.5, -bw + 1.55, 0.35, -3.0, 'stoneDark', { ...NC, tint: 0x2a2018 });
  light(G, -bw + 1.6, 1.0, -3.0, 0xff8a40, 6, 11);
  // the bread oven of the second stove (back, left): a masonry block with the ash door at its base
  G.box(3.0, 2.2, 2.4, -bw + 1.6, 0, -bd + 1.4, 'stone', { tint: 0x9a8a78 });
  G.box(0.9, 0.7, 0.1, -bw + 1.6, 0.4, -bd + 2.66, 'metal', { ...NC, tint: 0x2a2a2a });
  for (const sx of [-1, 1]) P(G, 'furniture/pottedPlant', sx * (bw - 0.6), 0, bd - 0.8, { s: 2.3 });
  // the ladder to the attic hatch (right back corner)
  for (const s of [-0.35, 0.35]) G.box(0.07, 3.6, 0.07, bw - 1.4 + s, 0, -bd + 0.45, 'wood', { ...NC, tint: 0x6a4a30 });
  for (let i = 0; i < 9; i++) G.box(0.7, 0.05, 0.06, bw - 1.4, 0.35 + i * 0.4, -bd + 0.45, 'wood', { ...NC, tint: 0x6a4a30 });
  G.box(1.2, 0.08, 1.2, bw - 1.4, h - 0.5, -bd + 0.9, 'plank', { ...NC, tint: 0x4a3222 });
  for (const [x, z] of [[-12, 5], [-3, 4], [8, 3], [10, -3]]) chandelier(G, x, z, h, 0xffb860);
  return {
    inn_tavia: [9, -7.4, 0], inn_table: [-16.5, 8, Math.PI / 2],
    n02_attic: [bw - 1.4, -bd + 1.5], n02_exit: [-bw + 1.6, -bd + 3.3], n02_flue: [-bw + 1.6, -bd + 1.4, 0, 1.4],
    n02_prop_a: [bw - 3.2, -bd + 1.2], n02_prop_b: [bw - 5.0, -bd + 1.2], n02_wood_a: [-bw + 4.2, -bd + 1.2], n02_shelf_a: [-bw + 6.0, -bd + 1.2],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// the city archive (44 x 26): rows of shelves, Ilar's desk, the cabinet with the city list, reading tables
// ---------------------------------------------------------------------------------------------------------------
function archive(G, w, d, h) {
  const bw = w / 2 - 0.6, bd = d / 2 - 0.6;
  P(G, 'furniture/rugRectangle', 0, 0.02, 4, { s: 5.0, collide: false, tint: 0x6a7a9a });
  for (const x of [-15, -7, 7, 15]) for (let k = 0; k < 3; k++) P(G, k % 2 ? 'furniture/bookcaseClosedWide' : 'furniture/bookcaseOpen', x, 0, -bd + 0.5 + k * 3.4 + 0.2, { s: 2.6, ry: Math.PI / 2 });
  for (const x of [-15, -7, 7, 15]) P(G, 'furniture/books', x + 0.2, 1.4, -bd + 1.8, { s: 2.0, collide: false, ry: Math.PI / 2 });
  // Ilar's desk at the back centre
  P(G, 'furniture/table', 0, 0, -8.6, { s: 3.0 });
  P(G, 'furniture/chairCushion', 0, 0, -9.9, { s: 2.3, collide: false });
  P(G, 'furniture/books', -0.6, 0.85, -8.6, { s: 2.2, collide: false });
  P(G, 'furniture/lampRoundTable', 1.2, 0.85, -8.7, { s: 2.2, collide: false });
  light(G, 1.2, 1.8, -8.7, 0xffc880, 3.5, 8);
  // the cabinet with the city list (the left wall): a tall wooden case with drawers
  G.box(0.7, 2.6, 5.0, -bw + 0.4, 0, 0.5, 'wood', { tint: 0x5a3a22 });
  for (let i = 0; i < 6; i++) G.box(0.06, 0.34, 0.78, -bw + 0.78, 0.5 + (i % 3) * 0.7, -1.4 + Math.floor(i / 3) * 1.8 + 0.4, 'metal', { ...D, tint: 0xa89a7a });
  for (const [x, z] of [[-10, 6], [-2, 6], [6, 6], [12, 4]]) { table(G, x, z, 4); P(G, 'furniture/books', x, 0.85, z, { s: 2.0, collide: false }); }
  for (const x of [-4, 4]) column(G, x, -3, h, 0.42);
  for (const [x, z] of [[-10, -2], [10, -2], [0, 4], [0, -7]]) chandelier(G, x, z, h, 0xffd090);
  return { archive_ilar: [0, -9.6, 0], n01_shelf: [-bw + 1.6, 0.5], n03_book: [0.6, -7.4] };
}

// ---------------------------------------------------------------------------------------------------------------
// the main hall of the academy (52 x 28): the measuring circle, two water channels, instruments, Mirena's table with the schemes
// ---------------------------------------------------------------------------------------------------------------
function academy(G, w, d, h) {
  const bw = w / 2 - 0.6, bd = d / 2 - 0.6;
  G.cyl(6.4, 0.05, 0, 0.01, 0, 'stoneDark', { seg: 16, collide: false, castShadow: false, tint: 0x8a8478 });
  G.cyl(5.6, 0.06, 0, 0.03, 0, 'plaza', { seg: 16, collide: false, castShadow: false, tint: 0xf0e8d8 });
  G.cyl(0.35, 1.0, 0, 0, 0, 'stone', { seg: 12, tint: 0xcfc4a8 });
  for (let i = 0; i < 3; i++) G.cyl(1.2 + i * 0.5, 0.05, 0, 1.0 + i * 0.1, 0, 'metal', { ...NC, seg: 16, rx: 0.4 + i * 0.5, tint: 0xb89a6a });
  light(G, 0, 1.6, 0, 0x9ad0ff, 3, 8);
  for (const s of [-1, 1]) { G.box(w - 14, 0.4, 1.2, 0, 0, s * 9, 'stone', { collide: false, tint: 0xcfc4a8 }); G.box(w - 16, 0.08, 0.7, 0, 0.38, s * 9, 'water', { collide: false, castShadow: false }); }
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) P(G, 'furniture/bookcaseOpen', sx * (bw - 0.4), 0, -6 + k * 5, { s: 2.6, ry: -sx * Math.PI / 2 });
  for (const sx of [-1, 1]) board(G, sx * 11, 1.6, -bd + 0.1, 6.0, 2.8, 0, 0x3a4a3a);
  // Mirena's table with the schemes (right back)
  P(G, 'furniture/table', 13, 0, -8, { s: 3.2, ry: 0.08 });
  P(G, 'furniture/chairCushion', 13, 0, -9.3, { s: 2.3, collide: false });
  G.box(2.0, 0.015, 1.3, 13, 0.85, -8, 'plaster', { ...NC, tint: 0xe8e0c8 });
  for (const [x, z] of [[-14, -6], [-14, 6], [14, 5]]) table(G, x, z, 2);
  for (const [x, z] of [[-16, 0], [16, -1], [-8, -8], [8, 8], [0, 9]]) column(G, x, z, h, 0.5);
  for (const [x, z] of [[-12, 0], [12, 0], [0, -8], [0, 8]]) chandelier(G, x, z, h, 0xd8e8ff);
  return { academy_mirena: [13, -9.2, 0] };
}

// ---------------------------------------------------------------------------------------------------------------
// the port office (34 x 20): a desk with ledgers, a map of the piers, the notices of the berths, a bench
// ---------------------------------------------------------------------------------------------------------------
function portOffice(G, w, d, h) {
  const bw = w / 2 - 0.6, bd = d / 2 - 0.6;
  P(G, 'furniture/rugRectangle', 0, 0.02, 1.0, { s: 4.0, collide: false, tint: 0x4a6a8a });
  counter(G, 0, -2.2, 8, 0x5a4a38);
  P(G, 'furniture/table', 0, 0, -6.2, { s: 3.0 });
  P(G, 'furniture/chairCushion', 0, 0, -7.4, { s: 2.3, collide: false });
  P(G, 'furniture/books', -0.8, 0.85, -6.2, { s: 2.2, collide: false });
  P(G, 'furniture/lampRoundTable', 1.1, 0.85, -6.3, { s: 2.2, collide: false });
  light(G, 1.1, 1.8, -6.3, 0xffc880, 3.5, 8);
  G.box(4.4, 2.2, 0.06, bw - 2.8, 1.0, -bd + 0.1, 'plaster', { ...NC, tint: 0xe8d8b0 }); // the map of the piers
  for (let i = 0; i < 5; i++) G.box(2.0 - i * 0.2, 0.08, 0.02, bw - 2.8, 1.5 + i * 0.28, -bd + 0.15, 'cloth', { ...D, tint: 0x3a5a7a });
  board(G, -bw + 3.0, 1.2, -bd + 0.1, 4.4, 2.2);
  for (const sx of [-1, 1]) P(G, 'furniture/bookcaseClosedWide', sx * 8.2, 0, -bd + 0.5, { s: 2.6 });
  P(G, 'furniture/bench', bw - 0.7, 0, 4.0, { s: 2.4, ry: -Math.PI / 2 });
  P(G, 'furniture/bench', -bw + 0.7, 0, 4.0, { s: 2.4, ry: Math.PI / 2 });
  P(G, 'furniture/pottedPlant', bw - 0.6, 0, -bd + 3.5, { s: 2.3 });
  for (const [x, z] of [[-6, 1], [6, 1], [0, -4]]) chandelier(G, x, z, h, 0xffc880);
  return { port_varlen: [0, -7.2, 0], port_office_selia: [-3.4, 1.4, 0], port_office_nera: [3.4, 1.4, 0] };
}

const SPEC = {
  guild_hall: { floorH: 5.2, winY: 2.4, furnish: guildHall },
  inn_tavia: { floorH: 4.6, winY: 1.6, furnish: inn },
  archive: { floorH: 5.2, winY: 2.4, furnish: archive },
  academy_hall: { floorH: 6.8, winY: 3.2, furnish: academy },
  port_office: { floorH: 4.2, winY: 1.5, furnish: portOffice },
};
export const INTERIOR_IDS = Object.keys(SPEC);

/** A key building of the plan as a walk-in hall; returns the lightHouse result. The spots of its people are registered here. */
export function interiorBuilding(W, k) {
  const spec = SPEC[k.id];
  const r = keyBuilding(W, k, 7, { interior: { floorH: spec.floorH, doorW: 3.8, doorH: 3.6, winY: spec.winY }, floorTint: 0x6e4e30 });
  const F = r.frame, G = F.sub(0, r.localSill + 0.05, 0);
  const prev = W.lodMode;
  W.lodMode = 'near';
  let pts;
  try { wainscot(G, k.w, k.d, 3.8); pts = spec.furnish(G, k.w, k.d, spec.floorH); } finally { W.lodMode = prev; }
  for (const [name, [lx, lz, yaw = 0, ly = 0]] of Object.entries(pts)) W.spot(name, G.at(lx, ly, lz), k.rot + yaw);
  // the board of the guild is the same prop as in Axel (RPG.onInteract: the list of contracts for members)
  if (k.id === 'guild_hall') W.addInteractable(new QuestProp({ id: 'guild_board', name: 'Доска заказов', prompt: 'Посмотреть заказы', position: G.at(-11, 1.9, -k.d / 2 + 1.3), shape: 'none' }));
  return r;
}
