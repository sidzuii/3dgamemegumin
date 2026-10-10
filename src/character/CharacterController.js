import * as THREE from 'three';
import { damp, dampAngle, clamp } from '../core/math.js';

/**
 * Kinematic third-person controller using a "floating capsule":
 *
 *  - The collision capsule hovers STEP_HEIGHT above the feet, so it only touches
 *    walls/obstacles; the ground is found with a ring of downward rays.
 *  - Feet are snapped to the highest walkable hit => stairs/kerbs up to STEP_HEIGHT
 *    are climbed automatically, and slopes never make the character slide.
 *  - Surfaces steeper than MAX_SLOPE are not ground: the character falls and the
 *    capsule pushes it off (slides down).
 *  - Capsule-vs-triangle resolution uses the static world BVH (three-mesh-bvh).
 *  - Movement is integrated in sub-steps so fast motion never tunnels.
 */

const RADIUS = 0.3;
const STEP_HEIGHT = 0.38;
const CAPSULE_TOP = 1.55; // top of the capsule above feet
const MAX_SLOPE = THREE.MathUtils.degToRad(48);
const MIN_GROUND_NY = Math.cos(MAX_SLOPE);

export const MOVE = {
  walkSpeed: 3.4,
  runSpeed: 6.4,
  groundAccel: 34,
  groundDecel: 26,
  airAccel: 9,
  turnSpeed: 13,
  gravity: 26,
  fallGravityMul: 1.55,
  jumpCutGravityMul: 2.3,
  jumpSpeed: 8.4,
  coyoteTime: 0.13,
  jumpBuffer: 0.14,
  maxFallSpeed: 42,
};

const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;

const PROBE_OFFSETS = [
  [0, 0],
  [0.62, 0],
  [-0.62, 0],
  [0, 0.62],
  [0, -0.62],
];

export class CharacterController {
  constructor(world, opts = {}) {
    this.world = world;
    this.radius = opts.radius ?? RADIUS;
    this.stepHeight = opts.stepHeight ?? STEP_HEIGHT;
    this.capsuleTop = opts.height ?? CAPSULE_TOP;
    this.owner = opts.owner ?? null; // dynamic collider to ignore (our own)
    this.move = { ...MOVE, ...(opts.move || {}) };
    this.speedMul = 1;
    this.extVel = new THREE.Vector3(); // decaying external push (knockback)
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // facing (radians, 0 = +Z)
    this.turnRate = 0;
    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBufferTimer = 0;
    this.jumpLock = 0;
    this.jumping = false;
    this.lastFallSpeed = 0;
    this.stepOffset = 0; // visual smoothing for step-ups (negative while catching up)
    this.events = { jumped: false, landed: false, landSpeed: 0, stepped: false };
    this.prevVelocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this._probeHit = { y: 0, normal: new THREE.Vector3() };
  }

  /** Knockback: horizontal part decays on its own, vertical part goes into velocity.y. */
  addImpulse(v) {
    this.extVel.x += v.x;
    this.extVel.z += v.z;
    if (v.y) {
      this.velocity.y = Math.max(this.velocity.y, v.y);
      if (v.y > 0.5) {
        this.grounded = false;
        this.jumpLock = 0.1;
      }
    }
  }

  teleport(p, yaw = 0) {
    this.position.copy(p);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = false;
    this.stepOffset = 0;
  }

  /**
   * @param {number} dt
   * @param {object} cmd { moveDir: Vector3 (world, xz, length<=1), run: bool,
   *                       jumpPressed: bool, jumpHeld: bool, canMove: bool, faceYaw?: number }
   */
  update(dt, cmd) {
    const ev = this.events;
    ev.jumped = ev.landed = ev.stepped = false;
    this.prevVelocity.copy(this.velocity);

    // ----- Horizontal velocity: smooth acceleration / deceleration -----
    const wantDir = cmd.canMove ? cmd.moveDir : _dir.set(0, 0, 0);
    const inputMag = Math.min(1, wantDir.length());
    const maxSpeed = (cmd.run ? this.move.runSpeed : this.move.walkSpeed) * this.speedMul * (cmd.speedMul ?? 1);
    const targetVX = wantDir.x * maxSpeed;
    const targetVZ = wantDir.z * maxSpeed;
    let accel;
    if (this.grounded) accel = inputMag > 0.01 ? this.move.groundAccel : this.move.groundDecel;
    else accel = this.move.airAccel;
    // Approach with a constant acceleration cap (crisp) blended with damping (smooth tail).
    const dvx = targetVX - this.velocity.x;
    const dvz = targetVZ - this.velocity.z;
    const dvLen = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dvLen > maxDv) {
      this.velocity.x += (dvx / dvLen) * maxDv;
      this.velocity.z += (dvz / dvLen) * maxDv;
    } else {
      this.velocity.x = targetVX;
      this.velocity.z = targetVZ;
    }

