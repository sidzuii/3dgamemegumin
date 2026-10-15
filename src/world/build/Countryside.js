import * as THREE from 'three';
import { mulberry32 } from '../../core/math.js';
import { Frame, house, tower, lamp, lantern, barrel, crate, stall, well, bench, wagon, haystack, fence, tree, bush, rock, bridge, plankBridge, prop, GEOMETRY } from './Kit.js';
import { ROOF_COLORS } from '../KitLibrary.js';
import { REGION, LAKES, BRIDGES, POIS } from '../MapData.js';
import { QuestProp, Door } from '../Interactables.js';
import { createRitualCircle } from '../Surfaces.js';

/**
 * Everything outside the walls of Axel: the bridges (Moon bridge at the east gate, the south
 * bridge, the plank bridge over the Alder creek), Boris' farm, the east fields with the
 * windmill, the Crossroads, the woodcutter in the Alder wood, the village of Olkhovka, the
 * hunters' camp, the hidden glade, the goblin den, the old watchtower, the mine entrance, the
 * Astrarium ruins and the outer territories.
 */
const POI = Object.fromEntries(POIS.map((p) => [p.id, p]));
export function buildCountryside(world) {
  const rng = mulberry32(777);
  const W = world;
  bridges(W, rng);
  farms(W, rng);
  W.group('windmill', { x: POI.windmill.x, z: POI.windmill.z, rot: -0.6 }, () => windmill(W, POI.windmill.x, POI.windmill.z), 'Мельница');
  W.group('east_farm', { x: POI.east_farm.x, z: POI.east_farm.z, rot: 0.2 }, (r) => eastFarm(W, r), 'Заречный хутор');
  W.group('crossroads', { x: REGION.crossroads.center.x, z: REGION.crossroads.center.z }, (r) => crossroads(W, r), 'Развилка трёх дорог');
  W.group('woodcutter', { x: POI.woodcutter.x, z: POI.woodcutter.z, rot: 1.2 }, (r) => woodcutter(W, r), 'Хижина дровосека');
  olkhovka(W, rng);
  eastRoad(W);
  // Editable groups (map editor): whole places that move as one.
  const R = (id) => REGION[id].center;
  W.group('hunters_camp', R('hunters'), (r) => huntersCamp(W, r), 'Лагерь охотников');
  W.group('forest_outpost', { x: POI.forest_scouts.x, z: POI.forest_scouts.z }, (r) => forestOutpost(W, r), 'Аванпост гоблинов');
  W.group('glade', R('glade'), (r) => glade(W, r), 'Скрытая поляна');
  W.group('goblin_den', R('goblin_den'), (r) => goblinDen(W, r), 'Логово гоблинов');
  W.group('watchtower', R('watchtower'), (r) => watchtower(W, r), 'Сторожевая башня');
  W.group('cave_entrance', R('cave'), (r) => caveEntrance(W, r), 'Вход в Старую шахту');
  W.group('astrarium', R('astrarium'), (r) => astrarium(W, r), 'Руины Астрариума');
  W.group('return_camp', { x: -318, z: -196, rot: 0 }, () => returnCamp(W), 'Привал на северной дороге (A27)');
  W.group('mist_lake', R('mist_lake'), (r) => mistLake(W, r), 'Озеро Туманов');
  W.group('crimson_gorge', R('crimson_gorge'), (r) => crimsonGorge(W, r), 'Багровое ущелье');
  W.group('old_mines', R('old_mines'), (r) => oldMines(W, r), 'Заброшенный посёлок');
  W.group('east_pass', R('east_pass'), (r) => eastPass(W, r), 'Восточный перевал');
}

const H = (W, x, z) => W.heightAt(x, z);

// -----------------------------------------------------------------------------------------
function bridges(W, rng) {
  const deck = (b) => Math.max(H(W, ...b.a), H(W, ...b.b)) + 0.25;
  for (const b of BRIDGES) {
    const mx = (b.a[0] + b.b[0]) / 2, mz = (b.a[1] + b.b[1]) / 2;
    if (b.kind === 'stone') W.group('bridge_' + b.id, { x: mx, z: mz }, () => bridge(W, ...b.a, ...b.b, b.width, deck(b)), b.name);
    else if (b.kind === 'plank') W.group('bridge_' + b.id, { x: mx, z: mz }, () => plankBridge(W, ...b.a, ...b.b, b.width, Math.max(H(W, ...b.a), H(W, ...b.b)) + 0.15), b.name);
  }
  const moon = BRIDGES.find((b) => b.id === 'moon_bridge');
  W.spot('east_bridge', new THREE.Vector3((moon.a[0] + moon.b[0]) / 2, deck(moon), (moon.a[1] + moon.b[1]) / 2), Math.PI / 2);
  // Named places used by quests, events and NPC schedules.
  const sp = (name, x, z, yaw = 0) => W.spot(name, new THREE.Vector3(x, H(W, x, z), z), yaw);
  sp('herb_meadow', POI.herb_meadow.x, POI.herb_meadow.z);
  sp('river_meadow', POI.river_meadow.x, POI.river_meadow.z);
  sp('tobias_wait', POI.tobias_wait.x, POI.tobias_wait.z, Math.PI / 2);
  sp('caravan_trader', POI.caravan_trader.x, POI.caravan_trader.z, 0.3);
  sp('caravan_trader_wagon', POI.caravan_trader.x + 4, POI.caravan_trader.z + 6, 0);
  sp('ambush_point', POI.ambush_point.x, POI.ambush_point.z);
  sp('injured_traveler', POI.injured_traveler.x, POI.injured_traveler.z, -0.6);
  // Smugglers' stash under the Moon bridge (a secret).
  const sx = POI.bridge_stash.x, sz = POI.bridge_stash.z;
  W.addChest(new THREE.Vector3(sx, H(W, sx, sz) + 0.02, sz), -Math.PI / 2, 'bridge_stash');
  for (let i = 0; i < 3; i++) crate(W, new Frame(W, sx + 0.4, H(W, sx + 0.4, sz + 1.2 + i * 0.8), sz + 1.2 + i * 0.8, 0), 0, 0, 0.6, i);
}

// -----------------------------------------------------------------------------------------
function farms(W, rng) {
  // Farmhouse of Boris.
  W.group('farmhouse', { x: -324, z: 230, rot: Math.PI / 2 }, (r) => {
    const fh = house(W, { x: -324, z: 230, rot: Math.PI / 2, w: 8, d: 6, floors: 2, roofTint: 0xd8b878, chimney: true, kind: 'farmhouse' }, r);
    W.spot('farmhouse', fh.door, Math.PI / 2);
  }, 'Дом фермера');
  // Red barn.
  W.group('barn', { x: -340, z: 248, rot: Math.PI / 2 }, (r) => barn(W, r), 'Амбар');
  for (let i = 0; i < 4; i++) W.group('hay_' + i, { x: -348 + (i % 2) * 2.4, z: 254 + Math.floor(i / 2) * 2.6 }, () => haystack(W, -348 + (i % 2) * 2.4, 254 + Math.floor(i / 2) * 2.6, 0.8), 'Стог сена');
  farmFields(W, rng);
}

function barn(W, rng) {
  const b = house(W, { x: -340, z: 248, rot: Math.PI / 2, w: 11, d: 8, floors: 1, floorH: 4.6, style: 'wood', roofTint: 0x5a4a40, chimney: false, door: 0, kind: 'barn', lantern: false }, rng);
  b.frame.box(3.2, 3.4, 0.1, 0, 0.35, 4.08, 'door', { tint: 0x8a3a2a, collide: false });
  for (const s of [-1, 1]) b.frame.box(0.12, 3.4, 0.12, s * 0.8, 0.35, 4.14, 'timber', { tint: 0xf0e8d8, collide: false, rz: s * 0.85 });
  W.spot('barn', b.frame.at(0, 0.35, 5.2), Math.PI / 2);
  W.spot('cat_hide', b.frame.at(-6.6, 0.35, -2.5), 0);
  const catPos = b.frame.at(-6.4, 0, -2.2);
  catPos.y = H(W, catPos.x, catPos.z);
  W.addInteractable(new QuestProp({ id: 'cat_ugolek', name: 'Чёрный кот', prompt: 'Взять на руки', position: catPos, shape: 'cat', rotY: 1.2 }));
}

