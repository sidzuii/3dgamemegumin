import * as THREE from 'three';
import { makeMagicCircleTexture, makeScorchTexture, makeSoftSprite } from '../world/textures.js';
import { clamp, easeOutCubic, easeOutExpo, smoothstep } from '../core/math.js';

/** Shared GLSL 3D simplex noise (Ashima / Stefan Gustavson, MIT). */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm3(vec3 p){float s=0.0,a=0.5;for(int i=0;i<4;i++){s+=snoise(p)*a;p*=2.02;a*=0.5;}return s;}
`;

/** Geometries are shared between effect instances (no per-cast allocations / GPU uploads). */
const GEO = {};
function geo(key, make) {
  return GEO[key] || (GEO[key] = make());
}

/**
 * Materials are pooled per effect type: a finished effect returns its material and the next
 * cast reuses it, so no shader programs are created or destroyed during gameplay.
 */
const MAT_POOL = new Map();
function takeMat(key, make) {
  const list = MAT_POOL.get(key);
  return (list && list.pop()) || make();
}
function giveMat(key, material) {
  if (!MAT_POOL.has(key)) MAT_POOL.set(key, []);
  MAT_POOL.get(key).push(material);
}

let circleTextures = null;
function getCircleTextures() {
  if (!circleTextures) {
    circleTextures = [makeMagicCircleTexture(512, 3, 0), makeMagicCircleTexture(512, 11, 1)];
  }
  return circleTextures;
}

// -----------------------------------------------------------------------------
/** Glowing rotating magic circle. Control with `.intensity` target and `.kill()`. */
export class MagicCircle {
  constructor({ radius = 2, color = [6, 1.2, 0.35], variant = 0, spin = 0.6, position, normal = null, groundOffset = 0.04 }) {
    const tex = getCircleTextures()[variant];
    this.material = takeMat('MagicCircle', () => new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uColor: { value: new THREE.Color(...color) },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uReveal: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uIntensity, uTime, uReveal;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float ang = atan(d.y, d.x) / 6.28318 + 0.5;
          // Reveal sweeps around the circle as it is "drawn".
          float reveal = uReveal >= 1.0 ? 1.0 : 1.0 - smoothstep(uReveal - 0.03, uReveal, ang);
          float t = texture2D(uMap, vUv).a;
          float pulse = 0.85 + 0.15 * sin(uTime * 6.0 - r * 10.0);
          float glow = smoothstep(1.0, 0.0, r) * 0.08; // faint disc fill
          vec3 col = uColor * (t * pulse + glow) * uIntensity * reveal;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }));
    const u0 = this.material.uniforms; // pooled material: re-apply per-instance values
    u0.uMap.value = tex;
    u0.uColor.value.setRGB(...color);
    u0.uIntensity.value = 0;
    u0.uReveal.value = 0;
    this.mesh = new THREE.Mesh(geo('plane2', () => new THREE.PlaneGeometry(2, 2)), this.material);
    this.mesh.renderOrder = 9;
    this.object = new THREE.Group();
    this.object.add(this.mesh);
    if (position) this.object.position.copy(position);
    this.mesh.rotation.x = -Math.PI / 2;
    if (normal) this.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.mesh.position.y = groundOffset;
    this.radius = radius;
    this.scale = 0.01;
    this.spin = spin;
    this.intensity = 0;
    this.targetIntensity = 1;
    this.reveal = 0;
    this.time = 0;
    this.dead = false;
    this.fadeSpeed = 4;
  }

  kill(fadeSpeed = 4) {
    this.targetIntensity = 0;
    this.fadeSpeed = fadeSpeed;
    this.dead = true;
  }

  update(dt) {
    this.time += dt;
    this.reveal = Math.min(1, this.reveal + dt * 1.8);
    const k = 1 - Math.exp(-this.fadeSpeed * dt);
    this.intensity += (this.targetIntensity - this.intensity) * k;
    this.scale += (this.radius - this.scale) * (1 - Math.exp(-5 * dt));
    this.mesh.scale.setScalar(this.scale);
    this.mesh.rotation.z += this.spin * dt;
    const u = this.material.uniforms;
    u.uIntensity.value = this.intensity;
    u.uTime.value = this.time;
    u.uReveal.value = easeOutCubic(this.reveal);
    if (this.dead && this.intensity < 0.01) return false;
    return true;
  }

  dispose() {
    giveMat('MagicCircle', this.material);
  }
}

// -----------------------------------------------------------------------------
/** Noise-displaced fireball that expands, rises and cools into smoke. */
export class Fireball {
  constructor(position, size = 7) {
    this.material = takeMat('Fireball', () => new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeat: { value: 1 },
        uAlpha: { value: 1 },
      },
      vertexShader: NOISE + /* glsl */ `
        uniform float uTime, uHeat;
        varying float vNoise;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          float n = fbm3(normal * 1.6 + vec3(0.0, -uTime * 1.4, 0.0));
          vNoise = n;
          vec3 p = position + normal * n * (0.28 + (1.0 - uHeat) * 0.15);
          // Flatten the base on the ground (dome).
          p.y = max(p.y, -0.15);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = -mv.xyz;
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uHeat, uAlpha, uTime;
        varying float vNoise;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          float fres = clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0);
          float n01 = vNoise * 0.5 + 0.5;
          // Mostly orange/red with hot yellow-white veins; the core (facing us) is hotter.
          float h = clamp(uHeat * (0.3 + n01 * n01 * 1.0) + fres * fres * 0.3 * uHeat, 0.0, 1.4);
          vec3 smoke = vec3(0.08, 0.065, 0.06);
          vec3 red = vec3(0.9, 0.1, 0.02);
          vec3 orange = vec3(1.7, 0.45, 0.07);
          vec3 yellow = vec3(2.6, 1.3, 0.3);
          vec3 white = vec3(3.6, 2.7, 1.5);
          vec3 col = mix(smoke, red, smoothstep(0.05, 0.35, h));
          col = mix(col, orange, smoothstep(0.35, 0.65, h));
          col = mix(col, yellow, smoothstep(0.65, 0.95, h));
          col = mix(col, white, smoothstep(1.0, 1.35, h));
          float edge = smoothstep(0.0, 0.25, fres);
          float a = uAlpha * (0.8 + 0.2 * edge);
          // Dithered holes as it dissipates.
          float holes = smoothstep(0.0, 0.35, vNoise + uAlpha - 0.45);
          a *= holes;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    }));
    this.mesh = new THREE.Mesh(geo('ico5', () => new THREE.IcosahedronGeometry(1, 5)), this.material);
    this.mesh.renderOrder = 8;
    this.object = this.mesh;
    this.mesh.position.copy(position);
    this.mesh.scale.setScalar(0.01);
    this.base = position.clone();
    this.size = size;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const grow = easeOutExpo(clamp(t / 0.55, 0, 1));
    const s = this.size * (0.15 + 0.85 * grow) * (1 + t * 0.06);
    this.mesh.scale.set(s, s * (0.9 + t * 0.12), s);
    this.mesh.position.y = this.base.y + t * t * 0.35 + t * 0.6;
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uHeat.value = clamp(1.1 - t / 1.7, 0, 1.1);
    u.uAlpha.value = 1 - smoothstep(1.8, 3.4, t);
    return t < 3.5;
  }

  dispose() {
    giveMat('Fireball', this.material);
  }
}

