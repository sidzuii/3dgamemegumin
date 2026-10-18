import * as THREE from 'three';
import { Door } from '../Interactables.js';

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _id = new THREE.Matrix4();

/** The way in: before the first entry the spot inside is moved to the nearest free floor (a shelf or a counter by the door). */
class EntryDoor extends Door {
  constructor(o, W, inward) {
    super(o);
    this.W = W;
    this.inward = inward;
  }

  interact(game) {
    const sp = game.world.npcSpots[this.target], bvh = game.world.collider?.geometry?.boundsTree;
    if (sp && bvh && !this._fixed) {
      this._fixed = true;
      const n = this.inward, side = _v.set(-n.z, 0, n.x).clone(), base = sp.pos.clone();
      const free = (p) => {
        _box.min.set(p.x - 0.4, p.y + 0.3, p.z - 0.4);
        _box.max.set(p.x + 0.4, p.y + 1.7, p.z + 0.4);
        return !bvh.intersectsBox(_box, _id);
      };
      search: for (const a of [0, 0.4, 0.8, 1.2, 1.6]) {
        for (const b of [0, 0.5, -0.5, 1.0, -1.0]) {
          const p = base.clone().addScaledVector(n, a).addScaledVector(side, b);
          if (free(p)) { sp.pos.copy(p); break search; }
        }
      }
    }
    super.interact(game);
  }
}

/**
 * A closed entrance of a walk-in building (house({ entrance: 'arch', closed: { id, name } }), Kit.js): the leaf stands shut in the
 * archway and the player goes in and out with E — two Doors (game.travel with its fade) to the spot just inside `<id>_inside` and
 * the one on the street `<id>_outside`. The interior stays where it is (story spots, shopkeepers and their schedules unchanged).
 * The doorway is still open in the static collision, so the townsfolk's NavGrids and Roxy pass through it: the leaf swings open
 * while one of them is close. Only the player is held back, by a dynamic cylinder (CharacterController._resolveDynamic).
 *
 *   T: the frame of the doorway tile (its origin on the wall plane, +z = the street); model, sx, sy: the leaf as the closed houses
 *   place it (origin at -0.5 sx).
 */
export function closedEntrance(W, T, model, sx, sy, { id, name }) {
  if (W._mute) return;
  const b = W.kits.box(model);
  const hinge = -0.5 * sx + b.min.x * sx; // the leaf's left edge
  const leaf = new THREE.Group();
  const body = new THREE.Group();
  body.position.x = -b.min.x * sx;
  body.scale.set(sx, sy, 1);
  for (const p of W.kits.get(model)) {
    const m = new THREE.Mesh(p.geometry, W.mats[p.mat]);
    m.castShadow = true;
    m.receiveShadow = true;
    body.add(m);
  }
  leaf.add(body);
  // the camera stops at the shut leaf (it is not in the static collider: the doorway stays open for the townsfolk)
  const bw = (b.max.x - b.min.x) * sx, bh = (b.max.y - b.min.y) * sy;
  const block = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.16), new THREE.MeshBasicMaterial());
  block.position.set(bw / 2, b.min.y * sy + bh / 2, 0);
  block.visible = false;
  leaf.add(block);
  (W.cameraBlockers ||= []).push(block);
  leaf.position.copy(T.at(hinge, 0, 0));
  leaf.rotation.y = T.rot;
  leaf.name = 'Дверь: ' + name;
  W.addObject(leaf); // (with the group's move of the map editor)
  const yaw0 = leaf.rotation.y;
  // the doorway in world space (after the editor's move)
  const mid = W.xf(T.at(0, 0, 0));
  const c = { x: mid.x, y: mid.y - 0.3, z: mid.z, r: 0.95, h: 3, enabled: true, entrance: id };
  W.dynamicColliders.push(c);
  const dyaw = T.rot + (W._D ? W._group.dyaw : 0);
  const out = new THREE.Vector3(Math.sin(dyaw), 0, Math.cos(dyaw)); // towards the street
  const door = {
    id, leaf, open: 0,
    update(dt, ctx) {
      const cam = ctx.camera?.position ?? ctx.playerPos;
      const near = cam && cam.distanceToSquared(mid) < 70 * 70;
      leaf.visible = near;
      if (!near) return;
      // someone of the townsfolk (or Roxy) in the doorway: open it
      let want = 0;
      for (const n of W.game?.npcs?.list ?? []) {
        if (!n.visible) continue;
        const p = n.position;
        if (Math.abs(p.x - mid.x) < 2.4 && Math.abs(p.z - mid.z) < 2.4 && _v.subVectors(p, mid).setY(0).length() < 2.2) { want = 1; break; }
      }
      door.open += (want - door.open) * Math.min(1, dt * (want ? 6 : 3));
      leaf.rotation.y = yaw0 + door.open * 1.75; // swings in
    },
  };
  W.updatables.push(door);
  // the two sides
  W.spot(id + '_inside', T.at(0, 0.04, -1.7), T.rot + Math.PI);
  W.spot(id + '_outside', T.at(0, -0.3, 1.9), T.rot);
  const inward = out.clone().negate();
  W.addInteractable(new EntryDoor({ id: id + '_enter', name, prompt: 'Войти', position: T.at(0, 0, 0.45), target: id + '_inside', rotY: T.rot }, W, inward));
  W.addInteractable(new Door({ id: id + '_exit', name: 'На улицу', prompt: 'Выйти', position: T.at(0, 0, -0.75), target: id + '_outside', rotY: T.rot }));
  (W.entrances ||= []).push({ id, name, mid, out, collider: c, door });
}