function farmFields(W, rng) {
  // Fields (crops rendered as tall instanced grass, rows of cabbages / pumpkins).
  const fields = [
    { x: -314, z: 256, w: 22, d: 16, crop: 'wheat' },
    { x: -308, z: 279, w: 20, d: 12, crop: 'wheat' },
    { x: -276, z: 242, w: 16, d: 20, crop: 'cabbage' },
    { x: -288, z: 286, w: 16, d: 10, crop: 'pumpkin' },
  ];
  W.fields = W.fields || [];
  fields.forEach((f, i) => W.group('field_' + i, { x: f.x, z: f.z }, () => {
    const pts = [[f.x - f.w / 2, f.z - f.d / 2], [f.x + f.w / 2, f.z - f.d / 2], [f.x + f.w / 2, f.z + f.d / 2], [f.x - f.w / 2, f.z + f.d / 2], [f.x - f.w / 2, f.z - f.d / 2 + 3]];
    fence(W, pts, { tint: 0x9a7a50 });
    if (f.crop === 'wheat') {
      W.fields.push({ rect: { x: W.xf(new THREE.Vector3(f.x, 0, f.z)).x, z: W.xf(new THREE.Vector3(f.x, 0, f.z)).z, w: f.w - 1, d: f.d - 1 }, count: Math.round(f.w * f.d * 9), hue: 0.12, scale: 2.1, sat: 0.55, light: 0.55, crop: true });
    } else {
      for (let rz = f.z - f.d / 2 + 1.2; rz < f.z + f.d / 2 - 0.8; rz += 1.6) {
        for (let rx = f.x - f.w / 2 + 1.2; rx < f.x + f.w / 2 - 0.8; rx += 1.3) {
          const y = H(W, rx, rz);
          const F = new Frame(W, rx + (rng() - 0.5) * 0.3, y - 0.04, rz, rng() * 6);
          if (f.crop === 'cabbage') F.kit('food/cabbage', 0, 0, 0, { s: 1.5 + rng() * 0.4, collide: false, castShadow: false });
          else if (rng() < 0.55) F.kit('food/pumpkin', 0, 0, 0, { s: 1.9 + rng() * 0.6, collide: false });
          else F.kit('nature/crops_leafsStageB', 0, 0, 0, { s: 1.6, collide: false, castShadow: false });
        }
      }
    }
    W.spot('field_' + i, new THREE.Vector3(f.x, H(W, f.x, f.z), f.z + f.d / 2 - 1), 0);
    W.addFootprint(f.x, f.z, f.w, f.d, 0, 'field');
  }, 'Поле ' + (i + 1)));
  // Scarecrow.
  W.group('scarecrow', { x: -312, z: 254, rot: 0.4 }, () => {
    const S = new Frame(W, -312, H(W, -312, 254), 254, 0.4);
    S.box(0.12, 2.2, 0.12, 0, 0, 0, 'log', { collide: false });
    S.box(1.6, 0.1, 0.1, 0, 1.6, 0, 'log', { collide: false });
    S.box(0.7, 0.8, 0.35, 0, 1.2, 0, 'cloth', { collide: false, tint: 0x6a7ab0 });
    S.sphere(0.25, 0, 2.25, 0, 'hay', { collide: false });
    S.cone(0.45, 0.4, 0, 2.4, 0, 'hay', { collide: false, seg: 8 });
  }, 'Пугало');
  W.group('farm_wagon', { x: -318, z: 222, rot: 0.2 }, () => wagon(W, -318, 222, 0.2, 0xd8c8a0), 'Фургон');
  W.group('farm_well', { x: -316, z: 238 }, () => well(W, -316, 238), 'Колодец');
  // Mushroom raid spawn points around the fields (night event).
  [[-328, 268], [-296, 266], [-266, 254], [-304, 296]].forEach(([x, z], i) => W.spot('raid_' + i, new THREE.Vector3(x, H(W, x, z), z), 0));
}

/** Stone windmill with turning sails (sails are a live mesh). */
function windmill(W, x, z) {
  const y = H(W, x, z);
  const F = new Frame(W, x, y, z, -0.6);
  F.put(new THREE.CylinderGeometry(2.0, 2.8, 1, 12).translate(0, 0.5, 0), 1, 9, 1, 0, -0.5, 0, 'plaster', { tint: 0xf0e6d4 });
  F.cone(3.0, 3.2, 0, 8.4, 0, 'roof', { tint: 0x7d3a3a, seg: 12 });
  F.box(1.1, 2.0, 0.1, 0, 0, 2.62, 'door', { tint: 0x6a4428, collide: false });
  for (const yy of [3.5, 6]) F.box(0.7, 0.9, 0.06, 0, yy, 2.45, 'window', { collide: false, castShadow: false });
  W.addFootprint(x, z, 6, 6, 0, 'windmill');
  const hub = F.at(0, 7.6, 2.6);
  const sails = new THREE.Group();
  sails.position.copy(hub);
  sails.rotation.y = -0.6;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.95, side: THREE.DoubleSide });
  const rotor = new THREE.Group();
  sails.add(rotor);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 4) * Math.PI * 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6.2, 0.16).translate(0, 3.1, 0), wood);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 4.8).translate(0.75, 3.6, 0), cloth);
    beam.castShadow = sail.castShadow = true;
    arm.add(beam, sail);
    rotor.add(arm);
  }
  const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10).rotateX(Math.PI / 2), wood);
  rotor.add(hubMesh);
  W.addObject(sails);
  W.addUpdatable({ update: (dt) => { rotor.rotation.z -= dt * 0.55; } });
}

// -----------------------------------------------------------------------------------------
function olkhovka(W, rng) {
  const c = REGION.olkhovka.center;
  const houses = [
    [-14, -10, Math.PI / 2], [-12, 10, Math.PI / 2], [14, -14, -Math.PI / 2], [16, 8, -Math.PI / 2], [0, 18, Math.PI], [-2, -20, 0],
  ];
  houses.forEach(([dx, dz, rot], i) => W.group('olk_house_' + i, { x: c.x + dx, z: c.z + dz, rot }, (r) => {
    const h = house(W, { x: c.x + dx, z: c.z + dz, rot, w: 6 + Math.round(r() * 2), d: 5 + Math.round(r()), floors: r() < 0.3 ? 2 : 1, roofTint: 0xe0c080, kind: 'house' }, r);
    W.spot(`olk_house_${dx}_${dz}`, h.door, rot);
  }, 'Дом в Ольховке ' + (i + 1)));
  W.spot('olkhovka_tobias', new THREE.Vector3(c.x - 7, H(W, c.x - 7, c.z + 8), c.z + 8), -Math.PI / 2);
  // The inn "Ольха" (Helga runs the caravans from here).
  W.group('olk_inn', { x: c.x + 2, z: c.z - 4 }, (r) => {
    const inn = house(W, { x: c.x + 2, z: c.z - 4, rot: 0, w: 9, d: 7, floors: 2, open: 'shop', roofTint: 0x7d5a3a, awningTint: 0x4a8a5a, chimney: true, kind: 'shop' }, r);
    W.spot('olkhovka_inn', inn.frame.at(0, 0.35, 1.6), 0);
    W.spot('olkhovka_inn_front', inn.frame.at(0, 0.35, 4.6), Math.PI);
  }, 'Постоялый двор «Ольха»');
  // Scholar Edmund's house with a telescope on the roof.
  W.group('olk_scholar', { x: c.x + 24, z: c.z - 2, rot: -Math.PI / 2 }, (r) => {
    const sch = house(W, { x: c.x + 24, z: c.z - 2, rot: -Math.PI / 2, w: 7, d: 6, floors: 2, roofTint: 0x3e4a6a, kind: 'house' }, r);
    const T = sch.frame.sub(0, sch.top + 2.6, -1.2);
    T.cyl(0.25, 2.2, 0, 0, 0, 'metal', { seg: 10, rx: -0.8, collide: false });
    T.box(0.1, 1.2, 0.1, 0, -1.0, 0, 'metal', { collide: false });
    W.spot('scholar', sch.door, -Math.PI / 2);
  }, 'Дом учёного Эдмунда');
  // Green with a big alder, well, benches, market cart.
  W.group('olk_green', { x: c.x, z: c.z + 6 }, (r) => {
    tree(W, c.x - 2, c.z + 4, 1.5, r, 'oak');
    bench(W, new Frame(W, c.x - 4, H(W, c.x - 4, c.z + 7.5), c.z + 7.5, 0), 0, 0, 0);
    W.spot('olkhovka_green', new THREE.Vector3(c.x, H(W, c.x, c.z + 6), c.z + 6), 0);
  }, 'Площадь Ольховки');
  W.group('olk_well', { x: c.x + 9, z: c.z + 5 }, () => well(W, c.x + 9, c.z + 5), 'Колодец');
  W.group('olk_stall', { x: c.x + 6, z: c.z + 10, rot: Math.PI }, (r) => stall(W, c.x + 6, c.z + 10, Math.PI, 0x4a8a5a, 'fruit', r), 'Прилавок');
  W.group('olk_wagon', { x: c.x - 18, z: c.z + 2, rot: 1.4 }, () => {
    wagon(W, c.x - 18, c.z + 2, 1.4, 0xe8dcc0);
    W.spot('helga', new THREE.Vector3(c.x - 16, H(W, c.x - 16, c.z + 4), c.z + 4), Math.PI / 2);
  }, 'Фургон Хельги');
  // Small chapel + churchyard.
  W.group('chapel', { x: c.x - 4, z: c.z + 30, rot: Math.PI }, (r) => {
    const ch = house(W, { x: c.x - 4, z: c.z + 30, rot: Math.PI, w: 6, d: 9, floors: 1, floorH: 4.2, roofTint: 0x3a6a8a, chimney: false, pitch: 0.95, kind: 'chapel' }, r);
    ch.frame.box(1.6, 3.4, 1.6, 0, ch.top + 2.0, 3.2, 'plaster', { tint: 0xf4f0e8 });
    ch.frame.cone(1.4, 2.6, 0, ch.top + 5.4, 3.2, 'roof', { tint: 0x3a6a8a, seg: 4, ry: Math.PI / 4 });
    churchyard(W, ch.frame, r);
  }, 'Часовня и кладбище');
  fence(W, [[c.x - 30, c.z - 26], [c.x - 30, c.z + 26]], { tint: 0x8a6a48 });
  [[-8, -4], [9, -6], [-6, 26], [20, 18]].forEach(([dx, dz], i) => W.group('olk_lamp_' + i, { x: c.x + dx, z: c.z + dz }, () => lamp(W, new THREE.Vector3(c.x + dx, H(W, c.x + dx, c.z + dz), c.z + dz), 0), 'Фонарь'));
}

