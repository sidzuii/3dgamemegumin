import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyBindPose } from '../character/Retarget.js';

/**
 * Townsfolk bodies from the Quaternius modular people packs (CC0; packed by
 * tools/pack_people.mjs into public/models/people/{men,women}.glb).
 *
 * Every outfit piece (head with hair/hat, body, legs, feet, backpack, sword) is skinned to the
 * same 62-bone skeleton. An NPC = chosen pieces, skinned to the bind pose on the CPU, merged into
 * one geometry with the material colours baked into vertex colours (per-NPC recolours by
 * material name) -> one skinned mesh and one draw call per townsperson, all sharing one material.
 *
 * The rig keeps its feet under the IK root; they are re-parented under the shins once so the
 * retargeted mocap (MAPS.qp) moves them with the legs.
 */
export const PACKS = { m: '/models/people/men.glb', w: '/models/people/women.glb' };
const DEFAULT_SCALE = { m: 0.94, w: 0.93 };
/**
 * Whole rigged characters (Mixamo skeleton, tools/pack_body.mjs) worn by single named NPCs (`body` in data/npcs.js) instead
 * of the modular people. Optional: a missing file leaves the NPC on its modular body.
 */
export const BODIES = { astrey: '/models/bodies/astrey.glb' };

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _acc = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

export class PeopleLibrary {
  constructor() {
    this.packs = {};
    this.bodies = {}; // id -> { scene, height }
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    this._geoCache = new Map();
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const keys = Object.keys(PACKS);
    const prog = Object.fromEntries(keys.map((k) => [k, 0]));
    await Promise.all(keys.map(async (k) => {
      const gltf = await loader.loadAsync(PACKS[k], (e) => {
        if (e.lengthComputable) { prog[k] = e.loaded / e.total; onProgress?.(keys.reduce((s, q) => s + prog[q], 0) / keys.length); }
      });
      this.packs[k] = this._prepare(gltf.scene);
    }));
    await Promise.all(Object.entries(BODIES).map(async ([id, url]) => {
      try {
        const gltf = await loader.loadAsync(url);
        const scene = gltf.scene;
        applyBindPose(scene);
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        scene.traverse((o) => {
          if (!o.isMesh) return;
          if (o.isSkinnedMesh) box.expandByObject(o);
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
          const m = o.material;
          // the faint ambient fill of the source (tools/pack_body.mjs moved it to extras)
          if (m.userData?.emissiveFromBase && m.map) { m.emissiveMap = m.map; m.emissive.setScalar(m.userData.emissiveFromBase); }
        });
        this.bodies[id] = { scene, height: box.max.y - box.min.y, minY: box.min.y };
      } catch (e) {
        console.warn('[people] body missing', id, e?.message);
      }
    }));
    return this;
  }

  /** A clone of a whole-character body standing on the origin, `height` metres tall. */
  createBody(id, height = 1.78) {
    const B = this.bodies[id];
    const root = new THREE.Group();
    const inner = cloneSkinned(B.scene);
    const s = height / B.height;
    inner.scale.setScalar(s);
    inner.position.y = -B.minY * s;
    root.add(inner);
    let mesh = null;
    inner.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    root.updateMatrixWorld(true);
    return { root, mesh };
  }

