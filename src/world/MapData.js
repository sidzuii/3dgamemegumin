import * as THREE from 'three';
import { AXEL, WALL, toWorld } from './AxelPlan.js';

/**
 * The overworld as data. North = -Z, east = +X, metres (docs/axel-city-plan.md).
 *
 * Geography: the walled city of Axel (west of centre) stands on the Lunnaya; the river runs from
 * the northern mountains through a gap in the long ridge, down the city's east wall (the east gate
 * opens onto the Moon bridge), bends south-east through the valley and leaves through a gorge in
 * the southern massif. West of the city: the Whispering forest; south: Boris' farm and the Mist
 * lake; east: the east fields, the Crossroads, the Alder wood and, at the foot of the eastern
 * mountains, the village of Olkhovka (~1 km of road from the east gate). Beyond the ridge: the
 * Astrarium ruins, the abandoned mining village and the Crimson gorge.
 *
 * Everything that shapes the terrain or gets drawn on the map lives here, so new regions are
 * added by data + a builder function (see world/build/).
 */
export { AXEL };

/** Terrain plane half-size (the playable world is ±HALF; edge mountains from HALF - 120). */
export const HALF = 850;

const v = (x, z) => new THREE.Vector3(x, 0, z);


export const REGIONS = [
  { id: 'axel', name: 'Аксель', sub: 'Город начинающих искателей приключений', center: v(-330, 20), r: 118, icon: '⌂', safe: true, tier: 0, spawn: v(-330, 34), spawnYaw: Math.PI },
  { id: 'caravan', name: 'Караванный двор', sub: 'Южные ворота Акселя', center: v(-283, 96), r: 26, icon: '⛟', safe: true, tier: 0, spawn: v(-292, 88), spawnYaw: 0 },
  { id: 'guild_field', name: 'Поле гильдии', sub: 'Испытательный полигон', center: v(-292, -142), r: 30, icon: '⚑', tier: 0, spawn: v(-312, -122), spawnYaw: Math.PI },
  { id: 'farms', name: 'Поля Акселя', sub: 'Хутор Бориса', center: v(-300, 245), r: 62, icon: '❀', tier: 0, spawn: v(-318, 190), spawnYaw: 0 },
  { id: 'river', name: 'Река Лунная', sub: 'Лунный мост', center: v(-178, 10), r: 20, icon: '≈', tier: 0, spawn: v(-176, 10), spawnYaw: Math.PI / 2 },
  { id: 'east_fields', name: 'Заречные хутора', sub: 'Мельничный холм', center: v(-60, 20), r: 70, icon: '❀', tier: 0, spawn: v(-90, -10), spawnYaw: Math.PI / 2 },
  { id: 'crossroads', name: 'Развилка трёх дорог', sub: 'Придорожная корчма «Подкова»', center: v(112, -26), r: 26, icon: '✚', safe: true, tier: 0, spawn: v(96, -24), spawnYaw: Math.PI / 2 },
  { id: 'alder_wood', name: 'Ольховая роща', sub: 'Ольховый ручей', center: v(320, -140), r: 75, icon: '♣', tier: 0, spawn: v(226, -128), spawnYaw: Math.PI / 2 },
  { id: 'olkhovka', name: 'Деревня Ольховка', sub: 'Последний привал перед перевалом', center: v(730, -140), r: 52, icon: '⌂', safe: true, tier: 0, spawn: v(690, -148), spawnYaw: Math.PI / 2 },
  { id: 'forest', name: 'Шепчущий лес', sub: 'Охотничьи тропы', center: v(-575, 60), r: 125, icon: '♣', tier: 0, spawn: v(-488, 34), spawnYaw: -Math.PI / 2 },
  { id: 'hunters', name: 'Лагерь охотников', sub: 'Шепчущий лес', center: v(-560, 92), r: 16, icon: '⛺', safe: true, tier: 0, spawn: v(-548, 82), spawnYaw: 0 },
  { id: 'glade', name: 'Скрытая поляна', sub: 'Здесь давно никто не бывал', center: v(-640, -120), r: 15, icon: '✿', tier: 0, secret: true },
  { id: 'goblin_den', name: 'Логово капюшонников', sub: 'Гоблинский лагерь', center: v(-590, 230), r: 26, icon: '☠', tier: 0, spawn: v(-566, 205), spawnYaw: -Math.PI / 2 },
  { id: 'watchtower', name: 'Старая сторожевая башня', sub: 'Заброшенный пост', center: v(120, -235), r: 22, icon: '♜', tier: 0, spawn: v(112, -205), spawnYaw: Math.PI },
  { id: 'cave', name: 'Пещера Старой шахты', sub: 'Вход в подземелье', center: v(-470, -290), r: 18, icon: '◒', tier: 0, spawn: v(-452, -275), spawnYaw: Math.PI },
  { id: 'astrarium', name: 'Руины Астрариума', sub: 'Древняя обсерватория магов', center: v(-262, -600), r: 52, icon: '✶', tier: 1, spawn: v(-232, -552), spawnYaw: Math.PI },
  { id: 'mist_lake', name: 'Озеро Туманов', sub: 'Башня на острове', center: v(60, 405), r: 52, icon: '≋', tier: 1, spawn: v(10, 380), spawnYaw: Math.PI / 2 },
  { id: 'crimson_gorge', name: 'Багровое ущелье', sub: 'Владения Архидемона', center: v(430, -600), r: 56, icon: '♨', tier: 1, spawn: v(430, -548), spawnYaw: Math.PI },
  { id: 'old_mines', name: 'Заброшенный шахтёрский посёлок', sub: 'Дальние земли', center: v(-520, -585), r: 42, icon: '⚒', tier: 2, spawn: v(-540, -545), spawnYaw: Math.PI },
  { id: 'east_pass', name: 'Восточный перевал', sub: 'Дорога завалена', center: v(822, -192), r: 26, icon: '⛰', tier: 2, spawn: v(798, -176), spawnYaw: Math.PI / 2 },
  { id: 'ledge', name: 'Уступ на лавовой тропе', sub: 'Обоз Марты', center: v(640, -296), r: 18, icon: '⛟', tier: 1, spawn: v(650, -288), spawnYaw: Math.PI / 2 },
  { id: 'thicket', name: 'Чаща', sub: 'Тёмная часть леса', center: v(-585, 360), r: 46, icon: '♠', tier: 2, spawn: v(-560, 330), spawnYaw: -Math.PI / 2 },
  { id: 'dungeon', name: 'Старая шахта', sub: 'Подземелье', center: v(0, 1160), r: 70, icon: '◒', tier: 0, interior: true },
  { id: 'crypt', name: 'Крипта Эрис', sub: 'Нижние помещения храма', center: v(0, 1306), r: 86, icon: '◒', tier: 0, interior: true },
  { id: 'pump', name: 'Насосная станция', sub: 'Под городом', center: v(0, 2000), r: 130, icon: '◒', tier: 0, interior: true },
  { id: 'drain', name: 'Внешний отвод', sub: 'Под Багровым ущельем', center: v(0, 1740), r: 110, icon: '◒', tier: 0, interior: true },
  { id: 'relay', name: 'Ретранслятор', sub: 'Восточный пост Астрариума', center: v(0, 1508), r: 100, icon: '◒', tier: 0, interior: true },
];
export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/** The Lunnaya: from the northern mountains through the ridge gap, past the city, south-east. */
export const RIVER = {
  points: [[-150, -800], [-168, -660], [-186, -540], [-190, -440], [-194, -340], [-198, -240], [-200, -140], [-201, -60], [-200, 10], [-198, 70], [-190, 130], [-172, 190], [-132, 245], [-70, 285], [10, 302], [110, 300], [210, 315], [300, 360], [370, 430], [420, 520], [470, 640], [520, 800]],
  width: 10,
  level: -0.65,
  bed: -1.85,
};

