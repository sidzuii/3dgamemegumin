import * as THREE from 'three';

/**
 * Fixed-size particle pool rendered as one THREE.Points draw call.
 * Simulation is CPU-side on typed arrays (no per-frame allocations).
 *
 * Per-particle: position, velocity, life, size curve, colour curve (HDR allowed),
 * alpha envelope (fade in / fade out), drag, gravity, spin, optional orbit around a
 * vertical axis and flicker.
 */
export class ParticlePool {
  constructor({ max = 2000, texture, blending = THREE.AdditiveBlending, renderOrder = 10, name = 'particles' }) {
    this.max = max;
    this.cursor = 0;
    this.alive = 0;
    this.highWater = 0;

    const g = new THREE.BufferGeometry();
    this.aPos = new Float32Array(max * 3);
    this.aColor = new Float32Array(max * 4);
    this.aSize = new Float32Array(max);
    this.aAngle = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAngle', new THREE.BufferAttribute(this.aAngle, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geometry = g;

    // Simulation state.
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.col0 = new Float32Array(max * 3);
    this.col1 = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.orbit = new Float32Array(max); // rad/s around (ox, oz)
    this.orbitC = new Float32Array(max * 2);
    this.inward = new Float32Array(max);
    this.flicker = new Float32Array(max);

    const blendAdd = blending === THREE.AdditiveBlending;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uScale: { value: 800 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        attribute float aAngle;
        uniform float uScale;
        varying vec4 vColor;
        varying float vAngle;
        void main() {
          vColor = aColor;
          vAngle = aAngle;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = aSize * uScale / max(-mv.z, 0.05);
          gl_PointSize = clamp(px, 0.0, 600.0);
          if (aColor.a <= 0.002) gl_PointSize = 0.0;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec4 vColor;
        varying float vAngle;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vAngle), s = sin(vAngle);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          vec4 t = texture2D(uMap, uv);
          ${blendAdd
            ? 'gl_FragColor = vec4(vColor.rgb * t.rgb * t.a * vColor.a, 1.0);'
            : 'gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);'}
          if (gl_FragColor.a < 0.003) discard;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: blendAdd ? THREE.CustomBlending : THREE.NormalBlending,
      ...(blendAdd ? { blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation } : {}),
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.name = name;
  }

  /**
   * Spawn a particle. `o` fields (all optional except position):
   * x,y,z, vx,vy,vz, life, size, sizeEnd, color [r,g,b], colorEnd, alpha, fadeIn (0..1 of life),
   * drag, gravity, angle, spin, orbit, ox, oz, inward, flicker
   */
  spawn(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (i + 1 > this.highWater) this.highWater = i + 1;
    const i3 = i * 3;
    this.aPos[i3] = o.x; this.aPos[i3 + 1] = o.y; this.aPos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.life[i] = 0;
    this.maxLife[i] = o.life || 1;
    this.size0[i] = o.size ?? 0.2;
    this.size1[i] = o.sizeEnd ?? this.size0[i];
    const c0 = o.color || WHITE, c1 = o.colorEnd || c0;
    this.col0[i3] = c0[0]; this.col0[i3 + 1] = c0[1]; this.col0[i3 + 2] = c0[2];
    this.col1[i3] = c1[0]; this.col1[i3 + 1] = c1[1]; this.col1[i3 + 2] = c1[2];
    this.alpha[i] = o.alpha ?? 1;
    this.fadeIn[i] = o.fadeIn ?? 0.08;
    this.drag[i] = o.drag || 0;
    this.gravity[i] = o.gravity || 0;
    this.aAngle[i] = o.angle ?? Math.random() * Math.PI * 2;
    this.spin[i] = o.spin || 0;
    this.orbit[i] = o.orbit || 0;
    this.orbitC[i * 2] = o.ox || 0;
    this.orbitC[i * 2 + 1] = o.oz || 0;
    this.inward[i] = o.inward || 0;
    this.flicker[i] = o.flicker || 0;
  }

  update(dt, camera, viewportHeight) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const n = this.highWater;
    const P = this.aPos, V = this.vel, C = this.aColor;
    let alive = 0;
    let lastAlive = -1;
    for (let i = 0; i < n; i++) {
      const ml = this.maxLife[i];
      if (this.life[i] >= ml) {
        C[i * 4 + 3] = 0;
        this.aSize[i] = 0;
        continue;
      }
      const l = (this.life[i] += dt);
      const i3 = i * 3;
      if (l >= ml) {
        C[i * 4 + 3] = 0;
        this.aSize[i] = 0;
        continue;
      }
      alive++;
      lastAlive = i;
      const t = l / ml;
      // Forces.
      const dr = Math.exp(-this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] *= dr; V[i3 + 2] *= dr;
      V[i3 + 1] -= this.gravity[i] * dt;
      // Orbit around a vertical axis + pull inward.
      const ob = this.orbit[i];
      if (ob !== 0 || this.inward[i] !== 0) {
        const cx = this.orbitC[i * 2], cz = this.orbitC[i * 2 + 1];
        let dx = P[i3] - cx, dz = P[i3 + 2] - cz;
        const a = ob * dt;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = dx * ca - dz * sa, nz = dx * sa + dz * ca;
        const r = Math.hypot(nx, nz);
        const shrink = r > 1e-4 ? Math.max(0, r - this.inward[i] * dt) / r : 1;
        P[i3] = cx + nx * shrink;
        P[i3 + 2] = cz + nz * shrink;
      }
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      this.aAngle[i] += this.spin[i] * dt;
      // Curves.
      this.aSize[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * (1 - (1 - t) * (1 - t));
      const fi = this.fadeIn[i];
      let a = t < fi ? t / fi : 1 - (t - fi) / (1 - fi);
      a = a * a * (3 - 2 * a);
      if (this.flicker[i] > 0) a *= 1 - this.flicker[i] * (0.5 + 0.5 * Math.sin(l * 40 + i));
      const i4 = i * 4;
      C[i4] = this.col0[i3] + (this.col1[i3] - this.col0[i3]) * t;
      C[i4 + 1] = this.col0[i3 + 1] + (this.col1[i3 + 1] - this.col0[i3 + 1]) * t;
      C[i4 + 2] = this.col0[i3 + 2] + (this.col1[i3 + 2] - this.col0[i3 + 2]) * t;
      C[i4 + 3] = a * this.alpha[i];
    }
    this.alive = alive;
    // Shrink the draw range when the tail is dead (and cursor is behind it).
    if (lastAlive + 1 < this.highWater && this.cursor <= lastAlive + 1) this.highWater = lastAlive + 1;
    if (alive === 0) {
      this.highWater = 0;
      this.cursor = 0;
    }
    const g = this.geometry;
    g.setDrawRange(0, this.highWater);
    if (this.highWater > 0) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
      g.attributes.aAngle.needsUpdate = true;
    }
  }
}

