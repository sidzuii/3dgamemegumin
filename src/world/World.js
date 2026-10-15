import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { fbm, mulberry32, smoothstep, clamp } from '../core/math.js';
import { createSky } from './Sky.js';
import { createGrass } from './Grass.js';
import { Signpost, ModelChest } from './Interactables.js';
import { HALF, REGIONS, REGION, RIVERS, LAKES, LAVA, CAMPS, SIGNS, FORESTS } from './MapData.js';
import { Heightfield, GRID_N, GRID_STEP, roadInfo, riverDistance, surfaceAt, polygonDistance } from './Terrain.js';
import { WALL, toWorld } from './AxelPlan.js';
import { createWaterSurface, riverGeometry, lakeGeometry } from './Water.js';
import { createLava } from './Surfaces.js';
import { makeNoiseTexture, makePavingTextures } from './textures.js';
import { buildTown } from './build/Town.js';
import { buildCountryside } from './build/Countryside.js';
import { buildDungeon, DUNGEON } from './build/Dungeon.js';
import { buildCrypt } from './build/Crypt.js';
import { buildRelay } from './build/Relay.js';
import { buildDrain } from './build/Drain.js';
import { buildPlacement } from './build/Placements.js';
import { TreeField } from './TreeField.js';
import { tree, bush, rock, decor, pick } from './build/Kit.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

/** Sun direction (mutated by the day/night cycle). */
export const SUN_DIR = new THREE.Vector3(0.55, 0.78, 0.32).normalize();

const CHUNK = 128; // static batches are split into map chunks for frustum culling
const DETAIL_CHUNK = 48; // small parts (window inserts, shutters…) — hidden beyond `detailDistance`
const LOD_CHUNK = 64; // buildings: full model within `lodDistance` of the cell, a cheap proxy beyond
const TERRAIN_CHUNK = 68; // terrain grid cells per chunk side (170 m)
const LIGHT_POOL = 8; // fixed number of point lights (no shader recompiles)

/** The city wall as a world polygon (+ bbox) for the "inside Axel" tests. */
const CITY = WALL.nodes.map((n) => toWorld(n.u, n.v));
const CITY_BOX = [Math.min(...CITY.map((p) => p[0])), Math.min(...CITY.map((p) => p[1])), Math.max(...CITY.map((p) => p[0])), Math.max(...CITY.map((p) => p[1]))];
/** Signed distance to the city wall line (negative inside the walls); far away: a cheap lower bound. */
export function cityDistance(x, z) {
  const dx = Math.max(CITY_BOX[0] - x, 0, x - CITY_BOX[2]), dz = Math.max(CITY_BOX[1] - z, 0, z - CITY_BOX[3]);
  if (dx > 30 || dz > 30) return Math.hypot(dx, dz);
  return polygonDistance(CITY, x, z);
}
const FOREST_BOX = FORESTS.map((f) => [Math.min(...f.pts.map((p) => p[0])), Math.min(...f.pts.map((p) => p[1])), Math.max(...f.pts.map((p) => p[0])), Math.max(...f.pts.map((p) => p[1]))]);
/** Signed distance to the nearest forest polygon (negative inside) and that forest. */
export function forestAt(x, z) {
  let best = Infinity, forest = null;
  FORESTS.forEach((f, i) => {
    const b = FOREST_BOX[i];
    if (x < b[0] - 40 || x > b[2] + 40 || z < b[1] - 40 || z > b[3] + 40) return;
    const d = polygonDistance(f.pts, x, z);
    if (d < best) { best = d; forest = f; }
  });
  return { d: best, forest };
}

/**
 * The overworld: sky + lighting, heightfield terrain, rivers/lakes, every static structure
 * (merged per material and map chunk, one BVH collider), interactables, enemy camps,
 * vegetation and grass. Regions and roads come from MapData; builders live in world/build.
 */
export class World {
  constructor(renderer, scene, kits) {
    this.renderer = renderer;
    this.scene = scene;
    this.kits = kits; // KitLibrary (Kenney pieces)
    this.layout = { overrides: {}, added: [] }; // map editor data (public/data/placements.json)
    this.editorMode = false;
    this.groups = new Map(); // id -> editable group record
    this._D = null; // layout delta of the group being built
    this._group = null;
    this.trees = new TreeField(this); // instanced trees / bushes with LOD
    this.veg = []; // recorded wild vegetation (see Kit.js recordVeg)
    this.spotBase = {}; // named spots as the builders placed them (editor: before layout.spots)
    this.campBase = {}; // enemy spawn points as built (before layout.camps)
    this._campN = {};
    this._vegIds = new Map();
    this.collider = null;
    this.dynamicColliders = [];
    this.interactables = [];
    this.dummies = [];
    this.updatables = [];
    this.footprints = []; // for the map: { x, z, w, d, rot, kind }
    this.lightSources = []; // { pos, color, intensity, distance, night, flicker }
    this.chimneys = [];
    this.gatherNodes = []; // filled by the gathering system
    this.npcSpots = {}; // named positions for NPC schedules
    this._staticCollision = [];
    this._visualBatches = new Map();
    this.detailMeshes = []; // { mesh, center, r } — distance-culled small parts
    this.lodMeshes = []; // { mesh, center, far } — buildings: near models / far proxies per cell
    this.detailDistance = 75;
    this.lodDistance = 120;
    this.lodMode = null; // 'near' | 'far' while a builder emits the two versions of a building
    this.terrainChunks = [];
    this.rng = mulberry32(1337);
    this.campSpawns = [];
    this.regions = REGIONS;
    this.assets = {};
    this.nightFactor = 0;
    this.indoorFactor = 0;
  }

  addUpdatable(u) {
    this.updatables.push(u);
    return u;
  }

  camp(type, x, z, camp, y) {
    if (this._mute) return;
    if (this._D) {
      const p = this.xf(new THREE.Vector3(x, y ?? this.heightAt(x, z), z));
      x = p.x; z = p.z; y = y === undefined ? undefined : p.y;
    }
    // Editor layout (layout.camps['<camp>#<n>'] = { x, z }) moves single spawn points.
    const n = (this._campN[camp] = (this._campN[camp] || 0) + 1);
    const key = `${camp}#${n}`;
    this.campBase[key] = { x, z, type };
    const o = this.layout.camps?.[key];
    if (o) { x = o.x; z = o.z; y = undefined; }
    this.campSpawns.push({ type, x, z, camp, y, key });
  }