/** Alder creek: from the northern pines through the Alder wood into the Lunnaya (narrow valley). */
export const CREEK = { points: [[360, -330], [345, -230], [332, -150], [328, -100], [320, -40], [300, 40], [280, 150], [250, 270], [215, 312]], width: 3, level: -0.65, bed: -1.4, valley: 14 };

/** Every water ribbon that carves the terrain (Terrain.riverDistance = nearest of them). */
export const RIVERS = [{ ...RIVER, valley: 48 }, CREEK];

export const LAKES = [
  { id: 'mist_lake', center: v(60, 405), radius: 36, level: -0.6, bottom: -2.2, island: { x: 66, z: 410, r: 7.5 } },
  // Reed pond south of the Olkhovka road (landmark, fisher's hut). LAKES[0] must stay mist_lake.
  { id: 'reed_pond', center: v(612, -125), radius: 20, level: -5.3, bottom: -6.8 },
];

export const LAVA = {
  level: -1.4,
  pools: [[416, -613], [434, -619], [448, -605], [454, -589], [410, -591], [438, -577]].map(([x, z], i) => [x, z, [7, 6, 7, 5.5, 4.5, 4][i]]),
};

/** Bridges: where roads may cross water. */
export const BRIDGES = [
  { id: 'moon_bridge', name: 'Лунный мост', a: [-214, 12], b: [-186, 10], width: 7, kind: 'stone' },
  { id: 'south_bridge', name: 'Южный мост', a: [78, 288], b: [80, 316], width: 5.5, kind: 'stone' },
  { id: 'alder_bridge', name: 'Ольховый мостик', a: [320, -159], b: [344, -165], width: 4, kind: 'plank' },
  // The cart road fords the Alder creek; the plank bridge stays on the footpath past the woodcutter.
  { id: 'alder_ford', name: 'Тележный брод', a: [330, -204], b: [352, -207], width: 5, kind: 'ford' },
];

