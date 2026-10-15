import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { strikeTime } from '../character/Retarget.js';

/**
 * Enemy models (optimised copies of the user's files in public/models/enemies):
 *  - goblin   — static mesh, procedural animation;
 *  - mushroom — rigged in its .blend with its own idle/walk clips (exported via Blender);
 *  - demon    — static mesh auto-rigged in Blender (bone-heat weights); animated with
 *               mocap clips retargeted from the CC0 library.
 * Each instance gets its own materials (hit flash / dissolve) and, for rigged models, its own
 * skeleton + AnimationMixer. Clips are shared (tracks address bones by name).
 */

/**
 * The mushroom's source texture is two flat colours (pink cap, black body) and its AO map is
 * blank, so in game it read as untextured. `detail` paints procedural surface detail in
 * object space: 'cap' = mottled pink with cream spots, 'body' = mottled plum-brown skin
 * (pink parts such as the mouth keep their colour). `detailScale` = cells per object unit.
 */
const MUSHROOM_DETAIL = `
  {
    vec3 p = vObjPos * uDetailScale;
    float n = en(p * 0.8) * 0.6 + en(p * 2.6) * 0.4;
    #ifdef DETAIL_CAP
      vec3 cell = floor(p), f = fract(p);
      float md = 2.0;
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 r = vec3(eh(cell + o), eh(cell + o + 17.3), eh(cell + o + 41.7));
        md = min(md, length(o + r - f));
      }
      float spot = 1.0 - smoothstep(0.26, 0.31, md);
      diffuseColor.rgb *= 0.82 + 0.36 * n;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.84, 0.72), spot);
    #else
      float dark = 1.0 - smoothstep(0.03, 0.12, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
      vec3 skin = mix(vec3(0.075, 0.04, 0.05), vec3(0.17, 0.095, 0.1), n);
      diffuseColor.rgb = mix(diffuseColor.rgb, skin, dark);
    #endif
  }`;