// -----------------------------------------------------------------------------
/** Blinding core flash: a big soft additive billboard (reads as light, not as a solid bubble). */
let flashTex = null;
export class CoreFlash {
  constructor(position, size = 6) {
    flashTex = flashTex || makeSoftSprite(128);
    this.material = takeMat('CoreFlash', () => new THREE.SpriteMaterial({
      map: flashTex,
      color: new THREE.Color(4, 2.6, 1.3),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    this.mesh = new THREE.Sprite(this.material);
    this.mesh.position.copy(position);
    this.mesh.renderOrder = 20;
    this.object = this.mesh;
    this.size = size;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const k = this.t / 0.35;
    this.mesh.scale.setScalar(this.size * (1.2 + 2.2 * easeOutCubic(Math.min(k, 1))));
    this.material.opacity = Math.max(0, 1 - k) ** 2;
    return k < 1;
  }
  dispose() { giveMat('CoreFlash', this.material); }
}

// -----------------------------------------------------------------------------
/** Ground shockwave ring expanding outward. */
export class Shockwave {
  constructor(position, maxRadius = 32, duration = 1.15, color = [1.6, 0.6, 0.18]) {
    this.material = takeMat('Shockwave', () => new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new THREE.Color(...color) },
        uWidth: { value: 0.12 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProgress, uWidth;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float front = uProgress;
          float band = smoothstep(front - uWidth, front, r) * (1.0 - smoothstep(front, front + 0.015, r));
          float trail = smoothstep(front - uWidth * 3.0, front, r) * (1.0 - step(front, r)) * 0.25;
          float fade = 1.0 - smoothstep(0.55, 1.0, uProgress);
          vec3 col = uColor * (band + trail) * fade;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    }));
    this.material.uniforms.uColor.value.setRGB(...color); // pooled material
    this.material.uniforms.uProgress.value = 0;
    this.mesh = new THREE.Mesh(geo('planeFlat', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), this.material);
    this.mesh.position.copy(position);
    this.mesh.position.y += 0.25;
    this.mesh.scale.setScalar(maxRadius);
    this.mesh.renderOrder = 9;
    this.object = this.mesh;
    this.duration = duration;
    this.maxRadius = maxRadius;
    this.t = 0;
  }
  get radius() {
    return easeOutCubic(clamp(this.t / this.duration, 0, 1)) * this.maxRadius;
  }
  update(dt) {
    this.t += dt;
    const p = clamp(this.t / this.duration, 0, 1);
    this.material.uniforms.uProgress.value = easeOutCubic(p);
    return p < 1;
  }
  dispose() { giveMat('Shockwave', this.material); }
}

// -----------------------------------------------------------------------------
/** Vertical dust wall (open cylinder) riding the shockwave. */
export class DustWall {
  constructor(position, maxRadius = 26, duration = 1.6) {
    this.material = takeMat('DustWall', () => new THREE.ShaderMaterial({
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: NOISE + /* glsl */ `
        uniform float uProgress, uTime;
        varying vec2 vUv;
        void main() {
          float n = snoise(vec3(vUv.x * 24.0, vUv.y * 3.0 - uTime * 2.0, uTime * 0.5)) * 0.5 + 0.5;
          float v = (1.0 - vUv.y);
          float a = v * v * n * (1.0 - smoothstep(0.35, 1.0, uProgress)) * 0.65;
          vec3 col = mix(vec3(0.55, 0.47, 0.38), vec3(1.6, 0.7, 0.3), (1.0 - uProgress) * v * 0.6);
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    this.mesh = new THREE.Mesh(geo('cyl48', () => new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0)), this.material);
    this.mesh.position.copy(position);
    this.object = this.mesh;
    this.duration = duration;
    this.maxRadius = maxRadius;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const p = clamp(this.t / this.duration, 0, 1);
    const r = easeOutCubic(p) * this.maxRadius + 0.5;
    this.mesh.scale.set(r, 2.8 * (1 - p * 0.6), r);
    this.material.uniforms.uProgress.value = p;
    this.material.uniforms.uTime.value = this.t;
    return p < 1;
  }
  dispose() { giveMat('DustWall', this.material); }
}

// -----------------------------------------------------------------------------
/** Pillar of light from the sky striking the target. */
export class LightBeam {
  constructor(position, height = 60, radius = 2.4, duration = 0.55) {
    this.material = takeMat('LightBeam', () => new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAlpha, uTime;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          float core = pow(abs(dot(vN, vV)), 2.5);
          float streak = 0.8 + 0.2 * sin(vUv.y * 80.0 - uTime * 60.0);
          vec3 col = mix(vec3(5.0, 1.3, 0.4), vec3(9.0, 7.0, 5.0), core) * core * streak * uAlpha;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    }));
    this.mesh = new THREE.Mesh(geo('cyl24', () => new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0)), this.material);
    this.mesh.position.copy(position);
    this.object = this.mesh;
    this.height = height;
    this.radius = radius;
    this.duration = duration;
    this.t = 0;
    this.baseY = position.y;
    this.mesh.scale.set(0.01, height, 0.01);
  }
  update(dt) {
    this.t += dt;
    const p = clamp(this.t / this.duration, 0, 1);
    // Strike: drop down from the sky quickly, swell, then thin out.
    const drop = easeOutCubic(clamp(this.t / 0.12, 0, 1));
    const w = this.radius * (p < 0.3 ? 0.3 + p / 0.3 * 0.7 : 1 - (p - 0.3) / 0.7);
    this.mesh.scale.set(Math.max(w, 0.01), this.height * drop, Math.max(w, 0.01));
    this.mesh.position.y = this.baseY + this.height * (1 - drop);
    this.material.uniforms.uAlpha.value = 1 - smoothstep(0.6, 1.0, p);
    this.material.uniforms.uTime.value = this.t;
    return p < 1;
  }
  dispose() { giveMat('LightBeam', this.material); }
}

// -----------------------------------------------------------------------------
/** Scorch decal conforming to the ground (grid draped via raycasts), fades out slowly. */
let scorchTex = null;
export class Scorch {
  constructor(world, center, radius = 9) {
    scorchTex = scorchTex || makeScorchTexture(256);
    const seg = 20;
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2, seg, seg).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = center.x + p.getX(i), z = center.z + p.getZ(i);
      p.setY(i, world.groundAt(x, z, center.y + 8) + 0.04 - center.y);
    }
    g.computeVertexNormals();
    this.material = takeMat('Scorch', () => new THREE.MeshStandardMaterial({
      map: scorchTex,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      color: 0xffffff,
      emissive: new THREE.Color(1, 0.3, 0.05),
      emissiveMap: scorchTex,
      emissiveIntensity: 3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.position.set(center.x, center.y, center.z);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    this.object = this.mesh;
    this.t = 0;
    this.life = 28;
  }
  update(dt) {
    this.t += dt;
    // Glowing embers cool down, then the mark fades.
    this.material.emissiveIntensity = 3 * Math.exp(-this.t * 0.7);
    this.material.opacity = 1 - smoothstep(this.life - 6, this.life, this.t);
    return this.t < this.life;
  }
  dispose() {
    this.mesh.geometry.dispose(); // draped per cast, not shared
    giveMat('Scorch', this.material);
  }
}

// -----------------------------------------------------------------------------
/** Instanced rock debris thrown by the blast. */
export class Debris {
  constructor(world, center, count = 36) {
    this.world = world;
    const rockGeo = geo('debris', () => new THREE.DodecahedronGeometry(0.22, 0));
    this.material = takeMat('Debris', () => new THREE.MeshStandardMaterial({ color: 0x5a4e44, roughness: 0.95, flatShading: true, emissive: new THREE.Color(1.6, 0.4, 0.05) }));
    this.mesh = new THREE.InstancedMesh(rockGeo, this.material, count);
    this.mesh.castShadow = false; // tiny & short-lived: not worth an extra shadow-pass variant
    this.mesh.frustumCulled = false;
    this.object = this.mesh;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 16;
      this.items.push({
        p: new THREE.Vector3(center.x + Math.cos(a) * 1.5, center.y + 0.5 + Math.random(), center.z + Math.sin(a) * 1.5),
        v: new THREE.Vector3(Math.cos(a) * sp, 8 + Math.random() * 16, Math.sin(a) * sp),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        s: 0.35 + Math.random() * 0.8,
        rest: false,
      });
    }
    this.t = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }
  update(dt) {
    this.t += dt;
    const fade = 1 - smoothstep(6, 8, this.t);
    this.material.emissiveIntensity = Math.exp(-this.t * 0.8);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.rest) {
        it.v.y -= 24 * dt;
        it.p.addScaledVector(it.v, dt);
        it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
        const gy = this.world.heightAt(it.p.x, it.p.z) + 0.1 * it.s;
        if (it.p.y < gy) {
          it.p.y = gy;
          if (it.v.y < -4) {
            it.v.y *= -0.35; it.v.x *= 0.6; it.v.z *= 0.6; it.w.multiplyScalar(0.6);
          } else {
            it.rest = true;
          }
        }
      }
      this._q.setFromEuler(it.r);
      this._s.setScalar(it.s * fade + 0.0001);
      this._m.compose(it.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return this.t < 8;
  }
  dispose() { giveMat('Debris', this.material); }
}
