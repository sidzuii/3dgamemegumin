import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { QuestProp } from '../Interactables.js';
import { keyBuilding } from './AinstreyBuildings.js';
import { lamp } from './Kit.js';

/**
 * The pump hall of the port (chapter 7 of version 2.0, D20-D24): a tall hall on a stone podium at the quay, two levels:
 *   the hall floor (the lower pump zone): two pumps, the left pipe (leaks, pressure above the white line), the right pipe (blue mark,
 *   shut by Mirena), the side coupling with the white mark (the one target of the Explosion), the jack and the side lever, the latch,
 *   the manual post with the lower gate, the pit with a ramp (it takes the service guards);
 *   the upper gantry (the upper walkway) along the back wall, reached by the stair on the left wall, with the power panel at its end.
 * Outside: the ramp up to the doorway and the yard where the workers are brought out (green arrows).
 * State (flags and vars, `world.port.sync(flags, vars)`): the workers walk out when the gangway is set, the latch, the leak jet,
 * the needles of both gauges, the panel lamp, the dormant guards, the coupling (apart after the blast or after the lever), the gate wheel.
 * Props and behaviour: data/story/props.js (port_*); quest: data/quests_capital.js (ainstrey_city); text: docs/ainstrey D20-D24.
 */
const POD = 2.8; // the podium of the hall above the ground
const HALL_H = 9.0;
const PIT = { x0: 16.5, x1: 22.4, z0: -2.4, z1: 3.6 };
const GANTRY = { y: 4.0, z0: -9.9, z1: -7.7, x0: -24.6, x1: 24.0 };

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const MAT = {
  iron: mat(0x4a4a50, { roughness: 0.5, metalness: 0.6 }), stone: mat(0x8a8478), water: mat(0x3f87a6, { roughness: 0.15, transparent: true, opacity: 0.75 }),
  white: mat(0xf4f0e4), blue: mat(0x2f6fc8), red: mat(0xc83a2a, { emissive: 0x601008, emissiveIntensity: 0.8 }), green: mat(0x3ac86a, { emissive: 0x106a30, emissiveIntensity: 0.9 }),
  wood: mat(0x7a5636), cloth: [mat(0x8a4a3a), mat(0x3a5a7a), mat(0x6a7a4a)], skin: mat(0xe0b896), stoneG: mat(0x9a9488),
  arrow: mat(0x3ac86a, { emissive: 0x20a050, emissiveIntensity: 0.7 }),
};
const m = (geo, material, parent, shadow = true) => { const o = new THREE.Mesh(geo, material); o.castShadow = shadow; o.receiveShadow = true; parent?.add(o); return o; };

export function pumpHouse(W, k) {
  const lot = { ...k, floors: 1, wall: 0xb09a78, roofColor: 0x5c8b80, roof: 'gable', shop: false, seed: 4242 };
  const r = keyBuilding(W, lot, 7, { interior: { floorH: HALL_H, doorW: 5.0, doorH: 4.4, pit: PIT, winY: 6.0, noSteps: true }, podium: POD, plinth: 0xa89e8c });
  const F = r.frame, G = F.sub(0, r.localSill + 0.05, 0);
  const prev = W.lodMode;
  W.lodMode = 'near';
  try { furnish(W, G, k, r); } finally { W.lodMode = prev; }
  return r;
}