/** Inject hit-flash + dissolve into a standard material. */
export function makeEnemyMaterial(src, uniforms, { detail = null, detailScale = 1 } = {}) {
  const m = src.clone();
  m.side = THREE.DoubleSide;
  if (detail) {
    m.roughness = detail === 'cap' ? 0.55 : 0.7;
    m.defines = { ...(m.defines || {}), [detail === 'cap' ? 'DETAIL_CAP' : 'DETAIL_BODY']: '' };
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uDetailScale = { value: detailScale };
    shader.vertexShader = 'varying vec3 vObjPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvObjPos = position;',
    );
    shader.fragmentShader =
      'uniform float uFlash;\nuniform vec3 uFlashColor;\nuniform float uDissolve;\nuniform float uDissolveScale;\nuniform vec3 uTint;\nuniform float uDetailScale;\nvarying vec3 vObjPos;\n' +
      'float eh(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\n' +
      'float en(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);\n' +
      '  return mix(mix(mix(eh(i), eh(i+vec3(1,0,0)), f.x), mix(eh(i+vec3(0,1,0)), eh(i+vec3(1,1,0)), f.x), f.y),\n' +
      '             mix(mix(eh(i+vec3(0,0,1)), eh(i+vec3(1,0,1)), f.x), mix(eh(i+vec3(0,1,1)), eh(i+vec3(1,1,1)), f.x), f.y), f.z); }\n' +
      shader.fragmentShader
        .replace(
          'void main() {',
          `void main() {
            float dn = en(vObjPos * uDissolveScale) * 0.65 + en(vObjPos * uDissolveScale * 2.7) * 0.35;
            if (dn < uDissolve) discard;`,
        )
        .replace('#include <map_fragment>', detail ? '#include <map_fragment>\n' + MUSHROOM_DETAIL : '#include <map_fragment>')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += uFlashColor * uFlash;
          float edge = 1.0 - smoothstep(0.0, 0.06, dn - uDissolve);
          totalEmissiveRadiance += vec3(4.0, 1.4, 0.3) * edge * step(0.001, uDissolve);
          diffuseColor.rgb *= uTint;`,
        );
  };
  m.customProgramCacheKey = () => 'enemy' + (detail ? '-' + detail : '');
  return m;
}

export function createEnemyUniforms(dissolveScale = 9) {
  return {
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDissolve: { value: 0 },
    uDissolveScale: { value: dissolveScale },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
}

/** Scale to `height`, feet on y=0, centred on x/z, inside a wrapper group (model space, metres). */
function normalize(scene, height, { skinnedOnly = false } = {}) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (o.isMesh && (!skinnedOnly || o.isSkinnedMesh)) box.expandByObject(o, true);
  });
  const size = box.getSize(new THREE.Vector3());
  const s = height / size.y;
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  inner.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  inner.add(scene);
  wrap.add(inner);
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material.map) o.material.map.anisotropy = 4;
      // Keep albedo maps in display color space after cloning and material patching.
      if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
    }
  });
  wrap.userData.radius = Math.max(size.x, size.z) * s * 0.32;
  wrap.updateMatrixWorld(true);
  return wrap;
}

/** Hand gear of the KayKit skeletons: slot ('r' / 'l') -> piece of Skeleton_Gear.glb. */
const SKELETON_GEAR = {
  skeleton_warrior: { r: 'Blade', l: 'Shield_Large_A' },
  skeleton_rogue: { r: 'Axe', l: 'Shield_Small_B' },
  skeleton_minion: { r: 'Axe' },
};

export class EnemyAssets {
  constructor() {
    this.templates = {};
    this.clips = {};
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    const tick = () => onProgress?.(++done / 9);
    const [gob, mush, demon, puglin, imp, skW, skM, skR, skGear] = await Promise.all([
      loader.loadAsync('/models/enemies/Little_Hooded_Goblin.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Mushroom.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/DemonRig.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Puglin.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Imp.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Skeleton_Warrior.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Skeleton_Minion.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Skeleton_Rogue.glb').then((g) => (tick(), g)),
      loader.loadAsync('/models/enemies/Skeleton_Gear.glb').then((g) => (tick(), g)),
    ]);
    // KayKit Skeletons (CC0): rigged (Rig_Medium), no clips of their own -> mocap; hand-held gear
    // is separate pieces parented to the hand slots per instance.
    this.templates.skeleton_warrior = normalize(skW.scene, 1.85, { skinnedOnly: true });
    this.templates.skeleton_minion = normalize(skM.scene, 1.45, { skinnedOnly: true });
    this.templates.skeleton_rogue = normalize(skR.scene, 1.7, { skinnedOnly: true });
    this.gear = Object.fromEntries(skGear.scene.children.map((n) => [n.name, n]));
    // Quaternius Bestiary (CC0): rigged, no clips of their own -> mocap.
    this.templates.puglin = normalize(puglin.scene, 1.05, { skinnedOnly: true });
    this.templates.imp = normalize(imp.scene, 1.7, { skinnedOnly: true });
    this.templates.goblin = normalize(gob.scene, 1.15);
    this.templates.mushroom = normalize(mush.scene, 1.45);
    // Spot cells about 14 cm across, whatever the mesh's own units are.
    const cap = this.templates.mushroom.getObjectByProperty('isMesh', true);
    this.mushroomDetailScale = new THREE.Vector3().setFromMatrixScale(cap.matrixWorld).x / 0.14;
    this.clips.mushroom = Object.fromEntries(mush.animations.map((c) => [c.name, c]));
    this.templates.demon = normalize(demon.scene, 2.35);
  }

  /** Retarget mocap clips onto the auto-rigged demon (needs the animation library). */
  prepare(lib) {
    const wrap = this.templates.demon;
    const ctx = lib.prepareTarget(wrap, 'demon');
    const bake = (src, name, opts) => lib.bake(ctx, src, { name, ...opts });
    this.clips.demon = {
      idle: bake('Idle_Loop', 'idle'),
      walk: bake('Walk_Loop', 'walk'),
      run: bake('Jog_Fwd_Loop', 'run'),
      attack: bake('Sword_Attack', 'attack', { hipsY: 'down' }),
      hit: bake('Hit_Chest', 'hit'),
      death: bake('Death01', 'death'),
    };
    lib.restore(ctx);
    // Fraction of the attack clip where the blow lands (fastest hand motion).
    this.strike = { demon: strikeTime(lib, 'Sword_Attack', 'r') / lib.clips.Sword_Attack.duration };
    // Bestiary monsters: a club-swinging pig-goblin and a clawing imp.
    for (const [model, attack] of [['puglin', 'Sword_Attack'], ['imp', 'Punch_Cross']]) {
      const c = lib.prepareTarget(this.templates[model], 'ue');
      const b = (src, name, opts) => lib.bake(c, src, { name: model + '_' + name, levelHead: 0.5, ...opts });
      this.clips[model] = {
        idle: b('Idle_Loop', 'idle'),
        walk: b('Walk_Loop', 'walk'),
        run: b('Jog_Fwd_Loop', 'run'),
        attack: b(attack, 'attack', { hipsY: 'down' }),
        hit: b('Hit_Chest', 'hit'),
        death: b('Death01', 'death'),
      };
      lib.restore(c);
      this.strike[model] = strikeTime(lib, attack, 'r') / lib.clips[attack].duration;
    }
    // KayKit skeletons (Rig_Medium, bone map 'kk').
    for (const [model, attack] of [['skeleton_minion', 'Punch_Cross'], ['skeleton_rogue', 'Sword_Attack'], ['skeleton_warrior', 'Sword_Attack']]) {
      const c = lib.prepareTarget(this.templates[model], 'kk');
      const b = (src, name, opts) => lib.bake(c, src, { name: model + '_' + name, levelHead: 0.5, ...opts });
      this.clips[model] = {
        idle: b('Idle_Loop', 'idle'),
        walk: b('Walk_Loop', 'walk'),
        run: b('Jog_Fwd_Loop', 'run'),
        attack: b(attack, 'attack', { hipsY: 'down' }),
        hit: b('Hit_Chest', 'hit'),
        death: b('Death01', 'death'),
      };
      lib.restore(c);
      this.strike[model] = strikeTime(lib, attack, 'r') / lib.clips[attack].duration;
    }
    this.demonStrike = this.strike.demon;
  }

  /** Clone an enemy model with per-instance materials (and skeleton/mixer if rigged). */
  instance(key) {
    const model = key === 'archdemon' ? 'demon' : key;
    const tpl = this.templates[model];
    const rigged = model !== 'goblin';
    const obj = rigged ? cloneSkinned(tpl) : tpl.clone(true);
    const hands = SKELETON_GEAR[model];
    if (hands && this.gear) {
      // Weapons / shields on the hand slots (the pack's gear is modelled for them, grip at the origin).
      for (const [slot, piece] of Object.entries(hands)) {
        const bone = obj.getObjectByName(slot === 'r' ? 'handslotr' : 'handslotl');
        if (bone && this.gear[piece]) bone.add(this.gear[piece].clone(true));
      }
    }
    const uniforms = createEnemyUniforms(model === 'demon' ? 5 : 9);
    const mats = new Map();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const detail = model === 'mushroom' ? (o.name === 'Mushroom_cap' ? 'cap' : 'body') : null;
      const key = o.material.uuid + (detail || '');
      let m = mats.get(key);
      if (!m) {
        m = makeEnemyMaterial(o.material, uniforms, { detail, detailScale: this.mushroomDetailScale });
        mats.set(key, m);
      }
      o.material = m;
    });
    let mixer = null, actions = null;
    if (rigged) {
      mixer = new THREE.AnimationMixer(obj);
      actions = {};
      for (const [name, clip] of Object.entries(this.clips[model])) actions[name] = mixer.clipAction(clip);
    }
    return { object: obj, uniforms, radius: tpl.userData.radius, mixer, actions };
  }
}
