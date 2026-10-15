import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, house, lamp, barrel, crate, wagon, bench, prop, rock } from './Kit.js';
import { campfire, tent } from './Countryside.js';
import { Door } from '../Interactables.js';
import { REGION } from '../MapData.js';
import * as AIN from '../AinstreyPlan.js';

/**
 * The Ainstrey sheet outside the walls (docs/ainstrey): the two gates of the east pass (the scene change between the old
 * map and the sheet), the Postal ascent, the chalk-slope viewpoint, the White mills, the south dam. The Stone Ledge (the
 * rockfall quest) is build/AinstreyLedge.js, the city is build/AinstreyCity.js. Positions: AinstreyPlan.js (local u, v).
 */
const w = (u, v) => AIN.toWorld(u, v);

export function buildAinstrey(W) {
  const rng = mulberry32(4242);
  for (const [name, [u, v, yaw]] of Object.entries(AIN.SPOTS_LOCAL)) {
    const [x, z] = w(u, v);
    W.spot(name, new THREE.Vector3(x, W.heightAt(x, z), z), yaw);
  }
  AIN.SIGNS_LOCAL.forEach((s, i) => {
    const [x, z] = w(s.u, s.v);
    W.group('ain_sign_' + i, { x, z, rot: s.rot }, () => W.addSign(new THREE.Vector3(x, 0, z), s.rot, s.lines), 'Указатель на тракте: ' + s.lines[0].slice(0, 30));
  });
  oldSideGate(W, rng);
  W.group('ain_pass_gate', { x: w(-1604, 2338)[0], z: w(-1604, 2338)[1], rot: 2.0 }, (r) => sheetSideGate(W, r), 'Перевальные ворота (сторона тракта)');
  W.group('ain_postal', { x: w(-1548, 2300)[0], z: w(-1548, 2300)[1] }, (r) => postalAscent(W, r), 'Почтовый подъём');
  W.group('ain_chalk_view', { x: w(-974, 1789)[0], z: w(-974, 1789)[1], rot: 2.3 }, (r) => chalkView(W, r), 'Смотровая площадка Меловых склонов');
  W.group('ain_mills', { x: w(-470, 1500)[0], z: w(-470, 1500)[1] }, (r) => whiteMills(W, r), 'Белые мельницы');
  W.group('ain_dam', { x: w(AIN.DAM.u, (AIN.DAM.v0 + AIN.DAM.v1) / 2)[0], z: w(AIN.DAM.u, (AIN.DAM.v0 + AIN.DAM.v1) / 2)[1] }, () => southDam(W), 'Южная дамба');
}

const H = (W, x, z) => W.heightAt(x, z);

// -----------------------------------------------------------------------------------------------------------------
// The pass gates
// -----------------------------------------------------------------------------------------------------------------
/** Portal with a door leaf; the front faces local +z of the frame. */
function portal(F, { width = 4.4, height = 5.2, depth = 2.4, tint = 0x8a94a0 } = {}) {
  const hw = width / 2;
  for (const s of [-1, 1]) {
    F.box(1.3, height, depth, s * (hw + 0.65), 0, 0, 'stoneDark', { tint });
    F.box(1.6, 0.4, depth + 0.4, s * (hw + 0.65), height, 0, 'stone', { tint: 0x9aa4b0 });
  }
  F.box(width + 3.2, 1.2, depth, 0, height, 0, 'stoneDark', { tint });
  F.box(width + 3.6, 0.35, depth + 0.5, 0, height + 1.2, 0, 'stone', { tint: 0x9aa4b0 });
  // The leaf: two plank halves in an iron frame, recessed into the rock.
  F.box(width, height - 0.2, 0.3, 0, 0, -depth / 2 + 0.2, 'door', { tint: 0x5a3c28 });
  for (const y of [0.9, height - 1.2]) F.box(width + 0.1, 0.18, 0.12, 0, y, -depth / 2 + 0.42, 'metal', { collide: false });
  F.box(0.12, height - 0.4, 0.12, 0, 0.1, -depth / 2 + 0.44, 'metal', { collide: false });
}

