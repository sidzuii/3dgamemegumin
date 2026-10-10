import * as THREE from 'three';
import { makeMagicCircleTexture } from './textures.js';

/** Small shared GLSL value-noise helpers. */
const NOISE = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += n2(p)*a; p = p*2.03+1.7; a *= 0.5; } return s; }
`;

/** Lava pools: scrolling crust with glowing cracks (HDR -> bloom). */
export function createLava(lava) {
  const geos = lava.pools.map(([x, z, r]) => new THREE.CircleGeometry(r * 1.12, 40).rotateX(-Math.PI / 2).translate(x, 0, z));
  const merged = mergeCircles(geos);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: NOISE + /* glsl */ `
      uniform float uTime; varying vec3 vWorld;
      void main(){
        vec2 p = vWorld.xz * 0.45;
        float t = uTime * 0.12;
        float n = fbm2(p + vec2(t, -t * 0.6));
        float m = fbm2(p * 2.3 - vec2(t * 1.7, t));
        float cracks = 1.0 - smoothstep(0.02, 0.14, abs(n - 0.5));
        float heat = clamp(cracks * 0.8 + m * 0.55, 0.0, 1.0);
        vec3 crust = vec3(0.08, 0.03, 0.02);
        vec3 hot = mix(vec3(2.2, 0.35, 0.04), vec3(5.0, 2.2, 0.4), smoothstep(0.55, 1.0, heat));
        vec3 col = mix(crust, hot, smoothstep(0.25, 0.75, heat));
        col *= 0.85 + 0.15 * sin(uTime * 2.0 + n * 12.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.position.y = lava.level;
  mesh.name = 'Lava';
  let acc = 0;
  return {
    mesh,
    update(dt, ctx) {
      material.uniforms.uTime.value += dt;
      if (!ctx?.vfx) return;
      // Bubbles / embers only near the player.
      acc += dt * 18;
      while (acc > 1) {
        acc -= 1;
        const [x, z, r] = lava.pools[(Math.random() * lava.pools.length) | 0];
        if (Math.hypot(ctx.playerPos.x - x, ctx.playerPos.z - z) > 55) continue;
        ctx.vfx.emit('lavaBubble', _p.set(x, lava.level, z), { radius: r * 0.9 });
      }
    },
  };
}
const _p = new THREE.Vector3();

function mergeCircles(geos) {
  let total = 0;
  for (const g of geos) total += g.index.count;
  const vcount = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(vcount * 3);
  const idx = new Uint32Array(total);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** Slowly turning red rune circle on the Archdemon's arena. */
export function createRitualCircle(pos, radius) {
  const tex = makeMagicCircleTexture(512, 77, 1);
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(2.4, 0.3, 0.15),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), material);
  mesh.position.copy(pos);
  mesh.renderOrder = 6;
  let t = 0;
  return {
    mesh,
    update(dt) {
      t += dt;
      mesh.rotation.y += dt * 0.15;
      material.opacity = 0.6 + Math.sin(t * 1.7) * 0.25;
    },
  };
}
