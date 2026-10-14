import * as THREE from 'three';
import { splitClip, strikeTime, loopSpeed, gaitProfile, MAPS } from './Retarget.js';
import { damp, clamp } from '../core/math.js';
import { solveTwoBone } from './rigUtils.js';

/**
 * Motion-capture animation state machine for humanoid characters (Megumin, Roxy).
 *
 * Clips come from the CC0 library, retargeted to the character's skeleton at load time.
 * Every clip is split into a LOWER (hips + legs) and UPPER (spine, arms, head) half so that:
 *  - the lower layer plays locomotion / full-body states,
 *  - the upper layer mirrors it (time-synced) or plays an action on top (staff attacks,
 *    hit reactions, interactions) while the legs keep running.
 * Locomotion is a speed-driven blend (idle -> walk -> jog -> sprint) with a shared phase so
 * feet don't slide when the speed changes. Cross-fades are explicit weight ramps.
 */

// 'rest' rigs only (see CharacterAnimator): `damp` softens the library's upper-body hunch
// (15-50° at the upper chest), `flight` flattens the leaps of its jog/sprint (bake options).
const SOFT = { chest: 0.55, neck: 0.55, lShoulder: 0.5, rShoulder: 0.5 };

export const CLIPSET = {
  Idle: { src: 'Idle_Loop', loop: true, damp: SOFT },
  Walk: { src: 'Walk_Loop', loop: true, damp: { chest: 0.7, neck: 0.7, lShoulder: 0.6, rShoulder: 0.6 } },
  Jog: { src: 'Jog_Fwd_Loop', loop: true, damp: SOFT, flight: 0.5 },
  Sprint: { src: 'Sprint_Loop', loop: true, damp: SOFT, flight: 0.7 },
  JumpStart: { src: 'Jump_Start', hipsY: 'down' },
  Fall: { src: 'Jump_Loop', loop: true, hipsY: 'none' },
  Land: { src: 'Jump_Land', hipsY: 'down' },
  Hit: { src: 'Hit_Chest' },
  Death: { src: 'Death01' },
  Crouch: { src: 'Crouch_Idle_Loop', loop: true },
  Roll: { src: 'Roll', hipsY: 'down', speed: 2.4 },
  CastEnter: { src: 'Spell_Simple_Enter' },
  CastLoop: { src: 'Spell_Simple_Idle_Loop', loop: true },
  CastShoot: { src: 'Spell_Simple_Shoot' },
  CastExit: { src: 'Spell_Simple_Exit' },
  // Staff combo (the staff is in the right hand): thrust, backhand sweep, lunging slash.
  Attack1: { src: 'Punch_Cross', speed: 1.45 },
  Attack2: { src: 'Punch_Jab', speed: 1.35 }, // quick jab with the staff butt: the hit lands fast
  Attack3: { src: 'Sword_Attack', speed: 1.3 },
  Interact: { src: 'Interact', speed: 1.6 },
};

const _rq = new THREE.Quaternion();
const _rqi = new THREE.Quaternion();
const _hq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _cq = new THREE.Quaternion();
const _corr = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const [_p0, _p1, _p2, _p3, _p4, _p5, _p6] = Array.from({ length: 7 }, () => new THREE.Vector3());

/** Apply a world-space rotation to a bone (pivot = its own origin). */
function rotateBoneWorld(b, q) {
  const w = b.getWorldQuaternion(_hq).premultiply(q);
  b.quaternion.copy(b.parent.getWorldQuaternion(_pq).invert().multiply(w));
  b.updateMatrixWorld(true);
}

/**
 * Locomotion blend by ground speed (m/s): pure walk below `walk` (the CapsLock stroll,
 * ~1.5), walk -> jog up to `jog`, pure jog up to `jogTop` (the default W speed 3.4),
 * jog -> sprint up to `sprint` (Shift runs at 6.4).
 */
const GAIT = { walk: 1.8, jog: 2.8, jogTop: 4.4, sprint: 5.6 };

/** Lower-layer states (full-body unless an upper action overrides). */
const BASE_FADE = { Loco: 0.22, JumpStart: 0.08, Fall: 0.25, Land: 0.08, CastEnter: 0.2, CastLoop: 0.15, CastShoot: 0.06, Death: 0.15, Crouch: 0.6, Roll: 0.08 };