// -----------------------------------------------------------------------------------------
/**
 * Things to see along the Axel -> Olkhovka road (stage 6): fields and a shrine after the Moon
 * bridge, the lone oak on the ridge, the ford, the boundary stone at the gorge fork, the tar
 * burners' clearing, the reed pond with the fisher's hut, the apiary, the orchard and the
 * village gate. No enemies: the road's only fight is the escort ambush.
 */
function eastRoad(W) {
  const sp = (x, z) => new THREE.Vector3(x, H(W, x, z), z);
  // Fields on both sides of the road between the Moon bridge and the Crossroads.
  W.group('east_fields', { x: -40, z: -60 }, (r) => {
    const fields = [
      { x: -118, z: -40, w: 26, d: 14, crop: 'wheat' },
      { x: -60, z: -82, w: 18, d: 12, crop: 'cabbage' },
      { x: 30, z: -90, w: 30, d: 16, crop: 'wheat' },
      { x: 40, z: -30, w: 18, d: 10, crop: 'pumpkin' },
    ];
    W.fields = W.fields || [];
    for (const f of fields) {
      const pts = [[f.x - f.w / 2, f.z - f.d / 2], [f.x + f.w / 2, f.z - f.d / 2], [f.x + f.w / 2, f.z + f.d / 2], [f.x - f.w / 2, f.z + f.d / 2], [f.x - f.w / 2, f.z - f.d / 2 + 3]];
      fence(W, pts, { tint: 0x9a7a50 });
      if (f.crop === 'wheat') W.fields.push({ rect: { x: f.x, z: f.z, w: f.w - 1, d: f.d - 1 }, count: Math.round(f.w * f.d * 9), hue: 0.12, scale: 2.1, sat: 0.55, light: 0.55, crop: true });
      else {
        for (let rz = f.z - f.d / 2 + 1.2; rz < f.z + f.d / 2 - 0.8; rz += 1.6) {
          for (let rx = f.x - f.w / 2 + 1.2; rx < f.x + f.w / 2 - 0.8; rx += 1.4) {
            const F = new Frame(W, rx + (r() - 0.5) * 0.3, H(W, rx, rz) - 0.04, rz, r() * 6);
            if (f.crop === 'cabbage') F.kit('food/cabbage', 0, 0, 0, { s: 1.5 + r() * 0.4, collide: false, castShadow: false, detail: true });
            else F.kit(r() < 0.55 ? 'food/pumpkin' : 'nature/crops_leafsStageB', 0, 0, 0, { s: 1.8, collide: false, detail: true });
          }
        }
      }
      W.addFootprint(f.x, f.z, f.w, f.d, 0, 'field');
    }
    haystack(W, 4, -76, 0.9);
    haystack(W, 9, -78, 0.7);
    wagon(W, 0, -72, 0.6, 0xd8c8a0);
    const S = new Frame(W, 36, H(W, 36, -104), -104, 0.4);
    S.box(0.12, 2.2, 0.12, 0, 0, 0, 'log', { collide: false });
    S.box(1.6, 0.1, 0.1, 0, 1.6, 0, 'log', { collide: false });
    S.box(0.7, 0.8, 0.35, 0, 1.2, 0, 'cloth', { collide: false, tint: 0xa05a3a });
    S.sphere(0.25, 0, 2.25, 0, 'hay', { collide: false });
  }, 'Поля у дороги');
  // Roadside shrine of Eris at the farm-lane fork.
  W.group('road_shrine', { x: -30, z: -48, rot: 2.2 }, () => {
    const S = new Frame(W, -30, H(W, -30, -48), -48, 2.2);
    S.box(1.2, 2.0, 0.8, 0, 0, 0, 'stone', { tint: 0xc8c0b0 });
    S.box(1.6, 0.25, 1.1, 0, 2.0, 0, 'roof', { tint: 0x3a6a8a });
    S.sphere(0.13, 0, 1.45, 0.35, 'stone', { tint: 0xf0ece4, collide: false });
    prop(S, 'graveyard/candle-multiple', 0, 0, 0.7, { s: 0.9, collide: false });
    W.addLightSource(S.at(0, 1.0, 0.8), { color: 0xffd090, intensity: 2.5, distance: 6, night: true });
  }, 'Придорожный алтарь Эрис');
  // The lone oak on the ridge: visible from the Crossroads, a bench, a carved stone, a small cache.
  const oak = POI.hill_oak;
  W.group('hill_oak', { x: oak.x, z: oak.z }, (r) => {
    tree(W, oak.x, oak.z - 2, 1.9, r, 'oak');
    bench(W, new Frame(W, oak.x + 3, H(W, oak.x + 3, oak.z + 1.5), oak.z + 1.5, -0.9), 0, 0, 0);
    W.addSign(sp(oak.x - 2.5, oak.z + 2), 0.6, ['Камень на гребне:', '«Отсюда видно и Аксель, и Ольховку.', 'Кто дошёл до дуба — прошёл полпути.»']);
    W.addChest(sp(oak.x + 1.2, oak.z - 4.2), 2.6, 'hill_oak');
  }, 'Одинокий дуб');
  // The ford: gravel, stepping stones downstream, depth posts.
  const fd = POI.alder_ford;
  W.group('alder_ford', { x: fd.x, z: fd.z }, (r) => {
    for (let i = -4; i <= 4; i++) {
      const x = fd.x + i * 1.6, z = fd.z + 4.2 + (r() - 0.5) * 0.4;
      new Frame(W, x, H(W, x, z) - 0.15, z, r() * 6).box(0.9, 0.35, 0.8, 0, 0, 0, 'stone', { tint: 0x9a948a, detail: true });
    }
    for (const s of [-1, 1]) {
      const x = fd.x + s * 8, z = fd.z - 2.8;
      new Frame(W, x, H(W, x, z), z, 0).box(0.18, 1.6, 0.18, 0, -0.2, 0, 'log', { collide: false });
    }
    W.spot('alder_ford', sp(fd.x, fd.z), Math.PI / 2);
  }, 'Тележный брод');
  // Boundary stone at the fork to the gorge trail.
  const bs = POI.boundary_stone;
  W.group('boundary_stone', { x: bs.x, z: bs.z }, (r) => {
    const F = new Frame(W, bs.x, H(W, bs.x, bs.z), bs.z, 0.3);
    F.box(0.9, 2.2, 0.5, 0, -0.2, 0, 'stone', { tint: 0x8e8a80 });
    F.box(0.6, 0.5, 0.06, 0, 1.2, 0.27, 'stoneDark', { collide: false });
    rock(W, bs.x + 2.5, bs.z + 1, 0.8, r);
  }, 'Межевой камень');
  // Tar burners' clearing in the pines (optional, no enemies).
  const tc = POI.tar_camp;
  W.group('tar_camp', { x: tc.x, z: tc.z }, (r) => {
    const F = new Frame(W, tc.x, H(W, tc.x, tc.z), tc.z, 0.5);
    F.cyl(1.4, 1.6, 0, 0, 0, 'stone', { seg: 10, tint: 0x6a6058 });
    F.cyl(0.5, 1.2, 0, 1.6, 0, 'stoneDark', { seg: 8 });
    prop(F, 'nature/log_stackLarge', 4, 0, 1, { s: 3 });
    for (let i = 0; i < 3; i++) barrel(W, F, -3 + i * 0.9, 2.5);
    campfire(W, tc.x - 5, tc.z + 3);
    W.addChest(F.at(-3, 0, -2.5), 0.5, 'tar_camp');
  }, 'Поляна смолокуров');
  // Reed pond with a pier, a boat and the fisher's hut.
  const pond = LAKES.find((l) => l.id === 'reed_pond');
  W.group('reed_pond', { x: pond.center.x, z: pond.center.z }, (r) => {
    const px = pond.center.x - 4, pz0 = pond.center.z - pond.radius + 1;
    for (let i = 0; i < 7; i++) {
      const z = pz0 + i * 1.6;
      W.box(2.0, 0.12, 1.5, px, pond.level + 0.35, z, 'plank', 0);
      if (i % 2 === 0) for (const s of [-1, 1]) W.cylinder(0.1, 0.1, 1.6, px + s, pond.level - 1.0, z, 'log', 5, { collide: false });
    }
    W.addChest(new THREE.Vector3(px, pond.level + 0.47, pz0 + 6 * 1.6), Math.PI, 'reed_pond');
    const B = new Frame(W, px + 3, pond.level + 0.05, pz0 + 6, 0.3);
    B.box(1.2, 0.35, 3.2, 0, 0, 0, 'plank', { tint: 0x7a5a3a, collide: false });
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, rr = pond.radius * (0.95 + r() * 0.2);
      const x = pond.center.x + Math.cos(a) * rr, z = pond.center.z + Math.sin(a) * rr;
      new Frame(W, x, H(W, x, z), z, r() * 6).kit('nature/grass_large', 0, 0, 0, { s: 2.2, collide: false, castShadow: false, detail: true });
    }
  }, 'Камышовый пруд');
  const fh = POI.fisher_hut;
  W.group('fisher_hut', { x: fh.x, z: fh.z, rot: Math.PI }, (r) => {
    const h = house(W, { x: fh.x, z: fh.z, rot: Math.PI, w: 5, d: 4, floors: 1, style: 'wood', roofTint: ROOF_COLORS.straw, chimney: true, kind: 'house' }, r);
    prop(h.frame, 'survival/workbench', 3.4, 0, 1, { s: 2.2 });
    barrel(W, h.frame, -3, 1.4);
  }, 'Хижина рыбака');
  // Apiary and orchard on the village approach.
  const ap = POI.apiary;
  W.group('apiary', { x: ap.x, z: ap.z }, (r) => {
    for (let i = 0; i < 9; i++) {
      const x = ap.x + (i % 3) * 2.4 - 2.4, z = ap.z + Math.floor(i / 3) * 2.4 - 2.4;
      const F = new Frame(W, x, H(W, x, z), z, r() * 0.4);
      F.box(0.7, 0.4, 0.7, 0, 0, 0, 'plank', { tint: 0xc8a060 });
      F.box(0.75, 0.25, 0.75, 0, 0.4, 0, 'plank', { tint: 0xd8b070 });
      F.box(0.8, 0.08, 0.8, 0, 0.65, 0, 'roof', { tint: 0x7a5a3a });
    }
    for (let i = 0; i < 12; i++) {
      const x = 644 + (i % 4) * 12 + (r() - 0.5) * 3, z = -186 + Math.floor(i / 4) * 9 + (r() - 0.5) * 3;
      if (Math.hypot(x - ap.x, z - ap.z) < 5) continue;
      tree(W, x, z, 0.7 + r() * 0.3, r, r() < 0.5 ? 'oak' : 'birch');
    }
  }, 'Пасека и сад');
  // Village gate: two posts and a board over the road.
  const vg = POI.village_gate;
  W.group('village_gate', { x: vg.x, z: vg.z, rot: Math.PI / 2 - 0.18 }, () => {
    const F = new Frame(W, vg.x, H(W, vg.x, vg.z), vg.z, Math.PI / 2 - 0.18);
    for (const s of [-1, 1]) F.box(0.35, 4.2, 0.35, s * 3.6, 0, 0, 'log', { tint: 0x6a4a30 });
    F.box(7.8, 0.3, 0.4, 0, 4.0, 0, 'log', { tint: 0x6a4a30, collide: false });
    F.box(3.2, 0.8, 0.12, 0, 3.2, 0, 'plank', { tint: 0xb08a5a, collide: false });
    W.addSign(F.at(4.6, 0, 0.8), Math.PI / 2 - 0.18, ['Деревня Ольховка', '«Добро пожаловать, путник!»']);
  }, 'Ворота Ольховки');
}

