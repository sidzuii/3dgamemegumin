import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame } from './Kit.js';
import { QuestProp } from '../Interactables.js';
import { hall, passage } from './Crypt.js';
import { sconce, projectionFigure } from './Relay.js';

/**
 * The central hall of the installation (chapter 9, "Тот, кто позвал") and the two service galleries that lead to it from the
 * deep shaft (Pump.js, its north-east exit): an interior beyond the map edge. Gallery 1 and 2 (guards) -> the central hall:
 * the capsule with Veyr's body, his panel (projection), Edmund's link console, the small-test rack (switch, cable, amplifier),
 * three temporary holders, two gauges, two seams, two side posts, a valve under the stairs. Story state lives in flags
 * (service_open, holder_*, core_*, post_*, capsule_*) and `world.core.sync(flags)` applies it.
 * Props/behaviour: data/story/props.js. Level text: docs/story/03 (C21-C26).
 */
const TN = { wall: 0x707a88, floor: 0x4c5260, ceil: 0x363a46, trim: 0x98a6b8 };

export function buildCore(world) {
  const W = world;
  const rng = mulberry32(9190);
  passage(W, 11, 2096, 11, 2108, 4, TN);
  hall(W, rng, 3, 19, 2108, 2140, [{ side: 's', c: 11, w: 4 }, { side: 'n', c: 11, w: 4 }], 7, TN);
  passage(W, 11, 2140, 11, 2152, 4, TN);
  hall(W, rng, 3, 19, 2152, 2184, [{ side: 's', c: 11, w: 4 }, { side: 'n', c: 11, w: 4 }], 7, TN);
  passage(W, 11, 2184, 11, 2196, 4, TN);
  hall(W, rng, -16, 16, 2196, 2260, [{ side: 's', c: 11, w: 4 }], 12, TN);

  const core = { gate: null, gateColliders: [], holders: [], seams: [], lamps: [], capsule: null, projection: null, scale: null };
  W.core = core;
  const P = (id, name, prompt, x, y, z) => W.addInteractable(new QuestProp({ id, name, prompt, position: new THREE.Vector3(x, y, z), shape: 'none' }));
  const glow = (color, k = 0.2) => { const m = W.mats.rune.clone(); m.emissive = new THREE.Color(color); m.emissiveIntensity = k; return m; };
  const wheel = (x, z) => {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.14, 1.1, 0, 0, 0, 'metal', { seg: 8 });
    F.cyl(0.38, 0.08, 0, 1.15, 0, 'metal', { seg: 12, collide: false });
  };
  const post = (x, z, k = 'metal') => {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.16, 1.4, 0, 0, 0, k, { seg: 8 });
    F.box(0.8, 0.5, 0.1, 0, 1.4, 0, 'metal', { collide: false });
  };

  // ---- the service gate between the deep shaft and gallery 1 (opened by Veyr, C18)
  core.gate = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), W.mats.metal);
    bar.position.set(9.5 + i * 0.6, 1.4, 2102);
    core.gate.add(bar);
  }
  W.addObject(core.gate);
  for (const dx of [-1.3, 0, 1.3]) {
    const c = { x: 11 + dx, y: 0, z: 2102, r: 0.8, h: 2.8, enabled: true };
    W.dynamicColliders.push(c);
    core.gateColliders.push(c);
  }

  // ---- the galleries: guards of the service and sconces
  W.spot('core_g1', new THREE.Vector3(11, 0, 2124), 0);
  W.spot('core_g2', new THREE.Vector3(11, 0, 2168), 0);
  W.camp('guardian', 11, 2126, 'core_g1');
  W.camp('watcher', 6, 2132, 'core_g1');
  W.camp('guardian', 11, 2170, 'core_g2');
  W.camp('watcher', 16, 2162, 'core_g2');
  W.camp('imp', 6, 2174, 'core_g2');
  for (const z of [2114, 2134, 2158, 2178]) { sconce(W, 4.6, z, TN.trim); sconce(W, 17.4, z, TN.trim); }

  // ---- the central hall
  W.spot('core_hall', new THREE.Vector3(11, 0, 2204), 0);
  W.spot('core_arena', new THREE.Vector3(0, 0, 2226), 0);
  W.spot('core_capsule', new THREE.Vector3(0, 0, 2229), 0);
  W.spot('core_rack', new THREE.Vector3(-12, 0, 2222), 0);
  // the capsule: a long stone cradle with a glass lid and the body inside
  const cf = new Frame(W, 0, 0, 2236, 0);
  cf.box(2.6, 0.9, 5.4, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  core.capsule = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.8), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, transparent: true, opacity: 0.45, emissive: new THREE.Color(0x3a90ff), emissiveIntensity: 0.4 }));
  glass.position.set(0, 1.25, 0);
  core.capsule.add(glass);
  core.capsule.position.set(0, 0, 2236);
  W.addObject(core.capsule);
  core.body = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8c0a8, roughness: 0.8 });
  const robe = new THREE.MeshStandardMaterial({ color: 0x4a5a7a, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 1.2, 10).rotateX(Math.PI / 2), robe);
  torso.position.set(0, 1.05, 0.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.set(0, 1.08, -0.55);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 1.3, 10).rotateX(Math.PI / 2), robe);
  legs.position.set(0, 1.0, 1.4);
  core.body.add(torso, head, legs);
  core.body.position.set(0, 0, 2236);
  W.addObject(core.body);
  P('capsule_pressure', 'Клапан сброса давления', 'Сбросить давление капсулы', 3.4, 1.0, 2231);
  wheel(3.4, 2231);
  P('capsule_lock', 'Нижняя ручка капсулы', 'Повернуть нижнюю ручку (после сброса давления)', 0, 0.7, 2232.6);
  // the scale of the counted years, the shift log, the names of the dead (props to read)
  const sc = new Frame(W, -4.6, 0, 2236, 0);
  sc.box(0.3, 2.6, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  for (let i = 0; i < 30; i++) sc.box(0.34, 0.03, 0.55, 0, 0.1 + i * 0.08, 0, 'metal', { collide: false, tint: i % 5 === 4 ? 0xe0c070 : 0x8a96a4 });
  P('core_scale', 'Шкала лет', 'Осмотреть шкалу', -4.6, 1.3, 2236);
  const lg = new Frame(W, 4.6, 0, 2236, 0);
  lg.box(0.9, 0.9, 0.9, 0, 0, 0, 'wood', { tint: 0x6a4a34 });
  lg.box(0.7, 0.06, 0.5, 0, 0.9, 0, 'cloth', { collide: false, tint: 0xe8dcc0 });
  P('core_log', 'Журнал смен', 'Прочитать журнал смен', 4.6, 1.1, 2236);
  const nm = new Frame(W, 4.6, 0, 2241.5, 0);
  nm.box(1.4, 1.6, 0.2, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  P('core_names', 'Плита с именами', 'Прочитать имена', 4.6, 1.2, 2241);
  // Veyr's panel and projection on the north wall
  const vp = new Frame(W, 0, 0, 2254, 0);
  vp.box(3.0, 1.6, 0.6, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  vp.box(2.4, 0.9, 0.1, 0, 0.8, -0.35, 'rune', { collide: false });
  P('veyr_panel', 'Панель Вейра', 'Подойти к панели', 0, 1.3, 2252.8);
  W.spot('veyr_panel', new THREE.Vector3(0, 0, 2250), Math.PI);
  core.projection = projectionFigure(W, 0, 2248);
  core.projection.rotation.y = 0;
  // Edmund's link console (the start of the test rules)
  const lk = new Frame(W, -3, 0, 2204, 0);
  lk.box(1.1, 1.1, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  lk.box(0.5, 0.2, 0.1, 0, 1.1, 0, 'rune', { collide: false });
  P('core_link', 'Консоль связи', 'Включить консоль связи (Эдмунд)', -3, 1.2, 2204.6);
  // the rack of the small test: the switch (right of the link), the cable (left rack), the amplifier (right wall)
  const sw = new Frame(W, -10, 0, 2214, 0);
  sw.box(0.6, 1.1, 0.6, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  sw.cyl(0.06, 0.8, 0, 1.1, 0, 'metal', { seg: 6, rx: -0.4, collide: false });
  P('core_switch', 'Ручной выключатель', 'Осмотреть и отметить выключатель', -10, 1.3, 2214);
  const rk = new Frame(W, -14.6, 0, 2226, 0);
  rk.box(0.6, 2.2, 3.0, 0, 0, 0, 'metal', { tint: 0x6a7684 });
  rk.cyl(0.05, 2.0, 0.4, 0.3, 0.4, 'metal', { seg: 6, rx: Math.PI / 2, collide: false, tint: 0x2a2a30 });
  P('core_cable', 'Нижний кабель стойки', 'Осмотреть кабель', -13.8, 0.9, 2226);
  P('core_cable_cut', 'Нижний кабель стойки', 'Разомкнуть кабель посохом (Мегумин)', -13.8, 0.9, 2225);
  const am = new Frame(W, 14.6, 0, 2214, 0);
  am.box(0.8, 2.0, 2.6, 0, 0, 0, 'metal', { tint: 0x6a7684 });
  core.ampMat = glow(0x6fe0ff, 0.4);
  const ampLamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.8), core.ampMat);
  ampLamp.position.set(14.1, 1.5, 2214);
  W.addObject(ampLamp);
  P('core_amp', 'Усилитель старого канала', 'Осмотреть усилитель', 13.9, 1.2, 2214);
  // three temporary holders for the regulators (the shards stay the party's)
  [-5, 0, 5].forEach((x, i) => {
    const F = new Frame(W, x, 0, 2220, 0);
    F.cyl(0.35, 0.9, 0, 0, 0, 'stoneDark', { seg: 10, tint: TN.trim });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.6, 1), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: new THREE.Color(0.6, 1.4, 2.6), emissiveIntensity: 1.4, roughness: 0.1 }));
    gem.position.set(x, 1.2, 2220);
    gem.visible = false;
    W.addObject(gem);
    core.holders.push(gem);
    P('holder_' + (i + 1), 'Временный держатель', 'Поставить регулятор в держатель', x, 1.0, 2220);
  });
  // the gauges, the seams (steam-pipes on the side walls, Roxy cools them), the side posts, the valve under the stairs
  post(-9, 2244); post(9, 2244);
  P('core_gauge_1', 'Мерный столб', 'Снять показание', -9, 1.2, 2244);
  P('core_gauge_2', 'Мерный столб', 'Снять показание', 9, 1.2, 2244);
  [[-15.3, 'a'], [15.3, 'b']].forEach(([x, k]) => {
    const m = glow(0x6fe0ff, 0.3);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 2.4), m);
    seam.position.set(x, 2.6, 2240);
    W.addObject(seam);
    core.seams.push({ k, mat: m });
    W.spot('core_seam_' + k, new THREE.Vector3(x, 2.6, 2240), 0);
    P('core_seam_' + k, 'Верхний шов', 'Шов греется. Охлади его водяным залпом (Рокси: Tab, Q)', x > 0 ? x - 0.6 : x + 0.6, 2.6, 2240);
  });
  [[-14, 'l'], [14, 'r']].forEach(([x, k]) => {
    const F = new Frame(W, x, 0, 2250, 0);
    F.box(0.9, 1.4, 0.7, 0, 0, 0, 'stoneDark', { tint: TN.trim });
    const m = glow(0xff7a30, 0.9);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), m);
    lamp.position.set(x, 1.3, 2249.6);
    W.addObject(lamp);
    core.lamps.push({ k, mat: m });
    P('post_' + k, k === 'l' ? 'Левый боковой пост' : 'Правый боковой пост', 'Снять питание поста', x, 1.1, 2249.4);
  });
  wheel(-14, 2203);
  P('core_valve', 'Клапан под лестницей', 'Открыть клапан под лестницей', -14, 1.0, 2203);
  const st = new Frame(W, -13.4, 0, 2208, 0);
  for (let i = 0; i < 5; i++) st.box(1.6, 0.16, 0.5, 0, i * 0.16, i * 0.5, 'stone', { collide: false, tint: TN.trim });
  P('core_terminal', 'Панель отчётов', 'Осмотреть схему и показания', 4, 1.2, 2253);
  const tm = new Frame(W, 4, 0, 2254.4, 0);
  tm.box(1.5, 1.5, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  tm.box(1.1, 0.7, 0.1, 0, 0.7, -0.3, 'rune', { collide: false });
  // ---- chapter 10: the final operation — a second link console use, the two inflows, the limiter, the bypass, the exit lift
  P('core_link2', 'Консоль связи', 'Назвать цель и проверить готовность', -3, 1.2, 2203.6);
  P('core_ready_c', 'Консоль связи', 'Сообщить о готовности (разбор)', -3, 1.2, 2205);
  P('core_ready_r', 'Консоль связи', 'Сообщить о готовности (малый контур)', -2.2, 1.2, 2205);
  P('fpost_l', 'Левый боковой пост', 'Отключить питание поста', -14, 1.1, 2248.6);
  P('fpost_r', 'Правый боковой пост', 'Отключить питание поста', 14, 1.1, 2248.6);
  wheel(-14, 2210); wheel(14, 2210);
  P('inflow_a', 'Внешний приток', 'Закрыть внешний приток (Рокси)', -14, 1.0, 2210);
  P('inflow_b', 'Внешний приток', 'Закрыть внешний приток (Рокси)', 14, 1.0, 2210);
  const lp = new Frame(W, 14.4, 0, 2226, 0);
  lp.box(0.6, 1.6, 1.6, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  lp.box(0.1, 0.5, 0.9, -0.3, 1.0, 0, 'rune', { collide: false });
  P('limiter_panel', 'Боковая панель', 'Поставить ограничитель Эдмунда (Мегумин)', 13.6, 1.1, 2226);
  wheel(14, 2231);
  P('bypass_valve', 'Обводной вентиль', 'Направить воду в обход усилителя (Рокси)', 14, 1.0, 2231);
  const ep = new Frame(W, 6, 0, 2201, 0);
  ep.cyl(1.2, 0.18, 0, 0, 0, 'stoneDark', { seg: 14, collide: false, tint: TN.trim });
  ep.cyl(0.8, 0.1, 0, 0.18, 0, 'rune', { seg: 14, collide: false });
  P('exit_shield', 'Заслон у подъёмника', 'Поставить водяной заслон (Рокси)', 4.4, 1.0, 2201);
  P('exit_lift', 'Подъёмник', 'Подняться в город', 6, 0.8, 2201);
  W.spot('core_white', new THREE.Vector3(0, 0, 2252), Math.PI);
  W.spot('core_amp', new THREE.Vector3(14.6, 0, 2214), -Math.PI / 2);
  for (const [x, z] of [[-13, 2206], [13, 2206], [-13, 2232], [13, 2232], [-13, 2256], [13, 2256]]) sconce(W, x, z, TN.trim);
  for (const [x, z] of [[11, 2112], [11, 2132], [11, 2156], [11, 2176], [11, 2204], [-8, 2214], [8, 2214], [-8, 2238], [8, 2238], [0, 2250]]) W.addLightSource(new THREE.Vector3(x, 3.8, z), { color: 0xa8c8ff, intensity: 7, distance: 22, always: true });

  core.sync = (F) => {
    const open = !!F.service_open;
    core.gate.visible = !open;
    for (const c of core.gateColliders) c.enabled = !open;
    core.holders.forEach((g, i) => { g.visible = !!F['holder_' + (i + 1)]; });
    for (const s of core.seams) {
      const hot = F.core_hot && !F['core_seam_' + s.k];
      s.mat.emissive.set(hot ? 0xff5a30 : 0x6fe0ff);
      s.mat.emissiveIntensity = hot ? 1.8 : 0.3;
    }
    core.ampMat.emissive.set(F.core_hot && !F.core_cable_cut ? 0xff5a30 : 0x6fe0ff);
    core.ampMat.emissiveIntensity = F.core_amp ? 1.4 : 0.4;
    for (const l of core.lamps) { const off = F['fpost_' + l.k + '_off'] || (F['post_' + l.k + '_off'] && !F.ch9_done); l.mat.emissive.set(off ? 0x2a3a4a : 0xff7a30); l.mat.emissiveIntensity = off ? 0.2 : 1.2; }
    core.capsule.visible = !F.capsule_open;
    core.body.visible = !F.veyr_out;
    core.projection.visible = !!F.core_projection && !F.capsule_open;
  };
  core.sync({});
}
