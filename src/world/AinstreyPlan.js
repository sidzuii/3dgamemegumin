/**
 * Ainstrey — the capital and the road to it (data). docs/ainstrey/TZ_capital.md, plan: docs/ainstrey/plan_ainstrey.png.
 *
 * A second terrain SHEET of the overworld: the region of about 3.5 x 4.5 km lies east of the old map (the ridge of the
 * east pass between them is never walked: the pass gate leads there as a scene change, like the dungeon doors).
 * North = -Z, east = +X (the same as everywhere: the plan, the compass and the map never turn).
 *
 * Local coordinates (u, v) = metres from the centre of the city: u = east (+X), v = south (+Z).
 * World = (ORIGIN.x + u, ORIGIN.z + v). Pure data + small helpers (no three.js): the terrain (Terrain.js), the
 * builders (world/build/Ainstrey*.js) and the plan tool (tools/plan/ainstrey_plan.mjs) all read this file.
 */

/** World position of the local origin (the centre of the city). */
export const ORIGIN = { x: 3400, z: -300 };

/** The sheet in local coordinates and the height-grid step (metres). */
export const RECT = { u0: -1700, v0: -1350, u1: 1800, v1: 3150, step: 5 };

export const toWorld = (u, v) => [ORIGIN.x + u, ORIGIN.z + v];
export const toLocal = (x, z) => [x - ORIGIN.x, z - ORIGIN.z];
const W = (pts) => pts.map(([u, v]) => toWorld(u, v));

/** World-space rectangle of the sheet. */
export const SHEET = { x0: ORIGIN.x + RECT.u0, z0: ORIGIN.z + RECT.v0, x1: ORIGIN.x + RECT.u1, z1: ORIGIN.z + RECT.v1, step: RECT.step };
export const inSheet = (x, z) => x >= SHEET.x0 && x <= SHEET.x1 && z >= SHEET.z0 && z <= SHEET.z1;
/** Fog-of-war grid of the map page of the sheet (50 m cells). */
export const EXPLORE = { cell: 50, nx: Math.ceil((SHEET.x1 - SHEET.x0) / 50), nz: Math.ceil((SHEET.z1 - SHEET.z0) / 50) };

// ---------------------------------------------------------------------------------------------------------------
// The city
// ---------------------------------------------------------------------------------------------------------------
/**
 * City wall (clockwise from the south gate), about 1.6 km west-east and 2.2 km south-north. The east side runs along the
 * quay: there the "wall" is the embankment parapet with the piers of the port (kind 'quay').
 */
export const CITY_WALL = [
  { u: -20, v: 1100, gate: 'south', name: 'Южные ворота' },
  { u: -300, v: 1085 }, { u: -460, v: 1060, tower: true }, { u: -620, v: 1030 }, { u: -740, v: 960, tower: true },
  { u: -790, v: 800 }, { u: -800, v: 600 }, { u: -795, v: 350, tower: true }, { u: -800, v: 100 },
  { u: -795, v: -150 }, { u: -785, v: -400, tower: true }, { u: -760, v: -640 },
  { u: -680, v: -880, tower: true }, { u: -520, v: -1030 }, { u: -300, v: -1100 }, { u: -60, v: -1125, tower: true },
  { u: 180, v: -1110 }, { u: 420, v: -1060, tower: true }, { u: 600, v: -960 }, { u: 720, v: -800, tower: true },
  { u: 775, v: -600, quay: true }, { u: 790, v: -300, quay: true }, { u: 780, v: 0, quay: true }, { u: 790, v: 300, quay: true },
  { u: 780, v: 600, quay: true }, { u: 770, v: 850, quay: true, tower: true }, { u: 680, v: 990 }, { u: 540, v: 1055, tower: true },
  { u: 300, v: 1090 },
];
export const WALL_HEIGHT = 9;

