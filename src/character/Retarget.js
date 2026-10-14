import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Motion-capture retargeting.
 *
 * Source: Quaternius "Universal Animation Library" (CC0, Rigify skeleton).
 * Targets: Megumin (Mixamo), Roxy (Character Creator), the auto-rigged demon.
 *
 * Method (world-space deltas against a shared reference pose):
 *   1. The source is put in its T-pose (clip A_TPose); the target's limb/spine chains are
 *      rotated so every mapped bone points the same way -> both skeletons share a reference.
 *   2. For each frame: D = Wsrc(t) * Wsrc_ref⁻¹ (rotation of the bone in model space since
 *      the reference), Wtgt(t) = D * Wtgt_ref, converted to the target bone's local space.
 *   3. Hips translation is transferred as an offset from the reference, scaled by leg length.
 * The result is a normal AnimationClip (bone-name tracks) usable by THREE.AnimationMixer;
 * clips baked for one instance work for clones with the same bone names.
 */

export const MAPS = {
  ual: {
    hips: 'DEF-hips', spine: 'DEF-spine001', spine2: 'DEF-spine002', chest: 'DEF-spine003', neck: 'DEF-neck', head: 'DEF-head',
    lShoulder: 'DEF-shoulderL', lArm: 'DEF-upper_armL', lFore: 'DEF-forearmL', lHand: 'DEF-handL', lHandTip: 'DEF-f_middle01L',
    rShoulder: 'DEF-shoulderR', rArm: 'DEF-upper_armR', rFore: 'DEF-forearmR', rHand: 'DEF-handR', rHandTip: 'DEF-f_middle01R',
    lThigh: 'DEF-thighL', lShin: 'DEF-shinL', lFoot: 'DEF-footL', lToe: 'DEF-toeL',
    rThigh: 'DEF-thighR', rShin: 'DEF-shinR', rFoot: 'DEF-footR', rToe: 'DEF-toeR',
  },
  mixamo: {
    hips: 'mixamorigHips', spine: 'mixamorigSpine', spine2: 'mixamorigSpine1', chest: 'mixamorigSpine2', neck: 'mixamorigNeck', head: 'mixamorigHead',
    lShoulder: 'mixamorigLeftShoulder', lArm: 'mixamorigLeftArm', lFore: 'mixamorigLeftForeArm', lHand: 'mixamorigLeftHand', lHandTip: 'mixamorigLeftHandMiddle1',
    rShoulder: 'mixamorigRightShoulder', rArm: 'mixamorigRightArm', rFore: 'mixamorigRightForeArm', rHand: 'mixamorigRightHand', rHandTip: 'mixamorigRightHandMiddle1',
    lThigh: 'mixamorigLeftUpLeg', lShin: 'mixamorigLeftLeg', lFoot: 'mixamorigLeftFoot', lToe: 'mixamorigLeftToeBase',
    rThigh: 'mixamorigRightUpLeg', rShin: 'mixamorigRightLeg', rFoot: 'mixamorigRightFoot', rToe: 'mixamorigRightToeBase',
  },
  cc: {
    hips: 'CC_Base_Hip', spine: 'CC_Base_Waist', spine2: 'CC_Base_Spine01', chest: 'CC_Base_Spine02', neck: 'CC_Base_NeckTwist01', head: 'CC_Base_Head',
    lShoulder: 'CC_Base_L_Clavicle', lArm: 'CC_Base_L_Upperarm', lFore: 'CC_Base_L_Forearm', lHand: 'CC_Base_L_Hand', lHandTip: 'CC_Base_L_Mid1',
    rShoulder: 'CC_Base_R_Clavicle', rArm: 'CC_Base_R_Upperarm', rFore: 'CC_Base_R_Forearm', rHand: 'CC_Base_R_Hand', rHandTip: 'CC_Base_R_Mid1',
    lThigh: 'CC_Base_L_Thigh', lShin: 'CC_Base_L_Calf', lFoot: 'CC_Base_L_Foot', lToe: 'CC_Base_L_ToeBase',
    rThigh: 'CC_Base_R_Thigh', rShin: 'CC_Base_R_Calf', rFoot: 'CC_Base_R_Foot', rToe: 'CC_Base_R_ToeBase',
  },
  // Quaternius modular people (npc/People.js). GLTFLoader strips the dots ("Foot.L" -> "FootL");
  // "Body" carries both the legs and the spine, so it plays the pelvis. The feet are moved
  // from the IK root under the shins when the pack is loaded.
  qp: {
    hips: 'Body', spine: 'Abdomen', spine2: 'Torso', chest: 'Chest', neck: 'Neck', head: 'Head',
    lShoulder: 'ShoulderL', lArm: 'UpperArmL', lFore: 'LowerArmL', lHand: 'WristL', lHandTip: 'Middle2L',
    rShoulder: 'ShoulderR', rArm: 'UpperArmR', rFore: 'LowerArmR', rHand: 'WristR', rHandTip: 'Middle2R',
    lThigh: 'UpperLegL', lShin: 'LowerLegL', lFoot: 'FootL', lToe: 'FootL_end',
    rThigh: 'UpperLegR', rShin: 'LowerLegR', rFoot: 'FootR', rToe: 'FootR_end',
  },
  // Unreal-mannequin naming (Quaternius Bestiary monsters).
  ue: {
    hips: 'pelvis', spine: 'spine_01', spine2: 'spine_02', chest: 'spine_03', neck: 'neck_01', head: 'Head',
    lShoulder: 'clavicle_l', lArm: 'upperarm_l', lFore: 'lowerarm_l', lHand: 'hand_l', lHandTip: 'middle_01_l',
    rShoulder: 'clavicle_r', rArm: 'upperarm_r', rFore: 'lowerarm_r', rHand: 'hand_r', rHandTip: 'middle_01_r',
    lThigh: 'thigh_l', lShin: 'calf_l', lFoot: 'foot_l', lToe: 'ball_l',
    rThigh: 'thigh_r', rShin: 'calf_r', rFoot: 'foot_r', rToe: 'ball_r',
  },
  // KayKit Rig_Medium (Skeletons pack): no neck / clavicles; GLTFLoader strips the dots
  // ("upperarm.l" -> "upperarml"); the hand slot is the tip of the hand chain.
  kk: {
    hips: 'hips', spine: 'spine', chest: 'chest', head: 'head',
    lArm: 'upperarml', lFore: 'lowerarml', lHand: 'handl', lHandTip: 'handslotl',
    rArm: 'upperarmr', rFore: 'lowerarmr', rHand: 'handr', rHandTip: 'handslotr',
    lThigh: 'upperlegl', lShin: 'lowerlegl', lFoot: 'footl', lToe: 'toesl',
    rThigh: 'upperlegr', rShin: 'lowerlegr', rFoot: 'footr', rToe: 'toesr',
  },
  demon: {
    hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
    lShoulder: 'shoulder_L', lArm: 'upperarm_L', lFore: 'forearm_L', lHand: 'hand_L',
    rShoulder: 'shoulder_R', rArm: 'upperarm_R', rFore: 'forearm_R', rHand: 'hand_R',
    lThigh: 'thigh_L', lShin: 'shin_L', lFoot: 'foot_L', rThigh: 'thigh_R', rShin: 'shin_R', rFoot: 'foot_R',
  },
};

