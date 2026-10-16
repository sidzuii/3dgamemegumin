import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, rock, barrel, crate, prop } from './Kit.js';
import { campfire, tent } from './Countryside.js';
import { QuestProp } from '../Interactables.js';
import * as AIN from '../AinstreyPlan.js';

/**
 * The Stone Ledge (docs/ainstrey, D03-D09): a gorge between two cliff bands (Terrain.js `cliffHeight`) that the trakt runs
 * through. A rockfall fills it: a boulder over the old winch, a leaning slab held back by the water of the upper pocket,
 * heaps of rubble across the whole floor. The terrain is levelled around it, so everything here is built in one frame:
 * x = l (to the left of the road: the high north wall), z = f (along the road towards the capital), y up from the floor.
 *
 *   f = -26 the signal poles, the crew's place behind them (-60..-30), the ramp up the north wall (-30..+2) to the upper pocket,
 *   f = +4..+30 the bay on the south side (the prepared pocket: shored with timber), f = +18..+26 the rubble heaps,
 *   f = +40 the two old guard plates, f = +46 the crew's barrier, f = +36 the culvert deck.
 *
 * The visible state is derived from flags and variables (`LedgeSite.sync`), so a loaded save shows the same road: blocked,
 * cleared, or open for good (AINSTRAY_ROAD_OPEN). Collision of everything that can go away = `W.dynamicColliders` cylinders.
 */
const L = AIN.LEDGE;
const TAU = Math.PI * 2;

const rockMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.96, flatShading: true });
const MAT = {
  stone: rockMat(0x8c867c), stoneDark: rockMat(0x6c665e), chalk: new THREE.MeshStandardMaterial({ color: 0xf2eee0, roughness: 0.9 }),
  timber: new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.88 }), timberDark: new THREE.MeshStandardMaterial({ color: 0x4e3824, roughness: 0.9 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a4544, roughness: 0.5, metalness: 0.7 }), cloth: new THREE.MeshStandardMaterial({ color: 0xd9cdb0, roughness: 0.95, side: THREE.DoubleSide }),
  water: new THREE.MeshStandardMaterial({ color: 0x3f87a6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.82 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb03a2a, roughness: 0.8 }),
  clay: rockMat(0x8a5a3a),
};

/** A jittered icosahedron: a boulder, a heap stone. Unit size; scale it. */
const lumpCache = new Map();
function lumpGeo(seed, detail = 1) {
  const key = seed + ':' + detail;
  if (lumpCache.has(key)) return lumpCache.get(key);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const rng = mulberry32(seed * 7919 + 13);
  const p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, 0.78 + rng() * 0.44);
    const m = seen.get(k);
    p.setXYZ(i, p.getX(i) * m, p.getY(i) * m * 0.92, p.getZ(i) * m);
  }
  g.computeVertexNormals();
  lumpCache.set(key, g);
  return g;
}

const mesh = (geo, mat, parent, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
};