/** Seven districts as rough polygons (the plan's colour fields); the generator fills them with blocks and lots. */
export const DISTRICTS = [
  { id: 'posad', name: 'Южный посад', pts: [[-795, 1000], [-20, 1110], [300, 1095], [770, 860], [770, 500], [350, 520], [-60, 505], [-440, 480], [-795, 470]] },
  { id: 'steps', name: 'Площадь Ступеней', pts: [[-80, 505], [350, 520], [770, 500], [770, 140], [330, 150], [120, -240], [-90, -240], [-130, 140], [-80, 300]] },
  { id: 'guilds', name: 'Квартал гильдий', pts: [[-795, 470], [-440, 480], [-60, 505], [-130, 140], [-90, -240], [-300, -240], [-795, -140]] },
  { id: 'port', name: 'Речной порт', pts: [[350, 520], [770, 860], [770, 500], [775, -100], [560, -100], [330, 150]] },
  { id: 'old', name: 'Старый город', pts: [[-790, -140], [-300, -240], [-90, -240], [-60, -680], [-300, -900], [-680, -880], [-785, -400]] },
  { id: 'academy', name: 'Академические улицы', pts: [[-90, -240], [120, -240], [330, 150], [560, -100], [775, -100], [775, -600], [720, -800], [420, -700], [250, -650], [-60, -680]] },
  { id: 'garden', name: 'Сад Совета', pts: [[-300, -900], [-60, -680], [250, -650], [420, -700], [600, -960], [300, -1090], [-60, -1125], [-300, -1100]] },
];

/** Citadel (closed, a future part): inside the north wall behind the garden. */
export const CITADEL = { pts: [[-330, -1090], [-250, -905], [250, -905], [330, -1050], [180, -1105], [-60, -1120]], wallHeight: 14 };

/**
 * Terraces of the city: the ground rises from the gates to the garden. Each step is a band (centre line v = f(u), half-width)
 * of a sloped street; the central stair of the Steps square is built on the first one.
 */
export const LEVELS = { south: 3.2, middle: 6.6, upper: 10.0, garden: 12.4, quay: 0.9 };
const edge1 = (u) => 492 + 16 * Math.sin(u / 140);
const edge2 = (u) => -245 + 24 * Math.sin(u / 170 + 1);
const edge3 = (u) => -690 + 20 * Math.sin(u / 120 + 2);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const TERRACES = [
  { id: 'steps_stair', edge: edge1, half: 17, rise: LEVELS.middle - LEVELS.south },
  { id: 'theatre_rise', edge: edge2, half: 18, rise: LEVELS.upper - LEVELS.middle },
  { id: 'garden_rise', edge: edge3, half: 34, rise: LEVELS.garden - LEVELS.upper },
];

/** Ground height of the city (local u, v): the three levels, the slope to the quay of the port. */
export function cityLevel(u, v) {
  let h = LEVELS.south;
  for (const T of TERRACES) h += T.rise * sstep(-T.half, T.half, T.edge(u) - v);
  // Port: from the city level down to the quay (the quay strip is u >= 700 between v = -100 and 880).
  const pv = sstep(-170, -60, v) * (1 - sstep(850, 960, v));
  h -= (h - LEVELS.quay) * sstep(560, 700, u) * pv;
  return h;
}

// ---------------------------------------------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------------------------------------------
/** The big river east of the city (about 250 m wide), flowing south. bankW: width of the shore ramp (steep, quay-like). */
export const BIG_RIVER = {
  points: W([[1010, -1350], [1000, -1100], [985, -800], [975, -500], [968, -200], [972, 100], [980, 400], [992, 700], [1010, 1000], [1035, 1280], [1055, 1500], [1080, 1760], [1105, 2050], [1135, 2450], [1165, 3150]]),
  width: 230, level: -0.65, bed: -3.4, valley: 150, bankW: 16,
};
/** The mill arm: from the western hills past the White mills, south of the city, into the big river. */
export const MILL_ARM = {
  points: W([[-1700, 1990], [-1450, 1885], [-1200, 1765], [-950, 1655], [-700, 1550], [-450, 1450], [-250, 1372], [-30, 1296], [250, 1292], [600, 1335], [900, 1405], [1010, 1440]]),
  width: 15, level: -0.55, bed: -2.3, valley: 46, bankW: 9,
};