/** Roles in parent-before-child order (the bake relies on it). */
const ORDER = ['hips', 'spine', 'spine2', 'chest', 'neck', 'head',
  'lShoulder', 'lArm', 'lFore', 'lHand', 'rShoulder', 'rArm', 'rFore', 'rHand',
  'lThigh', 'lShin', 'lFoot', 'lToe', 'rThigh', 'rShin', 'rFoot', 'rToe'];
/** Chains used to align the target to the source reference pose: [role, childRole]. */
const DIRS = [
  ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['lShoulder', 'lArm'], ['lArm', 'lFore'], ['lFore', 'lHand'], ['lHand', 'lHandTip'],
  ['rShoulder', 'rArm'], ['rArm', 'rFore'], ['rFore', 'rHand'], ['rHand', 'rHandTip'],
  ['lThigh', 'lShin'], ['lShin', 'lFoot'], ['lFoot', 'lToe'],
  ['rThigh', 'rShin'], ['rShin', 'rFoot'], ['rFoot', 'rToe'],
];
/**
 * 'rest' matching: only the limbs are re-aimed (an A-pose's arms -> the library's T-pose);
 * pelvis, spine, neck, clavicles and feet keep the target's bind rotations. The library is
 * a Rigify rig whose joint lines differ from Mixamo/CC conventions (pelvis->spine001 is
 * tilted 14.5° forward, the clavicle runs from the sternum 38° backwards, foot->toe is 10°
 * flatter), so matching those directions bends the target's mesh: anterior pelvic tilt
 * ("butt out"), a lumbar kink, retracted/narrowed shoulders and toes-up feet.
 */
