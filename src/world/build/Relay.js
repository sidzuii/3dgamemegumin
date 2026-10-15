import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, lantern } from './Kit.js';
import { QuestProp, Door } from '../Interactables.js';
import { hall, passage } from './Crypt.js';
import { RELAY_ZONE } from './Dungeon.js';

/**
 * The relay post beyond the eastern ridge (chapter 6, "По другую сторону хребта"): an interior beyond the map edge like the
 * crypt. Gate yard (two stone guardians) -> service hall (the workers' cell behind a grate: three ways to get them out)
 * -> archive (three documents) -> lens hall (two plates, the clogged trough, the lens lever, the defence of the panel,
 * Veyr's projection). The way in is the post gate at the east pass (Countryside.js); the lift in the lens hall leads back.
 *
 * Story state lives in flags (relay_grate_open, relay_plate_a/b, relay_trough_clean, relay_lens_on, relay_projection...);
 * `world.relay.sync(flags)` applies it to the scene (also after loading a save). Props/behaviour: data/story/props.js.
 */
const TN = { wall: 0x7d8794, floor: 0x555d68, ceil: 0x3c424b, trim: 0x98a4b2 };
const WOOD = 0x6a4a34;

export function buildRelay(world) {
  const W = world;
  const rng = mulberry32(6160);
  hall(W, rng, -11, 11, 1420, 1446, [{ side: 'n', c: 0, w: 4 }], 7, TN);
  passage(W, 0, 1446, 0, 1458, 4, TN);
  hall(W, rng, -14, 14, 1458, 1494, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }, { side: 'e', c: 1474, w: 4 }], 7, TN);
  passage(W, 14, 1474, 18, 1474, 4, TN);
  hall(W, rng, 18, 30, 1466, 1482, [{ side: 'w', c: 1474, w: 4 }], 5, TN);
  passage(W, 0, 1494, 0, 1506, 4, TN);
  hall(W, rng, -10, 10, 1506, 1532, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }], 6.5, TN);
  passage(W, 0, 1532, 0, 1544, 4, TN);
  hall(W, rng, -14, 14, 1544, 1584, [{ side: 's', c: 0, w: 4 }], 8, TN);

  const relay = { plates: [], gateBars: null, grateColliders: [], clog: [], lens: null, projection: null };
  W.relay = relay;
  const P = (id, name, prompt, x, y, z) => W.addInteractable(new QuestProp({ id, name, prompt, position: new THREE.Vector3(x, y, z), shape: 'none' }));
  const glow = (color, k = 0.2) => { const m = W.mats.rune.clone(); m.emissive = new THREE.Color(color); m.emissiveIntensity = k; return m; };

  // ---- A: the gate yard: arrival, the stone guardians, the workers' rope on the inner arch
  W.spot('relay_in', new THREE.Vector3(0, 0, 1425), 0);
  W.spot('relay_yard', new THREE.Vector3(0, 0, 1434), 0);
  W.addInteractable(new Door({ id: 'relay_exit', name: 'Ворота поста', prompt: 'Выйти на перевал', position: new THREE.Vector3(0, 0, 1421.6), target: 'relay_gate_out', shape: 'none' }));
  for (const s of [-1, 1]) {
    const F = new Frame(W, s * 2.4, 0, 1421, 0);
    F.box(0.9, 4.6, 0.9, 0, 0, 0, 'stoneDark', { tint: TN.trim });
    F.box(1.1, 0.3, 1.1, 0, 4.6, 0, 'stone', { tint: TN.trim });
  }
  for (const x of [-7.5, 7.5]) for (const z of [1430, 1440]) {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.5, 7, 0, 0, 0, 'stone', { seg: 10, tint: TN.trim });
    F.box(1.3, 0.3, 1.3, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  }
  for (const s of [-1, 1]) sconce(W, s * 10.2, 1436);
  // The rope of the two workers hangs from an iron ring on the inner arch (the way they went in).
  const rf = new Frame(W, 1.7, 0, 1445.3, 0);
  rf.cyl(0.05, 2.4, 0, 0.2, 0, 'log', { seg: 6, collide: false, castShadow: false, tint: 0xc0aa78 });
  rf.cyl(0.14, 0.12, 0, 2.6, 0, 'metal', { seg: 8, rx: Math.PI / 2, collide: false });
  P('relay_rope_gate', 'Верёвка Дана и Осы', 'Осмотреть верёвку', 1.7, 1.2, 1445.3);
  W.camp('guardian', -4, 1437, 'relay_yard');
  W.camp('guardian', 4, 1437, 'relay_yard');

  // ---- B: the service hall: columns (the watcher turns after the second one), the lower anchor, the rope post
  for (const x of [-6, 6]) for (const z of [1466, 1478, 1488]) {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.45, 7, 0, 0, 0, 'stone', { seg: 10, tint: TN.trim });
    F.box(1.1, 0.3, 1.1, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  }
  W.spot('relay_hall', new THREE.Vector3(0, 0, 1472), 0);
  W.spot('relay_far_edge', new THREE.Vector3(-11, 0, 1490), 0);
  W.spot('relay_watch', new THREE.Vector3(4, 0, 1484), Math.PI);
  sconce(W, -12.6, 1468);
  sconce(W, -12.6, 1486);
  // lower belay: an iron ring in the floor by the west wall
  const af = new Frame(W, -11, 0, 1466, 0);
  af.cyl(0.35, 0.12, 0, 0, 0, 'metal', { seg: 10, collide: false });
  af.cyl(0.22, 0.05, 0, 0.12, 0, 'metal', { seg: 10, rx: Math.PI / 2, collide: false });
  P('relay_anchor_low', 'Нижний крюк', 'Закрепить нижнюю страховку', -11, 0.5, 1466);
  // the rope post in front of the grate
  const pf = new Frame(W, 15.2, 0, 1472.4, 0);
  pf.cyl(0.18, 1.1, 0, 0, 0, 'log', { seg: 8, tint: WOOD });
  pf.cyl(0.3, 0.3, 0, 0.7, 0, 'log', { seg: 8, rx: 0, collide: false, tint: 0xc0aa78 });
  P('relay_rope_mid', 'Опора каната', 'Натянуть канат', 15.2, 1.0, 1472.4);

  // ---- C: the workers' cell behind a grate; a latch on the grate that only a volley can reach
  relay.gate = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), W.mats.metal);
    bar.position.set(17.0, 1.4, 1472.2 + i * 0.6);
    relay.gate.add(bar);
  }
  for (const y of [0.4, 2.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.7), W.mats.metal);
    rail.position.set(17.0, y, 1474);
    relay.gate.add(rail);
  }
  W.addObject(relay.gate);
  for (const z of [1472.4, 1473.6, 1474.8, 1475.8]) {
    const c = { x: 17.0, y: 0, z, r: 0.75, h: 2.8, enabled: true };
    W.dynamicColliders.push(c);
    relay.grateColliders.push(c);
  }
  relay.latch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14).rotateZ(Math.PI / 2), glow(0xffb060, 0.25));
  relay.latch.position.set(16.9, 2.9, 1474);
  W.addObject(relay.latch);
  P('relay_latch', 'Защёлка решётки', 'Защёлка высоко. Сбей её издали (Water Volley, Рокси)', 16.7, 2.9, 1474);
  W.spot('relay_latch', new THREE.Vector3(16.9, 2.9, 1474), 0);
  W.spot('relay_dan', new THREE.Vector3(18.9, 0, 1472.4), -Math.PI / 2);
  W.spot('relay_osa', new THREE.Vector3(18.9, 0, 1476), -Math.PI / 2);
  W.spot('relay_out', new THREE.Vector3(8, 0, 1472), 0);
  sconce(W, 29.0, 1470);
  const cf = new Frame(W, 26, 0, 1478, 0);
  cf.box(2.4, 0.5, 0.9, 0, 0, 0, 'wood', { tint: WOOD });
  cf.box(0.8, 0.6, 0.8, -2.6, 0, 0.2, 'wood', { tint: WOOD });

  // ---- D: the archive: three documents on three tables, shelves along the walls
  W.spot('relay_archive', new THREE.Vector3(0, 0, 1518), 0);
  [[-5, 1513], [0, 1520], [5, 1513]].forEach(([x, z], i) => {
    const F = new Frame(W, x, 0, z, 0);
    F.box(2.2, 0.1, 1.2, 0, 0.8, 0, 'wood', { tint: WOOD });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(0.12, 0.8, 0.12, sx * 0.95, 0, sz * 0.45, 'wood', { tint: WOOD });
    W.addInteractable(new QuestProp({ id: 'relay_doc_' + (i + 1), name: ['Протокол испытаний', 'Возражение Орина Селла', 'Список людей'][i], prompt: 'Прочитать', position: new THREE.Vector3(x, 0.9, z), shape: 'book' }));
  });
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const F = new Frame(W, s * 9.1, 0, 1511 + k * 5, 0);
    F.box(0.7, 2.4, 3.6, 0, 0, 0, 'wood', { tint: 0x5a4430 });
    for (let r = 0; r < 4; r++) for (let b = 0; b < 6; b++) F.box(0.4, 0.4, 0.16, -s * 0.05, 0.25 + r * 0.55, -1.5 + b * 0.6, 'wood', { collide: false, castShadow: false, tint: [0x8a3a30, 0x3a5a8a, 0x6a7a4a, 0xb89a5a][(r + b + k) % 4] });
  }
  sconce(W, -9.4, 1509);
  sconce(W, 9.4, 1529);

  // ---- E: the lens hall
  const hy = 0.05;
  [[-9, 1556, 'a'], [9, 1556, 'b']].forEach(([x, z, k]) => {
    const m = glow(0x7fd0ff, 0.15);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 24), m);
    disc.position.set(x, hy, z);
    W.addObject(disc);
    relay.plates.push({ key: 'relay_plate_' + k, mat: m });
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(1.45, 0.16, 0, 0, 0, 'stoneDark', { seg: 24, collide: false, castShadow: false, tint: TN.trim });
    P('relay_plate_' + k, 'Площадка согласования', 'Согласовать площадку', x, 0.5, z);
  });
  // the water trough along the west wall, with a clog that only Roxy's water can wash out
  const tf = new Frame(W, -12.2, 0, 1564, 0);
  tf.box(1.2, 0.5, 34, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  const water = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 33.4), W.mats.water);
  water.position.set(-12.2, 0.46, 1564);
  W.addObject(water);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + (i % 2) * 0.15, 0), new THREE.MeshStandardMaterial({ color: [0x4a4030, 0x3a3a2a, 0x5a4a38][i % 3], roughness: 1 }));
    m.position.set(-12.2 + (i % 2) * 0.15, 0.85, 1562 + i * 0.7);
    W.addObject(m);
    relay.clog.push(m);
  }
  W.spot('relay_trough', new THREE.Vector3(-12.0, 0.8, 1564), 0);
  P('relay_trough', 'Засорённый желоб', 'Желоб забит. Промой его водяным залпом (Рокси)', -11.4, 0.9, 1564);
  // the lens on its pedestal and the lever in front of it
  const lf = new Frame(W, 0, 0, 1576, 0);
  lf.cyl(1.6, 0.8, 0, 0, 0, 'stone', { seg: 16, tint: TN.trim });
  lf.cyl(0.35, 1.4, 0, 0.8, 0, 'stoneDark', { seg: 10, tint: TN.trim });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, emissive: new THREE.Color(0x4aa0ff), emissiveIntensity: 0.1 });
  relay.lens = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14).scale(1, 1, 0.35), lensMat);
  relay.lens.position.set(0, 3.0, 1576);
  W.addObject(relay.lens);
  lf.box(2.6, 0.18, 0.18, 0, 4.1, 0, 'metal', { collide: false });
  const lever = new Frame(W, 0, 0, 1571, 0);
  lever.box(0.5, 0.5, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  lever.cyl(0.06, 1.0, 0, 0.5, 0, 'metal', { seg: 6, rx: -0.5, collide: false });
  P('relay_lens', 'Рычаг линзы', 'Удерживать рычаг (посох Мегумин)', 0, 1.0, 1571);
  W.spot('relay_lens', new THREE.Vector3(0, 0, 1569), Math.PI);
  W.spot('relay_panel', new THREE.Vector3(0, 0, 1562), 0);
  W.spot('relay_projection', new THREE.Vector3(0, 0, 1566), Math.PI);
  relay.projection = projectionFigure(W, 0, 1581.2);
  W.addInteractable(new Door({ id: 'relay_lift', name: 'Подъёмник', prompt: 'Вернуться на перевал', position: new THREE.Vector3(11, 0, 1548.6), target: 'relay_gate_out', shape: 'lift' }));
  sconce(W, -13, 1550);
  sconce(W, 13, 1550);
  W.addLightSource(new THREE.Vector3(0, 3.6, 1574), { color: 0x7fc8ff, intensity: 6, distance: 18, always: true });

  // lights tied to the sconces/lanterns above, plus the cold light of the status panels
  for (const [x, z] of [[0, 1432], [0, 1470], [0, 1518], [0, 1556]]) W.addLightSource(new THREE.Vector3(x, 3.4, z), { color: 0x9ac4ff, intensity: 4, distance: 15, always: true });

  relay.sync = (F) => {
    const open = !!F.relay_grate_open;
    relay.gate.visible = !open;
    for (const c of relay.grateColliders) c.enabled = !open;
    relay.latch.material.emissiveIntensity = F.relay_latch_hit ? 1.6 : 0.25;
    relay.latch.material.emissive.set(F.relay_latch_hit ? 0x6fe0ff : 0xffb060);
    for (const p of relay.plates) p.mat.emissiveIntensity = F[p.key] ? 1.8 : 0.15;
    for (const m of relay.clog) m.visible = !F.relay_trough_clean;
    lensMat.emissiveIntensity = F.relay_lens_on ? 2.2 : 0.1;
    relay.projection.visible = !!F.relay_projection;
  };
  relay.sync({});
}

function sconce(W, x, z) {
  const F = new Frame(W, x, 0, z, 0);
  F.box(0.2, 2.4, 0.2, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  lantern(W, F.sub(0, 2.4, 0));
}

/** Veyr's projection (the same ghostly figure as in the crypt), toggled by `relay.sync`. */
function projectionFigure(W, x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.2, 10).translate(0, 0.9, 0), mat));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.5, 10).translate(0, 1.75, 0), mat));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 2.25, 0), mat));
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6).rotateZ(s * 0.3).translate(s * 0.42, 1.55, 0), mat));
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI;
  g.visible = false;
  W.addObject(g);
  W.addUpdatable({ update: () => { const t = (performance.now() / 1000) % 1000; mat.opacity = 0.32 + Math.sin(t * 17) * 0.06 + (Math.sin(t * 3.3) > 0.92 ? -0.25 : 0); } });
  return g;
}

export { RELAY_ZONE };
