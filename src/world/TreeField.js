import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Instanced vegetation with distance LOD (Quaternius Stylized Nature trees and bushes, a few
 * thousand triangles each — far too many to merge into the static batches).
 *
 * Every tree model gets three InstancedMeshes: the full model near the camera, its '__lod' copy
 * (half the leaf cards, simplified trunk) at mid range, and beyond that a solid low-poly
 * silhouette (no alpha-tested cards: layered cut-out foliage is what costs a GPU the most).
 * Shadows come from a cheap proxy on a shadow-only layer. A few times a second each instance
 * is assigned by distance and a frustum test with a margin, so only what can be seen is drawn.
 * Trunk colliders are added separately by the builders.
 */
const NEAR = 42; // full model within this distance
const MID = 70; // card LOD within this distance, solid silhouettes beyond
const FAR = 330; // nothing beyond (the fog has swallowed it)
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _sph = new THREE.Sphere();
const _fr = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const SHADOW_R = 55; // trees casting (proxy) shadows around the camera
const SHADOW_ONLY = 2; // layer seen by the sun's shadow camera only
const PROXY_MAT = new THREE.MeshBasicMaterial();
const BLOB_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Shadow stand-in for a tree model (model units): trunk + ellipsoid canopy, or a cone for pines. */
function proxyGeometry(b, pine) {
  const h = b.max.y - b.min.y;
  const wdt = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const trunk = new THREE.CylinderGeometry(h * 0.03, h * 0.04, h * 0.55, 6).translate(cx, b.min.y + h * 0.275, cz);
  const crown = pine
    ? new THREE.ConeGeometry(wdt * 0.42, h * 0.8, 8).translate(cx, b.min.y + h * 0.58, cz)
    : new THREE.IcosahedronGeometry(1, 1).scale(wdt * 0.4, h * 0.3, wdt * 0.4).translate(cx, b.min.y + h * 0.64, cz);
  return mergeGeometries([trunk.toNonIndexed(), crown.toNonIndexed()]);
}