/** Farmstead across the river: a cottage, a fenced vegetable patch, a cart. */
function eastFarm(W, rng) {
  const c = POI.east_farm;
  const h = house(W, { x: c.x, z: c.z, rot: 0.2, w: 7, d: 6, floors: 1, style: 'wood', roofTint: ROOF_COLORS.straw, chimney: true, kind: 'farmhouse', vines: 1 }, rng);
  const F = h.frame;
  fence(W, [F.at(-4, 0, 6), F.at(-14, 0, 6), F.at(-14, 0, 16), F.at(-4, 0, 16), F.at(-4, 0, 9)].map((p) => [p.x, p.z]), { tint: 0x9a7a50 });
  for (let i = 0; i < 12; i++) {
    const p = F.at(-12 + (i % 4) * 2.4, 0, 8 + Math.floor(i / 4) * 2.6);
    new Frame(W, p.x, H(W, p.x, p.z) - 0.04, p.z, rng() * 6).kit('food/cabbage', 0, 0, 0, { s: 1.6, collide: false, castShadow: false });
  }
  wagon(W, ...lpos(F, 5, 4), 0.2 + 1.4, 0xd8c8a0);
  haystack(W, ...lpos(F, 6, -2), 0.8);
}
const lpos = (F, lx, lz) => { const p = F.at(lx, 0, lz); return [p.x, p.z]; };

/** The Crossroads: the roadside inn «Подкова», a well, a little shrine of Eris, the trader's pitch. */
function crossroads(W, rng) {
  const c = REGION.crossroads.center;
  const ip = POI.crossroads_inn;
  const inn = house(W, { x: ip.x, z: ip.z, rot: -0.3, w: 11, d: 8, floors: 2, style: 'wood', roofTint: ROOF_COLORS.brown, chimney: true, kind: 'inn', jetty: 0.3, flowers: 0.5 }, rng);
  const F = inn.frame;
  F.box(0.08, 0.08, 1.4, 3.5, 3.4, 4.7, 'metal', { collide: false });
  F.put(new THREE.TorusGeometry(0.55, 0.1, 6, 14, Math.PI * 1.4), 1, 1, 1, 3.5, 2.5, 5.3, 'metal', { collide: false, rz: -Math.PI * 0.2 }); // horseshoe sign
  for (let i = 0; i < 2; i++) {
    const T = F.sub(-3 + i * 4, 0, 7.2);
    T.cyl(0.6, 0.06, 0, 0.74, 0, 'plank', { seg: 10, tint: 0x8a6440 });
    T.cyl(0.08, 0.74, 0, 0, 0, 'timber', { seg: 6, tint: 0x4a3020 });
  }
  W.spot('crossroads_inn', inn.door, -0.3);
  well(W, c.x - 10, c.z + 10);
  // Shrine of Eris: a stone niche with a small statue and candles.
  const S = new Frame(W, c.x + 12, H(W, c.x + 12, c.z + 14), c.z + 14, Math.PI + 0.4);
  S.box(1.6, 2.6, 1.0, 0, 0, 0, 'stone', { tint: 0xc8c0b0 });
  S.box(2.0, 0.3, 1.3, 0, 2.6, 0, 'roof', { tint: 0x3a6a8a });
  S.cyl(0.18, 0.9, 0, 1.0, 0.45, 'stone', { seg: 8, tint: 0xf0ece4, collide: false });
  S.sphere(0.14, 0, 2.0, 0.45, 'stone', { tint: 0xf0ece4, collide: false });
  prop(S, 'graveyard/candle-multiple', 0, 0, 0.9, { s: 1.0, collide: false });
  W.addLightSource(S.at(0, 1.2, 1.0), { color: 0xffd090, intensity: 3, distance: 7, night: true });
  lamp(W, new THREE.Vector3(c.x - 6, H(W, c.x - 6, c.z - 6), c.z - 6), 0);
  bench(W, new Frame(W, c.x + 4, H(W, c.x + 4, c.z + 8), c.z + 8, 0.4), 0, 0, 0);
  W.addFootprint(c.x, c.z, 20, 20, 0, 'yard');
}

