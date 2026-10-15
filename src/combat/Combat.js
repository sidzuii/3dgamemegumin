import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { Shockwave } from '../vfx/ExplosionEffects.js';
import { CombatSim } from './core/Sim.js';
import { SPEC, SLOTS, HERO_NAME, NUM } from './core/specs.js';
import { GameEnv } from './Env.js';
import { Companion } from './Companion.js';
import { CombatFX } from './fx/CombatFX.js';

/**
 * Game side of the combat system (the rules live in combat/core): feeds the core every frame with the
 * heroines' positions, facing, staff points and the camera ray; turns player input into core commands; applies
 * enemy attacks to the party (guard / dodge / counter / downing); picks targets for enemies; drives the companion
 * and the visual layer (combat/fx). Enemy telegraphs and the ground impact helper live here too.
 *
 * Keys: LMB staff · RMB guard · Q E medium skills · R F strong spells (aim, LMB confirms, RMB cancels) ·
 *       Space dodge in a fight / jump otherwise (V always dodges) · Tab other heroine · T companion order ·
 *       MMB lock on · E also revives a downed heroine (hold).
 */
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const ENGAGED = new Set(['alert', 'chase', 'windup', 'strike', 'recover', 'circle', 'stagger']);
const ORDERS = ['near', 'hold', 'retreat'];
const ORDER_TEXT = { near: 'Рокси рядом', hold: 'Держать точку', retreat: 'Отступить' };

export class Combat {
  constructor(game) {
    this.game = game;
    this.env = new GameEnv(game);
    this.sim = new CombatSim(this.env);
    for (const id of ['megumin', 'roxy']) {
      const hero = this.sim.addHero(id, {}, game.player.fighters[id]);
      hero.absent = id !== 'megumin';
    }
    this.sim.active = game.player.character;
    this.settings = { autoSwitch: true, shake: 1, flash: 1, skillsInTactics: false };
    try {
      Object.assign(this.settings, JSON.parse(localStorage.getItem('megumin-combat') || '{}'));
    } catch { /* defaults */ }
    this.telegraphs = [];
    this.inCombat = false;
    this.combatTimer = 0;
    this.order = 'near';
    this.holdPoint = new THREE.Vector3();
    this.pendingSwitch = null;
    this.reviving = null;
    this.views = {}; // per-heroine plain objects the enemies keep references to
    this.guardHeld = false;
    this.lastDenied = 0;
    this.stats = { hits: 0, misses: 0, damage: 0 };
    this.companion = new Companion(game, this);
    this.fx = new CombatFX(game, this);
    this._wire();
  }

  saveSettings() {
    try { localStorage.setItem('megumin-combat', JSON.stringify(this.settings)); } catch { /* ignore */ }
  }

  // ---- queries ---------------------------------------------------------------------------------------------
  get active() {
    return this.sim.heroes[this.sim.active];
  }
  hero(id) {
    return this.sim.heroes[id];
  }

  /** Heroines that are in the world and standing: [{ id, pos (live Vector3), alive }]. */
  livingHeroes() {
    return this._living;
  }

  targetFor(e) {
    const hs = this._living;
    if (!hs.length) return null;
    if (e._tg && e._tgUntil > this.game.time && e._tg.alive) return e._tg;
    let best = null, bs = Infinity;
    for (const h of hs) {
      const d = Math.hypot(h.pos.x - e.position.x, h.pos.z - e.position.z) * (h.id === this.sim.active ? 0.8 : 1);
      if (d < bs) { bs = d; best = h; }
    }
    e._tg = best;
    e._tgUntil = this.game.time + 0.7;
    return best;
  }