const REST_DIRS = [
  ['lArm', 'lFore'], ['lFore', 'lHand'], ['lHand', 'lHandTip'],
  ['rArm', 'rFore'], ['rFore', 'rHand'], ['rHand', 'rHandTip'],
  ['lThigh', 'lShin'], ['lShin', 'lFoot'],
  ['rThigh', 'rShin'], ['rShin', 'rFoot'],
];

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _I = new THREE.Quaternion();

/** Orthonormal basis (as a quaternion) from a primary direction and a rough lateral axis. */
function basisQ(dir, lateral) {
  const y = dir.clone().normalize();
  const x = lateral.clone().addScaledVector(y, -lateral.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Rotation taking the frame (dirA, latA) onto (dirB, latB). */
function frameDelta(dirA, latA, dirB, latB) {
  return basisQ(dirB, latB).multiply(basisQ(dirA, latA).invert());
}

/**
 * Put every skinned skeleton under `root` into its skin bind pose (from the inverse bind
 * matrices), keeping the skeleton root's own node transform. The glTF node rest pose can
 * differ: Megumin's is the source scene's action stance with the torso and head turned,
 * while her bind pose is straight. Only parent-relative bind transforms are used, so it
 * works whatever space the bind matrices live in.
 * `skeletonRoot`: also move the skeleton's root bone (the hips) to its bind transform —
 * Megumin's node rest pose has the hips 8.2 cm lower (wide action stance) than the bind pose.
 * Only a bone whose parent is not a bone counts: partial skins (a hand, a boot) start at an
 * inner bone whose parent is outside that skin, and those keep their node transforms.
 */
export function applyBindPose(root, { skeletonRoot = false } = {}) {
  const done = new Set();
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  if (skeletonRoot) root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh || done.has(o.skeleton)) return;
    done.add(o.skeleton);
    const { bones, boneInverses } = o.skeleton;
    const index = new Map(bones.map((b, i) => [b, i]));
    bones.forEach((b, i) => {
      const pi = index.get(b.parent);
      if (pi === undefined) {
        if (!skeletonRoot || !b.parent || b.parent.isBone) return;
        // world bind = bindMatrix * boneInverse⁻¹, expressed in the parent's space
        b.parent.updateWorldMatrix(true, false);
        m.copy(boneInverses[i]).invert().premultiply(o.bindMatrix).premultiply(_m.copy(b.parent.matrixWorld).invert());
        m.decompose(b.position, b.quaternion, scl);
        return;
      }
      // local = parentBind⁻¹ * bind = parentInverse * inverse(boneInverse)
      m.copy(boneInverses[i]).invert().premultiply(boneInverses[pi]);
      m.decompose(pos, b.quaternion, scl);
    });
  });
}

function findBones(root, map) {
  const out = {};
  for (const [role, name] of Object.entries(map)) {
    let found = null;
    root.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    if (found) out[role] = found;
  }
  return out;
}

