import * as THREE from 'three';
import { damp, dampAngle, clamp, valueNoise } from '../core/math.js';

/**
 * Third-person orbit camera:
 *  - mouse-driven yaw/pitch with light inertia and clamped pitch;
 *  - smoothed pivot follow (vertical follow softer than horizontal => no jitter on steps/jumps);
 *  - wheel zoom with smoothing;
 *  - collision: a bundle of rays approximates a sphere-cast from the pivot to the camera,
 *    pulls in instantly when obstructed and eases back out when clear;
 *  - trauma-based screen shake + FOV kick.
 */

const PIVOT_HEIGHT = 1.42;
const SHOULDER = 0.32;
const PROBE_RADIUS = 0.22;
const MIN_DIST = 0.7;
const MIN_PITCH = THREE.MathUtils.degToRad(-55);
const MAX_PITCH = THREE.MathUtils.degToRad(72);

const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _offsetDir = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = Math.PI; // camera sits at +offset; PI => behind a character facing +Z... set by game
    this.pitch = THREE.MathUtils.degToRad(14);
    this.yawS = this.yaw;
    this.pitchS = this.pitch;
    this.distance = 4.6;
    this.distanceS = this.distance;
    this.collisionDist = this.distance;
    this.pivot = new THREE.Vector3();
    this.sensitivity = 0.0024;
    this.baseFov = 60;
    this.fovKick = this.baseFov; // current (smoothed) FOV
    this.trauma = 0;
    this.shakeTime = 0;
    this.extraPitch = 0; // landing dip
    this.extraPitchV = 0;
    this.lookAhead = new THREE.Vector3();
    this.initialized = false;
  }

  addTrauma(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Small downward camera dip (e.g. on landing). */
  impulse(pitchVelocity) {
    this.extraPitchV += pitchVelocity;
  }

  snapBehind(yaw) {
    this.yaw = this.yawS = yaw;
  }

  /** Forward direction on the ground plane for movement input. */
  getForward(target) {
    return target.set(-Math.sin(this.yawS), 0, -Math.cos(this.yawS));
  }

  getRight(target) {
    return target.set(Math.cos(this.yawS), 0, -Math.sin(this.yawS));
  }

  update(dt, input, focus, opts = {}) {
    // ---- Input ----
    if (input) {
      this.yaw -= input.mouseDX * this.sensitivity;
      this.pitch += input.mouseDY * this.sensitivity;
      this.pitch = clamp(this.pitch, MIN_PITCH, MAX_PITCH);
      if (input.wheel) {
        this.distance = clamp(this.distance * Math.pow(1.0013, input.wheel), 1.4, 10);
      }
    }
    // Light inertia on rotation.
    this.yawS = dampAngle(this.yawS, this.yaw, 22, dt);
    this.pitchS = damp(this.pitchS, this.pitch, 22, dt);
    this.distanceS = damp(this.distanceS, this.distance, 9, dt);

    // Landing dip spring.
    this.extraPitchV += (-this.extraPitch * 160 - this.extraPitchV * 16) * dt;
    this.extraPitch += this.extraPitchV * dt;

    // ---- Pivot follow ----
    _v.set(focus.x, focus.y + PIVOT_HEIGHT, focus.z);
    if (opts.lookAhead) _v.add(opts.lookAhead);
    if (!this.initialized) {
      this.pivot.copy(_v);
      this.collisionDist = this.distanceS;
      this.initialized = true;
    }
    this.pivot.x = damp(this.pivot.x, _v.x, 16, dt);
    this.pivot.z = damp(this.pivot.z, _v.z, 16, dt);
    this.pivot.y = damp(this.pivot.y, _v.y, opts.airborne ? 6 : 10, dt);

    const pitch = this.pitchS + this.extraPitch;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    _offsetDir.set(Math.sin(this.yawS) * cp, sp, Math.cos(this.yawS) * cp).normalize();
    this.getRight(_right);

    // Shoulder offset (checked against walls so it never pokes through).
    const shoulderAmt = SHOULDER * clamp((this.distanceS - 1.2) / 2.5, 0.25, 1);
    let shoulderDist = shoulderAmt;
    const sh = this._cast(this.pivot, _right, shoulderAmt + PROBE_RADIUS, 0);
    if (sh < shoulderAmt + PROBE_RADIUS) shoulderDist = Math.max(0, sh - PROBE_RADIUS);
    _shoulder.copy(this.pivot).addScaledVector(_right, shoulderDist);

    // ---- Collision ----
    const wanted = this.distanceS;
    const hit = this._cast(_shoulder, _offsetDir, wanted + PROBE_RADIUS, PROBE_RADIUS);
    const allowed = clamp(hit - PROBE_RADIUS, MIN_DIST, wanted);
    if (allowed < this.collisionDist) this.collisionDist = damp(this.collisionDist, allowed, 40, dt);
    else this.collisionDist = damp(this.collisionDist, allowed, 4.5, dt);

    const cam = this.camera;
    cam.position.copy(_shoulder).addScaledVector(_offsetDir, this.collisionDist);

    // Keep above terrain.
    const gy = this.world.heightAt(cam.position.x, cam.position.z) + 0.25;
    if (cam.position.y < gy) cam.position.y = gy;

    // Look slightly above the pivot when close so the character isn't cut off.
    _v2.copy(_shoulder);
    cam.lookAt(_v2.addScaledVector(_offsetDir, -1));

    // ---- Shake (trauma^2, smooth noise) ----
    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.shakeTime * 22;
      const yawS = valueNoise(t, 1.7) * 0.05 * s;
      const pitS = valueNoise(t, 9.3) * 0.05 * s;
      const rolS = valueNoise(t, 17.1) * 0.07 * s;
      _e.set(pitS, yawS, rolS, 'YXZ');
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
      cam.getWorldDirection(_up);
      cam.position.x += valueNoise(t, 31.7) * 0.12 * s;
      cam.position.y += valueNoise(t, 41.3) * 0.12 * s;
    }

    // ---- FOV ----
    const targetFov = this.baseFov + (opts.fovBoost || 0);
    this.fovKick = damp(this.fovKick, targetFov, 5, dt);
    if (Math.abs(cam.fov - this.fovKick) > 0.01) {
      cam.fov = this.fovKick;
      cam.updateProjectionMatrix();
    }
  }

  /**
   * Sphere-cast approximation: centre ray + 4 rays offset perpendicular to `dir`.
   * Returns the nearest hit distance (or `maxDist`).
   */
  _cast(origin, dir, maxDist, radius) {
    const collider = this.world.collider;
    let best = maxDist;
    _up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.95) _up.set(1, 0, 0);
    const side = _v2.crossVectors(dir, _up).normalize();
    _up.crossVectors(side, dir).normalize();
    const offsets = radius > 0 ? 5 : 1;
    for (let i = 0; i < offsets; i++) {
      const o = _v.copy(origin);
      if (i === 1) o.addScaledVector(side, radius * 0.7);
      if (i === 2) o.addScaledVector(side, -radius * 0.7);
      if (i === 3) o.addScaledVector(_up, radius * 0.7);
      if (i === 4) o.addScaledVector(_up, -radius * 0.7);
      _ray.set(o, dir);
      _ray.far = maxDist;
      const hits = _ray.intersectObject(collider, false);
      if (hits.length && hits[0].distance < best) best = hits[0].distance;
    }
    return best;
  }
}
