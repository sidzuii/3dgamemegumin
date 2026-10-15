import * as THREE from 'three';
import { damp } from '../core/math.js';
import { CHEST_LOOT } from '../data/items.js';

/**
 * Interactable objects. Each exposes:
 *   root, name, prompt, meshes (raycast targets), collision (world-space geometries),
 *   canInteract(), interact(game), setHighlight(on), update(dt, ctx)
 *
 * Highlight = shader-injected warm rim glow + emissive pulse on the object's own materials.
 */

const HL_COLOR = new THREE.Color(1.0, 0.72, 0.32);

function highlightable(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHighlight = uniforms.uHighlight;
    shader.uniforms.uHLColor = uniforms.uHLColor;
    shader.fragmentShader =
      'uniform float uHighlight;\nuniform vec3 uHLColor;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float ndv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 2.0);
          totalEmissiveRadiance += uHLColor * uHighlight * (0.12 + rim * 1.6);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'hl';
  return material;
}

class Interactable {
  constructor(name, prompt) {
    this.name = name;
    this.prompt = prompt;
    this.root = new THREE.Group();
    this.root.name = 'Interactable:' + name;
    this.meshes = [];
    this.collision = [];
    this.uniforms = { uHighlight: { value: 0 }, uHLColor: { value: HL_COLOR.clone() } };
    this.highlighted = false;
    this._hl = 0;
    this._time = Math.random() * 10;
  }

  mat(params) {
    return highlightable(new THREE.MeshStandardMaterial(params), this.uniforms);
  }

  addMesh(geometry, material, parent = this.root, { collide = false, cast = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.userData.interactable = this;
    parent.add(m);
    this.meshes.push(m);
    if (collide) this._collideLater = (this._collideLater || []).concat(m);
    return m;
  }

  /** Bake collision geometry in world space (call after root is positioned). */
  bakeCollision() {
    this.root.updateMatrixWorld(true);
    for (const m of this._collideLater || []) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      this.collision.push(g);
    }
  }

  canInteract() { return true; }
  setHighlight(on) { this.highlighted = on; }
  interactionPoint(target) { return this.root.getWorldPosition(target).add(_up1); }

  update(dt) {
    this._time += dt;
    const target = this.highlighted ? 0.75 + Math.sin(this._time * 6) * 0.25 : 0;
    this._hl = damp(this._hl, target, 14, dt);
    this.uniforms.uHighlight.value = this._hl;
  }
}
const _up1 = new THREE.Vector3(0, 0.6, 0);
const _tmp = new THREE.Vector3();

// -----------------------------------------------------------------------------
export class HealingCrystal extends Interactable {
  constructor(position) {
    super('Кристалл исцеления', 'Исцелиться');
    this.root.position.copy(position);
    this.cooldown = 0;
    const stone = this.mat({ color: 0x9a9286, roughness: 0.9 });
    this.addMesh(new THREE.CylinderGeometry(0.45, 0.6, 0.7, 10).translate(0, 0.35, 0), stone, this.root, { collide: true });
    this.addMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10).translate(0, 0.76, 0), stone);
    this.crystalMat = this.mat({
      color: 0x8ff3e0,
      emissive: new THREE.Color(0.2, 1.4, 1.1),
      emissiveIntensity: 1,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });
    this.crystal = this.addMesh(new THREE.OctahedronGeometry(0.28, 0).scale(1, 1.9, 1), this.crystalMat, this.root, { cast: false });
    this.crystal.position.y = 1.45;
    this.light = new THREE.PointLight(0x7fffe0, 2.2, 7, 2);
    this.light.position.y = 1.45;
    this.root.add(this.light);
    this.bakeCollision();
  }

  canInteract() { return this.cooldown <= 0; }

  interact(game) {
    if (this.cooldown > 0) return;
    this.cooldown = 10;
    game.player.heal(100);
    game.player.restoreStamina(100);
    const p = this.crystal.getWorldPosition(_tmp);
    game.vfx.burst('heal', p, 70);
    game.vfx.burst('healRing', game.player.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 40);
    game.hud.toast('HP и выносливость восстановлены');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const ready = this.cooldown <= 0;
    this.prompt = ready ? 'Исцелиться' : `Восстанавливается… ${Math.ceil(this.cooldown)}`;
    this.crystal.rotation.y += dt * (ready ? 1.2 : 0.3);
    this.crystal.position.y = 1.45 + Math.sin(this._time * 1.8) * 0.08;
    const k = ready ? 1 : 0.15;
    this.crystalMat.emissiveIntensity = damp(this.crystalMat.emissiveIntensity, k * (0.9 + Math.sin(this._time * 3) * 0.15), 4, dt);
    this.light.intensity = damp(this.light.intensity, ready ? 2.2 : 0.3, 4, dt);
    this.light.position.y = this.crystal.position.y;
    if (ready && ctx?.vfx && Math.random() < dt * 4) {
      ctx.vfx.emit('healMote', this.crystal.getWorldPosition(_tmp));
    }
  }
}

