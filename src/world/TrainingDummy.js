import * as THREE from 'three';
import { damp, clamp } from '../core/math.js';

/**
 * Straw training dummy. Wobbles when bumped, gets launched by explosions,
 * tumbles to the ground and re-appears at its post after a while.
 */
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

let sharedMats = null;
function mats() {
  if (sharedMats) return sharedMats;
  sharedMats = {
    wood: new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.85 }),
    straw: new THREE.MeshStandardMaterial({ color: 0xd9b866, roughness: 0.95 }),
    sack: new THREE.MeshStandardMaterial({ color: 0xc9b089, roughness: 0.95 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.7 }),
  };
  return sharedMats;
}

export class TrainingDummy {
  constructor(world, position) {
    this.world = world;
    this.home = position.clone();
    this.root = new THREE.Group();
    this.root.position.copy(position);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.yaw = this.root.rotation.y;
    this.body = new THREE.Group(); // pivot at the base for wobble/tumble
    this.root.add(this.body);
    const m = mats();
    const add = (g, mat) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.body.add(mesh);
      return mesh;
    };
    add(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 8).translate(0, 0.95, 0), m.wood);
    add(new THREE.CylinderGeometry(0.26, 0.22, 0.75, 10).translate(0, 1.05, 0), m.straw);
    add(new THREE.BoxGeometry(1.05, 0.1, 0.1).translate(0, 1.32, 0), m.wood);
    add(new THREE.SphereGeometry(0.2, 12, 10).translate(0, 1.66, 0), m.sack);
    add(new THREE.CircleGeometry(0.2, 18).translate(0, 1.08, 0.235), m.white);
    add(new THREE.CircleGeometry(0.13, 18).translate(0, 1.08, 0.24), m.red);
    add(new THREE.CircleGeometry(0.05, 12).translate(0, 1.08, 0.245), m.white);

    this.collider = { x: position.x, z: position.z, y: position.y, r: 0.3, h: 1.9, enabled: true };
    this.isDummy = true;
    // Wobble (small-angle spring) state.
    this.wob = new THREE.Vector2();
    this.wobV = new THREE.Vector2();
    // Launch state.
    this.state = 'idle'; // idle | flying | down | respawn
    this.vel = new THREE.Vector3();
    this.tilt = 0;
    this.tiltV = 0;
    this.tiltAxis = new THREE.Vector3(1, 0, 0);
    this.spin = 0;
    this.spinV = 0;
    this.timer = 0;
  }

  /** Explosion response. */
  blast(center, radius, power) {
    const p = this.root.position;
    const dx = p.x - center.x, dz = p.z - center.z;
    const d = Math.hypot(dx, dz);
    if (d > radius * 1.8) return;
    const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
    if (d < radius && this.state === 'idle') {
      const f = 1 - d / radius;
      this.state = 'flying';
      this.vel.set(nx * power * (0.5 + f), 6 + 12 * f, nz * power * (0.5 + f));
      this.tiltAxis.set(nz, 0, -nx); // tip away from the blast
      this.tiltV = 4 + Math.random() * 6;
      this.spinV = (Math.random() - 0.5) * 10;
      this.collider.enabled = false;
    } else if (this.state === 'idle') {
      const f = 1 - clamp((d - radius) / (radius * 0.8), 0, 1);
      this.wobV.x += nz * 6 * f;
      this.wobV.y += -nx * 6 * f;
    }
  }

  update(dt, ctx) {
    const p = this.root.position;
    if (this.state === 'idle') {
      // Bump from the player.
      if (ctx?.playerPos) {
        const dx = p.x - ctx.playerPos.x, dz = p.z - ctx.playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.75 && ctx.playerSpeed > 0.5) {
          this.wobV.x += (dz / d) * ctx.playerSpeed * dt * 9;
          this.wobV.y += (-dx / d) * ctx.playerSpeed * dt * 9;
        }
      }
      this.wobV.x += (-this.wob.x * 60 - this.wobV.x * 3.2) * dt;
      this.wobV.y += (-this.wob.y * 60 - this.wobV.y * 3.2) * dt;
      this.wob.addScaledVector(this.wobV, dt);
      this.body.rotation.set(this.wob.x, 0, this.wob.y);
      this.body.quaternion.setFromEuler(this.body.rotation);
      return;
    }

    if (this.state === 'flying' || this.state === 'down') {
      this.vel.y -= 22 * dt;
      p.addScaledVector(this.vel, dt);
      const gy = this.world.heightAt(p.x, p.z);
      if (p.y <= gy) {
        p.y = gy;
        if (this.vel.y < -3) {
          this.vel.y *= -0.3;
          this.tiltV *= 0.5;
          this.spinV *= 0.5;
          ctx?.vfx?.burst('dust', p.clone().add(new THREE.Vector3(0, 0.2, 0)), 6);
        } else {
          this.vel.y = 0;
        }
        this.vel.x = damp(this.vel.x, 0, 5, dt);
        this.vel.z = damp(this.vel.z, 0, 5, dt);
        this.state = 'down';
      }
      if (this.state === 'down') {
        // Settle lying flat.
        this.tilt = damp(this.tilt, Math.PI / 2 - 0.12, 5, dt);
        this.spinV = damp(this.spinV, 0, 4, dt);
        this.timer += dt;
        if (this.timer > 5.5) {
          this.state = 'respawn';
          this.timer = 0;
        }
      } else {
        this.tilt += this.tiltV * dt;
      }
      this.spin += this.spinV * dt;
      _q.setFromAxisAngle(_yAxis, this.spin);
      _q2.setFromAxisAngle(_axis.copy(this.tiltAxis), this.tilt);
      this.body.quaternion.copy(_q2).multiply(_q);
      // Scale down before respawn.
      return;
    }

    if (this.state === 'respawn') {
      this.timer += dt;
      const t = this.timer;
      if (t < 0.35) {
        this.body.scale.setScalar(1 - t / 0.35);
      } else {
        if (!this._moved) {
          this._moved = true;
          p.copy(this.home);
          this.tilt = 0;
          this.spin = 0;
          this.body.quaternion.identity();
          this.wob.set(0, 0);
          this.wobV.set(0, 0);
          ctx?.vfx?.burst('magicPop', p.clone().add(new THREE.Vector3(0, 1, 0)), 24);
        }
        const k = clamp((t - 0.35) / 0.35, 0, 1);
        const s = 1 + Math.sin(k * Math.PI) * 0.15;
        this.body.scale.setScalar(k * s || 0.001);
        if (k >= 1) {
          this.body.scale.setScalar(1);
          this.state = 'idle';
          this._moved = false;
          this.timer = 0;
          this.collider.enabled = true;
        }
      }
    }
  }
}