export class CharacterAnimator {
  /**
   * @param {object} model   { mixerRoot, rigRoot, anim(Group), uniforms, setWind?, setCapeWind?, retarget? }
   *   retarget: 'rest' keeps the model's own bind posture as the neutral (see prepareTarget).
   * @param {AnimationLibrary} lib
   * @param {string} mapName 'mixamo' | 'cc'
   */
  constructor(model, lib, mapName) {
    this.model = model;
    this.map = MAPS[mapName];
    this.mixer = new THREE.AnimationMixer(model.mixerRoot);
    const rest = model.retarget === 'rest';
    const ctx = lib.prepareTarget(model.rigRoot, mapName, { match: rest ? 'rest' : 'dir' });
    this.lower = {};
    this.upper = {};
    this.info = {};
    for (const [name, def] of Object.entries(CLIPSET)) {
      const clip = lib.bake(ctx, def.src, {
        name, hipsY: def.hipsY, reverse: def.reverse,
        damp: rest ? def.damp : undefined, flight: rest ? def.flight : undefined,
      });
      const { lower, upper } = splitClip(clip, this.map);
      const speed = def.speed || 1;
      for (const [layer, c] of [[this.lower, lower], [this.upper, upper]]) {
        const a = this.mixer.clipAction(c);
        a.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = !def.loop;
        a.timeScale = speed;
        a.weight = 0;
        a.enabled = true;
        layer[name] = a;
      }
      this.info[name] = { duration: clip.duration / speed, speed, loop: !!def.loop };
    }
    lib.restore(ctx);
    // Head stabilisation: face direction in head-bone space (the reference pose faces +Z).
    this.rigRoot = model.rigRoot;
    this.headBone = ctx.bones.head;
    this.neckBone = ctx.bones.neck;
    this.headFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ctx.refQ.head.clone().invert());
    this.headLevel = 0;
    // Idle stance fix: the library idles stand in a staggered fighting stance (one foot
    // 40 cm behind the other), which reads as "mid-step". Legs are IK'd under the hips.
    const b = ctx.bones;
    this.legs = [['lThigh', 'lShin', 'lFoot', 'lToe'], ['rThigh', 'rShin', 'rFoot', 'rToe']]
      .filter((r) => r.every((n) => b[n]))
      .map(([t, s, f, toe]) => ({
        thigh: b[t], shin: b[s], foot: b[f],
        // Foot -> toe direction in foot space (the reference pose points it forward).
        fwd: ctx.refP[toe].clone().sub(ctx.refP[f]).setY(0).normalize().applyQuaternion(ctx.refQ[f].clone().invert()),
      }));
    this.hips = b.hips;
    this.stance = 0;
    // Standing reference (rig space): straight-leg hip height, ankle height and the bind leg
    // line (ankle behind the hip joint). 'rest' rigs stand up straight in idle.
    this.stand = rest && b.lFoot && b.rFoot ? {
      hipsY: ctx.refP.hips.y,
      footY: (ctx.refP.lFoot.y + ctx.refP.rFoot.y) / 2,
      footDZ: ((ctx.refP.lFoot.z - ctx.refP.lThigh.z) + (ctx.refP.rFoot.z - ctx.refP.rThigh.z)) / 2,
      hipDrop: 0.004, // knees ≈ 168° (the library idle sinks 4-5 cm into a ready stance -> 143°)
    } : null;
    // Hit frames of attacks (fastest hand motion), in scaled seconds.
    for (const n of ['Attack1', 'Attack2', 'Attack3']) {
      const def = CLIPSET[n];
      const t = strikeTime(lib, def.src, 'r');
      this.info[n].hitTime = (def.reverse ? lib.clips[def.src].duration - t : t) / this.info[n].speed;
    }
    // Reference speeds (m/s) of locomotion loops for foot-locking playback rates.
    // Foot travel underestimates fast gaits (flight phase), so jog/sprint get a stride factor.
    // The walk's planted foot moves at ≈ its foot travel; 1.15 keeps the 1.5 m/s stroll at
    // ~135 steps/min with little slip (1.35 gave ~0.4 m/s of skating).
    const k = ctx.scale;
    this.refSpeed = {
      Walk: loopSpeed(lib, 'Walk_Loop') * k * 1.15,
      Jog: loopSpeed(lib, 'Jog_Fwd_Loop') * k * 1.45,
      Sprint: loopSpeed(lib, 'Sprint_Loop') * k * 2.0,
    };
    // 'rest' rigs: the library jog and sprint are fast runs (a planted foot sweeps back at
    // ~5.1 / 7.6 m/s on Megumin) played at 3.4 / 6.4 m/s, so the feet skated backwards. Their
    // ground contacts are slowed down and the swings sped up (same cadence), see _warpPhase.
    this.warp = {};
    if (rest) {
      for (const n of ['Jog', 'Sprint']) {
        const g = gaitProfile(lib, CLIPSET[n].src);
        g.footSpeed *= k;
        if (g.contact > 0.05 && g.contact < 0.95 && g.footSpeed > 0.1) this.warp[n] = g;
      }
    }

