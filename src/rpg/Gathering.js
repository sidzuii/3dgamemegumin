import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math.js';
import { RESOURCE_AREAS } from '../data/resources.js';
import { ITEMS } from '../data/items.js';

/**
 * Resource nodes: herbs, moonflowers (bloom only at night), iron ore, deadwood.
 * Placement is deterministic per area (stable ids for the save); a gathered node regrows
 * after `respawn` game hours. Each node is an interactable (E — "Собрать").
 */
const GEO = {
  leaf: new THREE.ConeGeometry(0.08, 0.38, 4).translate(0, 0.19, 0),
  flower: new THREE.SphereGeometry(0.06, 6, 4),
  ore: new THREE.DodecahedronGeometry(0.42, 0),
  vein: new THREE.OctahedronGeometry(0.1, 0),
  log: new THREE.CylinderGeometry(0.22, 0.26, 2.2, 8).rotateZ(Math.PI / 2),
  branch: new THREE.CylinderGeometry(0.04, 0.06, 0.8, 5),
};
const MAT = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
  moon: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color(0.6, 0.9, 1.8), emissiveIntensity: 1, roughness: 0.4 }),
};

class GatherNode {
  constructor(sys, id, area, pos, rng) {
    this.sys = sys;
    this.id = id;
    this.area = area;
    this.item = area.item;
    this.name = ITEMS[area.item].name;
    this.prompt = area.verb || 'Собрать';
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.rotation.y = rng() * 6.28;
    this.meshes = [];
    // Each node is merged into (at most) two meshes: body + glowing flowers.
    const parts = { body: [], glow: [] };
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
    const add = (geo, color, x, y, z, s = 1, r = 0, glow = false) => {
      const g = geo.clone();
      _e.set(r, rng() * 6, r * 0.5);
      g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(s)));
      const c = new THREE.Color(color);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
      (glow ? parts.glow : parts.body).push(g.index ? g.toNonIndexed() : g);
    };
    if (area.shape === 'herb' || area.shape === 'moon') {
      for (let i = 0; i < 6; i++) add(GEO.leaf, 0x4f9a3a, (rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3, 0.8 + rng() * 0.6, (rng() - 0.5) * 0.7);
      for (let i = 0; i < 4; i++) add(GEO.flower, area.shape === 'moon' ? 0xcfe0ff : 0xf6f0ff, (rng() - 0.5) * 0.35, 0.3 + rng() * 0.2, (rng() - 0.5) * 0.35, area.shape === 'moon' ? 1.6 : 1, 0, area.shape === 'moon');
    } else if (area.shape === 'ore') {
      add(GEO.ore, 0x77706a, 0, 0.2, 0, 1.2 + rng() * 0.4);
      for (let i = 0; i < 5; i++) {
        const a = rng() * 6.28;
        add(GEO.vein, 0xc87a48, Math.cos(a) * 0.38, 0.3 + rng() * 0.3, Math.sin(a) * 0.38, 0.8 + rng() * 0.6);
      }
    } else {
      add(GEO.log, 0x6a4a30, 0, 0.22, 0, 1);
      for (let i = 0; i < 3; i++) add(GEO.branch, 0x6a4a30, -0.6 + i * 0.6, 0.45, 0.15, 1, 0.9);
    }
    for (const [k, list] of Object.entries(parts)) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list, false), k === 'glow' ? MAT.moon : MAT.body);
      m.castShadow = area.shape === 'ore' || area.shape === 'wood';
      m.receiveShadow = true;
      m.userData.interactable = this;
      if (k === 'glow') this.glowMesh = m;
      this.root.add(m);
      this.meshes.push(m);
    }
    // Generous invisible hit volume.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 6, 4).translate(0, 0.4, 0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.interactable = this;
    this.root.add(hit);
    this.meshes.push(hit);
    this.ready = true;
    this._hl = 0;
  }

  /** Currently gatherable (regrown, and in bloom for night flowers). */
  available() {
    if (!this.ready) return false;
    if (this.area.night && (this.sys.rpg.game.dayNight?.night ?? 0) < 0.5) return false;
    return true;
  }

  canInteract() {
    return this.available();
  }

  setHighlight(on) {
    this.highlighted = on;
  }

  interact(game) {
    this.sys.gather(this);
  }

  sync() {
    const vis = this.available();
    this.root.visible = vis || (this.ready && this.area.night); // closed buds stay visible by day
    if (this.glowMesh) this.glowMesh.visible = vis;
  }
}

export class Gathering {
  constructor(rpg) {
    this.rpg = rpg;
    this.nodes = [];
    const W = rpg.game.world;
    for (const area of RESOURCE_AREAS) {
      const rng = mulberry32(area.seed || area.id.length * 7919);
      const spots = area.spots ? area.spots.map((s) => rpg.spotPos(s)).filter(Boolean) : [];
      let placed = 0;
      for (let i = 0; i < area.count * 20 && placed < area.count; i++) {
        let p;
        if (spots.length) {
          if (placed >= spots.length) break;
          p = spots[placed].clone();
        } else {
          const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * area.r;
          const x = area.x + Math.cos(a) * r, z = area.z + Math.sin(a) * r;
          if (!area.anywhere && !W._freeForPlants(x, z, 0.5)) continue;
          p = new THREE.Vector3(x, 0, z);
        }
        p.y = W.groundAt(p.x, p.z, p.y + 3);
        const node = new GatherNode(this, `${area.id}_${placed}`, area, p, rng);
        W.scene.add(node.root);
        this.nodes.push(node);
        rpg.game.interaction.register(node);
        placed++;
      }
    }
    this.syncFromState();
  }

  syncFromState() {
    const S = this.rpg.state.gather;
    const now = this.rpg.clock.total;
    for (const n of this.nodes) {
      n.ready = !(S[n.id] > now);
      n.sync();
    }
  }

  gather(node) {
    if (!node.available()) return;
    const inv = this.rpg.inventory;
    const [a, b] = node.area.amount || [1, 2];
    const n = a + Math.floor(Math.random() * (b - a + 1));
    if (!inv.canAdd(node.item)) {
      this.rpg.game.hud.toast('Сумка полна!');
      return;
    }
    inv.add(node.item, n);
    this.rpg.state.gather[node.id] = this.rpg.clock.total + node.area.respawn * 60;
    node.ready = false;
    node.sync();
    const p = node.root.position;
    this.rpg.game.vfx.burst(node.area.shape === 'ore' ? 'sparks' : 'healMote', p.clone().setY(p.y + 0.5), 10, { scale: 0.2 });
    this.rpg.game.player.anim.playAction('Interact');
    this.rpg.events.emit('gather', { item: node.item, n });
    this.rpg.markDirty();
  }

  /** Called a few times per second. */
  update() {
    const now = this.rpg.clock.total;
    const S = this.rpg.state.gather;
    for (const n of this.nodes) {
      const ready = !(S[n.id] > now);
      if (ready !== n.ready) n.ready = ready;
      n.sync();
    }
  }
}