// ---------------------------------------------------------------------------------------------------------------
// The road to the capital
// ---------------------------------------------------------------------------------------------------------------
/** Postal ascent -> Stone Ledge -> Chalk slopes -> White mills -> South dam -> the south gate. */
export const TRAKT = [
  [-1590, 2331], [-1560, 2318], [-1500, 2292], [-1440, 2238], [-1390, 2190], [-1345, 2140], [-1300, 2092], [-1250, 2052], [-1205, 2010],
  [-1150, 1962], [-1100, 1925], [-1050, 1882], [-1000, 1836], [-940, 1786], [-870, 1726], [-810, 1685], [-760, 1651], [-700, 1620],
  [-640, 1588], [-570, 1554], [-500, 1524], [-430, 1498], [-360, 1478], [-290, 1452], [-210, 1420], [-140, 1380], [-85, 1342],
  [-52, 1334], [-38, 1326], [-33, 1318], [-33, 1272], [-30, 1236], [-24, 1190], [-20, 1130],
];
/** Where the road crosses the arm: the south dam (a stone causeway with sluice gates and a water gauge). */
export const DAM = { u: -33, v0: 1270, v1: 1324, width: 6.5, top: 1.9 };

// ---------------------------------------------------------------------------------------------------------------
// Landforms outside the walls
// ---------------------------------------------------------------------------------------------------------------
/** Gaussian hills { u, v, r, h } (local). */
export const HILLS_LOCAL = [
  // the hillside of the Stone Ledge (the road runs along its south-east flank) and the Postal ascent
  { u: -1470, v: 2010, r: 150, h: 34 }, { u: -1640, v: 2380, r: 170, h: 30 }, { u: -1330, v: 2300, r: 90, h: 14 },
  // Chalk slopes
  { u: -1010, v: 2050, r: 150, h: 22 }, { u: -820, v: 2330, r: 190, h: 30 }, { u: -1230, v: 1560, r: 130, h: 20 }, { u: -560, v: 2150, r: 150, h: 17 },
  { u: -300, v: 2050, r: 160, h: 12 }, { u: -870, v: 1380, r: 110, h: 11 },
  // east bank beyond the river, the hills north and west of the city
  { u: 1450, v: 100, r: 320, h: 40 }, { u: 1500, v: 1500, r: 300, h: 34 }, { u: 1450, v: -900, r: 280, h: 32 },
  { u: 0, v: -1330, r: 420, h: 32 }, { u: -1350, v: -400, r: 380, h: 26 }, { u: -1300, v: 700, r: 300, h: 18 },
];

/** Ridges { points, height, width, gaps } (local): the chalk ridge south of the road. */
export const RIDGES_LOCAL = [
  { points: [[-1650, 2560], [-1350, 2470], [-1050, 2430], [-750, 2420], [-450, 2380], [-150, 2430], [200, 2500], [600, 2560]], height: 30, width: 150, gaps: [] },
];

/** Flattened ground { u, v, r, feather, level } (levels are absolute heights). */
export const FLATS_LOCAL = [
  { u: -1566, v: 2321, r: 50, feather: 30, level: 25.6 }, // Postal ascent camp and the pass gate
  { u: -1470, v: 2255, r: 12, feather: 14, level: 'auto' },
  { u: -960, v: 1800, r: 18, feather: 20, level: 'auto' }, // chalk overlook
  { u: -545, v: 1540, r: 24, feather: 20, level: 'auto' }, // mills
  { u: -360, v: 1480, r: 24, feather: 20, level: 'auto' },
  { u: -30, v: 1250, r: 20, feather: 22, level: 1.9 }, // dam approaches
  { u: -30, v: 1345, r: 22, feather: 24, level: 1.9 },
  { u: -20, v: 1155, r: 28, feather: 30, level: LEVELS.south - 0.15 }, // before the south gate
];

/** The terrain of the city: the wall polygon pushed out, levels from cityLevel(). */
export const CITY_FLAT = { pts: CITY_WALL.map((n) => [n.u, n.v]), push: 38, feather: 110 };

/** Forests of the sheet { id, kind, pts (local) }: orchards, groves along the arm and the river, the northern wood. */
export const FORESTS_LOCAL = [
  { id: 'ain_north_wood', kind: 'mixed', pts: [[-700, -1330], [-380, -1280], [-60, -1340], [340, -1290], [700, -1330], [760, -1180], [500, -1190], [180, -1230], [-120, -1250], [-400, -1200], [-690, -1220]] },
  { id: 'ain_west_wood', kind: 'mixed', pts: [[-1650, -600], [-1100, -700], [-960, -300], [-1000, 400], [-1150, 900], [-1650, 880]] },
  { id: 'ain_east_wood', kind: 'alder', pts: [[1300, -1000], [1700, -900], [1750, 300], [1400, 400], [1260, -200]] },
  { id: 'ain_orchard_s', kind: 'mixed', pts: [[-380, 1620], [-120, 1560], [60, 1700], [-60, 1900], [-330, 1880]] },
  { id: 'ain_mill_wood', kind: 'alder', pts: [[-1100, 1500], [-860, 1470], [-780, 1560], [-980, 1590]] },
  { id: 'ain_chalk_pines', kind: 'pine', pts: [[-1200, 2250], [-900, 2480], [-600, 2450], [-700, 2250], [-950, 2160]] },
];