/** Roads: same ids as now where the role is the same. */
export const ROADS = [
  // Axel east gate -> Moon bridge -> east fields -> crossroads -> Alder wood -> Olkhovka (~1 km).
  { id: 'east_road', kind: 'road', width: 5, points: [[-224, 12], [-186, 10], [-160, 7], [-134, 1], [-104, -12], [-72, -36], [-32, -60], [14, -64], [56, -50], [86, -34], [112, -26], [146, -40], [170, -62], [188, -88], [204, -108], [226, -128], [246, -146], [270, -160], [294, -170], [312, -182], [322, -196], [330, -204], [352, -207], [376, -206], [404, -214], [436, -226], [466, -236], [498, -240], [528, -232], [552, -214], [580, -198], [606, -182], [630, -168], [652, -158], [676, -151], [700, -146], [714, -142]] },
  // Footpath: woodcutter's hut and the plank bridge over the Alder creek (a shortcut for walkers).
  { id: 'alder_path', kind: 'trail', width: 2.2, points: [[226, -128], [250, -120], [274, -128], [296, -140], [306, -152], [312, -157], [320, -159], [344, -165], [352, -167], [366, -176], [384, -194], [404, -214]] },
  // Boundary-stone fork -> north through the pines to the lava road (Crimson gorge).
  { id: 'gorge_trail', kind: 'trail', width: 2.4, points: [[498, -240], [502, -290], [510, -340], [520, -380]] },
  { id: 'farm_lane', kind: 'trail', width: 2.6, points: [[-72, -36], [-58, -16], [-44, 2], [-30, 10]] },
  { id: 'meadow_path', kind: 'trail', width: 2, points: [[-150, 4], [-152, 30], [-150, 54]] },
  { id: 'east_pass_road', kind: 'road', width: 4.5, points: [[774, -150], [784, -164], [796, -176], [810, -186], [822, -192]] },
  // Axel south gate -> caravan camp -> Boris' farm -> along the river's south bank -> Mist lake.
  { id: 'south_road', kind: 'road', width: 5, points: [[-324, 128], [-326, 160], [-312, 190], [-299, 209], [-293, 238], [-272, 262], [-245, 272], [-210, 292], [-150, 318], [-80, 340], [-20, 362], [20, 380]] },
  { id: 'caravan_lane', kind: 'road', width: 4, points: [[-325, 150], [-346, 156], [-362, 162]] },
  // Crossroads -> south bridge -> joins the south road (a loop around the river bend).
  { id: 'bridge_road', kind: 'road', width: 4.5, points: [[112, -26], [114, 40], [104, 110], [92, 180], [84, 240], [79, 288], [80, 316], [70, 340], [40, 362], [20, 380]] },
  { id: 'lake_trail', kind: 'trail', width: 2.4, points: [[20, 380], [24, 392]] },
  // Axel west gate -> herb meadows -> forest fork -> hunters' camp -> goblin den.
  { id: 'west_road', kind: 'road', width: 4.5, points: [[-438, 28], [-470, 30], [-500, 36], [-522, 46], [-544, 66], [-560, 92], [-574, 130], [-584, 178], [-590, 230]] },
  { id: 'glade_trail', kind: 'trail', width: 1.8, points: [[-522, 46], [-548, 14], [-572, -22], [-600, -64], [-626, -100], [-640, -120]] },
  { id: 'thicket_trail', kind: 'trail', width: 2, points: [[-590, 230], [-592, 290], [-585, 360]] },
  // Axel north gate -> guild field -> fork -> up the river valley through the ridge gap -> Astrarium.
  { id: 'north_road', kind: 'road', width: 4.5, points: [[-338, -104], [-336, -140], [-338, -186], [-344, -228], [-322, -290], [-290, -340], [-258, -378], [-230, -400], [-212, -420], [-209, -450], [-214, -490], [-228, -540], [-250, -572]] },
  { id: 'cave_road', kind: 'trail', width: 3.2, points: [[-344, -228], [-380, -246], [-420, -266], [-456, -282], [-470, -290]] },
  { id: 'mines_road', kind: 'trail', width: 3, points: [[-420, -266], [-430, -320], [-466, -368], [-510, -392], [-536, -410], [-540, -440], [-538, -476], [-530, -530], [-520, -585]] },
  // Crossroads -> north -> watchtower hill.
  { id: 'tower_trail', kind: 'trail', width: 2.4, points: [[112, -26], [114, -80], [110, -140], [114, -186], [138, -200], [144, -222], [130, -238], [122, -236]] },
  // Olkhovka -> north through the ridge gap -> Crimson gorge.
  { id: 'lava_road', kind: 'trail', width: 3.2, points: [[728, -186], [700, -240], [684, -262], [640, -296], [580, -346], [520, -380], [470, -398], [452, -420], [446, -440], [444, -462], [438, -500], [430, -548]] },
];