/** World quaternion of `o` relative to `root` (root's own rotation removed). */
function relQ(o, root, target) {
  o.updateWorldMatrix(true, false);
  o.getWorldQuaternion(target);
  root.getWorldQuaternion(_q2).invert();
  return target.premultiply(_q2);
}

function relPos(o, root, target) {
  o.updateWorldMatrix(true, false);
  _m.copy(root.matrixWorld).invert();
  return o.getWorldPosition(target).applyMatrix4(_m);
}

export class AnimationLibrary {
  async load(url = '/models/anim/ual.glb') {
    const gltf = await new GLTFLoader().loadAsync(url);
    this.root = gltf.scene;
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    this.mixer = new THREE.AnimationMixer(this.root);
    this.bones = findBones(this.root, MAPS.ual);
    // Reference = T-pose frame.
    this._poseAt('A_TPose', 0);
    this.refQ = {};
    this.refP = {};
    for (const [role, b] of Object.entries(this.bones)) {
      this.refQ[role] = relQ(b, this.root, new THREE.Quaternion());
      this.refP[role] = relPos(b, this.root, new THREE.Vector3());
    }
    this.legLength = this.refP.lThigh.distanceTo(this.refP.lShin) + this.refP.lShin.distanceTo(this.refP.lFoot);
    return this;
  }

  _poseAt(name, t) {
    this.mixer.stopAllAction();
    const a = this.mixer.clipAction(this.clips[name]);
    a.reset().play();
    this.mixer.setTime(t);
    this.root.updateMatrixWorld(true);
  }

  /**
   * Prepare a target skeleton: pose it into the library's reference pose and remember
   * the reference rotations. Returns a retarget context used by `bake`.
   * `root` must be the model root (feet at origin, facing +Z, identity rotation).
   * opts.match: 'dir' (default: every chain re-aimed at the library's joint directions) or
   * 'rest' (the target's bind pose is the neutral; only arms/legs are re-aimed, see REST_DIRS;
   * the hips also go to their bind height).
   */
  prepareTarget(root, mapName, opts = {}) {
    const rest = opts.match === 'rest';
    const bones = findBones(root, MAPS[mapName]);
    applyBindPose(root, { skeletonRoot: rest });
    root.updateMatrixWorld(true);
    // Remember bind locals so they can be restored for unmapped use.
    const bind = new Map();
    root.traverse((o) => bind.set(o, o.quaternion.clone()));
    // Model-space pre-rotation of a bone: local' = parentW⁻¹ * dq * W
    const preRotate = (b, dq) => {
      const W = relQ(b, root, new THREE.Quaternion());
      const P = b.parent ? relQ(b.parent, root, new THREE.Quaternion()) : new THREE.Quaternion();
      b.quaternion.copy(P.invert().multiply(dq.multiply(W)));
      b.updateMatrixWorld(true);
    };
    const pos = (b) => relPos(b, root, new THREE.Vector3());
    // Full frame (direction + twist) for the pelvis: legs and torso hang off it.
    if (!rest && bones.hips && bones.spine && bones.lThigh && bones.rThigh) {
      const dq = frameDelta(
        pos(bones.spine).sub(pos(bones.hips)), pos(bones.rThigh).sub(pos(bones.lThigh)),
        this.refP.spine.clone().sub(this.refP.hips), this.refP.rThigh.clone().sub(this.refP.lThigh),
      );
      preRotate(bones.hips, dq);
    }
    // The modelled head looks straight ahead in the bind pose; straightening the neck to
    // the source's forward-leaning neck must not tilt the face down.
    const headBindQ = bones.head ? relQ(bones.head, root, new THREE.Quaternion()) : null;
    // Align each chain direction to the source reference (parents first).
    for (const [role, child] of rest ? REST_DIRS : DIRS) {
      const b = bones[role], c = bones[child], sb = this.bones[role], sc = this.bones[child];
      if (!b || !c || !sb || !sc) continue;
      const want = _v.subVectors(this.refP[child], this.refP[role]).normalize().clone();
      const have = pos(c).sub(pos(b)).normalize();
      preRotate(b, new THREE.Quaternion().setFromUnitVectors(have, want));
      if (role === 'chest' && bones.lArm && bones.rArm) {
        // Remove the torso twist too (shoulder line), keeping the chain direction.
        preRotate(b, frameDelta(
          pos(c).sub(pos(b)), pos(bones.rArm).sub(pos(bones.lArm)),
          want, this.refP.rArm.clone().sub(this.refP.lArm),
        ));
      }
      if (role === 'neck' && headBindQ) {
        const P = relQ(bones.head.parent, root, new THREE.Quaternion());
        bones.head.quaternion.copy(P.invert().multiply(headBindQ));
        bones.head.updateMatrixWorld(true);
      }
    }
    const ctx = { root, bones, refQ: {}, refP: {}, bind };
    for (const [role, b] of Object.entries(bones)) {
      ctx.refQ[role] = relQ(b, root, new THREE.Quaternion());
      ctx.refP[role] = relPos(b, root, new THREE.Vector3());
    }
    const l = bones.lThigh && bones.lShin && bones.lFoot
      ? ctx.refP.lThigh.distanceTo(ctx.refP.lShin) + ctx.refP.lShin.distanceTo(ctx.refP.lFoot)
      : this.legLength;
    ctx.scale = l / this.legLength;
    return ctx;
  }