    // ----- Facing -----
    const prevYaw = this.yaw;
    if (cmd.faceYaw !== undefined) {
      this.yaw = dampAngle(this.yaw, cmd.faceYaw, cmd.faceRate ?? 8, dt);
    } else if (inputMag > 0.05 && cmd.canMove) {
      const target = Math.atan2(wantDir.x, wantDir.z);
      // Turn a bit slower in the air for weight.
      this.yaw = dampAngle(this.yaw, target, this.grounded ? this.move.turnSpeed : this.move.turnSpeed * 0.45, dt);
    }
    let dy = this.yaw - prevYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.turnRate = damp(this.turnRate, dy / Math.max(dt, 1e-4), 10, dt);

    // ----- Jump (buffer + coyote time) -----
    this.jumpBufferTimer = cmd.jumpPressed ? this.move.jumpBuffer : Math.max(0, this.jumpBufferTimer - dt);
    this.coyote = this.grounded ? this.move.coyoteTime : Math.max(0, this.coyote - dt);
    if (this.jumpBufferTimer > 0 && this.coyote > 0 && cmd.canMove && cmd.canJump !== false) {
      this.velocity.y = this.move.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBufferTimer = 0;
      this.jumpLock = 0.12;
      this.jumping = true;
      ev.jumped = true;
    }
    this.jumpLock = Math.max(0, this.jumpLock - dt);

    // ----- Gravity -----
    if (!this.grounded) {
      let g = this.move.gravity;
      if (this.velocity.y < 0) g *= this.move.fallGravityMul;
      else if (this.jumping && !cmd.jumpHeld) g *= this.move.jumpCutGravityMul;
      this.velocity.y = Math.max(this.velocity.y - g * dt, -this.move.maxFallSpeed);
      this.airTime += dt;
    } else {
      this.airTime = 0;
    }

