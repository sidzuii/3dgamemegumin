import * as THREE from 'three';
import { Shockwave } from '../../vfx/ExplosionEffects.js';
import { clamp, smoothstep } from '../../core/math.js';
import { Ribbon, WetDecal, GroundFlash, waterMaterial, waterSphereGeometry } from './Water.js';

/**
 * Roxy's water: the loop of the Whip, the sign of the counter window, the five arrows of the Volley and the
 * mass of the Tidal Collapse. Every drawing follows the action's own clock from the combat core, so a splash never
 * appears before a hit (docs/combat/05 §1). Water stays transparent: a silver edge, a dark unlit side,
 * thickness that varies along the flow, drops that fall back; impacts get a short asymmetric crown and a wet mark.
 */
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _pts = Array.from({ length: 25 }, () => ({ x: 0, y: 0, z: 0 }));
const _wid = new Array(25).fill(0);
const _fade = new Array(25).fill(1);
const WATER_SPLASH_COLOR = [0.5, 1.1, 1.8];

export class WaterFX {
  constructor(game, fx) {
    this.game = game;
    this.fx = fx;
    this.ribbon = new Ribbon(game.scene, 24);
    this.whip = null;
    this.mat = waterMaterial();
    this.orbs = []; // preparation spheres (volley / tidal / whip)
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(waterSphereGeometry(), this.mat);
      m.visible = false;
      m.renderOrder = 13;
      game.scene.add(m);
      this.orbs.push(m);
    }
    this.arrows = new Map(); // arrow uid -> { head, tail[], hist[] }
    this.arrowPool = [];
    this.tidal = [];
    this.prep = null;
    this.parryT = 0;
    this._acc = {};
  }

  // ---- action hooks ------------------------------------------------------------------------------------------
  start(hero, act) {
    const id = act.spec.id;
    if (id === 'R_Q') this.whip = { hero, act, fade: 0 };
    if (id === 'R_R' || id === 'R_F') this.prep = { hero, act };
    if (id === 'R_E') this.counter = { hero, act };
    this.game.audio?.play('charge', { vol: 0.5 });
  }

  end(id) {
    if (id === 'R_R' || id === 'R_F') this.prep = null;
    if (id === 'R_E') this.counter = null;
  }

  cancel(id) {
    if (id === 'R_R' || id === 'R_F') {
      this.prep = null;
      for (const o of this.orbs) o.visible = false;
    }
    if (id === 'R_Q') this.whip = null;
  }

  // ---- events ------------------------------------------------------------------------------------------------
  onParryWindow(hero, open, countered) {
    if (open) {
      this.parryT = 0.16;
      this.game.vfx.burst('hitSpark', this._staff(hero, _p), 3, { scale: 0.5 });
    } else if (countered) {
      /* the deflection effect is drawn by onParry */
    }
  }

  onParry(hero, hit) {
    const g = this.game;
    this._staff(hero, _p);
    g.vfx.burst('hitSpark', _p, 14);
    g.vfx.burst('waterSplash', _p, 10, { scale: 0.6 });
    g.worldUI?.text?.(g.player.slots[hero].controller.position, 'Отвод!');
  }

  onArrow(ev) {
    const a = this.arrowPool.pop() || this._makeArrow();
    a.uid = ev.arrow.uid;
    a.hist.length = 0;
    a.head.visible = true;
    for (const t of a.tail) t.visible = true;
    this.arrows.set(ev.arrow.uid, a);
    this.game.vfx.burst('waterSplash', ev.pos, 4, { scale: 0.45 });
    this.game.audio?.play('swing', { vol: 0.4 });
  }

  onArrowEnd(ev, hit) {
    const a = this.arrows.get(ev.arrow.uid);
    if (a) this._free(a, ev.arrow.uid);
    const g = this.game;
    // A short asymmetric crown and a drop trail instead of a round flash.
    g.vfx.burst('waterSplash', ev.pos, hit ? 22 : 10, { scale: hit ? 0.9 : 0.6 });
    if (hit) {
      g.vfx.burst('hitSpark', ev.pos, 4, { scale: 0.5 });
      g.vfx.add(new Shockwave(_p.copy(ev.pos), 1.1, 0.28, WATER_SPLASH_COLOR));
    }
  }

  onTidal(ev, hero) {
    const slot = this.game.player.slots[hero.id];
    const from = ev.from;
    this.tidal.push({
      t: 0, travel: Math.max(0.3, ev.travel), from: new THREE.Vector3(from.x, from.y, from.z),
      to: new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), mesh: this._orb(), r0: this.prepR || 0.9, radius: ev.zone.radius,
    });
    this.prep = null;
    void slot;
    this.game.audio?.play('whoosh', { vol: 0.7 });
  }

  onTidalImpact(ev) {
    const g = this.game;
    const c = new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z);
    const R = ev.radius;
    g.vfx.add(new Shockwave(c.clone(), R * 1.25, 0.55, WATER_SPLASH_COLOR));
    g.vfx.add(new Shockwave(c.clone(), R * 0.7, 0.4, [0.8, 1.4, 2.0]));
    g.vfx.add(new WetDecal(g.world, c, R * 0.95, ev.decorative ?? 4));
    g.vfx.add(new GroundFlash(g.world, c, R * 0.9, 0.35, [0.5, 1.0, 1.6], 0.08));
    // Crown: high and low drops, foam at the ground; the upper part clears quickly so the view stays free.
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, d = R * (0.55 + Math.random() * 0.45);
      _p.set(c.x + Math.cos(a) * d, c.y + 0.1, c.z + Math.sin(a) * d);
      g.vfx.emit('waterSplash', _p, { scale: 0.6 + Math.random() * 0.8 });
    }
    g.vfx.burst('splash', c, 30);
    g.vfx.burst('waterSplash', c, 36, { scale: 1.2 });
    g.audio?.play('slam', { dist: g.player.position.distanceTo(c), vol: 0.8 });
    this.fx.shake(clamp(0.45 - g.player.position.distanceTo(c) / 40, 0.08, 0.4));
  }

  // ---- per frame ---------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const sim = g.combat.sim;
    this.mat.uniforms.uTime.value = g.time;
    this.ribbon.material.uniforms.uTime.value = g.time;
    this.parryT = Math.max(0, this.parryT - dt);
    this._updateWhip(dt);
    this._updatePrep(dt);
    this._updateArrows(dt, sim);
    this._updateTidal(dt);
    this._updateCounter(dt);
  }

  _staff(hero, out) {
    this.game.player.slots[hero.id ?? hero].model.getGemWorldPosition(out);
    return out;
  }

  _orb() {
    const o = this.orbs.find((m) => !m.visible) || this.orbs[0];
    o.visible = true;
    return o;
  }

  _updateWhip(dt) {
    const w = this.whip;
    if (!w) { this.ribbon.hide(); return; }
    const { hero, act } = w;
    const s = act.spec;
    const cam = this.game.camera;
    const slot = this.game.player.slots[hero.id];
    const u = (act.t - s.startup) / s.active;
    // Preparation: a compact loop of water at the staff.
    this._staff(hero, _p);
    if (u < 0) {
      const k = clamp(act.t / s.startup, 0, 1);
      const o = this._orbFor('whip');
      o.position.copy(_p);
      o.scale.setScalar(0.05 + k * 0.1);
      this.ribbon.hide();
      return;
    }
    this._releaseOrb('whip');
    const tip = act.info.tip;
    if (!tip) return;
    const origin = _q.set(hero.pos.x, hero.pos.y + hero.h * 0.7, hero.pos.z);
    if (u >= 1) {
      w.fade += dt;
      if (w.fade > 0.22) { this.whip = null; this.ribbon.hide(); return; }
    }
    const N = this.ribbon.n;
    const fall = u >= 1 ? 1 - w.fade / 0.22 : 1;
    const lag = 0.7 * (1 - clamp(u, 0, 1) * 0.5);
    for (let i = 0; i <= N; i++) {
      const sN = i / N;
      // The root follows the sweep earlier than the tip: an arc that trails behind the tip.
      const ang = tip.ang - lag * (1 - sN);
      const r = tip.r * Math.pow(sN, 0.9);
      _pts[i].x = origin.x + Math.sin(ang) * r;
      _pts[i].z = origin.z + Math.cos(ang) * r;
      _pts[i].y = origin.y + Math.sin(sN * Math.PI) * 0.22 * (1 - u * 0.6) - sN * 0.15;
      // Variable thickness: thin at the hand, a thick belly in the last third, a ragged tip.
      const belly = Math.sin(clamp((sN - 0.2) / 0.8, 0, 1) * Math.PI);
      _wid[i] = (0.05 + 0.26 * belly * (0.75 + 0.25 * Math.sin(i * 2.7 + this.game.time * 30))) * fall;
      _fade[i] = smoothstep(0, 0.12, sN) * fall;
    }
    this.ribbon.set(_pts, _wid, cam, _fade);
    // Drops break off the tip and the thick part.
    this._rate('waterTrail', _pts[N], 90 * fall, dt);
    this._rate('waterSplash', _pts[Math.floor(N * 0.8)], 14 * fall, dt, { scale: 0.4 });
    void slot;
  }

  _orbFor(key) {
    this._owned = this._owned || {};
    if (!this._owned[key]) this._owned[key] = this._orb();
    return this._owned[key];
  }

  _releaseOrb(key) {
    if (this._owned?.[key]) {
      this._owned[key].visible = false;
      delete this._owned[key];
    }
  }

  _updatePrep(dt) {
    const p = this.prep;
    if (!p) {
      this._releaseOrb('tidalmass');
      for (let i = 0; i < 5; i++) this._releaseOrb('arrow' + i);
      return;
    }
    const { hero, act } = p;
    const s = act.spec;
    this._staff(hero, _p);
    if (s.id === 'R_R') {
      // Five small bodies gather beside the staff head without blocking the view; one leaves per arrow.
      const k = clamp(act.t / s.startup, 0, 1);
      for (let i = 0; i < 5; i++) {
        const o = this._orbFor('arrow' + i);
        if (i < act.emitted) { o.visible = false; continue; }
        o.visible = true;
        const a = this.game.time * 5 + (i * Math.PI * 2) / 5;
        const r = 0.24 * (0.4 + 0.6 * k);
        o.position.set(_p.x + Math.cos(a) * r, _p.y + 0.04 + Math.sin(a * 1.3) * 0.08, _p.z + Math.sin(a) * r);
        o.scale.setScalar(0.045 + 0.05 * k);
      }
      this._rate('waterTrail', _p, 30 * k, dt);
    } else if (s.id === 'R_F' && !act.released) {
      const k = clamp(act.t / s.release, 0, 1);
      const o = this._orbFor('tidalmass');
      const rad = 0.25 + k * 0.85;
      this.prepR = rad;
      o.position.set(_p.x, _p.y + 1.55 + rad * 0.6, _p.z);
      o.scale.set(rad, rad * (0.85 + 0.12 * Math.sin(this.game.time * 9)), rad);
      // Several streams of different thickness flow into the mass.
      this._rate('waterTrail', _q.set(_p.x + (Math.random() - 0.5) * 3, _p.y - 0.8 + Math.random() * 1.5, _p.z + (Math.random() - 0.5) * 3), 40 + 160 * k, dt);
      this._rate('waterSplash', _q.set(o.position.x, o.position.y - rad * 0.8, o.position.z), 8 * k, dt, { scale: 0.4 });
    }
  }

  _updateArrows(dt, sim) {
    const live = new Set();
    for (const pr of sim.projectiles) {
      live.add(pr.uid);
      const a = this.arrows.get(pr.uid);
      if (!a) continue;
      a.hist.unshift({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z });
      if (a.hist.length > 14) a.hist.pop();
      a.head.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
      a.head.lookAt(_p.set(pr.pos.x + pr.dir.x, pr.pos.y + pr.dir.y, pr.pos.z + pr.dir.z));
      a.head.scale.set(0.11, 0.11, 0.3); // a thickened head
      for (let i = 0; i < a.tail.length; i++) {
        const h = a.hist[Math.min(a.hist.length - 1, (i + 1) * 2)];
        const t = a.tail[i];
        if (!h) { t.visible = false; continue; }
        t.visible = true;
        // A ragged short trail: drops that drift apart sideways and fall behind.
        t.position.set(h.x + Math.sin(i * 3.1 + pr.uid) * 0.05 * i, h.y - i * 0.01, h.z + Math.cos(i * 2.3 + pr.uid) * 0.05 * i);
        t.scale.setScalar(0.075 * (1 - i / (a.tail.length + 1)));
      }
      this._rate('waterTrail', a.head.position, 140, dt);
    }
    for (const [uid, a] of this.arrows) if (!live.has(uid)) this._free(a, uid);
  }

  _makeArrow() {
    const head = new THREE.Mesh(waterSphereGeometry(), this.mat);
    head.renderOrder = 13;
    this.game.scene.add(head);
    const tail = [];
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(waterSphereGeometry(), this.mat);
      t.renderOrder = 13;
      this.game.scene.add(t);
      tail.push(t);
    }
    return { head, tail, hist: [], uid: 0 };
  }

  _free(a, uid) {
    a.head.visible = false;
    for (const t of a.tail) t.visible = false;
    this.arrows.delete(uid);
    this.arrowPool.push(a);
  }

  _updateTidal(dt) {
    for (let i = this.tidal.length - 1; i >= 0; i--) {
      const b = this.tidal[i];
      b.t += dt;
      const k = clamp(b.t / b.travel, 0, 1);
      // An arc: up first, then down onto the point; the mass flattens as it falls.
      const arc = Math.sin(k * Math.PI) * (2.5 + b.from.distanceTo(b.to) * 0.12);
      b.mesh.position.lerpVectors(b.from, b.to, smoothstep(0, 1, k)).setY(THREE.MathUtils.lerp(b.from.y + 1.5, b.to.y + 0.4, k) + arc);
      const stretch = 1 + 0.5 * k;
      const r = b.r0 * (1 - 0.15 * k);
      b.mesh.scale.set(r / Math.sqrt(stretch), r * stretch, r / Math.sqrt(stretch));
      this._rate('waterTrail', b.mesh.position, 120, dt);
      if (k >= 1) {
        b.mesh.visible = false;
        this.tidal.splice(i, 1);
      }
    }
  }

  /** The thin sign of the counter window: a short bright mark at the staff (not a shield sphere). */
  _updateCounter(dt) {
    const c = this.counter;
    if (!c) return;
    const { hero, act } = c;
    const s = act.spec;
    const [w0, w1] = s.parry_window;
    if (act.t >= w0 && act.t <= w1 + 0.04) {
      this._staff(hero, _p);
      this._rate('hitSpark', _p, 40, dt, { scale: 0.35 });
    }
    if (act.t > s.startup && act.t < s.startup + 0.12 && act.funded) {
      // The water shell around the pommel for the poke: short, only with mana.
      this._staff(hero, _p);
      this._rate('waterTrail', _p, 160, dt);
    }
  }

  _rate(type, p, rate, dt, opts) {
    const k = type + (opts ? '1' : '');
    let a = (this._acc[k] || 0) + rate * dt;
    while (a >= 1) {
      a -= 1;
      this.game.vfx.emit(type, p, opts);
    }
    this._acc[k] = a;
  }
}