  /** Restore the target's bind pose (call after baking). */
  restore(ctx) {
    for (const [o, q] of ctx.bind) o.quaternion.copy(q);
    ctx.root.updateMatrixWorld(true);
  }

  /** Height of the lowest foot above the ground in the current library pose (library scale). */
  footClearance() {
    let c = Infinity;
    for (const s of ['l', 'r']) {
      c = Math.min(c, relPos(this.bones[s + 'Foot'], this.root, _v).y - this.refP[s + 'Foot'].y);
      c = Math.min(c, relPos(this.bones[s + 'Toe'], this.root, _v).y - this.refP[s + 'Toe'].y);
    }
    return Math.max(0, c);
  }

  /**
   * Bake one library clip for a prepared target.
   * opts: { name, fps=30, hipsY: 'keep'|'down'|'none', reverse=false, levelHead=0 }
   * `reverse` samples the clip backwards (a forehand swing becomes a backhand).
   * `levelHead` (0..1) lifts the clips' downward gaze towards the horizon, baked in
   * (the townsfolk; the heroines level their heads at runtime).
   * `damp` ({ role: k }) scales a role's model-space rotation away from the reference pose
   * (e.g. { chest: 0.55, neck: 0.55 } halves the library jog's 40° upper-back hunch).
   * `flight` (0..1) scales the airborne height: the body is lowered by (1 - k) of the lowest
   * foot's clearance, so ground contacts are unchanged and the leaps get flatter (the
   * library jog bounds 26 cm off the ground with both feet up two thirds of the cycle).
   */
  bake(ctx, clipName, opts = {}) {
    const src = this.clips[clipName];
    if (!src) throw new Error('No clip ' + clipName);
    const fps = opts.fps || 30;
    const n = Math.max(2, Math.round(src.duration * fps) + 1);
    const times = new Float32Array(n);
    const roles = ORDER.filter((r) => ctx.bones[r] && this.bones[r]);
    const qv = Object.fromEntries(roles.map((r) => [r, new Float32Array(n * 4)]));
    const hipsV = new Float32Array(n * 3);
    const hips = ctx.bones.hips;
    const hipsParent = hips.parent;
    const W = {}; // current target world (root space) per role
    const mix = this.mixer;
    mix.stopAllAction();
    const action = mix.clipAction(src);
    action.reset().play();
    const D = new THREE.Quaternion();
    const tmp = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const inv = new THREE.Matrix4();

    for (let i = 0; i < n; i++) {
      const t = Math.min(src.duration, i / fps);
      times[i] = t;
      mix.setTime(opts.reverse ? src.duration - t : t);
      this.root.updateMatrixWorld(true);
      for (const r of roles) {
        const sQ = relQ(this.bones[r], this.root, tmp);
        D.copy(sQ).multiply(_q.copy(this.refQ[r]).invert());
        if (opts.damp?.[r] !== undefined) D.slerp(_I, 1 - opts.damp[r]);
        const w = (W[r] = W[r] || new THREE.Quaternion()).copy(D).multiply(ctx.refQ[r]);
        if (r === 'head' && opts.levelHead) levelHead(w, ctx, opts.levelHead);
        // Parent world: nearest mapped ancestor's new world * the unmapped links in between.
        const b = ctx.bones[r];
        let parentW;
        const pRole = parentRole(r, ctx);
        if (pRole) {
          // chain of unmapped bones between pRole bone and b keeps reference locals
          parentW = W[pRole].clone();
          const links = [];
          for (let p = b.parent; p && p !== ctx.bones[pRole]; p = p.parent) links.unshift(p);
          for (const l of links) parentW.multiply(l.quaternion);
        } else {
          parentW = relQ(b.parent, ctx.root, new THREE.Quaternion());
        }
        const local = parentW.invert().multiply(w);
        local.toArray(qv[r], i * 4);
      }
      // Hips translation (root space) -> hips parent's local space.
      const sp = relPos(this.bones.hips, this.root, pos);
      sp.sub(this.refP.hips).multiplyScalar(ctx.scale);
      if (opts.hipsY === 'down') sp.y = Math.min(sp.y, 0);
      if (opts.hipsY === 'none') sp.y = 0;
      if (opts.flight !== undefined) sp.y -= (1 - opts.flight) * this.footClearance() * ctx.scale;
      if (opts.inPlace !== false) { sp.x *= 0.15; sp.z *= 0.15; }
      sp.add(ctx.refP.hips);
      inv.copy(ctx.root.matrixWorld).invert().multiply(hipsParent.matrixWorld).invert();
      // root space -> world -> parent local
      sp.applyMatrix4(ctx.root.matrixWorld).applyMatrix4(_m.copy(hipsParent.matrixWorld).invert());
      sp.toArray(hipsV, i * 3);
    }
    action.stop();
    const tracks = roles.map((r) => new THREE.QuaternionKeyframeTrack(`${ctx.bones[r].name}.quaternion`, times, qv[r]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipsV));
    const clip = new THREE.AnimationClip(opts.name || clipName, src.duration, tracks);
    clip.userData = { source: clipName };
    return clip;
  }
}

