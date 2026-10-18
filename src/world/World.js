import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { fbm, mulberry32, smoothstep, clamp } from '../core/math.js';
import { createSky } from './Sky.js';
import { createGrass } from './Grass.js';
import { Signpost, ModelChest } from './Interactables.js';
import { CITY_WALL as AIN_WALL, toWorld as AIN_TO_WORLD, SHEET as AIN_SHEET, TRAKT as AIN_TRAKT, ORIGIN as AIN_ORIGIN } from './AinstreyPlan.js';
import { HALF, REGIONS, REGION, RIVERS, LAKES, LAVA, CAMPS, SIGNS, FORESTS, regionContains } from './MapData.js';
import { Heightfield, GRID_N, GRID_STEP, roadInfo, riverDistance, surfaceAt, polygonDistance } from './Terrain.js';
import { cityDistance, forestAt, planeNormals, shadeTerrain, FOREST_BOX, CITIES } from './terrainShade.js';
import { WALL, toWorld } from './AxelPlan.js';
import { createWaterSurface, riverGeometry, lakeGeometry } from './Water.js';
import { createLava } from './Surfaces.js';
import { makeNoiseTexture, makePavingTextures } from './textures.js';
import { buildTown } from './build/Town.js';
import { buildCountryside } from './build/Countryside.js';
import { buildAinstrey } from './build/Ainstrey.js';
import { buildLedge } from './build/AinstreyLedge.js';
import { buildCity } from './build/AinstreyCity.js';
import { buildDungeon, DUNGEON } from './build/Dungeon.js';
import { buildCrypt } from './build/Crypt.js';
import { buildRelay } from './build/Relay.js';
import { buildDrain } from './build/Drain.js';
import { buildPump } from './build/Pump.js';
import { buildCore } from './build/Core.js';
import { buildSideProps } from './build/SideProps.js';
import { buildPlacement } from './build/Placements.js';
import { TreeField } from './TreeField.js';
import { STREAM_CELL } from './CityStream.js';
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

