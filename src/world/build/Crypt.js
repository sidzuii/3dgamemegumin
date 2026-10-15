import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, lantern } from './Kit.js';
import { QuestProp, Door } from '../Interactables.js';
import { CRYPT_ZONE } from './Dungeon.js';

/**
 * The crypt under the temple of Eris (chapter 5, "Под храмом"): an interior built beyond the map edge like the old
 * mine (Dungeon.js). Stair hall -> upper hall (two hanging-lamp marks) -> water chamber (Roxy's volley opens the gallery
 * gate by three latches on the west wall, Megumin turns the winch on the gallery: the flood drains) -> central niche
 * (the pedestal for the three shards, the projection of Veyr) with the return lift.
 *
 * Story state lives in flags (crypt_gate_open, crypt_latch_0..2, crypt_drained, crypt_projection); `world.crypt.sync(flags)`
 * applies it to the scene (also after loading a save).
 */
const H = 6.5;
const T = 1.2;
const TINT = { wall: 0x8c8478, floor: 0x6a655c, ceil: 0x4a463f, trim: 0xa09886 };

export function buildCrypt(world) {
  const W = world;
  const rng = mulberry32(5150);
  // Rooms: [x0, x1, z0, z1, openings]
  hall(W, rng, -5, 5, 1240, 1254, [{ side: 'n', c: 0, w: 4 }], 5);
  passage(W, 0, 1254, 0, 1264, 4);
  hall(W, rng, -12, 12, 1264, 1296, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }]);
  passage(W, 0, 1296, 0, 1304, 4);
  hall(W, rng, -8, 8, 1304, 1336, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }], 7);
  passage(W, 0, 1336, 0, 1346, 4);
  hall(W, rng, -9, 9, 1346, 1372, [{ side: 's', c: 0, w: 4 }], 8);

  const crypt = { latchLights: [], projection: null };
  W.crypt = crypt;

  // ---- stair hall: arrival, the stairs up (the way back to the temple)
  W.spot('crypt_in', new THREE.Vector3(0, 0, 1244), 0);
  W.addInteractable(new Door({ id: 'crypt_exit', name: 'Лестница наверх', prompt: 'Подняться в храм', position: new THREE.Vector3(0, 0, 1240.9), target: 'crypt_door', shape: 'ladder' }));
  stairs(W, 0, 1241.4);
  for (const s of [-1, 1]) sconce(W, s * 4.4, 1250);

  // ---- upper hall: columns, sarcophagi, hanging-lamp marks
  for (const x of [-7, 7]) for (const z of [1270, 1280, 1290]) {
    const F = new Frame(W, x, 0, z, 0);
    F.cyl(0.55, H, 0, 0, 0, 'stone', { seg: 10, tint: TINT.trim });
    F.box(1.5, 0.3, 1.5, 0, 0, 0, 'stoneDark', { tint: TINT.trim });
    F.box(1.5, 0.3, 1.5, 0, H - 0.3, 0, 'stoneDark', { tint: TINT.trim });
  }
  for (const [x, z, r] of [[-10.2, 1272, 0], [-10.2, 1284, 0], [10.2, 1276, Math.PI], [10.2, 1288, Math.PI]]) sarcophagus(W, x, z, r);
  W.spot('crypt_mark_a', new THREE.Vector3(-9, 0, 1268), 0);
  W.spot('crypt_mark_b', new THREE.Vector3(0, 0, 1300.5), 0);
  W.addInteractable(new QuestProp({ id: 'crypt_lamp_a', name: 'Крюк для лампы', prompt: 'Повесить лампу', position: new THREE.Vector3(-9, 1.4, 1267.2), shape: 'none' }));
  W.addInteractable(new QuestProp({ id: 'crypt_lamp_b', name: 'Крюк для лампы', prompt: 'Повесить лампу', position: new THREE.Vector3(2.6, 1.4, 1300.5), shape: 'none' }));
  W.addLightSource(new THREE.Vector3(-9, 2.2, 1270), { color: 0x9ad0ff, intensity: 4, distance: 13, always: true });
  W.addLightSource(new THREE.Vector3(9, 2.2, 1290), { color: 0x9ad0ff, intensity: 4, distance: 13, always: true });

  // ---- water chamber
  const wc = new Frame(W, 0, 0, 1320, 0);
  // The flood: the north half of the chamber, a translucent slab with a line of invisible blockers across the middle.
  const mat = W.mats.water.clone();
  mat.transparent = true; mat.opacity = 0.78; mat.depthWrite = false;
  const flood = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 20), mat);
  flood.position.set(0, 0.2, 1326);
  W.addObject(flood);
  crypt.flood = flood;
  crypt.floodColliders = [];
  for (let x = -7.4; x <= 7.5; x += 1.4) {
    const c = { x, y: 0, z: 1316.4, r: 0.9, h: 2.4, enabled: true };
    W.dynamicColliders.push(c);
    crypt.floodColliders.push(c);
  }
  // Floor of the causeway under the water (visible once drained).
  wc.box(3.4, 0.12, 20, 0, 0, 6, 'stoneDark', { tint: TINT.trim, collide: false });
  // East gallery over the flood: a ramp from the floor, a walkway at 2.4 m to the winch.
  const ramp = new Frame(W, 6.5, 0, 1311.5, 0);
  ramp.box(3, 0.3, 6, 0, 1.1, 0, 'plank', { tint: 0x7a5c44, rx: 0.4, castShadow: false });
  W.box(3, 0.3, 24, 6.5, 2.3, 1324, 'plank', 0, { tint: 0x7a5c44 });
  for (const z of [1313, 1320, 1327, 1334]) W.box(0.3, 2.3, 0.3, 7.6, 0, z, 'log', 0, { collide: false, tint: 0x5a4028 });
  for (const s of [5.1, 7.9]) W.box(0.12, 1.0, 22, s, 2.6, 1325, 'log', 0, { collide: false, tint: 0x5a4028 });
  // The gallery gate (at the foot of the ramp): opened by the three latches.
  crypt.gate = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), W.mats.metal);
    bar.position.set(5.1 + i * 0.56, 1.3, 1308.6);
    crypt.gate.add(bar);
  }
  W.addObject(crypt.gate);
  crypt.gateColliders = [5.4, 6.5, 7.6].map((x) => {
    const c = { x, y: 0, z: 1308.6, r: 0.7, h: 2.6, enabled: true };
    W.dynamicColliders.push(c);
    return c;
  });
  // The winch at the north end of the gallery (turned with the staff).
  const wf = new Frame(W, 6.5, 2.45, 1334, 0);
  wf.box(1.4, 1.1, 0.5, 0, 0, 0, 'wood', { tint: 0x5a4028 });
  wf.cyl(0.25, 1.4, 0, 0.9, 0, 'log', { seg: 8, rz: Math.PI / 2, collide: false, tint: 0x5a4028 });
  W.addInteractable(new QuestProp({ id: 'crypt_winch', name: 'Лебёдка', prompt: 'Повернуть рукоять (посох Мегумин)', position: new THREE.Vector3(6.5, 3.3, 1333.4), shape: 'none' }));
  // The three latches on the west wall: glowing plates, out of reach — Roxy's volley opens them.
  [1312, 1320, 1328].forEach((z, i) => {
    const m = W.mats.rune.clone();
    m.emissiveIntensity = 0.15;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16).rotateZ(Math.PI / 2), m);
    plate.position.set(-7.55, 3.4, z);
    W.addObject(plate);
    crypt.latchLights.push(plate);
    W.addInteractable(new QuestProp({ id: 'crypt_latch_' + i, name: 'Защёлка', prompt: 'Защёлка. Сбей её издали (Water Volley)', position: new THREE.Vector3(-7.2, 3.4, z), shape: 'none' }));
    W.spot('crypt_latch_' + i, new THREE.Vector3(-7.4, 3.4, z), 0);
  });
  W.spot('crypt_water', new THREE.Vector3(0, 0, 1308), 0);
  W.spot('crypt_winch', new THREE.Vector3(6.5, 2.4, 1332), 0);
  W.addLightSource(new THREE.Vector3(0, 3.5, 1312), { color: 0x7fc8ff, intensity: 5, distance: 16, always: true });
  W.addLightSource(new THREE.Vector3(0, 3.5, 1328), { color: 0x7fc8ff, intensity: 5, distance: 16, always: true });

  // ---- central niche: the pedestal for the shards, the projection, the lift
  const nf = new Frame(W, 0, 0, 1358, 0);
  nf.cyl(2.2, 0.7, 0, 0, 0, 'stone', { seg: 14, tint: TINT.trim });
  nf.cyl(1.5, 0.35, 0, 0.7, 0, 'stoneDark', { seg: 14, tint: TINT.trim });
  const disc = (r, y, tint) => nf.cyl(r, 0.12, 0, y, 0, 'rune', { seg: 18, collide: false, castShadow: false, tint });
  disc(1.3, 1.05, 0xffffff); disc(0.85, 1.2, 0xbfe8ff);
  nf.sphere(0.32, 0, 1.75, 0, 'crystal', { collide: false, castShadow: false });
  W.spot('crypt_niche', new THREE.Vector3(0, 0, 1352), 0);
  W.addInteractable(new QuestProp({ id: 'crypt_pedestal', name: 'Постамент осколков', prompt: 'Осмотреть постамент', position: new THREE.Vector3(0, 1.4, 1358), shape: 'none' }));
  W.addLightSource(new THREE.Vector3(0, 3.2, 1358), { color: 0x8fd8ff, intensity: 9, distance: 18, always: true });
  W.addLightSource(new THREE.Vector3(-6, 2.4, 1352), { color: 0x6aa0ff, intensity: 3, distance: 10, always: true });
  // Veyr's projection: a flickering silhouette on the north wall (visible after the shard is lifted).
  crypt.projection = projectionFigure(W, 0, 1365.2);
  W.spot('crypt_projection', new THREE.Vector3(0, 0, 1364), Math.PI);
  W.addInteractable(new Door({ id: 'crypt_lift', name: 'Подъёмник', prompt: 'Подняться в храм', position: new THREE.Vector3(7, 0, 1368), target: 'crypt_door', shape: 'lift' }));

  // Dead keepers of the crypt: the old mine's skeletons guard the upper hall and the chamber's west strip.
  for (const [x, z] of [[-3, 1276], [4, 1284], [-5, 1292]]) W.camp('skeleton_minion', x, z, 'crypt');
  W.camp('skeleton_rogue', -5, 1310, 'crypt');
  W.camp('skeleton_warrior', 0, 1349, 'crypt');

  crypt.sync = (F) => {
    const gateOpen = !!F.crypt_gate_open;
    crypt.gate.visible = !gateOpen;
    for (const c of crypt.gateColliders) c.enabled = !gateOpen;
    const drained = !!F.crypt_drained;
    crypt.flood.visible = !drained;
    for (const c of crypt.floodColliders) c.enabled = !drained;
    crypt.latchLights.forEach((m, i) => { m.material.emissiveIntensity = F['crypt_latch_' + i] ? 1.6 : 0.15; });
    if (crypt.projection) crypt.projection.visible = !!F.crypt_projection;
  };
  crypt.sync({});
}

