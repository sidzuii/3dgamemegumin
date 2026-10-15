import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gripStaff, StaffHold } from './rigUtils.js';
import { CharacterAnimator } from './CharacterAnimator.js';

/**
 * Rigged Megumin (model/characters/meguminkonosuba, Mixamo skeleton).
 *
 * The FBX was converted to GLB with FBX2glTF (three's FBXLoader mis-handles this file's
 * transforms) and its 4K textures were downscaled to 2K. At load time we:
 *  - hide the baked "Effect*" meshes (wind swirls from the source scene);
 *  - retarget the mocap with her bind pose (straight A-pose; the node rest pose is a wide
 *    action stance with the hips 8 cm lower) as the neutral: retarget: 'rest';
 *  - re-grip the staff upright in her right fist and parent it to the hand bone;
 *  - parent the cloak to the upper spine and give it shader-driven sway;
 *  - face/hair receive a softened sun shadow (hat brim shade, still a readable face).
 */

const URL = '/models/player/megumin.glb';

export const RIG_INFO = { height: 1.62 };

/** Shared uniforms for shader-side secondary motion and the magic rim glow. */
export function createCharacterUniforms() {
  return {
    uTime: { value: 0 },
    uCapeWind: { value: new THREE.Vector3() }, // cloak-local displacement at the hem
    uCapeUp: { value: new THREE.Vector3(0, 1, 0) },
    uCapeRange: { value: new THREE.Vector2(0, 1) }, // (bottom, top) along uCapeUp
    uHairWind: { value: new THREE.Vector3() }, // model space, metres
    // Hair mesh bind space: model -> bind transform, "up" axis and (root height, falloff)
    // so the roots on the scalp stay put and only the hanging strands sway.
    uHairBasis: { value: new THREE.Matrix3() },
    uHairUp: { value: new THREE.Vector3(0, 1, 0) },
    uHairRoot: { value: new THREE.Vector2(1.42, 0.24) },
    uRimColor: { value: new THREE.Color(1.0, 0.86, 0.75) },
    uRimStrength: { value: 0.3 },
    uMagicGlow: { value: new THREE.Color(0, 0, 0) },
  };
}

/** Strength of the sun shadow on faces and hair (hat brim shade without a black face). */
export const FACE_SHADOW = 0.55;

const FACE_PARTS = ['Face', 'eyes_L', 'eyes_R', 'ear_L', 'ear_R', 'Hair', 'pPlane2', 'pPlane3', 'pPlane4', 'pPlane5', 'pCylinder14', 'pCylinder15'];

/**
 * @param {number} faceShadow  0 = normal shadows; otherwise faces receive the sun shadow at
 *   this strength (soft under the hat brim instead of either black or fully sunlit).
 */
