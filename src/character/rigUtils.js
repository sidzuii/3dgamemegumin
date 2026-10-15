import * as THREE from 'three';

/**
 * Staff grip for the playable heroines.
 *
 * `gripStaff` puts a rigid staff mesh across the palm of the right hand (along the knuckle
 * line, head towards the thumb) and curls the finger bones around it; the staff is parented
 * to the hand bone. Fingers are not animated by the mocap clips, so the fist stays closed.
 *
 * `StaffHold` is a per-frame two-bone IK on the right arm: elbow bent, fist thumb-up in
 * front of the hip, staff upright and clear of the legs. It is blended over the mocap pose
 * (weight 0 during attacks and spells, so the clips swing the staff freely).
 */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

function worldPos(o, target = new THREE.Vector3()) {
  return o.getWorldPosition(target);
}

/** Rotate bone `b` by a world-space rotation `q` (pivot = the bone's own origin). */
function rotateWorld(b, q) {
  const w = b.getWorldQuaternion(_q1).premultiply(q);
  const p = b.parent.getWorldQuaternion(_q2).invert();
  b.quaternion.copy(p.multiply(w));
  b.updateMatrixWorld(true);
}

/** Distance from point p to the line (o, unit dir). */
function lineDist(p, o, dir) {
  _v3.subVectors(p, o);
  return _v3.addScaledVector(dir, -_v3.dot(dir)).length();
}

/**
 * @param {THREE.Mesh} prop            rigid staff mesh (any parent)
 * @param {THREE.Bone} hand            right hand bone, already in the reference (idle) pose
 * @param {THREE.Vector3} bindHandPos  hand position (world) where the source holds the staff
 * @param {(a, b) => THREE.Vector3} pickHead  returns the head end of the two staff ends
 * @param {{index: string[], middle: string[], ring: string[], pinky: string[], thumb: string[]}} fingers
 * @returns {{ head, gem, axisLocal: THREE.Vector3, palmLocal: THREE.Vector3 }}
 */
