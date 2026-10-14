/**
 * Axel — the walled city (data). Built by world/build/Town.js; checked and drawn by
 * tools/plan/render_plan.mjs (docs/axel-city-plan.md).
 *
 * Local coordinates: metres from the centre of the Fountain square, u = east (+X), v = south (+Z).
 * World = (AXEL.x + u, AXEL.z + v).
 *
 * Buildings: { id, label, kind, u, v, w, d, face, floors, landmark? }
 *   w = frontage (along the street), d = depth, face = side the front door looks at: N | S | E | W.
 *   kind: public | guild | tavern | inn | shop | workshop | warehouse | stable | temple | house | military
 * Rows of ordinary houses are the generated lots in build/AxelLots.js.
 */

/** Centre of the Fountain square (world) and the city's ground level. */
export const AXEL = { x: -330, z: 20, level: 1.0 };

/** Local (u, v) -> world [x, z]. */
export const toWorld = (u, v) => [AXEL.x + u, AXEL.z + v];

/** Rotation (Frame / house() `rot`) for a facade facing N | S | E | W. */
export const FACE_ROT = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

/** City wall: towers and gates in order (clockwise from the north gate). */
export const WALL = {
  height: 7.5, // walk-top ~6 m, merlons above (castle-kit 'wall' scaled ~[4, 5.7, 3])
  thickness: 3,
  gateWidth: 7,
  nodes: [
    { u: -8, v: -110, gate: 'north', name: 'Северные ворота (Горные)' },
    { u: 34, v: -108 },
    { u: 74, v: -94, big: true, name: 'Речная башня' },
    { u: 98, v: -62 },
    { u: 104, v: -34 },
    { u: 106, v: -8, gate: 'east', name: 'Восточные ворота (Мостовые)' },
    { u: 104, v: 22 },
    { u: 98, v: 56 },
    { u: 80, v: 86, big: true, name: 'Караванная башня' },
    { u: 44, v: 104 },
    { u: 6, v: 110, gate: 'south', name: 'Южные ворота (Караванные)' },
    { u: -34, v: 108 },
    { u: -70, v: 96 },
    { u: -96, v: 70 },
    { u: -108, v: 38 },
    { u: -112, v: 6, gate: 'west', name: 'Западные ворота (Лесные)' },
    { u: -110, v: -30 },
    { u: -104, v: -66 },
    { u: -86, v: -96, big: true, name: 'Храмовая башня' },
    { u: -48, v: -110 },
  ],
};

/** Pomerium: a continuous street just inside the wall (patrols, access to towers, NPC routes). */
export const RING = { inset: 8, width: 4.5 };

/** Open spaces (polygons). */
export const SQUARES = [
  { id: 'fountain_square', name: 'Площадь Фонтана', pts: [[-22, -16], [-4, -21], [16, -19], [25, -5], [22, 14], [4, 21], [-18, 15], [-25, 0]] },
  { id: 'temple_square', name: 'Храмовая площадь', pts: [[-72, -54], [-52, -58], [-38, -48], [-42, -34], [-62, -32], [-74, -42]] },
  { id: 'market_square', name: 'Рыночная площадь', pts: [[38, 18], [70, 16], [78, 32], [66, 46], [40, 42]] },
  { id: 'well_square', name: 'Колодезная площадь', pts: [[46, -70], [66, -74], [74, -58], [60, -48], [46, -54]] },
  { id: 'craft_square', name: 'Мастеровая площадь', pts: [[-82, 44], [-58, 40], [-52, 58], [-66, 68], [-84, 60]] },
  { id: 'caravan_yard', name: 'Караванный двор', pts: [[26, 56], [62, 52], [66, 74], [54, 78], [28, 76]] },
  { id: 'west_gate_place', name: 'У Западных ворот', pts: [[-104, -4], [-90, -4], [-88, 18], [-104, 20]] },
  { id: 'east_gate_place', name: 'У Восточных ворот', pts: [[86, -18], [100, -18], [100, 4], [86, 4]] },
  { id: 'north_gate_place', name: 'У Северных ворот', pts: [[-20, -102], [2, -102], [2, -90], [-20, -90]] },
  { id: 'south_gate_place', name: 'У Южных ворот', pts: [[-6, 92], [18, 92], [18, 104], [-6, 104]] },
];