// -----------------------------------------------------------------------------
export class Brazier extends Interactable {
  constructor(position) {
    super('Жаровня', 'Зажечь');
    this.root.position.copy(position);
    this.lit = false;
    const iron = this.mat({ color: 0x3b3534, roughness: 0.5, metalness: 0.8 });
    const stone = this.mat({ color: 0x8a8378, roughness: 0.9 });
    this.addMesh(new THREE.CylinderGeometry(0.35, 0.45, 0.3, 10).translate(0, 0.15, 0), stone, this.root, { collide: true });
    this.addMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 8).translate(0, 0.65, 0), iron, this.root, { collide: true });
    this.addMesh(new THREE.CylinderGeometry(0.55, 0.25, 0.32, 14, 1, true).translate(0, 1.12, 0), iron, this.root, { collide: true });
    this.coals = this.mat({ color: 0x221a18, roughness: 1, emissive: new THREE.Color(0, 0, 0) });
    this.addMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14).translate(0, 1.12, 0), this.coals);
    this.light = new THREE.PointLight(0xff8a3a, 0, 9, 2);
    this.light.position.y = 1.7;
    this.light.castShadow = false;
    this.root.add(this.light);
    this.flame = 0;
    this.bakeCollision();
  }

  interact(game) {
    this.lit = !this.lit;
    this.prompt = this.lit ? 'Потушить' : 'Зажечь';
    const p = this.root.localToWorld(_tmp.set(0, 1.2, 0));
    if (this.lit) game.vfx.burst('fireBurst', p, 40);
    else game.vfx.burst('smokePuff', p, 12);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this.flame = damp(this.flame, this.lit ? 1 : 0, this.lit ? 3 : 5, dt);
    const flick = 0.85 + Math.sin(this._time * 13) * 0.08 + Math.sin(this._time * 23.7) * 0.07;
    this.light.intensity = this.flame * 9 * flick;
    this.coals.emissive.setRGB(2.2 * this.flame * flick, 0.6 * this.flame, 0.1 * this.flame);
    if (this.flame > 0.05 && ctx?.vfx) {
      const p = this.root.localToWorld(_tmp.set(0, 1.18, 0));
      const n = Math.random() < dt * 60 * this.flame ? 1 : 0;
      for (let i = 0; i < n; i++) ctx.vfx.emit('brazierFire', p);
      if (Math.random() < dt * 6 * this.flame) ctx.vfx.emit('brazierSmoke', p);
      if (Math.random() < dt * 5 * this.flame) ctx.vfx.emit('ember', p);
    }
  }
}

// -----------------------------------------------------------------------------
export class Signpost extends Interactable {
  constructor(position, rotY, messages) {
    super('Указатель', 'Прочитать');
    this.root.position.copy(position);
    this.root.rotation.y = rotY;
    this.messages = messages;
    this.index = 0;
    const wood = this.mat({ color: 0x7a5232, roughness: 0.85 });
    const board = this.mat({ color: 0xa47b4c, roughness: 0.8 });
    this.addMesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 8).translate(0, 0.85, 0), wood, this.root, { collide: true });
    this.addMesh(new THREE.BoxGeometry(1.0, 0.5, 0.07).translate(0, 1.45, 0.06), board, this.root, { collide: true });
    // Engraved lines.
    const ink = new THREE.MeshBasicMaterial({ color: 0x4a3018 });
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.7 - i * 0.15, 0.035), ink);
      l.position.set(-0.05 + i * 0.03, 1.55 - i * 0.1, 0.1);
      this.root.add(l);
    }
    this.bakeCollision();
  }

  interact(game) {
    game.hud.toast(this.messages[this.index], 5);
    this.index = (this.index + 1) % this.messages.length;
  }
}

// -----------------------------------------------------------------------------
/**
 * A story object the player can examine (journal, star shard, crystal, cave-in…).
 * What happens is decided by the RPG layer (`game.rpg.onInteract(id, prop)`); the prop only
 * knows its look. `active` is synced from story flags (e.g. a taken shard disappears).
 */
