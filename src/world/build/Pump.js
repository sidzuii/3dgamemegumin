import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame } from './Kit.js';
import { QuestProp, Door } from '../Interactables.js';
import { hall, passage } from './Crypt.js';
import { sconce, projectionFigure } from './Relay.js';
import { PUMP_ZONE } from './Dungeon.js';

/**
 * The pump station and the deep shaft under Axel (chapter 8, "Город над машиной"): an interior beyond the map edge, entered by
 * the cistern hatch next to the town well. Shaft hall -> junction (two ways, only the one that matches WATER_FIRST is open:
 * the side tunnel with the lamps for the residents' route, the worker gallery with the tool for the repair route) -> the pump
 * room (Garret, the jammed valve, two seams, the service panel of Veyr) -> the deep shaft (Dan, Osa behind a self-closing
 * grate, the breaker on the upper ledge, the link socket for Edmund's module).
 * State: flags (pump_*, deep_*, link_*) and the variable WATER_FIRST; `world.pump.sync(flags, vars)` applies it.
 * Props/behaviour: data/story/props.js. Level text: docs/story/03 (C15-C20).
 */
const TN = { wall: 0x7a8088, floor: 0x50565c, ceil: 0x383c42, trim: 0x9aa4ae };
const WOOD = 0x6a4a34;