// -----------------------------------------------------------------------------------------------------------------
export function buildLedge(W) {
  // the rock of the heaps and the boulder wears the texture of the world's rocks
  const rockTex = W.mats.rock.map, woodTex = W.mats.wood.map;
  for (const k of ['stone', 'stoneDark', 'clay']) { MAT[k].map = rockTex; MAT[k].needsUpdate = true; }
  for (const k of ['timber', 'timberDark']) { MAT[k].map = woodTex; MAT[k].needsUpdate = true; }
  const [ox, oz] = L.at(0, 0);
  const y0 = W.heightAt(ox, oz);
  const at = (f, l) => L.at(f, l); // world [x, z]
  const F = new Frame(W, ox, y0, oz, L.yaw);
  const plateau = (f, l) => W.heightAt(...at(f, l));
  const yTop = plateau(2, 24);
  const rampY = (f) => y0 + (yTop - y0) * Math.min(1, Math.max(0, (f + 30) / 32));
  const P = (id, name, prompt, f, l, y) => {
    const [x, z] = at(f, l);
    return W.addInteractable(new QuestProp({ id, name, prompt, position: new THREE.Vector3(x, y, z), shape: 'none' }));
  };
  const S = (name, f, l, y, yawOff = 0) => { const [x, z] = at(f, l); W.spot(name, new THREE.Vector3(x, y ?? W.heightAt(x, z), z), L.yaw + yawOff); };

  W.keepClear.push({ x: ox, z: oz, r: 62 });

  // ---- named places
  S('ledge_doren', -41, 9, y0); S('ledge_nera', -38, 3, y0); S('ledge_safe', -36, -4, y0);
  S('ledge_blast_zone', -12, -4, y0); S('ledge_white_mark', 13.2, -1, y0 + 2.4); S('ledge_slab_edge', 9, 8.5, y0 + 2.2);
  S('ledge_pocket_gate', 9, 25.2, yTop + 0.8); S('ledge_post_panel', -14, 15.4, rampY(-14) + 1.1); S('ledge_service_outlet', -4, 12.6, y0 + 0.8);
  S('road_guard_a', 40, -5, y0); S('road_guard_b', 40, 4, y0, Math.PI); S('ledge_pass', 52, 0, y0);
  S('ledge_cart_start', -64, -6, y0); S('ledge_ditch_end', 70, 26, plateau(70, 26));
  S('ledge_watch', -62, -2, y0);

  // ---- static decor (editable groups)
  W.group('ain_ledge_camp', { x: at(-44, 6)[0], z: at(-44, 6)[1], rot: L.yaw }, (rng) => ledgeCamp(W, F, y0, rng), 'Каменный уступ: рабочая площадка');
  W.group('ain_ledge_poles', { x: at(-26, 0)[0], z: at(-26, 0)[1], rot: L.yaw }, () => ledgePoles(W, F, y0), 'Каменный уступ: сигнальные шесты');
  W.group('ain_ledge_ramp', { x: at(-14, 11.8)[0], z: at(-14, 11.8)[1], rot: L.yaw }, () => ledgeRamp(W, F, y0, yTop, rampY, plateau), 'Каменный уступ: лестница и мосток к верхнему карману');
  W.group('ain_ledge_pool', { x: at(4, 26)[0], z: at(4, 26)[1], rot: L.yaw }, () => ledgePool(W, F, yTop, plateau), 'Каменный уступ: каменный бак верхнего кармана');
  W.group('ain_ledge_crib', { x: at(14, -20)[0], z: at(14, -20)[1], rot: L.yaw }, () => ledgeCrib(W, F, y0), 'Каменный уступ: подготовленный карман (крепь)');
  W.group('ain_ledge_apron', { x: at(-10, 12.6)[0], z: at(-10, 12.6)[1], rot: L.yaw }, () => ledgeApron(W, F, y0), 'Каменный уступ: нижняя площадка служебного стока');
  W.group('ain_ledge_ditch', { x: at(40, 26)[0], z: at(40, 26)[1], rot: L.yaw }, () => ledgeDitch(W, F, plateau), 'Каменный уступ: сухая канава');
  W.group('ain_ledge_rocks', { x: at(14, 0)[0], z: at(14, 0)[1], rot: L.yaw }, (rng) => ledgeRocks(W, at, rng), 'Каменный уступ: скалы по бортам ущелья');

  // ---- gameplay props (hit volumes; the visuals are the dynamic objects below and the decor above)
  P('road_survey_water', 'Верхний карман', 'Осмотреть верхний карман', -3, 22.6, yTop + 1.0);
  P('road_survey_slab', 'Косая плита', 'Осмотреть шов опорной плиты', 5, 6.8, y0 + 1.1);
  P('road_survey_winch', 'Старая лебёдка', 'Осмотреть лебёдку', 10.5, 7.2, y0 + 1.1);
  P('road_post_panel', 'Панель дорожного поста', 'Найти и отключить панель поста', -14, 15.4, rampY(-14) + 1.2);
  P('ditch_pole', 'Место сигнального шеста', 'Поставить сигнальный шест', 15, 27.5, plateau(15, 27.5) + 1.0);
  P('ditch_fence_a', 'Секция ограды', 'Перенести секцию ограды к канаве', 3.5, 29.5, yTop + 0.8);
  P('ditch_fence_b', 'Секция ограды', 'Перенести секцию ограды к канаве', 6, 29.5, yTop + 0.8);
  P('service_grate_a', 'Решётка служебного стока', 'Снять решётку рычагом', -16, 12.4, y0 + 0.9);
  P('service_grate_b', 'Решётка служебного стока', 'Снять решётку рычагом', -10, 12.4, y0 + 0.9);
  P('service_outlet', 'Выход стока, забит глиной', 'Выход стока забит глиной: промоет Рокси', -4, 12.6, y0 + 1.0);
  P('pocket_gate', 'Затвор верхнего кармана', 'Открыть слив верхнего кармана', 9, 25.2, yTop + 1.0);
  P('ledge_brace_a', 'Место первой опоры', 'Поставить опору под плиту', 3, 6.6, y0 + 1.0);
  P('ledge_brace_b', 'Место второй опоры', 'Поставить опору под плиту', 9, 6.6, y0 + 1.0);
  P('ledge_brace_check', 'Проверка опор', 'Проверить опоры под малой нагрузкой', 6, 5.0, y0 + 1.0);
  P('ledge_rest', 'Привал у костра', 'Передохнуть у костра', -40, -1, y0 + 0.8);
  P('winch_turn_a', 'Рукоять лебёдки', 'Сделать два оборота рукояти', 10.5, 6.6, y0 + 1.3);
  P('winch_turn_b', 'Рукоять лебёдки', 'Сделать ещё два оборота', 10.5, 8.8, y0 + 1.3);
  P('cleanup_chain', 'Цепь на валуне', 'Снять цепь', 12, 2.5, y0 + 1.5);
  for (const [id, f, l] of [['a', 21, -4], ['b', 22.5, 1.5], ['c', 21, 7]]) P('cleanup_debris_' + id, 'Отмеченный обломок', 'Перенести обломок с рабочей полосы', f, l, y0 + 1.3);
  P('cleanup_deck', 'Настил у края', 'Поправить настил', 37.5, 3.2, y0 + 0.7);
  P('cart_signal_empty', 'Сигнальный колокол', 'Дать знак пустой телеге', -28, -7, y0 + 1.3);
  P('cart_signal_loaded', 'Сигнальный колокол', 'Дать знак гружёной телеге', -28, -7, y0 + 1.3);

  // ---- state objects: the boulder, the slab, the heaps, the winch, the carts
  const site = new LedgeSite(W, { ox, oz, y0, yTop, rampY, plateau, at });
  W.ledge = site;
  W.addUpdatable(site);
  return site;
}

// -----------------------------------------------------------------------------------------------------------------
// Static decor
// -----------------------------------------------------------------------------------------------------------------
function ledgeCamp(W, F, y0, rng) {
  const A = (f, l) => F.at(l, 0, f);
  // tents and the fire (the crew's place behind the poles)
  for (const [f, l, r, c] of [[-56, 12, 0.3, 0x7b5a3a], [-63, 15, -0.2, 0x5b6a3a], [-52, -14, 2.8, 0x7b5a3a]]) { const p = A(f, l); tent(W, p.x, p.z, F.rot + r, c); }
  const fire = A(-40, -2); campfire(W, fire.x, fire.z);
  // the plan table with Nera's sheets, the tool rack, shields of boards, planks, barrels
  F.box(2.6, 0.8, 1.1, 5.5, 0, -39, 'plank', { tint: 0x8a6a44 });
  F.box(2.2, 0.03, 0.9, 5.5, 0.82, -39, 'cloth', { collide: false, tint: 0xe8e0c8 });
  F.box(0.1, 1.3, 0.1, 6.5, 0, -41.4, 'log', { collide: false }); F.box(0.1, 1.3, 0.1, 9.5, 0, -41.4, 'log', { collide: false });
  F.box(3.4, 0.08, 0.1, 8, 1.2, -41.4, 'log', { collide: false });
  for (let i = 0; i < 4; i++) F.box(0.1, 0.9, 0.1, 6.9 + i * 0.8, 0.4, -41.35, 'metal', { collide: false, rx: 0.2 });
  for (let i = 0; i < 5; i++) F.box(1.3, 1.5, 0.08, 11 + i * 1.35, 0, -31 + (i % 2) * 0.4, 'plank', { tint: 0xb89a6a + i * 0x030201, rx: -0.28, collide: false });
  prop(F.sub(14, 0, -45), 'nature/log_stackLarge', 0, 0, 0, { s: 3 });
  barrel(W, F.sub(0, 0, 0), -9, -52); barrel(W, F.sub(0, 0, 0), -8.2, -51);
  crate(W, F, 12, -35, 0.9, 0.2); crate(W, F, 12.2, -33.9, 0.9, 0.5);
  prop(F.sub(16, 0, -38), 'survival/workbench', 0, 0, 0, { s: 2.6 });
  // a bench by the fire (the safe rest)
  F.box(2.2, 0.4, 0.5, 0, 0, -43, 'plank', { collide: false, tint: 0x8a6a44 });
  F.box(2.2, 0.4, 0.5, -2.6, 0, -39, 'plank', { collide: false, tint: 0x8a6a44, ry: Math.PI / 2 });
  // a closed-road board
  W.addSign(new THREE.Vector3(...[F.at(-4, 0, -66).x, 0, F.at(-4, 0, -66).z]), L.yaw + Math.PI / 2, ['Каменный уступ. Проход закрыт: обвал на тракте', 'Работы ведёт дорожная бригада Айнстрея (Нэра Вальд, Дорен Крей)', 'За сигнальными шестами не ходить до знака бригадира']);
  void rng;
}

