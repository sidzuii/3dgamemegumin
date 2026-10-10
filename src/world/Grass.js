import * as THREE from 'three';
import { mulberry32, fbm } from '../core/math.js';

/**
 * Instanced grass blades with shader wind, player push and explosion blast bend.
 * One draw call; blades under structures are skipped via the static collider.
 */
export function createGrass(world, patches, opts = {}) {
  const count = patches.reduce((a, p) => a + p.count, 0);
  const bladeH = opts.height ?? 0.42;
  const geo = new THREE.PlaneGeometry(opts.width ?? 0.07, bladeH, 1, 3);
  geo.translate(0, bladeH / 2, 0);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const base = new THREE.Color(opts.base ?? 0x3e6526);
  const tip = new THREE.Color(opts.tip ?? 0xa9c95f);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / bladeH;
    p.setX(i, p.getX(i) * (1 - t * 0.92));
    p.setZ(i, t * t * 0.06); // slight natural curve
    c.copy(base).lerp(tip, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Up-facing normals => soft, uniform lighting like a grass field.
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);

  const uniforms = {
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3(0, -100, 0) },
    uBlast: { value: new THREE.Vector4(0, 0, 0, 1) }, // x, z, strength, radius
  };
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // Both blade faces lit as if facing up (DoubleSide would flip the back-face normal).
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
    );
    shader.vertexShader =
      'uniform float uTime;\nuniform vec3 uPlayer;\nuniform vec4 uBlast;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        float hgt = clamp(position.y / ${bladeH.toFixed(3)}, 0.0, 1.0);
        float h2 = hgt * hgt;
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        // Wind: two travelling waves.
        float w1 = sin(uTime * 1.6 + root.x * 0.35 + root.z * 0.22);
        float w2 = sin(uTime * 2.7 + root.x * 0.9 - root.z * 0.6) * 0.4;
        vec2 bend = vec2(0.09, 0.05) * (w1 + w2 + 0.6);
        // Push away from the player.
        vec2 tp = root.xz - uPlayer.xz;
        float dp = length(tp);
        float pp = (1.0 - smoothstep(0.15, 0.9, dp)) * step(abs(root.y - uPlayer.y), 1.0);
        bend += normalize(tp + 1e-4) * pp * 0.35;
        // Explosion blast: flatten outward.
        vec2 tb = root.xz - uBlast.xy;
        float db = length(tb);
        float bp = uBlast.z * (1.0 - smoothstep(uBlast.w * 0.4, uBlast.w, db));
        bend += normalize(tb + 1e-4) * bp * 0.45;
        mvPosition.xz += bend * h2;
        mvPosition.y -= (length(bend) * 0.45) * h2;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `,
      );
  };
  mat.customProgramCacheKey = () => 'grass' + bladeH;

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'Grass';

  const rng = mulberry32(99);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (const patch of patches) {
    let placed = 0;
    for (let i = 0; i < patch.count * 3 && placed < patch.count; i++) {
      let x, z;
      if (patch.rect) {
        // Crop fields: uniform rows inside a rectangle.
        const R = patch.rect;
        x = R.x + (rng() - 0.5) * R.w;
        z = R.z + (rng() - 0.5) * R.d;
      } else {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * patch.r;
        x = patch.x + Math.cos(a) * r;
        z = patch.z + Math.sin(a) * r;
      }
      // Clumpy distribution.
      const density = patch.crop ? 1 : fbm(x * 0.12, z * 0.12, 2) * 0.5 + 0.5;
      if (k >= count) break;
      if (rng() > density * 1.25) continue;
      if (patch.skip && patch.skip(x, z)) continue;
      const ty = world.heightAt(x, z);
      const gy = world.groundAt(x, z, ty + 6);
      if (gy > ty + 0.05) continue; // structure on top
      pos.set(x, ty - 0.02, z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      const sc = (0.6 + rng() * 0.8 * (0.6 + density * 0.6)) * (patch.scale || 1);
      s.set(1, sc, 1);
      m.compose(pos, q, s);
      mesh.setMatrixAt(k, m);
      col.setHSL((patch.hue ?? 0.22) + rng() * 0.06, (patch.sat ?? 0.45) + rng() * 0.2, (patch.light ?? 0.42) + rng() * 0.18);
      mesh.setColorAt(k, col);
      k++;
      placed++;
    }
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh,
    uniforms,
    blast: null,
    /** Trigger an outward flattening wave from (x,z). */
    triggerBlast(x, z) {
      this.blast = { x, z, t: 0 };
    },
    update(dt, ctx) {
      uniforms.uTime.value += dt;
      if (ctx?.playerPos) uniforms.uPlayer.value.copy(ctx.playerPos);
      if (this.blast) {
        const b = this.blast;
        b.t += dt;
        const radius = Math.min(30, 4 + b.t * 34);
        const strength = Math.max(0, 1 - Math.max(0, b.t - 0.4) / 3.5);
        uniforms.uBlast.value.set(b.x, b.z, strength, radius);
        if (strength <= 0) this.blast = null;
      }
    },
  };
}