export function buildPump(world) {
  const W = world;
  const rng = mulberry32(8180);
  hall(W, rng, -8, 8, 1886, 1904, [{ side: 'n', c: 0, w: 4 }], 7, TN);
  passage(W, 0, 1904, 0, 1916, 4, TN);
  hall(W, rng, -14, 14, 1916, 1944, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: -8, w: 4 }, { side: 'n', c: 8, w: 4 }], 7, TN);
  passage(W, -8, 1944, -8, 1960, 4, TN);
  passage(W, 8, 1944, 8, 1960, 4, TN);
  hall(W, rng, -12, -4, 1960, 1990, [{ side: 's', c: -8, w: 4 }, { side: 'n', c: -8, w: 4 }], 6, TN); // side tunnel
  hall(W, rng, 4, 12, 1960, 1990, [{ side: 's', c: 8, w: 4 }, { side: 'n', c: 8, w: 4 }], 6, TN); // worker gallery
  passage(W, -8, 1990, -8, 2002, 4, TN);
  passage(W, 8, 1990, 8, 2002, 4, TN);
  hall(W, rng, -14, 14, 2002, 2040, [{ side: 's', c: -8, w: 4 }, { side: 's', c: 8, w: 4 }, { side: 'n', c: 0, w: 4 }], 8, TN); // pump room
  passage(W, 0, 2040, 0, 2052, 4, TN);
  hall(W, rng, -14, 14, 2052, 2096, [{ side: 's', c: 0, w: 4 }, { side: 'w', c: 2085, w: 4 }, { side: 'e', c: 2070, w: 4 }, { side: 'n', c: 11, w: 4 }], 9, TN); // deep shaft (the north-east exit leads to the service galleries, Core.js)
  passage(W, -14, 2085, -18, 2085, 4, TN);
  hall(W, rng, -30, -18, 2074, 2096, [{ side: 'e', c: 2085, w: 4 }], 6, TN); // the lower seam
  passage(W, 14, 2070, 18, 2070, 4, TN);
  hall(W, rng, 18, 30, 2062, 2078, [{ side: 'w', c: 2070, w: 4 }], 6, TN); // the upper ledge

  const pump = { gates: {}, gateColliders: { w: [], e: [] }, plates: [], projection: null };
  W.pump = pump;
  const P = (id, name, prompt, x, y, z) => W.addInteractable(new QuestProp({ id, name, prompt, position: new THREE.Vector3(x, y, z), shape: 'none' }));
  const glow = (color, k = 0.2) => { const m = W.mats.rune.clone(); m.emissive = new THREE.Color(color); m.emissiveIntensity = k; return m; };
  const wheel = (x, z, k = 'metal') => {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.14, 1.1, 0, 0, 0, k, { seg: 8 });
    F.cyl(0.38, 0.08, 0, 1.15, 0, k, { seg: 12, collide: false });
  };

  // ---- A: the shaft hall (way up to the cistern hatch)
  W.spot('pump_in', new THREE.Vector3(0, 0, 1891), 0);
  W.addInteractable(new Door({ id: 'pump_exit', name: 'Лестница наверх', prompt: 'Подняться к цистерне', position: new THREE.Vector3(0, 0, 1887.6), target: 'pump_gate_out', shape: 'ladder' }));
  for (const s of [-1, 1]) sconce(W, s * 6.6, 1896, TN.trim);
  for (const [x, z] of [[-2.4, 1894], [2.4, 1894]]) { const F = new Frame(W, x, 0, z, 0); F.box(0.9, 0.6, 0.9, 0, 0, 0, 'wood', { tint: WOOD }); }

  // ---- B: the junction: two gates (the way that does not match WATER_FIRST is shut)
  W.spot('pump_junction', new THREE.Vector3(0, 0, 1930), 0);
  for (const [k, x] of [['w', -8], ['e', 8]]) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), W.mats.metal);
      bar.position.set(x - 1.5 + i * 0.6, 1.4, 1951);
      g.add(bar);
    }
    W.addObject(g);
    pump.gates[k] = g;
    for (const dx of [-1.3, 0, 1.3]) {
      const c = { x: x + dx, y: 0, z: 1951, r: 0.8, h: 2.8, enabled: true };
      W.dynamicColliders.push(c);
      pump.gateColliders[k].push(c);
    }
  }
  sconce(W, -12.6, 1924, TN.trim);
  sconce(W, 12.6, 1924, TN.trim);

  // ---- side tunnel (residents' route): two lamp hooks; service guards in it
  W.spot('pump_tunnel', new THREE.Vector3(-8, 0, 1966), 0);
  [[-8, 1.4, 1968, 'a'], [-8, 1.4, 1984, 'b']].forEach(([x, y, z, k]) => P('tunnel_lamp_' + k, 'Крюк для лампы', 'Повесить лампу', x, y, z));
  for (const z of [1964, 1976]) { const F = new Frame(W, -10.8, 0, z, 0); F.box(0.5, 1.6, 0.5, 0, 0, 0, 'wood', { tint: WOOD }); }
  W.camp('watcher', -8, 1976, 'pump_w');
  W.camp('watcher', -9, 1982, 'pump_w');
  // ---- worker gallery (repair route): the pump key on the tool rack, a valve
  W.spot('pump_gallery', new THREE.Vector3(8, 0, 1966), 0);
  const rack = new Frame(W, 11.2, 0, 1968, 0);
  rack.box(0.5, 1.8, 2.4, 0, 0, 0, 'wood', { tint: WOOD });
  rack.box(0.2, 0.3, 1.6, -0.2, 1.1, 0, 'metal', { collide: false });
  P('gallery_tool', 'Стойка с инструментом', 'Взять ключ насоса', 10.4, 1.2, 1968);
  wheel(8, 1982);
  P('gallery_valve', 'Вентиль галереи', 'Повернуть вентиль галереи', 8, 1.0, 1982);
  W.camp('guardian', 8, 1976, 'pump_e');
  for (const z of [1964, 1984]) sconce(W, 4.6, z, TN.trim);

  // ---- C: the pump room
  W.spot('pump_room', new THREE.Vector3(0, 0, 2010), 0);
  W.spot('pump_garret', new THREE.Vector3(-3, 0, 2016), Math.PI / 2);
  const pf = new Frame(W, 0, 0, 2024, 0);
  pf.cyl(2.6, 0.9, 0, 0, 0, 'stoneDark', { seg: 18, tint: TN.trim });
  pf.cyl(1.7, 3.6, 0, 0.9, 0, 'metal', { seg: 18, tint: 0x9aa6b4 });
  pf.cyl(2.0, 0.3, 0, 4.4, 0, 'stoneDark', { seg: 18, tint: TN.trim });
  for (const s of [-1, 1]) pf.cyl(0.3, 5.5, s * 4.2, 0, 0, 'metal', { seg: 8, collide: false });
  // the jammed valve (Megumin turns it), two seams (leaks after the first turn), the repair hole, the adjustment valve
  wheel(4, 2012);
  P('pump_key', 'Заклинивший клапан', 'Провернуть клапан (ключ, Мегумин)', 4, 1.0, 2012);
  W.spot('pump_seam_a', new THREE.Vector3(-3.4, 1.2, 2027), 0);
  W.spot('pump_seam_b', new THREE.Vector3(3.4, 1.2, 2027), 0);
  P('pump_hole', 'Течь у отверстия', 'Поставить ремонтный щит (Мегумин)', 3.4, 1.2, 2026.5);
  P('pump_adjust', 'Регулировочный шов', 'Отрегулировать шов водой (Рокси)', -3.4, 1.2, 2026.5);
  wheel(-8, 2012);
  P('pump_valve', 'Нижний вентиль', 'Закрыть нижний вентиль на четверть', -8, 1.0, 2012);
  wheel(8, 2020);
  P('pump_valve_b', 'Вентиль подачи', 'Закрыть вентиль подачи на четверть', 8, 1.0, 2020);
  W.spot('pump_guards', new THREE.Vector3(0, 0, 2018), 0);
  // the service panel of Veyr on the north wall
  const sp = new Frame(W, 0, 0, 2038.6, 0);
  sp.box(2.6, 1.7, 0.5, 0, 0.5, 0, 'stoneDark', { tint: TN.trim });
  sp.box(2.0, 1.0, 0.1, 0, 0.9, -0.3, 'rune', { collide: false });
  P('service_panel', 'Сервисная панель', 'Включить сервисную панель', 0, 1.3, 2037.6);
  W.spot('service_panel', new THREE.Vector3(0, 0, 2035), Math.PI);
  pump.projection = projectionFigure(W, 0, 2032);
  pump.projection.rotation.y = 0;
  for (const [x, z] of [[-13, 2008], [13, 2008], [-13, 2034], [13, 2034]]) sconce(W, x, z, TN.trim);

  // ---- D: the deep shaft: Dan, the lever, the grate to the lower seam (Osa), the ledge with the breaker, the link socket
  W.spot('deep_hall', new THREE.Vector3(0, 0, 2062), 0);
  W.spot('deep_dan', new THREE.Vector3(9, 0, 2066), -Math.PI / 2);
  W.spot('deep_osa', new THREE.Vector3(-21, 0, 2082), Math.PI / 2);
  W.spot('deep_ledge', new THREE.Vector3(24, 0, 2070), -Math.PI / 2);
  W.spot('deep_latch', new THREE.Vector3(-15.9, 2.9, 2085), 0);
  const ladder = new Frame(W, 11.5, 0, 2060, 0);
  for (const s of [-1, 1]) ladder.box(0.08, 3.2, 0.08, 0, 0, s * 0.35, 'wood', { collide: false, tint: WOOD });
  for (let i = 0; i < 7; i++) ladder.box(0.06, 0.06, 0.7, 0, 0.3 + i * 0.4, 0, 'wood', { collide: false, tint: WOOD });
  pump.grate = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), W.mats.metal);
    bar.position.set(-16, 1.4, 2083.2 + i * 0.6);
    pump.grate.add(bar);
  }
  W.addObject(pump.grate);
  pump.grateColliders = [2083.6, 2084.8, 2086, 2087].map((z) => {
    const c = { x: -16, y: 0, z, r: 0.75, h: 2.8, enabled: true };
    W.dynamicColliders.push(c);
    return c;
  });
  pump.latch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14).rotateZ(Math.PI / 2), glow(0xffb060, 0.25));
  pump.latch.position.set(-15.9, 2.9, 2085);
  W.addObject(pump.latch);
  P('deep_latch', 'Защёлка решётки', 'Защёлка высоко. Сбей её издали (Water Volley, Рокси)', -15.7, 2.9, 2085);
  const lv = new Frame(W, -12, 0, 2079, 0);
  lv.box(0.5, 0.5, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  lv.cyl(0.06, 1.0, 0, 0.5, 0, 'metal', { seg: 6, rx: -0.5, collide: false });
  P('deep_lever', 'Рычаг решётки', 'Удерживать рычаг решётки (Мегумин)', -12, 1.0, 2079);
  P('deep_osa_help', 'Оса у решётки', 'Помочь Осе выйти', -17.4, 1.0, 2083);
  const bf = new Frame(W, 28.6, 0, 2070, 0);
  bf.box(0.5, 1.6, 1.4, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  bf.box(0.2, 0.6, 0.2, -0.3, 1.0, 0, 'metal', { collide: false });
  P('deep_breaker', 'Ручной рубильник', 'Выключить панель (рубильник)', 27.6, 1.3, 2070);
  P('deep_tag', 'Бирка на стене', 'Прочитать бирку', 0, 1.2, 2093.4);
  // the link: socket for the module, power, the check (three posts on the north wall)
  [[-6, 'link_socket', 'Гнездо модуля', 'Установить модуль связи'], [0, 'link_power', 'Силовая линия', 'Подать питание'], [6, 'link_check', 'Контрольная панель', 'Проверить связь']].forEach(([x, id, name, prompt]) => {
    const F = new Frame(W, x, 0, 2093.8, 0);
    F.box(1.2, 1.3, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
    const m = glow(0xff7a30, 0.4);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.08), m);
    lamp.position.set(x, 1.1, 2093.5);
    W.addObject(lamp);
    pump.plates.push({ key: id, mat: m });
    P(id, name, prompt, x, 1.0, 2093.2);
  });
  W.camp('guardian', 0, 2064, 'deep_guards');
  W.camp('watcher', -6, 2070, 'deep_guards');
  for (const [x, z] of [[-13, 2058], [13, 2058], [-13, 2092], [13, 2092]]) sconce(W, x, z, TN.trim);

  for (const [x, z] of [[0, 1894], [0, 1930], [-8, 1972], [8, 1972], [0, 2012], [0, 2030], [0, 2062], [0, 2084], [-24, 2085], [24, 2070]]) W.addLightSource(new THREE.Vector3(x, 3.6, z), { color: 0xa8c8ff, intensity: 7, distance: 22, always: true });

  pump.sync = (F, vars = {}) => {
    const wf = vars.WATER_FIRST;
    for (const c of pump.gateColliders.w) c.enabled = wf !== 'residents';
    for (const c of pump.gateColliders.e) c.enabled = wf !== 'repair';
    pump.gates.w.visible = wf !== 'residents';
    pump.gates.e.visible = wf !== 'repair';
    const open = !!F.deep_grate_open;
    pump.grate.visible = !open;
    for (const c of pump.grateColliders) c.enabled = !open;
    pump.latch.material.emissiveIntensity = F.deep_latch_hit ? 1.6 : 0.25;
    pump.latch.material.emissive.set(F.deep_latch_hit ? 0x6fe0ff : 0xffb060);
    for (const p of pump.plates) {
      p.mat.emissive.set(F[p.key] ? 0x6fe0ff : 0xff7a30);
      p.mat.emissiveIntensity = F[p.key] ? 1.6 : 0.4;
    }
    pump.projection.visible = !!F.pump_projection;
  };
  pump.sync({});
}

export { PUMP_ZONE };