export function gripStaff(prop, hand, bindHandPos, pickHead, fingers) {
  const bone = (n) => hand.getObjectByName(n);
  prop.updateMatrixWorld(true);
  hand.updateWorldMatrix(true, true);

  // --- staff axis (PCA), ends and radius -------------------------------------------
  const p = prop.geometry.attributes.position;
  const pts = [];
  const step = Math.max(1, Math.floor(p.count / 3000));
  for (let i = 0; i < p.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(prop.matrixWorld));
  const mean = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length);
  let axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  for (let it = 0; it < 30; it++) {
    const n = new THREE.Vector3();
    for (const q of pts) {
      const d = q.clone().sub(mean);
      n.addScaledVector(d, d.dot(axis));
    }
    axis = n.normalize();
  }
  let mn = Infinity, mx = -Infinity, pMin = null, pMax = null;
  for (const q of pts) {
    const t = q.clone().sub(mean).dot(axis);
    if (t < mn) { mn = t; pMin = q; }
    if (t > mx) { mx = t; pMax = q; }
  }
  const headEnd = pickHead(pMin, pMax);
  const buttEnd = headEnd === pMin ? pMax : pMin;
  const dir = headEnd.clone().sub(buttEnd).normalize();
  const length = headEnd.distanceTo(buttEnd);
  const tGrip = THREE.MathUtils.clamp(bindHandPos.clone().sub(buttEnd).dot(dir), length * 0.2, length * 0.6);
  const gripOld = buttEnd.clone().addScaledVector(dir, tGrip);
  const radii = [];
  for (const q of pts) {
    const t = q.clone().sub(buttEnd).dot(dir);
    if (Math.abs(t - tGrip) < length * 0.04) radii.push(lineDist(q, gripOld, dir));
  }
  radii.sort((a, b) => a - b);
  const radius = radii.length ? radii[Math.floor(radii.length * 0.6)] : 0.015;

  // --- hand frame ---------------------------------------------------------------------
  const H = worldPos(hand);
  const M1 = worldPos(bone(fingers.middle[0]));
  const handLen = M1.distanceTo(H);
  const F = M1.clone().sub(H).normalize(); // wrist -> knuckles
  const S = worldPos(bone(fingers.index[0])).sub(worldPos(bone(fingers.pinky[0])));
  S.addScaledVector(F, -S.dot(F)).normalize(); // across the knuckles, towards the thumb
  const palm = new THREE.Vector3().crossVectors(S, F).normalize();
  if (worldPos(bone(fingers.thumb[2])).sub(H).dot(palm) < 0) palm.negate();
  const segLen = worldPos(bone(fingers.middle[1])).distanceTo(M1);
  const fingerR = segLen * 0.32;

  // Staff across the palm, just behind the knuckles, head on the thumb side.
  const A = S.clone();
  const G = H.clone().addScaledVector(F, handLen * 0.78).addScaledVector(palm, radius + handLen * 0.16);
  const q = new THREE.Quaternion().setFromUnitVectors(dir, A);
  const m = new THREE.Matrix4()
    .makeTranslation(G.x, G.y, G.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
    .multiply(new THREE.Matrix4().makeTranslation(-gripOld.x, -gripOld.y, -gripOld.z))
    .multiply(prop.matrixWorld);
  const parentInv = new THREE.Matrix4().copy(prop.parent.matrixWorld).invert();
  prop.matrix.copy(parentInv.multiply(m));
  prop.matrix.decompose(prop.position, prop.quaternion, prop.scale);
  prop.updateMatrixWorld(true);
  hand.attach(prop);

  // --- curl the four fingers around the staff ------------------------------------------
  const curlSign = new THREE.Vector3().crossVectors(A, F).dot(palm) > 0 ? 1 : -1;
  const want = radius + fingerR;
  const rq = new THREE.Quaternion();
  const tipOf = (chain, k) => {
    if (k < chain.length - 1) return worldPos(chain[k + 1]);
    const a = worldPos(chain[k - 1]), b = worldPos(chain[k]);
    return b.clone().add(b.clone().sub(a).normalize().multiplyScalar(a.distanceTo(b) * 0.85));
  };
  for (const key of ['index', 'middle', 'ring', 'pinky']) {
    const chain = fingers[key].map(bone).filter(Boolean);
    for (let k = 0; k < chain.length; k++) {
      const joint = worldPos(chain[k]);
      const rel = tipOf(chain, k).sub(joint);
      let best = 0, bestErr = Infinity;
      for (let a = 0; a <= 1.9; a += 0.04) {
        rq.setFromAxisAngle(A, a * curlSign);
        const tip = _v1.copy(rel).applyQuaternion(rq).add(joint);
        const d = lineDist(tip, G, A);
        const err = Math.abs(d - want);
        if (err < bestErr) { bestErr = err; best = a; }
        if (d < want) break; // touching the staff: stop before cutting into it
      }
      rotateWorld(chain[k], rq.setFromAxisAngle(A, best * curlSign));
    }
  }

  // --- thumb: wrap over the front of the staff (CCD towards a point on its surface) ---
  const thumb = fingers.thumb.map(bone).filter(Boolean);
  if (thumb.length === 3) {
    const T = G.clone().addScaledVector(palm, radius + fingerR).addScaledVector(A, handLen * 0.12).addScaledVector(F, -fingerR);
    for (let it = 0; it < 6; it++) {
      for (let k = thumb.length - 1; k >= 0; k--) {
        const joint = worldPos(thumb[k]);
        const v1 = tipOf(thumb, thumb.length - 1).sub(joint).normalize();
        const v2 = T.clone().sub(joint).normalize();
        const ang = Math.min(v1.angleTo(v2), 0.25);
        if (ang < 1e-3) continue;
        rq.setFromAxisAngle(_v2.crossVectors(v1, v2).normalize(), ang);
        rotateWorld(thumb[k], rq);
      }
    }
  }

  // --- anchors --------------------------------------------------------------------------
  const toLocal = new THREE.Matrix4().copy(prop.matrixWorld).invert();
  const headNew = headEnd.clone().sub(gripOld).applyQuaternion(q).add(G);
  const head = new THREE.Object3D();
  head.position.copy(headNew.clone().applyMatrix4(toLocal));
  const gem = new THREE.Object3D();
  gem.position.copy(headNew.clone().addScaledVector(A, -0.08).applyMatrix4(toLocal));
  prop.add(head, gem);
  const handQi = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    head,
    gem,
    axisLocal: A.clone().applyQuaternion(handQi), // in hand space
    palmLocal: palm.clone().applyQuaternion(handQi),
  };
}