function ledgePoles(W, F, y0) {
  for (let l = -14; l <= 14; l += 4) {
    F.cyl(0.07, 2.0, l, 0, -26, 'log', { seg: 6, collide: false, castShadow: false, tint: ((l + 14) / 4) % 2 ? 0xc8c0b0 : 0xb03a2a });
    F.box(0.5, 0.3, 0.04, l, 1.7, -26, 'cloth', { collide: false, tint: 0xd04a30, castShadow: false });
  }
  F.box(28.4, 0.03, 0.03, 0, 1.55, -26, 'cloth', { collide: false, castShadow: false, tint: 0xc8b890 });
  F.box(28.4, 0.03, 0.03, 0, 0.95, -26, 'cloth', { collide: false, castShadow: false, tint: 0xc8b890 });
  void y0;
}

/** The ramp up the north wall: a timber gallery (22 degrees) with a landing for the post panel and a bridge to the plateau. */
function ledgeRamp(W, F, y0, yTop, rampY, plateau) {
  const l = 11.8, f0 = -30, f1 = 2;
  const len = Math.hypot(f1 - f0, yTop - y0), ang = Math.atan2(yTop - y0, f1 - f0);
  const mid = rampY((f0 + f1) / 2);
  // the tread: one slab at the slope, planks across it (decor), rails and posts down to the floor
  F.box(2.6, 0.4, len, l, mid - y0 - 0.2, (f0 + f1) / 2, 'plank', { rx: -ang, tint: 0x8a6a44 });
  for (let f = f0 + 0.6; f < f1; f += 1.2) F.box(2.7, 0.06, 0.5, l, rampY(f) - y0 + 0.02, f, 'plank', { collide: false, rx: -ang, tint: 0x6e5236, castShadow: false });
  for (const s of [-1, 1]) {
    F.box(0.12, 0.12, len, l + s * 1.28, mid - y0 + 1.0, (f0 + f1) / 2, 'log', { collide: false, rx: -ang });
    F.box(0.1, 0.1, len, l + s * 1.28, mid - y0 + 0.45, (f0 + f1) / 2, 'log', { collide: false, rx: -ang });
  }
  for (let f = f0; f <= f1; f += 4) {
    for (const s of [-1, 1]) {
      const top = rampY(f) - y0;
      F.box(0.2, top, 0.2, l + s * 1.2, 0, f, 'log', { collide: false, castShadow: false });
      F.box(0.1, 1.0, 0.1, l + s * 1.28, top, f, 'log', { collide: false, castShadow: false });
    }
  }
  // the landing beside the ramp at f = -14, flush with the tread there; the panel housing sits in the wall behind it
  const ly = rampY(-14) - y0;
  F.box(3.6, 0.3, 4.6, l + 3.2, ly - 0.25, -14, 'plank', { tint: 0x8a6a44 });
  for (const [dl, df] of [[1.6, -16], [4.6, -16], [1.6, -12], [4.6, -12]]) F.box(0.22, ly - 0.25, 0.22, l + dl, 0, df, 'log', { collide: false, castShadow: false });
  F.box(1.0, 1.6, 0.5, l + 5.1, ly - 0.1, -14, 'stoneDark', { collide: false, tint: 0x6a7480 });
  F.box(0.55, 0.9, 0.06, l + 4.78, ly + 0.45, -14, 'rune', { collide: false, castShadow: false, ry: Math.PI / 2 });
  // the bridge from the top of the ramp to the plateau
  const top = yTop - y0;
  F.box(10.0, 0.35, 2.6, l + 4.5, top - 0.35, 2, 'plank', { tint: 0x8a6a44 });
  for (const s of [-1, 1]) F.box(10.0, 0.1, 0.12, l + 4.5, top + 0.9, 2 + s * 1.28, 'log', { collide: false });
  void plateau;
}

/** The stone tank of the upper pocket on the plateau (the water level is a dynamic mesh). */
function ledgePool(W, F, yTop, plateau) {
  const base = yTop - F.origin.y;
  const [f0, f1, l0, l1] = [-0.5, 8.5, 23, 29];
  const hgt = 1.15;
  for (const [w, d, l, f] of [[l1 - l0 + 1.2, 0.7, (l0 + l1) / 2, f0], [l1 - l0 + 1.2, 0.7, (l0 + l1) / 2, f1], [0.7, f1 - f0, l0, (f0 + f1) / 2], [0.7, f1 - f0, l1, (f0 + f1) / 2]]) {
    F.box(w, hgt, d, l, base - 0.2, f, 'stoneDark', { tint: 0x9a9484 });
    F.box(w + 0.2, 0.15, d + 0.2, l, base - 0.2 + hgt, f, 'stone', { tint: 0xb4ac96, collide: false });
  }
  // the sluice on the north-east wall: a wooden frame, a winch wheel, the iron gate
  F.box(0.4, 1.9, 0.4, l1 + 0.4, base - 0.2, 8.4, 'log', { collide: false }); F.box(0.4, 1.9, 0.4, l1 + 0.4, base - 0.2, 6.2, 'log', { collide: false });
  F.box(0.35, 0.3, 2.6, l1 + 0.4, base + 1.7, 7.3, 'log', { collide: false });
  F.cyl(0.22, 0.2, l1 + 0.4, base + 1.2, 7.3, 'metal', { seg: 12, rz: Math.PI / 2, collide: false });
  void plateau;
}

