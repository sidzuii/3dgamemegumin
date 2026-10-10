import * as THREE from 'three';

/**
 * Finds the thing the player is aiming at (world props, NPCs, resource nodes):
 *  1. Ray from the camera through the crosshair against registered interaction meshes,
 *     rejected if world geometry is in front or it is out of reach.
 *  2. Fallback: the nearest interactable in front of the character within reach.
 * E triggers `interact(game)`. Things register themselves (`register`), so NPCs and
 * gathering nodes created after the world work the same way as chests and signs.
 */
const REACH = 2.7;
const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _toObj = new THREE.Vector3();

export class Interaction {
  constructor(game) {
    this.game = game;
    this.focused = null;
    this.items = [];
    this.targets = [];
    for (const it of game.world.interactables) this.register(it);
  }

  register(it) {
    if (!it || this.items.includes(it)) return;
    this.items.push(it);
    for (const m of it.meshes || []) {
      m.userData.interactable = it;
      this.targets.push(m);
    }
  }

  _visible(it) {
    for (let o = it.root; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  update() {
    const g = this.game;
    const player = g.player;
    let found = null;

    if (player.action === 'none' && player.hp > 0) {
      const cam = g.camera;
      cam.getWorldDirection(_dir);
      _ray.set(cam.position, _dir);
      _ray.far = 14;
      const hits = _ray.intersectObjects(this.targets, false);
      for (const h of hits) {
        const it = h.object.userData.interactable;
        if (!it || !this._visible(it)) continue;
        const reach = Math.hypot(h.point.x - player.position.x, h.point.z - player.position.z);
        if (reach >= REACH + (it.isNPC ? 0.6 : 0)) break;
        const wall = g.world.raycast(cam.position, _dir, h.distance);
        if (!wall || wall.distance > h.distance - 0.35) found = it;
        break;
      }
      if (!found) {
        let best = Infinity;
        const yaw = player.controller.yaw;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        for (const it of this.items) {
          if (!this._visible(it)) continue;
          it.root.getWorldPosition(_p);
          _toObj.set(_p.x - player.position.x, 0, _p.z - player.position.z);
          const d = _toObj.length();
          if (d > REACH * 0.9 || Math.abs(_p.y - player.position.y) > 2) continue;
          const facing = d > 1e-3 ? (_toObj.x * fx + _toObj.z * fz) / d : 1;
          if (facing < 0.25) continue;
          const score = d - facing + (it.canInteract() ? 0 : 1.5);
          if (score < best) {
            best = score;
            found = it;
          }
        }
      }
    }

    if (found !== this.focused) {
      this.focused?.setHighlight?.(false);
      found?.setHighlight?.(true);
      this.focused = found;
    }

    const available = found && found.canInteract();
    g.hud.setInteract(found ? found.prompt : null, found ? found.name : '', !!available);

    if (found && available && g.input.wasPressed('KeyE')) {
      found.interact(g);
      g.hud.pulseInteract();
    }
  }
}