/** Non-building areas that houses must not cover (cemetery, yards, gardens). */
export const AREAS = [
  { id: 'cemetery', name: 'Кладбище', pts: [[-84, -74], [-72, -86], [-70, -60], [-86, -54]] },
  { id: 'secret_garden', name: 'Тайный сад', pts: [[-90, -42], [-80, -44], [-78, -34], [-88, -32]] },
  { id: 'lumber_yard', name: 'Лесной склад', pts: [[-96, 24], [-86, 24], [-86, 34], [-96, 34]] },
  { id: 'guild_yard', name: 'Двор гильдии', pts: [[-6, -62], [22, -62], [22, -50], [-6, -50]] },
  { id: 'guild_forecourt', name: 'Площадка перед гильдией', pts: [[-6, -32], [23, -32], [23, -19], [-6, -19]] },
  { id: 'tavern_terrace', name: 'Терраса таверны', pts: [[25, -13], [33, -13], [33, 5], [25, 5]] },
  { id: 'hall_steps', name: 'Ступени ратуши', pts: [[-30.4, -14], [-25, -14], [-25, 2], [-30.4, 2]] },
  { id: 'alchemist_front', name: 'Перед алхимиком', pts: [[25, 34], [36, 34], [36, 43.4], [25, 43.4]] },
];

/** Streets. main = gate to square (8 m, carts both ways), secondary 5 m, lane 3 m. */
export const STREETS = [
  { id: 'north_street', name: 'Горная улица', kind: 'main', width: 8, pts: [[-8, -110], [-10, -90], [-13, -70], [-16, -48], [-16, -30], [-14, -18]] },
  { id: 'market_street', name: 'Мостовая улица', kind: 'main', width: 8, pts: [[106, -8], [90, -6], [72, 2], [54, 10], [38, 13], [22, 11]] },
  { id: 'caravan_street', name: 'Караванная улица', kind: 'main', width: 8, pts: [[6, 110], [8, 92], [12, 72], [10, 50], [6, 32], [3, 20]] },
  { id: 'forge_street', name: 'Кузнечная улица', kind: 'main', width: 8, pts: [[-112, 6], [-94, 10], [-74, 16], [-52, 18], [-34, 15], [-21, 11]] },
  { id: 'temple_rise', name: 'Храмовый подъём', kind: 'secondary', width: 5, pts: [[-16, -14], [-28, -24], [-42, -40]] },
  { id: 'well_street', name: 'Колодезная улица', kind: 'secondary', width: 5, pts: [[16, -19], [30, -34], [46, -56]] },
  { id: 'riverside', name: 'Набережная', kind: 'secondary', width: 5, pts: [[66, -64], [80, -44], [86, -18]] },
  { id: 'north_link', name: 'Гильдейская улица', kind: 'secondary', width: 5, pts: [[-14, -76], [10, -74], [34, -78], [48, -68]] },
  { id: 'market_south', name: 'Рядская улица', kind: 'secondary', width: 5, pts: [[66, 46], [66, 55]] },
  { id: 'craft_lane', name: 'Слесарный проезд', kind: 'secondary', width: 5, pts: [[-52, 18], [-60, 32], [-68, 42]] },
  { id: 'south_cross', name: 'Южная поперечная', kind: 'secondary', width: 5, pts: [[10, 50], [-12, 52], [-34, 58], [-53, 58]] },
  { id: 'west_quarter', name: 'Слободская улица', kind: 'secondary', width: 5, pts: [[-68, -34], [-76, -14], [-80, 4], [-80, 15]] },
  { id: 'crooked_lane', name: 'Кривой переулок', kind: 'lane', width: 3, pts: [[66, 6], [68, -14], [72, -36], [70, -56]] },
  { id: 'cat_lane', name: 'Кошачий переулок', kind: 'lane', width: 3, pts: [[-12, 52], [-14, 72], [-22, 94]] },
  { id: 'arch_lane', name: 'Арочный проход', kind: 'lane', width: 3, pts: [[-34, 58], [-40, 80], [-50, 92]] },
  { id: 'garden_lane', name: 'Садовый проход', kind: 'lane', width: 3, pts: [[-72, -42], [-84, -38]] },
  { id: 'market_back', name: 'Задний ряд', kind: 'lane', width: 3, pts: [[78, 32], [90, 42]] },
  { id: 'west_lane', name: 'Тесный переулок', kind: 'lane', width: 3, pts: [[-76, -14], [-96, -20]] },
  { id: 'tavern_lane', name: 'Пивной переулок', kind: 'lane', width: 3, pts: [[30, -34], [50, -22], [66, -14]] },
];