  // ---- per frame ---------------------------------------------------------------------------------------------
  /** Read the keys and send commands to the core. Runs before the player moves. */
  input(input) {
    const g = this.game;
    const p = g.player;
    const sim = this.sim;
    const id = p.character;
    const hero = sim.heroes[id];
    if (!hero || hero.absent) return;
    if (p.respawnPending) return;
    const inFight = this.inCombat || !!hero.aim || hero.state === 'action' || hero.guarding;
    this.tickAutoSwitch();

    if (input.wasPressed('Tab') && p.companionUnlocked) p.switchCharacter();
    if (input.wasPressed('Digit1') && p.companionUnlocked) p.switchCharacter('megumin');
    if (input.wasPressed('Digit2') && p.companionUnlocked) p.switchCharacter('roxy');
    if (input.wasPressed('KeyT') && p.companionUnlocked) this.cycleOrder();

    if (input.wasMousePressed(0)) sim.attack(id);
    if (input.wasMousePressed(2)) {
      if (hero.aim) sim.cancelAim(id); // RMB in aim mode cancels the selection
      else {
        sim.guard(id, true);
        this.guardHeld = true;
      }
    }
    if (this.guardHeld && !input.mouseDown.has(2)) {
      this.guardHeld = false;
      sim.guard(id, false);
    }
    if (input.wasMousePressed(1)) this.toggleLock();

    if (input.wasPressed('KeyQ')) sim.skill(id, 'Q');
    if (input.wasPressed('KeyR')) sim.skill(id, 'R');
    if (input.wasPressed('KeyF')) sim.skill(id, 'F');
    if (input.wasPressed('KeyE')) {
      // A downed ally within reach: hold E to lift her. Otherwise the interaction prompt wins out of a fight;
      // in a fight (or without a prompt) E is the second medium skill.
      const it = g.interaction;
      const prompt = !!(it?.focused && it.focused.canInteract());
      const rt = this.reviveTarget();
      if (rt) {
        this.reviving = this.reviving || { id: rt, t: 0 };
        input.pressed.delete('KeyE');
      } else if (!(prompt && !this.inCombat)) {
        input.pressed.delete('KeyE');
        sim.skill(id, 'E');
      }
    }
    if (this.reviving && !input.isDown('KeyE')) this.reviving = null;

    // Dodge: Space in a fight (jump otherwise), V always.
    let dodge = input.wasPressed('KeyV');
    if (input.wasPressed('Space') && inFight) {
      input.pressed.delete('Space');
      dodge = true;
    }
    if (dodge) {
      let ix = 0, iz = 0;
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz += 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
      g.cameraRig.getForward(_fwd);
      g.cameraRig.getRight(_right);
      _v.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
      if (_v.lengthSq() < 0.01) _v.copy(_fwd).negate(); // no direction: a step back
      sim.dodge(id, _v.x, _v.z);
    }
  }

  update(dt) {
    const g = this.game;
    const sim = this.sim;
    const p = g.player;
    this.env.refresh();
    this._sync();
    this._pendingSwitch();
    this.companion.update(dt);
    sim.active = p.character;
    sim.advance(dt);
    this._detectCombat(dt);
    this._revive(dt);
    this.fx.update(dt);
    for (let i = this.telegraphs.length - 1; i >= 0; i--) if (!this.telegraphs[i].alive) this.telegraphs.splice(i, 1);
  }

  /** Copy positions / facing / staff points / the camera ray into the core. */
  _sync() {
    const g = this.game;
    const p = g.player;
    this._living = this._living || [];
    this._living.length = 0;
    for (const id of ['megumin', 'roxy']) {
      const slot = p.slots[id];
      const hero = this.sim.heroes[id];
      hero.absent = !slot.present;
      if (hero.absent) continue;
      const c = slot.controller;
      hero.pos.x = c.position.x; hero.pos.y = c.position.y; hero.pos.z = c.position.z;
      hero.yaw = c.yaw;
      slot.model.getGemWorldPosition(_v);
      hero.staff.x = _v.x; hero.staff.y = _v.y; hero.staff.z = _v.z;
      hero.h = 1.65;
      const f = hero.f;
      const view = (this.views[id] ||= { id, pos: c.position, alive: true });
      view.pos = c.position;
      view.alive = f.alive;
      if (f.alive) this._living.push(view);
      if (id === p.character) {
        g.camera.getWorldDirection(_v2);
        hero.cam.origin = { x: g.camera.position.x, y: g.camera.position.y, z: g.camera.position.z };
        hero.cam.dir = { x: _v2.x, y: _v2.y, z: _v2.z };
        hero.camYaw = Math.atan2(_v2.x, _v2.z);
        hero.lockTarget = this.lock?.alive ? this.lock : null;
      }
    }
    const pa = g.inventory?.passives();
    this.sim.defenseMul = pa?.defenseMul ?? 1;
  }

  _detectCombat(dt) {
    const g = this.game;
    let engaged = false;
    for (const e of g.enemies.list) {
      if (!e.alive || !e.aggroed || !ENGAGED.has(e.state)) continue;
      for (const h of this._living) {
        if (Math.hypot(e.position.x - h.pos.x, e.position.z - h.pos.z) < 24) { engaged = true; break; }
      }
      if (engaged) break;
    }
    const was = this.inCombat;
    if (engaged) this.combatTimer = 4;
    else this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.inCombat = this.combatTimer > 0;
    this.sim.inCombat = this.inCombat;
    if (was && !this.inCombat) this._encounterEnd();
    if (this.lock && (!this.lock.alive || this.lock.state === 'dead')) this.lock = null;
  }