  addChest(pos, rotY, id) {
    pos = pos.clone();
    if (pos.y === 0) pos.y = this.heightAt(pos.x, pos.z);
    return this.addInteractable(new ModelChest(this.assets.chest, pos, rotY, id));
  }

  addSign(pos, rotY, messages) {
    pos = pos.clone();
    pos.y = this.heightAt(pos.x, pos.z);
    return this.addInteractable(new Signpost(pos, rotY, messages));
  }

  addInteractable(obj) {
    if (this._mute) return obj;
    if (this._D) {
      obj.root.updateMatrix();
      obj.root.applyMatrix4(this._D);
      for (const g of obj.collision || []) g.applyMatrix4(this._D);
    }
    this.interactables.push(obj);
    this.scene.add(obj.root);
    if (obj.collision) for (const g of obj.collision) this._staticCollision.push(g);
    if (obj.update) this.updatables.push(obj);
    this._markLogic();
    return obj;
  }

  /** A live scene object built by a builder (windmill sails, ritual circles…): follows its group. */
  addObject(obj) {
    if (this._mute) return obj;
    if (this._D) {
      obj.updateMatrix();
      obj.applyMatrix4(this._D);
    }
    this.scene.add(obj);
    return obj;
  }

  addFootprint(x, z, w, d, rot, kind) {
    if (this._mute) return;
    if (this._D) {
      const p = this.xf(new THREE.Vector3(x, 0, z));
      x = p.x; z = p.z; rot += this._group.dyaw;
      w *= this._group.ds; d *= this._group.ds;
    }
    this.footprints.push({ x, z, w, d, rot, kind });
  }

  addLightSource(pos, opts) {
    if (this._mute) return;
    this.lightSources.push({ pos: this.xf(pos.clone()), color: new THREE.Color(opts.color ?? 0xffb060), intensity: opts.intensity ?? 4, distance: opts.distance ?? 10, night: !!opts.night, flicker: !!opts.flicker, always: !!opts.always });
  }

  addChimney(pos) {
    if (this._mute) return;
    this.chimneys.push(this.xf(pos.clone()));
  }

  /** Named spot for NPC schedules / quest markers. */
  spot(name, pos, yaw = 0) {
    if (this._mute) return;
    const sp = { pos: this.xf(pos.clone()), yaw: yaw + (this._D ? this._group.dyaw : 0) };
    // Editor layout (layout.spots[name] = { x, z, yaw }) moves a single named point; the height
    // above the ground (floor level inside a building) is kept.
    this.spotBase[name] = { x: sp.pos.x, z: sp.pos.z, yaw: sp.yaw, y: sp.pos.y - this.heightAt(sp.pos.x, sp.pos.z) };
    const o = this.layout.spots?.[name];
    if (o) { sp.pos.set(o.x, this.heightAt(o.x, o.z) + this.spotBase[name].y, o.z); sp.yaw = o.yaw ?? sp.yaw; }
    this.npcSpots[name] = sp;
    this._markLogic();
  }

  // ---------------------------------------------------------------------------
  // Editable layout (map editor, editor/Editor.js; data: public/data/placements.json)
  // ---------------------------------------------------------------------------
  /**
   * Build a named, editable part of the map. `pivot` = { x, z, rot } is where the builder puts
   * it; the layout may move / turn / scale it ({ x, z, rot, s, dy }) or delete it. Everything
   * the builder adds inside `fn` (geometry, colliders, spots, lights, interactables) follows.
   * `fn(rng)` gets its own random stream, so editing one group never reshuffles the others.
   */
  group(id, pivot, fn, label = id, opts = {}) {
    // Inside another group this is a part of it ('parent/child'); the part's override is kept in
    // the parent's builder space, so it composes with whatever moves the parent.
    const parent = opts.added ? null : this._group;
    if (parent && !parent.added) id = parent.id + '/' + id;
    const o = opts.added ? null : this.layout.overrides?.[id] || null;
    const p = { x: pivot.x, z: pivot.z, rot: pivot.rot || 0 };
    p.y = this.heightAt(p.x, p.z);
    const rec = { id, label, pivot: p, added: !!opts.added, data: opts.data || null, hasLogic: false, batches: null, object: null, parent: parent && !parent.added ? parent : null, children: [] };
    rec.parent?.children.push(rec);
    this.groups.set(id, rec);
    const T = layoutTransform(this, p, o || opts.data || {});
    const PD = rec.parent ? this._D : null;
    rec.dyaw = (rec.parent?.dyaw || 0) + T.rot - p.rot;
    rec.ds = (rec.parent?.ds ?? 1) * T.s;
    rec.place = T;
    const Dl = o ? groupDelta(p, T) : null;
    const D = PD && Dl ? new THREE.Matrix4().multiplyMatrices(PD, Dl) : PD || Dl;
    const prev = [this._D, this._group, this._mute];
    // A deleted part still runs its builder (so the parent's random stream stays the same) but
    // every sink ignores it.
    if (o?.deleted) {
      rec.deleted = true;
      if (!rec.parent) return rec;
      this._mute = true;
    }
    this._D = D;
    this._group = rec;
    if (this.editorMode && !this._mute) rec.batches = new Map();
    try {
      fn(rec.parent ? null : mulberry32(hashId(id)));
    } finally {
      [this._D, this._group, this._mute] = prev;
    }
    return rec;
  }

  /**
   * An editable piece inside the current group (a street, a tower, a door leaf, a barrel…):
   * selectable on its own in the map editor (Alt+click). Outside groups it just runs `fn`.
   * Names are numbered per parent in build order: 'barrel', 'barrel_2', …
   */
  part(name, x, z, rot, fn, label) {
    const g = this._group;
    if (!g || g.added || g.id === '__ghost') return fn();
    g.partN = g.partN || {};
    const n = (g.partN[name] = (g.partN[name] || 0) + 1);
    let r;
    this.group(n > 1 ? name + '_' + n : name, { x, z, rot }, () => { r = fn(); }, label || name);
    return r;
  }

  _markLogic() {
    for (let g = this._group; g; g = g.parent) g.hasLogic = true;
  }

  /** Apply the current group's layout delta to a world-space point (in place). */
  xf(v) {
    return this._D ? v.applyMatrix4(this._D) : v;
  }

  /** 'water' | 'lava' | null */
  surfaceAt(p) {
    if (DUNGEON.contains(p.x, p.z)) return null;
    return surfaceAt(p.x, p.y, p.z);
  }