/** Pitch a head's root-space rotation `w` up towards the horizon (the target faces +Z). */
function levelHead(w, ctx, k) {
  ctx.faceLocal = ctx.faceLocal || new THREE.Vector3(0, 0, 1).applyQuaternion(ctx.refQ.head.clone().invert());
  const f = _v.copy(ctx.faceLocal).applyQuaternion(w);
  const pitch = Math.atan2(f.y, Math.hypot(f.x, f.z));
  const lift = Math.max(-0.25, Math.min(0.6, -pitch)) * k;
  const axis = f.cross(_up).normalize();
  w.premultiply(_q.setFromAxisAngle(axis, lift));
}

/** Nearest mapped ancestor role of `role` in the target (by walking parents). */
function parentRole(role, ctx) {
  const b = ctx.bones[role];
  const byBone = ctx._byBone || (ctx._byBone = new Map(Object.entries(ctx.bones).map(([r, o]) => [o, r])));
  for (let p = b.parent; p && p !== ctx.root; p = p.parent) {
    const r = byBone.get(p);
    if (r && ORDER.includes(r)) return r;
  }
  return null;
}

/** Split a clip into lower body (hips+legs) and upper body subsets. */
export function splitClip(clip, map) {
  const lowerNames = new Set(['hips', 'lThigh', 'lShin', 'lFoot', 'lToe', 'rThigh', 'rShin', 'rFoot', 'rToe'].map((r) => map[r]).filter(Boolean));
  const lower = [], upper = [];
  for (const t of clip.tracks) {
    const bone = t.name.slice(0, t.name.lastIndexOf('.'));
    (lowerNames.has(bone) ? lower : upper).push(t);
  }
  return {
    lower: new THREE.AnimationClip(clip.name + '_lo', clip.duration, lower),
    upper: new THREE.AnimationClip(clip.name + '_up', clip.duration, upper),
  };
}

