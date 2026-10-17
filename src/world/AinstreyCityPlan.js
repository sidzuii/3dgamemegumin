/**
 * Ainstrey — the plan of the capital as DATA (docs/ainstrey/TZ_capital.md, plan_ainstrey.png). Pure functions, no three.js:
 * the builder (world/build/AinstreyCity.js), the plan tool (tools/plan/ainstrey_plan.mjs) and the checks read the same plan.
 *
 * Local coordinates (u, v) = metres from the middle of the city (AinstreyPlan.js): u east, v SOUTH. The plan picture maps as
 *   u = (px - 575) * 1.64,  v = (py - 880) * 1.64   (px, py of the displayed 1868 x 1988 plan)
 *
 * How the plan is made. A lattice of columns (north-south lines) and rows (east-west lines) is bent by a smooth warp (stronger in
 * the Old town, almost none at the academy); the three terraces are rows that follow the bands of the terrain exactly. Lattice cells
 * are the city BLOCKS; the cell sides are streets (their widths come from the street class). Lots line the sides of every block
 * (deterministic, rectangles in the local frame of the side, never inside a street, a square or another lot), the rest of a block is
 * its courtyard. Key buildings (guild, archive, inn, academy, port office, theatre ...) are reserved plots the lots go round.
 */
import { fbm, mulberry32, smoothstep, clamp } from '../core/math.js';
import { CITY_WALL, TERRACES, LEVELS, CITADEL, cityLevel } from './AinstreyPlan.js';

// ---------------------------------------------------------------------------------------------------------------
// small geometry
// ---------------------------------------------------------------------------------------------------------------
const hyp = Math.hypot;
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
  return hyp(px - (ax + dx * t), pz - (az + dz * t));
}
export function polyDist(pts, u, v) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(u, v, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
/** Signed distance to a closed polygon (negative inside). */
export function polygonSDF(pts, u, v) {
  let inside = false, d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > v !== zj > v && u < ((xj - xi) * (v - zi)) / (zj - zi) + xi) inside = !inside;
    d = Math.min(d, segDist(u, v, xi, zi, xj, zj));
  }
  return inside ? -d : d;
}
export const WALL_PTS = CITY_WALL.map((n) => [n.u, n.v]);
/** Inside the walls by at least `m` metres. */
export const insideCity = (u, v, m = 0) => polygonSDF(WALL_PTS, u, v) < -m;

