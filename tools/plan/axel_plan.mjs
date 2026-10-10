/**
 * PLAN (stage 2), not used by the game. Layout of the new Axel.
 *
 * Local coordinates: metres from the centre of the Fountain square, u = east (+X), v = south (+Z).
 * World = (AXEL.x + u, AXEL.z + v), AXEL in world_plan.mjs = (-330, 20).
 *
 * Buildings: { id, label, kind, u, v, w, d, face, floors, landmark? }
 *   w = frontage (along the street), d = depth, face = side the front door looks at: N | S | E | W.
 *   kind: public | guild | tavern | inn | shop | workshop | warehouse | stable | temple | house | military
 * Everything not listed as a key building is filled in by the frontage generator in
 * render_plan.mjs (houses, shops, workshops by district) — that is only a feasibility test,
 * the real houses are placed in stage 3.
 */

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
  { id: 'cemetery', name: 'Кладбище', pts: [[-98, -78], [-76, -86], [-72, -58], [-94, -46]] },
  { id: 'secret_garden', name: 'Тайный сад', pts: [[-90, -42], [-80, -44], [-78, -34], [-88, -32]] },
  { id: 'lumber_yard', name: 'Лесной склад', pts: [[-100, 24], [-88, 24], [-88, 36], [-100, 36]] },
  { id: 'guild_yard', name: 'Двор гильдии', pts: [[-6, -62], [22, -62], [22, -50], [-6, -50]] },
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

/** Key buildings (fixed places). */
export const BUILDINGS = [
  // --- Centre
  { id: 'guild', label: 'Гильдия искателей приключений', kind: 'guild', u: 8, v: -40, w: 22, d: 15, face: 'S', floors: 2, landmark: 'колокольня с синей крышей' },
  { id: 'tavern', label: 'Таверна «Кружка и посох»', kind: 'tavern', u: 40, v: -4, w: 16, d: 13, face: 'W', floors: 2 },
  { id: 'town_hall', label: 'Ратуша', kind: 'public', u: -38, v: -6, w: 18, d: 14, face: 'E', floors: 2, landmark: 'часовая башня' },
  { id: 'exchange', label: 'Меняльная контора', kind: 'public', u: -14, v: 28, w: 11, d: 9, face: 'N', floors: 2 },
  { id: 'post', label: 'Почтовая станция', kind: 'public', u: 24, v: 28, w: 10, d: 9, face: 'N', floors: 2 },
  { id: 'barracks', label: 'Казармы стражи', kind: 'military', u: 20, v: -88, w: 16, d: 9, face: 'S', floors: 2 },
  // --- Trade
  { id: 'market_hall', label: 'Крытый рынок', kind: 'public', u: 57, v: 30, w: 14, d: 8, face: 'N', floors: 1, inside: 'market_square', landmark: 'открытая аркада с часами посреди площади' },
  { id: 'bakery', label: 'Пекарня Лины', kind: 'shop', u: 56, v: -5, w: 9, d: 7, face: 'S', floors: 2 },
  { id: 'store', label: 'Лавка Отто «Всё для путника»', kind: 'shop', u: 78, v: -11, w: 9, d: 7, face: 'S', floors: 2 },
  { id: 'alchemist', label: 'Алхимик', kind: 'shop', u: 30, v: 48, w: 8, d: 8, face: 'N', floors: 3, landmark: 'фиолетовая башенка' },
  { id: 'weaponsmith', label: 'Оружейник', kind: 'shop', u: 82, v: 14, w: 9, d: 7, face: 'N', floors: 2 },
  { id: 'magic_shop', label: 'Лавка магических товаров', kind: 'shop', u: 58, v: -26, w: 7, d: 7, face: 'E', floors: 2 },
  // --- Caravan district
  { id: 'caravan_office', label: 'Караванная контора (Марта)', kind: 'public', u: 46, v: 49, w: 10, d: 7, face: 'S', floors: 2 },
  { id: 'inn_axle', label: 'Постоялый двор «Ось и колесо»', kind: 'inn', u: 21, v: 74, w: 16, d: 9, face: 'E', floors: 3, landmark: 'колесо-вывеска над воротами' },
  { id: 'inn_dust', label: 'Постоялый двор «Пыльный тракт»', kind: 'inn', u: 44, v: 84, w: 14, d: 7, face: 'N', floors: 2 },
  { id: 'stables', label: 'Конюшни', kind: 'stable', u: 72, v: 64, w: 12, d: 7, face: 'W', floors: 1 },
  // --- Temple district (terrace +2.4 m)
  { id: 'temple', label: 'Храм Эрис', kind: 'temple', u: -60, v: -74, w: 14, d: 26, face: 'S', floors: 1, landmark: 'шпиль — самое высокое здание города' },
  { id: 'rectory', label: 'Дом настоятеля', kind: 'public', u: -40, v: -76, w: 10, d: 8, face: 'W', floors: 2 },
  { id: 'hospice', label: 'Лечебница', kind: 'public', u: -38, v: -60, w: 10, d: 7, face: 'W', floors: 2 },
  { id: 'crypt', label: 'Склеп (crypt_door)', kind: 'temple', u: -86, v: -66, w: 6, d: 6, face: 'E', floors: 1, inside: 'cemetery' },
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