  /** The smallest region containing the point. */
  locationAt(p) {
    let best = null;
    for (const R of REGIONS) {
      const d = Math.hypot(p.x - R.center.x, p.z - R.center.z);
      if (d < R.r && (!best || R.r < best.r)) best = R;
    }
    return best;
  }

  build() {
    this._setupSkyAndLights();
    this._buildMaterials();
    Object.assign(this.mats, this.kits.materials);
    this.heightfield = new Heightfield();
    this._buildTerrain();
    this._buildWater();
    buildTown(this);
    buildCountryside(this);
    buildDungeon(this);
    buildCrypt(this);
    buildRelay(this);
    buildDrain(this);
    for (const a of this.layout.added || []) buildPlacement(this, a);
    SIGNS.forEach(([x, z, rot, lines], i) => this.group('sign_' + i, { x, z, rot }, () => this.addSign(new THREE.Vector3(x, 0, z), rot, lines), 'Указатель: ' + lines[0].slice(0, 34)));
    for (const c of CAMPS) this.camp(c.type, c.x, c.z, c.camp);
    this._buildVegetation();
    this._realizeVegetation();
    this._flushVisualBatches();
    this.trees.build(this.scene);
    this._buildCollider();
    this._buildGrass();
    this._buildLightPool();
    return this;
  }

  // ---------------------------------------------------------------------------
  /** Terrain height (cached grid). The dungeon interior has its own flat floor. */
  heightAt(x, z) {
    if (DUNGEON.contains(x, z)) return DUNGEON.floor;
    return this.heightfield.sample(x, z);
  }

