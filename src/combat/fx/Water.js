import * as THREE from 'three';
import { clamp } from '../../core/math.js';

/**
 * Shared pieces of Roxy's water (docs/combat/05 §5; water-crystal-skill-vfx principles):
 * transparency first, a bright silver edge where the surface turns away, a darker unlit side, glints that
 * travel along the flow, variable thickness. Never a solid glowing blue tube. One material is shared by every
 * water piece; opacity comes from a per-piece uniform copy.
 */
const VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vW;
  attribute float aW;
  void main(){
    vUv = uv; vW = aW;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform float uTime, uAlpha, uFlow;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vW;
  void main(){
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 deep = vec3(0.04, 0.22, 0.42);       // the unlit side
    vec3 body = vec3(0.30, 0.66, 1.05);
    vec3 col = mix(deep, body, 0.35 + f * 0.65);
    float flow = sin(vUv.x * uFlow - uTime * 16.0 + vUv.y * 7.0) * 0.5 + 0.5;
    float glint = smoothstep(0.86, 1.0, f * 0.9 + flow * 0.22);
    col += vec3(1.6, 1.9, 2.2) * glint * 0.9;   // silver edge / glints
    float a = (0.20 + f * 0.62 + glint * 0.2) * uAlpha * vW;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  }`;

export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uFlow: { value: 30 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

let sharedMat = null;
export function waterMaterial() {
  return sharedMat || (sharedMat = makeWaterMaterial());
}

const _side = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _side2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * A camera-facing ribbon of N+1 points with a width per point (variable thickness). `set(points, widths)` rebuilds
 * the vertices every frame; the material is the shared water one cloned for its own opacity.
 */
export class Ribbon {
  constructor(scene, n = 24) {
    this.n = n;
    const verts = (n + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    this.w = new Float32Array(verts);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('aW', new THREE.BufferAttribute(this.w, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    for (let i = 0; i <= n; i++) {
      for (let k = 0; k < 2; k++) {
        this.uv[(i * 2 + k) * 2] = i / n;
        this.uv[(i * 2 + k) * 2 + 1] = k;
      }
    }
    this.geometry = g;
    this.material = makeWaterMaterial();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** points: array of n+1 {x,y,z}; widths: array of n+1 (metres); fade: per-point opacity (optional). */
  set(points, widths, camera, fade) {
    const n = this.n;
    for (let i = 0; i <= n; i++) {
      const p = points[i];
      const q = points[Math.min(n, i + 1)], r = points[Math.max(0, i - 1)];
      _tan.set(q.x - r.x, q.y - r.y, q.z - r.z);
      if (_tan.lengthSq() < 1e-8) _tan.set(0, 0, 1);
      _tan.normalize();
      _toCam.set(camera.position.x - p.x, camera.position.y - p.y, camera.position.z - p.z).normalize();
      // Camera-facing width, blended with a horizontal band: a lash pointing away from the camera would collapse to a line.
      _side.crossVectors(_tan, _toCam);
      const camK = _side.length();
      _side.multiplyScalar(0.55 / Math.max(camK, 0.2));
      _side2.crossVectors(_tan, _up).normalize().multiplyScalar(0.45);
      _side.add(_side2).normalize().multiplyScalar(widths[i] * 0.5);
      for (let k = 0; k < 2; k++) {
        const s = k ? 1 : -1;
        const o = (i * 2 + k) * 3;
        this.pos[o] = p.x + _side.x * s;
        this.pos[o + 1] = p.y + _side.y * s;
        this.pos[o + 2] = p.z + _side.z * s;
        // The normal turns across the ribbon so the fresnel edge brightens at both sides.
        this.nrm[o] = _toCam.x * (1 - 0.0) + _side.x * s * 6;
        this.nrm[o + 1] = _toCam.y + _side.y * s * 6;
        this.nrm[o + 2] = _toCam.z + _side.z * s * 6;
        this.w[i * 2 + k] = (fade ? fade[i] : 1) * clamp(widths[i] * 18, 0, 1);
      }
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = true;
    a.normal.needsUpdate = true;
    a.aW.needsUpdate = true;
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * A damp mark left on the ground (about 4 s): a darker, slightly blue disc with an irregular edge that fades
 * and does nothing else (docs/combat/03 R-F: no damage, no status, no block).
 */
export class WetDecal {
  constructor(world, center, radius, life = 4) {
    this.life = life;
    this.t = 0;
    const g = new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0.0 }, uSeed: { value: Math.random() * 10 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uA, uSeed; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
        void main(){
          float r = length(vP) / ${radius.toFixed(3)};
          float ang = atan(vP.y, vP.x);
          float edge = 0.78 + 0.17 * sin(ang * 5.0 + uSeed) + 0.08 * sin(ang * 11.0 + uSeed * 2.0);
          float a = (1.0 - smoothstep(edge - 0.12, edge, r)) * uA;
          a *= 0.8 + 0.2 * h(floor(vP * 6.0));
          gl_FragColor = vec4(0.03, 0.08, 0.16, a * 0.55);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.object = new THREE.Mesh(g, this.material);
    this.object.position.set(center.x, world.groundAt(center.x, center.z, center.y + 2) + 0.045, center.z);
    this.object.renderOrder = 4;
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) return false;
    this.material.uniforms.uA.value = Math.min(1, this.t / 0.15) * (1 - clamp((k - 0.45) / 0.55, 0, 1));
    return true;
  }
  dispose() {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

/** A short glowing flat ring on the ground (additive): flashes of impact and the breach marks. */
export class GroundFlash {
  constructor(world, center, radius, life, color = [2.6, 1.0, 0.3], yOffset = 0.07) {
    this.life = life;
    this.t = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 }, uC: { value: new THREE.Vector3(...color) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uA; uniform vec3 uC; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          if (r > 1.0) discard;
          float core = (1.0 - smoothstep(0.0, 0.7, r)) * 0.8;
          float ring = smoothstep(0.55, 0.85, r) * (1.0 - smoothstep(0.85, 1.0, r));
          gl_FragColor = vec4(uC * (core + ring) * uA, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.radius = radius;
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.material);
    this.object.position.set(center.x, world.groundAt(center.x, center.z, center.y + 2) + yOffset, center.z);
    this.object.scale.setScalar(radius * 0.4);
    this.object.renderOrder = 9;
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) return false;
    this.object.scale.setScalar(this.radius * (0.4 + 0.6 * Math.sqrt(k)));
    this.material.uniforms.uA.value = (1 - k) * (1 - k);
    return true;
  }
  dispose() {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

let sphereGeo = null;
/** Unit sphere with the per-vertex opacity attribute the water shader expects. */
export function waterSphereGeometry() {
  if (sphereGeo) return sphereGeo;
  const g = new THREE.SphereGeometry(1, 18, 14);
  g.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
  sphereGeo = g;
  return g;
}