// ---------------------------------------------------------------------------------------------------------------
// Named places (local u, v, yaw). The builders register them as world spots (world.spot).
// yaw: 0 = facing +Z (south), PI/2 = facing +X (east), PI = north, -PI/2 = west.
// ---------------------------------------------------------------------------------------------------------------
export const SPOTS_LOCAL = {
  // pass gate (the scene change from the east pass of the old map) and the Postal ascent
  ain_pass_arrival: [-1600, 2336, 2.0], postal_camp: [-1548, 2300, 2.0], postal_sign: [-1522, 2282, 2.0],
  // Stone Ledge: the safe camp below the slope and the start of the clearing (stage 4 adds the survey points)
  ledge_camp: [-1395, 2214, 2.2], ledge_start: [-1330, 2125, 2.3],
  // Chalk slopes: the viewpoint (D10), the fork where Lissa waits (D11)
  chalk_view: [-974, 1789, 2.3], lissa_fork: [-770, 1658, 2.2],
  // White mills: the wheel (D12) and the camp; the south dam (D13)
  mill_wheel: [-505, 1500, 2.2], mills_camp: [-560, 1556, 2.2], dam_south: [-30, 1348, Math.PI], dam_north: [-28, 1244, Math.PI], dam_gauge: [-30, 1330, 0],
  // the south gate (stage 5 builds the gate and the city)
  gate_south_out: [-20, 1150, Math.PI], gate_south_in: [-20, 1070, Math.PI],
};

/** Signposts along the road { u, v, rot, lines } (rot: facing of the board, as in MapData SIGNS). */
export const SIGNS_LOCAL = [
  { u: -1520, v: 2292, rot: 2.0 + Math.PI / 2, lines: ['Запад: перевальный ход — Ольховка · Аксель', 'Восток: Каменный уступ · Меловые склоны · Айнстрей'] },
  { u: -985, v: 1835, rot: 2.3 + Math.PI / 2, lines: ['Айнстрей — 1,4 км', 'Белые мельницы · Южная дамба', 'Назад: Каменный уступ · Почтовый подъём'] },
  { u: -765, v: 1668, rot: 2.3 + Math.PI / 2, lines: ['Тракт: Белые мельницы · Южная дамба · Айнстрей', 'Тропа налево: Меловые склоны (смотровая площадка)'] },
  { u: -24, v: 1356, rot: Math.PI, lines: ['Южная дамба. Отметка воды: 1,40 (старая)', 'К северу: Южные ворота Айнстрея', 'К югу: Белые мельницы · Каменный уступ'] },
];

// ---------------------------------------------------------------------------------------------------------------
// The Stone Ledge: a gorge that the road runs through; the rockfall fills it (the rockfall quest, D03-D09)
// ---------------------------------------------------------------------------------------------------------------
/** The road resampled by arclength (local u, v) with unit tangents: the axis of the gorge. The first point is the extension to the sheet edge. */
function resample(pts, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    for (let d = carry; d < L; d += step) out.push([ax + ((bx - ax) * d) / L, ay + ((by - ay) * d) / L, (bx - ax) / L, (by - ay) / L]);
    carry = ((carry - L) % step + step) % step;
    if (i === pts.length - 2) out.push([bx, by, (bx - ax) / L, (by - ay) / L]);
  }
  return out;
}
const ROAD_EXT = [[-1700, 2379], ...TRAKT.slice(0, 13)];
const ROAD_RS = resample(ROAD_EXT, 8).map((p, i, a) => {
  // smooth the tangent over neighbours (no kinks in the walls)
  let tx = 0, ty = 0;
  for (let k = Math.max(0, i - 2); k <= Math.min(a.length - 1, i + 2); k++) { tx += a[k][2]; ty += a[k][3]; }
  const L = Math.hypot(tx, ty) || 1;
  return { u: p[0], v: p[1], tu: tx / L, tv: ty / L };
});
// arclength (metres) along the resampled road, 0 at the sheet edge
let _acc = 0;
ROAD_RS.forEach((p, i) => { if (i) _acc += Math.hypot(p.u - ROAD_RS[i - 1].u, p.v - ROAD_RS[i - 1].v); p.s = _acc; });

