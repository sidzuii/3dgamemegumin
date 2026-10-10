import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createCharacterUniforms, patchMaterial, setupHairSway, FACE_SHADOW } from './MeguminModel.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { gripStaff, StaffHold } from './rigUtils.js';

/**
 * Playable Roxy Migurdia (model/characters/roxy-migurdia, Character Creator skeleton).
 * Same interface as MeguminModel so the Player can swap between them.
 */
const TEX = ['hair', 'body', 'clothing1', 'clothing2', 'eyes', 'staff'];
const FACE = ['head', 'eyes', 'eyebrows', 'eyelashes', 'hairFront', 'hairSides', 'teeth', 'tongue', 'ahoge'];

/**
 * The source skins the twintail ends partly to the left toe (broken export), so they slid
 * along with her foot. Move any hair weight on leg bones to the neck, where the rest of
 * the twintails hang from.
 */
function pinHairWeights(mesh) {
  const bones = mesh.skeleton.bones;
  const neck = bones.findIndex((b) => b.name === 'CC_Base_NeckTwist01');
  if (neck < 0) return;
  const si = mesh.geometry.attributes.skinIndex;
  for (let i = 0; i < si.count; i++) {
    for (let j = 0; j < 4; j++) {
      const name = bones[si.getComponent(i, j)]?.name || '';
      if (/Toe|Foot|Calf|Thigh|Hip|Pelvis/.test(name)) si.setComponent(i, j, neck);
    }
  }
  si.needsUpdate = true;
}


export class RoxyModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Roxy';
    this.anim = new THREE.Group();
    this.root.add(this.anim);
    this.uniforms = createCharacterUniforms();
    this.gemAnchor = new THREE.Object3D();
    this.staffTip = new THREE.Object3D();
  }

  async load(onProgress) {
    const tl = new THREE.TextureLoader();
    const texP = Promise.all(TEX.map((n) => new Promise((res) => tl.load(`/models/roxy/${n}.png`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      // The source is laid out in UDIM tiles (u = 1..6 per material): wrap, don't clamp.
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 4;
      res([n, t]);
    }, undefined, () => res([n, null])))));
    const gltf = await new GLTFLoader().loadAsync('/models/roxy/roxy.glb', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    const tex = Object.fromEntries(await texP);
    const scene = gltf.scene;
    // Model space in metres: wrap (rig root) -> inner (unit conversion) -> gltf scene.
    const inner = new THREE.Group();
    const wrap = new THREE.Group();
    inner.add(scene);
    wrap.add(inner);
    this.anim.add(wrap);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (o.isSkinnedMesh) box.expandByObject(o);
    });
    const s = 1.5 / (box.max.y - box.min.y);
    inner.scale.setScalar(s);
    inner.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
    wrap.updateMatrixWorld(true);
    this.wrap = wrap;
    this.model = scene;

    const mats = new Map();
    const hairMeshes = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'placard') {
        o.visible = false;
        return;
      }
      if (o.name === 'staff') this._staffMesh = o;
      const texName = o.material.name;
      // The ribbons tied to the twintail ends must sway with the hair they are tied to.
      const hair = texName === 'hair' || o.name === 'twintailLaces';
      const face = FACE.includes(o.name);
      const key = texName + (hair ? ':hair' : '') + (face ? ':face' : '');
      if (hair) {
        hairMeshes.push(o);
        if (o.isSkinnedMesh) pinHairWeights(o);
      }
      let m = mats.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          name: texName,
          map: tex[texName] || o.material.map,
          roughness: texName === 'eyes' ? 0.3 : 0.72,
          metalness: 0,
          side: THREE.DoubleSide,
          alphaTest: texName === 'clothing1' ? 0.5 : 0,
          envMapIntensity: 0.85,
        });
        patchMaterial(m, this.uniforms, texName === 'body' ? 'skin' : hair ? 'roxyHair' : 'roxyCloth', face ? FACE_SHADOW : 0);
        mats.set(key, m);
      }
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
    setupHairSway(this.uniforms, hairMeshes, this.anim);
    this.bindHandPos = scene.getObjectByName('CC_Base_L_Hand').getWorldPosition(new THREE.Vector3());
    this.feet = ['CC_Base_L_ToeBase', 'CC_Base_R_ToeBase'].map((n) => scene.getObjectByName(n)).filter(Boolean);
    return this;
  }

  setupAnimation(lib) {
    this.animator = new CharacterAnimator({
      mixerRoot: this.model, rigRoot: this.wrap, anim: this.anim, uniforms: this.uniforms,
      holdStaff: (w, dt) => this.hold?.update(w, dt),
    }, lib, 'cc');
    this.animator.update(1 / 60, { speed: 0, localVel: new THREE.Vector3(), localAccel: new THREE.Vector3(), turnRate: 0, grounded: true });
    this.wrap.updateMatrixWorld(true);
    if (this._staffMesh) {
      // Her staff is a rigid mesh held in the left hand in the source; move it to the right
      // fist so the shared melee animations swing it.
      const staff = this._staffMesh;
      const m = this.model;
      const hand = m.getObjectByName('CC_Base_R_Hand');
      const chain = (f) => [1, 2, 3].map((i) => `CC_Base_R_${f}${i}`);
      const grip = gripStaff(staff, hand, this.bindHandPos, (a, b) => (a.y > b.y ? a : b), {
        index: chain('Index'), middle: chain('Mid'), ring: chain('Ring'), pinky: chain('Pinky'), thumb: chain('Thumb'),
      });
      this.staffTip = grip.head;
      this.gemAnchor = grip.gem;
      this.staff = staff;
      this.hold = new StaffHold(this.root, {
        arm: m.getObjectByName('CC_Base_R_Upperarm'), fore: m.getObjectByName('CC_Base_R_Forearm'), hand,
      }, grip);
      staff.material = staff.material.clone();
      staff.material.emissive = new THREE.Color(0.2, 0.6, 1.4);
      staff.material.emissiveIntensity = 0.2;
      this.gemMaterial = staff.material;
    }
    return this.animator;
  }

  setWind() {}
  setCapeWind() {}

  getGemWorldPosition(target) {
    return this.gemAnchor.getWorldPosition(target);
  }

  getStaffTipWorldPosition(target) {
    return this.staffTip.getWorldPosition(target);
  }
}
