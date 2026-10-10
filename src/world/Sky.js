import * as THREE from 'three';

/** Procedural gradient sky with sun disk/halo and soft fbm clouds (no textures). */
export function createSky(sunDir, { forEnv = false } = {}) {
  const top = new THREE.Color(0x3d7fd6);
  const horizon = new THREE.Color(0xcfe4f4);
  const bottom = new THREE.Color(0x8fa08a);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: top },
      uHorizon: { value: horizon },
      uBottom: { value: bottom },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.8) },
      uTime: { value: 0 },
      uClouds: { value: forEnv ? 0.6 : 1 },
      uDim: { value: 0 },
      uNight: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(-0.4, 0.6, -0.5).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir;
      uniform float uTime, uClouds, uDim, uNight;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 7.1; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
        float s = max(dot(d, uSunDir), 0.0);
        // Clouds on a virtual plane.
        if (h > 0.0 && uClouds > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
          float c = smoothstep(0.52, 0.8, fbm(uv));
          float lit = 0.75 + 0.25 * pow(s, 4.0);
          vec3 cloudCol = mix(vec3(1.0, 0.99, 0.97) * lit, vec3(0.1, 0.12, 0.18), uNight);
          col = mix(col, cloudCol, c * 0.75 * smoothstep(0.0, 0.18, h) * uClouds);
        }
        col += uSunColor * (pow(s, 900.0) * 30.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12) * (1.0 - uNight);
        // Night: stars and the moon.
        if (uNight > 0.01 && h > 0.0) {
          vec3 sd = d * 180.0;
          vec3 cell = floor(sd);
          float st = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          float star = step(0.9965, st) * (1.0 - smoothstep(0.15, 0.5, length(fract(sd) - 0.5)));
          float tw = 0.6 + 0.4 * sin(uTime * 3.0 + st * 100.0);
          col += vec3(0.9, 0.95, 1.0) * star * tw * uNight * smoothstep(0.0, 0.25, h) * 1.6;
          float m = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 2.5 + pow(m, 60.0) * 0.15) * uNight;
        }
        col = mix(col, col * vec3(0.55, 0.38, 0.36), uDim);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'Sky';
  return { mesh, material, horizonColor: horizon };
}