// -----------------------------------------------------------------------------------------
/** A stone hall with openings in its walls (like the mine's rooms, but built of stone blocks). */
function hall(W, rng, x0, x1, z0, z1, openings, h = H) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const F = new Frame(W, cx, 0, cz, 0);
  F.box(w + 2, 1, d + 2, 0, -1, 0, 'stoneDark', { tint: TINT.floor });
  F.box(w - 0.6, 0.06, d - 0.6, 0, 0, 0, 'stone', { collide: false, castShadow: false, tint: 0x9a9386 });
  F.box(w + 2, 1.2, d + 2, 0, h, 0, 'stoneDark', { tint: TINT.ceil });
  const walls = [
    { side: 's', fixed: z0 - T / 2, a: x0 - T, b: x1 + T, along: 'x' },
    { side: 'n', fixed: z1 + T / 2, a: x0 - T, b: x1 + T, along: 'x' },
    { side: 'w', fixed: x0 - T / 2, a: z0, b: z1, along: 'z' },
    { side: 'e', fixed: x1 + T / 2, a: z0, b: z1, along: 'z' },
  ];
  for (const wl of walls) {
    const gaps = openings.filter((o) => o.side === wl.side).map((o) => [o.c - o.w / 2, o.c + o.w / 2]);
    let start = wl.a;
    for (const [g0, g1] of [...gaps.sort((p, q) => p[0] - q[0]), [wl.b, wl.b]]) {
      if (g0 > start + 0.05) {
        const len = g0 - start, mid = (start + g0) / 2;
        if (wl.along === 'x') W.box(len, h + 1, T, mid, -0.5, wl.fixed, 'stone', 0, { tint: TINT.wall });
        else W.box(T, h + 1, len, wl.fixed, -0.5, mid, 'stone', 0, { tint: TINT.wall });
      }
      start = Math.max(start, g1);
      if (g1 > g0 && g0 < wl.b) {
        const mid = (g0 + g1) / 2, len = g1 - g0;
        if (wl.along === 'x') W.box(len, h - 4.2 + 0.2, T, mid, 4.2, wl.fixed, 'stone', 0, { tint: TINT.wall });
        else W.box(T, h - 4.2 + 0.2, len, wl.fixed, 4.2, mid, 'stone', 0, { tint: TINT.wall });
      }
    }
  }
  // A cornice along the walls.
  F.box(w, 0.3, 0.3, 0, h - 0.6, -d / 2 + 0.15, 'stoneDark', { collide: false, castShadow: false, tint: TINT.trim });
  F.box(w, 0.3, 0.3, 0, h - 0.6, d / 2 - 0.15, 'stoneDark', { collide: false, castShadow: false, tint: TINT.trim });
}

