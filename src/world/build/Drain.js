import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame } from './Kit.js';
import { QuestProp, Door } from '../Interactables.js';
import { hall, passage } from './Crypt.js';
import { sconce, projectionFigure } from './Relay.js';
import { DRAIN_ZONE } from './Dungeon.js';

/**
 * The outer drain channel under the Crimson Gorge (chapter 7, "Договор в ущелье"): an interior beyond the map edge.
 * Lift hall -> cooling hall (two platforms: a manual valve + Roxy's volley each) -> Kharz's hall (the restriction line, the
 * treaty panel, the release props, two shields) -> the outer drain (the stone growth on the shutter, the measuring posts).
 * The way in is the drain gate in the gorge (Countryside.js). Story state lives in flags (drain_*, kharz_*);
 * `world.drain.sync(flags)` applies it. Props/behaviour: data/story/props.js; level text: docs/story/03 (C13–C14).
 */
const TN = { wall: 0x8e7870, floor: 0x5e504a, ceil: 0x3c3330, trim: 0xb08a72 };

export function buildDrain(world) {
  const W = world;
  const rng = mulberry32(7170);
  hall(W, rng, -8, 8, 1650, 1668, [{ side: 'n', c: 0, w: 4 }], 7, TN);
  passage(W, 0, 1668, 0, 1680, 4, TN);
  hall(W, rng, -14, 14, 1680, 1716, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }], 7, TN);
  passage(W, 0, 1716, 0, 1728, 4, TN);
  hall(W, rng, -12, 12, 1728, 1764, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }], 8, TN);
  passage(W, 0, 1764, 0, 1776, 4, TN);
  hall(W, rng, -16, 16, 1776, 1830, [{ side: 's', c: 0, w: 4 }], 9, TN);

  const drain = { plates: [], line: [], lineColliders: [], shields: [], growth: [], channel: null, projection: null };
  W.drain = drain;
  const P = (id, name, prompt, x, y, z) => W.addInteractable(new QuestProp({ id, name, prompt, position: new THREE.Vector3(x, y, z), shape: 'none' }));
  const glow = (color, k = 0.2) => { const m = W.mats.rune.clone(); m.emissive = new THREE.Color(color); m.emissiveIntensity = k; return m; };

  // ---- A: the lift hall
  W.spot('drain_in', new THREE.Vector3(0, 0, 1655), 0);
  W.addInteractable(new Door({ id: 'drain_exit', name: 'Подъёмник', prompt: 'Подняться в ущелье', position: new THREE.Vector3(0, 0, 1652.4), target: 'drain_gate_out', shape: 'lift' }));
  for (const s of [-1, 1]) sconce(W, s * 6.6, 1660, TN.trim);

  // ---- B: the cooling platforms — each needs its manual valve (interact) AND a volley of water on the plate
  W.spot('drain_cool', new THREE.Vector3(0, 0, 1692), 0);
  [[-8, 'a'], [8, 'b']].forEach(([x, k]) => {
    const m = glow(0xff7a30, 0.5);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 24), m);
    disc.position.set(x, 0.06, 1700);
    W.addObject(disc);
    drain.plates.push({ k, mat: m });
    new Frame(W, x, 0, 1700, 0).cyl(2.0, 0.16, 0, 0, 0, 'stoneDark', { seg: 24, collide: false, castShadow: false, tint: TN.trim });
    // the valve: a post with a wheel
    const vf = new Frame(W, x, 0, 1692, 0);
    vf.cyl(0.14, 1.1, 0, 0, 0, 'metal', { seg: 8 });
    vf.cyl(0.38, 0.08, 0, 1.15, 0, 'metal', { seg: 12, collide: false });
    P('drain_valve_' + k, 'Ручной клапан', 'Повернуть клапан', x, 1.0, 1692);
    P('drain_cool_' + k, 'Площадка охлаждения', 'Раскалена. Охлади её водяным залпом (Рокси: Tab, Q)', x, 0.5, 1700);
    W.spot('drain_cool_' + k, new THREE.Vector3(x, 0.4, 1700), 0);
  });
  for (const s of [-1, 1]) sconce(W, s * 12.6, 1686, TN.trim);

  // ---- C: Kharz's hall: the restriction line, the treaty panel, the release props, the two shields
  W.spot('drain_hall', new THREE.Vector3(0, 0, 1738), 0);
  W.spot('drain_kharz', new THREE.Vector3(0, 0, 1750.6), Math.PI);
  const line = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.04, 0.35), glow(0xff5a3a, 1.6));
  line.position.set(0, 0.04, 1747);
  W.addObject(line);
  drain.line.push(line);
  for (let x = -11; x <= 11.1; x += 1.4) {
    const c = { x, y: 0, z: 1747.4, r: 0.9, h: 2.6, enabled: true };
    W.dynamicColliders.push(c);
    drain.lineColliders.push(c);
  }
  const pf = new Frame(W, -4, 0, 1745, 0);
  pf.box(1.6, 1.0, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  pf.box(1.3, 0.1, 0.8, 0, 1.0, 0, 'metal', { collide: false, rx: -0.5 });
  P('drain_panel', 'Панель с договором', 'Прочитать договор', -4, 1.1, 1744.6);
  const gf = new Frame(W, 4, 0, 1745, 0);
  gf.cyl(0.16, 1.4, 0, 0, 0, 'metal', { seg: 8 });
  gf.box(0.7, 0.4, 0.1, 0, 1.4, 0, 'metal', { collide: false });
  P('treaty_gauge', 'Мерный столб', 'Снять замер', 4, 1.2, 1745);
  // the release props of the treaty (Roxy at the valve, Megumin at the lever)
  const rf = new Frame(W, -8, 0, 1739, 0);
  rf.cyl(0.14, 1.1, 0, 0, 0, 'metal', { seg: 8 });
  rf.cyl(0.38, 0.08, 0, 1.15, 0, 'metal', { seg: 12, collide: false });
  P('drain_valve_r', 'Клапан привязки', 'Повернуть клапан привязки (Рокси)', -8, 1.0, 1739);
  const lf = new Frame(W, 8, 0, 1739, 0);
  lf.box(0.5, 0.5, 0.5, 0, 0, 0, 'stoneDark', { tint: TN.trim });
  lf.cyl(0.06, 1.0, 0, 0.5, 0, 'metal', { seg: 6, rx: -0.5, collide: false });
  P('drain_lever_m', 'Рычаг привязки', 'Потянуть рычаг привязки (посох Мегумин)', 8, 1.0, 1739);
  // the two outer shields of the battle route: glowing discs over the line, Roxy's water breaks them
  [[-6, 'a'], [6, 'b']].forEach(([x, k]) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffa070, roughness: 0.2, transparent: true, opacity: 0.7, emissive: new THREE.Color(0xff6a30), emissiveIntensity: 1.2 });
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 18).rotateX(Math.PI / 2), m);
    sh.position.set(x, 1.9, 1758);
    W.addObject(sh);
    drain.shields.push({ k, mesh: sh });
    W.spot('kharz_shield_' + k, new THREE.Vector3(x, 1.9, 1758), 0);
    P('kharz_shield_' + k, 'Внешний щит', 'Щит держит жар. Разбей его водяным залпом (Рокси)', x, 1.9, 1757);
  });
  W.spot('kharz_arena', new THREE.Vector3(0, 0, 1756), Math.PI);
  W.spot('veyr_guards', new THREE.Vector3(0, 0, 1738), 0);
  drain.projection = projectionFigure(W, -4, 1741.4);
  drain.projection.rotation.y = 0;
  W.spot('drain_projection', new THREE.Vector3(-4, 0, 1736), 0);
  for (const s of [-1, 1]) sconce(W, s * 10.6, 1734, TN.trim);

  // ---- D: the outer drain: the hot channel, the growth on the manual shutter, the measuring posts
  W.spot('drain_outer', new THREE.Vector3(0, 0, 1790), 0);
  W.spot('drain_wall', new THREE.Vector3(-15.4, 0, 1802), Math.PI / 2);
  W.spot('drain_guards', new THREE.Vector3(2, 0, 1800), 0);
  const chm = new THREE.MeshStandardMaterial({ color: 0xff7a30, roughness: 0.5, emissive: new THREE.Color(0xff4a10), emissiveIntensity: 0.9 });
  drain.channel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 48), chm);
  drain.channel.position.set(2, 0.05, 1803);
  W.addObject(drain.channel);
  drain.channelMat = chm;
  new Frame(W, 2, 0, 1803, 0).box(6, 0.1, 49, 0, -0.02, 0, 'stoneDark', { collide: false, castShadow: false, tint: TN.trim });
  // the stone growth on the manual shutter at the west wall (gone after the blast)
  const grow = new Frame(W, -14.6, 0, 1802, 0);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.25, 0), new THREE.MeshStandardMaterial({ color: [0x4a3a34, 0x5a4a40, 0x3a2e2a][i % 3], roughness: 1 }));
    m.position.set(-14.6 + (i % 2) * 0.5, 0.8 + (i % 3) * 0.7, 1800 + i * 0.6);
    W.addObject(m);
    drain.growth.push(m);
  }
  grow.box(0.5, 1.6, 2.2, -0.9, 0, 0, 'metal', { collide: false, tint: 0x6a5a50 });
  P('drain_growth', 'Каменный нарост на заслонке', 'Нарост не сдвинуть руками. Нужен направленный взрыв в пустую боковую стену (Мегумин, Q)', -13.2, 1.0, 1802);
  [[-8, 1790], [-8, 1802], [-8, 1814]].forEach(([x, z], i) => {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.15, 1.5, 0, 0, 0, 'metal', { seg: 8 });
    F.box(0.8, 0.5, 0.1, 0, 1.5, 0, 'metal', { collide: false });
    P('drain_gauge_' + (i + 1), 'Мерный столб', 'Снять показания малого потока', x, 1.2, z);
  });
  for (const [x, z] of [[-14, 1782], [14, 1782], [-14, 1824], [14, 1824]]) sconce(W, x, z, TN.trim);
  for (const [x, z] of [[0, 1658], [0, 1674], [-7, 1692], [7, 1692], [0, 1706], [0, 1722], [-6, 1736], [6, 1736], [0, 1756], [0, 1770], [-8, 1790], [-8, 1812], [8, 1800]]) W.addLightSource(new THREE.Vector3(x, 3.6, z), { color: 0xffa868, intensity: 7, distance: 22, always: true });
  W.addLightSource(new THREE.Vector3(2, 1.2, 1803), { color: 0xff6a30, intensity: 6, distance: 20, always: true });

  drain.sync = (F) => {
    for (const p of drain.plates) {
      const ok = F['drain_valve_' + p.k] && F['drain_cool_' + p.k];
      p.mat.emissive.set(ok ? 0x4ab0ff : 0xff7a30);
      p.mat.emissiveIntensity = ok ? 1.4 : 0.5;
    }
    for (const l of drain.line) l.visible = !F.kharz_line_open;
    for (const c of drain.lineColliders) c.enabled = !F.kharz_line_open;
    for (const s of drain.shields) s.mesh.visible = !F['kharz_shield_' + s.k];
    for (const m of drain.growth) m.visible = !F.drain_blast;
    // the channel cools after the binding is cut
    drain.channelMat.emissive.set(F.drain_released ? 0x2a4a6a : 0xff4a10);
    drain.channelMat.emissiveIntensity = F.drain_released ? 0.5 : 0.9;
    drain.projection.visible = !!F.drain_projection;
  };
  drain.sync({});
}

export { DRAIN_ZONE };