/**
 * Key buildings (fixed places). w × d = the walls as built (Town.js builds exactly this size);
 * `annex` = parts outside the walls in the building frame (x along the front, z towards the
 * front): towers, turrets, steps — the plan keeps the neighbours clear of them too.
 */
export const BUILDINGS = [
  // --- Centre
  { id: 'guild', label: 'Гильдия искателей приключений', kind: 'guild', u: 8, v: -40, w: 18, d: 13, face: 'S', floors: 2, landmark: 'колокольня с синей крышей', annex: [{ x: 9.6, z: -5, w: 4.2, d: 4.2 }, { x: 0, z: 7.6, w: 5, d: 1.6 }] },
  { id: 'tavern', label: 'Таверна «Кружка и посох»', kind: 'tavern', u: 40, v: -4, w: 16, d: 12, face: 'W', floors: 2, annex: [{ x: 0, z: 8.4, w: 14, d: 3 }] },
  { id: 'town_hall', label: 'Ратуша', kind: 'public', u: -38, v: -6, w: 16, d: 12, face: 'E', floors: 2, landmark: 'часовая башня', annex: [{ x: 0, z: 5.6, w: 5, d: 4.4 }] },
  { id: 'exchange', label: 'Меняльная контора', kind: 'public', u: -14, v: 28, w: 11, d: 9, face: 'N', floors: 2 },
  { id: 'post', label: 'Почтовая станция', kind: 'public', u: 24, v: 28, w: 10, d: 9, face: 'N', floors: 2 },
  { id: 'barracks', label: 'Казармы стражи', kind: 'military', u: 20, v: -88, w: 16, d: 9, face: 'S', floors: 2 },
  // --- Trade
  { id: 'market_hall', label: 'Крытый рынок', kind: 'public', u: 57, v: 30, w: 14, d: 8, face: 'N', floors: 1, inside: 'market_square', landmark: 'открытая аркада с часами посреди площади' },
  { id: 'bakery', label: 'Пекарня Лины', kind: 'shop', u: 56, v: -5, w: 9, d: 7, face: 'S', floors: 2 },
  { id: 'store', label: 'Лавка Отто «Всё для путника»', kind: 'shop', u: 78, v: -11, w: 9, d: 7, face: 'S', floors: 2 },
  { id: 'alchemist', label: 'Алхимик', kind: 'shop', u: 30, v: 48, w: 8, d: 8, face: 'N', floors: 3, landmark: 'фиолетовая башенка', annex: [{ x: 4.5, z: -4.5, w: 3.8, d: 3.8 }] },
  { id: 'weaponsmith', label: 'Оружейник', kind: 'shop', u: 82, v: 14, w: 9, d: 7, face: 'N', floors: 2 },
  { id: 'magic_shop', label: 'Лавка магических товаров', kind: 'shop', u: 58, v: -26, w: 7, d: 7, face: 'E', floors: 2 },
  // --- Caravan district
  { id: 'caravan_office', label: 'Караванная контора (Марта)', kind: 'public', u: 46, v: 49, w: 10, d: 7, face: 'S', floors: 2 },
  { id: 'inn_axle', label: 'Постоялый двор «Ось и колесо»', kind: 'inn', u: 21, v: 74, w: 16, d: 9, face: 'E', floors: 3, landmark: 'колесо-вывеска над воротами' },
  { id: 'inn_dust', label: 'Постоялый двор «Пыльный тракт»', kind: 'inn', u: 44, v: 84, w: 14, d: 7, face: 'N', floors: 2 },
  { id: 'stables', label: 'Конюшни', kind: 'stable', u: 72, v: 64, w: 12, d: 7, face: 'W', floors: 1 },
  // --- Temple district (the temple hill, MapData FLATS)
  { id: 'temple', label: 'Храм Эрис', kind: 'temple', u: -60, v: -74, w: 12, d: 22, face: 'S', floors: 1, landmark: 'шпиль — самое высокое здание города', annex: [{ x: 0, z: 11.9, w: 5, d: 1.8 }] },
  { id: 'rectory', label: 'Дом настоятеля', kind: 'public', u: -40, v: -76, w: 10, d: 8, face: 'W', floors: 2 },
  { id: 'hospice', label: 'Лечебница', kind: 'public', u: -38, v: -60, w: 10, d: 7, face: 'W', floors: 2 },
  { id: 'crypt', label: 'Склеп (crypt_door)', kind: 'temple', u: -79, v: -70, w: 6, d: 6, face: 'E', floors: 1, inside: 'cemetery' },
  // --- Craft district
  { id: 'forge', label: 'Кузница', kind: 'workshop', u: -78, v: 28, w: 12, d: 9, face: 'N', floors: 1, landmark: 'большая труба с дымом' },
  { id: 'locksmith', label: 'Слесарная мастерская', kind: 'workshop', u: -48, v: 30, w: 10, d: 8, face: 'W', floors: 2 },
];