function passage(W, ax, az, bx, bz, width) {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(bx - ax, bz - az);
  const F = new Frame(W, (ax + bx) / 2, 0, (az + bz) / 2, rot);
  F.box(width + 2, 1, len, 0, -1, 0, 'stoneDark', { tint: TINT.floor });
  F.box(width + 2, 1.2, len, 0, 4.2, 0, 'stoneDark', { tint: TINT.ceil });
  for (const s of [-1, 1]) F.box(1.2, 5.2, len, s * (width / 2 + 0.6), -0.5, 0, 'stone', { tint: TINT.wall });
  for (let z = -len / 2 + 2; z < len / 2 - 1; z += 4) F.box(width, 0.35, 0.4, 0, 3.8, z, 'stoneDark', { collide: false, tint: TINT.trim });
  const lp = F.at(width / 2 - 0.35, 2.4, 0);
  lantern(W, new Frame(W, lp.x, lp.y, lp.z, rot));
}

function stairs(W, x, z) {
  const F = new Frame(W, x, 0, z, 0);
  for (let i = 0; i < 6; i++) F.box(3.2, 0.18, 0.55, 0, i * 0.18, -i * 0.55, 'stone', { collide: false, castShadow: false, tint: TINT.trim });
}

function sconce(W, x, z) {
  const F = new Frame(W, x, 0, z, 0);
  F.box(0.2, 2.4, 0.2, 0, 0, 0, 'stoneDark', { tint: TINT.trim });
  lantern(W, F.sub(0, 2.4, 0));
}

