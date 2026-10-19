import { HALF, REGIONS, RIVERS, LAKES, ROADS } from '../world/MapData.js';
import { WALL, STREETS, SQUARES, toWorld } from '../world/AxelPlan.js';
import { GRID_N, GRID_STEP } from '../world/Terrain.js';
import { STOPS, CLOSED_PARTS } from '../data/travel.js';
import { SHEET as AIN_SHEET, EXPLORE as EXPLORE_AIN, inSheet, CITY_WALL, DISTRICTS, toWorld as ainToWorld } from '../world/AinstreyPlan.js';

const EXPLORE_N = 96; // fog-of-war grid of the old map (rpg/RPG.js)

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
    // Two sheets: the old map (±HALF, 1 px/m) and the Ainstrey region (2 m/px). `sheet` = the page on the screen.
    this.sheets = {
      main: { id: 'main', title: 'Окрестности Акселя', x0: -HALF, z0: -HALF, w: HALF * 2, h: HALF * 2, px: 1, N: EXPLORE_N, M: EXPLORE_N },
      ainstrey: { id: 'ainstrey', title: 'Айнстрей', x0: AIN_SHEET.x0, z0: AIN_SHEET.z0, w: AIN_SHEET.x1 - AIN_SHEET.x0, h: AIN_SHEET.z1 - AIN_SHEET.z0, px: 0.5, N: EXPLORE_AIN.nx, M: EXPLORE_AIN.nz },
    };
    this.sheet = this.sheets.main;
    this.sheets.main.base = this._renderBase();
    this.sheets.ainstrey.base = this._renderAinstreyBase();
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

  /** The Ainstrey sheet: terrain colours, hill shading, water, roads, the wall and the districts (2 m per pixel). */
  _renderAinstreyBase() {
    const W = this.game.world;
    const sh = this.sheets.ainstrey, hs = W.heightfield.sheets[1], col = W.sheetColors?.ainstrey;
    const PXA = sh.px;
    const wpx = Math.round(sh.w * PXA), hpx = Math.round(sh.h * PXA);
    const c = document.createElement('canvas');
    c.width = wpx; c.height = hpx;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(wpx, hpx);
    const N = hs.nx, st = hs.step;
    for (let py = 0; py < hpx; py++) {
      const j = Math.min(hs.nz - 2, Math.max(0, Math.floor(py / PXA / st)));
      for (let px = 0; px < wpx; px++) {
        const i = Math.min(N - 2, Math.max(0, Math.floor(px / PXA / st)));
        const k = j * N + i;
        const dx = hs.data[k + 1] - hs.data[k], dz = hs.data[k + N] - hs.data[k];
        const shade = Math.max(0.55, Math.min(1.3, 1 - (dx * 0.6 + dz * 0.6) / st * 0.5));
        let r = col ? col[k * 3] : 0.4, g = col ? col[k * 3 + 1] : 0.5, b = col ? col[k * 3 + 2] : 0.3;
        r = r * 0.7 + 0.86 * 0.3; g = g * 0.7 + 0.78 * 0.3; b = b * 0.7 + 0.6 * 0.3;
        const o = (py * wpx + px) * 4;
        img.data[o] = Math.min(255, Math.pow(r, 1 / 2.2) * 255 * shade);
        img.data[o + 1] = Math.min(255, Math.pow(g, 1 / 2.2) * 255 * shade);
        img.data[o + 2] = Math.min(255, Math.pow(b, 1 / 2.2) * 255 * shade);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const T = (x) => (x - sh.x0) * PXA, Tz = (z) => (z - sh.z0) * PXA;
    const poly = (pts, close) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(T(x), Tz(z)) : ctx.moveTo(T(x), Tz(z)))); if (close) ctx.closePath(); };
    // districts under the streets
    const FILL = { posad: '230, 190, 150', steps: '236, 224, 190', guilds: '170, 190, 215', port: '150, 200, 205', old: '215, 196, 160', academy: '150, 190, 205', garden: '170, 215, 150' };
    for (const D of DISTRICTS) { ctx.fillStyle = `rgba(${FILL[D.id]}, 0.42)`; poly(D.pts.map(([u, v]) => ainToWorld(u, v)), true); ctx.fill(); }
    ctx.strokeStyle = '#4a7a9a';
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const R of RIVERS) {
      ctx.lineWidth = Math.max(2, R.width * PXA);
      poly(R.points);
      ctx.stroke();
    }
    for (const R of ROADS) {
      ctx.strokeStyle = R.kind === 'trail' ? 'rgba(120, 90, 60, 0.55)' : 'rgba(110, 80, 50, 0.9)';
      ctx.lineWidth = Math.max(1.5, R.width * 0.7 * PXA);
      ctx.setLineDash(R.kind === 'trail' ? [4, 4] : []);
      poly(R.points);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const f of W.footprints) {
      if (!inSheet(f.x, f.z)) continue;
      ctx.fillStyle = f.kind === 'bridge' ? 'rgba(150, 140, 120, 0.95)' : 'rgba(90, 60, 50, 0.85)';
      ctx.save();
      ctx.translate(T(f.x), Tz(f.z));
      ctx.rotate(-f.rot);
      ctx.fillRect((-f.w / 2) * PXA, (-f.d / 2) * PXA, Math.max(1.2, f.w * PXA), Math.max(1.2, f.d * PXA));
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(70, 60, 55, 0.95)';
    ctx.lineWidth = 2.4;
    poly(CITY_WALL.map((n) => ainToWorld(n.u, n.v)), true);
    ctx.stroke();
    // stable north
    ctx.fillStyle = 'rgba(40, 30, 24, 0.85)';
    ctx.font = '700 34px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('С ↑', 60, 60);
    return c;
  }

  /** Show the other page of the map (old map | Ainstrey). */
  setSheet(id) {
    this.sheet = this.sheets[id] || this.sheets.main;
    this.fog = null;
    this.follow = true;
    this.zoom = id === 'ainstrey' ? 0.7 : 1.6;
    this.draw();
  }

  /** The page that matches where the player is. */
  syncSheet() {
    const pp = this.game.player.position;
    const id = inSheet(pp.x, pp.z) ? 'ainstrey' : 'main';
    if (this.sheet.id !== id) this.setSheet(id);
  }

  attach(container) {
    container.innerHTML = '';
    container.appendChild(this.canvas);
    this.container = container;
    this.follow = true;
    this.syncSheet();
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
    // in a room of a building the map shows the street at its door
    const room = g.inHouse ? g.world.interiorAt(g.player.position) : null;
    const pp = room && g.world.npcSpots[room.outside] ? g.world.npcSpots[room.outside].pos : g.player.position;
    const inDungeon = g.inDungeon && !room;
    const sh = this.sheet;
    if (this.follow) {
      this.center.x = inDungeon ? REGIONS.find((r) => r.id === 'cave').center.x : pp.x;
      this.center.z = inDungeon ? REGIONS.find((r) => r.id === 'cave').center.z : pp.z;
    }
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, cw, ch);
    const [ox, oz] = this._toScreen(sh.x0, sh.z0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sh.base, ox, oz, sh.w * this.zoom, sh.h * this.zoom);
    // Fog of war: an alpha mask scaled up with smoothing (soft edges, no seams); one grid per page.
    const N = sh.N, M = sh.M;
    if (!this.fog) {
      this.fog = document.createElement('canvas');
      this.fog.width = N; this.fog.height = M;
      this.fogCtx = this.fog.getContext('2d');
      this.fogImg = this.fogCtx.createImageData(N, M);
    }
    const fd = this.fogImg.data;
    const grid = sh.id === 'main' ? rpg.explored : rpg.exploredAin;
    for (let k = 0; k < N * M; k++) {
      fd[k * 4] = 36; fd[k * 4 + 1] = 28; fd[k * 4 + 2] = 22;
      fd[k * 4 + 3] = grid[k] ? 0 : 225;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    ctx.drawImage(this.fog, ox, oz, sh.w * this.zoom, sh.h * this.zoom);
    // Region labels.
    ctx.textAlign = 'center';
    for (const R of REGIONS) {
      if (R.interior || !g.discovered.has(R.id) || inSheet(R.center.x, R.center.z) !== (sh.id === 'ainstrey')) continue;
      const [sx, sz] = this._toScreen(R.center.x, R.center.z);
      ctx.font = `700 ${R.r > 45 ? 14 : 12}px Segoe UI, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20, 14, 10, 0.85)';
      ctx.fillStyle = R.secret ? '#c8a0ff' : '#ffe3a8';
      const label = `${R.icon} ${R.name}`;
      ctx.strokeText(label, sx, sz);
      ctx.fillText(label, sx, sz);
    }
    // The capital: the stops of the carts (known ones are lit) and the closed parts with their status.
    if (sh.id === 'ainstrey') {
      ctx.font = '600 11px Segoe UI, sans-serif';
      for (const st of STOPS) {
        const s = rpg.spotPos(st.spot);
        if (!s || !rpg.state.flags['stop_' + st.id]) continue;
        const [sx, sz] = this._toScreen(s.x, s.z);
        ctx.fillStyle = '#7fd0ff'; ctx.strokeStyle = '#0a2a44'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sz, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (this.zoom > 0.55) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,20,30,0.85)'; ctx.fillStyle = '#d8f0ff'; ctx.strokeText(st.name, sx, sz - 9); ctx.fillText(st.name, sx, sz - 9); }
      }
      for (const c of CLOSED_PARTS) {
        const s = rpg.spotPos(c.spot);
        if (!s) continue;
        const [sx, sz] = this._toScreen(s.x, s.z);
        ctx.fillStyle = '#c8c0b0'; ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 2;
        ctx.fillRect(sx - 4, sz - 4, 8, 8); ctx.strokeRect(sx - 4, sz - 4, 8, 8);
        if (this.zoom > 0.55) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,10,0.85)'; ctx.fillStyle = '#e8dcc8'; ctx.strokeText('🔒 ' + c.name + ' (' + c.note + ')', sx, sz - 9); ctx.fillText('🔒 ' + c.name + ' (' + c.note + ')', sx, sz - 9); }
      }
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
    // Player arrow (only on the page the player is on).
    if (!inDungeon && inSheet(pp.x, pp.z) === (sh.id === 'ainstrey')) {
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
    if (inDungeon || room) {
      ctx.fillStyle = '#ffe3a8';
      ctx.font = '600 14px Segoe UI, sans-serif';
      ctx.fillText(room ? `Вы в здании: ${room.name}` : `Вы в подземелье «${g.currentLocation?.name ?? 'Старая шахта'}»`, cw / 2, 28);
    } else {
      ctx.fillStyle = 'rgba(255, 227, 168, 0.9)';
      ctx.font = '600 13px Segoe UI, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Лист карты: ' + sh.title + ' · север сверху', 12, 20);
      ctx.textAlign = 'center';
    }
  }
}