/** Landmarks per district (what the player sees from afar). */
export const LANDMARKS = [
  { u: 0, v: 0, name: 'Фонтан со статуей Эрис' },
  { u: -60, v: -86, name: 'Шпиль храма' },
  { u: 12, v: -46, name: 'Колокольня гильдии' },
  { u: -38, v: -12, name: 'Часы ратуши' },
  { u: 86, v: 30, name: 'Крытый рынок' },
  { u: 30, v: 48, name: 'Башенка алхимика' },
  { u: -78, v: 28, name: 'Труба кузницы' },
  { u: 21, v: 74, name: 'Колесо «Оси и колеса»' },
  { u: 56, v: -61, name: 'Старая липа у колодца' },
];

/** Functional districts (coarse polygons; borders are soft — they only colour the plan and assign plot types). */
export const DISTRICTS = [
  { id: 'center', name: 'Центр', color: '#d9a441', pts: [[-30, -60], [26, -60], [34, -18], [30, 34], [-24, 34], [-34, 4]] },
  { id: 'temple', name: 'Храмовый холм', color: '#7a8cc4', pts: [[-110, -110], [-30, -110], [-30, -60], [-34, -30], [-80, -28], [-110, -30]] },
  { id: 'trade', name: 'Торговый район', color: '#d46a4f', pts: [[34, -18], [66, -30], [104, -30], [104, 50], [70, 52], [30, 40], [30, 34]] },
  { id: 'caravan', name: 'Караванный район', color: '#b08a5a', pts: [[14, 40], [70, 52], [104, 50], [100, 110], [14, 110]] },
  { id: 'craft', name: 'Ремесленный район', color: '#8a7a6a', pts: [[-112, 15], [-34, 15], [-30, 40], [-30, 110], [-112, 110]] },
  { id: 'res_ne', name: 'Речной квартал', color: '#5f9e6e', pts: [[-30, -110], [110, -110], [104, -30], [66, -30], [34, -18], [26, -60], [-30, -60]] },
  { id: 'res_w', name: 'Западная слобода', color: '#6fae8a', pts: [[-112, -30], [-34, -30], [-34, 4], [-34, 15], [-112, 15]] },
  { id: 'res_s', name: 'Южный квартал', color: '#7fb87a', pts: [[-30, 34], [14, 34], [14, 110], [-30, 110]] },
];

/** Wanted number of buildings (key + generated). */
export const TARGET = { min: 80, max: 118 };

/**
 * Space a building takes beyond its w × d walls (m), as built by Kit.house(): `side` = each side
 * wall (roof overhang, plinth), `back` = the back (overhang + the jetty of the upper storeys),
 * `front` by kind = what stands in front of the door (step, lantern, sign, awning, workbench,
 * hay). Neighbouring envelopes keep GAP apart (detached houses, nothing inside each other).
 */
