import * as THREE from 'three';
import { mergeMixed } from './World.js';

/**
 * Near models of a big city built on demand (Ainstrey: ~900 houses; their full kit models would not fit in memory at once).
 * Builders register a building with `add(cellCentre, build)`: its far proxy is in the static LOD batches of that cell (World
 * `_forceCell`), its near model is made by `build(world)` only while the camera is within the LOD distance of the cell. A cell is
 * built over a few frames (time budget), then merged into one mesh per material; the far proxies of the cell stay visible until
 * it is ready (World.update asks `ready`) and the near model is dropped again further away. The near model never collides
 * (the building's collision is static and always there).
 */
export const STREAM_CELL = 64; // the far proxies use the same cells (one mesh per material and cell)
const BUDGET_MS = 5;
const NEAR_MAX = 105; // the kit models only this near (the far proxies wear the same plaster beyond)
const NO_SHADOW = /Glass|window|flower|lawn|Vine|Metal|lampGlass/;

export class CityStream {
  constructor(world) {
    this.w = world;
    this.cells = new Map(); // 'cx,cz' -> { key, center, recs, i, sink, group }
    this.built = 0;
  }

  add(x, z, build, D = null) {
    const cx = Math.floor(x / STREAM_CELL), cz = Math.floor(z / STREAM_CELL), key = cx + ',' + cz;
    let c = this.cells.get(key);
    if (!c) {
      c = { key, center: new THREE.Vector3((cx + 0.5) * STREAM_CELL, 0, (cz + 0.5) * STREAM_CELL), recs: [], i: 0, sink: null, group: null };
      this.cells.set(key, c);
    }
    c.recs.push({ build, D });
  }

  /** The near model of a stream cell exists (the far proxies of the cell — World tier 's' — are hidden then). */
  ready(key) {
    return !!this.cells.get(key)?.group;
  }

  update(cp, L) {
    L = Math.min(L, NEAR_MAX);
    const R = STREAM_CELL * 0.71;
    let best = null, bd = Infinity;
    for (const c of this.cells.values()) {
      const d = Math.hypot(c.center.x - cp.x, c.center.z - cp.z) - R;
      if (c.group) {
        if (d > L + 60) this._drop(c);
        continue;
      }
      if (d < L + 25 && d < bd) { bd = d; best = c; }
      else if (c.sink && d > L + 60) { c.sink = null; c.i = 0; } // left before it was finished
    }
    if (best) this._build(best);
  }

  /** Build the cell's buildings until the time budget of this frame runs out; merge when all are done. */
  _build(c) {
    const W = this.w, t0 = performance.now();
    c.sink ??= new Map();
    const prev = [W._streamSink, W._D, W.lodMode];
    W._streamSink = c.sink;
    W.lodMode = null;
    try {
      while (c.i < c.recs.length) {
        const r = c.recs[c.i++];
        W._D = r.D;
        r.build(W);
        if (performance.now() - t0 > BUDGET_MS) break;
      }
    } finally {
      [W._streamSink, W._D, W.lodMode] = prev;
    }
    if (c.i < c.recs.length) return;
    const group = new THREE.Group();
    group.name = 'stream:' + c.key;
    for (const [key, list] of c.sink) {
      const [mat, shadow] = key.split('|');
      const merged = mergeMixed(list);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, W.mats[mat]);
      mesh.castShadow = shadow === '1' && !NO_SHADOW.test(mat); // walls, roofs, trims cast; glass, panes, flowers do not
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.matrixAutoUpdate = false;
    W.scene.add(group);
    c.group = group;
    c.sink = null;
    c.i = 0;
    this.built++;
  }

  _drop(c) {
    this.w.scene.remove(c.group);
    for (const m of c.group.children) m.geometry.dispose();
    c.group = null;
  }
}
