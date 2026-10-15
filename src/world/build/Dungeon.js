import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, lantern, crate, barrel, GEOMETRY } from './Kit.js';
import { QuestProp, Door } from '../Interactables.js';

/**
 * "Старая шахта" — the first dungeon. Built off the terrain (z ≈ 1100..1200, beyond the map edge at 850) as an enclosed
 * cave; the mine entrance in the hills north-west of Axel teleports the player here.
 *
 *  A  entry hall (way out)            → tunnel →
 *  B  mushroom cavern (fight, ore)    → side tunnel → C miner's rest (journal, chest, ore)
 *  B  → tunnel blocked by a cave-in (only an Explosion clears it) →
 *  D  crystal chamber (guardian, the second star shard, chest, mine lift back to the surface)
 */
/** The crypt under the temple of Eris (build/Crypt.js) is a second interior beyond the map edge. */
export const CRYPT_ZONE = { minX: -40, maxX: 40, minZ: 1226, maxZ: 1390 };
/** The relay post beyond the eastern ridge (build/Relay.js, chapter 6) — the third interior beyond the map edge. */
export const RELAY_ZONE = { minX: -45, maxX: 45, minZ: 1406, maxZ: 1610 };
/** The outer drain channel under the Crimson Gorge (build/Drain.js, chapter 7). */
export const DRAIN_ZONE = { minX: -45, maxX: 45, minZ: 1636, maxZ: 1850 };
/** The pump station and the deep shaft under Axel (build/Pump.js, chapter 8). */
export const PUMP_ZONE = { minX: -45, maxX: 45, minZ: 1876, maxZ: 2300 }; // also the service galleries and the central hall (build/Core.js)
const ZONES = [CRYPT_ZONE, RELAY_ZONE, DRAIN_ZONE, PUMP_ZONE];

export const DUNGEON = {
  minX: -50, maxX: 50, minZ: 1090, maxZ: 1210,
  floor: 0,
  contains(x, z) {
    return (x > this.minX && x < this.maxX && z > this.minZ && z < this.maxZ)
      || ZONES.some((q) => x > q.minX && x < q.maxX && z > q.minZ && z < q.maxZ);
  },
};

const CEIL = 6.5;
const TUNNEL_H = 4.2;

