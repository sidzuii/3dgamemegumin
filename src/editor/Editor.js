import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { groupMatrix, pivotMatrix } from '../world/World.js';
import { LAYERS, layerOf, validateLayout } from './layers.js';
import { checkAxelLayout } from '../world/AxelLayoutCheck.js';
import { buildPlacement, PLACEABLES, placeableLabel, STALL_COLORS } from '../world/build/Placements.js';
import { ROOF_COLORS } from '../world/KitLibrary.js';
import './editor.css';

/**
 * Map editor (open the game with `?editor`, dev server only).
 *
 * Everything the builders mark with `world.group(id, …)` (houses, shops, camps, places…) and
 * everything placed here is a separate object in editor mode: select it, drag it over the
 * ground, turn, scale, raise, delete. New objects come from a palette (houses, trees, props,
 * any Kenney piece). The result is a layout file, public/data/placements.json:
 *   overrides: { groupId: { x, z, rot, s, dy } | { deleted: true } }   — built-in places
 *   added:     [ { id, type, x, z, rot, s, dy, ...params } ]           — placed objects
 * The game applies it when it builds the world, so colliders, NPC spots, lights and quest
 * objects follow their group after a reload.
 */
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const DEG = Math.PI / 180;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const DRAFT_KEY = 'megumin-editor-draft';
const _sph = new THREE.Sphere();
const _hit = new THREE.Vector3();
/** Big containers: a plain click selects the piece inside (one street, one wall section). */
const CONTAINERS = new Set(['axel_streets', 'axel_wall']);
const wrapDeg = (d) => { d = ((d + 180) % 360 + 360) % 360 - 180; return d === -180 ? 180 : d; };

export class Editor {
  constructor(game) {
    this.g = game;
    this.W = game.world;
    this.cam = game.camera;
    this.layout = JSON.parse(JSON.stringify(this.W.layout));
    this.layout.vegetation ||= {};
    this.layout.erase ||= [];
    this.layout.spots ||= {};
    this.layout.camps ||= {};
    this.markerRecs = new Map();
    this.layerState = Object.fromEntries(LAYERS.map((l) => [l.id, { visible: true, locked: false }]));
    this.vegRecs = new Map(); // id -> editor wrapper of a recorded plant (proxy object only while selected)
    this.eraseR = 6;
    this.eraser = false;
    this.history = [];
    this.future = [];
    this.dirty = false;
    this.sel = null;
    this.multi = new Set(); // extra selected objects (Shift+click)
    this.rotSnap = 0; // degrees, 0 = free
    this.tool = null; // { type, name? } while placing
    this.ghost = null;
    this.keys = new Set();
    this.snap = true;
    this.drag = null;
    this.look = null;
    this.mouse = { x: 0, y: 0 };
    this.yaw = 0; // looking north (-z) at Axel
    this.pitch = -0.75;
    this.cam.position.set(-330, 70, 110);
    this._applyCam();
    // Daylight, no fog wall in the way of an overview.
    game.dayNight.update(0, 12, 0);
    this.fogFar = this.g.scene.fog.far;
    this.g.scene.fog.far = 900;
    this.cam.far = 1600;
    this.cam.updateProjectionMatrix();
    this.box = new THREE.BoxHelper(undefined, 0xffd24a);
    this.box.visible = false;
    this.g.scene.add(this.box);
    for (const rec of this.W.groups.values()) this._remember(rec);
    this._initGizmo();
    this._buildMarkers();
    this._loadDraft();
    document.body.classList.add('editor-mode');
    this._buildUI();
    this._bindInput();
    this._refreshList();
    this._status(this._draftNote || 'Редактор карты. Выберите объект мышью (Alt — часть внутри, растения тоже выбираются) или возьмите новый в палитре слева.');
    if (this._pendingSync) { this._pendingSync = false; this._sync(); }
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  frame(dt) {
    this._moveCamera(dt);
    if (this.box.visible && this.sel?.object) this.box.setFromObject(this.sel.object, true);
    this.W.followShadow(this._groundAhead(_v));
    this.W.trees.update(dt, this.cam);
    this.g.composer.render();
  }

  _applyCam() {
    this.cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.cam.updateMatrixWorld();
  }

  _moveCamera(dt) {
    const k = this.keys;
    if (document.activeElement?.matches?.('input, select, textarea')) return;
    const ground = this.W.heightAt(this.cam.position.x, this.cam.position.z);
    const speed = THREE.MathUtils.clamp((this.cam.position.y - ground) * 0.9, 10, 120) * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1);
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _v.set(0, 0, 0);
    if (k.has('KeyW')) _v.add(_f);
    if (k.has('KeyS')) _v.sub(_f);
    if (k.has('KeyD')) _v.add(_r);
    if (k.has('KeyA')) _v.sub(_r);
    if (k.has('KeyE') || k.has('Space')) _v.y += 1;
    if (k.has('KeyQ') || k.has('KeyC')) _v.y -= 1;
    if (_v.lengthSq() > 0) {
      this.cam.position.addScaledVector(_v.normalize(), speed * dt);
      this.cam.position.y = Math.max(this.cam.position.y, this.W.heightAt(this.cam.position.x, this.cam.position.z) + 1.5);
      this.cam.updateMatrixWorld();
    }
  }

  /** Ground point the camera looks at (for the shadow frustum). */
  _groundAhead(target) {
    _ndc.set(0, 0);
    return this._groundHit(_ndc, target) || target.copy(this.cam.position);
  }