/** Woodcutter's hut at the edge of the Alder wood. */
function woodcutter(W, rng) {
  const p = POI.woodcutter;
  const h = house(W, { x: p.x, z: p.z, rot: 1.2, w: 6, d: 5, floors: 1, style: 'wood', roofTint: ROOF_COLORS.brown, chimney: true, kind: 'house', vines: 1 }, rng);
  const F = h.frame;
  prop(F, 'nature/log_stackLarge', 4.5, 0, 1, { s: 3 });
  prop(F, 'survival/workbench', -4, 0, 3, { s: 2.6 });
  for (let i = 0; i < 3; i++) prop(F, 'nature/stump_round', 2 + i * 1.6, 0, 4.5, { s: 2, collide: 'box' });
  // KayKit ResourceBits: sawn planks and a log pile beside the hut.
  if (W.kits.has('bits/Wood_Planks_Stack_Medium')) {
    const at = (lx, lz, ry) => { const q = F.at(lx, 0, lz); return new Frame(W, q.x, H(W, q.x, q.z) - 0.04, q.z, F.rot + ry); };
    prop(at(-5.0, -0.6, 0.2), 'bits/Wood_Planks_Stack_Medium', 0, 0, 0, { s: 1 });
    prop(at(-5.2, 1.6, -0.3), 'bits/Wood_Log_A', 0, 0, 0, { s: 1.1, collide: false });
  }
}

/** Graveyard beside the chapel (Kenney graveyard kit): iron fence, rows of graves, a family crypt. */
function churchyard(W, F, rng) {
  // Chapel frame: front (+z local) faces south; the yard lies on its east side (local -x).
  const Y = F.sub(-9, 0, 0);
  const S = 2.2;
  const hw = 4.5, hd = 6.5;
  const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [1.2, hd]];
  const corner = (lx, lz) => { const p = Y.at(lx, 0, lz); return [p.x, p.z]; };
  // Iron fence (modules on the tile's edge, like the town fence).
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = corner(...pts[i]), [bx, bz] = corner(...pts[i + 1]);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / S)), rot = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      new Frame(W, x, H(W, x, z) - 0.05, z, rot).kit('graveyard/iron-fence', 0, 0, 0, { sx: S, sy: 2.2, sz: len / n, ry: Math.PI / 2, collide: 'box' });
    }
  }
  const stones = ['gravestone-cross', 'gravestone-round', 'gravestone-bevel', 'gravestone-decorative', 'gravestone-roof', 'gravestone-wide', 'gravestone-broken', 'cross-wood'];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
    const lx = -3 + i * 2, lz = -4.5 + r * 2.6;
    const G = Y.sub(lx, 0, lz, Math.PI);
    const p = G.at(0, 0, 0);
    const g = new Frame(W, p.x, H(W, p.x, p.z) - 0.03, p.z, G.rot + (rng() - 0.5) * 0.15);
    prop(g, 'graveyard/' + stones[Math.floor(rng() * stones.length)], 0, 0, 0, { s: 1.4 });
    if (rng() < 0.5) prop(g, 'graveyard/grave', 0, 0, -0.9, { s: 1.3, collide: false });
  }
  const cp = Y.at(2.5, 0, 5);
  const CF = new Frame(W, cp.x, H(W, cp.x, cp.z) - 0.05, cp.z, F.rot);
  CF.kit('graveyard/crypt-small', 0, 0, 0, { s: 2.6 });
  CF.kit('graveyard/crypt-small-roof', 0, 2.6, 0, { s: 2.6, collide: false });
  const lp = Y.at(-3.6, 0, 5.6);
  prop(new Frame(W, lp.x, H(W, lp.x, lp.z), lp.z, 0), 'graveyard/lightpost-single', 0, 0, 0, { s: 2.2 });
  W.addLightSource(new THREE.Vector3(lp.x, H(W, lp.x, lp.z) + 2.3, lp.z), { color: 0xffc070, intensity: 3, distance: 9, night: true });
  W.spot('churchyard', Y.at(0, 0, 0), F.rot);
}

// -----------------------------------------------------------------------------------------
class CampFire {
  constructor(W, pos) {
    this.pos = pos.clone();
    W.addLightSource(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), { color: 0xff8a3a, intensity: 8, distance: 13, always: true, flicker: true });
  }
  update(dt, ctx) {
    const vfx = ctx?.vfx;
    if (!vfx || ctx.playerPos.distanceTo(this.pos) > 60) return;
    if (Math.random() < dt * 60) vfx.emit('brazierFire', this.pos);
    if (Math.random() < dt * 8) vfx.emit('brazierSmoke', this.pos);
    if (Math.random() < dt * 5) vfx.emit('ember', this.pos);
  }
}

export function campfire(W, x, z) {
  const y = H(W, x, z);
  const F = new Frame(W, x, y, z, x * 0.37);
  prop(F, 'nature/campfire_stones', 0, -0.02, 0, { s: 4, collide: false });
  prop(F, 'nature/campfire_logs', 0, 0, 0, { s: 2.6, collide: false });
  W.addUpdatable(new CampFire(W, W.xf(new THREE.Vector3(x, y + 0.15, z))));
  W.addFootprint(x, z, 2.4, 2.4, 0, 'fire');
}

/** Canvas tent (Kenney nature kit); a bedroll in front of the open ones. */
export function tent(W, x, z, rot, tint) {
  const y = H(W, x, z);
  const F = new Frame(W, x, y - 0.05, z, rot);
  const open = (Math.abs(x * 13 + z * 7) % 10) < 6;
  prop(F, open ? 'nature/tent_detailedOpen' : 'nature/tent_detailedClosed', 0, 0, 0, { s: 4.4, tint: tint === 0x5b6a3a ? 0xc8d8b0 : null });
  if (open) prop(F, 'survival/bedroll', 0, 0.02, 2.0, { s: 3.4, collide: false });
  W.addFootprint(x, z, 3.8, 3.8, rot, 'tent');
}

function totem(W, x, z) {
  const y = H(W, x, z);
  const F = new Frame(W, x, y, z, 0);
  F.cyl(0.3, 2.6, 0, -0.2, 0, 'log', { seg: 7 });
  F.box(0.75, 0.55, 0.12, 0, 1.9, 0.25, 'fabric', { collide: false });
  F.box(0.9, 0.12, 0.12, 0, 2.2, 0.25, 'log', { collide: false });
  F.sphere(0.22, 0, 2.55, 0.05, 'bone', { collide: false });
}

function huntersCamp(W, rng) {
  const c = REGION.hunters.center;
  campfire(W, c.x, c.z);
  tent(W, c.x - 5, c.z - 4, 0.4, 0x7b5a3a);
  tent(W, c.x + 5, c.z - 5, -0.6, 0x5b6a3a);
  tent(W, c.x + 6, c.z + 4, 2.4, 0x7b5a3a);
  // Log seats, drying rack with pelts, woodpile.
  for (const [dx, dz, r] of [[-2.4, 1.6, 0.6], [2.4, 1.8, -0.5], [0, -2.6, 0]]) prop(new Frame(W, c.x + dx, H(W, c.x + dx, c.z + dz) - 0.05, c.z + dz, r), 'nature/log_large', 0, 0, 0, { s: 3, ry: Math.PI / 2, collide: false });
  prop(new Frame(W, c.x - 4, H(W, c.x - 4, c.z + 6), c.z + 6, 0.3), 'nature/log_stackLarge', 0, 0, 0, { s: 3 });
  prop(new Frame(W, c.x + 3, H(W, c.x + 3, c.z - 7), c.z - 7, 1.2), 'survival/workbench', 0, 0, 0, { s: 2.6 });
  prop(new Frame(W, c.x - 1, H(W, c.x - 1, c.z + 3.2), c.z + 3.2, 0.2), 'survival/campfire-stand', 0, 0, 0, { s: 3.5, collide: false });
  const R = new Frame(W, c.x - 7, H(W, c.x - 7, c.z + 3), c.z + 3, 0.8);
  for (const s of [-1, 1]) R.box(0.12, 2.0, 0.12, s * 1.3, 0, 0, 'log');
  R.box(2.8, 0.1, 0.1, 0, 1.9, 0, 'log', { collide: false });
  for (let i = 0; i < 3; i++) R.box(0.7, 1.0, 0.04, -0.9 + i * 0.9, 0.85, 0, 'fabric', { collide: false, tint: [0x8a6a4a, 0xa08060, 0x6a5a48][i] });
  for (let i = 0; i < 6; i++) new Frame(W, c.x + 8, H(W, c.x + 8, c.z - 1), c.z - 1 + (i % 3) * 0.3, 0).cyl(0.16, 1.4, 0, 0.16 + Math.floor(i / 3) * 0.3, 0, 'log', { seg: 6, rx: Math.PI / 2, collide: false });
  W.spot('hunters_fire', new THREE.Vector3(c.x + 2, H(W, c.x + 2, c.z), c.z), -Math.PI / 2);
  W.spot('hunter_rann', new THREE.Vector3(c.x - 3, H(W, c.x - 3, c.z - 1), c.z - 1), 0.8);
}