  // ---------------------------------------------------------------------------
  _setupSkyAndLights() {
    const { renderer, scene } = this;
    const sky = createSky(SUN_DIR);
    this.sky = sky;
    scene.add(sky.mesh);

    // Image based lighting generated from the sky itself (no texture downloads).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = createSky(SUN_DIR, { forEnv: true });
    envScene.add(envSky.mesh);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4d5a36 }));
    ground.position.y = -2;
    envScene.add(ground);
    this.envMap = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.fog = new THREE.Fog(sky.horizonColor.clone(), 90, 420);

    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b4a33, 0.55);
    scene.add(hemi);
    this.hemi = hemi;

    const sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28;
    sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.sunBaseIntensity = sun.intensity;

    const rim = new THREE.DirectionalLight(0xa9c8ff, 1.15);
    rim.position.set(-SUN_DIR.x, 0.45, -SUN_DIR.z).multiplyScalar(50);
    scene.add(rim);
    this.rim = rim;
  }

  /** Keep the shadow frustum centred on the player, snapped to texels (no shimmering). */
  followShadow(target) {
    const sun = this.sun;
    const cam = sun.shadow.camera;
    const texel = (cam.right - cam.left) / sun.shadow.mapSize.x;
    if (!this._lightRot || !this._lightDir.equals(SUN_DIR)) {
      this._lightDir = SUN_DIR.clone();
      this._lightRot = new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
      this._lightRotInv = this._lightRot.clone().invert();
      this._shadowP = new THREE.Vector3();
    }
    const p = this._shadowP.copy(target).applyMatrix4(this._lightRotInv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(this._lightRot);
    sun.target.position.copy(p);
    sun.position.copy(p).addScaledVector(SUN_DIR, 80);
    sun.target.updateMatrixWorld();
  }

  _buildMaterials() {
    const noise = makeNoiseTexture(128, 7);
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    const noise2 = makeNoiseTexture(128, 21, 0.5);
    noise2.wrapS = noise2.wrapT = THREE.RepeatWrapping;
    this.noiseTex = noise;
    const cob = makePavingTextures('cobble', 512, 11), flag = makePavingTextures('flag', 512, 23);
    // Materials are white; their colour lives in the vertex tint (default = the colour below)
    // so a per-piece tint replaces the colour instead of darkening it.
    this.baseTint = {};
    const M = (p) => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
      m.userData.base = m.color.getHex();
      if (!p.emissive || p.color === 0xffffff) m.color.set(0xffffff);
      return m;
    };
    this.mats = {
      stone: M({ color: 0xb4ab9c, roughness: 0.92, map: noise }),
      stoneDark: M({ color: 0x8a8378, roughness: 0.95, map: noise }),
      cobble: M({ color: 0xffffff, roughness: 0.88, map: cob.map, bumpMap: cob.bump, bumpScale: 2.2 }),
      plaza: M({ color: 0xffffff, roughness: 0.84, map: flag.map, bumpMap: flag.bump, bumpScale: 1.4 }),
      wood: M({ color: 0xffffff, roughness: 0.8, map: noise2 }),
      plank: M({ color: 0x9a7a54, roughness: 0.85, map: noise2 }),
      timber: M({ color: 0xffffff, roughness: 0.85, map: noise2 }),
      door: M({ color: 0xffffff, roughness: 0.75, map: noise2 }),
      plaster: M({ color: 0xffffff, roughness: 0.95, map: noise }),
      roof: M({ color: 0xffffff, roughness: 0.8, map: noise, flatShading: true }),
      thatch: M({ color: 0xc8a868, roughness: 1, map: noise2, flatShading: true }),
      window: M({ color: 0x26323e, roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(1.0, 0.62, 0.28), emissiveIntensity: 0 }),
      lampGlass: M({ color: 0xffd9a0, roughness: 0.3, emissive: new THREE.Color(1.6, 0.9, 0.4), emissiveIntensity: 0.15 }),
      glass: M({ color: 0xffffff, roughness: 0.15, emissive: new THREE.Color(0.1, 0.1, 0.1) }),
      metal: M({ color: 0x3b3534, roughness: 0.45, metalness: 0.75 }),
      cloth: M({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }),
      flower: M({ color: 0xffffff, roughness: 0.8 }),
      hay: M({ color: 0xd8b860, roughness: 1, map: noise2 }),
      bark: M({ color: 0x5a4230, roughness: 0.95, map: noise }),
      birch: M({ color: 0xe8e2d4, roughness: 0.9, map: noise }),
      leaves: M({ color: 0x5b8a3c, roughness: 0.85, flatShading: true }),
      leaves2: M({ color: 0x77a046, roughness: 0.85, flatShading: true }),
      leavesDark: M({ color: 0x3a5e30, roughness: 0.9, flatShading: true }),
      pine: M({ color: 0x3e6a3a, roughness: 0.9, flatShading: true }),
      rock: M({ color: 0x8f8a82, roughness: 0.95, flatShading: true, map: noise }),
      rockDark: M({ color: 0x5a544e, roughness: 0.95, flatShading: true, map: noise }),
      log: M({ color: 0x5e4029, roughness: 0.9, map: noise }),
      fabric: M({ color: 0x7b5a3a, roughness: 0.95, flatShading: true, map: noise2 }),
      fabric2: M({ color: 0x5b6a3a, roughness: 0.95, flatShading: true, map: noise2 }),
      bone: M({ color: 0xe8dcc0, roughness: 0.7 }),
      deadwood: M({ color: 0x4a3c33, roughness: 1, flatShading: true }),
      basalt: M({ color: 0x3a3536, roughness: 0.9, flatShading: true, map: noise }),
      obsidian: M({ color: 0x1b1720, roughness: 0.25, metalness: 0.2, flatShading: true }),
      crystal: M({ color: 0x8fdcff, emissive: new THREE.Color(0.25, 0.9, 1.6), roughness: 0.15, flatShading: true }),
      crop: M({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      water: M({ color: 0x2a5a6a, roughness: 0.15, metalness: 0.1 }),
      rune: M({ color: 0x9ad8ff, emissive: new THREE.Color(0.3, 1.0, 1.8), emissiveIntensity: 0.8, roughness: 0.3 }),
    };
    for (const [k, m] of Object.entries(this.mats)) {
      if (m.color.getHex() === 0xffffff) this.baseTint[k] = m.userData.base;
    }
  }

  // ---------------------------------------------------------------------------
  _buildTerrain() {
    const size = HALF * 2;
    const seg = GRID_N - 1;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const hf = this.heightfield;
    for (let i = 0; i < pos.count; i++) pos.setY(i, hf.data[i]);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const T = {
      grassA: new THREE.Color(0x5f8f3a), grassB: new THREE.Color(0x87a74a),
      forest: new THREE.Color(0x3f6a2c), meadow: new THREE.Color(0x9bb456), farm: new THREE.Color(0xa8ae58),
      dirt: new THREE.Color(0x8d7454), trail: new THREE.Color(0x9a8a62), rock: new THREE.Color(0x857d70),
      snow: new THREE.Color(0xe8eef2), scorch: new THREE.Color(0x3b2a24), mud: new THREE.Color(0x6e5e44),
      sand: new THREE.Color(0xb9a77e), town: new THREE.Color(0x8e8a64), ruin: new THREE.Color(0x9a9a86),
    };
    const farms = REGION.farms.center;
    const gorge = REGION.crimson_gorge.center, astra = REGION.astrarium.center;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const n = fbm(x * 0.08, z * 0.08, 3) * 0.5 + 0.5;
      const big = fbm(x * 0.012 + 40, z * 0.012, 2) * 0.5 + 0.5;
      c.copy(T.grassA).lerp(T.grassB, n * 0.7 + big * 0.3);
      // Biomes.
      const df = forestAt(x, z).d;
      c.lerp(T.forest, (1 - smoothstep(-25, 15, df)) * 0.75);
      const dfa = Math.hypot(x - farms.x, z - farms.z);
      c.lerp(T.farm, (1 - smoothstep(30, 70, dfa)) * 0.45);
      c.lerp(T.meadow, smoothstep(0.62, 0.8, big) * 0.35);
      // Town ground inside the walls: worn earth.
      const dt = cityDistance(x, z);
      if (dt < 6) c.lerp(T.town, (1 - smoothstep(-6, 6, dt)) * 0.55);
      // River banks.
      const rd = riverDistance(x, z);
      c.lerp(T.mud, (1 - smoothstep(-1, 4, rd)) * 0.9);
      c.lerp(T.sand, (1 - smoothstep(2, 7, rd)) * smoothstep(-1, 2, rd) * 0.45);
      for (const L of LAKES) {
        const dl = Math.hypot(x - L.center.x, z - L.center.z);
        c.lerp(T.sand, (1 - smoothstep(L.radius * 0.95, L.radius * 1.25, dl)) * 0.8);
      }
      // Roads.
      const r = roadInfo(x, z);
      const edge = 0.6 + fbm(x * 0.3, z * 0.3, 2) * 0.5;
      c.lerp(r.kind === 'trail' ? T.trail : T.dirt, smoothstep(edge + 0.6, edge - 0.6, r.d) * (r.kind === 'trail' ? 0.7 : 0.9));
      // Slopes, altitude.
      const slope = 1 - nrm.getY(i);
      c.lerp(T.rock, clamp(smoothstep(0.2, 0.42, slope) + smoothstep(14, 26, y) * 0.75, 0, 1));
      c.lerp(T.snow, smoothstep(40, 52, y) * 0.85);
      // Special places.
      c.lerp(T.scorch, (1 - smoothstep(30, 70, Math.hypot(x - gorge.x, z - gorge.z))) * 0.9);
      c.lerp(T.ruin, (1 - smoothstep(28, 46, Math.hypot(x - astra.x, z - astra.z))) * 0.4);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.25, pos.getZ(i) * 0.25);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: this.noiseTex });
    this.terrainMaterial = mat;
    // Chunks (frustum culling): each a slice of the full grid with the shared normals/colours.
    const N = GRID_N;
    const nrmA = geo.attributes.normal.array, posA = pos.array, uvA = geo.attributes.uv.array;
    for (let cj = 0; cj < N - 1; cj += TERRAIN_CHUNK) {
      for (let ci = 0; ci < N - 1; ci += TERRAIN_CHUNK) {
        const w = Math.min(TERRAIN_CHUNK, N - 1 - ci) + 1, h = Math.min(TERRAIN_CHUNK, N - 1 - cj) + 1;
        const P = new Float32Array(w * h * 3), Nn = new Float32Array(w * h * 3), Cc = new Float32Array(w * h * 3), U = new Float32Array(w * h * 2);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const src = (cj + j) * N + ci + i, dst = j * w + i;
          for (let k = 0; k < 3; k++) { P[dst * 3 + k] = posA[src * 3 + k]; Nn[dst * 3 + k] = nrmA[src * 3 + k]; Cc[dst * 3 + k] = colors[src * 3 + k]; }
          U[dst * 2] = uvA[src * 2]; U[dst * 2 + 1] = uvA[src * 2 + 1];
        }
        const idx = [];
        for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, c2 = a + w, d = c2 + 1;
          idx.push(a, c2, b, c2, d, b); // PlaneGeometry's triangulation (Heightfield.sample matches it)
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
        g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        g.setIndex(idx);
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mat);
        mesh.receiveShadow = true;
        mesh.name = 'Terrain';
        mesh.matrixAutoUpdate = false;
        this.scene.add(mesh);
        this.terrainChunks.push(mesh);
        this._staticCollision.push(g);
      }
    }
    geo.dispose();
    // Low-res colour copy for the map screen.
    this.terrainColors = colors;
  }

  _buildWater() {
    for (const R of RIVERS) {
      const river = createWaterSurface(riverGeometry(R), R.level, { flow: R.width > 5 ? 0.6 : 1.0 });
      this.scene.add(river.mesh);
      this.updatables.push(river);
    }
    for (const L of LAKES) {
      const lake = createWaterSurface(lakeGeometry(L), L.level);
      this.scene.add(lake.mesh);
      this.updatables.push(lake);
    }
    this.lava = createLava(LAVA);
    this.scene.add(this.lava.mesh);
    this.updatables.push(this.lava);
  }

  // ---------------------------------------------------------------------------
  // Static geometry
  // ---------------------------------------------------------------------------
  /**
   * Add a static solid: merged visual batch (by material + map chunk) + optional collider.
   * opts: { collide = true, castShadow = true, tint, collideOnly }
   */
  addSolid(geometry, matrix, materialKey, { collide = true, castShadow = true, tint = null, collideOnly = false, detail = false } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (this._mute) return g;
    g.applyMatrix4(this._D ? _dm.multiplyMatrices(this._D, matrix) : matrix);
    if (collideOnly) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', g.attributes.position);
      this._staticCollision.push(cg);
      return g;
    }
    planarUVs(g, 0.5);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const tc = _tint.set(tint ?? this.baseTint[materialKey] ?? 0xffffff);
    for (let i = 0; i < n; i++) { col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this._pushBatch(g, materialKey, castShadow, detail);
    if (collide) this._staticCollision.push(g);
    return g;
  }

  /**
   * Place a kit piece ('town/wall-wood-door', world/KitLibrary.js): its parts join the static
   * batches of their kit material (texture UVs and colours kept; `tint` multiplies).
   * opts: { collide = true | false | 'box', castShadow = true, tint, variant, detail, retex } —
   * `variant` picks a recoloured palette of the kit (e.g. a roof colour, KitLibrary VARIANTS);
   * `detail` puts the parts into the distance-culled detail batches; `retex: { mat, scale }`
   * swaps the material for a tiling one (e.g. the village stone) with world-space planar UVs.
   */
  addKit(name, matrix, { collide = true, castShadow = true, tint = null, variant = null, detail = false, retex = null } = {}) {
    if (this._mute) return;
    const parts = this.kits.get(name);
    if (this._D) matrix = _dm.multiplyMatrices(this._D, matrix);
    if (tint !== null) _tint.set(tint);
    for (const part of parts) {
      const { geometry } = part;
      let mat = variant && this.mats[part.mat + '@' + variant] ? part.mat + '@' + variant : part.mat;
      const g = geometry.clone();
      g.applyMatrix4(matrix);
      if (retex && (!retex.only || retex.only === part.mat)) {
        planarUVs(g, retex.scale ?? 0.5);
        mat = retex.mat;
      }
      if (tint !== null) {
        const c = g.attributes.color;
        for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * _tint.r, c.getY(i) * _tint.g, c.getZ(i) * _tint.b);
      }
      this._pushBatch(g, mat, castShadow, detail);
      if (collide === true) this._staticCollision.push(g);
    }
    if (collide === 'box') {
      const b = this.kits.box(name);
      const size = b.getSize(_kv);
      const box = new THREE.BoxGeometry(Math.max(size.x, 0.05), Math.max(size.y, 0.05), Math.max(size.z, 0.05));
      box.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      box.applyMatrix4(matrix);
      this._staticCollision.push(box);
    }
  }

  _pushBatch(g, materialKey, castShadow, detail = false) {
    if (this._group?.batches) {
      // Map editor: each editable group keeps its own meshes so it can move live.
      const tier = detail ? 'd' : this.lodMode === 'near' ? 'n' : this.lodMode === 'far' ? 'f' : '';
      const key = `${materialKey}|${castShadow ? 1 : 0}|${tier}`;
      if (!this._group.batches.has(key)) this._group.batches.set(key, []);
      this._group.batches.get(key).push(g);
      return;
    }
    g.computeBoundingSphere();
    const tier = detail ? 'd' : this.lodMode === 'near' ? 'n' : this.lodMode === 'far' ? 'f' : '';
    const S = tier === 'd' ? DETAIL_CHUNK : tier ? LOD_CHUNK : CHUNK;
    const cx = Math.floor(g.boundingSphere.center.x / S), cz = Math.floor(g.boundingSphere.center.z / S);
    const key = `${materialKey}|${castShadow && tier !== 'd' && tier !== 'f' ? 1 : 0}|${cx},${cz}${tier ? '|' + tier : ''}`;
    if (!this._visualBatches.has(key)) this._visualBatches.set(key, []);
    this._visualBatches.get(key).push(g);
  }

  addCollisionOnly(geometry, matrix) {
    if (this._mute) return;
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(this._D ? _dm.multiplyMatrices(this._D, matrix) : matrix);
    this._staticCollision.push(g);
  }

  box(w, h, d, x, y, z, mat = 'stone', ry = 0, opts) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), new THREE.Quaternion().setFromAxisAngle(_up, ry), new THREE.Vector3(1, 1, 1));
    return this.addSolid(new THREE.BoxGeometry(w, h, d), m, mat, opts);
  }

  cylinder(rTop, rBot, h, x, y, z, mat = 'stone', seg = 14, opts) {
    const m = new THREE.Matrix4().makeTranslation(x, y + h / 2, z);
    return this.addSolid(new THREE.CylinderGeometry(rTop, rBot, h, seg), m, mat, opts);
  }

  /**
   * Map editor: turn a group's collected geometry into one scene object placed at the group's
   * layout transform (geometry stored relative to it), so the editor can move it live.
   */
  buildGroupObject(rec) {
    if (!rec.batches) return null;
    const obj = new THREE.Group();
    obj.name = 'group:' + rec.id;
    obj.rotation.order = 'YXZ';
    // A part hangs under its parent's object: local = parent pivot^-1 · M(its placement), both in
    // the parent's builder space, so moving the parent carries it along.
    const parentObj = rec.parent?.object;
    groupMatrix(rec.place, obj.matrix);
    if (parentObj) obj.matrix.premultiply(pivotMatrix(rec.parent.pivot).invert());
    obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    obj.rotation.setFromQuaternion(obj.quaternion, 'YXZ');
    (parentObj || this.scene).add(obj);
    obj.updateMatrixWorld(true);
    const inv = obj.matrixWorld.clone().invert();
    for (const [key, list] of rec.batches) {
      const [matKey, shadow, tier] = key.split('|');
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.applyMatrix4(inv);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mats[matKey]);
      mesh.castShadow = shadow === '1';
      mesh.receiveShadow = true;
      mesh.userData.groupId = rec.id;
      mesh.userData.tier = tier;
      if (tier === 'f') mesh.visible = false; // far proxies: the editor always shows the near model
      obj.add(mesh);
    }
    obj.userData.groupId = rec.id;
    rec.batches = null;
    rec.object = obj;
    return obj;
  }

  _flushVisualBatches() {
    if (this.editorMode) for (const rec of this.groups.values()) this.buildGroupObject(rec);
    for (const [key, list] of this._visualBatches) {
      const [matKey, shadow, cell, tier] = key.split('|');
      const merged = mergeGeometries(list, false);
      if (!merged) { console.warn('[world] batch did not merge', key); continue; }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mats[matKey]);
      mesh.castShadow = shadow === '1';
      mesh.receiveShadow = true;
      mesh.name = 'static:' + key;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      if (tier) {
        // Visibility by the cell (near / far versions of one cell swap exactly together).
        const S = tier === 'd' ? DETAIL_CHUNK : LOD_CHUNK;
        const [cx, cz] = cell.split(',').map(Number);
        const center = new THREE.Vector3((cx + 0.5) * S, merged.boundingSphere.center.y, (cz + 0.5) * S);
        if (tier === 'd') this.detailMeshes.push({ mesh, center, r: S * 0.71 });
        else this.lodMeshes.push({ mesh, center, r: S * 0.71, far: tier === 'f' });
      }
    }
    this._visualBatches.clear();
  }

  _buildCollider() {
    const geos = this._staticCollision.map((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', ng.attributes.position.clone());
      return out;
    });
    const merged = mergeGeometries(geos, false);
    merged.boundsTree = new MeshBVH(merged, { maxLeafTris: 8 });
    this.collider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.collider.name = 'Collider';
    this.collider.matrixAutoUpdate = false;
    this.collider.updateMatrixWorld(true);
    this._staticCollision = [];
  }

  // ---------------------------------------------------------------------------
  // Vegetation & grass
  // ---------------------------------------------------------------------------
  /** Is (x,z) free for scattered decoration (no structure, road, water, settlement)? */
  _freeForPlants(x, z, pad = 2) {
    if (cityDistance(x, z) < 12) return false; // the city and its wall
    if (roadInfo(x, z).d < 2 + pad) return false;
    if (riverDistance(x, z) < 2.5 + pad) return false;
    for (const L of LAKES) if (Math.hypot(x - L.center.x, z - L.center.z) < L.radius * 1.15) return false;
    for (const f of this._footprintsNear(x, z)) {
      const r = Math.max(f.w, f.d) / 2 + pad + 1.5;
      if (Math.abs(x - f.x) < r && Math.abs(z - f.z) < r) return false;
    }
    for (const R of REGIONS) {
      if (R.keepClear && Math.hypot(x - R.center.x, z - R.center.z) < R.keepClear) return false;
    }
    return true;
  }

  /** Footprints in the 16 m cell around (x,z) (grid built lazily, footprints are static). */
  _footprintsNear(x, z) {
    const S = 16;
    if (!this._fpGrid || this._fpCount !== this.footprints.length) {
      this._fpGrid = new Map();
      this._fpCount = this.footprints.length;
      for (const f of this.footprints) {
        const r = Math.max(f.w, f.d) / 2 + 5;
        for (let cx = Math.floor((f.x - r) / S); cx <= Math.floor((f.x + r) / S); cx++) {
          for (let cz = Math.floor((f.z - r) / S); cz <= Math.floor((f.z + r) / S); cz++) {
            const k = cx * 10007 + cz;
            if (!this._fpGrid.has(k)) this._fpGrid.set(k, []);
            this._fpGrid.get(k).push(f);
          }
        }
      }
    }
    return this._fpGrid.get(Math.floor(x / S) * 10007 + Math.floor(z / S)) || EMPTY;
  }

  /** Record one wild plant (Kit.js); the id is stable: kind + model + rounded position. */
  vegAdd(rec) {
    const base = `${rec.kind}:${rec.model.split('/').pop()}@${Math.round(rec.x)},${Math.round(rec.z)}`;
    const n = (this._vegIds.get(base) || 0) + 1;
    this._vegIds.set(base, n);
    rec.id = n > 1 ? base + '#' + n : base;
    this.veg.push(rec);
  }

  /** Build the recorded vegetation: layout.vegetation overrides (move / turn / scale / delete) and
   * layout.erase circles apply here. In the editor deleted plants are kept hidden so they can come back. */
  _realizeVegetation() {
    const L = this.layout;
    const over = L.vegetation || {}, erase = L.erase || [];
    for (const r of this.veg) {
      const o = over[r.id];
      const erased = erase.some((c) => Math.hypot(r.x - c.x, r.z - c.z) < c.r);
      const gone = !!o?.deleted || (erased && !o);
      if (gone && !this.editorMode) continue;
      const T = { x: o?.x ?? r.x, z: o?.z ?? r.z, rot: o?.rot ?? r.rot, s: o?.s ?? 1, dy: o?.dy ?? 0 };
      r.item = r.emit(T);
      if (r.item) { r.item.rec = r; if (gone) r.item.hidden = true; }
      r.gone = gone;
    }
  }

  _buildVegetation() {
    const rng = this.rng;
    const kitTree = tree;
    const clearings = [REGION.hunters, REGION.glade, REGION.goblin_den, REGION.farms, REGION.olkhovka, REGION.astrarium, REGION.watchtower, REGION.cave, REGION.old_mines, REGION.crimson_gorge, REGION.crossroads, REGION.guild_field, REGION.east_pass];
    const inClearing = (x, z, extra = 0) => clearings.some((R) => Math.hypot(x - R.center.x, z - R.center.z) < (R.clear ?? R.r * 0.75) + extra);
    // Random point inside a forest polygon.
    const inForest = (f) => {
      const b = FOREST_BOX[FORESTS.indexOf(f)];
      for (let k = 0; k < 30; k++) {
        const x = b[0] + rng() * (b[2] - b[0]), z = b[1] + rng() * (b[3] - b[1]);
        if (polygonDistance(f.pts, x, z) < 0) return [x, z];
      }
      return null;
    };
    // Forests: trees per hectare by kind (budget ≈ 2 000 for the whole map; TreeField instances them).
    const KIND = { mixed: [70, ['oak', 'oak', 'pine', 'birch']], dark: [120, ['dark', 'pine', 'dark']], alder: [110, ['oak', 'birch', 'oak', 'birch', 'oak']], pine: [40, ['pine', 'pine', 'pine', 'dark']] };
    for (const f of FORESTS) {
      const [perHa, kinds] = KIND[f.kind] || KIND.mixed;
      const count = Math.round((polyArea(f.pts) / 10000) * perHa);
      let placed = 0;
      for (let i = 0; i < count * 4 && placed < count; i++) {
        const p = inForest(f);
        if (!p) continue;
        const [x, z] = p;
        if (!this._freeForPlants(x, z, 1) || inClearing(x, z) || this.heightAt(x, z) > 32) continue;
        kitTree(this, x, z, 0.85 + rng() * 0.7, rng, kinds[Math.floor(rng() * kinds.length)]);
        placed++;
      }
    }
    // Scattered trees, groves and bushes across the valley.
    let placed = 0;
    for (let i = 0; i < 16000 && placed < 520; i++) {
      const x = (rng() * 2 - 1) * (HALF - 60), z = (rng() * 2 - 1) * (HALF - 60);
      if (!this._freeForPlants(x, z, 2) || inClearing(x, z, 6)) continue;
      const y = this.heightAt(x, z);
      if (y > 30) continue;
      const grove = fbm(x * 0.02 + 7, z * 0.02 - 3, 2);
      if (rng() > 0.25 + grove * 0.9) continue;
      const kind = y > 14 ? 'pine' : rng() < 0.15 ? 'birch' : 'oak';
      kitTree(this, x, z, 0.8 + rng() * 0.6, rng, kind);
      placed++;
    }
    for (let i = 0; i < 2600; i++) {
      const x = (rng() * 2 - 1) * (HALF - 70), z = (rng() * 2 - 1) * (HALF - 70);
      if (!this._freeForPlants(x, z, 1)) continue;
      const y = this.heightAt(x, z);
      if (y > 26) continue;
      if (rng() < 0.6) bush(this, x, z, 0.8 + rng() * 0.8, rng);
      else rock(this, x, z, 0.4 + rng() * 1.4, rng);
    }
    // Meadow flowers (in drifts), forest floor: mushrooms, stumps, fallen logs.
    const FLOWERS = ['flower_redA', 'flower_redB', 'flower_yellowA', 'flower_yellowB', 'flower_yellowC', 'flower_purpleA', 'flower_purpleB', 'flower_redC', 'flower_purpleC'];
    for (let i = 0; i < 11000; i++) {
      const x = (rng() * 2 - 1) * (HALF - 80), z = (rng() * 2 - 1) * (HALF - 80);
      if (fbm(x * 0.03 + 11, z * 0.03 - 5, 2) < 0.25) continue;
      if (this.heightAt(x, z) > 22 || !this._freeForPlants(x, z, 0.3)) continue;
      const kind = FLOWERS[Math.floor((fbm(x * 0.01, z * 0.01, 1) * 0.5 + 0.5) * FLOWERS.length) % FLOWERS.length];
      decor(this, x, z, kind, 0.35 + rng() * 0.25, rng);
    }
    const floor = (x, z) => {
      if (!this._freeForPlants(x, z, 0.5)) return;
      const k = rng();
      if (k < 0.6) decor(this, x, z, pick(['mushroom_red', 'mushroom_redGroup', 'mushroom_tan', 'mushroom_tanGroup', 'mushroom_redTall', 'mushroom_tanTall'], rng), 0.25 + rng() * 0.35, rng);
      else if (k < 0.85) decor(this, x, z, pick(['stump_old', 'stump_round', 'stump_roundDetailed', 'stump_oldTall'], rng), 0.5 + rng() * 0.5, rng);
      else decor(this, x, z, pick(['log', 'log_large'], rng), 0.55, rng, { castShadow: true });
    };
    for (const f of FORESTS) {
      const n = Math.round((polyArea(f.pts) / 10000) * (f.kind === 'pine' ? 15 : 40));
      for (let i = 0; i < n; i++) { const p = inForest(f); if (p) floor(p[0], p[1]); }
    }
    const G = REGION.glade.center;
    for (let i = 0; i < 40; i++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 20; floor(G.x + Math.cos(a) * r, G.z + Math.sin(a) * r); }
  }

  _buildGrass() {
    const patches = [];
    const add = (x, z, r, count, opt = {}) => patches.push({ x, z, r, count, ...opt });
    const notFree = (x, z) => !this._freeForPlants(x, z, -1.2);
    const R = (id) => REGION[id].center;
    // Meadows round the city, the farms, the east fields and the forest edge; the settlements.
    add(-330, 20, 190, 26000, { skip: notFree });
    add(R('farms').x, R('farms').z, 75, 8000, { skip: notFree, hue: 0.2 });
    add(-60, 0, 100, 8000, { skip: notFree, hue: 0.19 });
    add(-540, 60, 90, 8000, { skip: notFree, hue: 0.24, scale: 1.2 });
    add(R('crossroads').x, R('crossroads').z, 45, 2500, { skip: notFree, hue: 0.2 });
    add(R('alder_wood').x, R('alder_wood').z, 75, 4500, { skip: notFree, hue: 0.26, scale: 1.15 });
    add(R('olkhovka').x, R('olkhovka').z, 60, 4500, { skip: notFree, hue: 0.18 });
    add(R('watchtower').x, R('watchtower').z, 40, 2500, { skip: notFree });
    add(R('glade').x, R('glade').z, 16, 1600, { skip: notFree, hue: 0.28, scale: 1.25 });
    add(R('mist_lake').x, R('mist_lake').z, 70, 4000, { skip: notFree, hue: 0.24 });
    add(R('astrarium').x, R('astrarium').z, 50, 2500, { skip: notFree, hue: 0.16, scale: 0.9 });
    // Gardens and yards inside the walls (never on the paving or in the houses).
    if (this.cityGround) add(-330, 20, 125, 6000, { hue: 0.22, scale: 0.8, skip: (x, z) => !this.cityGround(x, z) });
    this.grass = createGrass(this, patches);
    this.scene.add(this.grass.mesh);
    this.updatables.push(this.grass);
    // Wheat fields: taller golden stalks in their own instanced mesh.
    if (this.fields?.length) {
      const crops = this.fields.map((f) => ({ ...f, scale: 1, hue: 0.11, sat: 0.25, light: 0.75 }));
      this.crops = createGrass(this, crops, { height: 0.95, width: 0.09, base: 0x8a6a22, tip: 0xf2d27a });
      this.scene.add(this.crops.mesh);
      this.updatables.push(this.crops);
    }
  }

  // ---------------------------------------------------------------------------
  // Lights
  // ---------------------------------------------------------------------------
  _buildLightPool() {
    this.pool = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 10, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.pool.push(l);
    }
    this._poolTimer = 0;
    this._poolTime = 0;
  }

  /** Assign the pooled point lights to the light sources nearest to the player. */
  _updateLightPool(dt, playerPos) {
    this._poolTime += dt;
    this._poolTimer -= dt;
    if (this._poolTimer <= 0) {
      this._poolTimer = 0.4;
      const night = this.nightFactor;
      const cand = [];
      for (const s of this.lightSources) {
        const weight = s.always ? 1 : s.night ? night : 1;
        if (weight < 0.05) continue;
        const d = s.pos.distanceTo(playerPos);
        if (d < 60) cand.push([d, s]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      this._assigned = cand.slice(0, this.pool.length).map((c) => c[1]);
    }
    const night = this.nightFactor;
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      const s = this._assigned?.[i];
      if (!s) {
        l.intensity = 0;
        continue;
      }
      const weight = s.always ? 1 : s.night ? night : 1;
      const fl = s.flicker ? 0.85 + Math.sin(this._poolTime * 13 + i) * 0.08 + Math.sin(this._poolTime * 23.7 + i * 2) * 0.07 : 1;
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.distance = s.distance;
      l.intensity = s.intensity * weight * fl;
    }
  }

  // ---------------------------------------------------------------------------
  /** Raycast against static world geometry. Returns the first hit or null. */
  raycast(origin, dir, far) {
    _rc.set(origin, dir);
    _rc.far = far;
    const hits = _rc.intersectObject(this.collider, false);
    return hits[0] || null;
  }

  /** Ground height under (x,z) including structures (from `fromY` downward). */
  groundAt(x, z, fromY = 80) {
    _o.set(x, fromY, z);
    const hit = this.raycast(_o, _dn, fromY + 50);
    return hit ? hit.point.y : this.heightAt(x, z);
  }

  update(dt, ctx) {
    for (const u of this.updatables) u.update(dt, ctx);
    this._updateLightPool(dt, ctx.playerPos);
    if (ctx.camera) {
      // Small building parts only near the camera (the walls keep their window panes).
      const cp = ctx.camera.position, D = this.detailDistance, L = this.lodDistance;
      for (const d of this.detailMeshes) d.mesh.visible = Math.hypot(d.center.x - cp.x, d.center.z - cp.z) - d.r < D;
      for (const d of this.lodMeshes) d.mesh.visible = (Math.hypot(d.center.x - cp.x, d.center.z - cp.z) - d.r < L) !== d.far;
    }
    if (ctx.camera) this.trees.update(dt, ctx.camera);
    // Chimney smoke near the player (daytime cooking fires, evenings).
    const vfx = ctx.vfx;
    if (vfx && this.chimneys.length) {
      this._smokeAcc = (this._smokeAcc || 0) + dt * 6;
      while (this._smokeAcc > 1) {
        this._smokeAcc -= 1;
        const c = this.chimneys[(Math.random() * this.chimneys.length) | 0];
        if (c.distanceTo(ctx.playerPos) < 70) vfx.emit('brazierSmoke', c);
      }
    }
  }
}

