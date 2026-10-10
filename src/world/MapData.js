import * as THREE from 'three';

/**
 * The overworld as data. North = -Z, east = +X, metres.
 *
 * Geography: the walled town of Axel sits in a river valley. The Lunnaya river runs from the
 * northern mountains past the town's east wall and on to the south-west. A long ridge to the
 * north separates the home valley from the ancient ruins, the old mines and the crimson gorge;
 * roads cross it through natural gaps. West of town lies the Whispering Forest, south the
 * farmland, east across the river the village of Olkhovka and the road to the eastern pass.
 *
 * Everything that shapes the terrain or gets drawn on the map lives here, so new regions are
 * added by data + a builder function (see world/build/).
 */

/** Terrain plane half-size (the playable world is ±HALF). */
export const HALF = 450;

const v = (x, z) => new THREE.Vector3(x, 0, z);

/**
 * Regions: discovery banners, checkpoints, map labels. `r` is the discovery radius; the
 * smallest region containing the player wins (so sub-areas override big ones).
 * `tier` 0 = home valley (vertical slice), 1 = outer territories, 2 = expansion stubs.
 */
export const REGIONS = [
  { id: 'axel', name: 'Аксель', sub: 'Город начинающих искателей приключений', center: v(0, 0), r: 66, icon: '⌂', safe: true, tier: 0, spawn: v(0, 48), spawnYaw: Math.PI },
  { id: 'caravan', name: 'Стоянка караванов', sub: 'Южные ворота Акселя', center: v(-16, 78), r: 14, icon: '⛟', safe: true, tier: 0, spawn: v(-10, 76), spawnYaw: Math.PI },
  { id: 'farms', name: 'Поля Акселя', sub: 'Фермы и мельница', center: v(4, 128), r: 58, icon: '❀', tier: 0, spawn: v(8, 100), spawnYaw: 0 },
  { id: 'river', name: 'Река Лунная', sub: 'Каменный мост', center: v(86, 0), r: 18, icon: '≈', tier: 0, spawn: v(70, 2), spawnYaw: Math.PI / 2 },
  { id: 'olkhovka', name: 'Деревня Ольховка', sub: 'Последний привал перед перевалом', center: v(175, -25), r: 40, icon: '⌂', safe: true, tier: 0, spawn: v(150, -20), spawnYaw: Math.PI / 2 },
  { id: 'forest', name: 'Шепчущий лес', sub: 'Охотничьи тропы', center: v(-165, 30), r: 100, icon: '♣', tier: 0, spawn: v(-90, 8), spawnYaw: -Math.PI / 2 },
  { id: 'hunters', name: 'Лагерь охотников', sub: 'Шепчущий лес', center: v(-118, 52), r: 16, icon: '⛺', safe: true, tier: 0, spawn: v(-112, 44), spawnYaw: 0 },
  { id: 'glade', name: 'Скрытая поляна', sub: 'Здесь давно никто не бывал', center: v(-240, -40), r: 15, icon: '✿', tier: 0, secret: true },
  { id: 'goblin_den', name: 'Логово капюшонников', sub: 'Гоблинский лагерь', center: v(-205, 112), r: 26, icon: '☠', tier: 0, spawn: v(-180, 92), spawnYaw: -Math.PI / 2 },
  { id: 'watchtower', name: 'Старая сторожевая башня', sub: 'Заброшенный пост', center: v(55, -135), r: 22, icon: '♜', tier: 0, spawn: v(30, -122), spawnYaw: Math.PI / 2 },
  { id: 'cave', name: 'Пещера Старой шахты', sub: 'Вход в подземелье', center: v(-100, -122), r: 18, icon: '◒', tier: 0, spawn: v(-92, -112), spawnYaw: Math.PI },
  { id: 'astrarium', name: 'Руины Астрариума', sub: 'Древняя обсерватория магов', center: v(-20, -300), r: 52, icon: '✶', tier: 1, spawn: v(-20, -250), spawnYaw: Math.PI },
  { id: 'mist_lake', name: 'Озеро Туманов', sub: 'Башня на острове', center: v(215, 215), r: 52, icon: '≋', tier: 1, spawn: v(172, 202), spawnYaw: Math.PI / 2 },
  { id: 'crimson_gorge', name: 'Багровое ущелье', sub: 'Владения Архидемона', center: v(258, -305), r: 56, icon: '♨', tier: 1, spawn: v(240, -262), spawnYaw: Math.PI },
  { id: 'old_mines', name: 'Заброшенный шахтёрский посёлок', sub: 'Дальние земли', center: v(-285, -255), r: 42, icon: '⚒', tier: 2, spawn: v(-250, -225), spawnYaw: Math.PI },
  { id: 'east_pass', name: 'Восточный перевал', sub: 'Дорога завалена', center: v(362, -56), r: 26, icon: '⛰', tier: 2, spawn: v(335, -52), spawnYaw: Math.PI / 2 },
  { id: 'thicket', name: 'Чаща', sub: 'Тёмная часть леса', center: v(-335, 120), r: 46, icon: '♠', tier: 2, spawn: v(-290, 118), spawnYaw: -Math.PI / 2 },
  // Interior spaces (far off the terrain; entered through doors).
  { id: 'dungeon', name: 'Старая шахта', sub: 'Подземелье', center: v(0, 760), r: 70, icon: '◒', tier: 0, interior: true },
];