function furnish(W, G, k, r) {
  const w = k.w, d = k.d;
  const bw = w / 2 - 0.6, bd = d / 2 - 0.6;
  const NC = { collide: false, castShadow: false };
  const D = { ...NC, detail: true };
  // ---- the ramp up to the doorway (18 m, 9 degrees) with curbs, and the yard marks
  const ramp = { len: 18, rise: POD + 0.25 };
  const ang = Math.atan2(ramp.rise, ramp.len), rl = Math.hypot(ramp.len, ramp.rise);
  G.box(5.6, 0.4, rl, 0, -ramp.rise / 2 - 0.2, d / 2 + ramp.len / 2 + 0.2, 'plank', { rx: ang, tint: 0x9a9080 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) { const z = d / 2 + 1.5 + i * 3.1, y = -(ramp.rise * (z - d / 2)) / ramp.len; G.box(0.4, 1.0, 3.2, s * 3.0, y - 0.3, z, 'stone', { tint: 0xb4aa94 }); }
  }
  // lanterns at the foot of the ramp and at the doorway (the way in and the safe way out read at night), the signpost of the service zone
  for (const sx of [-1, 1]) {
    for (const z of [d / 2 + ramp.len + 1.2, d / 2 + 0.8]) { const p = G.at(sx * 3.9, 0, z); lamp(W, new THREE.Vector3(p.x, W.heightAt(p.x, p.z) + (z < d / 2 + 2 ? 0 : 0), p.z), G.rot); }
  }
  { const p = G.at(6.5, 0, d / 2 + ramp.len + 3); W.addSign(new THREE.Vector3(p.x, 0, p.z), G.rot, ['Насосный участок порта', 'Служебная зона: вход по допуску', 'Площадка вывода рабочих — здесь']); }
  // the green arrows on the floor and on the ramp: the safe way out
  for (let i = 0; i < 3; i++) arrow(G, 0, 0.03, 7.2 - i * 1.6 - 0, 0, NC);
  for (let i = 0; i < 4; i++) { const z = d / 2 + 2.5 + i * 3.6, y = -(ramp.rise * (z - d / 2)) / ramp.len; arrow(G, 0, y + 0.03, z, ang, NC); }
  // ---- the pumps and the pipes
  for (const x of [-15, -7]) {
    G.cyl(1.75, 3.2, x, 0, -3.8, 'metal', { seg: 16, tint: 0x6a7684 });
    G.cyl(1.9, 0.3, x, 3.0, -3.8, 'stoneDark', { seg: 16, collide: false });
    for (let i = 0; i < 3; i++) G.cyl(1.82, 0.12, x, 0.5 + i * 1.1, -3.8, 'metal', { seg: 16, collide: false, tint: 0x3a4650 });
  }
  const pipe = (x, z) => {
    G.cyl(0.55, HALL_H - 0.3, x, 0, z, 'metal', { seg: 12, tint: 0x6a7684 });
    for (const y of [0.6, 4.0, 7.6]) G.cyl(0.72, 0.22, x, y, z, 'metal', { seg: 12, collide: false, tint: 0x3a4650 });
  };
  pipe(-10.5, -7.8); pipe(10.5, -7.8);
  G.cyl(0.38, 22, 0, 6.8, -7.8, 'metal', { seg: 12, collide: false, rz: Math.PI / 2, tint: 0x5a6674 }); // the header under the ceiling joins both pipes
  G.cyl(0.32, 8, -11, 0.7, -5.8, 'metal', { seg: 8, collide: false, rz: Math.PI / 2, tint: 0x5a6674 }); // low feeds from the pumps
  // ---- the gauges: the left needle is above the white line until Roxy lowers the pressure; the right one rests on the blue mark
  const root = new THREE.Group();
  root.position.copy(G.origin);
  root.rotation.y = G.rot;
  W.addObject(root);
  const gauge = (x, name, markColor) => {
    G.box(0.9, 0.9, 0.12, x, 1.65, -7.12, 'stoneDark', { collide: false, tint: 0x2a2a2e });
    const dial = new THREE.Group(); dial.position.set(x, 2.1, -7.04); root.add(dial);
    m(new THREE.CircleGeometry(0.4, 20), MAT.white, dial, false);
    m(new THREE.BoxGeometry(0.06, 0.2, 0.01), markColor, dial, false).position.set(0.0, 0.3, 0.004);
    const needle = new THREE.Group(); dial.add(needle);
    m(new THREE.BoxGeometry(0.03, 0.34, 0.012), MAT.red, needle, false).position.set(0, 0.17, 0.01);
    return needle;
  };
  const needleL = gauge(-10.5, 'left', MAT.white), needleR = gauge(10.5, 'right', MAT.blue);
  // the white line of the left gauge is painted on the dial (a tick at 12 o'clock); the needle starts at +0.9 rad (above it)
  // ---- the side coupling on the right pipe: the white mark is the only target of the Explosion
  G.cyl(0.4, 6.2, 11.0, 1.5, -7.8, 'metal', { seg: 10, collide: false, rz: Math.PI / 2, tint: 0x6a7684 });
  const coupling = new THREE.Group(); coupling.position.set(14, 1.5, -7.8); root.add(coupling);
  const halfA = new THREE.Group(), halfB = new THREE.Group(); coupling.add(halfA, halfB);
  m(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 14).rotateZ(Math.PI / 2), MAT.iron, halfA).position.set(-0.36, 0, 0);
  m(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 14).rotateZ(Math.PI / 2), MAT.iron, halfB).position.set(0.36, 0, 0);
  const whiteRing = m(new THREE.TorusGeometry(0.66, 0.07, 6, 18), MAT.white, coupling, false); whiteRing.rotation.y = Math.PI / 2;
  const mark = new THREE.Group(); coupling.add(mark);
  for (const a of [0.8, -0.8]) { const c = m(new THREE.BoxGeometry(0.08, 1.1, 0.1), MAT.white, mark, false); c.rotation.x = a; c.position.set(0, 0, 0.62); }
  m(new THREE.CylinderGeometry(0.34, 0.34, 2.6, 10).rotateZ(Math.PI / 2), MAT.iron, halfB).position.set(1.7, 0, 0);
  const debris = new THREE.Group(); debris.visible = false; coupling.add(debris);
  for (let i = 0; i < 8; i++) { const c = m(new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.06), MAT.iron, debris); c.position.set(-0.6 + i * 0.18, -1.4, (i % 3 - 1) * 0.4); c.rotation.set(i, i * 2, 0); }
  // the jack (mechanical way): a frame with a screw and a bar, Nera holds the stop
  const jack = new THREE.Group(); jack.position.set(14, 0, -5.4); root.add(jack);
  for (const dx of [-0.7, 0.7]) m(new THREE.BoxGeometry(0.16, 1.6, 0.16), MAT.iron, jack).position.set(dx, 0.8, 0);
  m(new THREE.BoxGeometry(1.6, 0.16, 0.2), MAT.iron, jack).position.set(0, 1.6, 0);
  const screw = new THREE.Group(); screw.position.set(0, 0, 0); jack.add(screw);
  m(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), MAT.iron, screw).position.set(0, 0.8, 0);
  m(new THREE.BoxGeometry(0.9, 0.08, 0.08), MAT.iron, screw).position.set(0, 1.45, 0);
  m(new THREE.BoxGeometry(0.4, 0.04, 0.02), MAT.white, jack, false).position.set(0.5, 0.9, 0.1); // the mark of the second notch (stop)
  G.box(1.7, 0.4, 0.5, 14, 0, -5.4, 'stoneDark', { collide: false, tint: 0x4a4a4e });
  // the side lever beside it
  const lever = new THREE.Group(); lever.position.set(17.6, 0, -8.7); root.add(lever);
  m(new THREE.BoxGeometry(0.5, 0.5, 0.5), MAT.stone, lever).position.set(0, 0.25, 0);
  const leverArm = new THREE.Group(); leverArm.position.set(0, 0.5, 0); lever.add(leverArm);
  m(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), MAT.iron, leverArm).position.set(0, 0.65, 0);
  leverArm.rotation.x = -0.7;
  // ---- the latch on the left (Megumin's staff): a box with a lever, closed until the flag is set
  const latch = new THREE.Group(); latch.position.set(-12.9, 1.1, -8.0); root.add(latch);
  m(new THREE.BoxGeometry(0.5, 0.4, 0.3), MAT.iron, latch);
  const latchBar = new THREE.Group(); latchBar.position.set(0.1, 0.0, 0.2); latch.add(latchBar);
  m(new THREE.BoxGeometry(0.7, 0.07, 0.07), MAT.iron, latchBar).position.set(-0.3, 0, 0);
  // ---- the leak: a jet from the left joint until Roxy holds it; a puddle stays
  const jet = new THREE.Group(); jet.position.set(-10.5, 1.0, -7.0); root.add(jet);
  const jetMesh = m(new THREE.CylinderGeometry(0.05, 0.14, 1.6, 8), MAT.water, jet, false); jetMesh.position.set(0, 0.0, 0.3); jetMesh.rotation.x = 0.9;
  const puddle = m(new THREE.CircleGeometry(1.3, 16).rotateX(-Math.PI / 2), MAT.water, root, false); puddle.position.set(-10.5, 0.03, -5.6);
  // ---- the manual post with the lower gate (the wheel turns when Roxy tries it), the panel lamp
  G.box(1.4, 1.1, 0.7, 21.6, 0, -9.2, 'stoneDark', { tint: 0x3a3a40 });
  const gate = new THREE.Group(); gate.position.set(21.6, 1.55, -8.78); root.add(gate);
  m(new THREE.TorusGeometry(0.36, 0.05, 6, 14), MAT.iron, gate, false);
  for (const a of [0, Math.PI / 2]) { const sp = m(new THREE.BoxGeometry(0.05, 0.72, 0.05), MAT.iron, gate, false); sp.rotation.z = a; }
  const lampM = m(new THREE.SphereGeometry(0.12, 8, 6), MAT.red, root, false); lampM.position.set(21.0, 1.4, -8.8);
  // ---- the upper gantry: a plank walk along the back wall, a stair on the left wall, a power panel at the end
  const gW = GANTRY.x1 - GANTRY.x0, gz = (GANTRY.z0 + GANTRY.z1) / 2, gd = GANTRY.z1 - GANTRY.z0;
  G.box(gW, 0.22, gd, (GANTRY.x0 + GANTRY.x1) / 2, GANTRY.y - 0.22, gz, 'plank', { tint: 0x8a6a44 });
  for (let x = GANTRY.x0 + 3; x <= GANTRY.x1; x += 6) for (const z of [GANTRY.z0 + 0.15, GANTRY.z1 - 0.15]) G.box(0.25, GANTRY.y - 0.22, 0.25, x, 0, z, 'timber', { collide: false, castShadow: false, tint: 0x4a3222 });
  G.box(gW, 1.0, 0.1, (GANTRY.x0 + GANTRY.x1) / 2 + 1.2, GANTRY.y, GANTRY.z1 + 0.02, 'timber', { tint: 0x5a4030 }); // the rail on the hall side
  G.box(gW - 2.4, 0.07, 0.1, (GANTRY.x0 + GANTRY.x1) / 2 + 1.2, GANTRY.y + 1.0, GANTRY.z1 + 0.02, 'log', NC);
  const steps = 16, runZ = 0.3, riseY = GANTRY.y / steps, sx = -23.8;
  for (let i = 0; i < steps; i++) G.box(1.6, riseY * (i + 1), runZ + 0.02, sx, 0, -2.6 - runZ * (i + 0.5), 'stone', { tint: i % 2 ? 0xcfc4a8 : 0xc4b89c });
  G.box(1.6, GANTRY.y, 0.5, sx, 0, -2.6 - runZ * steps - 0.2, 'stone', { tint: 0xc4b89c });
  for (const s of [-1, 1]) G.box(0.1, 1.0, runZ * steps + 0.2, sx + s * 0.85, 0.2, -2.6 - runZ * steps / 2, 'timber', { tint: 0x5a4030, collide: false, rx: Math.atan2(GANTRY.y, runZ * steps) * -0.0 });
  const panel = new THREE.Group(); panel.position.set(22.6, GANTRY.y + 0.7, GANTRY.z0 + 0.6); root.add(panel);
  m(new THREE.BoxGeometry(1.3, 1.5, 0.3), MAT.iron, panel);
  const panelLamp = m(new THREE.SphereGeometry(0.11, 8, 6), MAT.red, panel, false); panelLamp.position.set(-0.3, 0.45, 0.17);
  const panelLamp2 = m(new THREE.SphereGeometry(0.11, 8, 6), MAT.red, panel, false); panelLamp2.position.set(0.3, 0.45, 0.17);
  // ---- the dormant service guards at their marks (stone figures; the wave replaces them), their marks on the floor
  const guards = new THREE.Group(); root.add(guards);
  for (const [gx, gz2] of [[18.2, -8.4], [20.8, -6.2]]) {
    const gg = new THREE.Group(); gg.position.set(gx, 0, gz2); guards.add(gg);
    m(new THREE.BoxGeometry(0.9, 1.5, 0.6), MAT.stoneG, gg).position.set(0, 0.95, 0);
    m(new THREE.BoxGeometry(0.5, 0.45, 0.45), MAT.stoneG, gg).position.set(0, 1.95, 0);
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.25, 1.2, 0.3), MAT.stoneG, gg).position.set(s * 0.6, 1.0, 0);
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.3, 0.4, 0.5), MAT.stoneG, gg).position.set(s * 0.25, 0.2, 0);
    G.cyl(0.9, 0.04, gx, 0.0, gz2, 'rune', { seg: 12, collide: false, castShadow: false });
  }
  // ---- the pit: rails on three sides (the ramp side is open), a lamp that shows it
  for (const [x, z, ww, dd] of [[(PIT.x0 + PIT.x1) / 2, PIT.z0 - 0.05, PIT.x1 - PIT.x0 + 0.1, 0.1], [PIT.x0 - 0.05, (PIT.z0 + PIT.z1) / 2, 0.1, PIT.z1 - PIT.z0], [PIT.x1 + 0.05, (PIT.z0 + PIT.z1) / 2, 0.1, PIT.z1 - PIT.z0]]) {
    G.box(ww, 0.9, dd, x, 0, z, 'timber', { tint: 0x5a4030 });
  }
  G.box(5.8, 0.05, 0.1, (PIT.x0 + PIT.x1) / 2, 0.02, PIT.z1 + 0.02, 'rune', { collide: false, castShadow: false }); // a mark on the floor at the foot of the ramp
  // ---- lamps (the emitters of the hall: hanging iron lamps on chains) and the sign of the exit
  const rng = mulberry32(31);
  for (const [x, z] of [[-12, 0], [-2, 2], [8, 0], [18, 5], [-18, 6], [10, -4]]) {
    G.box(0.04, 2.0, 0.04, x, HALL_H - 2.4, z, 'metal', NC);
    G.cyl(0.32, 0.4, x, HALL_H - 2.8, z, 'lampGlass', { ...NC, seg: 8 });
    W.addLightSource(G.at(x, HALL_H - 2.6, z), { color: 0xffd090, intensity: 6, distance: 16, always: true, flicker: true });
  }
  for (const [x, z] of [[-18, -8.9], [-6, -8.9], [6, -8.9], [16, -8.9]]) { G.cyl(0.2, 0.3, x, GANTRY.y + 2.0, z, 'lampGlass', { ...NC, seg: 8 }); W.addLightSource(G.at(x, GANTRY.y + 2.1, z), { color: 0xffc880, intensity: 4, distance: 10, always: true }); }
  G.box(2.4, 0.5, 0.08, 0, 5.2, d / 2 - 0.55, 'plank', { ...NC, tint: 0x3a8a4a });
  G.box(0.5, 0.9, 0.04, 5.6, 1.6, bd - 0.1, 'plank', { ...NC, tint: 0xb03a2a }); // a warning board
  // benches and crates: the place of the workers on the gantry, the rest bench (the safe pause at the disabled panel)
  const rest = new THREE.Group(); root.add(rest);
  G.box(2.2, 0.1, 0.6, -3.5, 0.5, -9.4, 'plank', { tint: 0x8a6a44 });
  for (const s of [-1, 1]) G.box(0.12, 0.5, 0.5, -3.5 + s * 0.95, 0, -9.4, 'timber', { collide: false, castShadow: false });
  void rest; void rng;
  // ---- the workers: three figures on the gantry; when the gangway is set they walk out to the yard
  const workers = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    m(new THREE.CylinderGeometry(0.26, 0.3, 1.1, 8), MAT.cloth[i], g).position.set(0, 0.85, 0);
    m(new THREE.SphereGeometry(0.2, 8, 6), MAT.skin, g).position.set(0, 1.62, 0);
    m(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8), MAT.wood, g).position.set(0, 1.78, 0);
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.14, 0.7, 0.16), MAT.iron, g).position.set(s * 0.12, 0.3, 0);
    root.add(g);
    return g;
  });
  // the gangway: a plank that leans at the foot of the stair, then lies across the ditch in front of it
  const gangway = new THREE.Group(); root.add(gangway);
  m(new THREE.BoxGeometry(1.5, 0.1, 2.6), MAT.wood, gangway);
  G.box(1.9, 0.04, 1.1, sx, 0.0, -0.9, 'stoneDark', { collide: false, castShadow: false, tint: 0x1a1a1e }); // the ditch
  const ground = (lx, lz) => { const p = G.at(lx, 0, lz); return W.heightAt(p.x, p.z); };

  // ---- named places (the NPCs, the props, the markers) and the props themselves
  const P = (id, name, prompt, lx, ly, lz) => { const p = G.at(lx, ly, lz); W.addInteractable(new QuestProp({ id, name, prompt, position: p, shape: 'none' })); };
  const S = (name, lx, lz, yaw = 0, ly = 0) => W.spot(name, G.at(lx, ly, lz), G.rot + yaw);
  const Sg = (name, lx, lz, yaw = 0) => { const p = G.at(lx, 0, lz); W.spot(name, new THREE.Vector3(p.x, W.heightAt(p.x, p.z), p.z), G.rot + yaw); };
  S('port_pump_in', 0, bd - 2.0, Math.PI);
  Sg('pump_yard', 0, d / 2 + ramp.len + 4.5, Math.PI);
  Sg('pump_yard_mirena', -3.2, d / 2 + ramp.len + 3.2, Math.PI);
  Sg('pump_oskar', 3.4, d / 2 + ramp.len + 3.6, Math.PI);
  S('pump_mirena', 19.6, -9.0, 0.4);
  S('pump_nera', 12.1, -5.0, -1.2);
  S('port_panel', 22.6, -9.4, 0, GANTRY.y);
  S('port_pit', (PIT.x0 + PIT.x1) / 2, (PIT.z0 + PIT.z1) / 2 - 1.2, 0, -POD - 0.05);
  S('port_white_mark', 14, -7.1, 0, 1.5);
  S('port_jack', 14, -5.0, 0, 0.9);
  S('port_lever', 17.6, -8.0, 0, 0.7);
  S('port_gate', 21.6, -8.2, 0, 1.4);
  S('port_leak', -10.5, -6.6, 0, 1.0);
  S('port_pipe_left', -10.5, -6.7, 0, 2.0);
  S('port_guard_a', 18.2, -8.4);
  S('port_guard_b', 20.8, -6.2);
  S('port_upper_mark', -23.8, -8.8, 0, GANTRY.y);
  S('port_rest', -3.5, -8.4, 0);

  P('port_note', 'Записка рабочих', 'Прочитать записку на ящике', -1.0, 1.0, 7.4);
  P('port_gangway', 'Мосток', 'Переставить мосток к лестнице', sx + 1.2, 0.5, -0.4);
  P('port_latch', 'Защёлка боковой задвижки', 'Освободить защёлку посохом', -12.9, 1.1, -7.7);
  P('port_leak_prop', 'Протечка', 'Осмотреть протечку', -10.5, 1.0, -6.6);
  P('port_pipe_left_prop', 'Левая труба', 'Осмотреть левую трубу и шкалу', -9.2, 1.6, -6.9);
  P('port_gauge_right', 'Шкала правой трубы', 'Проверить синюю риску', 9.6, 1.6, -6.9);
  P('port_rest', 'Передышка', 'Передохнуть у отключённой панели', -3.5, 0.9, -8.6);
  P('port_upper', 'Верхний мосток', 'Подняться и осмотреть верхний мосток', GANTRY.x0 + 3.6, GANTRY.y + 0.9, -8.8);
  P('port_panel', 'Силовая панель стражей', 'Снять питание панели', 21.8, GANTRY.y + 1.1, GANTRY.z0 + 1.1);
  P('port_hold', 'Отвод потока', 'Держать поток у отвода (Рокси)', 8.4, 1.0, -6.4);
  P('port_white_prop', 'Белая отметка на боковой муфте', 'Осмотреть муфту', 14, 1.4, -6.6);
  P('port_jack', 'Домкрат боковой муфты', 'Повернуть домкрат до метки (Мегумин)', 14, 0.9, -5.0);
  P('port_lever', 'Боковой рычаг', 'Отпустить рычаг по знаку Нэры', 17.6, 0.9, -8.0);
  P('port_flow', 'Отвод потока', 'Взять отвод под управление (Рокси)', 8.4, 1.0, -6.0);
  P('port_gate', 'Нижняя заслонка', 'Проверить нижнюю заслонку (Рокси)', 21.6, 1.4, -8.2);
  P('port_lamp_hint', 'Лампа панели', 'Осмотреть лампу панели', 21.0, 1.3, -8.4);

  const site = new PortSite(W, { root, needleL, needleR, coupling, halfA, halfB, mark, whiteRing, debris, screw, leverArm, latchBar, jet, jetMesh, puddle, gate, lampM, panelLamp, panelLamp2, guards, workers, gangway, G, sx, ground, d, ramp, GANTRY });
  W.port = site;
  W.addUpdatable(site);
}