function sarcophagus(W, x, z, rot) {
  const F = new Frame(W, x, 0, z, rot);
  F.box(1.5, 0.7, 2.7, 0, 0, 0, 'stone', { tint: TINT.trim });
  F.box(1.7, 0.22, 2.9, 0, 0.7, 0, 'stoneDark', { tint: TINT.trim });
  F.box(0.5, 0.1, 1.6, 0, 0.92, 0, 'stone', { collide: false, tint: 0xb8b0a0 });
}

/** Veyr's projection: a ghostly worker in a long coat, blue and flickering (toggled by `crypt.sync`). */
function projectionFigure(W, x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.2, 10).translate(0, 0.9, 0), mat);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.5, 10).translate(0, 1.75, 0), mat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 2.25, 0), mat);
  const arms = [-1, 1].map((s) => new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6).rotateZ(s * 0.3).translate(s * 0.42, 1.55, 0), mat));
  g.add(body, chest, head, ...arms);
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI;
  g.visible = false;
  g.userData.flicker = (t) => { mat.opacity = 0.32 + Math.sin(t * 17) * 0.06 + (Math.sin(t * 3.3) > 0.92 ? -0.25 : 0); };
  W.addObject(g);
  W.addUpdatable({ update: (dt) => { g.userData.flicker((performance.now() / 1000) % 1000); } });
  return g;
}

export { CRYPT_ZONE };