  /** The fight is over: a downed heroine stands up with a quarter of her health, revive counters reset. */
  _encounterEnd() {
    for (const id of ['megumin', 'roxy']) {
      const h = this.sim.heroes[id];
      if (h.absent) continue;
      if (h.f.downed) {
        this.sim.revive(id);
        this.game.hud.toast(`${HERO_NAME[id]} приходит в себя.`, 2.5);
      }
      h.f.revives = 0;
    }
    this.game.rpg?.events.emit('combat_end', {});
  }

  // ---- switching -------------------------------------------------------------------------------------------------
  requestSwitch(next) {
    const sim = this.sim;
    if (sim.active === next) return false;
    const why = sim.switchBlock(sim.active);
    if (why === 'wait' || why === 'cd') {
      this.pendingSwitch = { to: next, until: this.game.time + (why === 'cd' ? sim.switchCd + 0.15 : 0.8) };
      this.fx.hud?.switchWait?.();
      return false;
    }
    if (why === 'down') {
      this.game.hud.toast(`${HERO_NAME[next]} без сил: переключиться нельзя.`, 2.2);
      return false;
    }
    if (why) return false;
    return sim.switchTo(next);
  }

  _pendingSwitch() {
    const ps = this.pendingSwitch;
    if (!ps) return;
    if (this.game.time > ps.until) { this.pendingSwitch = null; return; }
    if (this.sim.switchBlock(this.sim.active) === '') {
      this.pendingSwitch = null;
      this.game.player.switchCharacter(ps.to);
    }
  }

  /** After the controlled heroine changed (no teleport: the camera goes to where the other one stands). */
  afterSwitch(next) {
    const g = this.game;
    g.beginFocusBlend?.();
    g.cameraRig.addTrauma(0.05);
    const c = _v.copy(g.player.position).setY(g.player.position.y + 1);
    g.vfx.burst('magicPop', c, 22);
    g.vfx.burst(next === 'roxy' ? 'waterSplash' : 'fireBurst', c, 12);
    this.companion.assign(g.player.companionId);
    this.lock = null;
    this.fx.onSwitch(next);
  }

  onCompanionSpawned() {
    this.sim.heroes[this.game.player.companionId].absent = false;
  }

  afterRespawn() {
    for (const id of ['megumin', 'roxy']) this.sim.resetHero(id);
    this.sim.projectiles.length = 0;
    this.sim.waves.length = 0;
    this.sim.zones.length = 0;
    this.combatTimer = 0;
  }

  cycleOrder() {
    const i = (ORDERS.indexOf(this.order) + 1) % ORDERS.length;
    this.order = ORDERS[i];
    this.holdPoint.copy(this.companion.position());
    const who = HERO_NAME[this.game.player.companionId];
    this.game.hud.toast(`${who}: ${ORDER_TEXT[this.order].replace('Рокси', who)}`, 1.8);
  }