function arrow(G, x, y, z, rx, o) {
  G.box(0.5, 0.02, 1.0, x, y, z, 'rune', { ...o, tint: 0x3ac86a, rx, castShadow: false });
  G.box(1.3, 0.02, 0.35, x, y, z + 0.5, 'rune', { ...o, tint: 0x3ac86a, rx, castShadow: false });
}

/** The state of the pump hall (flags -> visuals), animated. */
class PortSite {
  constructor(W, p) {
    this.W = W;
    Object.assign(this, p);
    this.t = 0;
    this.state = null;
    this.walk = [0, 0, 0]; // distance walked by each worker
    this.walking = false;
    this.needT = 0; // 0 high, 1 low
    this.jackT = 0; this.leverT = 0; this.coupT = 0; this.gateT = 0; this.latchT = 0;
    // the path of the workers (hall coordinates: x, y above the floor, z)
    const G = p.G, sx = p.sx;
    const ground = (lx, lz) => p.ground(lx, lz) - G.origin.y;
    this.path = [
      [-6, p.GANTRY.y, -8.8], [sx, p.GANTRY.y, -8.8], [sx, p.GANTRY.y, -7.6], [sx, 0, -2.6], [sx, 0, 3], [-3, 0, 7], [0, 0, 9], [0, 0, 11.6],
      [0, -3.05, 11.6 + p.ramp.len], [0, ground(0, 11.6 + p.ramp.len + 6), 11.6 + p.ramp.len + 6],
    ];
    this.pathLen = [0];
    for (let i = 1; i < this.path.length; i++) this.pathLen.push(this.pathLen[i - 1] + Math.hypot(...this.path[i].map((v, k) => v - this.path[i - 1][k])));
    this.total = this.pathLen[this.pathLen.length - 1];
    this.workerSpots = [[-6, -8.8], [0, -8.8], [6, -8.8]];
    this._place();
  }