/**
 * Right-arm "holding the staff" pose (two-bone IK + hand orientation), blended over the
 * animated pose. All offsets are in the character's model space, scaled by arm length.
 */
export class StaffHold {
  /**
   * @param {THREE.Object3D} root  character root (model space = facing +Z, right = -X)
   * @param {{arm, fore, hand}} bones
   * @param {{axisLocal, palmLocal}} grip  from gripStaff
   */
  constructor(root, bones, grip) {
    this.root = root;
    this.arm = bones.arm;
    this.fore = bones.fore;
    this.hand = bones.hand;
    this.axisLocal = grip.axisLocal.clone();
    this.palmLocal = grip.palmLocal.clone();
    this.weight = 0;
    this.leftBones = bones.left || null; // the other arm (guard: both hands on the staff)
    this.guardW = 0;
    // Hand target relative to the shoulder (outward, down, forward) in arm lengths.
    this.carry = {
      offset: new THREE.Vector3(-0.36, -0.64, 0.34),
      up: new THREE.Vector3(-0.04, 1, 0.06).normalize(), // staff direction (model space)
      palmDir: new THREE.Vector3(1, 0, 0.25).normalize(), // palm faces the body
      pole: new THREE.Vector3(-0.35, -0.6, -1).normalize(), // elbow back and out
    };
    // Guard: the staff lies across the chest in front of the body, tilted a little, held low-and-wide in both hands.
    this.guard = {
      offset: new THREE.Vector3(0.12, -0.36, 0.62),
      up: new THREE.Vector3(0.93, 0.34, 0.14).normalize(),
      palmDir: new THREE.Vector3(0, -0.5, 1).normalize(),
      pole: new THREE.Vector3(-0.6, -0.5, -0.4).normalize(),
    };
    this.offset = this.carry.offset.clone();
    this.up = this.carry.up.clone();
    this.palmDir = this.carry.palmDir.clone();
    this.pole = this.carry.pole.clone();
    this._t = new THREE.Vector3();
    this._e = new THREE.Vector3();
    this._rootQ = new THREE.Quaternion();
    this._qa = new THREE.Quaternion();
    this._qf = new THREE.Quaternion();
    this._qh = new THREE.Quaternion();
  }

  /** Damp the blend weight towards `target` and apply. Call right after the mixer update. */
  update(target, dt, guard = 0) {
    this.guardW += (guard - this.guardW) * (1 - Math.exp(-12 * dt));
    const gw = this.guardW;
    this.offset.lerpVectors(this.carry.offset, this.guard.offset, gw);
    this.up.lerpVectors(this.carry.up, this.guard.up, gw).normalize();
    this.palmDir.lerpVectors(this.carry.palmDir, this.guard.palmDir, gw).normalize();
    this.pole.lerpVectors(this.carry.pole, this.guard.pole, gw).normalize();
    target = Math.max(target, gw);
    this.weight += (target - this.weight) * (1 - Math.exp(-10 * dt));
    const w = this.weight;
    if (w < 0.01) return;
    const { arm, fore, hand } = this;
    arm.updateWorldMatrix(true, true);
    const rootQ = this.root.getWorldQuaternion(this._rootQ);
    const s = worldPos(arm, new THREE.Vector3());
    const e = worldPos(fore, new THREE.Vector3());
    const h = worldPos(hand, new THREE.Vector3());
    const l1 = s.distanceTo(e), l2 = e.distanceTo(h);
    const L = l1 + l2;

    // Target wrist position and the elbow from the triangle + pole.
    const t = this._t.copy(this.offset).multiplyScalar(L).applyQuaternion(rootQ).add(s);
    const toT = _v1.subVectors(t, s);
    const d = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, L * 0.999);
    toT.normalize();
    t.copy(s).addScaledVector(toT, d);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pole = _v2.copy(this.pole).applyQuaternion(rootQ);
    pole.addScaledVector(toT, -pole.dot(toT)).normalize();
    const elbow = this._e.copy(s).addScaledVector(toT, a).addScaledVector(pole, hgt);

    // Original world rotations (to blend from).
    const armW0 = arm.getWorldQuaternion(new THREE.Quaternion());
    const foreW0 = fore.getWorldQuaternion(new THREE.Quaternion());
    const handW0 = hand.getWorldQuaternion(new THREE.Quaternion());