/**
 * Flattened areas: discs { x, z, r, feather, level } or polygons { poly, feather, level }
 * (`level: 'auto'` = the natural height at the centre).
 */
export const FLATS = [
  // Axel: the wall polygon pushed out 8 m (wall foot + the strip outside), then the temple terrace.
  { poly: offsetPolygon(WALL.nodes.map((n) => toWorld(n.u, n.v)), 8), feather: 26, level: AXEL.level, city: true },
  { x: -388, z: -42, r: 34, feather: 16, level: 3.4 }, // temple hill (the temple square sits on it)
  { x: -320, z: 158, r: 22, feather: 14, level: 1.2 }, // caravan camp outside the south gate
  { x: -292, z: -142, r: 30, feather: 16, level: 'auto' }, // guild field
  { x: -300, z: 240, r: 46, feather: 30, level: 1.0 }, // Boris' farm
  { x: 86, z: 238, r: 16, feather: 24, level: 0.2 }, // south bridge approach over the reed hollow
  { x: 112, z: -26, r: 22, feather: 16, level: 'auto' }, // crossroads
  { x: 730, z: -140, r: 46, feather: 44, level: 1.6 }, // Olkhovka (mountain cove)
  { x: -560, z: 92, r: 13, feather: 10, level: 'auto' },
  { x: -640, z: -120, r: 11, feather: 8, level: 'auto' },
  { x: -590, z: 230, r: 19, feather: 10, level: 'auto' },
  { x: 120, z: -235, r: 9, feather: 8, level: 'auto' },
  { x: -470, z: -282, r: 9, feather: 7, level: 'auto' },
  { x: -262, z: -600, r: 40, feather: 22, level: 'auto' },
  { x: -520, z: -585, r: 30, feather: 16, level: 'auto' },
  { x: 786, z: -166, r: 8, feather: 10, level: 3.5 }, // east pass road climbs on a chain of flats
  { x: 803, z: -180, r: 8, feather: 10, level: 6 },
  { x: 822, z: -192, r: 13, feather: 12, level: 8.5 },
];