export class QuestProp extends Interactable {
  constructor({ id, name, prompt, position, shape = 'none', rotY = 0 }) {
    super(name, prompt);
    this.id = id;
    this.active = true;
    this.root.position.copy(position);
    this.root.rotation.y = rotY;
    this.shape = shape;
    if (shape === 'shard') {
      this.glowMat = this.mat({ color: 0xbfe8ff, emissive: new THREE.Color(0.6, 1.4, 2.6), roughness: 0.1, transparent: true, opacity: 0.92 });
      this.gem = this.addMesh(new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.8, 1), this.glowMat, this.root, { cast: false });
    } else if (shape === 'cat') {
      // A small black cat, curled up and watching.
      const fur = this.mat({ color: 0x1c1a20, roughness: 0.9 });
      const eye = new THREE.MeshBasicMaterial({ color: 0xffd040 });
      this.addMesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.75, 1.4).translate(0, 0.16, 0), fur);
      this.addMesh(new THREE.SphereGeometry(0.12, 10, 8).translate(0, 0.32, 0.24), fur);
      for (const s of [-1, 1]) {
        this.addMesh(new THREE.ConeGeometry(0.045, 0.1, 4).translate(s * 0.06, 0.45, 0.22), fur);
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), eye);
        e.position.set(s * 0.045, 0.34, 0.34);
        this.root.add(e);
      }
      this.addMesh(new THREE.CylinderGeometry(0.03, 0.025, 0.42, 6).rotateX(1.2).translate(0.12, 0.2, -0.32), fur);
    } else if (shape === 'sack') {
      // A burlap sack tied at the neck.
      const cloth = this.mat({ color: 0xb89a6a, roughness: 0.95 });
      const rope = this.mat({ color: 0x5a4028, roughness: 0.9 });
      this.addMesh(new THREE.SphereGeometry(0.34, 10, 8).scale(1, 1.15, 0.85).translate(0, 0.38, 0), cloth);
      this.addMesh(new THREE.CylinderGeometry(0.1, 0.17, 0.2, 8).translate(0, 0.78, 0), cloth);
      this.addMesh(new THREE.TorusGeometry(0.12, 0.025, 6, 10).rotateX(Math.PI / 2).translate(0, 0.7, 0), rope);
    } else if (shape === 'book') {
      const cover = this.mat({ color: 0x6a2a2a, roughness: 0.7 });
      const page = this.mat({ color: 0xf2e6c8, roughness: 0.9 });
      this.addMesh(new THREE.BoxGeometry(0.42, 0.07, 0.3), cover);
      this.addMesh(new THREE.BoxGeometry(0.38, 0.04, 0.26).translate(0, 0.05, 0), page);
    } else {
      // Invisible hit volume (the visual is part of the static level).
      const m = this.addMesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), this.root, { cast: false });
      m.visible = true;
      m.material.colorWrite = false;
      m.material.depthWrite = false;
    }
  }

  canInteract() { return this.active; }

  setActive(on) {
    this.active = on;
    if (this.shape !== 'none') this.root.visible = on;
  }

  interact(game) {
    game.rpg.onInteract(this.id, this);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (this.gem && this.active) {
      this.gem.rotation.y += dt * 1.4;
      this.gem.position.y = Math.sin(this._time * 2) * 0.08;
      if (ctx?.vfx && Math.random() < dt * 5) ctx.vfx.emit('healMote', this.root.getWorldPosition(_tmp));
    }
  }
}

/** Passage to another place (mine entrance, ladder, lift): `game.travel(target)`. */
export class Door extends Interactable {
  constructor({ id, name, prompt, position, target, shape = 'none', rotY = 0 }) {
    super(name, prompt);
    this.id = id;
    this.target = target;
    this.root.position.copy(position);
    this.root.rotation.y = rotY;
    if (shape === 'ladder') {
      const wood = this.mat({ color: 0x7a5232, roughness: 0.85 });
      for (const s of [-1, 1]) this.addMesh(new THREE.BoxGeometry(0.1, 3.6, 0.1).translate(s * 0.35, 1.8, 0), wood);
      for (let i = 0; i < 9; i++) this.addMesh(new THREE.BoxGeometry(0.7, 0.06, 0.06).translate(0, 0.3 + i * 0.4, 0), wood);
    } else if (shape === 'lift') {
      const wood = this.mat({ color: 0x6a4a30, roughness: 0.85 });
      const iron = this.mat({ color: 0x3b3534, roughness: 0.5, metalness: 0.7 });
      this.addMesh(new THREE.BoxGeometry(1.8, 0.15, 1.8).translate(0, 0.08, 0), wood);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.addMesh(new THREE.BoxGeometry(0.12, 3.2, 0.12).translate(sx * 0.85, 1.6, sz * 0.85), wood);
      this.addMesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4).translate(0, 4.5, 0), iron);
    } else {
      const m = this.addMesh(new THREE.BoxGeometry(2.4, 2.6, 0.6).translate(0, 1.3, 0), new THREE.MeshBasicMaterial({ visible: false }), this.root, { cast: false });
      m.visible = true;
      m.material.colorWrite = false;
      m.material.depthWrite = false;
    }
  }

  /** A door can be shut for the story (the crypt before the seal is opened): no prompt while inactive. */
  canInteract() { return this.active !== false; }

  setActive(on) { this.active = on; }

  interact(game) {
    game.travel(this.target);
  }
}