export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/** Main river (polyline), carved channel + flat water ribbon. */
export const RIVER = {
  points: [[205, -445], [175, -360], [140, -270], [110, -190], [92, -110], [86, -40], [84, 20], [74, 95], [55, 160], [25, 215], [-35, 265], [-120, 320], [-200, 380], [-260, 445]],
  width: 10,
  level: -0.65,
  bed: -1.85,
};

export const LAKES = [
  { id: 'mist_lake', center: v(215, 215), radius: 36, level: -0.6, bottom: -2.2, island: { x: 222, z: 222, r: 7.5 } },
];

export const LAVA = {
  level: -1.4,
  pools: [[244, -318, 7], [262, -324, 6], [276, -310, 7], [282, -294, 5.5], [238, -296, 4.5], [266, -282, 4]],
};

/** Roads: `kind` road = wide dirt road, trail = narrow path. */
export const ROADS = [
  { id: 'east_road', kind: 'road', width: 5, points: [[60, 0], [100, -3], [140, -17], [175, -25]] },
  { id: 'east_pass_road', kind: 'road', width: 4.5, points: [[175, -25], [230, -34], [300, -48], [362, -56]] },
  { id: 'south_road', kind: 'road', width: 5, points: [[0, 60], [3, 95], [9, 124], [30, 148], [57, 158], [100, 178], [150, 196], [176, 204]] },
  { id: 'caravan_lane', kind: 'road', width: 4, points: [[2, 70], [-10, 76], [-24, 80]] },
  { id: 'west_road', kind: 'road', width: 4.5, points: [[-60, 0], [-90, 8], [-110, 30], [-118, 52], [-150, 70], [-180, 92], [-205, 112]] },
  { id: 'glade_trail', kind: 'trail', width: 1.8, points: [[-110, 30], [-150, 12], [-190, -8], [-216, -27], [-240, -40]] },
  { id: 'north_road', kind: 'road', width: 4.5, points: [[0, -60], [-4, -95], [-10, -140], [-18, -185], [-20, -230], [-20, -262]] },
  { id: 'cave_road', kind: 'trail', width: 3.2, points: [[-4, -95], [-40, -106], [-76, -116], [-100, -122]] },
  { id: 'tower_trail', kind: 'trail', width: 2.4, points: [[-7, -118], [18, -122], [38, -130], [55, -135]] },
  { id: 'mines_road', kind: 'trail', width: 3, points: [[-100, -122], [-140, -150], [-178, -182], [-240, -212], [-285, -255]] },
  { id: 'lava_road', kind: 'trail', width: 3.2, points: [[175, -25], [194, -80], [210, -140], [228, -205], [245, -262], [256, -292]] },
  { id: 'thicket_trail', kind: 'trail', width: 2, points: [[-205, 112], [-262, 118], [-335, 120]] },
  { id: 'lake_trail', kind: 'trail', width: 2.4, points: [[176, 204], [196, 204]] },
];

/** Areas flattened to a level (`auto` = the natural height at the centre). */
export const FLATS = [
  { x: 0, z: 0, r: 70, feather: 24, level: 0.8 },
  { x: -14, z: 78, r: 14, feather: 10, level: 0.8 },
  { x: 2, z: 126, r: 46, feather: 30, level: 1.0 },
  { x: 175, z: -25, r: 32, feather: 20, level: 1.4 },
  { x: -118, z: 52, r: 12, feather: 10, level: 'auto' },
  { x: -240, z: -40, r: 11, feather: 8, level: 'auto' },
  { x: -205, z: 112, r: 19, feather: 10, level: 'auto' },
  { x: 55, z: -135, r: 9, feather: 8, level: 'auto' },
  { x: -100, z: -114, r: 9, feather: 7, level: 'auto' },
  { x: -20, z: -300, r: 40, feather: 22, level: 'auto' },
  { x: -285, z: -255, r: 30, feather: 16, level: 'auto' },
  { x: 362, z: -56, r: 14, feather: 10, level: 'auto' },
];

