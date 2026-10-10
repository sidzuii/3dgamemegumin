import * as THREE from 'three';
import { SUN_DIR } from './World.js';

/**
 * Water surfaces: a ribbon along the river polyline and discs for lakes, sharing one shader
 * (animated normals, fresnel to the sky colour, sun glint, shallow-to-deep colour by the
 * `aShore` attribute: 0 = middle of the water, 1 = shoreline).
 */
const NOISE = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += n2(p)*a; p = p*2.03+1.7; a *= 0.5; } return s; }
`;

/** River ribbon: sampled every ~3 m, 5 columns across (shore fade at the edges). */
export function riverGeometry(river) {
  const pts = [];
  const P = river.points;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 3));
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  pts.push(P[P.length - 1]);
  const half = river.width / 2 + 3.5;
  const cols = [-1, -0.55, 0, 0.55, 1];
  const pos = [], shore = [], along = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const c of cols) {
      pos.push(pts[i][0] - tz * c * half, 0, pts[i][1] + tx * c * half);
      shore.push(Math.abs(c));
      along.push(dist);
    }
  }
  const idx = [];
  const C = cols.length;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let c = 0; c < C - 1; c++) {
      const a = i * C + c, b = a + 1, d = a + C, e = d + 1;
      idx.push(a, b, d, b, e, d); // counter-clockwise seen from above (faces up)
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function lakeGeometry(lake) {
  const R = lake.radius * 1.18;
  const g = new THREE.CircleGeometry(R, 72).rotateX(-Math.PI / 2).translate(lake.center.x, 0, lake.center.z);
  const p = g.attributes.position;
  const shore = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) shore[i] = Math.hypot(p.getX(i) - lake.center.x, p.getZ(i) - lake.center.z) / R;
  g.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  return g;
}

/** Shared water material + mesh at `level`. opts.flow: downstream flow speed (rivers). */
export function createWaterSurface(geometry, level, opts = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR.clone() },
      uDeep: { value: new THREE.Color(0.03, 0.16, 0.24) },
      uShallow: { value: new THREE.Color(0.12, 0.42, 0.48) },
      uSky: { value: new THREE.Color(0.62, 0.78, 0.92) },
      uFlow: { value: opts.flow || 0 },
      uNight: { value: 0 },
    }]),
    vertexShader: /* glsl */ `
      attribute float aShore; attribute float aAlong;
      varying vec3 vWorld; varying float vShore; varying float vAlong;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vShore = aShore; vAlong = aAlong;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: '#include <fog_pars_fragment>\n' + NOISE + /* glsl */ `
      uniform float uTime, uFlow, uNight; uniform vec3 uSun, uDeep, uShallow, uSky;
      varying vec3 vWorld; varying float vShore; varying float vAlong;
      void main(){
        vec2 p = vWorld.xz;
        float t = uTime * 0.35;
        vec2 flow = vec2(0.0, -uTime * uFlow);
        float e = 0.15;
        vec2 q = p + flow;
        float hC = fbm2(q * 0.55 + vec2(t, t * 0.7)) + fbm2(q * 1.3 - vec2(t * 1.3, -t));
        float hX = fbm2((q + vec2(e, 0.0)) * 0.55 + vec2(t, t * 0.7)) + fbm2((q + vec2(e, 0.0)) * 1.3 - vec2(t * 1.3, -t));
        float hZ = fbm2((q + vec2(0.0, e)) * 0.55 + vec2(t, t * 0.7)) + fbm2((q + vec2(0.0, e)) * 1.3 - vec2(t * 1.3, -t));
        vec3 n = normalize(vec3(-(hX - hC) / e * 0.35, 1.0, -(hZ - hC) / e * 0.35));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 col = mix(uDeep, uShallow, smoothstep(0.2, 0.95, vShore));
        vec3 sky = uSky * (1.0 - uNight * 0.85);
        col = mix(col, sky, clamp(fres * 0.85 + 0.08, 0.0, 1.0));
        col *= 1.0 - uNight * 0.6;
        vec3 hv = normalize(uSun + v);
        float spec = pow(max(dot(n, hv), 0.0), 220.0) * 6.0 * max(uSun.y, 0.0);
        col += vec3(1.0, 0.95, 0.85) * spec;
        // Foam streaks along fast water near the banks.
        float foam = smoothstep(0.75, 0.95, vShore) * smoothstep(0.55, 0.8, fbm2(vec2(vAlong * 0.25 - uTime * uFlow * 0.4, vShore * 6.0)));
        col = mix(col, vec3(0.85, 0.9, 0.92) * (1.0 - uNight * 0.6), foam * 0.35 * step(0.01, uFlow));
        float alpha = mix(0.9, 0.55, smoothstep(0.75, 1.0, vShore)) * (1.0 - smoothstep(0.93, 1.0, vShore));
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = level;
  mesh.renderOrder = 5;
  mesh.name = 'Water';
  return {
    mesh,
    material,
    update(dt, ctx) {
      material.uniforms.uTime.value += dt;
      material.uniforms.uSun.value.copy(SUN_DIR);
      if (ctx?.night !== undefined) material.uniforms.uNight.value = ctx.night;
    },
  };
}