export function buildDungeon(world) {
  const W = world;
  const rng = mulberry32(31337);
  // Rooms: [x0, x1, z0, z1, openings]
  room(W, rng, -7, 7, 1098, 1112, [{ side: 'n', c: 0, w: 4 }]);
  tunnel(W, rng, 0, 1112, 0, 1128, 4);
  room(W, rng, -12, 12, 1128, 1152, [{ side: 's', c: 0, w: 4 }, { side: 'n', c: 0, w: 4 }, { side: 'e', c: 1140, w: 4 }]);
  tunnel(W, rng, 12, 1140, 26, 1140, 4);
  room(W, rng, 26, 40, 1132, 1148, [{ side: 'w', c: 1140, w: 4 }], 5);
  tunnel(W, rng, 0, 1152, 0, 1172, 4);
  room(W, rng, -13, 13, 1172, 1198, [{ side: 's', c: 0, w: 4 }], 8);

  // A — entry hall.
  W.spot('dungeon_entry', new THREE.Vector3(0, 0, 1103), 0);
  W.addInteractable(new Door({ id: 'dungeon_exit', name: 'Выход', prompt: 'Подняться наверх', position: new THREE.Vector3(0, 0, 1099.4), target: 'cave_mouth', shape: 'ladder' }));
  for (const s of [-1, 1]) lanternPost(W, s * 5.5, 1105);
  crate(W, new Frame(W, -5, 0, 1109, 0), 0, 0, 0.9, 0.3);
  barrel(W, new Frame(W, 5.4, 0, 1110, 0), 0, 0);

  // B — mushroom cavern: glowing mushrooms, ore veins, enemies.
  for (let i = 0; i < 18; i++) {
    const x = -10 + rng() * 20, z = 1130 + rng() * 20;
    if (Math.abs(x) < 3 && (z < 1133 || z > 1148)) continue;
    glowShroom(W, x, z, 0.4 + rng() * 0.9, rng);
  }
  W.addLightSource(new THREE.Vector3(-6, 1.5, 1138), { color: 0x60ffd0, intensity: 5, distance: 12, always: true });
  W.addLightSource(new THREE.Vector3(6, 1.5, 1146), { color: 0x60ffd0, intensity: 5, distance: 12, always: true });
  W.spot('ore_d0', new THREE.Vector3(-11, 0, 1134), Math.PI / 2);
  W.spot('ore_d1', new THREE.Vector3(11, 0, 1148), -Math.PI / 2);
  for (const [x, z] of [[-5, 1142], [4, 1136], [6, 1147]]) W.camp('mushroom', x, z, 'dungeon');

  // C — miner's rest: bedroll, remains, journal, chest.
  const C = new Frame(W, 33, 0, 1140, 0);
  C.box(1.8, 0.12, 0.9, 3.5, 0, -4, 'cloth', { collide: false, tint: 0x7b5a3a });
  C.sphere(0.2, 3.2, 0.25, -4.2, 'bone', { collide: false });
  C.box(0.9, 0.12, 0.3, 3.6, 0.1, -3.8, 'bone', { collide: false, ry: 0.4 });
  lanternPost(W, 28, 1145);
  W.addInteractable(new QuestProp({ id: 'miner_journal', name: 'Дневник шахтёра', prompt: 'Прочитать', position: C.at(2.4, 0.4, -3.4), shape: 'book' }));
  W.addChest(new THREE.Vector3(37.5, 0, 1146), Math.PI, 'dungeon_side');
  // A miner's rest: the unquiet dead (KayKit skeletons) guard the chest.
  for (const [x, z] of [[30, 1143], [34, 1135]]) W.camp('skeleton_minion', x, z, 'dungeon');
  W.camp('skeleton_rogue', 37, 1139, 'dungeon');
  W.spot('ore_d2', new THREE.Vector3(39, 0, 1134), -Math.PI / 2);
  W.spot('ore_d3', new THREE.Vector3(30, 0, 1133), 0);

  // Cave-in in the north tunnel.
  W.rubble = new Rubble(W, new THREE.Vector3(0, 0, 1161), rng);
  W.addInteractable(new QuestProp({ id: 'cave_in', name: 'Завал', prompt: 'Осмотреть', position: new THREE.Vector3(0, 1.2, 1158.6), shape: 'none' }));

  // D — crystal chamber.
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2, r = 6 + rng() * 5.5;
    const x = Math.cos(a) * r, z = 1185 + Math.sin(a) * r * 0.9;
    const s = 0.5 + rng() * 1.3;
    new Frame(W, x, 0, z, rng() * 6).put(new THREE.OctahedronGeometry(1, 0), s * 0.4, s, s * 0.4, 0, s * 0.4, 0, 'crystal', { castShadow: false, collide: false, rx: (rng() - 0.5) * 0.7, rz: (rng() - 0.5) * 0.7 });
  }
  const P = new Frame(W, 0, 0, 1188, 0);
  P.cyl(1.4, 0.9, 0, 0, 0, 'stone', { seg: 10, tint: 0xa8a4b8 });
  P.cyl(0.9, 0.3, 0, 0.9, 0, 'stoneDark', { seg: 10 });
  W.addLightSource(new THREE.Vector3(0, 2.4, 1188), { color: 0x8fd8ff, intensity: 9, distance: 18, always: true });
  W.addLightSource(new THREE.Vector3(-8, 2, 1180), { color: 0x8fd8ff, intensity: 4, distance: 10, always: true });
  W.addInteractable(new QuestProp({ id: 'deep_shard', name: 'Звёздный осколок', prompt: 'Взять', position: new THREE.Vector3(0, 1.6, 1188), shape: 'shard' }));
  W.addChest(new THREE.Vector3(-9, 0, 1194), 0.5, 'dungeon_final');
  W.camp('guardian', 0, 1183, 'dungeon_boss');
  W.addInteractable(new Door({ id: 'mine_lift', name: 'Подъёмник', prompt: 'Подняться на поверхность', position: new THREE.Vector3(10.5, 0, 1195), target: 'cave_mouth', shape: 'lift' }));
  lanternPost(W, 9, 1191);
  W.spot('dungeon_deep', new THREE.Vector3(0, 0, 1176), 0);
}