export const HILLS = [
  { x: 120, z: -240, r: 22, h: 7 }, // watchtower hill
  { x: -480, z: -320, r: 30, h: 20 }, // mine hill
  { x: -40, z: 30, r: 26, h: 5 }, // windmill hill (south of the east road)
  { x: 210, z: -120, r: 40, h: 9 },
  { x: 470, z: 30, r: 60, h: 12 }, // eastern downs
  { x: 250, z: 160, r: 50, h: 8 },
  { x: -470, z: 170, r: 34, h: 7 },
  { x: -100, z: -200, r: 50, h: 11 },
  { x: -282, z: -620, r: 18, h: 3 },
];

export const RIDGES = [
  {
    points: [[-800, -430], [-620, -446], [-440, -432], [-300, -444], [-140, -426], [40, -442], [220, -430], [400, -446], [600, -426], [800, -440]],
    height: 24, width: 52,
    gaps: [{ x: -200, z: -436, r: 44 }, { x: -540, z: -440, r: 46 }, { x: 446, z: -440, r: 46 }],
  },
  {
    // Southern massif: closes the valley, so there is no empty plain in the south. The river
    // leaves through a gorge.
    points: [[-850, 640], [-600, 610], [-400, 630], [-200, 615], [0, 640], [200, 610], [400, 630], [600, 610], [850, 640]],
    height: 38, width: 170,
    gaps: [{ x: 446, z: 590, r: 46 }],
  },
];

/** Forest masses: World._buildVegetation scatters trees inside these polygons. */
export const FORESTS = [
  { id: 'whispering', name: 'Шепчущий лес', kind: 'mixed', pts: [[-474, -140], [-560, -215], [-690, -200], [-730, -60], [-728, 120], [-700, 270], [-640, 300], [-560, 290], [-505, 230], [-484, 140], [-478, 60], [-488, -40]] },
  { id: 'thicket', name: 'Чаща', kind: 'dark', pts: [[-650, 300], [-560, 300], [-520, 360], [-548, 430], [-650, 440], [-710, 380]] },
  { id: 'alder', name: 'Ольховая роща', kind: 'alder', pts: [[232, -96], [262, -196], [330, -236], [400, -212], [446, -196], [452, -170], [420, -130], [384, -86], [300, -70]] },
  { id: 'north_pines', name: 'Северный бор', kind: 'pine', pts: [[190, -300], [300, -385], [420, -372], [560, -300], [610, -230], [500, -200], [380, -255], [240, -250]] },
  { id: 'east_groves', name: 'Восточные рощи', kind: 'mixed', pts: [[380, 60], [480, 0], [590, 40], [610, 170], [510, 250], [400, 210]] },
  { id: 'foothills', name: 'Предгорный бор', kind: 'pine', pts: [[-120, -500], [0, -480], [150, -520], [210, -640], [60, -710], [-110, -660]] },
  { id: 'mine_woods', name: 'Шахтёрский лес', kind: 'pine', pts: [[-420, -330], [-360, -380], [-400, -420], [-480, -420], [-470, -360]] },
];