/** The old map: the stone portal in the south slope of the pass corridor, 12 m from the relay gate. */
function oldSideGate(W) {
  const x = 822, z = -181.2, y = H(W, x, z - 1.5);
  W.group('ain_pass_gate_old', { x, z, rot: Math.PI }, () => {
    const F = new Frame(W, x, y - 0.3, z, Math.PI);
    portal(F);
    // the rock around it
    for (const [dx, dz, s] of [[-4.2, -1.6, 2.4], [4.4, -1.8, 2.6], [-2.2, -3.2, 3.1], [2.6, -3.4, 3.0], [0, -3.8, 3.4]]) {
      const p = F.at(dx, 0, dz);
      rock(W, p.x, p.z, s, mulberry32(Math.round(p.x * 7)), 'rock');
    }
    W.spot('pass_trakt_out', new THREE.Vector3(x, H(W, x, z - 4.2), z - 4.2), Math.PI);
    W.addInteractable(new Door({ id: 'ain_pass_door_old', name: 'Ворота Почтового подъёма', prompt: 'Пройти перевальным ходом на столичный тракт', position: new THREE.Vector3(x, y, z - 0.2), target: 'ain_pass_arrival', rotY: Math.PI }));
  }, 'Ворота на столичный тракт (перевал)');
  W.addSign(new THREE.Vector3(x - 7, 0, z + 5), -Math.PI / 2, ['Ворота Почтового подъёма: столичный тракт (Каменный уступ · Айнстрей)', 'Восточный пост Астрариума: ворота в конце ущелья']);
}

/** The sheet: the gatehouse at the west end of the Postal ascent (the way back to the pass). */
function sheetSideGate(W) {
  const [x, z] = w(-1604, 2338), y = H(W, x, z);
  const F = new Frame(W, x, y - 0.1, z, 2.0);
  portal(F, { tint: 0xa8a090 });
  // a gatehouse around the portal: a wall to each side and a heap of rock behind it
  for (const s of [-1, 1]) {
    F.box(5.0, 3.4, 2.4, s * 5.6, 0, 0, 'stoneDark', { tint: 0x9a9484 });
    F.box(5.2, 0.35, 2.7, s * 5.6, 3.4, 0, 'stone', { tint: 0xb0a890 });
  }
  for (const [dx, dz, s] of [[-7.5, -2.5, 3.2], [7.4, -2.3, 3.0], [-3.5, -4.2, 3.6], [3.4, -4.4, 3.8], [0, -5.2, 4.2], [-10.5, -2.4, 2.6], [10.6, -2.2, 2.7]]) {
    const p = F.at(dx, 0, dz);
    rock(W, p.x, p.z, s, mulberry32(Math.round(p.z * 3)), 'rock');
  }
  const out = F.at(0, 0, 4.0);
  W.spot('ain_gate_out', new THREE.Vector3(out.x, H(W, out.x, out.z), out.z), 2.0);
  W.addInteractable(new Door({ id: 'ain_pass_door', name: 'Перевальные ворота', prompt: 'Пройти перевальным ходом назад, к Ольховке', position: F.at(0, 0, 0.2), target: 'pass_trakt_out', rotY: 2.0 }));
  lamp(W, F.at(-3.6, 0, 3.6), 0);
  lamp(W, F.at(3.6, 0, 3.6), 0);
}

// -----------------------------------------------------------------------------------------------------------------
// Postal ascent
// -----------------------------------------------------------------------------------------------------------------
function postalAscent(W, rng) {
  const c = AIN.SPOTS_LOCAL.postal_camp, [cx, cz] = w(c[0], c[1]);
  campfire(W, cx, cz);
  tent(W, cx - 7, cz - 5, 0.5, 0x7b5a3a);
  tent(W, cx + 8, cz - 6, -0.4, 0x5b6a3a);
  tent(W, cx + 9, cz + 5, 2.2, 0x7b5a3a);
  for (const [dx, dz, r] of [[-2.6, 1.8, 0.6], [2.6, 2.0, -0.5], [0.2, -2.8, 0.1]]) {
    prop(new Frame(W, cx + dx, H(W, cx + dx, cz + dz) - 0.05, cz + dz, r), 'nature/log_large', 0, 0, 0, { s: 3, ry: Math.PI / 2 + r, collide: false });
  }
  wagon(W, cx - 12, cz + 8, 0.5);
  // The place of the road crews: stacked planks, a crate yard, barrels, a rope drum; everything stands off the road.
  const stock = new Frame(W, cx - 6, H(W, cx - 6, cz + 14), cz + 14, 0.2);
  crate(W, stock, 0, 0, 0.9, 0.1); crate(W, stock, 1.1, 0.2, 0.9, 0.4); crate(W, stock, 0.5, 0, 0.9, 0.7);
  barrel(W, stock, -1.4, 0.4); barrel(W, stock, -2.2, -0.1);
  prop(new Frame(W, cx - 9, H(W, cx - 9, cz + 14), cz + 14, 1.0), 'nature/log_stackLarge', 0, 0, 0, { s: 3 });
  prop(new Frame(W, cx + 4, H(W, cx + 4, cz + 15), cz + 15, 0.3), 'survival/workbench', 0, 0, 0, { s: 2.6 });
  for (const [dx, dz] of [[-12, -7], [12, -9]]) lamp(W, new THREE.Vector3(cx + dx, H(W, cx + dx, cz + dz), cz + dz), 0);
}