/** The four corners of an oriented rectangle: centre, width (along the tangent), depth, yaw (frame: +z is the front, x to the right of it). */
export function rectCorners(r, grow = 0) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  const hw = r.w / 2 + grow, hd = r.d / 2 + grow;
  // local x axis = (cos, -sin), local z axis = (sin, cos) in (u, v)
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [r.u + x * c + z * s, r.v - x * s + z * c]);
}
export function rectsOverlap(a, b, margin = 0) {
  const A = rectCorners(a, margin / 2), B = rectCorners(b, margin / 2);
  for (const P of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 4];
      const nx = z1 - z0, nz = -(x1 - x0);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of A) { const t = x * nx + z * nz; a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
      for (const [x, z] of B) { const t = x * nx + z * nz; b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}
const pointInRect = (r, u, v, grow = 0) => {
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  const dx = u - r.u, dz = v - r.v;
  const x = dx * c - dz * s, z = dx * s + dz * c;
  return Math.abs(x) <= r.w / 2 + grow && Math.abs(z) <= r.d / 2 + grow;
};
export { pointInRect };

// ---------------------------------------------------------------------------------------------------------------
// the lattice
// ---------------------------------------------------------------------------------------------------------------
/** Columns (u of the north-south lines): the central axis is COLS[3]. */
export const COLS = [-745, -500, -290, -33, 200, 430, 665];
/** Rows, north to south: a number is a constant v, 'B1'..'B3' follow the terrace bands (B3 = the garden rise, B2 = the theatre rise, B1 = the Steps). */
export const ROWS = [-880, 'B3', -540, -400, 'B2', -90, 110, 300, 'B1', 680, 870, 1070];
const BAND = { B1: 0, B2: 1, B3: 2 };
export const rowV = (r, u) => (typeof r === 'number' ? r : TERRACES[BAND[r]].edge(u));

/** Street classes: width of the roadway + the pavements, name prefix. */
export const CLASS = {
  axis: { width: 22, kerb: 2.2, label: 'Главный проспект' },
  avenue: { width: 17, kerb: 2.0, label: 'Проспект' },
  street: { width: 10.5, kerb: 1.5, label: 'Улица' },
  lane: { width: 5.5, kerb: 0.6, label: 'Переулок' },
  stair: { width: 40, kerb: 0, label: 'Лестница' },
  quay: { width: 14, kerb: 1.6, label: 'Набережная' },
};

// warp amplitude by place (metres)
function warpAmp(u, v) {
  let a = 11;
  a = a + 16 * smoothstep(-200, -420, v) * smoothstep(-100, -400, u) * 1; // the Old town: crooked
  a = a - 6 * smoothstep(0, 200, u) * smoothstep(-100, -300, v) * 0.7; // the academy streets are straight
  a *= 1 - smoothstep(380, 640, u) * 0.55; // the port streets are straight
  return a;
}
function bandWeight(u, v) {
  let d = Infinity;
  for (const T of TERRACES) d = Math.min(d, Math.abs(v - T.edge(u)) - T.half);
  return smoothstep(10, 70, d); // 0 on the terrace bands: no warp there, so the rows follow them exactly
}
const AXIS_U = COLS[3];
function warp(u, v) {
  const a = warpAmp(u, v) * bandWeight(u, v) * smoothstep(0, 60, Math.abs(u - AXIS_U)); // the central axis stays straight
  return [u + a * 2 * fbm(u * 0.0042 + 3.3, v * 0.0042 - 1.7, 3), v + a * 2 * fbm(u * 0.0042 - 8.1, v * 0.0042 + 5.5, 3)];
}
const mapPt = (u, v) => warp(u, v);

// ---------------------------------------------------------------------------------------------------------------
// districts and the style of their buildings
// ---------------------------------------------------------------------------------------------------------------
import { DISTRICTS } from './AinstreyPlan.js';
export function districtAt(u, v) {
  // nearest by signed distance; ties go to the earlier one (the plan polygons overlap a little)
  let best = null, bd = Infinity;
  for (const D of DISTRICTS) { const d = polygonSDF(D.pts, u, v); if (d < bd) { bd = d; best = D; } }
  return best?.id ?? 'posad';
}
/**
 * floors [min, max], lot width [min, max], lot depth [min, max], pitch gap, palettes (hex), roof kinds.
 * fw / fd / fgap / pass: the dense frontage (rows of houses wall to wall along every street, a passage into the courtyard
 * every `pass` houses); vac: share of the frontage left as a garden / a yard.
 */
export const STYLE = {
  posad: { floors: [2, 3], w: [16, 24], d: [11, 15], gap: 3, fw: [8, 13], fd: [10, 13], fgap: 0.6, pass: [5, 8], vac: 0.03, wall: [0xe3d6bb, 0xe8d8b8, 0xdccaa6, 0xd9c3a0], roof: [0xa9664c, 0xb5724f, 0x9a5a44], shop: 0.4, roofs: ['gable', 'gable', 'hip'] },
  steps: { floors: [3, 5], w: [20, 28], d: [14, 19], gap: 3.5, fw: [10, 16], fd: [12, 16], fgap: 0.6, pass: [6, 9], vac: 0.02, wall: [0xe3d6bb, 0xc9bda4, 0xd8ccb0], roof: [0x6a7c92, 0x7c8a9c, 0xa9664c], shop: 0.7, roofs: ['gable', 'hip', 'flat'] },
  guilds: { floors: [3, 4], w: [24, 32], d: [15, 20], gap: 4.5, fw: [11, 17], fd: [12, 16], fgap: 0.8, pass: [5, 8], vac: 0.03, wall: [0xc9bda4, 0xd0c4aa, 0xe3d6bb], roof: [0x6a7c92, 0x5d7189, 0x72849a], shop: 0.3, roofs: ['gable', 'hip'] },
  port: { floors: [1, 2], w: [22, 38], d: [14, 20], gap: 5, fw: [14, 24], fd: [12, 18], fgap: 1.4, pass: [3, 5], vac: 0.05, wall: [0xc9bda4, 0xb09a78, 0xa89070], roof: [0x6a5a48, 0x7a6a56, 0x6a7c92], shop: 0.1, roofs: ['gable', 'gable'] },
  old: { floors: [2, 4], w: [12, 18], d: [10, 15], gap: 3, fw: [7, 12], fd: [9, 13], fgap: 0.5, pass: [5, 8], vac: 0.03, wall: [0xd8c8a4, 0xcdbd9a, 0xe3d6bb, 0xc4b494], roof: [0xa9664c, 0x6a7c92, 0x8a5a48, 0x7c8a9c], shop: 0.2, roofs: ['gable', 'gable', 'hip'] },
  academy: { floors: [3, 4], w: [23, 31], d: [15, 20], gap: 5, fw: [14, 21], fd: [13, 17], fgap: 1.6, pass: [4, 6], vac: 0.04, wall: [0xe3d6bb, 0xd8ccb0, 0xc9bda4], roof: [0x4f6888, 0x56708e, 0x6a7c92], shop: 0.15, roofs: ['gable', 'hip'] },
  garden: { floors: [1, 2], w: [14, 20], d: [12, 16], gap: 6, fw: [14, 20], fd: [12, 16], fgap: 9, pass: [99, 99], vac: 0.25, wall: [0xe3d6bb], roof: [0x5c8b80, 0x6a7c92], shop: 0, roofs: ['hip'] },
};

// ---------------------------------------------------------------------------------------------------------------
// squares and key plots (authored)
// ---------------------------------------------------------------------------------------------------------------
/** Public squares: { id, name, u, v, w, d, rot, kind } — rectangles in the lot frame (rot 0 = long side east-west). */
export const SQUARES = [
  { id: 'wagons', name: 'Площадь Обозов', u: 300, v: 690, w: 130, d: 96, rot: 0, kind: 'wagons' },
  { id: 'market', name: 'Большой рынок', u: -365, v: 700, w: 140, d: 104, rot: 0, kind: 'market' },
  { id: 'steps', name: 'Площадь Ступеней', u: -33, v: 408, w: 170, d: 74, rot: 0, kind: 'steps' },
  { id: 'theatre', name: 'Театральная площадь', u: 190, v: 8, w: 118, d: 96, rot: 0, kind: 'theatre' },
  { id: 'guildsq', name: 'Гильдейская площадь', u: -430, v: 175, w: 110, d: 92, rot: 0, kind: 'guild' },
  { id: 'cathedral', name: 'Соборная площадь', u: -48, v: -372, w: 130, d: 104, rot: 0, kind: 'cathedral' },
  { id: 'scribes', name: 'Площадь Переписчиков', u: -540, v: -440, w: 90, d: 76, rot: 0, kind: 'small' },
  { id: 'academy', name: 'Малый академический двор', u: 306, v: -470, w: 104, d: 100, rot: 0, kind: 'academy' },
  { id: 'cargo', name: 'Грузовая площадь', u: 600, v: 330, w: 110, d: 92, rot: 0, kind: 'cargo' },
  { id: 'council', name: 'Верхняя площадь сада', u: -33, v: -775, w: 150, d: 70, rot: 0, kind: 'council' },
];

/** Reserved plots for the buildings of the story and the landmarks; the lots go round them. rot: yaw of the front (0 = faces south). */
export const KEY_PLOTS = [
  { id: 'guild_hall', name: 'Гильдия', u: -430, v: 105, w: 40, d: 26, rot: 0, floors: 4, kind: 'guild', tower: true, district: 'guilds' },
  { id: 'chamber', name: 'Палата торговцев', u: -330, v: 240, w: 32, d: 20, rot: Math.PI, floors: 3, kind: 'public', district: 'guilds' },
  { id: 'inn_tavia', name: 'Двор Тавии', u: -125, v: 700, w: 42, d: 26, rot: -Math.PI / 2, floors: 3, kind: 'inn', district: 'posad' },
  { id: 'archive', name: 'Городской архив', u: -380, v: -548, w: 44, d: 26, rot: 0, floors: 3, kind: 'archive', tower: true, district: 'old' },
  { id: 'cathedral_h', name: 'Собор', u: -238, v: -470, w: 34, d: 56, rot: Math.PI / 2, floors: 3, kind: 'cathedral', tower: true, district: 'old' },
  { id: 'academy_hall', name: 'Академия: главный зал', u: 306, v: -540, w: 52, d: 28, rot: 0, floors: 3, kind: 'academy', dome: true, district: 'academy' },
  { id: 'theatre_h', name: 'Театр', u: 190, v: -64, w: 54, d: 32, rot: 0, floors: 3, kind: 'theatre', district: 'steps' },
  { id: 'port_office', name: 'Портовая контора', u: 628, v: -2, w: 34, d: 20, rot: Math.PI / 2, floors: 2, kind: 'port', district: 'port' },
  { id: 'pump_house', name: 'Насосный склад', u: 712, v: 640, w: 52, d: 22, rot: Math.PI / 2, floors: 1, kind: 'pump', district: 'port', yard: 32 },
  { id: 'council_hall', name: 'Зал собраний', u: -33, v: -830, w: 46, d: 26, rot: 0, floors: 2, kind: 'council', district: 'garden' },
  { id: 'market_hall', name: 'Торговый ряд', u: -365, v: 640, w: 60, d: 16, rot: 0, floors: 1, kind: 'market', district: 'posad' },
  { id: 'steps_arcade', name: 'Пассаж Ступеней', u: -100, v: 340, w: 64, d: 18, rot: 0, floors: 4, kind: 'arcade', district: 'steps' },
];

// ---------------------------------------------------------------------------------------------------------------
// building the plan
// ---------------------------------------------------------------------------------------------------------------
/** The quay road runs along the east wall (the embankment); the piers are the water gates of the wall. */
export const PIERS = [
  { id: 'pier1', name: 'Пристань 1 (северная)', v: -295 }, { id: 'pier2', name: 'Пристань 2', v: -148 }, { id: 'pier3', name: 'Пристань 3 (городская)', v: 246 },
  { id: 'pier4', name: 'Пристань 4', v: 385 }, { id: 'pier5', name: 'Пристань 5 (насосный участок)', v: 650 },
];
/** The two bridges over the river (they leave the wall through gates and end at shut gatehouses on the east bank). */
export const BRIDGES = [
  { id: 'bridge_n', name: 'Северный мост', v: -520, width: 12, endU: 1125, endY: 3.0 },
  { id: 'bridge_b', name: 'Большой мост', v: 90, width: 14, endU: 1120, endY: 3.4 },
];
/** u of the wall on the east side at v (the quay nodes of CITY_WALL). */
export function eastWallU(v) {
  const q = CITY_WALL.filter((n) => n.quay).sort((a, b) => a.v - b.v);
  if (v <= q[0].v) return q[0].u;
  for (let i = 1; i < q.length; i++) if (v <= q[i].v) return q[i - 1].u + ((q[i].u - q[i - 1].u) * (v - q[i - 1].v)) / (q[i].v - q[i - 1].v);
  return q[q.length - 1].u;
}
const QUAY_V0 = -560, QUAY_V1 = 830;

/** Paths of the garden of the Council (the garden builder paves them). */
export const GARDEN_ALLEYS = [
  [[-33, -740], [-33, -775], [-33, -850], [-33, -900]], // the axis up to the citadel gate
  [[-33, -775], [-110, -790], [-190, -800]],
  [[-33, -775], [60, -785], [150, -790]],
  [[-33, -775], [-30, -820], [60, -850], [140, -830]],
  [[-190, -800], [-215, -760], [-215, -710]],
  [[150, -790], [190, -745], [200, -700]],
  [[-110, -790], [-110, -740], [-120, -700]],
  [[60, -785], [60, -740], [65, -700]],
];
const ALLEY_NAMES = ['Главная аллея', 'Западная аллея', 'Восточная аллея', 'Аллея к пруду', 'Аллея павильона', 'Аллея смотровой', 'Тенистая аллея', 'Прудовая аллея'];

let _plan = null;
export function cityPlan() {
  if (_plan) return _plan;
  const rng = mulberry32(310720);
  const R = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const nodes = ROWS.map((r) => COLS.map((u) => mapPt(u, rowV(r, u))));
  const streets = [];
  let sid = 0;
  const addStreet = (s) => { s.id = s.id || 's' + ++sid; streets.push(s); return s; };
  // a street line is cut where it leaves the walls: every run that stays inside (14 m from the wall) is a street of its own
  const addClipped = (s) => {
    const runs = []; let cur = [];
    for (const p of s.pts) { if (insideCity(p[0], p[1], 14)) cur.push(p); else { if (cur.length >= 2) runs.push(cur); cur = []; } }
    if (cur.length >= 2) runs.push(cur);
    return runs.filter((r) => polyLen(r) > 30).map((r, k) => addStreet({ ...s, id: undefined, pts: r, name: s.name + (runs.length > 1 ? ` (${k + 1})` : ''), pieces: Math.max(1, Math.round((s.pieces * polyLen(r)) / (polyLen(s.pts) || 1))) }));
  };
  const polyLen = (pts) => { let L = 0; for (let k = 1; k < pts.length; k++) L += hyp(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };

  // ---- the lines of the lattice, subdivided every 14 m (the warp makes them smooth)
  const lineAlongCol = (j, i0, i1) => {
    const pts = [];
    // base: u = COLS[j], v between the two row values (rows follow bands: interpolate the row v at this u)
    const v0 = rowV(ROWS[i0], COLS[j]), v1 = rowV(ROWS[i1], COLS[j]);
    const n = Math.max(2, Math.ceil(Math.abs(v1 - v0) / 14));
    for (let k = 0; k <= n; k++) pts.push(mapPt(COLS[j], v0 + ((v1 - v0) * k) / n));
    return pts;
  };
  const lineAlongRow = (i, j0, j1) => {
    const pts = [];
    const n = Math.max(2, Math.ceil(Math.abs(COLS[j1] - COLS[j0]) / 14));
    for (let k = 0; k <= n; k++) { const u = COLS[j0] + ((COLS[j1] - COLS[j0]) * k) / n; pts.push(mapPt(u, rowV(ROWS[i], u))); }
    return pts;
  };
  const colClass = (j) => (j === 3 ? 'axis' : j === 4 || j === 2 ? 'avenue' : 'street');
  const rowClass = (i) => (ROWS[i] === 'B1' || ROWS[i] === 'B2' || ROWS[i] === 'B3' ? 'stair' : [110, 680, -400].includes(ROWS[i]) ? 'avenue' : 'street');
  const COL_NAMES = ['Западная', 'Мельничная', 'Кузнечная', 'Главный проспект', 'Торговая', 'Портовая', 'Набережная'];
  const ROW_NAMES = ['Северная окраинная', 'Лестница Сада', 'Верхняя', 'Переписчиков', 'Театральная лестница', 'Академическая', 'Гильдейский проспект', 'Нижний проспект', 'Лестница Ступеней', 'Торговый проспект', 'Постоялая', 'Привратная'];
  // full lines (a street is one named line; its pieces are the lattice edges)
  COLS.forEach((u, j) => {
    const cls = colClass(j);
    const i0 = j === 0 || j === 6 ? 0 : 1; // the garden columns start at the garden rise
    addClipped({ kind: 'col', line: j, cls, name: COL_NAMES[j], pts: lineAlongCol(j, ROWS.length - 1, i0).reverse(), width: CLASS[cls].width, pieces: ROWS.length - 1 - i0 });
  });
  ROWS.forEach((r, i) => {
    const cls = rowClass(i);
    const j0 = i === 0 ? 0 : 0, j1 = COLS.length - 1;
    const skip = i === 0 ? [2, 4] : null; // the northern row stops at the garden
    if (skip) {
      addClipped({ kind: 'row', line: i, cls, name: ROW_NAMES[i] + ' (запад)', pts: lineAlongRow(i, 0, 2), width: CLASS[cls].width, pieces: 2 });
      addClipped({ kind: 'row', line: i, cls, name: ROW_NAMES[i] + ' (восток)', pts: lineAlongRow(i, 4, 6), width: CLASS[cls].width, pieces: 2 });
    } else addClipped({ kind: 'row', line: i, cls, name: ROW_NAMES[i], pts: lineAlongRow(i, j0, j1), width: CLASS[cls].width, pieces: COLS.length - 1, terrace: typeof r === 'string' ? r : null });
  });

  GARDEN_ALLEYS.forEach((a, k) => addStreet({ kind: 'path', cls: 'lane', name: ALLEY_NAMES[k], pts: a, width: 6, pieces: 1 }));

  // ---- blocks: the cells of the lattice that lie inside the walls and not in the garden / citadel / port strip
  const blocks = [];
  const inGarden = (u, v) => u > -330 && u < 470 && v < -690;
  for (let i = 0; i < ROWS.length - 1; i++) {
    for (let j = 0; j < COLS.length - 1; j++) {
      const c = [nodes[i][j], nodes[i][j + 1], nodes[i + 1][j + 1], nodes[i + 1][j]];
      const cu = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4, cv = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
      if (inGarden(cu, cv) || !insideCity(cu, cv, 30)) continue;
      // the cell's four sides as street pieces (sampled polylines)
      const top = lineAlongRow(i, j, j + 1), bot = lineAlongRow(i + 1, j, j + 1), left = lineAlongCol(j, i, i + 1), right = lineAlongCol(j + 1, i, i + 1);
      const side = (pts, cls) => ({ pts, cls, hw: CLASS[cls].width / 2 + CLASS[cls].kerb });
      const sides = [side(top, rowClass(i)), side(right, colClass(j + 1)), side(bot.slice().reverse(), rowClass(i + 1)), side(left.slice().reverse(), colClass(j))];
      blocks.push({ id: `b${i}_${j}`, i, j, u: cu, v: cv, corners: c, sides, district: districtAt(cu, cv) });
    }
  }

  // ---- squares and the plots of the key buildings; a key plot slides to the nearest place that is off every street
  const squares = SQUARES.map((s) => ({ ...s }));
  const streetNeed = (S) => S.width / 2 + (CLASS[S.cls].kerb ?? 1) + 0.15;
  const sampleRect = (r) => { // a grid of points over the rectangle (and its edge): a street may cross the middle of a plot
    const out = [], c = Math.cos(r.rot), sn = Math.sin(r.rot);
    for (let x = -r.w / 2; x <= r.w / 2 + 0.01; x += Math.max(3, r.w / Math.ceil(r.w / 4))) for (let z = -r.d / 2; z <= r.d / 2 + 0.01; z += Math.max(3, r.d / Math.ceil(r.d / 4))) out.push([r.u + x * c + z * sn, r.v - x * sn + z * c]);
    return out;
  };
  const offStreets = (r) => sampleRect(r).every(([x, z]) => !onStreet(x, z, 0));
  const offBands = (r) => TERRACES.every((T) => rectCorners(r, 0).every(([x, z]) => Math.abs(z - T.edge(x)) > T.half + 5));
  // the pier streets first: the key plots keep off them
  PIERS.filter((pr) => pr.v > -100).forEach((pr, k) => addStreet({ kind: 'pier', cls: 'street', name: pr.name.split(' (')[0].replace('Пристань', 'Пирс'), pts: [[COLS[6] + 6, pr.v], [eastWallU(pr.v) - 28, pr.v], [eastWallU(pr.v) + 4, pr.v]], width: CLASS.street.width, pieces: 1, pier: pr.id }));
  // the street segments hashed in 20 m cells (each with the clearance its street needs): a lot asks only the few near it
  const SEG = 20, segH = new Map();
  for (const S of streets) {
    if (S.kind === 'lane' || S.cls === 'stair') continue;
    const need = S.width / 2 + (CLASS[S.cls].kerb ?? 1) + 0.15;
    for (let k = 1; k < S.pts.length; k++) {
      const [ax, az] = S.pts[k - 1], [bx, bz] = S.pts[k], seg = [ax, az, bx, bz, need];
      for (let i = Math.floor((Math.min(ax, bx) - need) / SEG); i <= Math.floor((Math.max(ax, bx) + need) / SEG); i++) for (let j = Math.floor((Math.min(az, bz) - need) / SEG); j <= Math.floor((Math.max(az, bz) + need) / SEG); j++) {
        const key = i * 100003 + j;
        if (!segH.has(key)) segH.set(key, []);
        segH.get(key).push(seg);
      }
    }
  }
  const onStreet = (x, z, slack) => {
    for (const [ax, az, bx, bz, need] of segH.get(Math.floor(x / SEG) * 100003 + Math.floor(z / SEG)) || []) if (segDist(x, z, ax, az, bx, bz) < need - slack) return true;
    return false;
  };
  const keys = [];
  const yardRect = (k) => ({ u: k.u + Math.sin(k.rot) * (k.d / 2 + k.yard / 2), v: k.v + Math.cos(k.rot) * (k.d / 2 + k.yard / 2), w: 22, d: k.yard, rot: k.rot });
  for (const K of KEY_PLOTS) {
    let best = null;
    for (let ring = 0; ring <= 12 && !best; ring++) {
      for (let a = 0; a < (ring ? 16 : 1) && !best; a++) {
        const ang = (a / 16) * Math.PI * 2, rr = ring * 6;
        const cand = { ...K, u: K.u + Math.cos(ang) * rr, v: K.v + Math.sin(ang) * rr };
        if (!offStreets(cand) || !offBands(cand) || !insideCity(cand.u, cand.v, 20)) continue;
        if (squares.some((q) => rectsOverlap(q, cand, 2)) || keys.some((q) => rectsOverlap(q, cand, 3))) continue;
        if (K.yard) { // the ramp and the yard in front of a hall (the pump of the port) are part of the plot
          const yd = yardRect(cand);
          if (!offStreets(yd) || !insideCity(yd.u, yd.v, 8) || squares.some((q) => rectsOverlap(q, yd, 2)) || keys.some((q) => rectsOverlap(q, yd, 2) || (q.yard && rectsOverlap(yardRect(q), yd, 2)))) continue;
        }
        best = cand;
      }
    }
    keys.push(best || { ...K, unplaced: true });
  }
  const obstacles = [...squares.map((s) => ({ ...s, margin: 3 })), ...keys.map((k) => ({ ...k, margin: 2.5 })), ...keys.filter((k) => k.yard).map((k) => ({ ...yardRect(k), margin: 2 }))];

  // ---- lanes: a pedestrian lane through the middle of most blocks (across the long side), and the lots keep off them
  const lanes = [];
  for (const B of blocks) {
    const [a, b, c, d] = B.corners;
    const lenH = hyp(b[0] - a[0], b[1] - a[1]), lenV = hyp(d[0] - a[0], d[1] - a[1]);
    if (Math.min(lenH, lenV) < 120 || rng() < 0.08) continue;
    const hitsPlot = (pts2) => [...squares, ...keys].some((q) => { for (let k = 0; k <= 10; k++) { const x = pts2[0][0] + (pts2[1][0] - pts2[0][0]) * k / 10, z = pts2[0][1] + (pts2[1][1] - pts2[0][1]) * k / 10; if (pointInRect(q, x, z, 6)) return true; } return false; });
    // across the long direction: the lane joins the middles of the two short sides' ... (north-south when the block is wider than tall)
    const t = R(0.42, 0.58);
    let pts;
    if (lenH >= lenV) {
      const p0 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], p1 = [d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t];
      pts = [p0, p1];
    } else {
      const p0 = [a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t], p1 = [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t];
      pts = [p0, p1];
    }
    if (hitsPlot(pts) || !pts.every((q) => insideCity(q[0], q[1], 18))) continue;
    // bend the lane a little in the middle (the old town: more)
    const m = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    const bend = (B.district === 'old' ? 14 : 5) * (rng() - 0.5) * 2;
    const dx = pts[1][0] - pts[0][0], dz = pts[1][1] - pts[0][1], L = hyp(dx, dz);
    const mid = [m[0] - (dz / L) * bend, m[1] + (dx / L) * bend];
    if (!insideCity(mid[0], mid[1], 18)) continue;
    B.lane = addStreet({ kind: 'lane', cls: 'lane', name: `${CLASS.lane.label} ${blocks.indexOf(B) + 1}`, pts: [pts[0], mid, pts[1]], width: CLASS.lane.width, pieces: 1, block: B.id });
    lanes.push(B.lane);
  }

  // ---- lots: dense rows along every side of every block, a second row round the courtyards, the lanes, a few sheds
  const lots = [];
  const placed = []; // all rectangles (lots and obstacles) for the overlap checks, hashed in 40 m cells
  const GRID = 40, cellsH = new Map();
  const addPlaced = (r) => {
    placed.push(r);
    const rr = Math.hypot(r.w, r.d) / 2 + (r.margin || 0) + 1;
    for (let i = Math.floor((r.u - rr) / GRID); i <= Math.floor((r.u + rr) / GRID); i++) for (let j = Math.floor((r.v - rr) / GRID); j <= Math.floor((r.v + rr) / GRID); j++) {
      const k = i * 100003 + j;
      if (!cellsH.has(k)) cellsH.set(k, []);
      cellsH.get(k).push(r);
    }
  };
  const hitPlaced = (r, m) => {
    const rr = Math.hypot(r.w, r.d) / 2 + 6, seen = new Set();
    for (let i = Math.floor((r.u - rr) / GRID); i <= Math.floor((r.u + rr) / GRID); i++) for (let j = Math.floor((r.v - rr) / GRID); j <= Math.floor((r.v + rr) / GRID); j++) {
      for (const p of cellsH.get(i * 100003 + j) || []) {
        if (seen.has(p)) continue;
        seen.add(p);
        if (rectsOverlap(p, r, p.obstacle ? p.margin : m)) return true;
      }
    }
    return false;
  };
  for (const o of obstacles) addPlaced({ ...o, obstacle: true });
  // the yard beside the inn (N02: the chimney is looked at from there)
  { const k = keys.find((q) => q.id === 'inn_tavia'); if (k) { const c = Math.cos(k.rot), sn = Math.sin(k.rot), lx = k.w / 2 + 5; addPlaced({ u: k.u + lx * c, v: k.v - lx * sn, w: 10, d: k.d + 4, rot: k.rot, margin: 0.5, obstacle: true }); } }
  // streets with their bounding boxes (most are far from a given lot)
  const sbox = new Map(streets.map((S) => { let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const [x, z] of S.pts) { a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, z); b1 = Math.max(b1, z); } return [S, [a0, a1, b0, b1]]; }));
  const near = (S, r, pad) => { const [a0, a1, b0, b1] = sbox.get(S), rr = Math.hypot(r.w, r.d) / 2 + pad; return r.u > a0 - rr && r.u < a1 + rr && r.v > b0 - rr && r.v < b1 + rr; };
  const laneClear = (r, except) => lanes.some((L) => { // keep a lot off a lane
    if (!near(L, r, L.width + 2)) return false;
    if (L === except) return rectCorners(r, 0).some(([x, z]) => polyDist(L.pts, x, z) < L.width / 2 + 0.3); // its own lane: only off the paving
    for (const [x, z] of rectCorners(r, 0)) if (polyDist(L.pts, x, z) < L.width / 2 + 1.2) return true;
    return polyDist(L.pts, r.u, r.v) < L.width / 2 + 1.2 + Math.min(r.w, r.d) / 2;
  });
  const streetClear = (r) => { // never on a street (a few centimetres of margin)
    if (onStreet(r.u, r.v, 0)) return false;
    for (const [x, z] of rectCorners(r, 0)) if (onStreet(x, z, 0.01)) return false;
    return true;
  };
  const stairClear = (r) => TERRACES.every((T) => rectCorners(r, 0).every(([x, z]) => Math.abs(z - T.edge(x)) > T.half + 6));
  const WALL_MARGIN = 14;
  const fits = (lot, m, except) => streetClear(lot) && !hitPlaced(lot, m) && stairClear(lot) && !laneClear(lot, except) && insideCity(lot.u, lot.v, WALL_MARGIN + Math.max(lot.w, lot.d) / 2);
  const RI = ([a, b]) => Math.floor(R(a, b + 1));
  const R2 = ([a, b]) => Math.round(R(a, b) * 2) / 2;
  /** Arclength sampler of a polyline: s -> [x, z, tx, tz]. */
  const sampler = (pts) => {
    const acc = [0];
    for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + hyp(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const total = acc[acc.length - 1];
    const at = (q) => {
      q = clamp(q, 0, total);
      let k = 1;
      while (k < acc.length - 1 && acc[k] < q) k++;
      const f = (q - acc[k - 1]) / (acc[k] - acc[k - 1] || 1), tx = pts[k][0] - pts[k - 1][0], tz = pts[k][1] - pts[k - 1][1], L = hyp(tx, tz) || 1;
      return [pts[k - 1][0] + tx * f, pts[k - 1][1] + tz * f, tx / L, tz / L];
    };
    return { total, at };
  };
  /**
   * A row of lots along a line: `off` = distance of the lot's near edge from the line, `face` +1 = the lots face the line,
   * -1 = they turn their backs on it (the second row looks into the courtyard). Wall to wall (`gap`), a passage every few lots,
   * a too-wide lot that does not fit is tried narrower before the row moves on.
   */
  const row = (B, pts, side, inward, o) => {
    const { total, at } = sampler(pts);
    let q = o.from, run = 0, nextPass = RI(o.pass), guard = 0;
    while (q < total - o.to && guard++ < 600) {
      const d = R2(o.fd);
      let w = R2(o.fw), lot = null;
      if (rng() < (o.vac ?? 0)) { q += w + o.gap; run = 0; continue; }
      for (const k of [1, 0.75, 0.55]) {
        const ww = Math.round(w * k * 2) / 2;
        if (ww < 6) break;
        const [cx, cz, tx, tz] = at(q + ww / 2);
        let lnx = -tz, lnz = tx;
        if (lnx * inward[0] + lnz * inward[1] < 0) { lnx = -lnx; lnz = -lnz; }
        const off = o.off + d / 2;
        const cand = { u: cx + lnx * off, v: cz + lnz * off, w: ww, d, rot: o.face > 0 ? Math.atan2(-lnx, -lnz) : Math.atan2(lnx, lnz), block: B.id, side, district: B.district, ...o.tag };
        if (fits(cand, o.margin, o.lane)) { lot = cand; w = ww; break; }
      }
      if (!lot) { q += 1.5; run = 0; continue; }
      addPlaced(lot);
      B.lots.push(lot);
      q += w + o.gap;
      if (++run >= nextPass) { q += 4.5; run = 0; nextPass = RI(o.pass); } // the gate of a courtyard passage
    }
  };
  const inwardOf = (B, pts) => { const { total, at } = sampler(pts); const [mx, mz, tx, tz] = at(total / 2); let nx = -tz, nz = tx; if ((B.u - mx) * nx + (B.v - mz) * nz < 0) { nx = -nx; nz = -nz; } return [nx, nz]; };
  for (const B of blocks) B.lots = [];
  // 1. the street frontage of every block (all blocks first: the corners go to whoever reaches them first)
  for (const B of blocks) {
    const sty = STYLE[B.district] || STYLE.posad;
    B.sides.forEach((S, si) => row(B, S.pts, si, inwardOf(B, S.pts), { from: S.hw + 0.8, to: S.hw + 0.8, off: S.hw + 0.3, face: 1, fw: sty.fw, fd: sty.fd, gap: sty.fgap, pass: sty.pass, vac: sty.vac, margin: 0.2 }));
  }
  // 2. the lanes through the blocks: smaller houses on both sides
  for (const B of blocks) {
    if (!B.lane) continue;
    const sty = STYLE[B.district] || STYLE.posad, L = B.lane;
    const { at, total } = sampler(L.pts);
    const [, , tx, tz] = at(total / 2);
    for (const side of [-1, 1]) row(B, L.pts, 10 + (side > 0 ? 1 : 0), [-tz * side, tx * side], { from: 10, to: 10, off: L.width / 2 + 0.8, face: 1, fw: [8, 13], fd: [9, 12], gap: 0.8, pass: [4, 7], vac: (sty.vac ?? 0) + 0.08, margin: 0.3, lane: L, tag: { laneLot: true } });
  }
  // 3. the second row round the courtyard: back houses, workshops and stores behind the frontage, facing the yard
  for (const B of blocks) {
    const sty = STYLE[B.district] || STYLE.posad;
    if (B.district === 'garden') continue;
    const [a, b, , d] = B.corners;
    if (Math.min(hyp(b[0] - a[0], b[1] - a[1]), hyp(d[0] - a[0], d[1] - a[1])) < 2 * (sty.fd[1] + 26)) continue; // a small block: one row only
    B.sides.forEach((S, si) => row(B, S.pts, 20 + si, inwardOf(B, S.pts), { from: S.hw + sty.fd[1] + 8, to: S.hw + sty.fd[1] + 8, off: S.hw + sty.fd[1] + 5, face: -1, fw: [8, 13], fd: [7, 10], gap: 2.2, pass: [3, 5], vac: 0.2, margin: 1.2, tag: { back: true } }));
  }
  // 4. a few sheds in the middle of the courtyards (the old town and the posad)
  for (const B of blocks) {
    const inner = B.district === 'old' || B.district === 'posad' ? 2 : 1;
    let n = 0;
    for (let k = 0; k < inner * 6 && n < inner; k++) {
      const f1 = R(0.35, 0.65), f2 = R(0.35, 0.65);
      const [a, b, c, d] = B.corners;
      const px = (a[0] * (1 - f1) + b[0] * f1) * (1 - f2) + (d[0] * (1 - f1) + c[0] * f1) * f2;
      const pz = (a[1] * (1 - f1) + b[1] * f1) * (1 - f2) + (d[1] * (1 - f1) + c[1] * f1) * f2;
      const lot = { u: px, v: pz, w: Math.round(R(7, 12)), d: Math.round(R(6, 9)), rot: R(-0.3, 0.3), block: B.id, side: -1, district: B.district, inner: true };
      if (!fits(lot, 3)) continue;
      addPlaced(lot);
      B.lots.push(lot);
      n++;
    }
  }
  for (const B of blocks) for (const l of B.lots) lots.push(l);

  // ---- the quay: the road along the embankment, the roads to the piers, the warehouses between the road and the street behind
  const quayPts = [];
  for (let v = QUAY_V0; v <= QUAY_V1; v += 30) quayPts.push([eastWallU(v) - 28, v]);
  const quayRoad = addStreet({ kind: 'quay', cls: 'quay', name: 'Набережная', pts: quayPts, width: CLASS.quay.width, pieces: 6 });
  const nearPier = (v, pad) => PIERS.some((pr) => Math.abs(pr.v - v) < pad);
  const warehouse = (v0, wlen, row) => {
    const uQ = eastWallU(v0 + wlen / 2) - 28;
    const d = row === 0 ? 24 : 20;
    const front = CLASS.quay.width / 2 + CLASS.quay.kerb + 0.5;
    const u = row === 0 ? uQ - front - d / 2 : uQ - front - 24 - 14 - d / 2;
    const lot = { u, v: v0 + wlen / 2, w: wlen, d, rot: row === 0 ? Math.PI / 2 : -Math.PI / 2, block: 'quay', side: row, district: 'port', warehouse: true };
    return lot;
  };
  for (const row of [0, 1]) {
    for (let v = QUAY_V0 + 12 + row * 20; v < QUAY_V1 - 40; ) {
      const wlen = Math.round(R(30, 46));
      const lot = warehouse(v, wlen, row);
      v += wlen + R(6, 10);
      if (nearPier(lot.v, 12 + wlen / 2)) continue;
      if (rng() < 0.12 + row * 0.25) continue;
      if (!insideCity(lot.u, lot.v, 6) || !offBands(lot) || hitPlaced(lot, 2)) continue;
      if (!streets.every((S) => S === quayRoad || S.cls === 'stair' || S.kind === 'lane' || rectCorners(lot, 0).every(([x, z]) => polyDist(S.pts, x, z) >= streetNeed(S)))) continue;
      addPlaced(lot);
      lots.push(lot);
    }
  }

  // ---- quarters: neighbouring blocks of one district go together (the TZ counts quarters, a block is one cell of the lattice)
  const quarters = [];
  const taken = new Set();
  const byIJ = new Map(blocks.map((b) => [b.i + ',' + b.j, b]));
  for (const B of blocks) {
    if (taken.has(B.id)) continue;
    const group = [B];
    taken.add(B.id);
    for (const [di, dj] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const N = byIJ.get(B.i + di + ',' + (B.j + dj));
      if (N && !taken.has(N.id) && N.district === B.district) { group.push(N); taken.add(N.id); break; }
    }
    quarters.push({ id: 'q' + quarters.length, district: B.district, blocks: group.map((b) => b.id), u: group.reduce((a, b) => a + b.u, 0) / group.length, v: group.reduce((a, b) => a + b.v, 0) / group.length });
  }
  for (const q of quarters) for (const id of q.blocks) blocks.find((b) => b.id === id).quarter = q.id;

  // ---- finish the lots: floors, colours, kinds
  lots.forEach((l, k) => {
    const sty = STYLE[l.district] || STYLE.posad;
    const avenueFront = l.side >= 0 && (blocks.find((b) => b.id === l.block)?.sides[l.side]?.cls === 'avenue' || blocks.find((b) => b.id === l.block)?.sides[l.side]?.cls === 'axis');
    l.id = 'L' + k;
    l.floors = l.inner ? 1 : l.back ? (rng() < 0.6 ? 2 : 1) : clamp(Math.round(R(sty.floors[0], sty.floors[1] + (avenueFront ? 0.9 : 0))), 1, 5);
    l.wall = pick(sty.wall);
    l.roofColor = pick(sty.roof);
    l.roof = l.inner || l.back ? 'gable' : pick(sty.roofs);
    l.shop = l.back || l.inner ? false : avenueFront ? rng() < sty.shop + 0.2 : rng() < sty.shop * 0.4;
    l.kind = l.inner ? 'shed' : l.warehouse || (l.district === 'port' && !l.back && !l.laneLot && l.w >= 14) ? 'warehouse' : 'house';
    l.simple = !!(l.back || l.inner); // seen only from the courtyards: a lighter kit model (AinstreyFacade)
    if (l.warehouse) { l.floors = rng() < 0.4 ? 2 : 1; l.shop = false; l.wall = pick([0xb09a78, 0xa89070, 0xc9bda4]); l.roofColor = pick([0x6a5a48, 0x7a6a56, 0x6a7c92]); }
    l.seed = Math.floor(rng() * 1e9);
  });

  // ---- yards: one per quarter (the free middle of its blocks) + the squares
  const yards = [];
  for (const q of quarters) {
    const kind = q.district === 'old' ? 'cloister' : q.district === 'port' ? 'shipyard' : q.district === 'posad' ? (q.id.length % 2 ? 'workshop' : 'inn') : q.district === 'guilds' ? 'guild' : q.district === 'academy' ? 'academy' : 'garden';
    yards.push({ id: 'y_' + q.id, quarter: q.id, u: q.u, v: q.v, kind, district: q.district });
  }

  _plan = { streets, blocks, quarters, lots, keys, squares, lanes, yards, nodes, quayRoad };
  return _plan;
}

/** Counts for the reports (TZ: 25-35 quarters, 60-90 streets and lanes, 8-10 squares, 30-40 courtyards, 700-1000 buildings). */
/** Is (u, v) within `pad` metres of the paving of a street (the lanes and the garden paths included)? */
export function nearStreet(u, v, pad = 2) {
  const P = cityPlan();
  return P.streets.some((S) => S.cls !== 'stair' && polyDist(S.pts, u, v) < S.width / 2 + (CLASS[S.cls].kerb ?? 0) + pad);
}

export function planStats() {
  const P = cityPlan();
  const real = P.streets.filter((x) => x.cls !== 'stair');
  const pieces = real.reduce((s, x) => s + (x.pieces || 1), 0);
  const byDistrict = {};
  for (const l of P.lots) byDistrict[l.district] = (byDistrict[l.district] || 0) + 1;
  return { blocks: P.blocks.length, quarters: P.quarters.length, streetLines: real.length, streetPieces: pieces, squares: P.squares.length, yards: P.yards.length, lots: P.lots.length, keys: P.keys.length, byDistrict };
}

export { cityLevel, LEVELS, CITADEL };