/** The prepared pocket (the bay): the crib that shores it off the lane, with sacks and skids. */
function ledgeCrib(W, F, y0) {
  // along the lane edge (l = -14) from f = +2 to +30 with the mouth (f = +14..20) open, and the end cap at f = +2
  const wall = (l, f0, f1) => {
    const len = f1 - f0;
    F.box(1.0, 2.6, len, l, 0, (f0 + f1) / 2, 'timber', { tint: 0x7a5636 });
    for (let f = f0 + 0.8; f < f1; f += 2.2) F.box(1.15, 0.22, 0.35, l, 1.0, f, 'log', { collide: false, tint: 0x4e3824, castShadow: false });
    F.box(1.1, 0.2, len, l, 2.6, (f0 + f1) / 2, 'log', { collide: false, tint: 0x5a402a });
  };
  wall(-14, 2, 14); wall(-14, 20, 30);
  const cap = (l0, l1, f) => {
    F.box(l1 - l0, 2.6, 1.0, (l0 + l1) / 2, 0, f, 'timber', { tint: 0x7a5636 });
    F.box(l1 - l0, 0.2, 1.1, (l0 + l1) / 2, 2.6, f, 'log', { collide: false, tint: 0x5a402a });
  };
  cap(-34, -14, 2);
  // skids: two timber rails from the lane into the mouth, laid flat
  for (const f of [15.2, 18.8]) F.box(11, 0.16, 0.4, -14, 0.02, f, 'log', { collide: false, castShadow: false, tint: 0x4e3824 });
  // sandbags at the mouth posts
  for (const [l, f] of [[-12.8, 13.2], [-12.8, 20.8]]) { F.box(0.9, 0.5, 0.9, l, 0, f, 'cloth', { collide: false, tint: 0xb8a070 }); F.box(0.8, 0.45, 0.8, l + 0.2, 0.5, f, 'cloth', { collide: false, tint: 0xb8a070 }); }
  void y0;
}

/** The lower apron of the service drain: a stone mouth in the foot of the north wall, two grates, the clogged outlet. */
function ledgeApron(W, F, y0) {
  F.box(10, 0.18, 16, 12.6, 0, -10, 'stone', { collide: false, tint: 0xa89e8a, castShadow: false });
  F.box(2.2, 1.7, 0.9, 14.1, 0, -4.0, 'stoneDark', { tint: 0x7a746c, collide: false }); // the outlet mouth
  F.box(1.5, 1.2, 0.4, 13.6, 0.1, -4.0, 'basalt', { collide: false, castShadow: false });
  void y0;
}

/** The dry ditch along the plateau top: boards on edge, a spillway over the end of the plateau. */
function ledgeDitch(W, F, plateau) {
  const base = (f) => plateau(f, 26) - F.origin.y;
  for (let f = 10; f < 90; f += 2.4) {
    const b = base(f);
    F.box(0.12, 0.4, 2.5, 25.2, b, f, 'plank', { collide: false, tint: 0x6a4e30, castShadow: false });
    F.box(0.12, 0.4, 2.5, 27.6, b, f, 'plank', { collide: false, tint: 0x6a4e30, castShadow: false });
    F.box(2.4, 0.05, 2.5, 26.4, b - 0.02, f, 'stone', { collide: false, tint: 0x9a8e7a, castShadow: false });
  }
}

/** Big rocks along the foot of both walls and on the plateau edge (silhouettes; the walls themselves are terrain). */
function ledgeRocks(W, at, rng) {
  for (let f = -130; f < 140; f += 8 + rng() * 6) {
    if (f > -36 && f < 52) continue; // the work area keeps its own props
    const [fn, fs] = AIN.ledgeFloor(f);
    for (const [l, s] of [[fn - 1.2 - rng() * 1.5, 1.8 + rng() * 1.8], [-(fs - 1.2 - rng() * 1.5), 1.6 + rng() * 1.8]]) {
      const [x, z] = at(f, l);
      rock(W, x, z, s, mulberry32(Math.round(x * 13 + z * 7)), rng() < 0.5 ? 'rock' : 'rockDark');
    }
  }
}

// -----------------------------------------------------------------------------------------------------------------
// The state objects
// -----------------------------------------------------------------------------------------------------------------
const ease = (t) => t * t * (3 - 2 * t);

class LedgeSite {
  constructor(W, g) {
    this.W = W;
    this.g = g;
    this.root = new THREE.Group();
    this.root.position.set(g.ox, g.y0, g.oz);
    this.root.rotation.y = L.yaw;
    W.addObject(this.root);
    this.cols = {}; // name -> colliders (toggled together)
    this.state = null;
    this.slabT = 0; // 0 leaning, 1 slid into the bay (animated)
    this.slabTarget = 0;
    this.waterT = 1; // 1 full, 0 drained
    this.waterTarget = 1;
    this.flowT = 0; // seconds of water running down the ditch / the outlet
    this.shatter = null;
    this.carts = {};
    this.t = 0;
    this._build();
  }

  // frame-local (x = l, z = f) -> y on the floor is 0
  col(name, f, l, r, h = 6, y = -0.5) {
    const [x, z] = this.g.at(f, l);
    const c = { x, y: this.g.y0 + y, z, r, h, enabled: true };
    this.W.dynamicColliders.push(c);
    (this.cols[name] ||= []).push(c);
    return c;
  }

  setCols(name, on) { for (const c of this.cols[name] || []) c.enabled = on; }

  _build() {
    const R = this.root, g = this.g;
    const rng = mulberry32(777);

    // ---- the boulder (over the old winch) and its white mark
    this.boulder = new THREE.Group();
    const bm = mesh(lumpGeo(3, 2), MAT.stone, this.boulder);
    bm.scale.set(3.5, 3.0, 3.4);
    for (const [dl, df, r] of [[1.6, -1.2, 1.3], [-1.9, 1.0, 1.1], [0.6, 2.6, 1.0]]) { const s = mesh(lumpGeo(5, 1), MAT.stoneDark, this.boulder); s.scale.setScalar(r); s.position.set(dl, -1.3, df); }
    this.mark = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(0.9, 0.09, 6, 20), MAT.chalk, this.mark, false);
    ring.rotation.y = Math.PI / 2;
    const cross = mesh(new THREE.BoxGeometry(0.1, 1.5, 0.12), MAT.chalk, this.mark, false); cross.rotation.x = 0.8;
    const cross2 = mesh(new THREE.BoxGeometry(0.1, 1.5, 0.12), MAT.chalk, this.mark, false); cross2.rotation.x = -0.8;
    this.mark.position.set(-1.0, 0.7, -3.0); // the side of the boulder that faces the crew (towards -f)
    this.mark.rotation.y = Math.PI / 2;
    this.boulder.add(this.mark);
    this.boulder.position.set(-2, 3.0, 16);
    R.add(this.boulder);
    this.boulderPose = { blocked: [-2, 3.0, 16], bay: [-22.5, 2.6, 22] };
    for (const [f, l, r] of [[16, -2, 3.0], [14.4, -4.2, 2.2], [17.6, 0.2, 2.2], [14.6, 0, 1.9], [18, -4, 1.9]]) this.col('boulder', f, l, r, 8);