/** Time (s) of the fastest hand motion in a clip — used to align attack hit frames. */
export function strikeTime(lib, clipName, side = 'r', from = 0.15, to = 0.85) {
  const src = lib.clips[clipName];
  const hand = lib.bones[side + 'Hand'];
  const prev = new THREE.Vector3(), cur = new THREE.Vector3();
  let best = 0, bestT = src.duration * 0.5;
  const mix = lib.mixer;
  mix.stopAllAction();
  const a = mix.clipAction(src);
  a.reset().play();
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * src.duration;
    mix.setTime(t);
    lib.root.updateMatrixWorld(true);
    relPos(hand, lib.root, cur);
    if (i > 0) {
      const sp = cur.distanceTo(prev);
      const k = t / src.duration;
      if (k >= from && k <= to && sp > best) { best = sp; bestT = t; }
    }
    prev.copy(cur);
  }
  a.stop();
  return bestT;
}

/** Average horizontal foot travel speed of a locomotion loop (m/s for this skeleton scale). */
export function loopSpeed(lib, clipName) {
  const src = lib.clips[clipName];
  const foot = lib.bones.lFoot;
  const p = new THREE.Vector3();
  let minZ = Infinity, maxZ = -Infinity;
  const mix = lib.mixer;
  mix.stopAllAction();
  const a = mix.clipAction(src);
  a.reset().play();
  for (let i = 0; i <= 40; i++) {
    mix.setTime((i / 40) * src.duration);
    lib.root.updateMatrixWorld(true);
    relPos(foot, lib.root, p);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  a.stop();
  return ((maxZ - minZ) * 2) / src.duration;
}

/**
 * Ground contact of a locomotion loop, for time-warped playback: per interval (n over the
 * clip) how planted the feet are (0..1, from the lowest foot's clearance) and the median
 * backward speed of a planted toe (m/s, library scale) — the ground speed at which the
 * planted foot would not slide when the clip plays at its natural rate.
 */
export function gaitProfile(lib, clipName, n = 48) {
  const src = lib.clips[clipName];
  const mix = lib.mixer;
  mix.stopAllAction();
  const a = mix.clipAction(src);
  a.reset().play();
  const S = [];
  for (let i = 0; i <= n; i++) {
    mix.setTime((i / n) * src.duration);
    lib.root.updateMatrixWorld(true);
    S.push(['l', 'r'].map((s) => {
      const f = relPos(lib.bones[s + 'Foot'], lib.root, new THREE.Vector3());
      const t = relPos(lib.bones[s + 'Toe'], lib.root, new THREE.Vector3());
      return { c: Math.min(f.y - lib.refP[s + 'Foot'].y, t.y - lib.refP[s + 'Toe'].y), z: t.z };
    }));
  }
  a.stop();
  const raw = new Float32Array(n);
  const speeds = [];
  const dt = src.duration / n;
  for (let i = 0; i < n; i++) {
    let planted = 0;
    for (let s = 0; s < 2; s++) {
      const c = (S[i][s].c + S[i + 1][s].c) / 2;
      planted = Math.max(planted, 1 - THREE.MathUtils.smoothstep(c, 0.015, 0.04));
      if (c < 0.015) speeds.push((S[i][s].z - S[i + 1][s].z) / dt);
    }
    raw[i] = planted;
  }
  // Soften the edges (the playback rate changes over a few frames, not in one step).
  const m = raw.map((v, i) => 0.25 * raw[(i + n - 1) % n] + 0.5 * v + 0.25 * raw[(i + 1) % n]);
  speeds.sort((x, y) => x - y);
  return { n, m, contact: m.reduce((x, y) => x + y, 0) / n, footSpeed: speeds.length ? speeds[speeds.length >> 1] : 0 };
}