export const ENVELOPE = {
  side: 0.45, back: 0.75, gap: 0.3,
  front: { house: 1.0, shop: 1.7, workshop: 2.2, warehouse: 1.4, stable: 2.4, inn: 1.6, public: 1.2, military: 1.2, guild: 1.0, tavern: 1.0, temple: 1.0 },
};

/** Turning radius of the street centre lines at their bends (m). */
export const BEND_RADIUS = { main: 16, secondary: 11, lane: 7, ring: 14 };

/**
 * A polyline with rounded bends: the straight runs stay, every corner becomes an arc of `radius`
 * (smaller where the runs are short), sampled about every `step` m. `closed` = a loop (no repeated
 * first point in the input or the output).
 */
export function smoothLine(pts, radius, closed = false, step = 2) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const b = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push([b[0], b[1]]); continue; }
    const a = pts[(i + n - 1) % n], c = pts[(i + 1) % n];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], d2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    const half = Math.tan(Math.abs(turn) / 2);
    if (Math.abs(turn) < 0.02) { out.push([b[0], b[1]]); continue; }
    const t = Math.min(radius * half, 0.45 * l1, 0.45 * l2);
    const r = t / half, sg = Math.sign(turn);
    const s0 = [b[0] - d1[0] * t, b[1] - d1[1] * t];
    const cc = [s0[0] - d1[1] * sg * r, s0[1] + d1[0] * sg * r]; // centre on the inside of the bend
    const k = Math.max(2, Math.ceil((r * Math.abs(turn)) / step));
    for (let j = 0; j <= k; j++) {
      const ang = (turn * j) / k, cs = Math.cos(ang), sn = Math.sin(ang);
      const rx = s0[0] - cc[0], rz = s0[1] - cc[1];
      out.push([cc[0] + rx * cs - rz * sn, cc[1] + rx * sn + rz * cs]);
    }
  }
  return out;
}

/** Built centre line of a street (local u, v): its polyline with rounded bends. */
export const streetLine = (s) => smoothLine(s.pts, BEND_RADIUS[s.kind]);

/** Inset of a closed polygon by d metres (towards its centroid side of every edge). */
export function insetPolygon(pts, d) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cz = pts.reduce((s, p) => s + p[1], 0) / n;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    let nx = -(b[1] - a[1]), nz = b[0] - a[0];
    const L = Math.hypot(nx, nz);
    nx /= L; nz /= L;
    if ((cx - (a[0] + b[0]) / 2) * nx + (cz - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    return [[a[0] + nx * d, a[1] + nz * d], [b[0] + nx * d, b[1] + nz * d]];
  });
  return lines.map((l, i) => {
    const [p1, p2] = lines[(i + n - 1) % n], [p3, p4] = l;
    const d1x = p2[0] - p1[0], d1z = p2[1] - p1[1], d2x = p4[0] - p3[0], d2z = p4[1] - p3[1];
    const den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) return p3;
    const t = ((p3[0] - p1[0]) * d2z - (p3[1] - p1[1]) * d2x) / den;
    return [p1[0] + d1x * t, p1[1] + d1z * t];
  });
}

/** Built centre line of the pomerium (closed loop, local u, v; first point not repeated). */
export const ringLine = () => smoothLine(insetPolygon(WALL.nodes.map((n) => [n.u, n.v]), RING.inset), BEND_RADIUS.ring, true);

/** Generated plots by district: what kind of building and how big. */
export const FILL = {
  center: { kinds: ['shop', 'house'], w: [7, 10], d: [7, 9] },
  trade: { kinds: ['shop', 'shop', 'house'], w: [7, 9], d: [6, 9] },
  caravan: { kinds: ['warehouse', 'house', 'stable'], w: [8, 12], d: [7, 10] },
  craft: { kinds: ['workshop', 'house', 'warehouse'], w: [7, 11], d: [7, 10] },
  temple: { kinds: ['house'], w: [6, 8], d: [6, 8] },
  res_ne: { kinds: ['house'], w: [7, 10], d: [7, 10] },
  res_w: { kinds: ['house'], w: [5, 8], d: [5, 7] },
  res_s: { kinds: ['house'], w: [5, 8], d: [5, 7] },
};