    // ---- the slab (leaning on the north face, held by the water of the upper pocket) and its braces
    this.slab = new THREE.Group();
    const sg = new THREE.BoxGeometry(12.5, 1.4, 12, 6, 1, 5);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const h = Math.sin(sp.getX(i) * 1.7 + sp.getZ(i) * 2.3) * 0.12 + Math.cos(sp.getZ(i) * 1.1) * 0.1;
      sp.setY(i, sp.getY(i) + h);
    }
    sg.computeVertexNormals();
    mesh(sg, MAT.stone, this.slab);
    this.slabPose = { lean: { l: 12.1, y: 3.7, f: 6, rz: 0.56 }, lie: { l: -23, y: 0.9, f: 12.5, rz: 0.03 } };
    R.add(this.slab);
    for (const f of [1.6, 4.4, 7.2, 10.0]) for (const l of [8.8, 11.6, 14.2]) this.col('slabLean', f, l, 1.7, 8);
    for (const [f, l] of [[8, -22], [12.5, -22], [17, -22], [8, -27], [12.5, -27], [17, -27]]) this.col('slabLie', f, l, 3.0, 1.6);
    this.braces = [3, 9].map((f) => {
      const b = new THREE.Group();
      mesh(new THREE.BoxGeometry(0.5, 3.6, 0.5), MAT.timber, b).position.set(0, 1.5, 0);
      mesh(new THREE.BoxGeometry(0.9, 0.3, 1.2), MAT.timberDark, b).position.set(0, 0.2, 0);
      const wedge = mesh(new THREE.BoxGeometry(0.3, 0.45, 1.0), MAT.timberDark, b); wedge.position.set(0.15, 3.1, 0);
      b.rotation.z = -0.4;
      b.position.set(7.0, 0, f);
      b.visible = false;
      R.add(b);
      return b;
    });

    // ---- the old winch: two posts, a drum with a handle, the chain to the boulder
    const winch = new THREE.Group();
    for (const dl of [-1.0, 1.0]) mesh(new THREE.BoxGeometry(0.3, 2.0, 0.3), MAT.timber, winch).position.set(dl, 1.0, 0);
    mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.7, 10).rotateZ(Math.PI / 2), MAT.timberDark, winch).position.set(0, 1.5, 0);
    const handle = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), MAT.iron, winch); handle.position.set(1.2, 1.5, 0.4);
    winch.position.set(7.8, 0, 10.5);
    R.add(winch);
    this.winch = winch;
    this.winchHandle = handle;
    this.chain = new THREE.Group();
    {
      const a = new THREE.Vector3(7.8, 1.5, 10.5), b = new THREE.Vector3(-1.5, 3.2, 14.6), n = 14;
      for (let i = 0; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        p.y -= Math.sin((i / n) * Math.PI) * 0.45;
        const link = mesh(new THREE.TorusGeometry(0.1, 0.03, 5, 8), MAT.iron, this.chain, false);
        link.position.copy(p);
        link.rotation.set((i % 2) * Math.PI / 2, 0.6, 0);
      }
    }
    R.add(this.chain);

    // ---- the heaps across the floor (they block the whole width until the main clearing) and the marked chunks
    this.heapsA = new THREE.Group();
    const lanes = [];
    for (let l = -15.5; l <= 16.4; l += 3.3) lanes.push(l);
    lanes.forEach((l, i) => {
      for (const [f, row] of [[19.2 + (i % 2) * 0.8, 0], [23.4 - (i % 2) * 0.8, 1]]) {
        const r = 1.3 + rng() * 0.8;
        const m = mesh(lumpGeo(1 + ((i + row) % 6)), i % 3 ? MAT.stone : MAT.stoneDark, this.heapsA);
        m.scale.set(r * 1.5, r * 1.1, r * 1.4);
        m.position.set(l + (rng() - 0.5) * 0.8, r * 0.6, f + (rng() - 0.5) * 1.2);
        m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        this.col('heapsA', m.position.z, m.position.x, r * 1.35 + 0.15, 4.5);
      }
    });
    // a second tier on top of the rows, and the plug in the mouth of the pocket
    for (let i = 0; i < 16; i++) {
      const l = -14 + i * 1.95 + rng(), r = 0.9 + rng() * 0.8;
      const m = mesh(lumpGeo(2 + (i % 5)), MAT.stone, this.heapsA);
      m.scale.set(r * 1.3, r, r * 1.2);
      m.position.set(l, 1.9 + rng() * 1.1, 21.2 + (rng() - 0.5) * 3.5);
      m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    }
    for (const [l, f, r] of [[-14, 16, 1.7], [-14.2, 18.4, 1.6], [-13.6, 14.2, 1.3]]) {
      const m = mesh(lumpGeo(4), MAT.stoneDark, this.heapsA);
      m.scale.set(r * 1.3, r * 1.1, r * 1.2);
      m.position.set(l, r * 0.55, f);
      this.col('heapsA', f, l, r * 1.25 + 0.2, 4.5);
    }
    R.add(this.heapsA);
    // the three marked chunks that stay on the work lane until they are carried away
    this.chunks = [[21, -4], [22.5, 1.5], [21, 7]].map(([f, l], i) => {
      const grp = new THREE.Group();
      const m = mesh(lumpGeo(8 + i), MAT.stoneDark, grp);
      m.scale.set(1.25, 0.95, 1.1);
      const x1 = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.12), MAT.chalk, grp, false); x1.position.y = 0.96; x1.rotation.y = 0.6;
      const x2 = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.12), MAT.chalk, grp, false); x2.position.y = 0.96; x2.rotation.y = -0.6;
      grp.position.set(l, 0.6, f);
      R.add(grp);
      this.col('chunk' + i, f, l, 1.5, 2.2);
      return grp;
    });
    // fragments of the boulder (the explosion route): they end up in the pocket
    this.frags = [];
    for (let i = 0; i < 12; i++) {
      const m = mesh(lumpGeo(20 + i), i % 2 ? MAT.stone : MAT.stoneDark, R);
      const r = 0.55 + rng() * 0.8;
      m.scale.set(r * 1.2, r, r * 1.1);
      const to = new THREE.Vector3(-17.5 - rng() * 11, r * 0.5, 9 + rng() * 17);
      m.userData = { to, from: new THREE.Vector3(-2, 3, 16), t: 2, delay: rng() * 0.25, dur: 0.9 + rng() * 0.6 };
      m.position.copy(to);
      m.visible = false;
      this.frags.push(m);
    }
    for (const [f, l, r] of [[12, -19, 1.1], [16, -24, 1.2], [20, -19, 1.0], [24, -26, 1.2], [27, -21, 1.0]]) this.col('frags', f, l, r, 1.4);
    this.col('boulderBay', 22, -22.5, 3.0, 5.5);

    // ---- the pool water, the flow down the ditch and out of the service outlet
    this.water = mesh(new THREE.BoxGeometry(5.2, 0.9, 8.2), MAT.water, R, false);
    const wy = this.g.yTop - this.g.y0;
    this.waterBase = wy;
    this.water.position.set(26, wy + 0.25, 4);
    this.ditchFlow = mesh(new THREE.BoxGeometry(2.0, 0.12, 78), MAT.water, R, false);
    const dy = this.g.plateau(50, 26) - this.g.y0;
    this.ditchFlow.position.set(26.4, dy + 0.1, 49);
    this.ditchFlow.visible = false;
    this.outletFlow = mesh(new THREE.BoxGeometry(1.2, 0.1, 9), MAT.water, R, false);
    this.outletFlow.position.set(12.4, 0.08, -8.5);
    this.outletFlow.visible = false;
    this.clay = mesh(lumpGeo(30), MAT.clay, R);
    this.clay.scale.set(1.0, 0.8, 0.5);
    this.clay.position.set(13.2, 0.7, -3.0);
    // the grates of the service drain, the fence sections and the pole of the ditch
    this.grates = [-16, -10].map((f) => {
      const grp = new THREE.Group();
      mesh(new THREE.BoxGeometry(1.8, 0.1, 1.0), MAT.iron, grp);
      for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.06, 0.12, 1.0), MAT.iron, grp).position.set(-0.7 + i * 0.35, 0.05, 0);
      grp.position.set(12.4, 0.06, f);
      R.add(grp);
      return grp;
    });
    this.fenceStack = new THREE.Group();
    this.fencePlaced = [];
    for (const [i, f] of [[0, 3.5], [1, 6]]) {
      const panel = () => {
        const p = new THREE.Group();
        mesh(new THREE.BoxGeometry(0.1, 1.2, 2.2), MAT.timber, p);
        for (const y of [0.35, 0.8]) mesh(new THREE.BoxGeometry(0.06, 0.1, 2.3), MAT.timberDark, p).position.set(0, y, 0);
        for (const dz of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), MAT.timberDark, p).position.set(0, 0.5, dz);
        return p;
      };
      const stack = panel();
      stack.position.set(29.5, this.waterBase, f);
      stack.rotation.z = 0.15;
      R.add(stack);
      this.fenceStack.add(stack);
      const placed = panel();
      placed.position.set(29, this.g.plateau(20 + i * 14, 29) - this.g.y0, 20 + i * 14);
      placed.visible = false;
      R.add(placed);
      this.fencePlaced.push(placed);
      this.fenceStack.userData[i] = stack;
    }
    this.pole = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 6), MAT.red, this.pole).position.y = 1.3;
    mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), MAT.red, this.pole).position.set(0.25, 2.3, 0);
    this.pole.position.set(27.5, this.g.plateau(15, 27.5) - this.g.y0, 15);
    this.pole.visible = false;
    R.add(this.pole);

    // ---- the crew's barrier at f = +46 and the culvert deck at f = +36..39 (broken / mended)
    this.barrier = new THREE.Group();
    for (let l = -16; l <= 16; l += 2.9) {
      const h = new THREE.Group();
      mesh(new THREE.BoxGeometry(2.2, 0.14, 0.3), MAT.timber, h).position.y = 1.0;
      mesh(new THREE.BoxGeometry(2.2, 0.14, 0.3), MAT.red, h).position.y = 0.65;
      for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), MAT.timberDark, h); leg.position.set(s * 0.9, 0.55, 0); leg.rotation.x = s * 0.35; }
      h.position.set(l, 0, 46);
      this.barrier.add(h);
      this.col('barrier', 46, l, 1.65, 3);
    }
    const sign = new THREE.Group();
    mesh(new THREE.BoxGeometry(1.8, 1.0, 0.08), MAT.chalk, sign).position.y = 1.7;
    mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), MAT.timberDark, sign).position.y = 0.8;
    sign.position.set(-1.5, 0, 45.2);
    this.barrier.add(sign);
    R.add(this.barrier);
    this.deckBroken = new THREE.Group();
    mesh(new THREE.BoxGeometry(9.4, 0.4, 3.0), MAT.timberDark, this.deckBroken).position.set(0, -0.35, 0);
    for (let i = 0; i < 4; i++) { const pl = mesh(new THREE.BoxGeometry(0.5, 0.1, 2.2), MAT.timber, this.deckBroken); pl.position.set(-4 + i * 2.6, 0.1 + (i % 2) * 0.2, 0); pl.rotation.set(0.1 * i, 0.2 - i * 0.12, (i % 2 ? 0.4 : -0.3)); }
    this.deckBroken.position.set(0, 0, 37.5);
    R.add(this.deckBroken);
    this.deckFixed = new THREE.Group();
    for (let i = 0; i < 16; i++) mesh(new THREE.BoxGeometry(0.55, 0.12, 3.0), i % 3 ? MAT.timber : MAT.timberDark, this.deckFixed, false).position.set(-4.4 + i * 0.585, 0.02, 0);
    this.deckFixed.position.set(0, 0, 37.5);
    R.add(this.deckFixed);

    // ---- the two old guard plates: they pulse amber while the post is alive
    this.plates = [[-5, 40], [4, 40]].map(([l, f]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0x4a4640, emissive: new THREE.Color(1.8, 0.8, 0.2), emissiveIntensity: 0, roughness: 0.6 }));
      m.position.set(l, 0.05, f);
      m.receiveShadow = true;
      R.add(m);
      return m;
    });

    // ---- the carts (empty and loaded), parked behind the poles
    this.carts.empty = new Cart(R, false, [[-6, -64], [-3, -40], [0, -24], [0, 10], [0, 40], [0, 70], [0, 120]]);
    this.carts.loaded = new Cart(R, true, [[3, -68], [2, -40], [0, -24], [0, 10], [0, 40], [0, 70], [0, 120]]);
  }

  // -------------------------------------------------------------------------------------------------------------
  /** The state of the world from the saved flags and variables. `instant`: no animations (load, first sync). */
  sync(F, V, instant = false) {
    const open = !!V?.AINSTRAY_ROAD_OPEN;
    const winch = V?.CLEARING_METHOD === 'winch';
    const cleared = !!F.ledge_main_cleared || open;
    const prev = this.state;
    const st = {
      open, cleared, winch,
      drained: !!F.pocket_drained || open,
      chain: !F.ledge_chain_off && !open,
      chunk: [!F.ledge_debris_a && cleared && !open, !F.ledge_debris_b && cleared && !open, !F.ledge_debris_c && cleared && !open],
      deck: !!F.ledge_deck_fixed || open,
      barrier: cleared && !F.ledge_barrier_open && !open,
      mark: !!V?.ROAD_SURVEY_SLAB && !cleared,
      postOn: !V?.ROAD_POST_DISABLED && !F.wd_road_guards && !open,
      braceA: !!F.ledge_brace_a || cleared, braceB: !!F.ledge_brace_b || cleared,
      pole: !!F.ditch_pole, fenceA: !!F.ditch_fence_a, fenceB: !!F.ditch_fence_b,
      grateA: !F.service_grate_a, grateB: !F.service_grate_b, outlet: !!F.service_flush || open,
      cartEmpty: !F.cart_empty_ok && !open, cartLoaded: !F.cart_loaded_ok && !open,
    };
    this.state = st;
    this.slabTarget = cleared && winch ? 1 : 0;
    this.waterTarget = st.drained ? 0 : 1;
    if (instant || !prev) {
      this.slabT = this.slabTarget;
      this.waterT = this.waterTarget;
    } else {
      if (!prev.drained && st.drained) this.flowT = 22;
      if (!prev.cleared && st.cleared) this._clearing(winch);
      if (prev.chain && !st.chain) this._fx('magicPop', this._wp(12, 2.5, 1.5), 12);
      for (let i = 0; i < 3; i++) if (prev.chunk[i] && !st.chunk[i]) this._puff(this._chunkPos(i), 14);
    }
    this._apply(instant || !prev);
  }

  _wp(f, l, y) { const [x, z] = this.g.at(f, l); return new THREE.Vector3(x, this.g.y0 + y, z); }

  _chunkPos(i) { const [f, l] = [[21, -4], [22.5, 1.5], [21, 7]][i]; return this._wp(f, l, 1); }

  _fx(type, pos, n, opts) { this.rpg?.game.vfx.burst(type, pos, n, opts); }

  _puff(pos, n = 18) {
    this._fx('smoke', pos, Math.max(2, Math.round(n / 4)), { scale: 0.5 });
    this._fx('magicPop', pos, 6);
  }

  /** The main clearing happens now (flag ledge_main_cleared): the explosion route shatters the boulder, the winch route slides the slab. */
  _clearing(winch) {
    if (winch) { this.rumble = 4.2; return; }
    this.shatter = { t: 0 };
    const c = this._wp(16, -2, 3);
    this._fx('smoke', c, 10, { scale: 1.4 });
    this._fx('fire', c, 6, { scale: 0.6 });
    this.rpg?.game.cameraRig.addTrauma(0.6);
    for (const f of this.frags) { f.userData.t = -f.userData.delay; f.visible = true; f.position.copy(f.userData.from); }
  }

  _apply(instant) {
    const st = this.state;
    const pose = this.slabPose;
    this._slabPose();
    // boulder: in the lane until the main clearing; in the pocket (winch) or in pieces in the pocket (explosion) afterwards
    const inLane = !st.cleared;
    this.boulder.visible = inLane || (st.winch && st.cleared);
    this.boulder.scale.setScalar(1);
    this.mark.visible = st.mark && inLane;
    if (!inLane && st.winch) { const [l, y, f] = this.boulderPose.bay; this.boulder.position.set(l, y, f); this.boulder.rotation.set(0.3, 1.1, 0.2); }
    else if (inLane) { const [l, y, f] = this.boulderPose.blocked; this.boulder.position.set(l, y, f); this.boulder.rotation.set(0, 0, 0); }
    this.setCols('boulder', inLane);
    this.setCols('boulderBay', st.cleared && st.winch);
    this.setCols('frags', st.cleared && !st.winch);
    for (const f of this.frags) if (instant) { f.visible = st.cleared && !st.winch; f.position.copy(f.userData.to); f.userData.t = 2; }
    this.heapsA.visible = inLane;
    this.setCols('heapsA', inLane);
    this.chunks.forEach((c, i) => { c.visible = st.chunk[i]; this.setCols('chunk' + i, st.chunk[i]); });
    this.chain.visible = st.chain && !st.open;
    this.braces.forEach((b, i) => { b.visible = i ? st.braceB : st.braceA; });
    this.setCols('slabLean', !(st.cleared && st.winch));
    this.setCols('slabLie', st.cleared && st.winch);
    this.pole.visible = st.pole;
    this.fenceStack.userData[0].visible = !st.fenceA; this.fenceStack.userData[1].visible = !st.fenceB;
    this.fencePlaced[0].visible = st.fenceA; this.fencePlaced[1].visible = st.fenceB;
    this.grates[0].visible = st.grateA; this.grates[1].visible = st.grateB;
    this.clay.visible = !st.outlet;
    this.barrier.visible = st.barrier;
    this.setCols('barrier', st.barrier);
    this.deckBroken.visible = !st.deck;
    this.deckFixed.visible = st.deck;
    this.carts.empty.setParked(st.cartEmpty);
    this.carts.loaded.setParked(st.cartLoaded);
    this.winchHandle.rotation.x = st.cleared ? 1.2 : 0;
    void pose;
  }

  _slabPose() {
    const t = ease(this.slabT), a = this.slabPose.lean, b = this.slabPose.lie;
    this.slab.position.set(a.l + (b.l - a.l) * t, a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 0.6, a.f + (b.f - a.f) * t);
    this.slab.rotation.set(0, 0, a.rz + (b.rz - a.rz) * t);
    this.slab.visible = !this.state?.open || true;
  }

  update(dt) {
    this.t += dt;
    // slab slide
    if (this.slabT !== this.slabTarget) {
      const d = Math.sign(this.slabTarget - this.slabT) * dt / 4.2;
      this.slabT = Math.abs(this.slabTarget - this.slabT) < Math.abs(d) ? this.slabTarget : this.slabT + d;
      this._slabPose();
      const t = ease(this.slabT);
      // the boulder rides ahead of the slab
      if (this.state?.winch && this.state.cleared) {
        const [l0, y0, f0] = this.boulderPose.blocked, [l1, y1, f1] = this.boulderPose.bay;
        this.boulder.visible = true;
        this.boulder.position.set(l0 + (l1 - l0) * t, y0 + (y1 - y0) * t, f0 + (f1 - f0) * t);
        this.boulder.rotation.set(t * 2.6, t * 1.6, 0);
      }
      this.rumble = (this.rumble ?? 0) - dt;
      if (Math.random() < dt * 6) this._puff(this._wp(8 - t * 6, 4 - t * 22, 1), 8);
      if (this.slabT === this.slabTarget) {
        this.setCols('slabLean', !(this.state.cleared && this.state.winch));
        this.setCols('slabLie', this.state.cleared && this.state.winch);
        this._puff(this._wp(13, -23, 1), 40);
        this.rpg?.game.cameraRig.addTrauma(0.5);
        this.setCols('boulder', false);
        this.setCols('boulderBay', this.state.cleared && this.state.winch);
        this.heapsA.visible = false;
        this.setCols('heapsA', false);
      }
    }
    // the boulder bursts: the fragments fly to the pocket
    if (this.shatter) {
      this.boulder.visible = false;
      let done = true;
      for (const f of this.frags) {
        const u = f.userData;
        u.t += dt;
        if (u.t < 0) { done = false; continue; }
        const k = Math.min(1, u.t / u.dur);
        f.position.lerpVectors(u.from, u.to, k);
        f.position.y += Math.sin(k * Math.PI) * 5.5;
        f.rotation.x += dt * 4; f.rotation.z += dt * 3;
        if (k < 1) done = false;
      }
      if (done) {
        this.shatter = null;
        this._puff(this._wp(20, -22, 1), 30);
        this.heapsA.visible = false;
      }
    }
    // the water of the pocket sinks; the ditch and the outlet run for a while
    if (this.waterT !== this.waterTarget) {
      const d = Math.sign(this.waterTarget - this.waterT) * dt / 9;
      this.waterT = Math.abs(this.waterTarget - this.waterT) < Math.abs(d) ? this.waterTarget : this.waterT + d;
    }
    const k = this.waterT;
    this.water.visible = k > 0.02;
    this.water.scale.y = Math.max(0.05, k);
    this.water.position.y = this.waterBase + 0.25 * k + 0.02;
    if (this.flowT > 0) {
      this.flowT -= dt;
      const route = this.rpg?.state.vars?.DRAIN_ROUTE;
      this.ditchFlow.visible = route === 'ditch';
      this.outletFlow.visible = route === 'service';
      this.ditchFlow.material.opacity = 0.82 * Math.min(1, this.flowT / 3);
    } else { this.ditchFlow.visible = false; this.outletFlow.visible = false; this.ditchFlow.material.opacity = 0.82; }
    // guard plates pulse while the post is alive
    const on = this.state?.postOn && !this.state?.open;
    for (const p of this.plates) p.material.emissiveIntensity = on ? 0.5 + 0.4 * Math.sin(this.t * 2.4) : 0;
    for (const c of Object.values(this.carts)) c.update(dt);
  }

  /** Send a cart down the road: `done()` when it has gone past the barrier. */
  runCart(kind, done) {
    const c = this.carts[kind];
    if (!c || c.running) return false;
    c.run(() => { c.setParked(false); done?.(); });
    return true;
  }

  /** The points of the cart path in world coordinates (for the sweep checks of the tests). */
  cartPath(kind) { return this.carts[kind].path.map(([l, f]) => { const [x, z] = this.g.at(f, l); return [x, z]; }); }
}