  _placeWorker(i, dist) {
    const wk = this.workers[i];
    const L = this.pathLen;
    const dd = Math.min(this.total - 0.001, Math.max(0, dist));
    let k = 1;
    while (k < L.length - 1 && L[k] < dd) k++;
    const f = (dd - L[k - 1]) / (L[k] - L[k - 1] || 1), a = this.path[k - 1], b = this.path[k];
    wk.position.set(a[0] + (b[0] - a[0]) * f + i * 0.25 * 0, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    wk.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
  }

  _place() {
    // before the evacuation: standing on the gantry at their places; after: waiting in the yard
    this.workers.forEach((wk, i) => {
      const [x, z] = this.workerSpots[i];
      wk.position.set(x, this.GANTRY.y, z);
      wk.rotation.y = 0.4;
    });
  }

  /** Flags -> visuals. `instant` skips the animations (after loading a save). */
  sync(F, V, instant = false) {
    const st = {
      gang: !!F.port_gangway, latch: !!F.port_latch_free, leak: !!F.port_leak_held, left: !!F.port_gauge_left, right: !!F.port_gauge_right,
      panel: !!F.port_panel_off, guards: !!F.wv_port_guards, gone: !!F.wd_port_guards, blast: !!F.port_coupling_blasted, jack: !!F.port_jack, lever: !!F.port_lever,
      gate: !!F.port_gate_ok, fixed: !!V.PORT_REPAIRED, route: V.PORT_GUARDS || '', stageGuards: !!F.wv_port_guards,
    };
    const first = !this.state;
    this.state = st;
    this.latchTarget = st.latch ? 1 : 0;
    this.needTarget = st.left ? 1 : 0;
    this.jackTarget = st.jack ? 1 : 0;
    this.leverTarget = st.lever ? 1 : 0;
    this.coupTarget = st.blast || st.lever ? 1 : 0;
    this.gateTarget = st.gate ? 1 : 0;
    this.guards.visible = !(st.guards);
    this.debris.visible = st.blast;
    this.mark.visible = !(st.blast || st.lever);
    this.whiteRing.visible = !(st.blast || st.lever);
    this.lampM.material = st.fixed ? MAT.green : MAT.red;
    this.panelLamp.material = st.panel || st.fixed ? MAT.green : MAT.red;
    this.panelLamp2.material = st.panel || st.fixed ? MAT.green : MAT.red;
    this.jet.visible = !st.leak;
    this.puddle.scale.setScalar(st.leak ? 0.55 : 1);
    if (st.gang && !this.walking && !this.done) {
      if (instant || first) { this.done = true; this.workers.forEach((_, i) => this._placeWorker(i, this.total)); }
      else { this.walking = true; this.walk = [0, -2.2, -4.4].map((v) => v); }
    }
    if (!st.gang) { this.done = false; this.walking = false; this._place(); }
    if (instant || first) {
      this.needT = this.needTarget; this.jackT = this.jackTarget; this.leverT = this.leverTarget; this.coupT = this.coupTarget; this.gateT = this.gateTarget; this.latchT = this.latchTarget;
      this._apply(0);
    }
    this._gangway(st.gang);
  }

  _gangway(set) {
    // leaning at the foot of the stair, or laid over the ditch
    const g = this.gangway;
    if (set) { g.position.set(this.sx, 0.06, -0.9); g.rotation.set(0, 0, 0); }
    else { g.position.set(this.sx - 0.9, 0.9, -2.0); g.rotation.set(0.9, 0, 0); }
  }

  _apply(dt) {
    const k = (cur, tar) => cur + Math.sign(tar - cur) * Math.min(Math.abs(tar - cur), dt * 0.6);
    this.needT = k(this.needT, this.needTarget); this.jackT = k(this.jackT, this.jackTarget); this.leverT = k(this.leverT, this.leverTarget);
    this.coupT = k(this.coupT, this.coupTarget); this.gateT = k(this.gateT, this.gateTarget); this.latchT = k(this.latchT, this.latchTarget);
    this.needleL.rotation.z = THREE.MathUtils.lerp(-0.95, 0.25, this.needT); // high: tilted to the right of the white line; low: below it
    this.needleR.rotation.z = 0.02; // on the blue mark
    this.screw.rotation.y = this.jackT * Math.PI * 4;
    this.screw.position.y = this.jackT * 0.25;
    this.leverArm.rotation.x = THREE.MathUtils.lerp(-0.7, 0.7, this.leverT);
    this.latchBar.rotation.z = this.latchT * 1.2;
    this.halfA.position.x = -this.coupT * (this.state?.blast ? 1.8 : 0.9);
    this.halfB.position.x = this.coupT * (this.state?.blast ? 1.8 : 0.9);
    this.halfA.rotation.z = this.coupT * (this.state?.blast ? -0.5 : 0);
    this.halfB.rotation.z = this.coupT * (this.state?.blast ? 0.5 : 0);
    this.gate.rotation.z = this.gateT * Math.PI;
  }

  update(dt) {
    if (!this.state) return;
    this.t += dt;
    this._apply(dt);
    if (this.jet.visible) { this.jetMesh.scale.y = 0.9 + Math.sin(this.t * 18) * 0.12; this.jetMesh.scale.x = 0.9 + Math.sin(this.t * 23 + 1) * 0.1; }
    if (this.walking) {
      let all = true;
      this.workers.forEach((wk, i) => {
        this.walk[i] = Math.min(this.total, this.walk[i] + dt * 1.7);
        this._placeWorker(i, this.walk[i]);
        wk.position.y += Math.abs(Math.sin(this.t * 8 + i)) * 0.04;
        if (this.walk[i] < this.total) all = false;
      });
      if (all) { this.walking = false; this.done = true; }
    }
  }
}