// -----------------------------------------------------------------------------------------------------------------
// Chalk slopes: the viewpoint
// -----------------------------------------------------------------------------------------------------------------
function chalkView(W) {
  const [x, z] = w(...AIN.SPOTS_LOCAL.chalk_view.slice(0, 2));
  const y = H(W, x, z);
  const F = new Frame(W, x, y, z, 2.3);
  // A low stone terrace facing the city (the front is +z = along the yaw of the viewpoint).
  F.box(9, 0.35, 5.5, 0, -0.2, 0.6, 'stone', { tint: 0xc6bfaa });
  for (const s of [-1, 1]) F.box(0.35, 0.9, 5.2, s * 4.4, 0.15, 0.6, 'stoneDark', { tint: 0xb4ac96 });
  F.box(8.4, 0.9, 0.35, 0, 0.15, 3.2, 'stoneDark', { tint: 0xb4ac96 });
  bench(W, F, -1.6, 2.2, 0);
  bench(W, F, 1.6, 2.2, 0);
  // a brass viewer on a post and a board with the silhouette names
  F.cyl(0.08, 1.3, 0, 0.1, 2.4, 'metal', { seg: 8, collide: false });
  F.box(0.12, 0.12, 0.7, 0, 1.4, 2.3, 'metal', { collide: false });
}

// -----------------------------------------------------------------------------------------------------------------
// White mills
// -----------------------------------------------------------------------------------------------------------------
class WaterWheel {
  constructor(W, x, y, z, rot, r = 2.4, width = 1.6) {
    this.g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 });
    this.wheel = new THREE.Group();
    this.wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, width + 0.9, 8).rotateZ(Math.PI / 2), dark));
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, r * 2), wood);
        spoke.position.x = s * (width / 2 - 0.1);
        spoke.rotation.x = (i / 6) * Math.PI;
        this.wheel.add(spoke);
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.6), wood);
      board.position.set(0, Math.sin(a) * r, Math.cos(a) * r);
      board.rotation.x = -a;
      this.wheel.add(board);
    }
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 5, 24).rotateY(Math.PI / 2), dark);
      rim.position.x = s * (width / 2);
      this.wheel.add(rim);
    }
    this.g.add(this.wheel);
    this.g.position.set(x, y, z);
    this.g.rotation.y = rot;
    this.g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.speed = 0.55;
    W.addObject(this.g);
    W.addUpdatable(this);
  }

  update(dt) {
    this.wheel.rotation.x -= dt * this.speed;
  }
}

function whiteMills(W, rng) {
  const arm = AIN.MILL_ARM.points;
  // position along the arm south bank (the arm runs west -> east-north-east here)
  const at = (t) => {
    const n = arm.length - 1;
    const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    return [arm[i][0] + (arm[i + 1][0] - arm[i][0]) * k, arm[i][1] + (arm[i + 1][1] - arm[i][1]) * k, arm[i + 1][0] - arm[i][0], arm[i + 1][1] - arm[i][1]];
  };
  const sites = [0.255, 0.30, 0.345, 0.395];
  sites.forEach((t, i) => {
    const [ax, az, dx, dz] = at(t);
    const L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L; // normal pointing to the south bank (+z side)
    const sgn = nz > 0 ? 1 : -1;
    const off = 10.6;
    const mx = ax + nx * sgn * off, mz = az + nz * sgn * off;
    const rot = Math.atan2(-nx * sgn, -nz * sgn) + Math.PI; // front faces away from the water
    const my = H(W, mx, mz);
    W.group('ain_mill_' + i, { x: mx, z: mz, rot }, () => {
      const hs = house(W, { x: mx, z: mz, rot, w: i % 2 ? 7 : 8, d: 6, floors: i === 1 ? 3 : 2, roofTint: i % 2 ? 0x9c9ea8 : 0xc09474, chimney: false, kind: 'mill' }, rng);
      new WaterWheel(W, ...(() => { const p = hs.frame.at(0, 1.9, -(3 + 1.2)); return [p.x, p.y, p.z]; })(), rot, 2.4, 1.5);
      const F = new Frame(W, mx, my, mz, rot);
      // sacks of flour under the awning, a handcart, barrels
      crate(W, F, 5.3, 1.6, 0.9, 0.2); crate(W, F, 5.9, 1.0, 0.9, 0.5);
      barrel(W, F, -5.1, 1.2); barrel(W, F, -5.6, 2.0);
      F.box(2.2, 0.08, 1.2, 0, 2.5, 5.2, 'cloth', { collide: false, tint: 0xe0d6bc, rx: -0.2 });
      for (const s of [-1, 1]) F.box(0.1, 2.5, 0.1, s * 1.0, 0, 5.8, 'log', { collide: false });
      if (i === 1) W.spot('mill_door', hs.door, rot);
    }, 'Мельница ' + (i + 1));
  });
  // A few cottages of the mill workers by the road (no smoke from the wheel: only from the chimneys).
  [[-380, 1530, 0.4], [-330, 1500, 0.2], [-600, 1600, 0.6]].forEach(([u, v, r], i) => {
    const [x, z] = w(u, v);
    W.group('ain_mill_cottage_' + i, { x, z, rot: r }, () => house(W, { x, z, rot: r, w: 6, d: 5, floors: 1, roofTint: 0xc09474, chimney: true, kind: 'cottage' }, rng), 'Дом мельника');
  });
}