function forestOutpost(W, rng) {
  // A small goblin lookout on the glade trail (the first guild hunt).
  const x = POI.forest_scouts.x, z = POI.forest_scouts.z;
  tent(W, x - 3, z - 3, 0.6, 0x5b6a3a);
  tent(W, x + 4, z + 2, 2.0, 0x7b5a3a);
  totem(W, x, z + 6);
  campfire(W, x + 1, z - 1);
  W.spot('forest_scouts', new THREE.Vector3(x, H(W, x, z), z), 0);
}

function glade(W, rng) {
  const c = REGION.glade.center;
  const y = H(W, c.x, c.z);
  // Ring of standing stones.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const F = new Frame(W, c.x + Math.cos(a) * 7, H(W, c.x + Math.cos(a) * 7, c.z + Math.sin(a) * 7), c.z + Math.sin(a) * 7, -a);
    F.box(1.0, 2.6 + (i % 3) * 0.5, 0.6, 0, -0.3, 0, 'stone', { tint: 0x9aa098 });
    F.box(0.5, 0.5, 0.05, 0, 1.4, 0.31, 'rune', { collide: false, castShadow: false });
  }
  // Ancient stump in the middle with the star shard.
  const S = new Frame(W, c.x, y, c.z, 0);
  S.cyl(1.3, 1.0, 0, -0.1, 0, 'bark', { seg: 10 });
  S.cyl(1.15, 0.05, 0, 0.9, 0, 'plank', { seg: 10, collide: false, tint: 0xc8a878 });
  // Little pond.
  S.cyl(2.4, 0.05, 4.8, 0.02, 3.2, 'water', { seg: 16, collide: false, castShadow: false });
  W.addLightSource(new THREE.Vector3(c.x, y + 1.6, c.z), { color: 0x9fd8ff, intensity: 4, distance: 12, always: true });
  W.addInteractable(new QuestProp({ id: 'glade_shard', name: 'Звёздный осколок', prompt: 'Осмотреть', position: new THREE.Vector3(c.x, y + 1.0, c.z), shape: 'shard' }));
  W.addChest(new THREE.Vector3(c.x - 3.5, H(W, c.x - 3.5, c.z - 4.5), c.z - 4.5), 0.8, 'glade');
  W.spot('glade_center', new THREE.Vector3(c.x + 2.5, y, c.z + 2.5), 0);
  W.addFootprint(c.x, c.z, 6, 6, 0, 'glade');
}

function goblinDen(W, rng) {
  const c = REGION.goblin_den.center;
  const R = 16;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    if (Math.abs(Math.sin(a - 0.15)) < 0.12) continue; // gates east / west
    const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
    const hgt = 2.4 + rng() * 0.8;
    W.cylinder(0.2, 0.24, hgt, x, H(W, x, z) - 0.3, z, 'log', 7);
    W.cylinder(0.01, 0.2, 0.45, x, H(W, x, z) - 0.3 + hgt, z, 'log', 7, { collide: false });
  }
  for (const [dx, dz, r] of [[-6, -5, 0.4], [5, -7, 2.1], [8, 4, 3.6], [-7, 6, 5.1], [-1, 9, 4.5]]) tent(W, c.x + dx, c.z + dz, r, rng() < 0.5 ? 0x7b5a3a : 0x5b6a3a);
  campfire(W, c.x, c.z);
  for (const [dx, dz] of [[-11, -2], [10.5, 9], [0, -12]]) totem(W, c.x + dx, c.z + dz);
  W.addChest(new THREE.Vector3(c.x - 2.5, H(W, c.x - 2.5, c.z + 4.5), c.z + 4.5), 2.8, 'goblin_den');
}

// -----------------------------------------------------------------------------------------
function watchtower(W, rng) {
  const c = REGION.watchtower.center;
  const y = H(W, c.x, c.z);
  const R = 3.8, T = 0.6, top = 10.2;
  const F = new Frame(W, c.x, y, c.z, 0);
  // Walls: 16 segments, one gap (door facing west, towards the trail).
  const seg = 16;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const doorAngle = Math.PI; // -X
    if (Math.abs(Math.atan2(Math.sin(a - doorAngle), Math.cos(a - doorAngle))) < 0.2) {
      F.box(1.6, 2.2, T, Math.cos(a) * (R - T / 2), top - 0.2 + 1.4, Math.sin(a) * (R - T / 2), 'stone', { ry: -a + Math.PI / 2, tint: 0xb0a898 });
      F.box(1.6, top - 2.4, T, Math.cos(a) * (R - T / 2), 2.4, Math.sin(a) * (R - T / 2), 'stone', { ry: -a + Math.PI / 2, tint: 0xb0a898 });
      continue;
    }
    const broken = i === 5 || i === 6; // crumbled top on one side
    const hgt = broken ? top - 1.2 + (i === 6 ? 0.6 : 0) : top + 1.4;
    F.box(2 * Math.PI * R / seg + 0.12, hgt + 0.5, T, Math.cos(a) * (R - T / 2), -0.5, Math.sin(a) * (R - T / 2), 'stone', { ry: -a + Math.PI / 2, tint: 0xb0a898 });
    if (!broken && i % 2 === 0) F.box(0.8, 0.7, T + 0.1, Math.cos(a) * (R - T / 2), top + 0.9, Math.sin(a) * (R - T / 2), 'stone', { ry: -a + Math.PI / 2, collide: false, tint: 0xb0a898 });
  }
  // Spiral stairs around a central column.
  F.cyl(0.7, top, 0, 0, 0, 'stoneDark', { seg: 10 });
  const steps = 34;
  const rise = top / steps;
  for (let k = 0; k < steps; k++) {
    const a = Math.PI + 0.5 + (k / steps) * Math.PI * 3.6;
    const r = (R - T + 0.7) / 2;
    F.box(R - T - 0.75, rise + 0.12, 1.0, Math.cos(a) * r, (k + 1) * rise - 0.12, Math.sin(a) * r, 'stone', { ry: -a, tint: 0x9a9284 });
  }
  // Top floor: a 3/4 disc leaving the stairwell open.
  const lastA = Math.PI + 0.5 + Math.PI * 3.6;
  const floor = new THREE.CylinderGeometry(R - T + 0.05, R - T + 0.05, 0.25, 20, 1, false, lastA + 0.25, Math.PI * 2 - 1.5);
  floor.translate(0, 0.125, 0);
  F.put(floor, 1, 1, 1, 0, top - 0.25, 0, 'plank', { tint: 0x8a6a48 });
  W.addInteractable(new QuestProp({ id: 'tower_logbook', name: 'Журнал дозорного', prompt: 'Прочитать', position: F.at(1.5, top, -1.6), shape: 'book' }));
  W.addChest(F.at(-1.2, top, 1.6), 0.4, 'tower_top');
  W.spot('watchtower_top', F.at(0.5, top, 0.5), 0);
  W.spot('watchtower_door', F.at(-R - 1.5, 0, 0), -Math.PI / 2);
  W.addFootprint(c.x, c.z, R * 2, R * 2, 0, 'tower');
  for (let i = 0; i < 6; i++) rock(W, c.x + Math.cos(i) * (R + 2.5), c.z + Math.sin(i) * (R + 2.5), 0.6 + rng() * 0.7, rng, 'rock');
}