    // ----- Integrate in sub-steps -----
    const wasGrounded = this.grounded;
    const fallSpeed = -this.velocity.y;
    const travel = (this.velocity.length() + this.extVel.length()) * dt;
    const steps = clamp(Math.ceil(travel / 0.12), 1, 6);
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) this._step(sdt);

    if (!wasGrounded && this.grounded) {
      ev.landed = true;
      ev.landSpeed = Math.max(fallSpeed, 0);
      this.jumping = false;
    }

    this.extVel.multiplyScalar(Math.exp(-(this.grounded ? 7 : 2) * dt));
    // Visual step smoothing decays towards 0.
    this.stepOffset = damp(this.stepOffset, 0, 16, dt);

    this.acceleration.subVectors(this.velocity, this.prevVelocity).divideScalar(Math.max(dt, 1e-4));
  }

  _step(dt) {
    const p = this.position;
    const v = this.velocity;
    p.addScaledVector(v, dt);
    p.addScaledVector(this.extVel, dt);

    // --- Capsule vs world ---
    this._resolveCapsule();
    this._resolveDynamic();

    // --- Ground probe ---
    if (this.jumpLock > 0 || v.y > 0.5) {
      this.grounded = false;
      return;
    }
    const snap = this.grounded ? this.stepHeight + 0.12 : Math.max(0.02, -v.y * dt + 0.02);
    const hit = this._probeGround(this.stepHeight + snap);
    if (hit && hit.y >= p.y - snap) {
      const rise = hit.y - p.y;
      if (rise > 0.03 && this.grounded) {
        this.stepOffset -= rise; // model catches up smoothly
        this.events.stepped = rise > 0.1;
      }
      p.y = hit.y;
      if (v.y < 0) v.y = 0;
      this.grounded = true;
      this.groundNormal.copy(hit.normal);
    } else {
      this.grounded = false;
    }
  }

  _probeGround(maxDist) {
    const collider = this.world.collider;
    const p = this.position;
    let best = null;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    for (let i = 0; i < PROBE_OFFSETS.length; i++) {
      const [ox, oz] = PROBE_OFFSETS[i];
      const r = this.radius;
      _origin.set(p.x + (ox * cos + oz * sin) * r, p.y + this.stepHeight, p.z + (-ox * sin + oz * cos) * r);
      _ray.set(_origin, _down);
      _ray.far = maxDist + this.stepHeight;
      const hits = _ray.intersectObject(collider, false);
      if (!hits.length) continue;
      const h = hits[0];
      const n = h.face.normal;
      if (n.y < MIN_GROUND_NY) continue;
      // Outer probes only help on ledges/steps; the centre ray defines the slope.
      if (!best || h.point.y > best.y + 0.001) {
        best = this._probeHit;
        best.y = h.point.y;
        best.normal.copy(n);
      }
    }
    return best;
  }

  _resolveCapsule() {
    const collider = this.world.collider;
    const bvh = collider.geometry.boundsTree;
    const p = this.position;
    _seg.start.set(p.x, p.y + this.stepHeight + this.radius, p.z);
    _seg.end.set(p.x, p.y + this.capsuleTop - this.radius, p.z);
    _box.makeEmpty();
    _box.expandByPoint(_seg.start).expandByPoint(_seg.end);
    _box.min.addScalar(-this.radius);
    _box.max.addScalar(this.radius);
    const startY = _seg.start.y;
    const sx = _seg.start.x, sz = _seg.start.z;

    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
          if (d < this.radius) {
            const depth = this.radius - d;
            _dir.subVectors(_capPoint, _triPoint);
            if (_dir.lengthSq() < 1e-10) tri.getNormal(_dir);
            else _dir.normalize();
            _seg.start.addScaledVector(_dir, depth);
            _seg.end.addScaledVector(_dir, depth);
            pushed = true;
          }
        },
      });
      if (!pushed) break;
      _box.makeEmpty();
      _box.expandByPoint(_seg.start).expandByPoint(_seg.end);
      _box.min.addScalar(-this.radius);
      _box.max.addScalar(this.radius);
    }

    _delta.set(_seg.start.x - sx, _seg.start.y - startY, _seg.start.z - sz);
    const len = _delta.length();
    if (len > 1e-5) {
      _delta.divideScalar(len);
      // Walkable pushes are left to the ground probe (prevents sliding on slopes).
      if (_delta.y > MIN_GROUND_NY && this.grounded) {
        return;
      }
      // While grounded, steep surfaces behave like walls: resolve horizontally only,
      // so they never lift the character or inject vertical velocity (no jitter).
      if (this.grounded && _delta.y > -0.5) {
        const h = Math.hypot(_delta.x, _delta.z);
        if (h < 0.2) return;
        const push = Math.min(len / h, len * 3); // horizontal distance that clears the penetration
        _delta.set(_delta.x / h, 0, _delta.z / h);
        p.x += _delta.x * push;
        p.z += _delta.z * push;
        const vn = this.velocity.x * _delta.x + this.velocity.z * _delta.z;
        if (vn < 0) {
          this.velocity.x -= _delta.x * vn;
          this.velocity.z -= _delta.z * vn;
        }
        const en = this.extVel.x * _delta.x + this.extVel.z * _delta.z;
        if (en < 0) {
          this.extVel.x -= _delta.x * en;
          this.extVel.z -= _delta.z * en;
        }
        return;
      }
      p.x += _delta.x * len;
      p.z += _delta.z * len;
      p.y += _delta.y * len;
      const vn = this.velocity.dot(_delta);
      if (vn < 0) this.velocity.addScaledVector(_delta, -vn);
      const en = this.extVel.dot(_delta);
      if (en < 0) this.extVel.addScaledVector(_delta, -en);
      // Head bump.
      if (_delta.y < -0.5 && this.velocity.y > 0) this.velocity.y = 0;
    }
  }

  /** Simple vertical-cylinder colliders for dynamic props (e.g. training dummies). */
  _resolveDynamic() {
    const list = this.world.dynamicColliders;
    if (!list) return;
    const p = this.position;
    for (const c of list) {
      if (!c.enabled || c === this.owner) continue;
      if (p.y > c.y + c.h || p.y + this.capsuleTop < c.y) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const minD = c.r + this.radius;
      if (d < minD && d > 1e-5) {
        const nx = dx / d, nz = dz / d;
        p.x = c.x + nx * minD;
        p.z = c.z + nz * minD;
        const vn = this.velocity.x * nx + this.velocity.z * nz;
        if (vn < 0) {
          this.velocity.x -= nx * vn;
          this.velocity.z -= nz * vn;
        }
      }
    }
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
}

export const CAPSULE = { RADIUS, STEP_HEIGHT, CAPSULE_TOP };