/** Distant silhouette (model units): trunk + lumpy crown (broadleaf) or stacked cones (pine), vertex-coloured. */
function blobGeometry(b, pine) {
  const h = b.max.y - b.min.y;
  const wdt = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, y0 = b.min.y;
  const paint = (g, hex) => {
    g = g.toNonIndexed();
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const parts = [paint(new THREE.CylinderGeometry(h * 0.025, h * 0.04, h * 0.6, 5).translate(cx, y0 + h * 0.3, cz), 0x5a3e2a)];
  if (pine) {
    for (const [r, hh, yy] of [[0.46, 0.42, 0.4], [0.36, 0.36, 0.6], [0.24, 0.3, 0.8]]) {
      parts.push(paint(new THREE.ConeGeometry(wdt * r, h * hh, 7).translate(cx, y0 + h * yy, cz), 0x3c6634));
    }
  } else {
    for (const [ox, oy, oz, sx, sy] of [[0, 0.66, 0, 0.42, 0.28], [0.18, 0.56, 0.1, 0.26, 0.2], [-0.16, 0.58, -0.12, 0.27, 0.2]]) {
      parts.push(paint(new THREE.IcosahedronGeometry(1, 0).scale(wdt * sx, h * sy, wdt * sx).translate(cx + wdt * ox, y0 + h * oy, cz + wdt * oz), 0x5a8c3a));
    }
  }
  return mergeGeometries(parts);
}

export class TreeField {
  constructor(world) {
    this.world = world;
    this.items = []; // { model, x, y, z, rot, s, tint, r }
    this.kinds = new Map(); // model -> { near, far, cap, nearMax }
    this.timer = 0;
    this.built = false;
  }

  /** Register an instance of a kit model ('wilds/CommonTree_1'); nearOnly = no far copy (bushes). */
  add(model, x, y, z, rot, s, { tint = 1, radius = 5, nearOnly = false, near = NEAR } = {}) {
    const it = { model, x, y, z, rot, s, tint, r: radius * s, nearOnly, near };
    this.items.push(it);
    return it;
  }

  /** Map editor: move / turn / scale one instance live (it.hidden = deleted). */
  setItem(it, { x = it.x, y = it.y, z = it.z, rot = it.rot, s = it.s } = {}) {
    const k = it.s ? s / it.s : 1;
    Object.assign(it, { x, y, z, rot, s, r: it.r * k });
    it.matrix = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, rot), _s.setScalar(s));
    this.timer = 0;
  }

  _geometry(name) {
    const parts = this.world.kits.get(name);
    if (!parts.length) return null;
    const geos = [], mats = [];
    for (const { geometry, mat } of parts) {
      geos.push(geometry);
      mats.push(this.world.mats[mat]);
    }
    const g = mergeGeometries(geos, true);
    g.computeBoundingSphere();
    return { g, mats };
  }

  build(scene) {
    const counts = new Map();
    for (const it of this.items) counts.set(it.model, (counts.get(it.model) || 0) + 1);
    for (const [model, n] of counts) {
      const k = { near: null, far: null };
      const hi = this._geometry(model);
      if (!hi) continue;
      k.near = new THREE.InstancedMesh(hi.g, hi.mats, n);
      // Shadows come from a cheap proxy (trunk + canopy blob), not from the layered leaf cards.
      k.near.castShadow = false;
      k.near.receiveShadow = true;
      if (!this.items.find((it) => it.model === model)?.nearOnly) {
        k.proxy = new THREE.InstancedMesh(proxyGeometry(this.world.kits.box(model), /Pine/.test(model)), PROXY_MAT, n);
        k.proxy.castShadow = true;
        k.proxy.layers.set(SHADOW_ONLY);
      }
      const lodName = model + '__lod';
      const lo = this.world.kits.has(lodName) ? this._geometry(lodName) : null;
      if (lo) {
        k.far = new THREE.InstancedMesh(lo.g, lo.mats, n);
        k.far.castShadow = false;
        k.far.receiveShadow = true;
        k.blob = new THREE.InstancedMesh(blobGeometry(this.world.kits.box(model), /Pine/.test(model)), BLOB_MAT, n);
        k.blob.receiveShadow = true;
      }
      for (const m of [k.near, k.far, k.proxy, k.blob]) {
        if (!m) continue;
        m.count = 0;
        m.frustumCulled = false; // culled per instance in update()
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (m !== k.proxy) m.setColorAt(0, _c.setScalar(1));
        m.name = 'trees:' + model;
        scene.add(m);
      }
      this.kinds.set(model, k);
    }
    // The sun's shadow camera also renders the shadow-only layer.
    this.world.sun.shadow.camera.layers.enable(SHADOW_ONLY);
    // Precompute instance matrices.
    for (const it of this.items) {
      _q.setFromAxisAngle(UP, it.rot);
      it.matrix = new THREE.Matrix4().compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.s));
    }
    this.built = true;
  }

  /** Reassign instances to near / far meshes (throttled). */
  update(dt, camera, force = false) {
    if (!this.built) return;
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 0.2;
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    const cp = camera.position;
    for (const k of this.kinds.values()) {
      k.near.count = 0;
      if (k.far) k.far.count = 0;
      if (k.proxy) k.proxy.count = 0;
      if (k.blob) k.blob.count = 0;
    }
    const mid = this.mid ?? MID;
    const far = this.far ?? FAR;
    for (const it of this.items) {
      if (it.hidden || it.layerHidden) continue;
      const dx = it.x - cp.x, dz = it.z - cp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > far * far) continue;
      // Shadow proxies around the camera (the shadow map only covers the nearby ground).
      if (d2 < SHADOW_R * SHADOW_R) {
        const p = this.kinds.get(it.model)?.proxy;
        if (p) p.setMatrixAt(p.count++, it.matrix);
      }
      const nr = Math.min(it.near, this.near ?? NEAR);
      const near = d2 < nr * nr;
      if (it.nearOnly && !near) continue;
      // Frustum test with a margin (the update is throttled; the camera keeps turning).
      _sph.center.set(it.x, it.y + it.r * 0.8, it.z);
      _sph.radius = it.r + 3 + Math.sqrt(d2) * 0.06;
      if (!_fr.intersectsSphere(_sph)) continue;
      const k = this.kinds.get(it.model);
      if (!k) continue;
      const m = near || !k.far ? k.near : d2 < mid * mid ? k.far : k.blob;
      const i = m.count++;
      m.setMatrixAt(i, it.matrix);
      m.setColorAt(i, _c.setScalar(it.tint));
    }
    for (const k of this.kinds.values()) {
      for (const m of [k.near, k.far, k.proxy, k.blob]) {
        if (!m) continue;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }
}