// -----------------------------------------------------------------------------------------
function room(W, rng, x0, x1, z0, z1, openings, h = CEIL) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const F = new Frame(W, cx, 0, cz, 0);
  F.box(w + 2, 1, d + 2, 0, -1, 0, 'rockDark', { tint: 0x6a6460 });
  F.box(w + 2, 1.2, d + 2, 0, h, 0, 'rockDark', { tint: 0x4a4440 });
  const T = 1.2;
  const walls = [
    { side: 's', fixed: z0 - T / 2, a: x0 - T, b: x1 + T, along: 'x' },
    { side: 'n', fixed: z1 + T / 2, a: x0 - T, b: x1 + T, along: 'x' },
    { side: 'w', fixed: x0 - T / 2, a: z0, b: z1, along: 'z' },
    { side: 'e', fixed: x1 + T / 2, a: z0, b: z1, along: 'z' },
  ];
  for (const wl of walls) {
    const gaps = openings.filter((o) => o.side === wl.side).map((o) => [o.c - o.w / 2, o.c + o.w / 2]);
    let start = wl.a;
    const cuts = [...gaps.sort((p, q) => p[0] - q[0]), [wl.b, wl.b]];
    for (const [g0, g1] of cuts) {
      if (g0 > start + 0.05) {
        const len = g0 - start, mid = (start + g0) / 2;
        if (wl.along === 'x') W.box(len, h + 1, T, mid, -0.5, wl.fixed, 'rock', 0, { tint: 0x7a726a });
        else W.box(T, h + 1, len, wl.fixed, -0.5, mid, 'rock', 0, { tint: 0x7a726a });
      }
      start = Math.max(start, g1);
      // Lintel over the opening.
      if (g1 > g0 && g0 < wl.b) {
        const mid = (g0 + g1) / 2, len = g1 - g0;
        if (wl.along === 'x') W.box(len, h - TUNNEL_H + 0.2, T, mid, TUNNEL_H, wl.fixed, 'rock', 0, { tint: 0x7a726a });
        else W.box(T, h - TUNNEL_H + 0.2, len, wl.fixed, TUNNEL_H, mid, 'rock', 0, { tint: 0x7a726a });
      }
    }
  }
  // Rocky dressing along the walls and stalactites.
  const n = Math.round((w + d) * 0.7);
  for (let i = 0; i < n; i++) {
    const t = rng();
    let x, z;
    const side = Math.floor(rng() * 4);
    if (side === 0) { x = x0 + t * w; z = z0 + 0.4; }
    else if (side === 1) { x = x0 + t * w; z = z1 - 0.4; }
    else if (side === 2) { x = x0 + 0.4; z = z0 + t * d; }
    else { x = x1 - 0.4; z = z0 + t * d; }
    if (openings.some((o) => (o.side === 'n' && side === 1 || o.side === 's' && side === 0) && Math.abs(x - o.c) < o.w / 2 + 1)) continue;
    if (openings.some((o) => (o.side === 'e' && side === 3 || o.side === 'w' && side === 2) && Math.abs(z - o.c) < o.w / 2 + 1)) continue;
    const s = 0.6 + rng() * 1.4;
    new Frame(W, x, 0, z, rng() * 6).put(GEOMETRY.dodeca, s, s * (0.8 + rng()), s, 0, -0.2, 0, 'rock', { collide: false, tint: 0x8a827a });
  }
  for (let i = 0; i < Math.round(w * d * 0.04); i++) {
    const x = x0 + 1 + rng() * (w - 2), z = z0 + 1 + rng() * (d - 2);
    const s = 0.25 + rng() * 0.4;
    new Frame(W, x, h, z, 0).put(GEOMETRY.cone8, s, -s * 4, s, 0, 0, 0, 'rockDark', { collide: false, castShadow: false, tint: 0x6a6460 });
  }
}

