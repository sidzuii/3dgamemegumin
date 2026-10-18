import * as THREE from 'three';

/**
 * Walkability grid for NPC routing inside a settlement (1 m cells). A cell is blocked if any
 * world collision triangle crosses a small box at body height above the ground there
 * (three-mesh-bvh `intersectsBox`). A* with octile distance + line-of-sight smoothing; paths
 * are cached per (start, goal) cell pair.
 */
const _box = new THREE.Box3();
const _ident = new THREE.Matrix4();

export class NavGrid {
  constructor(world, minX, minZ, maxX, maxZ, cell = 1) {
    this.world = world;
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.cache = new Map();
    this.rows = 0; // rows tested so far: the grid is filled in idle time (fill) or at once on first use (ensure)
  }

  /** Test rows of cells against the world collision for up to `ms` milliseconds; true when the grid is complete. */
  fill(ms = Infinity) {
    const bvh = this.world.collider.geometry.boundsTree, r = this.cell * 0.36, t0 = performance.now();
    while (this.rows < this.h) {
      const j = this.rows++;
      for (let i = 0; i < this.w; i++) {
        const x = this.minX + (i + 0.5) * this.cell, z = this.minZ + (j + 0.5) * this.cell;
        const g = this.world.heightAt(x, z);
        _box.min.set(x - r, g + 0.5, z - r);
        _box.max.set(x + r, g + 1.7, z + r);
        if (bvh.intersectsBox(_box, _ident)) this.blocked[j * this.w + i] = 1;
      }
      if (performance.now() - t0 > ms) break;
    }
    return this.rows >= this.h;
  }

  ensure() {
    if (this.rows < this.h) this.fill();
  }

  contains(x, z) {
    return x >= this.minX && z >= this.minZ && x < this.minX + this.w * this.cell && z < this.minZ + this.h * this.cell;
  }

  _cellOf(x, z) {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }

  _free(i, j) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i];
  }

  /** Nearest free cell to (i, j) within a small radius. */
  _nearestFree(i, j) {
    if (this._free(i, j)) return [i, j];
    for (let r = 1; r < 6; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) === r && this._free(i + di, j + dj)) return [i + di, j + dj];
      }
    }
    return null;
  }

  _los(a, b) {
    let [x0, y0] = a;
    const [x1, y1] = b;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < 400; guard++) {
      if (!this._free(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      // Don't cut blocked corners diagonally.
      if (!this._free(x0, y0)) return false;
    }
    return false;
  }

  /** World-space waypoint list from (ax,az) to (bx,bz), or null. */
  path(ax, az, bx, bz) {
    this.ensure();
    const s = this._nearestFree(...this._cellOf(ax, az));
    const g = this._nearestFree(...this._cellOf(bx, bz));
    if (!s || !g) return null;
    const key = s[0] + ',' + s[1] + '|' + g[0] + ',' + g[1];
    let cells = this.cache.get(key);
    if (cells === undefined) {
      cells = this._astar(s, g);
      if (cells) cells = this._smooth(cells);
      this.cache.set(key, cells);
    }
    if (!cells) return null;
    const out = cells.map(([i, j]) => new THREE.Vector3(this.minX + (i + 0.5) * this.cell, 0, this.minZ + (j + 0.5) * this.cell));
    out[out.length - 1].set(bx, 0, bz);
    return out;
  }

  _astar(s, g) {
    const W = this.w;
    const N = this.w * this.h;
    const gScore = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (idx, f) => {
      heap.push([f, idx]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const h = (i, j) => {
      const dx = Math.abs(i - g[0]), dy = Math.abs(j - g[1]);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const si = s[1] * W + s[0], gi = g[1] * W + g[0];
    gScore[si] = 0;
    push(si, h(s[0], s[1]));
    let iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, cur] = pop();
      if (cur === gi) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this._free(ni, nj)) continue;
        if (di && dj && (!this._free(ci + di, cj) || !this._free(ci, cj + dj))) continue;
        const n = nj * W + ni;
        const cost = gScore[cur] + (di && dj ? Math.SQRT2 : 1);
        if (cost < gScore[n]) {
          gScore[n] = cost;
          from[n] = cur;
          push(n, cost + h(ni, nj));
        }
      }
    }
    if (from[gi] < 0 && si !== gi) return null;
    const out = [];
    for (let c = gi; c >= 0; c = from[c]) {
      out.push([c % W, (c / W) | 0]);
      if (c === si) break;
    }
    return out.reverse();
  }

  _smooth(cells) {
    if (cells.length < 3) return cells;
    const out = [cells[0]];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!this._los(cells[anchor], cells[i])) {
        out.push(cells[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(cells[cells.length - 1]);
    return out;
  }
}