    // Upper arm, then forearm: shortest rotations onto the solved segments.
    const qa = this._qa.setFromUnitVectors(_v1.subVectors(e, s).normalize(), _v3.subVectors(elbow, s).normalize());
    const armW = qa.clone().multiply(armW0);
    const foreW1 = qa.clone().multiply(foreW0);
    const hRel = h.clone().sub(e).applyQuaternion(qa); // forearm vector after the arm turn
    const qf = this._qf.setFromUnitVectors(hRel.normalize(), _v1.subVectors(t, elbow).normalize());
    const foreW = qf.clone().multiply(foreW1);
    // Hand: staff axis -> up, palm -> towards the body.
    const handW1 = qf.clone().multiply(qa).multiply(handW0);
    const ax = this.axisLocal.clone().applyQuaternion(handW1);
    const pm = this.palmLocal.clone().applyQuaternion(handW1);
    const upW = _v1.copy(this.up).applyQuaternion(rootQ);
    const palmW = _v2.copy(this.palmDir).applyQuaternion(rootQ);
    const handW = frameQ(upW, palmW).multiply(frameQ(ax, pm).invert()).multiply(handW1);

    // Blend and write back as locals (parents first).
    setWorld(arm, armW0.slerp(armW, w));
    setWorld(fore, foreW0.slerp(foreW, w));
    setWorld(hand, handW0.slerp(handW, w));
    // Guard: the free hand takes the staff a little further along it (both hands keep their grip).
    if (gw > 0.02 && this.leftBones) {
      hand.updateWorldMatrix(true, false);
      const axisW = _v1.copy(this.up).applyQuaternion(rootQ);
      const hp = worldPos(hand, new THREE.Vector3());
      const tgt = hp.addScaledVector(axisW, 0.46 * L / 0.62);
      const polo = _v2.set(0.55, -0.55, -0.5).applyQuaternion(rootQ).normalize();
      const lb = this.leftBones;
      solveTwoBone(lb.arm, lb.fore, lb.hand, tgt, polo, gw);
    }
  }
}

/**
 * Two-bone IK (world space) blended over the current pose: `upper`-`lower` chain reaches
 * `target` with the middle joint bending towards `poleDir`. The end bone keeps its world
 * rotation (a foot stays flat, a hand keeps its grip).
 */
export function solveTwoBone(upper, lower, end, target, poleDir, w) {
  upper.updateWorldMatrix(true, true);
  const a = worldPos(upper, _t1), b = worldPos(lower, _t2), c = worldPos(end, _t3);
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const dir = _t4.subVectors(target, a);
  const d = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
  dir.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const pole = _t5.copy(poleDir).addScaledVector(dir, -poleDir.dot(dir)).normalize();
  const mid = _t6.copy(a).addScaledVector(dir, along).addScaledVector(pole, h);
  const reach = _t7.copy(a).addScaledVector(dir, d);

  const upW0 = upper.getWorldQuaternion(new THREE.Quaternion());
  const loW0 = lower.getWorldQuaternion(new THREE.Quaternion());
  const endW0 = end.getWorldQuaternion(new THREE.Quaternion());
  const qa = new THREE.Quaternion().setFromUnitVectors(_v1.subVectors(b, a).normalize(), _v2.subVectors(mid, a).normalize());
  const cRel = _v1.subVectors(c, b).applyQuaternion(qa).normalize();
  const qb = new THREE.Quaternion().setFromUnitVectors(cRel, _v2.subVectors(reach, mid).normalize());
  setWorld(upper, upW0.clone().slerp(qa.clone().multiply(upW0), w));
  setWorld(lower, loW0.clone().slerp(qb.multiply(qa).multiply(loW0), w));
  setWorld(end, endW0);
}

const [_t1, _t2, _t3, _t4, _t5, _t6, _t7] = Array.from({ length: 7 }, () => new THREE.Vector3());

function frameQ(primary, secondary) {
  const y = primary.clone().normalize();
  const x = secondary.clone().addScaledVector(y, -secondary.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function setWorld(b, q) {
  b.parent.updateWorldMatrix(true, false);
  const p = b.parent.getWorldQuaternion(_q2).invert();
  b.quaternion.copy(p.multiply(q));
  b.updateMatrixWorld(true);
}
