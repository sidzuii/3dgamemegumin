import { HALF, REGIONS, RIVERS, LAKES, ROADS } from '../world/MapData.js';
import { WALL, STREETS, SQUARES, toWorld } from '../world/AxelPlan.js';
import { GRID_N, GRID_STEP } from '../world/Terrain.js';

/**
 * World map: a parchment-tinted image of the terrain (hill shading, water, roads, buildings)
 * rendered once at load, plus live overlays: fog of war (unexplored areas), labels of
 * discovered regions, the player arrow and the tracked quest target. Wheel = zoom,
 * drag = pan.
 */
const PX = 1; // pixels per metre in the base image

export class MapView {
  constructor(game) {
    this.game = game;
    this.base = this._renderBase();
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.zoom = 1.6;
    this.center = { x: 0, z: 0 };
    this.follow = true;
    this._drag = null;
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.6, Math.min(5, this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      this.draw();
    }, { passive: false });
    c.addEventListener('mousedown', (e) => { this._drag = { x: e.clientX, y: e.clientY, cx: this.center.x, cz: this.center.z }; this.follow = false; });
    window.addEventListener('mouseup', () => (this._drag = null));
    window.addEventListener('mousemove', (e) => {
      if (!this._drag) return;
      this.center.x = this._drag.cx - (e.clientX - this._drag.x) / this.zoom;
      this.center.z = this._drag.cz - (e.clientY - this._drag.y) / this.zoom;
      this.draw();
    });
  }

  _renderBase() {
    const W = this.game.world;
    const size = Math.round(HALF * 2 * PX);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hf = W.heightfield.data, col = W.terrainColors;
    const N = GRID_N;
    for (let py = 0; py < size; py++) {
      const z = -HALF + py / PX;
      const j = Math.min(N - 2, Math.max(0, Math.floor((z + HALF) / GRID_STEP)));
      for (let px = 0; px < size; px++) {
        const x = -HALF + px / PX;
        const i = Math.min(N - 2, Math.max(0, Math.floor((x + HALF) / GRID_STEP)));
        const k = j * N + i;
        // Hill shading from the light in the north-west.
        const dx = hf[k + 1] - hf[k], dz = hf[k + N] - hf[k];
        const shade = Math.max(0.55, Math.min(1.3, 1 - (dx * 0.6 + dz * 0.6) / GRID_STEP * 0.5));
        let r = col[k * 3], g = col[k * 3 + 1], b = col[k * 3 + 2];
        // Parchment tint.
        r = r * 0.7 + 0.86 * 0.3; g = g * 0.7 + 0.78 * 0.3; b = b * 0.7 + 0.6 * 0.3;
        const o = (py * size + px) * 4;
        img.data[o] = Math.min(255, Math.pow(r, 1 / 2.2) * 255 * shade);
        img.data[o + 1] = Math.min(255, Math.pow(g, 1 / 2.2) * 255 * shade);
        img.data[o + 2] = Math.min(255, Math.pow(b, 1 / 2.2) * 255 * shade);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const T = (x) => (x + HALF) * PX;
    // Water.
    ctx.strokeStyle = '#4a7a9a';
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const R of RIVERS) {
      ctx.lineWidth = Math.max(2, R.width) * PX;
      ctx.beginPath();
      R.points.forEach(([x, z], i) => (i ? ctx.lineTo(T(x), T(z)) : ctx.moveTo(T(x), T(z))));
      ctx.stroke();
    }
    ctx.fillStyle = '#4a7a9a';
    for (const L of LAKES) {
      ctx.beginPath();
      ctx.arc(T(L.center.x), T(L.center.z), L.radius * PX, 0, Math.PI * 2);
      ctx.fill();
    }
    // Roads.
    for (const R of ROADS) {
      ctx.strokeStyle = R.kind === 'trail' ? 'rgba(120, 90, 60, 0.55)' : 'rgba(110, 80, 50, 0.85)';
      ctx.lineWidth = Math.max(1.5, R.width * 0.7) * PX;
      ctx.setLineDash(R.kind === 'trail' ? [4, 4] : []);
      ctx.beginPath();
      R.points.forEach(([x, z], i) => (i ? ctx.lineTo(T(x), T(z)) : ctx.moveTo(T(x), T(z))));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Buildings and structures.
    for (const f of W.footprints) {
      if (f.kind === 'field') ctx.fillStyle = 'rgba(200, 170, 80, 0.45)';
      else if (f.kind === 'bridge') ctx.fillStyle = 'rgba(150, 140, 120, 0.95)';
      else ctx.fillStyle = 'rgba(90, 60, 50, 0.85)';
      ctx.save();
      ctx.translate(T(f.x), T(f.z));
      ctx.rotate(-f.rot);
      ctx.fillRect((-f.w / 2) * PX, (-f.d / 2) * PX, f.w * PX, f.d * PX);
      ctx.restore();
    }
    // Axel: squares, streets, the wall.
    const city = (pts, close) => {
      ctx.beginPath();
      pts.forEach(([u, v], i) => { const [x, z] = toWorld(u, v); i ? ctx.lineTo(T(x), T(z)) : ctx.moveTo(T(x), T(z)); });
      if (close) ctx.closePath();
    };
    ctx.fillStyle = 'rgba(205, 190, 160, 0.9)';
    for (const q of SQUARES) { city(q.pts, true); ctx.fill(); }
    ctx.strokeStyle = 'rgba(205, 190, 160, 0.9)';
    for (const st of STREETS) { ctx.lineWidth = st.width * PX; city(st.pts); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(70, 60, 55, 0.95)';
    ctx.lineWidth = 3 * PX;
    city(WALL.nodes.map((n) => [n.u, n.v]), true);
    ctx.stroke();
    return c;
  }

  attach(container) {
    container.innerHTML = '';
    container.appendChild(this.canvas);
    this.container = container;
    this.follow = true;
    this.resize();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    this.canvas.width = Math.max(200, r.width);
    this.canvas.height = Math.max(200, r.height);
    this.draw();
  }

  /** World -> canvas pixel. */
  _toScreen(x, z) {
    return [(x - this.center.x) * this.zoom + this.canvas.width / 2, (z - this.center.z) * this.zoom + this.canvas.height / 2];
  }

  draw() {
    const g = this.game, rpg = g.rpg;
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;
    const pp = g.player.position;
    const inDungeon = g.inDungeon;
    if (this.follow) {
      this.center.x = inDungeon ? REGIONS.find((r) => r.id === 'cave').center.x : pp.x;
      this.center.z = inDungeon ? REGIONS.find((r) => r.id === 'cave').center.z : pp.z;
    }
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, cw, ch);
    const [ox, oz] = this._toScreen(-HALF, -HALF);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, ox, oz, HALF * 2 * this.zoom, HALF * 2 * this.zoom);
    // Fog of war: a 96×96 alpha mask scaled up with smoothing (soft edges, no seams).
    const N = 96;
    if (!this.fog) {
      this.fog = document.createElement('canvas');
      this.fog.width = this.fog.height = N;
      this.fogCtx = this.fog.getContext('2d');
      this.fogImg = this.fogCtx.createImageData(N, N);
    }
    const fd = this.fogImg.data;
    for (let k = 0; k < N * N; k++) {
      fd[k * 4] = 36; fd[k * 4 + 1] = 28; fd[k * 4 + 2] = 22;
      fd[k * 4 + 3] = rpg.explored[k] ? 0 : 225;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    ctx.drawImage(this.fog, ox, oz, HALF * 2 * this.zoom, HALF * 2 * this.zoom);
    // Region labels.
    ctx.textAlign = 'center';
    for (const R of REGIONS) {
      if (R.interior || !g.discovered.has(R.id)) continue;
      const [sx, sz] = this._toScreen(R.center.x, R.center.z);
      ctx.font = `700 ${R.r > 45 ? 14 : 12}px Segoe UI, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20, 14, 10, 0.85)';
      ctx.fillStyle = R.secret ? '#c8a0ff' : '#ffe3a8';
      const label = `${R.icon} ${R.name}`;
      ctx.strokeText(label, sx, sz);
      ctx.fillText(label, sx, sz);
    }
    // Quest target.
    const tid = rpg.quests.tracked;
    const t = tid && rpg.quests.targetOf(tid);
    if (t) {
      const [sx, sz] = this._toScreen(t.x, t.z);
      ctx.fillStyle = '#ffd36a';
      ctx.strokeStyle = '#4a2a00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sz - 9); ctx.lineTo(sx + 7, sz); ctx.lineTo(sx, sz + 9); ctx.lineTo(sx - 7, sz); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // Player arrow.
    if (!inDungeon) {
      const [px, pz] = this._toScreen(pp.x, pp.z);
      const yaw = g.player.controller.yaw;
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-yaw + Math.PI);
      ctx.fillStyle = '#ff5a3a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (inDungeon) {
      ctx.fillStyle = '#ffe3a8';
      ctx.font = '600 14px Segoe UI, sans-serif';
      ctx.fillText('Вы в подземелье «Старая шахта»', cw / 2, 28);
    }
  }
}