    this.base = 'Loco';
    this.baseTime = 0;
    this.action = null; // { name, t }
    this.phase = 0;
    this.w = { lower: {}, upper: {} }; // current weights
    this.t = { lower: {}, upper: {} }; // target weights
    this.fade = { lower: 0.2, upper: 0.2 };
    this.speed = 0;
    this.time = 0;
    // Compatibility with the old procedural API used by Player/abilities.
    this.ctx = { landIntensity: 0, castCharge: 0, exhaustDuration: 3.2, phase: 0 };
    this.capeWind = new THREE.Vector3();
    this.hairWind = new THREE.Vector3();
    this.lean = { pitch: 0, roll: 0, vPitch: 0, vRoll: 0 };
    this.blow = 0;
    this.blowV = 0;
    this.gust = 0;
    this._legacy = 'Idle';
    this._applyBase('Loco', 0);
  }

  // ---------------------------------------------------------------------------
  // Public API (old state names are mapped onto mocap states)
  get state() {
    return this._legacy;
  }

  get actionName() {
    return this.action ? this.action.name : null;
  }

  /** Legacy names: Idle Walk Run Jump Fall Land Cast Release Exhausted. */
  set(name, restart = false) {
    if (name === this._legacy && !restart) return;
    this._legacy = name;
    switch (name) {
      case 'Idle': case 'Walk': case 'Run': this._applyBase('Loco'); break;
      case 'Jump': this._applyBase('JumpStart', 0.42); break;
      case 'Fall': this._applyBase('Fall'); break;
      case 'Land': this._applyBase('Land', 0.12); break;
      case 'Cast': this._applyBase('CastEnter'); break;
      case 'Release': this._applyBase('CastShoot'); break;
      case 'Exhausted': this._applyBase('Death'); break;
      case 'Roll': this._applyBase('Roll', 0.05); break;
      default: this._applyBase('Loco');
    }
  }

  /**
   * Play an upper-body action over the locomotion. `fullBody` also drives the legs with
   * the clip (attacks from standing still: the step of the swing instead of sliding feet).
   */
  playAction(name, fullBody = false) {
    if (!this.upper[name]) return;
    for (const L of fullBody ? [this.upper, this.lower] : [this.upper]) {
      L[name].reset();
      L[name].time = 0;
    }
    this.action = { name, t: 0, duration: this.info[name].duration, full: fullBody };
    this.fade.upper = name === 'Hit' ? 0.05 : 0.07;
    if (fullBody) this.fade.lower = 0.08;
  }

  stopAction() {
    this.action = null;
  }

  _applyBase(name, startAt = 0) {
    this.base = name;
    this.baseTime = 0;
    this.fade.lower = BASE_FADE[name] ?? 0.2;
    if (name !== 'Loco') {
      for (const L of [this.lower, this.upper]) {
        const a = L[name];
        a.reset();
        a.time = startAt * a.getClip().duration;
      }
    }
  }

  // ---------------------------------------------------------------------------
  update(dt, m) {
    this.time += dt;
    this.baseTime += dt;
    const speed = m.speed;
    this.speed = speed;

    // Automatic follow-ups.
    if (this.base === 'CastEnter' && this.baseTime > this.info.CastEnter.duration * 0.9) this._applyBase('CastLoop');
    if (this.base === 'Death') {
      const T = this.ctx.exhaustDuration;
      if (this.baseTime > T - 1.1) this._applyBase('Crouch');
    }
    if (this.base === 'Crouch' && this._legacy === 'Exhausted' && this.baseTime > 0.8) {
      // Player will set the next state; keep crouching until then.
    }

    // ----- target weights -----
    const tl = this.t.lower;
    for (const k in tl) tl[k] = 0;
    if (this.base === 'Loco') {
      // Speed blend: idle -> walk -> jog -> sprint.
      const s = speed;
      const wIdle = 1 - clamp(s / 0.6, 0, 1);
      let wWalk = 0, wJog = 0, wSprint = 0;
      const mov = 1 - wIdle;
      if (s < GAIT.walk) wWalk = mov;
      else if (s < GAIT.jog) { const k = (s - GAIT.walk) / (GAIT.jog - GAIT.walk); wWalk = mov * (1 - k); wJog = mov * k; }
      else if (s < GAIT.jogTop) wJog = mov;
      else if (s < GAIT.sprint) { const k = (s - GAIT.jogTop) / (GAIT.sprint - GAIT.jogTop); wJog = mov * (1 - k); wSprint = mov * k; }
      else wSprint = mov;
      tl.Idle = wIdle; tl.Walk = wWalk; tl.Jog = wJog; tl.Sprint = wSprint;
      // Shared phase: cycle duration = weighted (clip duration * refSpeed / speed).
      let cyc = 0;
      if (mov > 0.01) {
        let ws = 0;
        for (const [n, w] of [['Walk', wWalk], ['Jog', wJog], ['Sprint', wSprint]]) {
          if (w <= 0) continue;
          const d = this.lower[n].getClip().duration;
          cyc += w * d * (this.refSpeed[n] / Math.max(speed, 0.3));
          ws += w;
        }
        cyc = Math.max(cyc / ws, 0.2);
        this.phase = (this.phase + dt / cyc) % 1;
      }
      for (const n of ['Walk', 'Jog', 'Sprint']) {
        const d = this.lower[n].getClip().duration;
        const W = this.warp[n];
        const u = W && cyc > 0 ? this._warpPhase(W, this.phase, speed, cyc, d) : this.phase;
        this.lower[n].time = u * d;
        this.upper[n].time = u * d;
        this.lower[n].timeScale = 0;
        this.upper[n].timeScale = 0;
      }
    } else {
      tl[this.base] = 1;
    }
    this.ctx.phase = this.phase * Math.PI * 2;

    const act = this.action;
    if (act) {
      act.t += dt;
      if (act.t >= act.duration) {
        this.action = null;
        if (act.full) this.fade.lower = 0.18;
      }
    }
    // Full-body action from standing: the legs play the clip too.
    const fullAct = this.action?.full && this.base === 'Loco';
    if (fullAct) {
      for (const k in tl) tl[k] = 0;
      tl[this.action.name] = 1;
    }

    // Upper layer: action overrides, otherwise mirror the lower layer.
    const tu = this.t.upper;
    for (const k in tu) tu[k] = 0;
    if (this.action) {
      tu[this.action.name] = 1;
    } else {
      for (const k in tl) tu[k] = tl[k];
      this.fade.upper = Math.max(this.fade.upper, 0.12);
    }

    // ----- apply weights with fades -----
    this._blend('lower', this.lower, tl, dt);
    this._blend('upper', this.upper, tu, dt);
    // Keep the upper half of the base state in time with the lower half.
    if (!this.action && this.base !== 'Loco') this.upper[this.base].time = this.lower[this.base].time;
    if (!this.action) this.upper.Idle.time = this.lower.Idle.time;

    this.mixer.update(dt);

    // Relaxed stance while standing (fades out as soon as she walks or acts).
    const cw = this.w.lower;
    const idleShare = (cw.Idle || 0) / Math.max(1e-4, Object.values(cw).reduce((a, b) => a + b, 0));
    this.stance = damp(this.stance, this.base === 'Loco' && !fullAct ? idleShare : 0, 8, dt);
    this._fixStance(this.stance);

    // Staff-holding arm pose (IK) over the clips; released for attacks and spells.
    if (this.model.holdStaff) {
      let w;
      if (this.action) w = this.action.name === 'Hit' ? 0.6 : 0;
      // A little of the clip's arm swing shows through while walking and running.
      else if (this.base === 'Loco') w = 1 - 0.2 * (tl.Walk || 0) - 0.3 * clamp((this.speed - 2.5) / 3, 0, 1);
      else if (this.base === 'JumpStart' || this.base === 'Fall' || this.base === 'Land') w = 0.85;
      else w = 0;
      this.model.holdStaff(w, dt);
    }
    this._levelHead(dt);

    // ----- secondary motion -----
    const lean = this.lean;
    const loco = this.base === 'Loco' || this.base === 'Fall';
    const tP = loco ? clamp(m.localAccel.z * 0.006, -0.08, 0.1) : 0;
    const tR = loco ? clamp(-m.turnRate * speed * 0.008, -0.12, 0.12) : 0;
    lean.vPitch += ((tP - lean.pitch) * 120 - lean.vPitch * 18) * dt;
    lean.vRoll += ((tR - lean.roll) * 120 - lean.vRoll * 18) * dt;
    lean.pitch += lean.vPitch * dt;
    lean.roll += lean.vRoll * dt;
    const a = this.model.anim;
    a.rotation.set(lean.pitch, 0, lean.roll, 'YXZ');

    // Cloak / hair wind (blend shapes + shader flutter). At walking pace (the CapsLock stroll)
    // the cloak hangs closer to the body: half the speed-driven wind, full again from a jog.
    const lv = m.localVel;
    const calm = speed < 0.5 ? 1 : 0.5 + 0.5 * clamp((speed - GAIT.walk) / (GAIT.jog - GAIT.walk), 0, 1);
    const capeAmt = (speed > 4 ? 1 : speed > 0.5 ? 0.4 : 0.1) * calm;
    this.capeWind.x = damp(this.capeWind.x, -lv.x * 0.03 * calm, 6, dt);
    this.capeWind.y = damp(this.capeWind.y, clamp(-lv.y * 0.012 + capeAmt * 0.05, -0.15, 0.25), 6, dt);
    this.capeWind.z = damp(this.capeWind.z, clamp(-lv.z * 0.045 * calm - capeAmt * 0.08, -0.4, 0.12), 6, dt);
    // Keep the long braids moving gently even while standing. Roxy has no hair
    // bones in her source rig, so her hair material uses this as vertex sway.
    const idleSway = this.base === 'Loco' && speed < 0.35 ? Math.sin(this.time * 1.35) * 0.045 : 0;
    this.hairWind.set(-lv.x * 0.006 + idleSway, -lv.y * 0.004, -lv.z * 0.009 + idleSway * 0.45);
    const st = this.base;
    let tb = 0.05 + Math.sin(this.time * 1.3) * 0.03 + clamp(speed / 7, 0, 1) * 0.62 * calm;
    if (st === 'JumpStart' || st === 'Fall') tb = Math.max(tb, 0.45 + clamp(-lv.y * 0.04, 0, 0.4));
    if (st === 'CastEnter' || st === 'CastLoop') tb = 0.2 + this.ctx.castCharge * 0.7 + Math.sin(this.time * 9) * 0.05 * this.ctx.castCharge;
    if (st === 'CastShoot') tb = 1;
    if (st === 'Death' || st === 'Crouch') tb = 0.08;
    tb += this.gust;
    this.gust = damp(this.gust, 0, 2.5, dt);
    this.blowV += ((tb - this.blow) * 45 - this.blowV * 9) * dt;
    this.blow += this.blowV * dt;
    this.model.setWind?.(this.blow);
    const u = this.model.uniforms;
    if (u) {
      u.uTime.value = this.time;
      u.uHairWind?.value.copy(this.hairWind);
    }
    this.model.setCapeWind?.(this.capeWind);
  }

  /**
   * The library clips carry a downward gaze (idle ≈ 13°, jog ≈ 23°) that hides the face
   * under the big hats. Lift the face towards the horizon and damp head turns away from
   * the body's forward, split between neck and head.
   */
  _levelHead(dt) {
    const head = this.headBone;
    if (!head) return;
    const b = this.base;
    const target = this.action ? (this.action.name === 'Hit' ? 0.3 : 0.6)
      : b === 'Loco' ? 1 : b === 'JumpStart' || b === 'Fall' || b === 'Land' ? 0.7 : b.startsWith('Cast') ? 0.5 : 0;
    this.headLevel = damp(this.headLevel, target, 6, dt);
    const w = this.headLevel;
    if (w < 0.01) return;
    const rootQ = this.rigRoot.getWorldQuaternion(_rq);
    const rootQi = _rqi.copy(rootQ).invert();
    // Face direction in rig (model) space.
    const f = _f.copy(this.headFwd).applyQuaternion(head.getWorldQuaternion(_hq)).applyQuaternion(rootQi);
    const pitch = Math.atan2(f.y, Math.hypot(f.x, f.z));
    const yaw = Math.atan2(f.x, f.z);
    const lift = clamp(-pitch, -0.25, 0.6) * 0.85 * w;
    const turn = clamp(-yaw, -0.5, 0.5) * 0.5 * w;
    // World-space correction: yaw about up, then pitch about the face's lateral axis.
    const axis = _ax.crossVectors(f, _up).normalize().applyQuaternion(rootQ);
    _corr.setFromAxisAngle(axis, lift).premultiply(_cq.setFromAxisAngle(_ax.copy(_up).applyQuaternion(rootQ), turn));
    const neckShare = this.neckBone ? 0.35 : 0;
    if (neckShare) rotateBoneWorld(this.neckBone, _cq.identity().slerp(_corr, neckShare));
    rotateBoneWorld(head, _cq.identity().slerp(_corr, 1 - neckShare));
  }

  /**
   * Clip position (0..1) of a time-warped loop at the shared phase `p`: the planted intervals
   * (gaitProfile) get the share of the cycle in which a planted foot moves back at the ground
   * speed, the swing gets the rest. Monotonic, 0 -> 0 and 1 -> 1, so the loop stays seamless.
   */
  _warpPhase(W, p, speed, cyc, dur) {
    const C = W.contact;
    const rate = Math.max(speed, 0.3) / W.footSpeed; // clip rate that locks a planted foot
    const a = clamp((C * dur) / rate / cyc, C * 0.75, 0.6);
    const kc = a / C, kf = (1 - a) / (1 - C);
    let acc = 0;
    for (let i = 0; i < W.n; i++) {
      const l = (W.m[i] * kc + (1 - W.m[i]) * kf) / W.n;
      if (acc + l >= p) return (i + (p - acc) / l) / W.n;
      acc += l;
    }
    return p;
  }

  /** Feet side by side under the hips, toes forward (weight w over the animated pose). */
  _fixStance(w) {
    if (w < 0.01 || this.legs.length !== 2) return;
    const root = this.rigRoot;
    root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(_rq);
    const inv = _m4.copy(root.matrixWorld).invert();
    const local = (o, v) => o.getWorldPosition(v).applyMatrix4(inv);
    const st = this.stand;
    if (st) {
      // Stand up: hips back to (almost) the straight-leg height.
      const hp = local(this.hips, _p0);
      const want = st.hipsY - st.hipDrop;
      if (hp.y < want) {
        _p1.copy(hp).setY(hp.y + (want - hp.y) * w).applyMatrix4(root.matrixWorld);
        this.hips.position.copy(this.hips.parent.worldToLocal(_p1));
        this.hips.updateMatrixWorld(true);
      }
    }
    const hips = local(this.hips, _p0);
    const [L, R] = this.legs;
    const tl = local(L.thigh, _p1), tr = local(R.thigh, _p2);
    const fl = local(L.foot, _p3), fr = local(R.foot, _p4);
    const half = Math.abs(tl.x - tr.x) * 0.5 * (st ? 1.1 : 1.2);
    const side = Math.sign(tl.x - tr.x) || 1;
    const y = st ? st.footY : Math.min(fl.y, fr.y);
    const pole = _ax.set(0, 0, 1).applyQuaternion(rootQ);
    for (const [leg, s, th] of [[L, side, tl], [R, -side, tr]]) {
      const z = st ? th.z + st.footDZ : hips.z + 0.02;
      const target = _p5.set(hips.x + s * half, y, z).applyMatrix4(root.matrixWorld);
      solveTwoBone(leg.thigh, leg.shin, leg.foot, target, pole, w);
      // Toes forward with a slight outward splay, sole flat.
      const cur = _f.copy(leg.fwd).applyQuaternion(leg.foot.getWorldQuaternion(_hq));
      const want = _p6.set(Math.sin(0.12 * s), 0, Math.cos(0.12)).applyQuaternion(rootQ);
      rotateBoneWorld(leg.foot, _cq.identity().slerp(_corr.setFromUnitVectors(cur, want), w));
    }
  }

  _blend(layerName, actions, targets, dt) {
    const cur = this.w[layerName];
    const rate = dt / Math.max(this.fade[layerName], 1e-3);
    let total = 0;
    for (const n in actions) {
      const t = targets[n] || 0;
      let w = cur[n] || 0;
      w = w < t ? Math.min(t, w + rate) : Math.max(t, w - rate);
      // Loco blend weights follow speed directly (no lag) once faded in.
      cur[n] = w;
      total += w;
    }
    // Normalise so the layer always sums to 1 (no leak to the bind pose).
    for (const n in actions) {
      const a = actions[n];
      const w = total > 1e-4 ? cur[n] / total : (n === 'Idle' ? 1 : 0);
      if (w > 0.001) {
        if (!a.isRunning()) a.play();
        a.setEffectiveWeight(w);
      } else if (a.isRunning() && (cur[n] || 0) <= 0) {
        a.setEffectiveWeight(0);
        a.stop();
      }
    }
  }
}