/** Named points between the settlements (Countryside registers them as spots / props). */
export const POIS = [
  { id: 'tobias_wait', x: -170, z: 4, note: 'у восточного въезда на Лунный мост' },
  { id: 'bridge_stash', x: -206, z: 18, note: 'тайник под Лунным мостом (сундук)' },
  { id: 'river_meadow', x: -150, z: 70, note: 'речной луг, грибы (заказ «грибы на лугу»)' },
  { id: 'windmill', x: -40, z: 30, note: 'мельница на холме, видна со стен' },
  { id: 'east_farm', x: -6, z: -8, note: 'заречный хутор' },
  { id: 'crossroads_inn', x: 126, z: -40, note: 'корчма «Подкова», колодец, придорожная часовенка Эрис' },
  { id: 'caravan_trader', x: 98, z: -10, note: 'стоянка купца Сайруса (чётные дни)' },
  { id: 'woodcutter', x: 250, z: -112, note: 'хижина дровосека на опушке' },
  { id: 'ambush_point', x: 300, z: -176, note: 'засада в роще (эскорт)' },
  { id: 'boundary_stone', x: 494, z: -246, note: 'межевой камень на развилке к ущелью' },
  { id: 'apiary', x: 652, z: -170, note: 'пасека и сады Ольховки' },
  { id: 'hill_oak', x: 204, z: -112, note: 'одинокий дуб на гребне, скамья и камень с надписью' },
  { id: 'alder_ford', x: 341, z: -205, note: 'тележный брод через Ольховый ручей' },
  { id: 'reed_pond', x: 612, z: -125, note: 'камышовый пруд, мостки' },
  { id: 'fisher_hut', x: 590, z: -110, note: 'хижина рыбака у пруда' },
  { id: 'village_gate', x: 700, z: -146, note: 'ворота Ольховки' },
  { id: 'tar_camp', x: 506, z: -300, note: 'поляна смолокуров в бору' },
  { id: 'injured_traveler', x: -500, z: 42, note: 'раненый путник (запад)' },
  { id: 'herb_meadow', x: -470, z: 8, note: 'луга у Западных ворот' },
  { id: 'forest_scouts', x: -560, z: -14, note: 'аванпост гоблинов на тропе к поляне' },
];

/** Routes measured by tools/plan/render_plan.mjs (named, along ROADS). */
export const ROUTES = [
  { id: 'axel_olkhovka', name: 'Аксель (Восточные ворота) → въезд в Ольховку', road: 'east_road' },
  { id: 'axel_olkhovka_green', name: 'Аксель (Восточные ворота) → площадь Ольховки', road: 'east_road', extra: [730, -140] },
  { id: 'axel_mist', name: 'Аксель (Южные ворота) → Озеро Туманов', road: 'south_road' },
  { id: 'axel_hunters', name: 'Аксель (Западные ворота) → лагерь охотников', road: 'west_road', to: [-560, 92] },
  { id: 'axel_goblins', name: 'Аксель (Западные ворота) → логово гоблинов', road: 'west_road' },
  { id: 'axel_cave', name: 'Аксель (Северные ворота) → пещера Старой шахты', road: 'north_road', to: [-344, -228], then: 'cave_road' },
  { id: 'axel_astrarium', name: 'Аксель (Северные ворота) → Руины Астрариума', road: 'north_road' },
  { id: 'axel_field', name: 'Аксель (Северные ворота) → поле гильдии', road: 'north_road', to: [-336, -140] },
  { id: 'cross_tower', name: 'Развилка → сторожевая башня', road: 'tower_trail' },
  { id: 'olk_gorge', name: 'Ольховка → Багровое ущелье', road: 'lava_road' },
];