function caveEntrance(W, rng) {
  const x = REGION.cave.center.x, z = REGION.cave.center.z;
  const y = H(W, x, z);
  // The hill rises to the north; the portal faces south (towards the road).
  const P = new Frame(W, x, y, z - 2, 0);
  for (const s of [-1, 1]) P.box(0.45, 3.4, 0.45, s * 1.9, 0, 0, 'log', { tint: 0x6a4a30 });
  P.box(4.5, 0.5, 0.55, 0, 3.3, 0, 'log', { tint: 0x6a4a30 });
  P.box(3.5, 3.3, 0.2, 0, 0, -1.4, 'metal', { collide: true, tint: 0x0a0808 });
  for (const s of [-1, 1]) P.box(0.12, 3.3, 3.0, s * 1.75, 0, -0.9, 'rockDark', { collide: true });
  P.box(3.6, 0.3, 3.0, 0, 3.3, -0.9, 'rockDark');
  // Rails.
  for (const s of [-0.5, 0.5]) P.box(0.08, 0.08, 7, s, 0.02, 2.4, 'metal', { collide: false, castShadow: false });
  for (let i = 0; i < 9; i++) P.box(1.4, 0.06, 0.18, 0, 0, -0.9 + i * 0.8, 'plank', { collide: false, castShadow: false });
  // Mine cart.
  const C = P.sub(0, 0.2, 4.2, 0.1);
  C.box(1.1, 0.7, 1.5, 0, 0.12, 0, 'wood', { tint: 0x6a4a30 });
  for (let i = 0; i < 5; i++) C.sphere(0.25, -0.3 + (i % 3) * 0.3, 0.8, -0.3 + Math.floor(i / 3) * 0.5, 'rock', { collide: false });
  // Boulders framing the entrance.
  for (const [dx, dz, s] of [[-4, -1.5, 2.2], [4.2, -1, 2.4], [-3, -3.4, 2.8], [3.4, -3.6, 2.6], [0, -4.4, 3.2], [-5.5, 1, 1.4], [5.6, 1.4, 1.2]]) rock(W, x + dx, z - 2 + dz, s, rng, 'rockDark');
  lantern(W, P.sub(-2.3, 2.6, 0.4));
  lantern(W, P.sub(2.3, 2.6, 0.4));
  W.addInteractable(new Door({ id: 'cave_door', name: 'Старая шахта', prompt: 'Войти', position: P.at(0, 0, -0.6), target: 'dungeon_entry' }));
  W.spot('cave_mouth', P.at(0, 0, 2.6), Math.PI);
  W.addFootprint(x, z - 2, 9, 6, 0, 'cave');
}

// -----------------------------------------------------------------------------------------
function astrarium(W, rng) {
  const c = REGION.astrarium.center;
  const y = H(W, c.x, c.z);
  const F = new Frame(W, c.x, y, c.z, 0);
  F.cyl(20, 0.6, 0, -0.45, 0, 'stone', { seg: 16, tint: 0xc8c4b8 });
  F.cyl(14, 0.12, 0, 0.15, 0, 'stoneDark', { seg: 16, collide: false, castShadow: false, tint: 0xa8a49a });
  // Broken colonnade.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const h = [7, 3, 7, 1.5, 7, 5, 2, 7, 7, 4, 7, 1, 6, 7][i];
    F.cyl(0.65, h, Math.cos(a) * 17, 0.15, Math.sin(a) * 17, 'stone', { seg: 10, tint: 0xdedad0 });
    if (h >= 7) F.box(1.8, 0.4, 1.8, Math.cos(a) * 17, 0.15 + h, Math.sin(a) * 17, 'stone', { tint: 0xdedad0, ry: -a });
    if (h < 3) F.cyl(0.65, 2.6, Math.cos(a) * 19, 0.6, Math.sin(a) * 19 + 1, 'stone', { seg: 10, tint: 0xdedad0, rz: Math.PI / 2, ry: a, collide: false });
  }
  // Great armillary rings over the dais (the observatory's heart).
  const torus = (r, tube) => new THREE.TorusGeometry(r, tube, 6, 40, Math.PI * 1.6);
  F.put(torus(7, 0.3), 1, 1, 1, 0, 7.5, 0, 'metal', { collide: false, tint: 0xc8a050, ry: 0.3 });
  F.put(torus(6, 0.25), 1, 1, 1, 0, 7.5, 0, 'metal', { collide: false, tint: 0xc8a050, rx: Math.PI / 2, ry: 1.2 });
  F.put(torus(5, 0.2), 1, 1, 1, 0, 7.5, 0, 'metal', { collide: false, tint: 0xc8a050, rx: 0.8, ry: -0.6 });
  F.cyl(4.5, 0.8, 0, 0.15, 0, 'stone', { seg: 16, tint: 0xd8d2c4 });
  for (let i = 0; i < 4; i++) F.box(0.6, 6.5, 0.6, Math.cos(i * 1.57 + 0.78) * 4.2, 0.9, Math.sin(i * 1.57 + 0.78) * 4.2, 'stone', { tint: 0xdedad0, collide: true });
  const circle = createRitualCircle(F.at(0, 0.97, 0), 4.0);
  circle.mesh.material.color.setRGB(0.4, 1.4, 2.6);
  W.addObject(circle.mesh);
  W.addUpdatable(circle);
  W.addLightSource(F.at(0, 2.5, 0), { color: 0x7fd0ff, intensity: 8, distance: 18, always: true });
  // Crystal outcrops (resonance crystals for Roxy's quest).
  [[12, -6], [-11, -9], [3, 13]].forEach(([dx, dz], i) => {
    for (let k = 0; k < 4; k++) {
      const s = 0.6 + rng() * 0.9;
      F.put(new THREE.OctahedronGeometry(1, 0), s * 0.4, s, s * 0.4, dx + (rng() - 0.5) * 1.6, 0.2 + s * 0.6, dz + (rng() - 0.5) * 1.6, 'crystal', { castShadow: false, collide: false, rx: (rng() - 0.5) * 0.6, rz: (rng() - 0.5) * 0.6 });
    }
    W.spot('rift_' + i, F.at(dx, 0.15, dz), 0);
    W.addInteractable(new QuestProp({ id: 'rift_crystal_' + i, name: 'Резонирующий кристалл', prompt: 'Коснуться', position: F.at(dx, 1.0, dz), shape: 'none' }));
  });
  W.spot('astrarium_center', F.at(0, 0.95, 6), Math.PI);
  // A24: the measuring stand of the west gallery (an early blast topples it, the lever puts it back) ...
  F.box(0.5, 2.2, 0.5, -9, 0.15, -14, 'stone', { tint: 0xdedad0 });
  F.box(1.4, 0.12, 0.12, -9, 2.35, -14, 'metal', { collide: false, tint: 0xc8a050 });
  W.spot('astra_lever', F.at(-9, 0.15, -12), 0);
  W.addInteractable(new QuestProp({ id: 'astra_lever', name: 'Измерительная стойка', prompt: 'Поднять стойку рычагом', position: F.at(-9, 1.0, -12), shape: 'none' }));
  // ... and A25: the only sector where the ritual allows a blast, behind the white stone.
  W.spot('astrarium_far', F.at(-16, 0.15, 12), 0);
  F.cyl(1.0, 1.6, -16, 0.15, 12, 'stone', { seg: 7, tint: 0xf4f4f0 });
  const farRing = createRitualCircle(F.at(-16, 0.2, 12), 6);
  farRing.mesh.material.color.setRGB(1.8, 1.8, 1.8);
  W.addObject(farRing.mesh);
  W.addUpdatable(farRing);
  // Roxy's camp just south of the ruins.
  const R = new Frame(W, c.x + 6, H(W, c.x + 6, c.z + 30), c.z + 30, 0.3);
  tent(W, c.x + 9, c.z + 33, 0.3, 0x3a5a8a);
  campfire(W, c.x + 4, c.z + 29);
  for (let i = 0; i < 3; i++) R.box(0.4, 0.12, 0.3, -2.2 + i * 0.45, 0, 1.5, 'cloth', { collide: false, tint: [0x3a5a8a, 0x8a3a3a, 0x4a7a4a][i] });
  W.spot('roxy_camp', R.at(-1.5, 0, 0.5), Math.PI);
  W.addFootprint(c.x, c.z, 40, 40, 0, 'ruins');
}

/** A27: the first camp together on the way back from the Astrarium: a fire and three logs by the north road. */
function returnCamp(W) {
  const x = -318, z = -196, y = H(W, x, z);
  campfire(W, x, z);
  const F = new Frame(W, x, y, z, 0.4);
  for (const a of [0.6, 2.2, 3.9]) F.cyl(0.22, 1.2, Math.cos(a) * 2.1, 0.25, Math.sin(a) * 2.1, 'log', { seg: 8, rz: Math.PI / 2, ry: a + Math.PI / 2, collide: false });
  W.spot('return_camp', new THREE.Vector3(x, y, z), 0);
  W.addInteractable(new QuestProp({ id: 'return_camp', name: 'Костёр', prompt: 'Присесть к огню', position: new THREE.Vector3(x, y + 0.6, z), shape: 'none' }));
}