/** A cart with a horse that drives along the road (a scripted wagon: its path is checked by sweeps against the collision). */
class Cart {
  constructor(parent, loaded, path) {
    this.path = path; // [l, f] points in the frame of the rockfall
    this.root = new THREE.Group();
    const bed = mesh(new THREE.BoxGeometry(1.9, 0.5, 3.4), MAT.timber, this.root); bed.position.set(0, 0.9, 0);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.1, 0.6, 3.4), MAT.timberDark, this.root).position.set(s * 0.95, 1.4, 0);
    mesh(new THREE.BoxGeometry(1.9, 0.6, 0.1), MAT.timberDark, this.root).position.set(0, 1.4, -1.7);
    this.wheels = [];
    for (const sz of [-1.0, 1.0]) for (const sx of [-1, 1]) {
      const w = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14).rotateZ(Math.PI / 2), MAT.timberDark, this.root);
      w.position.set(sx * 1.0, 0.55, sz);
      this.wheels.push(w);
    }
    if (loaded) {
      for (const [x, z, y] of [[-0.5, -0.8, 1.45], [0.5, -0.8, 1.45], [0, 0.2, 1.45], [-0.5, 0.9, 1.45], [0.5, 0.9, 1.45], [0, -0.3, 2.0]]) {
        const sack = mesh(new THREE.SphereGeometry(0.42, 8, 6).scale(1, 0.8, 1.2), MAT.cloth, this.root);
        sack.position.set(x, y, z);
      }
    }
    mesh(new THREE.BoxGeometry(0.1, 0.1, 2.6), MAT.timberDark, this.root).position.set(0, 0.8, 2.9);
    // the horse: body, neck, head, four legs that swing
    const horse = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.85 });
    mesh(new THREE.BoxGeometry(0.7, 0.8, 1.9), hide, horse).position.set(0, 1.35, 0);
    const neck = mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), hide, horse); neck.position.set(0, 1.85, 1.0); neck.rotation.x = 0.5;
    mesh(new THREE.BoxGeometry(0.3, 0.35, 0.7), hide, horse).position.set(0, 2.15, 1.45);
    this.legs = [];
    for (const [x, z] of [[-0.25, 0.75], [0.25, 0.75], [-0.25, -0.75], [0.25, -0.75]]) {
      const leg = mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), hide, horse);
      leg.geometry.translate(0, -0.5, 0);
      leg.position.set(x, 1.0, z);
      this.legs.push(leg);
    }
    horse.position.set(0, 0, 4.9);
    this.root.add(horse);
    parent.add(this.root);
    this.running = false;
    this.parked = true;
    this.t = 0;
    this._park();
  }

  _park() {
    const [l, f] = this.path[0];
    this.root.position.set(l, 0, f);
    this.root.rotation.y = 0;
  }

  setParked(on) {
    this.parked = on;
    this.root.visible = on || this.running;
    if (on && !this.running) this._park();
  }

  run(done) {
    this.running = true;
    this.done = done;
    this.s = 0;
    this.len = 0;
    this.segs = this.path.slice(1).map((p, i) => { const a = this.path[i]; const L2 = Math.hypot(p[0] - a[0], p[1] - a[1]); this.len += L2; return { a, b: p, L: L2 }; });
    this.root.visible = true;
  }

  update(dt) {
    if (!this.running) return;
    this.s += dt * 5.0;
    let s = this.s;
    let seg = this.segs[this.segs.length - 1];
    for (const g of this.segs) { if (s <= g.L) { seg = g; break; } s -= g.L; }
    const k = Math.min(1, s / seg.L);
    const l = seg.a[0] + (seg.b[0] - seg.a[0]) * k, f = seg.a[1] + (seg.b[1] - seg.a[1]) * k;
    this.root.position.set(l, 0, f);
    this.root.rotation.y = Math.atan2(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    for (const w of this.wheels) w.rotation.x += dt * 9;
    this.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.s * 3.4 + (i % 2 ? 1 : 0) * Math.PI) * 0.5; });
    if (this.s >= this.len) {
      this.running = false;
      this.root.visible = false;
      this.done?.();
    }
  }
}