const _rc = new THREE.Raycaster();
_rc.firstHitOnly = true;
const _o = new THREE.Vector3();
const _dn = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _tint = new THREE.Color();
const _kv = new THREE.Vector3();
const _dm = new THREE.Matrix4();

/** Final placement of a group: { x, y, z, rot, s } (y = ground at the new spot + dy). */
function layoutTransform(world, p, o) {
  const x = o.x ?? p.x, z = o.z ?? p.z;
  return { x, z, y: world.heightAt(x, z) + (o.dy ?? 0), rot: o.rot ?? p.rot, s: o.s ?? 1 };
}

/** M(T): translation to the placement (y = ground + dy) · yaw · uniform scale. */
function groupMatrix(T, target = new THREE.Matrix4()) {
  return target.makeRotationY(T.rot).scale(_sv.set(T.s, T.s, T.s)).setPosition(T.x, T.y, T.z);
}
/** M(pivot) of a group as the builder placed it. */
function pivotMatrix(p) {
  return new THREE.Matrix4().makeRotationY(p.rot).setPosition(p.x, p.y, p.z);
}
const _sv = new THREE.Vector3();
export { groupMatrix, pivotMatrix };

/** Matrix taking a group from its builder pivot to its layout placement. */
function groupDelta(p, T) {
  const m = new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z);
  m.premultiply(new THREE.Matrix4().makeScale(T.s, T.s, T.s));
  m.premultiply(new THREE.Matrix4().makeRotationY(T.rot - p.rot));
  m.premultiply(new THREE.Matrix4().makeTranslation(T.x, T.y, T.z));
  return m;
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const EMPTY = [];
const polyArea = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** World-space planar UV projection per face (cheap triplanar bake). */
function planarUVs(g, scale) {
  const pos = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) { uv[i * 2] = x * scale; uv[i * 2 + 1] = z * scale; }
    else if (nx >= nz) { uv[i * 2] = z * scale; uv[i * 2 + 1] = y * scale; }
    else { uv[i * 2] = x * scale; uv[i * 2 + 1] = y * scale; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export { GRID_STEP };