  _prepare(scene) {
    applyBindPose(scene);
    scene.updateMatrixWorld(true);
    // Feet: IK root -> shins (world transform kept, skinning unaffected).
    for (const s of ['L', 'R']) {
      const foot = scene.getObjectByName('Foot' + s);
      const shin = scene.getObjectByName('LowerLeg' + s);
      if (foot && shin) shin.attach(foot);
    }
    scene.updateMatrixWorld(true);
    const armature = scene.getObjectByName('CharacterArmature');
    const parts = {};
    for (const node of armature.parent.children) {
      const meshes = [];
      node.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
      if (meshes.length) parts[node.name] = meshes;
    }
    const jointNames = Object.values(parts)[0][0].skeleton.bones.map((b) => b.name);
    // Rigid props hanging from a bone (the women's sword): become optional parts bound to that
    // bone, and leave the armature so clones do not carry them.
    const props = [];
    armature.traverse((o) => { if (o.parent?.isBone && !o.isBone) props.push(o); });
    for (const node of props) {
      const joint = jointNames.indexOf(node.parent.name);
      const meshes = [];
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.rigid = { joint, world: o.matrixWorld.clone() };
        meshes.push(o);
      });
      node.parent.remove(node);
      if (meshes.length && joint >= 0) parts[node.name] = meshes;
    }
    return { scene, armature, parts, jointNames };
  }

  /** Names of the outfit pieces in a pack (for tools / debugging). */
  partNames(pack) {
    return Object.keys(this.packs[pack].parts);
  }

  /**
   * Merged bind-pose geometry for a set of pieces.
   * spec: { pack: 'm'|'w', parts: [names], colors: { MaterialName: 0xrrggbb }, hide: { Part: [MaterialName] } }
   */
  geometry(spec) {
    const key = JSON.stringify([spec.pack, spec.parts, spec.colors || {}, spec.hide || {}]);
    let g = this._geoCache.get(key);
    if (g) return g;
    const P = this.packs[spec.pack];
    const list = [];
    for (const name of spec.parts) {
      const meshes = P.parts[name];
      if (!meshes) { console.warn('[people] no part', name); continue; }
      for (const mesh of meshes) {
        const matName = mesh.material.name;
        if (spec.hide?.[name]?.includes(matName)) continue;
        list.push(bakePart(mesh, spec.colors?.[name + ':' + matName] ?? spec.colors?.[matName] ?? mesh.material.color));
      }
    }
    g = mergeGeometries(list, false);
    g.computeBoundingSphere();
    this._geoCache.set(key, g);
    return g;
  }

  /**
   * A complete character: root group (feet at origin, facing +Z) with its own bones and one
   * skinned mesh. Returns { root, mesh, bones }.
   */
  create(spec) {
    const P = this.packs[spec.pack];
    const root = new THREE.Group();
    const arm = P.armature.clone(true);
    root.add(arm);
    root.updateMatrixWorld(true);
    const byName = new Map();
    arm.traverse((o) => byName.set(o.name, o));
    const bones = P.jointNames.map((n) => byName.get(n));
    const inverses = bones.map((b) => b.matrixWorld.clone().invert());
    const mesh = new THREE.SkinnedMesh(this.geometry(spec), this.material);
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, inverses), mesh.matrixWorld);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // The packs are ~1.86 m tall; townsfolk stand a little shorter next to the heroines.
    root.scale.setScalar(spec.scale ?? DEFAULT_SCALE[spec.pack]);
    return { root, mesh, bones };
  }
}

/**
 * One primitive of a piece in model space at the bind pose: CPU-skinned (so every piece's own
 * bind matrices are honoured), with position/normal/color + the shared joint indices/weights.
 */
function bakePart(mesh, color) {
  if (mesh.userData.rigid) return bakeRigid(mesh, color);
  const src = mesh.geometry;
  const pos = src.attributes.position, nrm = src.attributes.normal;
  const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  const n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
  setColor(color);
  for (let i = 0; i < n; i++) {
    const e = _acc.elements;
    e.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (!w) continue;
      const j = si.getComponent(i, k);
      _m.multiplyMatrices(bones[j].matrixWorld, inv[j]);
      const me = _m.elements;
      for (let q = 0; q < 16; q++) e[q] += me[q] * w;
    }
    // world-space skinned = M * bindMatrix * v (attached bind mode: bindMatrix = mesh world)
    _acc.multiply(mesh.bindMatrix);
    _v.fromBufferAttribute(pos, i).applyMatrix4(_acc);
    _v.toArray(P, i * 3);
    if (nrm) {
      _nm.getNormalMatrix(_acc);
      _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize();
      _n.toArray(N, i * 3);
    }
    C[i * 3] = _c.r; C[i * 3 + 1] = _c.g; C[i * 3 + 2] = _c.b;
  }
  const I = new Uint16Array(n * 4), Wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    I[i * 4 + k] = si.getComponent(i, k);
    Wt[i * 4 + k] = sw.getComponent(i, k);
  }
  return finish(src, P, N, C, I, Wt);
}

/** A rigid prop parented to one bone. */
function bakeRigid(mesh, color) {
  const src = mesh.geometry;
  const { joint, world } = mesh.userData.rigid;
  const n = src.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  const I = new Uint16Array(n * 4), Wt = new Float32Array(n * 4);
  _nm.getNormalMatrix(world);
  setColor(color);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(src.attributes.position, i).applyMatrix4(world).toArray(P, i * 3);
    if (src.attributes.normal) _n.fromBufferAttribute(src.attributes.normal, i).applyMatrix3(_nm).normalize().toArray(N, i * 3);
    C[i * 3] = _c.r; C[i * 3 + 1] = _c.g; C[i * 3 + 2] = _c.b;
    I[i * 4] = joint;
    Wt[i * 4] = 1;
  }
  return finish(src, P, N, C, I, Wt);
}

/** Material colours are linear already; recolours are sRGB hex like the rest of the data. */
function setColor(c) {
  if (typeof c === 'number') _c.setHex(c);
  else _c.copy(c);
}

function finish(src, P, N, C, I, Wt) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(Wt, 4));
  if (src.index) g.setIndex(src.index.clone());
  else g.setIndex([...Array(P.length / 3).keys()]);
  return g;
}
