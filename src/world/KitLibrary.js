import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Kenney building/prop kits (CC0; packed by tools/pack_kits.mjs into public/models/kits/*.glb).
 *
 * A piece is addressed as 'kit/model' (e.g. 'town/wall-wood-window-shutters'). Each piece is a
 * list of parts { geometry, mat } in the model's own space (1 unit = one Kenney tile). Textured
 * kits share one palette texture per kit -> one material per kit; untextured kits (nature,
 * furniture) get their material colours baked into vertex colours and share one flat material.
 * Every part carries position / normal / uv / color so pieces merge into the world's static
 * batches (World.addKit).
 */
export const KITS = ['town', 'castle', 'survival', 'food', 'nature', 'furniture', 'graveyard', 'dungeon', 'village', 'wilds', 'props', 'bits'];
/** Kits with several PBR materials (Quaternius MegaKits): one material per source material. */
const MULTI = new Set(['village', 'wilds', 'props']);

/** Palette remaps for flat-coloured kits (the nature kit's teal foliage -> the valley's greens). */
const RECOLOR = {
  nature: {
    leafsGreen: 0x5f9440, leafsDark: 0x3f6a32, leafsFall: 0xc8862e, grass: 0x6a9a3e, corn: 0xd8b860,
    woodBark: 0x6a4a32, woodBarkDark: 0x4a3426, woodBirch: 0xe8e2d4, woodInner: 0xd8c09a,
    wood: 0x9a7048, woodDark: 0x6a4a30, dirtDark: 0x5e4630, stone: 0x9a968c, stoneDark: 0x77736b,
  },
  furniture: { wood: 0x9a6a44, woodDark: 0x6a4a30, plant: 0x5f9440 },
};
/** Per-model material swaps (model-name prefix -> source material -> material of the same kit). */
const MATERIAL_SWAP = {
  'wilds/Bush_': { Leaves_TwistedTree: 'Leaves_NormalTree' },
};
/** Per-model overrides (model-name prefix -> material -> colour): canvas tents instead of pink. */
const RECOLOR_MODEL = {
  'nature/tent_': { colorRed: 0xcdb88e, colorRedDark: 0xa8946c },
};

/**
 * Palette recolours of the textured kits (hue ° / saturation / lightness ranges -> colour; the
 * palette's shading gradients are kept by scaling with the pixel's lightness / `ref`).
 * Kenney's toy palette (orange timber, lavender plaster) -> the town's dark timber and cream
 * plaster; roof variants share the base and swap the tile colour.
 */
const TIMBER = { h: [8, 30], s: [0.28, 0.75], l: [0.47, 0.74], to: 0x6a4630, ref: 0.58 };
const PLANKS = { h: [5, 30], s: [0.2, 0.7], l: [0.22, 0.47], to: 0x7a5c44, ref: 0.42 };
const PLASTER = { h: [205, 250], s: [0.06, 0.62], l: [0.5, 0.92], to: 0xf0e6d2, ref: 0.77 };
const STONE = { h: [205, 250], s: [0.06, 0.62], l: [0.4, 0.92], to: 0xc9bfae, ref: 0.72 };
const ROOF_TILES = (to) => [
  { h: [338, 361], s: [0.35, 1], l: [0.3, 0.75], to, ref: 0.56 },
  { h: [0, 8], s: [0.45, 1], l: [0.3, 0.75], to, ref: 0.56 },
  { h: [150, 182], s: [0.22, 1], l: [0.25, 0.75], to, ref: 0.5 },
];
export const ROOF_COLORS = { red: 0xa8463a, blue: 0x3e5d8c, green: 0x4f7448, brown: 0x8a5232, slate: 0x5c6070, purple: 0x6a4e80, straw: 0xc2a05a };
const VARIANTS = {
  town: { base: [TIMBER, PLANKS, PLASTER], roofs: ROOF_COLORS },
  castle: { base: [TIMBER, PLANKS, STONE], roofs: { blue: 0x34507e, red: 0x9a3e34, slate: 0x56596a } },
  survival: { base: [TIMBER, PLANKS, { h: [3, 30], s: [0.6, 1], l: [0.45, 0.82], to: 0x8a4a3a, ref: 0.62 }], roofs: {} },
  graveyard: {
    base: [
      { h: [140, 200], s: [0.15, 1], l: [0.2, 0.8], to: 0x3e4148, ref: 0.5 }, // teal metal -> wrought iron
      { h: [8, 32], s: [0.3, 1], l: [0.35, 0.8], to: 0x6a5038, ref: 0.6 }, // orange earth -> soil
      { ...STONE, to: 0xaaa49a },
    ],
    roofs: {},
  },
};

const _c = new THREE.Color();
const _hsl = {};

export class KitLibrary {
  constructor() {
    this.pieces = new Map(); // 'kit/name' -> [{ geometry, mat }]
    this.materials = {}; // matKey -> Material (registered into World.mats)
    this.bounds = new Map();
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const prog = Object.fromEntries(KITS.map((k) => [k, 0]));
    const report = () => onProgress?.(KITS.reduce((s, k) => s + prog[k], 0) / KITS.length);
    await Promise.all(KITS.map(async (kit) => {
      const gltf = await loader.loadAsync(`/models/kits/${kit}.glb`, (e) => {
        if (e.lengthComputable) { prog[kit] = e.loaded / e.total; report(); }
      });
      this._addKit(kit, gltf.scene);
      this._variants(kit);
      this._swapMaterials(kit);
      prog[kit] = 1;
      report();
    }));
    return this;
  }

  /** Per-model material swaps: the bushes wear the green leaves of the common trees (not autumn red). */
  _swapMaterials(kit) {
    for (const [prefix, map] of Object.entries(MATERIAL_SWAP)) {
      if (!prefix.startsWith(kit + '/')) continue;
      for (const [name, parts] of this.pieces) {
        if (!name.startsWith(prefix)) continue;
        for (const p of parts) {
          const to = map[p.mat.slice(`kit_${kit}_`.length)];
          if (to && this.materials[`kit_${kit}_${to}`]) p.mat = `kit_${kit}_${to}`;
        }
      }
    }
  }

  /** Recolour the kit's palette texture (base) and add roof-colour variants 'kit_<kit>@<name>'. */
  _variants(kit) {
    const V = VARIANTS[kit];
    const mat = this.materials['kit_' + kit];
    if (!V || !mat) return;
    const img = mat.map.image;
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const src = ctx.getImageData(0, 0, cv.width, cv.height);
    const make = (rules) => {
      const out = new ImageData(new Uint8ClampedArray(src.data), cv.width, cv.height);
      recolor(out.data, rules);
      const c = document.createElement('canvas');
      c.width = cv.width;
      c.height = cv.height;
      c.getContext('2d').putImageData(out, 0, 0);
      const t = new THREE.CanvasTexture(c);
      for (const k of ['flipY', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'colorSpace', 'channel']) t[k] = mat.map[k];
      t.offset.copy(mat.map.offset);
      t.repeat.copy(mat.map.repeat);
      t.rotation = mat.map.rotation;
      t.center.copy(mat.map.center);
      t.matrixAutoUpdate = mat.map.matrixAutoUpdate;
      t.matrix.copy(mat.map.matrix);
      t.needsUpdate = true;
      return t;
    };
    const baseMap = make(V.base);
    for (const [name, color] of Object.entries(V.roofs)) {
      const m = mat.clone();
      m.map = make([...V.base, ...ROOF_TILES(color)]);
      this.materials[`kit_${kit}@${name}`] = m;
    }
    mat.map = baseMap;
    mat.needsUpdate = true;
  }

  _material(kit, src, model) {
    if (MULTI.has(kit)) {
      const key = `kit_${kit}_${src.name || 'm'}`;
      if (!this.materials[key]) {
        let m;
        if (src.alphaTest > 0 || src.transparent && src.map) {
          // Leaf cards: cut-out, both sides. Lambert, not PBR: foliage is layered many cards
          // deep, and per-pixel PBR on every layer is what an integrated GPU cannot afford.
          m = new THREE.MeshLambertMaterial({ map: src.map, alphaTest: Math.max(src.alphaTest, 0.45), side: THREE.DoubleSide, vertexColors: true });
          m.name = src.name;
        } else {
          m = src.clone();
          m.vertexColors = true; // white unless tinted
          if (/Rock/i.test(src.name)) m.color.multiplyScalar(1.55); // the pack's rock albedo is very dark
        }
        if (m.map) m.map.anisotropy = 4;
        this.materials[key] = m;
      }
      return { key, color: null };
    }
    if (src.map) {
      const key = 'kit_' + kit;
      if (!this.materials[key]) {
        src.map.anisotropy = 4;
        this.materials[key] = new THREE.MeshStandardMaterial({ map: src.map, vertexColors: true, roughness: 0.82, metalness: 0 });
      }
      return { key, color: null };
    }
    if (src.transparent || src.opacity < 1) {
      const key = 'kit_glass';
      this.materials[key] ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false });
      return { key, color: src.color };
    }
    this.materials.kit_flat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: false });
    const byModel = Object.entries(RECOLOR_MODEL).find(([p]) => `${kit}/${model}`.startsWith(p))?.[1];
    const remap = byModel?.[src.name] ?? RECOLOR[kit]?.[src.name];
    return { key: 'kit_flat', color: remap !== undefined ? _c.setHex(remap).clone() : src.color };
  }

  _addKit(kit, scene) {
    scene.updateMatrixWorld(true);
    for (const holder of scene.children) {
      const parts = [];
      const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
      holder.traverse((o) => {
        if (!o.isMesh) return;
        const { key, color } = this._material(kit, o.material, holder.name);
        const g = o.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) { g.deleteAttribute(name); continue; }
          // Plain float attributes (quantized / interleaved accessors would not merge).
          const a = g.attributes[name];
          const arr = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
          g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
        }
        const n = g.attributes.position.count;
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        const col = new Float32Array(n * 3);
        const cc = color || _c.set(1, 1, 1);
        for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        if (!g.index) g.setIndex([...Array(n).keys()]);
        parts.push({ geometry: g, mat: key });
      });
      if (!parts.length) continue;
      // Same material in several meshes -> one part per material.
      this.pieces.set(`${kit}/${holder.name}`, parts);
    }
  }

  has(name) {
    return this.pieces.has(name);
  }

  get(name) {
    const p = this.pieces.get(name);
    if (!p) console.warn('[kit] missing piece', name);
    return p || [];
  }

  /** Local bounding box of a piece (model units). */
  box(name) {
    let b = this.bounds.get(name);
    if (!b) {
      b = new THREE.Box3();
      for (const { geometry } of this.get(name)) {
        geometry.computeBoundingBox();
        b.union(geometry.boundingBox);
      }
      this.bounds.set(name, b);
    }
    return b;
  }

  /** Names of the pieces of one kit (for tools / debugging). */
  list(kit) {
    return [...this.pieces.keys()].filter((k) => k.startsWith(kit + '/')).map((k) => k.slice(kit.length + 1));
  }
}

function recolor(px, rules) {
  for (let i = 0; i < px.length; i += 4) {
    _c.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace).getHSL(_hsl, THREE.SRGBColorSpace);
    const h = _hsl.h * 360;
    for (const r of rules) {
      if (h < r.h[0] || h > r.h[1] || _hsl.s < r.s[0] || _hsl.s > r.s[1] || _hsl.l < r.l[0] || _hsl.l > r.l[1]) continue;
      _c.setHex(r.to, THREE.SRGBColorSpace);
      const k = _hsl.l / r.ref;
      const o = {};
      _c.getRGB(o, THREE.SRGBColorSpace);
      px[i] = Math.min(255, o.r * k * 255);
      px[i + 1] = Math.min(255, o.g * k * 255);
      px[i + 2] = Math.min(255, o.b * k * 255);
      break;
    }
  }
}