const WHITE = [1, 1, 1];

/**
 * Velocity-stretched spark streaks (screen-space quads), additive HDR.
 */
export class SparkPool {
  constructor(max = 600) {
    this.max = max;
    this.cursor = 0;
    this.highWater = 0;
    const vcount = max * 4;
    this.aHead = new Float32Array(vcount * 3);
    this.aTail = new Float32Array(vcount * 3);
    this.aColor = new Float32Array(vcount * 4);
    const corner = new Float32Array(vcount * 2);
    const index = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      corner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
      index.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.aHead, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTail', new THREE.BufferAttribute(this.aTail, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    this.geometry = g;

    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.width = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.stretch = new Float32Array(max);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: /* glsl */ `
        attribute vec3 aTail;
        attribute vec4 aColor;
        attribute vec2 aCorner; // x: 0 head / 1 tail, y: side
        uniform vec2 uRes;
        varying vec4 vColor;
        varying float vSide;
        void main() {
          vec4 h = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 t = projectionMatrix * modelViewMatrix * vec4(aTail, 1.0);
          vec2 hs = h.xy / h.w, ts = t.xy / t.w;
          vec2 dir = (hs - ts) * uRes;
          float len = length(dir);
          dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          vec4 p = aCorner.x < 0.5 ? h : t;
          float w = aColor.a > 0.0 ? 2.2 : 0.0; // px half-width
          p.xy += nrm * aCorner.y * w / uRes * p.w;
          // Cap: extend the head a little so short sparks remain visible.
          p.xy += dir * (aCorner.x < 0.5 ? 1.5 : -0.5) / uRes * p.w;
          gl_Position = p;
          vColor = aColor;
          vSide = aCorner.y;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        varying float vSide;
        void main() {
          float f = 1.0 - abs(vSide);
          gl_FragColor = vec4(vColor.rgb * vColor.a * f, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, // quad winding depends on the screen-space direction
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.name = 'sparks';
  }

  spawn(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (i + 1 > this.highWater) this.highWater = i + 1;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx; this.vel[i3 + 1] = o.vy; this.vel[i3 + 2] = o.vz;
    this.life[i] = 0;
    this.maxLife[i] = o.life || 1;
    const c = o.color || [4, 2, 0.6];
    this.color[i3] = c[0]; this.color[i3 + 1] = c[1]; this.color[i3 + 2] = c[2];
    this.gravity[i] = o.gravity ?? 9.8;
    this.drag[i] = o.drag ?? 0.6;
    this.stretch[i] = o.stretch ?? 0.035;
  }

  update(dt, width, height) {
    this.material.uniforms.uRes.value.set(width * 0.5, height * 0.5);
    const n = this.highWater;
    let lastAlive = -1;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      let a = 0;
      if (this.life[i] < this.maxLife[i]) {
        this.life[i] += dt;
        const t = this.life[i] / this.maxLife[i];
        if (t < 1) {
          lastAlive = i;
          const dr = Math.exp(-this.drag[i] * dt);
          this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.gravity[i] * dt; this.vel[i3 + 2] *= dr;
          this.pos[i3] += this.vel[i3] * dt;
          this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
          this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
          a = (1 - t) * (1 - t);
        }
      }
      const st = this.stretch[i];
      for (let k = 0; k < 4; k++) {
        const v = (i * 4 + k) * 3;
        this.aHead[v] = this.pos[i3]; this.aHead[v + 1] = this.pos[i3 + 1]; this.aHead[v + 2] = this.pos[i3 + 2];
        this.aTail[v] = this.pos[i3] - this.vel[i3] * st;
        this.aTail[v + 1] = this.pos[i3 + 1] - this.vel[i3 + 1] * st;
        this.aTail[v + 2] = this.pos[i3 + 2] - this.vel[i3 + 2] * st;
        const c4 = (i * 4 + k) * 4;
        this.aColor[c4] = this.color[i3]; this.aColor[c4 + 1] = this.color[i3 + 1]; this.aColor[c4 + 2] = this.color[i3 + 2];
        this.aColor[c4 + 3] = a;
      }
    }
    if (lastAlive + 1 < this.highWater && this.cursor <= lastAlive + 1) this.highWater = lastAlive + 1;
    if (lastAlive < 0) { this.highWater = 0; this.cursor = 0; }
    const g = this.geometry;
    g.setDrawRange(0, this.highWater * 6);
    if (this.highWater > 0) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aTail.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
    }
  }
}