/** Enemy camps: { type, x, z, camp }. Spawned by the EnemyManager. */
export const CAMPS = [
  // Forest edge on the glade trail — the first guild hunt.
  ...[[-556, -24], [-562, -12], [-552, -6], [-566, -20]].map(([x, z]) => ({ type: 'goblin', x, z, camp: 'forest_scouts' })),
  // Goblin den.
  ...[[-585, 222], [-595, 236], [-581, 238], [-599, 224], [-589, 214], [-575, 230], [-605, 242]].map(([x, z]) => ({ type: 'goblin', x, z, camp: 'goblin_den' })),
  ...[[-591, 228], [-601, 216]].map(([x, z]) => ({ type: 'puglin', x, z, camp: 'goblin_den' })),
  // Thicket: puglins and an imp.
  ...[[-570, 352], [-590, 368], [-580, 344]].map(([x, z]) => ({ type: 'puglin', x, z, camp: 'thicket' })),
  { type: 'imp', x: -586, z: 356, camp: 'thicket' },
  // Mushrooms on the river meadow (east bank, south of the Moon bridge) and around the lake.
  ...[[-150, 61], [-144, 73], [-156, 77]].map(([x, z]) => ({ type: 'mushroom', x, z, camp: 'river_meadow' })),
  ...[[26, 369], [99, 379], [88, 439], [34, 433], [15, 412]].map(([x, z]) => ({ type: 'mushroom', x, z, camp: 'mist_lake' })),
  // Watchtower squatters.
  ...[[113, -240], [127, -228], [123, -246]].map(([x, z]) => ({ type: 'goblin', x, z, camp: 'watchtower' })),
  // Old mines.
  ...[[-515, -578], [-527, -592], [-505, -594], [-535, -574]].map(([x, z]) => ({ type: 'mushroom', x, z, camp: 'old_mines' })),
  // Astrarium guardians.
  ...[[-272, -612], [-250, -618], [-278, -588], [-238, -592]].map(([x, z]) => ({ type: 'guardian', x, z, camp: 'astrarium' })),
  // Crimson gorge.
  ...[[422, -591], [430, -575], [414, -581]].map(([x, z]) => ({ type: 'demon', x, z, camp: 'crimson_gorge' })),
  ...[[408, -565], [434, -559]].map(([x, z]) => ({ type: 'imp', x, z, camp: 'crimson_gorge' })),
  ...[[-521, -586], [-511, -574]].map(([x, z]) => ({ type: 'imp', x, z, camp: 'old_mines' })),
  // The dead miners (KayKit skeletons) among the ruined cottages.
  ...[[-512, -583], [-531, -583]].map(([x, z]) => ({ type: 'skeleton_minion', x, z, camp: 'old_mines' })),
  { type: 'skeleton_warrior', x: -520, z: -596, camp: 'old_mines' },
  { type: 'skeleton_rogue', x: -509, z: -589, camp: 'old_mines' },
  { type: 'archdemon', x: 438, z: -597, camp: 'crimson_boss' },
];

/** Signposts at the gates and crossroads: [x, z, rotY, lines]. */
export const SIGNS = [
  [-314, 142, Math.PI, ['Юг: Поля Акселя · Озеро Туманов', 'Север: Аксель (Южные ворота)']],
  [-176, 19, -Math.PI / 2, ['Восток: Развилка · Деревня Ольховка', 'Запад: Аксель (Восточные ворота)']],
  [-452, 38, Math.PI / 2, ['Запад: Шепчущий лес · Лагерь охотников', 'Восток: Аксель (Западные ворота)']],
  [-327, -108, 0, ['Север: Поле гильдии · Старая шахта · Руины Астрариума', 'Юг: Аксель (Северные ворота)']],
  [-353, -220, 0.3, ['Запад: Пещера Старой шахты', 'Север: вдоль реки — Руины Астрариума', 'Юг: Аксель']],
  [102, -38, Math.PI / 2, ['Восток: Ольховая роща · Деревня Ольховка', 'Север: Старая сторожевая башня', 'Юг: Южный мост · Озеро Туманов', 'Запад: Аксель']],
  [492, -232, -Math.PI / 2, ['Восток: Деревня Ольховка', 'Север: тропа к Багровому ущелью — ОПАСНО', 'Запад: Развилка · Аксель']],
  [230, -136, -Math.PI / 2, ['Дорога: брод · Ольховка', 'Тропа: хижина дровосека · мостик']],
  [-70, -30, 0, ['Юг: мельница · Заречный хутор']],
  [718, -178, 0, ['Север: Багровое ущелье — ОПАСНО', 'Восток: Восточный перевал', 'Запад: Аксель']],
  [-516, 56, 0.5, ['Охотничий лагерь — прямо', 'Тропа на запад заросла…']],
];

/** Polygon pushed out (d > 0) or pulled in (d < 0) by d metres (edges offset, corners mitred). */
export function offsetPolygon(pts, d) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cz = pts.reduce((s, p) => s + p[1], 0) / n;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    let nx = -(b[1] - a[1]), nz = b[0] - a[0];
    const L = Math.hypot(nx, nz);
    nx /= L; nz /= L;
    if ((cx - (a[0] + b[0]) / 2) * nx + (cz - (a[1] + b[1]) / 2) * nz > 0) { nx = -nx; nz = -nz; } // outward
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