  toggleLock() {
    if (this.lock) {
      this.lock = null;
      this.game.hud.toast('Цель отпущена', 1);
      return;
    }
    const g = this.game;
    const hero = this.active;
    let best = null, bs = Infinity;
    for (const t of this.env.hostiles()) {
      if (t.isDummy) continue;
      const d = Math.hypot(t.pos.x - hero.pos.x, t.pos.z - hero.pos.z);
      if (d > NUM.movement.lock_target_range) continue;
      const b = Math.abs(((Math.atan2(t.pos.x - hero.pos.x, t.pos.z - hero.pos.z) - hero.camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (b > 0.9) continue;
      if (!this.env.los({ x: hero.pos.x, y: hero.pos.y + 1.2, z: hero.pos.z }, { x: t.pos.x, y: t.pos.y + t.h * 0.6, z: t.pos.z })) continue;
      const sc = b * 10 + d * 0.2;
      if (sc < bs) { bs = sc; best = t; }
    }
    this.lock = best;
    if (best) g.hud.toast(`Цель: ${best.type?.name ?? 'мишень'}`, 1);
  }

  // ---- revive ----------------------------------------------------------------------------------------------------
  /** A downed ally close enough to lift (and one lift per encounter), or null. */
  reviveTarget() {
    const p = this.game.player;
    const other = this.sim.heroes[p.companionId];
    if (!other || other.absent || !other.f.downed || other.f.revives >= 1) return null;
    const me = p.position, o = p.slots[other.id].controller.position;
    return Math.hypot(me.x - o.x, me.z - o.z) < 2.4 ? other.id : null;
  }

  _revive(dt) {
    const r = this.reviving;
    if (!r) { this.reviveProgress = 0; return; }
    if (this.reviveTarget() !== r.id || this.active.f.reaction > 0) { this.reviving = null; this.reviveProgress = 0; return; }
    r.t += dt;
    this.reviveProgress = r.t / NUM.revive.time;
    if (r.t >= NUM.revive.time) {
      this.sim.heroes[r.id].f.revives++;
      this.sim.revive(r.id);
      this.reviving = null;
      this.reviveProgress = 0;
      this.game.hud.toast(`${HERO_NAME[r.id]} поднята: ${Math.round(NUM.revive.hpFrac * 100)}% здоровья.`, 2.5);
    }
  }

  // ---- being hit -------------------------------------------------------------------------------------------------
  /**
   * An enemy attack reaches heroine `id`. hit: { dmg, kind, from (point), parryable, attacker, knock, heavy }.
   * Returns the core's result ({ taken, blocked, dodged, parried, broken, downed }) or null.
   */
  hitParty(id, hit) {
    const hero = this.sim.heroes[id];
    if (!hero || hero.absent || !hero.f.alive) return null;
    const slot = this.game.player.slots[id];
    const from = { x: hit.from.x, z: hit.from.z };
    const dmg = hit.dmg * (this.sim.defenseMul ?? 1);
    const res = this.sim.hitHero(id, { ...hit, dmg, from });
    if (res.dodged || res.parried) return res;
    const heavy = hit.kind === 'heavy' || hit.kind === 'wide' || hit.kind === 'aoe' || hit.heavy;
    const c = slot.controller;
    _v.set(c.position.x - from.x, 0, c.position.z - from.z);
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
    _v.normalize().multiplyScalar((hit.knock ?? 5) * (res.blocked ? 0.35 : 1) * (heavy ? 1.3 : 1));
    _v.y = heavy && !res.blocked ? 4 : 0;
    c.addImpulse(_v);
    this.fx.onHeroHit(id, res, hit);
    return res;
  }

  dot(id, dmg) {
    this.sim.dot(id, dmg);
  }

  // ---- events from the core ----------------------------------------------------------------------------------------
  _wire() {
    const sim = this.sim;
    const g = this.game;
    sim.on('down', (e) => {
      const p = g.player;
      this.fx.onDown(e.hero);
      const other = sim.heroes[e.hero === 'megumin' ? 'roxy' : 'megumin'];
      if (e.hero === p.character) {
        if (other && !other.absent && other.f.alive) {
          g.hud.toast(`${HERO_NAME[e.hero]} без сил. ${HERO_NAME[other.id]} продолжает бой.`, 3);
          p.switchCharacter(other.id, true);
        } else p.defeated();
      } else {
        g.hud.toast(`${HERO_NAME[e.hero]} без сил: подними её (E, 4 с) или закончи бой.`, 3.2);
        const me = sim.heroes[p.character];
        if (!me.f.alive) p.defeated();
      }
    });
    sim.on('exhaust:start', (e) => {
      if (e.hero !== g.player.character || !this.settings.autoSwitch) return;
      if (!g.player.companionUnlocked) return;
      this.autoSwitchAt = { t: g.time + NUM.exhaustion.recovery_lock, from: e.hero };
    });
    sim.on('revive', (e) => this.fx.onRevive(e.hero));
  }

  /** Auto-switch after the Explosion once Roxy is ready (0.8 s after the release). */
  tickAutoSwitch() {
    const a = this.autoSwitchAt;
    if (!a) return;
    if (this.game.time < a.t) return;
    this.autoSwitchAt = null;
    if (this.sim.active !== a.from) return;
    const to = this.sim.autoSwitchTarget(a.from);
    if (to) {
      this.sim.switchCd = 0;
      this.game.player.switchCharacter(to);
      this.game.hud.toast('Рокси, продолжай. Мегумин отходит.', 2.2);
    }
  }

  // ---- world helpers kept from the old system ---------------------------------------------------------------------------
  /** Danger marker on the ground that fills up until an enemy's heavy attack lands. `opts`: { yaw, arc } for a fan. */
  telegraph(center, radius, duration, opts) {
    const t = new Telegraph(this.game, center, radius, duration, opts);
    this.telegraphs.push(t);
    return t;
  }

  /** A thin strip from a thrower to its target: the line the projectile will fly. */
  telegraphLine(from, to, duration) {
    const t = new LineTelegraph(this.game, from, to, duration);
    this.telegraphs.push(t);
    return t;
  }

  /** Quick ground shockwave ring (enemy slams, finisher). */
  groundImpact(center, radius, color = 0xff6a3a) {
    const c = new THREE.Color(color);
    this.game.vfx.add(new Shockwave(center, radius * 1.3, 0.45, [c.r * 2.2, c.g * 2.2, c.b * 2.2]));
  }

  /** Cancel whatever the controlled heroine is doing (cutscenes, dialogue). */
  cancel() {
    const id = this.game.player.character;
    this.sim.cancelAim(id, true);
    if (this.active.state === 'action') this.sim.cancelAction(id, 'cancel');
    this.sim.guard(id, false);
  }

  /** Slot readout for the HUD: reason, cooldown fraction, cost. */
  slotInfo(heroId, slot) {
    const sim = this.sim;
    const hero = sim.heroes[heroId];
    const spec = SPEC[SLOTS[heroId][slot]];
    const f = hero.f;
    const reason = sim.availability(heroId, slot);
    const cd = f.cd[spec.id] || 0;
    const retry = f.retry[spec.id] || 0;
    const running = hero.act?.spec.id === spec.id;
    const aiming = hero.aim?.slot === slot;
    let note = '';
    if (spec.id === 'R_E' && !reason && f.freeMana < spec.cost.mana) note = 'без воды';
    return { spec, reason, cd, frac: spec.cooldown ? clamp(Math.max(cd, retry) / (retry > cd ? NUM.strong.retry_delay_on_cancel : spec.cooldown), 0, 1) : 0, ready: !reason, running, aiming, note };
  }
}

// ---------------------------------------------------------------------------
/** Ground marker for a coming blow: a circle that fills up, or a fan (wide swing) in front of the attacker. */
class Telegraph {
  constructor(game, center, radius, duration, opts = {}) {
    this.game = game;
    this.alive = true;
    this.duration = duration;
    this.fan = !!opts.arc;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uFill: { value: 0 }, uAlpha: { value: 1 }, uArc: { value: opts.arc ? (opts.arc * Math.PI) / 180 : Math.PI * 2 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uFill, uAlpha, uArc; varying vec2 vUv;
        void main(){
          vec2 q = (vUv - 0.5) * 2.0;
          float r = length(q);
          if (r > 1.0) discard;
          float ang = abs(atan(q.x, -q.y));
          if (uArc < 6.2 && ang > uArc * 0.5) discard;
          float edge = uArc < 6.2 ? smoothstep(uArc * 0.5 - 0.05, uArc * 0.5, ang) : 0.0;
          float ring = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float fill = step(r, uFill) * 0.35 + smoothstep(uFill - 0.05, uFill, r) * step(r, uFill) * 0.6;
          vec3 col = vec3(2.4, 0.25, 0.12) * ((ring + edge) * 1.2 + fill);
          gl_FragColor = vec4(col * uAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.material);
    this.mesh.position.copy(center);
    this.mesh.position.y = game.world.groundAt(center.x, center.z, center.y + 2) + 0.06;
    this.mesh.scale.setScalar(radius);
    if (opts.yaw !== undefined) this.mesh.rotation.y = opts.yaw;
    this.mesh.renderOrder = 8;
    game.scene.add(this.mesh);
  }
  update(n) {
    this.material.uniforms.uFill.value = clamp(n, 0, 1);
  }
  finish() {
    this._remove();
  }
  cancel() {
    this._remove();
  }
  _remove() {
    if (!this.alive) return;
    this.alive = false;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** A thin red strip along the path of a thrown projectile. */
class LineTelegraph {
  constructor(game, from, to, duration) {
    this.game = game;
    this.alive = true;
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uFill: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uFill; varying vec2 vUv;
        void main(){
          float side = abs(vUv.x - 0.5) * 2.0;
          float edge = smoothstep(0.55, 1.0, side);
          float run = smoothstep(uFill - 0.12, uFill, vUv.y) * step(vUv.y, uFill);
          vec3 col = vec3(2.2, 0.28, 0.12) * (0.25 + edge * 0.8 + run * 0.9);
          gl_FragColor = vec4(col * 0.55, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const geo = new THREE.PlaneGeometry(0.28, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(from.x, game.world.groundAt(from.x, from.z, from.y + 2) + 0.07, from.z);
    this.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI;
    this.mesh.scale.set(1, 1, len);
    this.mesh.renderOrder = 8;
    game.scene.add(this.mesh);
    void duration;
  }
  update(n) {
    this.material.uniforms.uFill.value = clamp(n, 0, 1);
  }
  finish() { this._remove(); }
  cancel() { this._remove(); }
  _remove() {
    if (!this.alive) return;
    this.alive = false;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
