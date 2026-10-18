import * as THREE from 'three';
import { drapeTri } from './Kit.js';

/**
 * One paved surface for all the streets of a town (Axel): the streets, the ring road, the gate passages and the footpaths to the
 * doors are drawn into one coverage mask, and a single mesh draped on the ground shows the cobbles where the mask is set. A
 * junction is therefore never two ribbons laid over each other (no steps of a few millimetres, no pattern restarting, no kerbs
 * crossing a street): the stones run on in world coordinates through every crossing, and the edge of the whole network is
 * weathered (darker) evenly. The squares keep their own flagstones on top.
 *
 *   lines: [{ pts: [[x, z]…], width, closed }]   polys: [[[x, z]…]] (covered too: the paving runs on under them)
 *   opts: { lift, tint, metresPerPixel, edge (m of the weathered border) }
 *
 * The mesh has the collision of the paved cells (the feet stand on the stones, not 9 cm under them).
 */
export function roadSurface(W, lines, polys = [], opts = {}) {
  const lift = opts.lift ?? 0.09, mpp = opts.metresPerPixel ?? 0.12, edge = opts.edge ?? 0.7;
  // bounds
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const inc = (x, z, r = 0) => { x0 = Math.min(x0, x - r); z0 = Math.min(z0, z - r); x1 = Math.max(x1, x + r); z1 = Math.max(z1, z + r); };
  for (const L of lines) for (const [x, z] of L.pts) inc(x, z, L.width / 2);
  for (const P of polys) for (const [x, z] of P) inc(x, z);
  if (!isFinite(x0)) return null;
  // the cells follow the terrain grid (one quad of the ground = one quad of paving: draped exactly)
  const sh = W.heightfield?.sheetAt((x0 + x1) / 2, (z0 + z1) / 2);
  const gs = sh?.step ?? 2.5, gx = sh?.x0 ?? 0, gz = sh?.z0 ?? 0;
  x0 = gx + Math.floor((x0 - 2 - gx) / gs) * gs; z0 = gz + Math.floor((z0 - 2 - gz) / gs) * gs;
  x1 = gx + Math.ceil((x1 + 2 - gx) / gs) * gs; z1 = gz + Math.ceil((z1 + 2 - gz) / gs) * gs;
  const w = x1 - x0, d = z1 - z0;
  const SX = Math.min(4096, Math.ceil(w / mpp)), SZ = Math.min(4096, Math.ceil(d / mpp));

  // ---- the coverage mask (G), the weathered border (R)
  const mk = () => { const c = document.createElement('canvas'); c.width = SX; c.height = SZ; return c; };
  const cov = mk(), cg = cov.getContext('2d', { willReadFrequently: true });
  cg.fillStyle = '#000'; cg.fillRect(0, 0, SX, SZ);
  cg.save();
  cg.scale(SX / w, SZ / d);
  cg.translate(-x0, -z0);
  cg.strokeStyle = cg.fillStyle = '#fff';
  cg.lineCap = cg.lineJoin = 'round';
  for (const L of lines) {
    cg.lineWidth = L.width;
    cg.beginPath();
    L.pts.forEach(([x, z], i) => (i ? cg.lineTo(x, z) : cg.moveTo(x, z)));
    if (L.closed) cg.closePath();
    cg.stroke();
  }
  for (const P of polys) {
    cg.beginPath();
    P.forEach(([x, z], i) => (i ? cg.lineTo(x, z) : cg.moveTo(x, z)));
    cg.closePath();
    cg.fill();
  }
  cg.restore();
  const blur = mk(), bg = blur.getContext('2d', { willReadFrequently: true });
  bg.filter = `blur(${Math.max(1, Math.round(edge / mpp))}px)`;
  bg.drawImage(cov, 0, 0);
  const C = cg.getImageData(0, 0, SX, SZ), B = bg.getImageData(0, 0, SX, SZ).data, px = C.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = px[i + 1];
    const b = B[i + 1] / 255; // 1 deep inside, ~0.5 at the edge
    px[i] = Math.round(255 * (0.66 + 0.34 * Math.min(1, Math.max(0, (b - 0.45) / 0.45))));
    px[i + 1] = g;
    px[i + 2] = 0;
    px[i + 3] = 255;
  }
  cg.putImageData(C, 0, 0);
  const tex = new THREE.CanvasTexture(cov);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.channel = 1; // the second uv set: the mask spans the whole surface

  // ---- the cells that hold some paving (with their neighbours: the round caps reach a little over)
  const nx = Math.round(w / gs), nz = Math.round(d / gs);
  const has = new Uint8Array(nx * nz);
  const tpx = SX / nx, tpz = SZ / nz;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let hit = 0;
    const a0 = Math.floor(i * tpx), a1 = Math.min(SX, Math.ceil((i + 1) * tpx)), b0 = Math.floor(j * tpz), b1 = Math.min(SZ, Math.ceil((j + 1) * tpz));
    for (let b = b0; b < b1 && !hit; b += 2) for (let a = a0; a < a1; a += 2) if (px[(b * SX + a) * 4 + 1] > 8) { hit = 1; break; }
    has[j * nx + i] = hit;
  }
  const pos = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!has[j * nx + i]) continue;
    const ax = x0 + i * gs, az = z0 + j * gs, bx = ax + gs, bz = az + gs;
    drapeTri(W, [[ax, az], [bx, az], [ax, bz]], lift, pos);
    drapeTri(W, [[bx, az], [bx, bz], [ax, bz]], lift, pos);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const n = pos.length / 3, uv = new Float32Array(n * 2), uv1 = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    const x = pos[k * 3], z = pos[k * 3 + 2];
    uv[k * 2] = x * 0.5; uv[k * 2 + 1] = z * 0.5; // the cobbles' scale of World (planar UVs × 0.5)
    uv1[k * 2] = (x - x0) / w; uv1[k * 2 + 1] = 1 - (z - z0) / d; // canvas row 0 = z0 (the texture is flipped)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  g.computeBoundingSphere();

  const base = W.mats.cobble;
  const m = new THREE.MeshStandardMaterial({
    color: opts.tint ?? 0xe8dfcc, roughness: 0.88, map: base.map, bumpMap: base.bumpMap, bumpScale: base.bumpScale,
    alphaMap: tex, alphaTest: 0.5,
  });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <alphamap_fragment>', `
      #ifdef USE_ALPHAMAP
        vec4 roadMask = texture2D( alphaMap, vAlphaMapUv );
        diffuseColor.a *= roadMask.g;
        diffuseColor.rgb *= roadMask.r;
      #endif
    `);
  };
  m.customProgramCacheKey = () => 'road-surface-union-v1';
  const mesh = new THREE.Mesh(g, m);
  mesh.name = opts.name || 'Мостовая (единое покрытие)';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  W.addObject(mesh);
  mesh.updateMatrix();
  // collision: only the triangles that are paved (the cells at the edge reach out over the grass where the mask cuts them)
  const cp = [];
  for (let k = 0; k < pos.length; k += 9) {
    const x = (pos[k] + pos[k + 3] + pos[k + 6]) / 3, z = (pos[k + 2] + pos[k + 5] + pos[k + 8]) / 3;
    const a = Math.min(SX - 1, Math.max(0, Math.floor(((x - x0) / w) * SX))), b = Math.min(SZ - 1, Math.max(0, Math.floor(((z - z0) / d) * SZ)));
    if (px[(b * SX + a) * 4 + 1] > 127) for (let q = 0; q < 9; q++) cp.push(pos[k + q]);
  }
  if (cp.length) {
    const cgm = new THREE.BufferGeometry();
    cgm.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    W.addCollisionOnly(cgm, new THREE.Matrix4());
  }
  return mesh;
}