/** Gaussian hills { x, z, r, h }. */
export const HILLS = [
  { x: 55, z: -135, r: 20, h: 9 },
  { x: -100, z: -150, r: 26, h: 20 },
  { x: -60, z: 120, r: 30, h: 7 },
  { x: 130, z: 90, r: 34, h: 9 },
  { x: -170, z: -100, r: 40, h: 11 },
  { x: 140, z: -120, r: 30, h: 12 },
  { x: -40, z: -300, r: 18, h: 3 },
];

/** Long mountain ridges with passes (`gaps`). */
export const RIDGES = [
  {
    points: [[-450, -200], [-300, -212], [-160, -206], [-60, -214], [30, -206], [140, -216], [300, -196], [450, -206]],
    height: 22, width: 46,
    gaps: [{ x: -20, z: -212, r: 26 }, { x: 228, z: -205, r: 24 }, { x: -240, z: -212, r: 22 }],
  },
];

/** Enemy camps: { type, x, z, camp }. Spawned by the EnemyManager. */
export const CAMPS = [
  // Forest edge — the first guild hunt.
  ...[[-150, -6], [-156, 6], [-146, 12], [-160, -2]].map(([x, z]) => ({ type: 'goblin', x, z, camp: 'forest_scouts' })),
  // Goblin den.
  ...[[-200, 104], [-210, 118], [-196, 120], [-214, 106], [-204, 96], [-190, 112], [-220, 124]].map(([x, z]) => ({ type: 'goblin', x, z, camp: 'goblin_den' })),
  ...[[-206, 110], [-216, 98]].map(([x, z]) => ({ type: 'puglin', x, z, camp: 'goblin_den' })),
  // Thicket: puglins and an imp.
  ...[[-320, 112], [-340, 128], [-330, 104]].map(([x, z]) => ({ type: 'puglin', x, z, camp: 'thicket' })),
  { type: 'imp', x: -336, z: 116, camp: 'thicket' },
  // Mushrooms along the river meadows and the lake.
  ...[[110, 60], [116, 72], [104, 76]].map(([x, z]) => ({ type: 'mushroom', x, z, camp: 'river_meadow' })),
  ...[[190, 188], [244, 196], [236, 240], [196, 236], [182, 220]].map(([x, z]) => ({ type: 'mushroom', x, z, camp: 'mist_lake' })),
  // Watchtower squatters.
  ...[[48, -140], [62, -128], [58, -146]].map(([x, z]) => ({ type: 'goblin', x, z, camp: 'watchtower' })),
  // Old mines.
  ...[[-280, -248], [-292, -262], [-270, -264], [-300, -244]].map(([x, z]) => ({ type: 'mushroom', x, z, camp: 'old_mines' })),
  // Astrarium guardians.
  ...[[-30, -312], [-8, -318], [-36, -288], [4, -292]].map(([x, z]) => ({ type: 'guardian', x, z, camp: 'astrarium' })),
  // Crimson gorge.
  ...[[250, -296], [258, -280], [242, -286]].map(([x, z]) => ({ type: 'demon', x, z, camp: 'crimson_gorge' })),
  ...[[236, -270], [262, -264]].map(([x, z]) => ({ type: 'imp', x, z, camp: 'crimson_gorge' })),
  ...[[-286, -256], [-276, -244]].map(([x, z]) => ({ type: 'imp', x, z, camp: 'old_mines' })),
  { type: 'archdemon', x: 266, z: -302, camp: 'crimson_boss' },
];

/** Signposts at crossroads: [x, z, rotY, lines]. */
export const SIGNS = [
  [6, 66, Math.PI, ['Юг: Поля Акселя · Озеро Туманов', 'Север: Аксель (Южные ворота)']],
  [66, 5, -Math.PI / 2, ['Восток: Деревня Ольховка · Восточный перевал', 'Запад: Аксель (Восточные ворота)']],
  [-66, 5, Math.PI / 2, ['Запад: Шепчущий лес · Лагерь охотников', 'Восток: Аксель (Западные ворота)']],
  [5, -66, 0, ['Север: Старая шахта · Руины Астрариума', 'Юг: Аксель (Северные ворота)']],
  [-2, -100, 0.3, ['Запад: Пещера Старой шахты', 'Восток: Старая сторожевая башня', 'Север: Хребет · Руины Астрариума']],
  [180, -18, Math.PI / 2, ['Север: Багровое ущелье — ОПАСНО', 'Восток: Восточный перевал', 'Запад: Аксель']],
  [-112, 36, 0.5, ['Охотничий лагерь — прямо', 'Тропа на запад заросла…']],
];