// -----------------------------------------------------------------------------
/**
 * Split the user's treasure chest model into body + lid (by a horizontal seam) so the
 * lid can swing open on a hinge at the back edge. Done once; instances share geometry.
 */
export function prepareChestModel(scene, height = 0.85, seam = 0.56) {
  scene.updateMatrixWorld(true);
  let src = null;
  scene.traverse((o) => {
    if (o.isMesh && !src) src = o;
  });
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const s = height / (bb.max.y - bb.min.y);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2).scale(s, s, s);
  geo.computeBoundingBox();
  const b2 = geo.boundingBox;
  const seamY = b2.max.y * seam;
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const bodyIdx = [], lidIdx = [];
  for (let i = 0; i < idx.length; i += 3) {
    const cy = (pos.getY(idx[i]) + pos.getY(idx[i + 1]) + pos.getY(idx[i + 2])) / 3;
    (cy > seamY ? lidIdx : bodyIdx).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const body = geo.clone();
  body.setIndex(bodyIdx);
  const lid = geo.clone();
  lid.setIndex(lidIdx);
  const hinge = new THREE.Vector3(0, seamY, b2.min.z + 0.04);
  lid.translate(-hinge.x, -hinge.y, -hinge.z);
  const mat = src.material;
  if (mat.map) mat.map.anisotropy = 4;
  return { body, lid, hinge, material: mat, size: b2.getSize(new THREE.Vector3()) };
}

/** Treasure chest using the user's model. Loot (CHEST_LOOT[id]) is granted once per save. */
export class ModelChest extends Interactable {
  constructor(model, position, rotY = 0, id = 'axel') {
    super('Сундук', 'Открыть');
    this.id = id;
    this.root.position.copy(position);
    this.root.rotation.y = rotY;
    this.open = false;
    this.looted = false;
    this.lidAngle = 0;
    this.lidVel = 0;
    const base = model.material.clone();
    base.side = THREE.DoubleSide; // the lid/body are open shells: show their insides
    const m = highlightable(base, this.uniforms);
    this.addMesh(model.body, m);
    this.lid = new THREE.Group();
    this.lid.position.copy(model.hinge);
    this.root.add(this.lid);
    this.addMesh(model.lid, m, this.lid);
    const sz = model.size;
    // Simple box collider (the visual mesh is too detailed for the BVH).
    const col = new THREE.Mesh(new THREE.BoxGeometry(sz.x * 0.95, sz.y * 0.9, sz.z * 0.9).translate(0, sz.y * 0.45, 0));
    col.visible = false;
    this.root.add(col);
    this._collideLater = [col];
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(sz.x * 0.8, sz.z * 0.7).rotateX(-Math.PI / 2).translate(0, model.hinge.y - 0.02, 0.02),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 0.8), transparent: true, opacity: 0, depthWrite: false }),
    );
    this.root.add(this.glow);
    this.bakeCollision();
  }

  interact(game) {
    this.open = !this.open;
    this.prompt = this.open ? 'Закрыть' : 'Открыть';
    this.lidVel += this.open ? -8 : 6;
    if (!this.open) return;
    const p = this.root.localToWorld(_tmp.set(0, 0.7, 0));
    game.vfx.burst('gold', p, 70);
    if (!this.looted) {
      // A full bag keeps the chest shut: one-time loot is never thrown away.
      const loot = CHEST_LOOT[this.id] || [];
      const inv = game.inventory;
      const need = loot.filter(([id]) => id !== 'eris' && !inv.items.some((s) => s.id === id)).length;
      if (need > inv.free) {
        game.hud.toast(`Сумка полна: нужно свободных ячеек — ${need}. Сундук подождёт.`, 3);
        this.open = false;
        this.prompt = 'Открыть';
        return;
      }
      this.looted = true;
      game.rpg.onChestOpened(this.id, CHEST_LOOT[this.id] || []);
    } else {
      game.hud.toast('Сундук пуст.');
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const target = this.open ? -1.75 : 0;
    this.lidVel += ((target - this.lidAngle) * 90 - this.lidVel * 11) * dt;
    this.lidAngle += this.lidVel * dt;
    this.lid.rotation.x = this.lidAngle;
    this.glow.material.opacity = damp(this.glow.material.opacity, this.open && !this._empty ? 0.9 : 0, 6, dt);
    if (this.open && ctx?.vfx && Math.random() < dt * 8) {
      ctx.vfx.emit('goldMote', this.root.localToWorld(_tmp.set((Math.random() - 0.5) * 0.7, 0.5, (Math.random() - 0.5) * 0.3)));
    }
  }
}