/** Where the rockfall sits: the middle of the road between TRAKT[5] and TRAKT[6]. */
const RF0 = [(TRAKT[5][0] + TRAKT[6][0]) / 2, (TRAKT[5][1] + TRAKT[6][1]) / 2];
const _rfT = (() => { const dx = TRAKT[6][0] - TRAKT[5][0], dz = TRAKT[6][1] - TRAKT[5][1], L = Math.hypot(dx, dz); return [dx / L, dz / L]; })();
const S_RF = (() => {
  let best = 0, bd = Infinity;
  ROAD_RS.forEach((p, i) => { const d = Math.hypot(p.u - RF0[0], p.v - RF0[1]); if (d < bd) { bd = d; best = i; } });
  return ROAD_RS[best].s;
})();

/**
 * Frame of the rockfall: origin on the road, f = along the road towards the capital, l = to the left (north-west, the high wall),
 * yaw = the yaw of a three.js Frame whose local +z is f and +x is l.
 */
export const LEDGE = {
  u: RF0[0], v: RF0[1],
  fu: _rfT[0], fv: _rfT[1], // forward, local (u, v)
  yaw: Math.atan2(_rfT[0], _rfT[1]),
  /** local (f, l) -> world (x, z) in the straight frame at the rockfall (valid for |f| < 70) */
  at(f, l) {
    const lu = _rfT[1], lv = -_rfT[0]; // left of forward (north-west when going north-east)
    return toWorld(this.u + this.fu * f + lu * l, this.v + this.fv * f + lv * l);
  },
};
// check the left normal really points north-west (decreasing v for a south-to-north road): lu < 0, lv < 0 for fu > 0, fv < 0

/** Half-widths of the gorge floor by f (metres along the road from the rockfall): [f, north, south]. The south wall steps back at the bay. */
const FLOOR = [
  [-420, 46, 46], [-300, 40, 40], [-210, 31, 30], [-140, 22, 22], [-80, 17, 17], [-36, 15, 15], [-8, 15, 16], [2, 15, 31], [30, 15, 31], [44, 16, 17],
  [72, 17, 17], [110, 24, 24], [160, 34, 34],
];
const lerpTable = (f, k) => {
  if (f <= FLOOR[0][0]) return FLOOR[0][k];
  for (let i = 1; i < FLOOR.length; i++) if (f <= FLOOR[i][0]) { const a = FLOOR[i - 1], b = FLOOR[i]; return a[k] + ((b[k] - a[k]) * (f - a[0])) / (b[0] - a[0]); }
  return FLOOR[FLOOR.length - 1][k];
};
export const LEDGE_WALLS = { top: 5.5, face: 5, north: 16, south: 15, fadeEnd: 50 };
/** Half-widths [north, south] of the gorge floor at f (metres along the road from the rockfall). */
export const ledgeFloor = (f) => [lerpTable(f, 1), lerpTable(f, 2)];
/** The two cliff bands (world x, z polylines): they close the valley of the Postal ascent, the rockfall is the only way through. */
export const LEDGE_CLIFFS = ['north', 'south'].map((side, si) => {
  const sgn = side === 'north' ? 1 : -1;
  const pts = [];
  for (const p of ROAD_RS) {
    const f = p.s - S_RF;
    if (f > 165) break;
    const off = lerpTable(f, si + 1) + LEDGE_WALLS.top + LEDGE_WALLS.face;
    // left of the direction of travel in (u, v): (tv, -tu)
    pts.push(toWorld(p.u + p.tv * sgn * off, p.v - p.tu * sgn * off));
  }
  return { side, pts, top: LEDGE_WALLS.top, face: LEDGE_WALLS.face, height: LEDGE_WALLS[side], fadeEnd: LEDGE_WALLS.fadeEnd };
});

/** The floor of the gorge around the rockfall is levelled (the quest area is built on one level); merged into the flats by MapData. */
export const LEDGE_FLAT = { u: LEDGE.u, v: LEDGE.v, r: 50, feather: 16, level: 'auto' };