function mistLake(W, rng) {
  const L = LAKES[0];
  const isl = L.island;
  const iy = H(W, isl.x, isl.z);
  const tx = isl.x + 1.5, tz = isl.z - 1;
  W.cylinder(2.6, 2.9, 7.5, tx, iy - 0.3, tz, 'stone', 18);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    if (i === 3) continue;
    W.box(0.7, 0.9, 0.7, tx + Math.cos(a) * 2.45, iy + 7.2, tz + Math.sin(a) * 2.45, 'stoneDark', a);
  }
  W.addFootprint(tx, tz, 6, 6, 0, 'tower');
  // Pier from the west shore.
  const px = L.center.x - L.radius + 2, pz = L.center.z - 4;
  for (let i = 0; i < 9; i++) {
    const x = px + i * 1.6;
    W.box(1.5, 0.12, 2.2, x, L.level + 0.35, pz, 'plank', 0);
    if (i % 2 === 0) for (const s of [-1, 1]) W.cylinder(0.1, 0.1, 1.6, x, L.level - 1.0, pz + s, 'log', 5, { collide: false });
  }
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = L.radius * (1.06 + rng() * 0.25);
    const x = L.center.x + Math.cos(a) * r, z = L.center.z + Math.sin(a) * r;
    const s = 0.4 + rng() * 0.8;
    new Frame(W, x, H(W, x, z), z, rng() * 6).put(new THREE.OctahedronGeometry(1, 0), s * 0.4, s, s * 0.4, 0, s * 0.3, 0, 'crystal', { castShadow: false, rx: (rng() - 0.5) * 0.6 });
  }
  W.addChest(new THREE.Vector3(isl.x - 3.2, iy, isl.z + 2.2), 0.6, 'mist_lake');
}

function crimsonGorge(W, rng) {
  const c = REGION.crimson_gorge.center;
  for (let k = 0; k < 18; k++) {
    const a = rng() * Math.PI * 2, r = 14 + rng() * 26;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const px = x + (rng() - 0.5) * 2.4, pz = z + (rng() - 0.5) * 2.4;
      W.cylinder(0.45, 0.5, 1 + rng() * 4.5, px, H(W, px, pz) - 0.3, pz, 'basalt', 6);
    }
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 8 + rng() * 34;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    const s = 0.6 + rng() * 1.8;
    new Frame(W, x, H(W, x, z), z, rng() * 6).cone(s * 0.45, s * 2, 0, 0, 0, 'obsidian', { seg: 6, rx: (rng() - 0.5) * 0.5 });
  }
  const ax = c.x + 8, az = c.z + 3;
  const ay = H(W, ax, az);
  W.cylinder(7, 7.3, 0.6, ax, ay - 0.45, az, 'basalt', 24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    W.box(0.8, 3.4, 0.8, ax + Math.cos(a) * 6.3, ay, az + Math.sin(a) * 6.3, 'obsidian', a);
  }
  const rc = createRitualCircle(new THREE.Vector3(ax, ay + 0.17, az), 5.2);
  W.addObject(rc.mesh);
  W.addUpdatable(rc);
  W.addChest(new THREE.Vector3(ax, ay + 0.15, az - 4.8), 0, 'crimson_gorge');
  W.addFootprint(ax, az, 15, 15, 0, 'arena');
}

function oldMines(W, rng) {
  const c = REGION.old_mines.center;
  for (const [dx, dz, rot] of [[-10, -6, 0.3], [8, -10, -0.4], [-12, 9, 2.8], [10, 8, 3.4]]) {
    house(W, { x: c.x + dx, z: c.z + dz, rot, w: 6, d: 5, floors: 1, roofTint: 0x5a4a40, wallTint: 0xb8b0a0, chimney: false, kind: 'ruin' }, rng);
  }
  const P = new Frame(W, c.x, H(W, c.x, c.z - 18), c.z - 18, 0);
  for (const s of [-1, 1]) P.box(0.45, 3.4, 0.45, s * 1.9, 0, 0, 'log');
  P.box(4.5, 0.5, 0.55, 0, 3.3, 0, 'log');
  for (let i = 0; i < 5; i++) P.box(4, 0.25, 0.1, 0, 0.5 + i * 0.6, 0.3, 'plank', { rz: (rng() - 0.5) * 0.3 });
  for (let i = 0; i < 8; i++) rock(W, c.x + (rng() - 0.5) * 30, c.z - 22 + (rng() - 0.5) * 6, 1 + rng() * 2, rng, 'rockDark');
  W.addChest(new THREE.Vector3(c.x + 2, H(W, c.x + 2, c.z + 2), c.z + 2), 1.2, 'old_mines');
  // KayKit ResourceBits at the adit: ore piles and a stack of mine timber (after every rng use).
  if (W.kits.has('bits/Iron_Nuggets')) {
    const at = (dx, dz, ry) => { const x = c.x + dx, z = c.z + dz; return new Frame(W, x, H(W, x, z) - 0.04, z, ry); };
    prop(at(-4.2, -15.5, 0.4), 'bits/Iron_Nuggets', 0, 0, 0, { s: 1.5, collide: false });
    prop(at(3.8, -16.2, -0.5), 'bits/Gold_Nuggets', 0, 0, 0, { s: 1.0, collide: false });
    prop(at(-6.5, -14, 1.2), 'bits/Stone_Chunks_Small', 0, 0, 0, { s: 1.4 });
    prop(at(6.5, -13, 0.3), 'bits/Wood_Planks_Stack_Small', 0, 0, 0, { s: 1 });
  }
}

function eastPass(W, rng) {
  const c = REGION.east_pass.center;
  for (let i = 0; i < 16; i++) rock(W, c.x + 4 + (rng() - 0.5) * 10, c.z + (rng() - 0.5) * 14, 1.5 + rng() * 2.5, rng, 'rock');
  W.addSign(new THREE.Vector3(c.x - 8, 0, c.z + 3), Math.PI / 2, ['Перевал закрыт: камнепад. Караваны ждут, пока гильдия расчистит дорогу.']);
  // Chapter 6: the stone gate of the relay post (build/Relay.js) at the foot of the ridge, Tobias' waiting place, the camp.
  const gx = c.x + 12, gz = c.z - 2, gy = H(W, gx, gz);
  const G = new Frame(W, gx, gy, gz, 0);
  for (const s of [-1, 1]) {
    G.box(1.2, 6, 1.2, 0, 0, s * 3.4, 'stoneDark', { tint: 0x8a94a0 });
    G.box(1.5, 0.4, 1.5, 0, 6, s * 3.4, 'stone', { tint: 0x9aa4b0 });
  }
  G.box(1.4, 0.9, 8.6, 0, 6.4, 0, 'stoneDark', { tint: 0x8a94a0 });
  G.box(0.6, 4.6, 5.6, 1.4, 0, 0, 'stoneDark', { tint: 0x6a7480 });
  W.spot('relay_gate_out', new THREE.Vector3(gx - 4, gy, gz), -Math.PI / 2);
  W.addInteractable(new Door({ id: 'relay_gate', name: 'Ворота ретранслятора', prompt: 'Войти на пост', position: new THREE.Vector3(gx + 0.6, gy, gz), target: 'relay_in', rotY: Math.PI / 2 }));
  W.spot('relay_tobias', new THREE.Vector3(c.x - 3, H(W, c.x - 3, c.z + 6), c.z + 6), Math.PI / 2);
  W.spot('relay_dan_out', new THREE.Vector3(c.x - 1, H(W, c.x - 1, c.z + 8), c.z + 8), Math.PI);
  W.spot('relay_osa_out', new THREE.Vector3(c.x - 5, H(W, c.x - 5, c.z + 7.5), c.z + 7.5), Math.PI);
  const kx = c.x - 4, kz = c.z + 10, ky = H(W, kx, kz);
  campfire(W, kx, kz);
  const K = new Frame(W, kx, ky, kz, 0.3);
  for (const a of [0.6, 2.2, 3.9]) K.cyl(0.22, 1.2, Math.cos(a) * 2.1, 0.25, Math.sin(a) * 2.1, 'log', { seg: 8, rz: Math.PI / 2, ry: a + Math.PI / 2, collide: false });
  W.spot('relay_camp', new THREE.Vector3(kx, ky, kz), 0);
  W.addInteractable(new QuestProp({ id: 'relay_camp', name: 'Костёр', prompt: 'Присесть к огню', position: new THREE.Vector3(kx, ky + 0.6, kz), shape: 'none' }));
}