// -----------------------------------------------------------------------------------------------------------------
// The south dam: a stone causeway with sluices across the mill arm, a water gauge, the guard post
// -----------------------------------------------------------------------------------------------------------------
function southDam(W) {
  const D = AIN.DAM;
  const [x, z] = w(D.u, (D.v0 + D.v1) / 2);
  const armV = 1296;
  const bed = -2.4;
  const F = new Frame(W, x, bed, z, 0);
  const cz = armV - (D.v0 + D.v1) / 2; // the arm's centre relative to the dam's centre
  const top = D.top, deckT = 0.9;
  // deck slab over the channel and two retaining abutments to the road level
  F.box(D.width, deckT, 25, 0, top - deckT - bed, cz, 'stone', { tint: 0xc6bfaa });
  // piers: culverts of 3.6 m between them (the water passes through)
  for (let k = -2; k <= 2; k++) F.box(D.width - 0.6, top - deckT - bed, 1.6, 0, 0, cz + k * 5.2, 'stoneDark', { tint: 0xb4ac96 });
  for (const s of [-1, 1]) {
    // parapet along both edges
    F.box(0.4, 0.95, 25, s * (D.width / 2 - 0.2), top - bed, cz, 'stoneDark', { tint: 0xb4ac96 });
    for (let k = -3; k <= 3; k++) F.box(0.6, 1.25, 0.6, s * (D.width / 2 - 0.2), top - bed, cz + k * 4.2, 'stone', { tint: 0xc6bfaa });
  }
  // wooden sluice gates on the upstream (west) side: frame, winch and the half-lowered boards
  for (let k = -2; k < 2; k++) {
    const gz = cz + k * 5.2 + 2.6;
    for (const s of [-1, 1]) F.box(0.25, 3.0, 0.25, -D.width / 2 - 0.4, top - bed, gz + s * 1.4, 'log', { collide: false });
    F.box(0.3, 0.3, 3.2, -D.width / 2 - 0.4, top - bed + 3.0, gz, 'log', { collide: false });
    F.cyl(0.18, 0.7, -D.width / 2 - 0.4, top - bed + 3.2, gz, 'metal', { seg: 8, collide: false, rx: Math.PI / 2 });
    F.box(0.12, 1.0, 3.2, -D.width / 2 - 0.1, top - bed - deckT - 0.3, gz, 'plank', { collide: false, tint: 0x6a4a30 });
  }
  // water gauge (the old and the new mark) on the east pier face
  const g = new Frame(W, x + D.width / 2 + 0.35, bed + 0.2, z + cz + 2.6, 0);
  g.box(0.14, 3.4, 0.5, 0, 0, 0, 'plank', { collide: false, tint: 0xe8e0c8 });
  for (let i = 0; i < 8; i++) g.box(0.16, 0.12, 0.52, 0, 0.3 + i * 0.4, 0, i % 2 ? 'metal' : 'plank', { collide: false, tint: i % 2 ? 0x3a3a3a : 0xc03a2a });
  W.spot('dam_gauge_post', new THREE.Vector3(x + D.width / 2 + 1.6, H(W, x, z + cz + 2.6) + 1.8, z + cz + 2.6), -Math.PI / 2);
  // guard post at the north end of the causeway
  const hx = x - 10, hz = z - 22;
  house(W, { x: hx, z: hz, rot: Math.PI / 2, w: 6, d: 5, floors: 1, roofTint: 0x9c9ea8, chimney: true, kind: 'post', style: 'brick' }, mulberry32(99));
  lamp(W, new THREE.Vector3(x - 3.2, top, z + cz - 12.6), 0);
  lamp(W, new THREE.Vector3(x + 3.2, top, z + cz + 12.6), 0);
}