function tunnel(W, rng, ax, az, bx, bz, width) {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(bx - ax, bz - az);
  const F = new Frame(W, (ax + bx) / 2, 0, (az + bz) / 2, rot);
  F.box(width + 2, 1, len, 0, -1, 0, 'rockDark', { tint: 0x6a6460 });
  F.box(width + 2, 1.2, len, 0, TUNNEL_H, 0, 'rockDark', { tint: 0x4a4440 });
  for (const s of [-1, 1]) F.box(1.2, TUNNEL_H + 1, len, s * (width / 2 + 0.6), -0.5, 0, 'rock', { tint: 0x7a726a });
  // Timber supports + rails.
  for (let z = -len / 2 + 2; z < len / 2 - 1; z += 4) {
    for (const s of [-1, 1]) F.box(0.25, TUNNEL_H, 0.25, s * (width / 2 - 0.15), 0, z, 'log', { collide: false, tint: 0x6a4a30 });
    F.box(width, 0.3, 0.3, 0, TUNNEL_H - 0.3, z, 'log', { collide: false, tint: 0x6a4a30 });
  }
  for (const s of [-0.5, 0.5]) F.box(0.08, 0.08, len, s, 0.0, 0, 'metal', { collide: false, castShadow: false });
  const lp = F.at(width / 2 - 0.35, 2.4, 0);
  lantern(W, new Frame(W, lp.x, lp.y, lp.z, rot));
}

function lanternPost(W, x, z) {
  const F = new Frame(W, x, 0, z, 0);
  F.box(0.15, 2.2, 0.15, 0, 0, 0, 'log', { collide: false });
  lantern(W, F.sub(0, 2.2, 0));
}

function glowShroom(W, x, z, s, rng) {
  const F = new Frame(W, x, 0, z, rng() * 6);
  F.cyl(0.08 * s, 0.6 * s, 0, 0, 0, 'bone', { seg: 6, collide: false });
  F.sphere(0.35 * s, 0, 0.6 * s, 0, 'rune', { collide: false, castShadow: false, sy: 0.45, tint: rng() < 0.5 ? 0x80ffd0 : 0x90b0ff });
}

/**
 * Cave-in blocking the north tunnel. Solid via dynamic cylinder colliders; only an Explosion
 * (blast force >= 12) clears it. Registered with the world's "dummies" so both the
 * Explosion and staff hits reach it.
 */
export class Rubble {
  constructor(W, pos, rng) {
    this.world = W;
    this.pos = pos.clone();
    this.cleared = false;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a726a, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const s = 0.5 + rng() * 0.9;
      const m = new THREE.Mesh(GEOMETRY.dodeca, mat);
      m.scale.set(s, s * 0.8, s);
      m.position.set((rng() - 0.5) * 3.6, s * 0.5 + rng() * 1.8 * (1 - Math.abs(i % 4 - 1.5) / 2), (rng() - 0.5) * 1.6);
      m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      m.castShadow = m.receiveShadow = true;
      this.root.add(m);
    }
    W.scene.add(this.root);
    this.colliders = [-1.5, 0, 1.5].map((dx) => ({ x: pos.x + dx, y: pos.y, z: pos.z, r: 0.9, h: 3.4, enabled: true }));
    for (const c of this.colliders) W.dynamicColliders.push(c);
    W.dummies.push(this);
  }

  /** Called with the saved state on load. */
  setCleared(v) {
    this.cleared = v;
    this.root.visible = !v;
    for (const c of this.colliders) c.enabled = !v;
  }

  blast(center, radius, force) {
    if (this.cleared || force < 12) return;
    if (Math.hypot(center.x - this.pos.x, center.z - this.pos.z) > radius + 4) return;
    this.setCleared(true);
    this.onCleared?.();
  }

  update() {}
}