  /** Ray (from screen NDC) against the terrain: march + refine. */
  _groundHit(ndc, target) {
    _ray.setFromCamera(ndc, this.cam);
    const o = _ray.ray.origin, d = _ray.ray.direction;
    let prev = 0;
    for (let t = 1; t < 1500; t += Math.max(1, t * 0.02)) {
      const y = o.y + d.y * t;
      const h = this.W.heightAt(o.x + d.x * t, o.z + d.z * t);
      if (y <= h) {
        let a = prev, b = t;
        for (let i = 0; i < 18; i++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= this.W.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        return target.copy(d).multiplyScalar(b).add(o);
      }
      prev = t;
    }
    return null;
  }

  _mouseNdc(e) {
    const r = this.g.renderer.domElement.getBoundingClientRect();
    return _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Object under the cursor. Plain click: the whole object (a house, a tower); Alt: the part
   * under the cursor (a door, a barrel, one street). Hidden / deleted parts are skipped. */
  _pick(e) {
    _ray.setFromCamera(this._mouseNdc(e), this.cam);
    const objs = [];
    for (const rec of this.W.groups.values()) if (!rec.parent && rec.object?.visible && rec !== this.ghost) objs.push(rec.object);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    let found = null;
    for (const h of _ray.intersectObjects(objs, true)) {
      if (!shown(h.object)) continue;
      let o = h.object;
      while (o && !o.userData.groupId) o = o.parent;
      let rec = o ? this.W.groups.get(o.userData.groupId) : null;
      if (!rec) continue;
      if (!e.altKey) while (rec.parent && !CONTAINERS.has(rec.parent.id)) rec = rec.parent; // up to the object; stop under a container
      if (this.layerState[layerOf(rec)].locked) continue;
      found = { rec, distance: h.distance };
      break;
    }
    for (const c of [this._pickVeg(_ray.ray), this._pickMarker(_ray.ray)]) if (c && (!found || c.distance < found.distance)) found = c;
    return found?.rec ?? null;
  }

  // ---------------------------------------------------------------------------
  // Layout <-> objects
  // ---------------------------------------------------------------------------
  /** Current placement of a group (layout values, defaults from the builder pivot). */
  place(rec) {
    if (rec.marker) {
      const m = rec.marker, o = this.layout[m.kind + 's'][m.key] || {}, b = m.base;
      return { x: o.x ?? b.x, z: o.z ?? b.z, rot: o.yaw ?? b.yaw ?? 0, s: 1, dy: 0 };
    }
    if (rec.veg) {
      const o = this.layout.vegetation[rec.veg.id] || {}, r = rec.veg;
      return { x: o.x ?? r.x, z: o.z ?? r.z, rot: o.rot ?? r.rot, s: o.s ?? 1, dy: o.dy ?? 0 };
    }
    const o = rec.added ? this._added(rec.id) || {} : this.layout.overrides[rec.id] || {};
    const p = rec.pivot;
    return { x: o.x ?? p.x, z: o.z ?? p.z, rot: o.rot ?? p.rot, s: o.s ?? 1, dy: o.dy ?? 0 };
  }

  _added(id) {
    return this.layout.added.find((a) => a.id === id);
  }

  _setPlace(rec, T) {
    const round = (v, n = 100) => Math.round(v * n) / n;
    const vals = { x: round(T.x), z: round(T.z), rot: round(T.rot, 10000), s: round(T.s, 1000), dy: round(T.dy) };
    if (rec.marker) { const m = rec.marker; this.layout[m.kind + 's'][m.key] = m.kind === 'spot' ? { x: vals.x, z: vals.z, yaw: vals.rot } : { x: vals.x, z: vals.z }; }
    else if (rec.veg) { const o = { ...(this.layout.vegetation[rec.veg.id] || {}), ...vals }; delete o.deleted; this.layout.vegetation[rec.veg.id] = o; }
    else if (rec.added) Object.assign(this._added(rec.id), vals);
    else this.layout.overrides[rec.id] = vals;
    this._applyObject(rec);
    this.dirty = true;
    this._stash();
  }

  _applyObject(rec) {
    if (rec.marker) return this._applyMarker(rec);
    if (rec.veg) return this._applyVeg(rec);
    const obj = rec.object;
    if (!obj) return;
    const T = this.place(rec);
    groupMatrix({ ...T, y: this.W.heightAt(T.x, T.z) + T.dy }, _m);
    if (rec.parent?.object) _m.premultiply(pivotMatrix(rec.parent.pivot).invert());
    _m.decompose(obj.position, obj.quaternion, obj.scale);
    obj.rotation.setFromQuaternion(obj.quaternion, 'YXZ');
    obj.visible = !(!rec.added && this.layout.overrides[rec.id]?.deleted) && this.layerState[layerOf(rec)].visible;
    obj.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------------------
  // Wild vegetation (recorded by Kit.js: trees, bushes, rocks, stumps, flowers, mushrooms)
  // ---------------------------------------------------------------------------
  _vegWrap(r) {
    let w = this.vegRecs.get(r.id);
    if (!w) {
      w = { id: 'veg:' + r.id, label: r.label, veg: r, pivot: { x: r.x, z: r.z, rot: r.rot, y: this.W.heightAt(r.x, r.z) }, added: false, hasLogic: false, object: null, parent: null };
      this.vegRecs.set(r.id, w);
    }
    return w;
  }

  _erased(r) {
    return this.layout.erase.some((c) => Math.hypot(r.x - c.x, r.z - c.z) < c.r);
  }

  _vegDeleted(r) {
    const o = this.layout.vegetation[r.id];
    return !!o?.deleted || (!o && this._erased(r));
  }

  /** Put the plant's instance (and the selection proxy) where the layout says. */
  _applyVeg(w) {
    const r = w.veg, it = r.item, T = this.place(w), gy = this.W.heightAt(T.x, T.z);
    const del = this._vegDeleted(r);
    if (it) {
      if (it.y0 === undefined) { it.y0 = it.y - this.W.heightAt(r.x, r.z); it.s0 = it.s; }
      this.W.trees.setItem(it, { x: T.x, z: T.z, y: gy + it.y0 + T.dy, rot: T.rot, s: it.s0 * T.s });
      it.hidden = del;
      it.layerHidden = !this.layerState[r.kind].visible;
    }
    const o = w.object;
    if (o) {
      o.position.set(T.x, gy + T.dy, T.z);
      o.rotation.set(0, T.rot, 0);
      o.scale.setScalar(T.s);
      o.visible = !del;
      o.updateMatrixWorld(true);
    }
  }

  /** The selection proxy of a plant: an invisible box the gizmo and the selection frame use. */
  _vegProxy(w) {
    if (w.object) return;
    const r = w.veg, it = r?.item;
    const h = r ? r.h : 2, width = r ? Math.max(0.6, Math.min(r.h * 0.5, (it?.r ?? 1) * 1.2)) : 1.2;
    const obj = new THREE.Object3D();
    obj.name = 'edit-proxy';
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, h, width), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.y = h / 2;
    obj.add(m);
    obj.userData.groupId = w.id;
    this.g.scene.add(obj);
    w.object = obj;
    if (w.marker) this._applyMarker(w); else this._applyVeg(w);
  }

  _vegDrop(w) {
    if (!(w?.veg || w?.marker) || !w.object) return;
    this.g.scene.remove(w.object);
    w.object.traverse((o) => o.geometry?.dispose());
    w.object = null;
  }

  /** Re-apply the whole layout to every plant (undo / redo / import / erase). */
  _applyAllVeg() {
    for (const r of this.W.veg) if (r.item) this._applyVeg(this._vegWrap(r));
  }

  /** Nearest plant under the ray (sphere test around each plant), or null. */
  _pickVeg(ray) {
    let best = null, bd = Infinity;
    for (const r of this.W.veg) {
      const it = r.item;
      if (!it || it.hidden || it.layerHidden || this.layerState[r.kind].locked) continue;
      const o = this.layout.vegetation[r.id];
      const x = o?.x ?? it.x, z = o?.z ?? it.z;
      _sph.center.set(it.x, it.y + r.h * 0.5, it.z);
      _sph.radius = Math.max(0.45, Math.min(r.h * 0.5, it.r * 0.7));
      if (!ray.intersectSphere(_sph, _hit)) continue;
      void x; void z;
      const d = ray.origin.distanceTo(_hit);
      if (d < bd) { bd = d; best = r; }
    }
    return best ? { rec: this._vegWrap(best), distance: bd } : null;
  }

  // ---------------------------------------------------------------------------
  // Markers: named spots (NPC schedules, quest places) and enemy spawn points
  // ---------------------------------------------------------------------------
  _markerList() {
    const out = [];
    for (const [key, b] of Object.entries(this.W.spotBase)) out.push({ kind: 'spot', key, base: b, label: 'Точка: ' + key });
    for (const [key, b] of Object.entries(this.W.campBase)) out.push({ kind: 'camp', key, base: { x: b.x, z: b.z, yaw: 0, y: 0 }, label: `Лагерь: ${key} (${b.type})` });
    return out;
  }

  _markerWrap(m) {
    const id = m.kind + ':' + m.key;
    let w = this.markerRecs.get(id);
    if (!w) {
      w = { id, label: m.label, marker: m, pivot: { x: m.base.x, z: m.base.z, rot: m.base.yaw || 0, y: this.W.heightAt(m.base.x, m.base.z) }, added: false, hasLogic: m.kind === 'spot', object: null, parent: null };
      this.markerRecs.set(id, w);
    }
    return w;
  }

  _buildMarkers() {
    this.markers = this._markerList();
    const geo = new THREE.ConeGeometry(0.45, 2.2, 8).translate(0, 1.1, 0);
    const mk = (n, color) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }), Math.max(1, n));
      m.frustumCulled = false;
      m.renderOrder = 9;
      this.g.scene.add(m);
      return m;
    };
    this.pins = { spot: mk(this.markers.filter((m) => m.kind === 'spot').length, 0x4aa8ff), camp: mk(this.markers.filter((m) => m.kind === 'camp').length, 0xff4a4a) };
    this._applyAllMarkers();
  }

  _applyAllMarkers() {
    const idx = { spot: 0, camp: 0 };
    for (const m of this.markers) {
      const w = this._markerWrap(m), T = this.place(w);
      const dummy = new THREE.Matrix4().compose(_v.set(T.x, this.W.heightAt(T.x, T.z) + (m.base.y || 0), T.z), _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), T.rot), _s.set(1, 1, 1));
      this.pins[m.kind].setMatrixAt(idx[m.kind]++, dummy);
      m.pos = [T.x, this.W.heightAt(T.x, T.z) + (m.base.y || 0), T.z];
    }
    for (const k of Object.keys(this.pins)) { this.pins[k].count = idx[k]; this.pins[k].instanceMatrix.needsUpdate = true; this.pins[k].visible = this.layerState[k + 's'].visible; }
  }

  _applyMarker(w) {
    this._applyAllMarkers();
    const o = w.object;
    if (o) {
      const T = this.place(w);
      o.position.set(T.x, this.W.heightAt(T.x, T.z) + (w.marker.base.y || 0), T.z);
      o.rotation.set(0, T.rot, 0);
      o.updateMatrixWorld(true);
    }
  }

  _pickMarker(ray) {
    let best = null, bd = Infinity;
    for (const m of this.markers) {
      if (!this.layerState[m.kind + 's'].visible || this.layerState[m.kind + 's'].locked || !m.pos) continue;
      _sph.center.set(m.pos[0], m.pos[1] + 1.1, m.pos[2]);
      _sph.radius = 1.1;
      if (!ray.intersectSphere(_sph, _hit)) continue;
      const d = ray.origin.distanceTo(_hit);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { rec: this._markerWrap(best), distance: bd } : null;
  }

  // ---- eraser ----------------------------------------------------------------
  setEraser(on) {
    this.eraser = on;
    if (on) { this.arm(null); this.select(null); this._status(`Ластик: ЛКМ по земле стирает растительность в радиусе ${this.eraseR} м. Esc — выйти. Ctrl+Z — отмена.`); }
    if (!this.eraserRing) {
      this.eraserRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff5a3a, depthTest: false, transparent: true, opacity: 0.9 }));
      this.eraserRing.rotation.x = -Math.PI / 2;
      this.eraserRing.renderOrder = 10;
      this.g.scene.add(this.eraserRing);
    }
    this.eraserRing.visible = false;
    this.ui.querySelector('[data-act="eraser"]')?.classList.toggle('on', on);
  }

  _eraseAt(p) {
    const last = this.layout.erase[this.layout.erase.length - 1];
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < this.eraseR * 0.5 && last.r === this.eraseR) return;
    if (this.layout.erase.length >= 500) return this._status('Ластик: слишком много кругов (500). Сохраните и очистите.');
    this.layout.erase.push({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, r: this.eraseR });
    this.dirty = true;
    this._applyAllVeg();
    this._applyAllMarkers();
    this._layersPane();
  }

  // ---- layers ----------------------------------------------------------------
  _layersPane() {
    const box = this.ui.querySelector('[data-pane="layers"]');
    if (!box) return;
    const counts = {};
    for (const rec of this.W.groups.values()) if (rec !== this.ghost) { const l = layerOf(rec); counts[l] = (counts[l] || 0) + 1; }
    for (const r of this.W.veg) counts[r.kind] = (counts[r.kind] || 0) + 1;
    counts.spots = Object.keys(this.W.spotBase).length;
    counts.camps = Object.keys(this.W.campBase).length;
    box.innerHTML = '<div class="ed-note">Слой: 👁 — показывать, 🔒 — не выбирать мышью. Счётчик — сколько объектов в слое.</div>' + LAYERS.map((l) => {
      const st = this.layerState[l.id];
      return `<div class="ed-row" data-layer="${l.id}"><input type="checkbox" data-lv ${st.visible ? 'checked' : ''} title="Показывать"><input type="checkbox" data-ll ${st.locked ? 'checked' : ''} title="Заблокировать (не выбирается)"><span>${l.label}</span><small>${counts[l.id] || 0}</small></div>`;
    }).join('') + `<div class="ed-note">Стёрто кругов ластиком: ${this.layout.erase.length}</div><div class="ed-btns"><button data-act="eraseclear">Вернуть стёртое</button></div>
      <div class="ed-cat">Проверка домов</div><div class="ed-btns"><button data-act="checkhouses">Проверить дома</button></div>${this._checkHtml()}`;
  }

  /** Result of the last "Проверить дома": houses inside each other / on a street, clickable. */
  _checkHtml() {
    const c = this._check;
    if (!c) return '<div class="ed-note">Ищет дома, стоящие друг в друге или на проезжей части (по текущей раскладке).</div>';
    const label = (id) => esc(this.W.groups.get(id)?.label || id);
    const rows = [
      ...c.overlaps.map(([a, b]) => `<div class="ed-row" data-gid="${esc(a)}"><span>Друг в друге: ${label(a)} и ${label(b)}</span><small>${esc(a)}</small></div>`),
      ...c.onStreet.map((s) => `<div class="ed-row" data-gid="${esc(s.id)}"><span>На улице «${esc(s.name)}»: ${label(s.id)}</span><small>${s.depth} м</small></div>`),
    ];
    return `<div class="ed-note">${rows.length ? `Найдено проблем: ${rows.length} (сдвинуто домов: ${c.moved}). Клик — выбрать дом.` : `Проблем не найдено (сдвинуто домов: ${c.moved}).`}</div>${rows.join('')}`;
  }

  _setLayer(id, key, value) {
    this.layerState[id][key] = value;
    if (key === 'visible') {
      for (const rec of this.W.groups.values()) if (layerOf(rec) === id && rec.object) this._applyObject(rec);
      this._applyAllVeg();
      if (this.pins) this._applyAllMarkers();
      if (this.sel && layerOf(this.sel) === id && !value) this.select(null);
    }
  }

  // ---- local draft, export / import ---------------------------------------------
  _stash() {
    clearTimeout(this._stashT);
    this._stashT = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), layout: this.layout })); } catch { /* storage full / blocked */ } }, 700);
  }

  _loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d?.layout || JSON.stringify(d.layout) === JSON.stringify(this.layout)) return;
      if (!validateLayout(d.layout).ok) { this._draftNote = 'Локальный черновик повреждён — загружена раскладка из placements.json.'; return; }
      if (window.confirm(`Найден локальный черновик редактора от ${new Date(d.savedAt).toLocaleString('ru-RU')}. Восстановить его? (Отмена — оставить сохранённую раскладку.)`)) {
        this.layout = d.layout;
        this.layout.vegetation ||= {};
        this.layout.erase ||= [];
        this.dirty = true;
        this._draftNote = 'Черновик восстановлен.';
        this._pendingSync = true;
      }
    } catch { /* unreadable draft: ignored */ }
  }

  exportLayout() {
    const v = validateLayout(this.layout);
    if (!v.ok) return this._status('Экспорт отклонён: ' + v.errors[0]);
    const blob = new Blob([JSON.stringify(this.layout, null, 1) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'placements-draft-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this._status('Экспортировано. Это черновик: в игру он попадёт только после «Сохранить» и перезапуска.');
  }

  async importLayout(file) {
    try {
      if (file.size > 6e6) throw new Error('файл больше 6 МБ');
      const data = JSON.parse(await file.text());
      const v = validateLayout(data);
      if (!v.ok) throw new Error(v.errors.slice(0, 3).join('; '));
      if (!window.confirm('Заменить текущую раскладку импортированной? (Ctrl+Z вернёт прежнюю.)')) return;
      this._snapshot();
      this.layout = data;
      this.layout.vegetation ||= {};
      this.layout.erase ||= [];
      this.dirty = true;
      this._sync();
      this._status('Импортировано. Не забудьте «Сохранить».');
    } catch (e) {
      this._status('Импорт отклонён: ' + e.message);
    }
  }

  fitAll(whole = false) {
    this.yaw = 0;
    this.pitch = whole ? -1.2 : -0.9;
    if (whole) this.cam.position.set(0, 1250, 520); else this.cam.position.set(-330, 330, 260);
    this._applyCam();
  }

  _remember(rec) {
    if (rec.added) rec.built = JSON.stringify(this._paramsOf(this._added(rec.id)));
  }

  _paramsOf(a) {
    if (!a) return null;
    const { x, z, rot, s, dy, ...rest } = a;
    void x; void z; void rot; void dy;
    // Scale changes geometry only for scalable types; otherwise it is a live transform.
    return PLACEABLES[a.type]?.scalable ? { ...rest, s } : rest;
  }

  /** Build (or rebuild) a placed object from its record. */
  _buildAdded(a) {
    const old = this.W.groups.get(a.id);
    if (old) this._dispose(old);
    const rec = buildPlacement(this.W, a);
    this.W.buildGroupObject(rec);
    this._remember(rec);
    this._applyObject(rec);
    return rec;
  }

  _dispose(rec) {
    if (rec.object) {
      this.g.scene.remove(rec.object);
      rec.object.traverse((o) => o.geometry?.dispose());
    }
    this.W.groups.delete(rec.id);
  }

  /** Make the scene match the layout (after undo / redo). */
  _sync() {
    for (const rec of [...this.W.groups.values()]) {
      if (rec === this.ghost) continue;
      if (rec.added) {
        const a = this._added(rec.id);
        if (!a) this._dispose(rec);
        else if (JSON.stringify(this._paramsOf(a)) !== rec.built) this._buildAdded(a);
        else this._applyObject(rec);
      } else this._applyObject(rec);
    }
    for (const a of this.layout.added) if (!this.W.groups.has(a.id)) this._buildAdded(a);
    this._applyAllVeg();
    this._layersPane();
    if (this.sel && !this.W.groups.has(this.sel.id)) this.select(null);
    else this.select(this.sel ? this.W.groups.get(this.sel.id) : null);
    this._refreshList();
  }

  _snapshot() {
    this._stash();
    this.history.push(JSON.stringify(this.layout));
    if (this.history.length > 200) this.history.shift();
    this.future.length = 0;
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(JSON.stringify(this.layout));
    this.layout = JSON.parse(this.history.pop());
    this.dirty = true;
    this._sync();
    this._status('Отменено');
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(JSON.stringify(this.layout));
    this.layout = JSON.parse(this.future.pop());
    this.dirty = true;
    this._sync();
    this._status('Повторено');
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  select(rec, add = false) {
    if (add && rec && this.sel) {
      // Shift+click: add / remove from the multi-selection.
      if (rec === this.sel) return;
      if (this.multi.has(rec)) this.multi.delete(rec); else this.multi.add(rec);
      this._markMulti();
      this._status(`Выбрано объектов: ${this.multi.size + 1}. Перетаскивание, поворот и Del действуют на все.`);
      return;
    }
    this.multi.clear();
    this._markMulti();
    if (this.sel && (this.sel.veg || this.sel.marker) && this.sel !== rec) this._vegDrop(this.sel);
    if (rec?.veg || rec?.marker) this._vegProxy(rec);
    this.sel = rec;
    this.box.visible = !!rec?.object;
    if (rec?.object) this.box.setFromObject(rec.object, true);
    if (rec?.object && !rec.deleted) this.gizmo.attach(rec.object); else this.gizmo.detach();
    this._inspector();
    this._refreshList(true);
  }

  focus(rec) {
    if (!rec) return;
    const T = this.place(rec);
    const y = this.W.heightAt(T.x, T.z);
    this.yaw = 0;
    this.pitch = -0.6;
    this.cam.position.set(T.x, y + 18, T.z + 22);
    this._applyCam();
  }

  remove(rec = this.sel) {
    if (!rec) return;
    if (rec === this.sel && this.multi.size) {
      const more = [...this.multi];
      this.multi.clear();
      this._markMulti();
      for (const r of more) this.remove(r);
    }
    if (rec.marker) return this._status('Точки NPC, заданий и лагерей удалять нельзя: на них держатся расписания и квесты. Их можно двигать; «Вернуть как было» — в инспекторе.');
    if (rec.veg) {
      this._snapshot();
      this.layout.vegetation[rec.veg.id] = { ...(this.layout.vegetation[rec.veg.id] || {}), deleted: true };
      this._applyVeg(rec);
    } else if (rec.added) {
      this._snapshot();
      this.layout.added = this.layout.added.filter((a) => a.id !== rec.id);
      this._dispose(rec);
    } else {
      if (rec.hasLogic && !window.confirm(`«${rec.label}» содержит места NPC, квестов или интерактивные объекты. Удалить всё равно? (Можно вернуть в списке «На карте».)`)) return;
      this._snapshot();
      this.layout.overrides[rec.id] = { ...(this.layout.overrides[rec.id] || {}), deleted: true };
      this._applyObject(rec);
    }
    this.dirty = true;
    this.select(null);
    this._refreshList();
    this._status('Удалено. Ctrl+Z — отменить.');
  }

  restore(rec = this.sel) {
    if (rec?.marker) {
      this._snapshot();
      delete this.layout[rec.marker.kind + 's'][rec.marker.key];
      this._applyMarker(rec);
      this.dirty = true;
      this._inspector();
      return;
    }
    if (rec?.veg) {
      this._snapshot();
      const o = this.layout.vegetation[rec.veg.id];
      if (o) { delete o.deleted; if (!Object.keys(o).length) delete this.layout.vegetation[rec.veg.id]; }
      else this.layout.vegetation[rec.veg.id] = { x: rec.veg.x, z: rec.veg.z }; // stands against an eraser circle
      this._applyVeg(rec);
      this.dirty = true;
      this._inspector();
      return;
    }
    if (!rec || rec.added) return;
    this._snapshot();
    const o = this.layout.overrides[rec.id];
    if (o?.deleted && Object.keys(o).length > 1) delete o.deleted; // keep the earlier move
    else delete this.layout.overrides[rec.id];
    this.dirty = true;
    if (!rec.object) {
      this._status('Объект был удалён до запуска редактора: он появится после сохранения и перезапуска.');
    } else this._applyObject(rec);
    this._refreshList();
    this._inspector();
  }

  duplicate(rec = this.sel) {
    if (!rec?.added) return this._status('Копировать можно только объекты, поставленные в редакторе.');
    this._snapshot();
    const a = { ...this._added(rec.id), id: newId() };
    a.x += 3; a.z += 3;
    this.layout.added.push(a);
    const r = this._buildAdded(a);
    this.dirty = true;
    this.select(r);
    this._refreshList();
  }

  transform(fn, snapshot = true) {
    if (!this.sel || this.sel.deleted) return;
    if (snapshot) this._snapshot();
    const T = this.place(this.sel);
    const T0 = { ...T };
    fn(T);
    this._setPlace(this.sel, T);
    // The rest of a multi-selection moves / turns by the same amount.
    for (const r of this.multi) {
      const U = this.place(r);
      U.x += T.x - T0.x; U.z += T.z - T0.z; U.dy += T.dy - T0.dy; U.rot += T.rot - T0.rot;
      this._setPlace(r, U);
    }
    this._markMulti();
    this._inspector(true);
  }

  _markMulti() {
    for (const h of this.multiBoxes || []) this.g.scene.remove(h);
    this.multiBoxes = [...this.multi].filter((r) => r.object).map((r) => {
      const h = new THREE.BoxHelper(r.object, 0x6ad2ff);
      this.g.scene.add(h);
      return h;
    });
  }

  // ---------------------------------------------------------------------------
  // Gizmo (three TransformControls): move / turn / scale with the mouse
  // ---------------------------------------------------------------------------
  _initGizmo() {
    const tc = new TransformControls(this.cam, this.g.renderer.domElement);
    tc.setSize(0.9);
    this.gizmo = tc;
    this.g.scene.add(tc.getHelper());
    this.gizmoMode = 'translate';
    tc.addEventListener('mouseDown', () => {
      this._snapshot();
      this._gStart = this.sel ? this.place(this.sel) : null;
      this._gMoved = false;
    });
    tc.addEventListener('objectChange', () => this._fromGizmo());
    tc.addEventListener('mouseUp', () => {
      if (!this._gMoved) this.history.pop();
      this._gStart = null;
      if (this.sel) this._applyObject(this.sel);
    });
  }

  setGizmoMode(m) {
    this.gizmoMode = m;
    this.gizmo.setMode(m);
    // Turning is around the vertical axis only (the layout stores a yaw).
    this.gizmo.showX = this.gizmo.showZ = m !== 'rotate';
    this.gizmo.showY = m !== 'scale' || true;
    this.gizmo.setRotationSnap(this.rotSnap ? this.rotSnap * DEG : null);
    this.gizmo.setTranslationSnap(this.snap && m === 'translate' ? 0.5 : null);
    this._topState();
  }

  /** Gizmo moved the object: read its matrix back into the layout (builder space). */
  _fromGizmo() {
    const rec = this.sel, o = rec?.object, T0 = this._gStart;
    if (!rec || !o || !T0) return;
    o.updateMatrix();
    _m.copy(o.matrix);
    if (rec.parent?.object) _m.premultiply(pivotMatrix(rec.parent.pivot));
    _m.decompose(_v, _q, _s);
    _e.setFromQuaternion(_q, 'YXZ');
    const T = this.place(rec);
    const fine = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.gizmoMode === 'rotate') {
      let d = _e.y - T0.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      T.rot = T0.rot + (fine ? d * 0.2 : d);
    } else if (this.gizmoMode === 'scale') {
      T.s = THREE.MathUtils.clamp(_s.x, 0.2, 5);
    } else {
      T.x = _v.x; T.z = _v.z;
      if (this.gizmo.axis && this.gizmo.axis.includes('Y')) T.dy = +(_v.y - this.W.heightAt(_v.x, _v.z)).toFixed(2);
    }
    this._gMoved = true;
    this.transform((X) => Object.assign(X, T), false);
  }

  arm(tool) {
    this.tool = tool;
    if (this.ghost) { this._dispose(this.ghost); this.ghost = null; }
    for (const b of this.ui.querySelectorAll('.ed-item.on')) b.classList.remove('on');
    if (tool) {
      this.ui.querySelector(`[data-tool="${tool.type === 'kit' ? 'kit:' + tool.name : tool.type}"]`)?.classList.add('on');
      this._status(`Ставим: ${tool.type === 'kit' ? tool.name : PLACEABLES[tool.type].label}. ЛКМ — поставить, R — повернуть, Esc / ПКМ-клик — закончить.`);
      this.select(null);
    }
  }

  _ghostAt(p) {
    if (!this.tool) return;
    const t = this.tool;
    if (!this.ghost || this.ghost.toolKey !== JSON.stringify(t)) {
      if (this.ghost) this._dispose(this.ghost);
      const a = { id: '__ghost', type: t.type, x: p.x, z: p.z, rot: this.ghostRot || 0, s: 1, dy: 0, ...JSON.parse(JSON.stringify(PLACEABLES[t.type].defaults)) };
      if (t.type === 'kit') a.name = t.name;
      this.ghostData = a;
      this.ghost = buildPlacement(this.W, a);
      this.W.buildGroupObject(this.ghost);
      this.ghost.toolKey = JSON.stringify(t);
      this.ghost.object.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    }
    const a = this.ghostData;
    a.x = this._snapV(p.x); a.z = this._snapV(p.z); a.rot = this.ghostRot || 0;
    const o = this.ghost.object;
    o.position.set(a.x, this.W.heightAt(a.x, a.z), a.z);
    o.rotation.y = a.rot;
    o.updateMatrixWorld(true);
  }

  _placeGhost() {
    if (!this.ghost) return;
    this._snapshot();
    const a = { ...this.ghostData, id: newId() };
    this.layout.added.push(a);
    this._dispose(this.ghost);
    this.ghost = null;
    this._buildAdded(a);
    this.dirty = true;
    this._refreshList();
    this._status(`Поставлено: ${placeableLabel(a)}. Можно ставить ещё; Esc — закончить.`);
  }

  _snapV(v) {
    return this.snap ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100;
  }

  async save() {
    const v = validateLayout(this.layout);
    if (!v.ok) return this._status('Сохранение отклонено: ' + v.errors.slice(0, 2).join('; '));
    this._status('Сохраняю…');
    try {
      const r = await fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.layout) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || r.status);
      this.dirty = false;
      this._status('Сохранено в public/data/placements.json. Коллизии, места NPC и свет пересоберутся при следующем запуске игры.');
    } catch (e) {
      this._status('Не удалось сохранить: ' + e.message + ' (редактор сохраняет только при запущенном npm run dev)');
    }
  }

  play() {
    if (this.dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
    this.dirty = false;
    location.search = '';
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  _bindInput() {
    const el = this.g.renderer.domElement;
    const typing = () => document.activeElement?.matches?.('input, select, textarea');
    window.addEventListener('keydown', (e) => {
      if (typing()) return;
      this.keys.add(e.code);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(); }
      else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.redo(); }
      else if (ctrl && e.code === 'KeyD') { e.preventDefault(); this.duplicate(); }
      else if (e.code === 'Delete' || e.code === 'Backspace') this.remove();
      else if (e.code === 'Escape') { if (this.eraser) this.setEraser(false); else if (this.tool) this.arm(null); else this.select(null); }
      else if (e.code === 'KeyR') {
        const step = (e.altKey ? 1 : this.rotSnap || 15) * DEG * (e.shiftKey ? -1 : 1);
        if (this.tool) { this.ghostRot = (this.ghostRot || 0) + step; if (this.ghost) this._ghostAt(this.ghostData); }
        else this.transform((T) => { T.rot += step; });
      } else if (e.code === 'KeyF') { if (this.sel) this.focus(this.sel); else this.fitAll(e.shiftKey); }
      else if (e.code === 'Digit1') this.setGizmoMode('translate');
      else if (e.code === 'Digit2') this.setGizmoMode('rotate');
      else if (e.code === 'Digit3') this.setGizmoMode('scale');
      else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const step = (e.shiftKey ? 0.1 : ctrl ? 15 : 1) * DEG * (e.code === 'BracketLeft' ? 1 : -1);
        this.transform((T) => { T.rot += step; });
      } else if (e.code.startsWith('Arrow') && this.sel) {
        e.preventDefault();
        const k = e.shiftKey ? 1 : 0.1;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const [a, b] = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.code];
        this.transform((T) => { T.x += (fx * a - fz * b) * k; T.z += (fz * a + fx * b) * k; });
      }
      else if (e.code === 'KeyG') { this.snap = !this.snap; this._topState(); }
      else if (e.code === 'PageUp') this.transform((T) => { T.dy += e.shiftKey ? 1 : 0.1; });
      else if (e.code === 'PageDown') this.transform((T) => { T.dy -= e.shiftKey ? 1 : 0.1; });
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') this._scale(1.05);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this._scale(1 / 1.05);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('beforeunload', (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.look = { x: e.clientX, y: e.clientY, moved: false }; return; }
      if (e.button !== 0) return;
      if (this.gizmo.dragging || this.gizmo.axis !== null) return; // the gizmo has it
      if (this.eraser) {
        const p = this._groundHit(this._mouseNdc(e), new THREE.Vector3());
        if (p) { this._snapshot(); this.erasing = true; this._eraseAt(p); }
        return;
      }
      if (this.tool) { this._placeGhost(); return; }
      const rec = this._pick(e);
      if (this.copyRot) {
        // «Поворот как у…»: take the rotation of the clicked object (or parallel to it, ±90°).
        this.copyRot = false;
        if (rec && this.sel && rec !== this.sel) {
          const r = this.place(rec).rot, cur = this.place(this.sel).rot;
          const k = Math.round((cur - r) / (Math.PI / 2));
          this.transform((T) => { T.rot = r + (this.copyRot90 ? k * Math.PI / 2 : 0); });
          this._status('Поворот взят у «' + rec.label + '».');
        }
        return;
      }
      if (e.shiftKey && rec) { this.select(rec, true); return; }
      if (rec && rec === this.sel) {
        const p = this._groundHit(this._mouseNdc(e), new THREE.Vector3());
        if (p) {
          const T = this.place(rec);
          this._snapshot();
          this.drag = { dx: T.x - p.x, dz: T.z - p.z, moved: false };
        }
      } else this.select(rec);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.look) {
        this.yaw -= e.movementX * 0.004;
        this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.004, -1.55, 1.2);
        this.look.moved = true;
        this._applyCam();
        return;
      }
      if (e.target !== el) return;
      const p = this._groundHit(this._mouseNdc(e), new THREE.Vector3());
      if (!p) return;
      if (this.eraser) {
        this.eraserRing.visible = true;
        this.eraserRing.position.set(p.x, this.W.heightAt(p.x, p.z) + 0.3, p.z);
        this.eraserRing.scale.setScalar(this.eraseR);
        if (this.erasing) this._eraseAt(p);
        return;
      }
      if (this.tool) this._ghostAt(p);
      else if (this.drag && this.sel) {
        const nx = this._snapV(p.x + this.drag.dx), nz = this._snapV(p.z + this.drag.dz);
        this.transform((T) => { T.x = nx; T.z = nz; }, false);
        this.drag.moved = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 && this.look) {
        if (!this.look.moved && this.tool) this.arm(null);
        this.look = null;
      }
      if (e.button === 0 && this.erasing) this.erasing = false;
      if (e.button === 0 && this.drag) {
        if (!this.drag.moved) this.history.pop(); // a click on the selection is not an edit
        this.drag = null;
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const ground = this.W.heightAt(this.cam.position.x, this.cam.position.z);
      const k = THREE.MathUtils.clamp((this.cam.position.y - ground) * 0.08, 0.6, 12);
      _f.set(0, 0, -1).applyQuaternion(this.cam.quaternion);
      this.cam.position.addScaledVector(_f, -Math.sign(e.deltaY) * k * 2.5);
      this.cam.position.y = Math.max(this.cam.position.y, this.W.heightAt(this.cam.position.x, this.cam.position.z) + 1.5);
      this.cam.updateMatrixWorld();
    }, { passive: false });
  }

  _scale(k) {
    if (!this.sel) return;
    if (this.sel.added && !PLACEABLES[this._added(this.sel.id)?.type]?.scalable) return this._status('У этого объекта нет масштаба.');
    this.transform((T) => { T.s = THREE.MathUtils.clamp(T.s * k, 0.2, 5); });
    if (this.sel.added) this._buildAdded(this._added(this.sel.id));
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  _buildUI() {
    const ui = document.createElement('div');
    ui.id = 'editor';
    ui.innerHTML = `
      <div class="ed-top">
        <b>Редактор карты</b>
        <button data-act="save" title="Ctrl+S">Сохранить</button>
        <button data-act="undo" title="Ctrl+Z">Отменить</button>
        <button data-act="redo" title="Ctrl+Y">Повторить</button>
        <button data-act="snap" title="G">Сетка 0.5 м</button>
        <button data-act="g-translate" title="1">Двигать</button>
        <button data-act="g-rotate" title="2">Вращать</button>
        <button data-act="g-scale" title="3">Масштаб</button>
        <select data-act="rsnap" title="Шаг поворота (кольцо, R)"><option value="0">Поворот: свободно</option><option value="1">шаг 1°</option><option value="5">шаг 5°</option><option value="15">шаг 15°</option><option value="45">шаг 45°</option><option value="90">шаг 90°</option></select>
        <button data-act="fitall" title="Shift+F: вся карта">Вся карта</button>
        <button data-act="export" title="Скачать черновик JSON">Экспорт</button>
        <button data-act="import" title="Загрузить черновик JSON">Импорт</button>
        <input type="file" accept="application/json,.json" data-import hidden>
        <button data-act="play" class="ed-play">Играть ▶</button>
        <span class="ed-status"></span>
      </div>
      <div class="ed-left">
        <div class="ed-tabs"><button data-tab="add" class="on">Добавить</button><button data-tab="list">На карте</button><button data-tab="layers">Слои</button></div>
        <div class="ed-pane" data-pane="add"></div>
        <div class="ed-pane" data-pane="list" hidden><input class="ed-search" data-search="list" placeholder="Поиск: дом, дуб, tree:Pine, id…"><div class="ed-list"></div></div>
        <div class="ed-pane" data-pane="layers" hidden></div>
      </div>
      <div class="ed-right" hidden></div>
      <div class="ed-help">ПКМ + мышь — осмотр · WASD — полёт · E/Q — выше/ниже · Shift — быстрее · колесо — ближе/дальше ·
        ЛКМ — выбрать (Alt+ЛКМ — часть: дверь, бочка, одна улица, участок стены; Shift+ЛКМ — добавить к выбору) ·
        тащить выбранное — переместить · 1/2/3 — стрелки: двигать / вращать (кольцо, Shift — точно) / масштаб ·
        [ ] — поворот 1° (Shift — 0,1°, Ctrl — 15°) · R — поворот на шаг · стрелки — сдвиг 0,1 м (Shift — 1 м) ·
        PgUp/PgDn — высота · +/− — масштаб · Del — удалить · Ctrl+D — копия · F — показать · Ctrl+Z — отмена</div>`;
    document.body.appendChild(ui);
    this.ui = ui;
    ui.querySelector('.ed-top').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act;
      if (a === 'save') this.save();
      else if (a === 'undo') this.undo();
      else if (a === 'redo') this.redo();
      else if (a === 'snap') { this.snap = !this.snap; this.setGizmoMode(this.gizmoMode); }
      else if (a === 'play') this.play();
      else if (a === 'fitall') this.fitAll(true);
      else if (a === 'export') this.exportLayout();
      else if (a === 'import') ui.querySelector('[data-import]').click();
      else if (a?.startsWith('g-')) this.setGizmoMode(a.slice(2));
    });
    ui.querySelector('[data-import]').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.importLayout(f); });
    ui.querySelector('[data-pane="layers"]').addEventListener('change', (e) => {
      const row = e.target.closest('[data-layer]');
      if (!row) return;
      if (e.target.matches('[data-lv]')) this._setLayer(row.dataset.layer, 'visible', e.target.checked);
      else if (e.target.matches('[data-ll]')) this._setLayer(row.dataset.layer, 'locked', e.target.checked);
    });
    ui.querySelector('[data-pane="layers"]').addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (act === 'checkhouses') { this._check = checkAxelLayout(this.layout.overrides); this._layersPane(); return; }
      const row = e.target.closest('[data-gid]');
      if (row) {
        const rec = this.W.groups.get(row.dataset.gid);
        if (rec) { this.arm(null); this.select(rec); this.focus(rec); }
        return;
      }
      if (act !== 'eraseclear') return;
      this._snapshot(); this.layout.erase.length = 0; this.dirty = true; this._applyAllVeg(); this._layersPane();
    });
    ui.querySelector('[data-act="rsnap"]').addEventListener('change', (e) => { this.rotSnap = +e.target.value; this.setGizmoMode(this.gizmoMode); e.target.blur(); });
    for (const b of ui.querySelectorAll('.ed-tabs button')) {
      b.addEventListener('click', () => {
        for (const x of ui.querySelectorAll('.ed-tabs button')) x.classList.toggle('on', x === b);
        for (const p of ui.querySelectorAll('.ed-pane')) p.hidden = p.dataset.pane !== b.dataset.tab;
        if (b.dataset.tab === 'list') this._refreshList();
      });
    }
    // Palette.
    const add = ui.querySelector('[data-pane="add"]');
    const cats = {};
    for (const [type, P] of Object.entries(PLACEABLES)) if (type !== 'kit') (cats[P.cat] ||= []).push([type, P]);
    let html = `<div class="ed-cat">Инструменты</div><div class="ed-grid"><button class="ed-item" data-act="eraser">Ластик растительности</button></div><label class="ed-note">Радиус ластика, м<input type="number" min="1" max="60" step="1" value="${this.eraseR}" data-eraser-r></label>`;
    for (const [cat, items] of Object.entries(cats)) {
      html += `<div class="ed-cat">${cat}</div><div class="ed-grid">` + items.map(([t, P]) => `<button class="ed-item" data-tool="${t}">${P.label}</button>`).join('') + '</div>';
    }
    html += `<div class="ed-cat">Модели Kenney</div><input class="ed-search" data-search="kit" placeholder="Поиск: house, tree, barrel, grave…"><div class="ed-kits"></div>`;
    add.innerHTML = html;
    add.querySelector('[data-eraser-r]').addEventListener('change', (e) => { this.eraseR = Math.max(1, Math.min(60, +e.target.value || 6)); });
    add.addEventListener('click', (e) => {
      const b = e.target.closest('.ed-item');
      if (!b) return;
      if (b.dataset.act === 'eraser') return this.setEraser(!this.eraser);
      const t = b.dataset.tool;
      if (this.tool && (this.tool.type === t || 'kit:' + this.tool.name === t)) return this.arm(null);
      this.arm(t.startsWith('kit:') ? { type: 'kit', name: t.slice(4) } : { type: t });
    });
    const kitSearch = add.querySelector('[data-search="kit"]');
    const allKits = [...this.W.kits.pieces.keys()].sort();
    const renderKits = () => {
      const q = kitSearch.value.trim().toLowerCase();
      const list = allKits.filter((n) => !q || n.toLowerCase().includes(q)).slice(0, 160);
      add.querySelector('.ed-kits').innerHTML = list.map((n) => `<button class="ed-item ed-kit" data-tool="kit:${n}">${n}</button>`).join('') + (list.length === 160 ? '<div class="ed-more">…уточните поиск</div>' : '');
    };
    kitSearch.addEventListener('input', renderKits);
    renderKits();
    ui.querySelector('[data-search="list"]').addEventListener('input', () => this._refreshList());
    ui.querySelector('.ed-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const mk = row.dataset.id.match(/^(spot|camp):(.+)$/);
      const rec = mk ? this._markerWrap(this.markers.find((m) => m.kind === mk[1] && m.key === mk[2])) : row.dataset.id.startsWith('veg:') ? this._vegWrap(this.W.veg.find((r) => r.id === row.dataset.id.slice(4))) : this.W.groups.get(row.dataset.id);
      if (!rec) return;
      if (e.target.dataset.act === 'restore') return this.restore(rec);
      this.arm(null);
      this.select(rec);
      this.focus(rec);
    });
    this._topState();
    this._layersPane();
  }

  _topState() {
    for (const m of ['translate', 'rotate', 'scale']) this.ui.querySelector(`[data-act="g-${m}"]`)?.classList.toggle('on', this.gizmoMode === m);
    const b = this.ui.querySelector('[data-act="snap"]');
    b.textContent = this.snap ? 'Сетка 0.5 м: вкл' : 'Сетка: выкл';
    b.classList.toggle('on', this.snap);
  }

  _status(t) {
    this.ui.querySelector('.ed-status').textContent = t;
  }

  _refreshList(onlyMarks = false) {
    const box = this.ui.querySelector('.ed-list');
    if (!box) return;
    if (onlyMarks && box.childElementCount) {
      for (const r of box.children) r.classList.toggle('on', r.dataset.id === this.sel?.id);
      return;
    }
    const q = this.ui.querySelector('[data-search="list"]').value.trim().toLowerCase();
    const rows = [];
    for (const rec of this.W.groups.values()) {
      if (rec === this.ghost) continue;
      const del = !rec.added && this.layout.overrides[rec.id]?.deleted;
      const moved = !rec.added && this.layout.overrides[rec.id] && !del;
      if (q && !(rec.label + ' ' + rec.id).toLowerCase().includes(q)) continue;
      rows.push(`<div class="ed-row${rec === this.sel ? ' on' : ''}${del ? ' del' : ''}" data-id="${rec.id}">
        <span>${esc(rec.label)}</span><small>${rec.added ? 'новый' : del ? 'удалён' : moved ? 'изменён' : ''}</small>
        ${del ? '<button data-act="restore">вернуть</button>' : ''}</div>`);
    }
    if (q.length >= 2) {
      let n = 0;
      for (const m of this.markers) {
        if (n >= 60) break;
        const id = m.kind + ':' + m.key;
        if (!(m.label + ' ' + id).toLowerCase().includes(q)) continue;
        const ov = this.layout[m.kind + 's'][m.key];
        n++;
        rows.push(`<div class="ed-row${this.sel?.id === id ? ' on' : ''}" data-id="${esc(id)}"><span>${esc(m.label)}</span><small>${ov ? 'изменена' : ''}</small></div>`);
      }
      for (const r of this.W.veg) {
        if (n >= 150) { rows.push('<div class="ed-more">…уточните поиск (растений много)</div>'); break; }
        if (!(r.label + ' ' + r.id).toLowerCase().includes(q)) continue;
        const del = this._vegDeleted(r), moved = !!this.layout.vegetation[r.id] && !del;
        n++;
        rows.push(`<div class="ed-row${del ? ' del' : ''}${this.sel?.veg === r ? ' on' : ''}" data-id="veg:${esc(r.id)}"><span>${esc(r.label)} · ${esc(r.id)}</span><small>${del ? 'удалён' : moved ? 'изменён' : ''}</small>${del ? '<button data-act="restore">вернуть</button>' : ''}</div>`);
      }
    }
    box.innerHTML = rows.join('') || '<div class="ed-more">Ничего не найдено</div>';
  }

  _inspector(valuesOnly = false) {
    const box = this.ui.querySelector('.ed-right');
    const rec = this.sel;
    if (!rec) { box.hidden = true; return; }
    box.hidden = false;
    const T = this.place(rec);
    if (valuesOnly && box.dataset.id === rec.id) {
      for (const [k, v] of Object.entries({ x: T.x, z: T.z, dy: T.dy, rot: Math.round(wrapDeg(T.rot / DEG) * 10) / 10, s: T.s })) {
        const inp = box.querySelector(`[data-f="${k}"]`);
        if (inp && document.activeElement !== inp) inp.value = typeof v === 'number' ? +v.toFixed(2) : v;
      }
      return;
    }
    box.dataset.id = rec.id;
    const a = rec.added ? this._added(rec.id) : null;
    const scalable = !rec.marker && (!a || PLACEABLES[a.type]?.scalable);
    const num = (f, label, v, step) => `<label>${label}<input type="number" data-f="${f}" step="${step}" value="${+(+v).toFixed(2)}"></label>`;
    let params = '';
    if (a?.type === 'house') {
      params = num('p:w', 'Ширина, м', a.w, 0.5) + num('p:d', 'Глубина, м', a.d, 0.5) + num('p:floors', 'Этажей', a.floors, 1)
        + sel('p:roof', 'Крыша', a.roof, Object.keys(ROOF_COLORS), { red: 'красная', blue: 'синяя', green: 'зелёная', brown: 'коричневая', slate: 'серая', purple: 'фиолетовая', straw: 'соломенная' })
        + sel('p:style', 'Низ стен', a.style, ['plaster', 'brick'], { plaster: 'штукатурка', brick: 'камень' });
    } else if (a?.type === 'stall') {
      params = sel('p:color', 'Навес', a.color, Object.keys(STALL_COLORS), { red: 'красный', green: 'зелёный' })
        + sel('p:goods', 'Товар', a.goods, ['fruit', 'veg', 'bread', 'mixed'], { fruit: 'фрукты', veg: 'овощи', bread: 'хлеб', mixed: 'разное' });
    } else if (a?.type === 'fence') params = num('p:len', 'Длина, м', a.len, 0.5);
    else if (a?.type === 'kit') params = `<div class="ed-note">${esc(a.name)}</div><label class="ed-check"><input type="checkbox" data-f="p:collide" ${a.collide === false ? '' : 'checked'}> Твёрдый (коллизия)</label>`;
    const overridden = rec.marker ? this.layout[rec.marker.kind + 's'][rec.marker.key] : rec.veg ? this.layout.vegetation[rec.veg.id] : !rec.added && this.layout.overrides[rec.id];
    box.innerHTML = `
      <div class="ed-title">${esc(rec.label)}</div>
      <div class="ed-id">${rec.parent ? esc(rec.parent.label) + ' › ' : ''}${rec.id}${rec.hasLogic ? ' · есть места NPC / квестов' : ''}</div>
      ${num('x', 'X', T.x, 0.5)}${num('z', 'Z', T.z, 0.5)}${num('dy', 'Высота над землёй', T.dy, 0.1)}
      ${num('rot', 'Поворот, °', Math.round(wrapDeg(T.rot / DEG) * 10) / 10, 0.1)}${scalable ? num('s', 'Масштаб', T.s, 0.05) : ''}
      ${params}
      <div class="ed-btns">
        <button data-act="focus">Показать (F)</button>
        <button data-act="copyrot" title="Щёлкните другой объект — поворот станет как у него">Поворот как у…</button>
        <button data-act="copyrot90" title="Как у другого объекта, с точностью до 90°">Параллельно…</button>
        <button data-act="rot90">Ровно по 90°</button>
        ${rec.parent ? '<button data-act="parent">Выбрать целиком</button>' : ''}
        ${rec.added ? '<button data-act="dup">Копия (Ctrl+D)</button>' : ''}
        ${overridden ? '<button data-act="restore">Вернуть как было</button>' : ''}
        <button data-act="del" class="ed-danger">Удалить (Del)</button>
      </div>
      ${rec.marker ? '<div class="ed-note">' + (rec.marker.kind === 'spot' ? 'Именованная точка: по ней ходят NPC и ведут квесты. Поворот — куда смотрит NPC.' : 'Точка появления врага. Лагерь двигается по одной точке.') + ' Применится после «Сохранить» и перезапуска.</div>' : rec.veg ? '<div class="ed-note">Растение карты (устойчивый id). Изменения применятся после «Сохранить» и перезапуска; Del — убрать, «вернуть» — в списке.</div>' : rec.added ? '' : '<div class="ed-note">Встроенное место. После сохранения NPC, квестовые точки, свет и коллизии сдвинутся вместе с ним.</div>'}`;
    box.onchange = (e) => this._field(e.target);
    box.onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === 'focus') this.focus(rec);
      else if (act === 'copyrot' || act === 'copyrot90') { this.copyRot = true; this.copyRot90 = act === 'copyrot90'; this._status('Щёлкните объект, чей поворот взять.'); }
      else if (act === 'rot90') this.transform((T) => { T.rot = Math.round(T.rot / (Math.PI / 2)) * (Math.PI / 2); });
      else if (act === 'parent') this.select(rec.parent);
      else if (act === 'dup') this.duplicate(rec);
      else if (act === 'restore') this.restore(rec);
      else if (act === 'del') this.remove(rec);
    };
  }

  _field(inp) {
    const f = inp.dataset.f;
    if (!f || !this.sel) return;
    const rec = this.sel;
    if (f.startsWith('p:')) {
      const a = this._added(rec.id);
      if (!a) return;
      this._snapshot();
      const k = f.slice(2);
      a[k] = inp.type === 'checkbox' ? (inp.checked ? 'box' : false) : inp.type === 'number' ? Math.max(k === 'floors' ? 1 : 0.5, +inp.value) : inp.value;
      if (k === 'floors') a[k] = Math.min(4, Math.round(a[k]));
      this.dirty = true;
      this.select(this._buildAdded(a));
      return;
    }
    const v = +inp.value;
    if (!Number.isFinite(v)) return;
    this.transform((T) => {
      if (f === 'rot') T.rot = v * DEG;
      else if (f === 's') T.s = THREE.MathUtils.clamp(v, 0.2, 5);
      else T[f] = v;
    });
    if (f === 's' && rec.added) this.select(this._buildAdded(this._added(rec.id)));
  }
}

function sel(f, label, value, options, names) {
  return `<label>${label}<select data-f="${f}">${options.map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${names[o] || o}</option>`).join('')}</select></label>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function newId() {
  return 'p_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}