export function patchMaterial(material, uniforms, kind, faceShadow = 0) {
  material.onBeforeCompile = (shader) => {
    if (faceShadow) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replaceAll(
          'directionalLightShadow.shadowIntensity',
          `(directionalLightShadow.shadowIntensity * ${faceShadow.toFixed(2)})`,
        ),
      );
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'uniform float uTime;\nuniform vec3 uCapeWind;\nuniform vec3 uCapeUp;\nuniform vec2 uCapeRange;\nuniform vec3 uHairWind;\n' +
      'uniform mat3 uHairBasis;\nuniform vec3 uHairUp;\nuniform vec2 uHairRoot;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${kind === 'cape' ? `{
          float h = dot(position, uCapeUp);
          float w = 1.0 - smoothstep(uCapeRange.x, uCapeRange.y, h);
          w = w * w;
          float flutter = sin(uTime * 7.0 + h * 9.0 + position.x * 5.0) * 0.5 + sin(uTime * 11.3 + position.z * 13.0) * 0.25;
          float wl = length(uCapeWind);
          transformed += uCapeWind * w;
          transformed += normal * flutter * 0.01 * w * (0.35 + min(wl * 3.0, 1.5));
        }` : ''}
        ${kind === 'hair' || kind === 'roxyHair' ? `{
          // Weight grows from 0 at the scalp to 1 down the strand: roots never slide.
          float below = uHairRoot.x - dot(position, uHairUp);
          float w = smoothstep(0.0, uHairRoot.y, below);
          float ripple = 1.0 + 0.3 * sin(uTime * 2.1 + below * 9.0 / uHairRoot.y);
          transformed += uHairBasis * uHairWind * (w * ripple);
        }` : ''}`,
      );
    shader.fragmentShader =
      'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform vec3 uMagicGlow;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float ndv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 3.0);
          totalEmissiveRadiance += (uRimColor * uRimStrength + uMagicGlow) * rim * diffuseColor.rgb * 1.6;
          totalEmissiveRadiance += uMagicGlow * 0.05 * diffuseColor.rgb;
          ${kind === 'skin' ? 'totalEmissiveRadiance += diffuseColor.rgb * vec3(0.07, 0.05, 0.045);' : kind.startsWith('roxy') ? 'totalEmissiveRadiance += diffuseColor.rgb * 0.14;' : ''}
        }`,
      );
  };
  material.customProgramCacheKey = () => 'megumin-' + kind + (faceShadow ? '-face' : '');
}

/**
 * Fit the hair sway uniforms to the hair meshes' bind space: model->bind transform, the up
 * axis in bind space and the scalp height (strands are pinned above it).
 * `modelRoot` is the group whose space the animator's wind vector lives in.
 */
export function setupHairSway(uniforms, meshes, modelRoot) {
  if (!meshes.length) return;
  modelRoot.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert().multiply(meshes[0].matrixWorld);
  const basis = uniforms.uHairBasis.value.setFromMatrix4(toModel).invert(); // model -> bind
  const up = new THREE.Vector3(0, 1, 0).applyMatrix3(basis);
  const unitsPerMetre = up.length();
  up.normalize();
  let top = -Infinity;
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) top = Math.max(top, v.fromBufferAttribute(p, i).dot(up));
  }
  uniforms.uHairUp.value.copy(up);
  uniforms.uHairRoot.value.set(top - 0.12 * unitsPerMetre, 0.26 * unitsPerMetre);
}


export class MeguminModel {
  constructor() {
    this.root = new THREE.Group(); // positioned/rotated by the controller (feet at origin)
    this.root.name = 'Megumin';
    this.anim = new THREE.Group(); // whole-body procedural transforms (collapse, bank, squash)
    this.root.add(this.anim);
    this.uniforms = createCharacterUniforms();
    this.gemAnchor = new THREE.Object3D();
    this.staffTip = new THREE.Object3D();
    this.meshes = [];
    this.gemMaterial = null;
    this.toeMargin = 0.004; // toe joints above the boot soles (Player's ground lift)
  }

  async load(onProgress) {
    const gltf = await new GLTFLoader().loadAsync(URL, (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    const scene = gltf.scene;
    this.model = scene;
    this.anim.add(scene);
    scene.updateMatrixWorld(true);

    // --- materials -----------------------------------------------------------
    const cache = new Map();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name.startsWith('Effect')) {
        o.visible = false;
        return;
      }
      const src = o.material;
      const isFace = FACE_PARTS.includes(o.name);
      let kind = 'cloth';
      if (o.name === 'Manndo') kind = 'cape';
      else if (o.name === 'Hair') kind = 'hair';
      else if (src.name === 'BODY') kind = 'skin';
      else if (src.name === 'Wand') kind = 'wand';
      const key = src.uuid + kind + (isFace ? ':face' : '');
      let mat = cache.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          name: src.name,
          map: src.map,
          color: 0xffffff,
          roughness: kind === 'skin' ? 0.62 : 0.78,
          metalness: 0,
          side: THREE.DoubleSide, // skirt / sleeves / collar are single-layer meshes
          envMapIntensity: 0.85,
        });
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 4;
        }
        patchMaterial(mat, this.uniforms, kind, isFace ? FACE_SHADOW : 0);
        cache.set(key, mat);
      }
      o.material = mat;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      this.meshes.push(o);
    });

    this.bindHandPos = scene.getObjectByName('mixamorigRightHand').getWorldPosition(new THREE.Vector3());
    this.feet = ['mixamorigLeftToeBase', 'mixamorigRightToeBase'].map((n) => scene.getObjectByName(n)).filter(Boolean);
    // The source ships a "wind-blown" blend shape for the cloak and the hair (influence 1
    // in its single-frame take). The base shapes hang naturally; the blend is driven by
    // movement/magic at runtime (see setWind).
    setupHairSway(this.uniforms, [scene.getObjectByName('Hair')].filter(Boolean), this.anim);
    this.windMorphs = [];
    for (const name of ['Manndo', 'Hair']) {
      const o = scene.getObjectByName(name);
      if (o && o.morphTargetInfluences) {
        o.morphTargetInfluences.fill(0);
        this.windMorphs.push({ mesh: o, scale: name === 'Hair' ? 0.55 : 1 });
      }
    }
    return this;
  }

  /**
   * Retarget the mocap library onto this skeleton, then (in the idle pose) re-grip the staff
   * upright in the right fist and hang the cloak from the upper spine.
   */
  setupAnimation(lib) {
    const scene = this.model;
    this.animator = new CharacterAnimator({ mixerRoot: scene, rigRoot: scene, anim: this.anim, retarget: 'rest', uniforms: this.uniforms, setWind: (a) => this.setWind(a), setCapeWind: (w) => this.setCapeWind(w), holdStaff: (w, dt, guard) => this.holdStaff(w, dt, guard) }, lib, 'mixamo');
    // Idle pose at t=0 as the reference for props.
    this.animator.update(1 / 60, { speed: 0, localVel: new THREE.Vector3(), localAccel: new THREE.Vector3(), turnRate: 0, grounded: true });
    scene.updateMatrixWorld(true);
    const staff = scene.getObjectByName('weapon_megumin');
    if (staff) this._gripStaff(staff);
    const cape = scene.getObjectByName('Manndo');
    if (cape) {
      scene.getObjectByName('mixamorigSpine2').attach(cape);
      this.cape = cape;
      cape.updateMatrixWorld(true);
      const inv = new THREE.Quaternion();
      cape.getWorldQuaternion(inv).invert();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize();
      const p = cape.geometry.attributes.position;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < p.count; i++) {
        const h = p.getX(i) * up.x + p.getY(i) * up.y + p.getZ(i) * up.z;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      this.uniforms.uCapeUp.value.copy(up);
      this.uniforms.uCapeRange.value.set(lo, lo + (hi - lo) * 0.85);
      this._capeInvQ = new THREE.Quaternion();
    }
    return this.animator;
  }

  /** The staff is a separate rigid mesh: put it in her right fist and close the fingers. */
  _gripStaff(staff) {
    const scene = this.model;
    const R = 'mixamorigRightHand';
    const hand = scene.getObjectByName(R);
    const chain = (f) => [1, 2, 3].map((i) => R + f + i);
    // The gem end is the one farther from the body's centre line (arm out in the source).
    const grip = gripStaff(staff, hand, this.bindHandPos, (a, b) => (Math.abs(a.x) > Math.abs(b.x) ? a : b), {
      index: chain('Index'), middle: chain('Middle'), ring: chain('Ring'), pinky: chain('Pinky'), thumb: chain('Thumb'),
    });
    this.staffTip = grip.head;
    this.gemAnchor = grip.gem;
    this.staff = staff;
    this.hold = new StaffHold(this.root, {
      arm: scene.getObjectByName('mixamorigRightArm'), fore: scene.getObjectByName('mixamorigRightForeArm'), hand,
      left: { arm: scene.getObjectByName('mixamorigLeftArm'), fore: scene.getObjectByName('mixamorigLeftForeArm'), hand: scene.getObjectByName('mixamorigLeftHand') },
    }, grip);
    // The gem glows through the source's emissive mask; intensity is driven by spells.
    const wand = staff.material;
    wand.emissive = new THREE.Color(1, 0.18, 0.08);
    const em = new THREE.TextureLoader().load('/models/player/Wand_Emissive.png');
    em.colorSpace = THREE.SRGBColorSpace;
    em.flipY = false; // glTF UV convention
    wand.emissiveMap = em;
    wand.emissiveIntensity = 0.6;
    wand.needsUpdate = true;
    this.gemMaterial = wand;
  }

  /** Staff-holding arm pose, weight 0..1 driven by the animator (0 during attacks). */
  holdStaff(weight, dt, guard = 0) {
    this.hold?.update(weight, dt, guard);
  }

  /** Wind-blown blend shapes: 0 = hanging, 1 = fully blown back. */
  setWind(amount) {
    for (const w of this.windMorphs) w.mesh.morphTargetInfluences[0] = Math.max(0, Math.min(1.05, amount * w.scale));
  }

  /** Cloak wind (model space) -> cloak-local displacement uniform. */
  setCapeWind(windModel) {
    if (!this.cape) return;
    this.cape.getWorldQuaternion(this._capeInvQ).invert();
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    this.uniforms.uCapeWind.value.copy(windModel).applyQuaternion(rootQ).applyQuaternion(this._capeInvQ);
  }

  getGemWorldPosition(target) {
    return this.gemAnchor.getWorldPosition(target);
  }

  getStaffTipWorldPosition(target) {
    return this.staffTip.getWorldPosition(target);
  }
}