export { cityDistance, forestAt } from './terrainShade.js';

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
    this.keepClear = []; // no plants here (the Stone Ledge work area): { x, z, r }
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
    this.stream = null; // CityStream: near models of a big city built on demand round the camera (Ainstrey)
    this._streamSink = null; // while the stream builds a cell: material key -> geometries (no batches, no collision)
    this._forceCell = null; // { x, z }: put the LOD parts of one building into this cell (near and far swap together)
    this._bigChunk = 0; // > 0: static cell size while a dense city is built
    this.terrainChunks = [];
    this.viewScale = 1; // fog / far-plane scale (DayNight): 1 on the old map, larger in the open country of the Ainstrey sheet
    this.viewTarget = 1;
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
      if (regionContains(R, p.x, p.z) && (!best || R.r < best.r)) best = R;
    }
    return best;
  }

  build() {
    // build times of the big steps (ms), for the load-time report: window.__game.world.buildTimes
    const times = (this.buildTimes = {});
    const T = (name, fn) => { const t = performance.now(); fn(); times[name] = Math.round(performance.now() - t); };
    T('sky', () => this._setupSkyAndLights());
    T('materials', () => { this._buildMaterials(); Object.assign(this.mats, this.kits.materials); });
    T('heightfield', () => { this.heightfield = new Heightfield(this.heightData); this.heightData = null; }); // grids from the workers (Game.init)
    T('terrain', () => this._buildTerrain());
    T('water', () => this._buildWater());
    T('town', () => buildTown(this));
    T('countryside', () => buildCountryside(this));
    T('ainstrey', () => buildAinstrey(this));
    T('ledge', () => buildLedge(this));
    T('city', () => buildCity(this));
    T('dungeon', () => { buildDungeon(this); buildCrypt(this); buildRelay(this); buildDrain(this); buildPump(this); buildCore(this); });
    T('props', () => {
      buildSideProps(this);
      for (const a of this.layout.added || []) buildPlacement(this, a);
      SIGNS.forEach(([x, z, rot, lines], i) => this.group('sign_' + i, { x, z, rot }, () => this.addSign(new THREE.Vector3(x, 0, z), rot, lines), 'Указатель: ' + lines[0].slice(0, 34)));
      for (const c of CAMPS) this.camp(c.type, c.x, c.z, c.camp);
    });
    T('vegetation', () => { this._buildVegetation(); this._realizeVegetation(); });
    T('flush', () => this._flushVisualBatches());
    T('trees', () => this.trees.build(this.scene));
    T('collider', () => this._buildCollider());
    T('grass', () => this._buildGrass());
    T('lights', () => this._buildLightPool());
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
      lawn: M({ color: 0x5f8a3e, roughness: 0.97, map: noise2 }),
      // the far city: plaster with windows, shutters and floor beams (4 bays x 2 storeys a tile); the panes glow at night
      facade: (() => { const t = makeFacadeTextures(); return M({ color: 0xffffff, roughness: 0.92, map: t.map, emissiveMap: t.glow, emissive: new THREE.Color(1.0, 0.62, 0.28), emissiveIntensity: 0 }); })(),
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
    this.terrainColors = null;
    for (const sh of this.heightfield.sheets) this._buildTerrainSheet(sh);
  }

  /** One height grid -> chunked meshes (frustum culling) + the colours of the ground. */
  _buildTerrainSheet(sh) {
    const main = sh.id === 'main';
    const NX = sh.nx, NZ = sh.nz;
    const sizeX = (NX - 1) * sh.step, sizeZ = (NZ - 1) * sh.step;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, NX - 1, NZ - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(sh.x0 + sizeX / 2, 0, sh.z0 + sizeZ / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, sh.data[i]);
    // normals and ground colours: from the worker that computed the heights (Heightfield.compute), else here (terrainShade.js)
    const normals = sh.normals || planeNormals(sh, sh.data);
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const colors = sh.colors || shadeTerrain(sh, sh.data, normals);
    sh.normals = sh.colors = null;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.25, pos.getZ(i) * 0.25);
    this.terrainMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: this.noiseTex });
    const mat = this.terrainMaterial;
    // Chunks (frustum culling): each a slice of the full grid with the shared normals/colours.
    const nrmA = geo.attributes.normal.array, posA = pos.array, uvA = geo.attributes.uv.array;
    for (let cj = 0; cj < NZ - 1; cj += TERRAIN_CHUNK) {
      for (let ci = 0; ci < NX - 1; ci += TERRAIN_CHUNK) {
        const w = Math.min(TERRAIN_CHUNK, NX - 1 - ci) + 1, h = Math.min(TERRAIN_CHUNK, NZ - 1 - cj) + 1;
        const P = new Float32Array(w * h * 3), Nn = new Float32Array(w * h * 3), Cc = new Float32Array(w * h * 3), U = new Float32Array(w * h * 2);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const src = (cj + j) * NX + ci + i, dst = j * w + i;
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
    // Low-res colour copy for the map screen (the old map; the Ainstrey sheet keeps its own).
    if (main) this.terrainColors = colors;
    else (this.sheetColors ??= {})[sh.id] = colors;
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
  addSolid(geometry, matrix, materialKey, { collide = true, castShadow = true, tint = null, collideOnly = false, detail = false, keepUV = false } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (this._mute) return g;
    g.boundingBox = g.boundingSphere = null; // applyMatrix4 would recompute them over every vertex
    g.applyMatrix4(this._D ? _dm.multiplyMatrices(this._D, matrix) : matrix);
    if (collideOnly) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', g.attributes.position);
      this._staticCollision.push(cg);
      return g;
    }
    if (!keepUV) planarUVs(g, 0.5);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const tc = _tint.set(tint ?? this.baseTint[materialKey] ?? 0xffffff);
    for (let i = 0; i < n; i++) { col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this._pushBatch(g, materialKey, castShadow, detail);
    if (collide && !this._streamSink) this._staticCollision.push(g);
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
  addKit(name, matrix, { collide = true, castShadow = true, tint = null, variant = null, detail = false, retex = null, tintOnly = null } = {}) {
    if (this._mute) return;
    if (this._streamSink) collide = false;
    const parts = this.kits.get(name);
    if (this._D) matrix = _dm.multiplyMatrices(this._D, matrix);
    if (tint !== null) _tint.set(tint);
    for (const part of parts) {
      const { geometry } = part;
      let mat = variant && this.mats[part.mat + '@' + variant] ? part.mat + '@' + variant : part.mat;
      const g = geometry.clone();
      g.boundingBox = g.boundingSphere = null; // (applyMatrix4 recomputes existing bounds over every vertex: tens of thousands of pieces)
      g.applyMatrix4(matrix);
      if (!part.center) { geometry.computeBoundingBox(); part.center = geometry.boundingBox.getCenter(new THREE.Vector3()); }
      const center = _kc.copy(part.center).applyMatrix4(matrix);
      if (retex && (!retex.only || retex.only === part.mat)) {
        planarUVs(g, retex.scale ?? 0.5);
        mat = retex.mat;
      }
      if (tint !== null && (!tintOnly || part.mat.includes(tintOnly))) {
        const c = g.attributes.color;
        for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * _tint.r, c.getY(i) * _tint.g, c.getZ(i) * _tint.b);
      }
      this._pushBatch(g, mat, castShadow, detail, center);
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

  /** `center`: where the piece is (world) when the caller knows it; else the centre of its bounds. */
  _pushBatch(g, materialKey, castShadow, detail = false, center = null) {
    if (this._streamSink) {
      const key = materialKey + '|1'; // one mesh per material and cell (small parts cast shadows too)
      if (!this._streamSink.has(key)) this._streamSink.set(key, []);
      this._streamSink.get(key).push(g);
      return;
    }
    if (this._group?.batches) {
      // Map editor: each editable group keeps its own meshes so it can move live.
      const tier = detail ? 'd' : this.lodMode === 'near' ? 'n' : this.lodMode === 'far' || this.lodMode === 'stream' ? 'f' : '';
      const key = `${materialKey}|${castShadow ? 1 : 0}|${tier}`;
      if (!this._group.batches.has(key)) this._group.batches.set(key, []);
      this._group.batches.get(key).push(g);
      return;
    }
    if (!center) { g.computeBoundingBox(); center = g.boundingBox.getCenter(_kc); }
    // 's' = the far proxy of a streamed building (CityStream): hidden while the near model of its stream cell exists
    const tier = this.lodMode === 'stream' ? 's' : detail ? 'd' : this.lodMode === 'near' ? 'n' : this.lodMode === 'far' ? 'f' : '';
    // `_bigChunk`: a dense big city (Ainstrey) batches its static pieces in coarser cells (fewer draw calls when it is seen whole)
    const big = !tier && this._bigChunk;
    const S = tier === 'd' ? DETAIL_CHUNK : tier === 's' ? STREAM_CELL : tier ? LOD_CHUNK : big || CHUNK;
    const c = tier && tier !== 'd' && this._forceCell ? this._forceCell : center;
    const cx = Math.floor(c.x / S), cz = Math.floor(c.z / S);
    const key = `${materialKey}|${castShadow && tier !== 'd' && tier !== 'f' && tier !== 's' ? 1 : 0}|${big ? 'B' : ''}${cx},${cz}${tier ? '|' + tier : ''}`;
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
      const merged = mergeMixed(list);
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
      const merged = mergeMixed(list);
      if (!merged) { console.warn('[world] batch did not merge', key); continue; }
      fastBounds(merged);
      const mesh = new THREE.Mesh(merged, this.mats[matKey]);
      mesh.castShadow = shadow === '1';
      mesh.receiveShadow = true;
      mesh.name = 'static:' + key;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      if (tier) {
        // Visibility by the cell (near / far versions of one cell swap exactly together).
        const S = tier === 'd' ? DETAIL_CHUNK : tier === 's' ? STREAM_CELL : LOD_CHUNK;
        const [cx, cz] = cell.split(',').map(Number);
        const center = new THREE.Vector3((cx + 0.5) * S, merged.boundingSphere.center.y, (cz + 0.5) * S);
        if (tier === 'd') this.detailMeshes.push({ mesh, center, r: S * 0.71 });
        else this.lodMeshes.push({ mesh, center, r: S * 0.71, far: tier !== 'n', stream: tier === 's', cell });
      }
    }
    this._visualBatches.clear();
  }

  _buildCollider() {
    // one triangle soup of every collider piece, written straight into a single array
    let n = 0;
    for (const g of this._staticCollision) n += g.index ? g.index.count : g.attributes.position.count;
    const out = new Float32Array(n * 3);
    let o = 0;
    for (const g of this._staticCollision) {
      const p = g.attributes.position, a = p.array, st = p.isInterleavedBufferAttribute ? p.data.stride : p.itemSize, off = p.offset || 0;
      if (g.index) {
        const ix = g.index.array;
        for (let i = 0; i < g.index.count; i++) { const k = ix[i] * st + off; out[o++] = a[k]; out[o++] = a[k + 1]; out[o++] = a[k + 2]; }
      } else {
        for (let i = 0; i < p.count; i++) { const k = i * st + off; out[o++] = a[k]; out[o++] = a[k + 1]; out[o++] = a[k + 2]; }
      }
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(out, 3));
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
    for (const K of this.keepClear) {
      if (K.poly) { if (polygonDistance(K.poly, x, z) < (K.margin ?? 0) + pad) return false; } else if (Math.hypot(x - K.x, z - K.z) < K.r + pad) return false;
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
    this._buildAinstreyVegetation(rng, inClearing);
  }

  /** The Ainstrey sheet: groves and bushes on the plain, scrub and rocks on the chalk slopes, meadow flowers. */
  _buildAinstreyVegetation(rng, inClearing) {
    const S = AIN_SHEET, m = 120;
    const rx = () => S.x0 + m + rng() * (S.x1 - S.x0 - 2 * m), rz = () => S.z0 + m + rng() * (S.z1 - S.z0 - 2 * m);
    let placed = 0;
    for (let i = 0; i < 40000 && placed < 700; i++) {
      const x = rx(), z = rz();
      if (!this._freeForPlants(x, z, 2) || inClearing(x, z, 6)) continue;
      const y = this.heightAt(x, z);
      if (y > 34 || y < 0.9) continue;
      const grove = fbm(x * 0.02 + 7, z * 0.02 - 3, 2);
      if (rng() > 0.2 + grove * 0.9) continue;
      tree(this, x, z, 0.8 + rng() * 0.6, rng, y > 18 ? 'pine' : rng() < 0.2 ? 'birch' : 'oak');
      placed++;
    }
    for (let i = 0; i < 3200; i++) {
      const x = rx(), z = rz();
      if (!this._freeForPlants(x, z, 1)) continue;
      const y = this.heightAt(x, z);
      if (y > 30 || y < 0.6) continue;
      if (rng() < (y > 8 ? 0.45 : 0.65)) bush(this, x, z, 0.8 + rng() * 0.8, rng);
      else rock(this, x, z, 0.4 + rng() * 1.6, rng);
    }
    const FLOWERS = ['flower_redA', 'flower_yellowA', 'flower_yellowB', 'flower_purpleA', 'flower_redB', 'flower_yellowC'];
    for (let i = 0; i < 7000; i++) {
      const x = rx(), z = rz();
      if (fbm(x * 0.03 + 11, z * 0.03 - 5, 2) < 0.25) continue;
      if (this.heightAt(x, z) > 22 || !this._freeForPlants(x, z, 0.3)) continue;
      decor(this, x, z, FLOWERS[Math.floor(rng() * FLOWERS.length)], 0.35 + rng() * 0.25, rng);
    }
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
    // Ainstrey: meadows along the road, the mills and the dam.
    for (let i = 0; i < AIN_TRAKT.length; i += 4) { const [x, z] = AIN_TO_WORLD(...AIN_TRAKT[i]); add(x, z, 85, 3200, { skip: notFree, hue: 0.19 }); }
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
      const st = this.stream;
      if (st) st.update(cp, L);
      // A streamed far proxy stays until the near model of its cell is ready (no holes while it builds).
      for (const d of this.lodMeshes) {
        if (d.stream) d.mesh.visible = !st?.ready(d.cell);
        else d.mesh.visible = (Math.hypot(d.center.x - cp.x, d.center.z - cp.z) - d.r < L) !== d.far;
      }
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
const _kc = new THREE.Vector3(); // the batch cell centre of a piece (_pushBatch)
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
/**
 * The tile of the far facades (World mats.facade): 8 window bays x 4 storeys of cream plaster (white-ish: the vertex tint gives
 * the house its colour). Every storey row has its own manner (half-timbered, plain with stone sills, arched windows, pairs of
 * narrow windows), the bays differ (shutters open or shut, flower boxes, a blind bay now and then) and the plaster has patches,
 * so neighbouring houses that start at other bays and rows (AinstreyBuildings facadeBox) do not repeat one another. The glow
 * map lights about half of the panes at night.
 */
function makeFacadeTextures() {
  const BW = 64, SH = 96, NB = 8, NS = 4, W = BW * NB, Hh = SH * NS;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; return c; };
  const c = mk(), g = c.getContext('2d'), cg = mk(), gg = cg.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#f2ece0'; g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 60; i++) { const v = 228 + Math.floor(rnd() * 22); g.fillStyle = `rgba(${v},${v - 8},${v - 20},0.55)`; g.fillRect(rnd() * W, rnd() * Hh, 20 + rnd() * 70, 14 + rnd() * 50); }
  for (let i = 0; i < 1600; i++) { const v = 222 + Math.floor(rnd() * 28); g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.fillRect(rnd() * W, rnd() * Hh, 2 + rnd() * 5, 2 + rnd() * 4); }
  gg.fillStyle = '#000'; gg.fillRect(0, 0, W, Hh);
  const TIMBER = '#6a4a32', SHUT = ['#4a6a4a', '#7a4a34', '#3a5a7a', '#6a5a3a', '#5a3a4a'];
  for (let f = 0; f < NS; f++) {
    const y0 = f * SH, manner = f; // 0 half-timbered, 1 plain + stone sills, 2 arched, 3 pairs of narrow windows
    if (manner === 0) {
      g.fillStyle = TIMBER; g.fillRect(0, y0, W, 6);
      for (let b = 0; b <= NB; b++) g.fillRect(b * BW - 3, y0, 6, SH);
      g.strokeStyle = TIMBER; g.lineWidth = 5;
      for (let b = 0; b < NB; b++) if (rnd() < 0.5) { g.beginPath(); const l = rnd() < 0.5; g.moveTo(b * BW + (l ? 3 : BW - 3), y0 + SH * 0.86); g.lineTo(b * BW + (l ? BW * 0.26 : BW * 0.74), y0 + SH * 0.62); g.stroke(); }
    } else {
      g.fillStyle = manner === 2 ? '#d8ccb4' : '#e2d8c4'; g.fillRect(0, y0, W, 5); // a string course
    }
    for (let b = 0; b < NB; b++) {
      if (rnd() < 0.09) continue; // a blind bay
      const pane = (x, y, wx, wy, arch) => {
        g.fillStyle = '#5a3c28'; g.fillRect(x - 3, y - 3, wx + 6, wy + 6);
        if (arch) { g.beginPath(); g.arc(x + wx / 2, y, wx / 2 + 3, Math.PI, 0); g.fill(); }
        g.fillStyle = '#2a3440'; g.fillRect(x, y, wx, wy);
        if (arch) { g.beginPath(); g.arc(x + wx / 2, y, wx / 2, Math.PI, 0); g.fill(); }
        g.fillStyle = '#5a3c28'; g.fillRect(x + wx / 2 - 1, y, 2, wy); g.fillRect(x, y + wy * 0.45, wx, 2);
        if (rnd() < 0.55) { gg.fillStyle = '#fff'; gg.fillRect(x, y - (arch ? wx / 2 : 0), wx, wy + (arch ? wx / 2 : 0)); }
      };
      const shutters = (x, y, wx, wy) => { if (rnd() < 0.5) { g.fillStyle = SHUT[Math.floor(rnd() * SHUT.length)]; const sw = BW * 0.14; if (rnd() < 0.3) g.fillRect(x, y - 3, wx, wy + 6); else { g.fillRect(x - 3 - sw, y - 3, sw, wy + 6); g.fillRect(x + wx + 3, y - 3, sw, wy + 6); } } };
      const sill = (x, y, wx) => { g.fillStyle = '#c8bca4'; g.fillRect(x - 5, y, wx + 10, 4); };
      const flowers = (x, y, wx) => { if (rnd() < 0.3) { g.fillStyle = '#5a3c28'; g.fillRect(x - 2, y, wx + 4, 6); for (let k = 0; k < 6; k++) { g.fillStyle = ['#c84a4a', '#e8c84a', '#d86aa8', '#4a8a3a'][Math.floor(rnd() * 4)]; g.beginPath(); g.arc(x + 2 + k * (wx / 5.5), y - 1, 3, 0, 7); g.fill(); } } };
      if (manner === 3) {
        for (const k of [0, 1]) { const x = b * BW + BW * (0.2 + k * 0.36), wx = BW * 0.24, y = y0 + SH * 0.26, wy = SH * 0.5; pane(x, y, wx, wy, false); sill(x, y + wy + 3, wx); }
        flowers(b * BW + BW * 0.2, y0 + SH * 0.26 + SH * 0.5 + 3, BW * 0.6);
      } else {
        const arch = manner === 2, x = b * BW + BW * 0.3, wx = BW * 0.4, y = y0 + SH * (arch ? 0.36 : 0.28), wy = SH * (arch ? 0.4 : 0.46);
        shutters(x, y, wx, wy);
        pane(x, y, wx, wy, arch);
        sill(x, y + wy + 3, wx);
        flowers(x, y + wy + 3, wx);
      }
    }
  }
  const tex = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(c, true), glow: tex(cg, true) };
}

/**
 * Merge static pieces into one geometry: the same attributes in every piece, indexed or not (a kit material used by a plain box):
 * the result is indexed when any piece is. Typed arrays are filled in one go (three's mergeGeometries pushes every index into a JS
 * array: with the big city that was most of the load time); interleaved or mismatched pieces fall back to it.
 */
export function mergeMixed(list) {
  if (!list.length) return null;
  const names = Object.keys(list[0].attributes);
  const simple = list.every((g) => {
    const a = g.attributes;
    if (Object.keys(a).length !== names.length) return false;
    for (const n of names) {
      const x = a[n], f = list[0].attributes[n];
      if (!x || x.isInterleavedBufferAttribute || x.itemSize !== f.itemSize || x.normalized !== f.normalized || x.array.constructor !== f.array.constructor) return false;
    }
    return true;
  });
  const indexed = list.some((g) => g.index);
  if (!simple) {
    if (indexed && list.some((g) => !g.index)) list = list.map((g) => (g.index ? g : withIndex(g)));
    return mergeGeometries(list, false);
  }
  let verts = 0, idx = 0;
  for (const g of list) { verts += g.attributes.position.count; idx += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const f = list[0].attributes[n];
    const arr = new f.array.constructor(verts * f.itemSize);
    let o = 0;
    for (const g of list) { const a = g.attributes[n]; arr.set(a.array.length === a.count * a.itemSize ? a.array : a.array.subarray(0, a.count * a.itemSize), o); o += a.count * a.itemSize; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, f.itemSize, f.normalized));
  }
  if (indexed) {
    const ix = new (verts > 65535 ? Uint32Array : Uint16Array)(idx);
    let o = 0, base = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      if (g.index) { const a = g.index.array, c = g.index.count; for (let k = 0; k < c; k++) ix[o++] = a[k] + base; }
      else for (let k = 0; k < n; k++) ix[o++] = base + k;
      base += n;
    }
    out.setIndex(new THREE.BufferAttribute(ix, 1));
  }
  return out;
}

function withIndex(g) {
  const n = g.attributes.position.count, ix = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) ix[i] = i;
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  return g;
}

/** Bounds of a merged static mesh in one pass over its vertices (the sphere encloses the box: a little loose, never too small). */
export function fastBounds(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.boundingSphere = new THREE.Sphere(b.getCenter(new THREE.Vector3()), b.getSize(_kv).length() / 2);
}

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
