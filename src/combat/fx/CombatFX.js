import * as THREE from 'three';
import { SPEC, SLOTS, HERO_NAME } from '../core/specs.js';
import { StaffTrail } from './StaffTrail.js';
import { ExplosionFX } from './ExplosionFX.js';
import { BreachFX } from './BreachFX.js';
import { WaterFX } from './WaterFX.js';
import { AimOverlay } from './AimOverlay.js';
import { clamp, damp } from '../../core/math.js';

/**
 * The visual / audio / animation layer of the combat: it listens to the events of the combat core and draws them
 * from the actions' own clocks. Camera shake and bright flashes have settings (the mechanics are not affected).
 */
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();

/** Library clip used for the body of each action (retimed so the strike frame meets the contact time). */
const CLIP = {
  M_L1: 'Attack1', M_L2: 'Attack2', M_L3: 'Attack3',
  R_L1: 'Attack1', R_L2: 'Attack2', R_L3: 'Attack3',
  M_Q: 'Attack2', M_E: 'Attack3', R_Q: 'Attack1', R_E: 'Attack2',
};
/** Seconds from the action start at which the clip's strike frame lands. */
function contactTime(s) {
  switch (s.id) {
    case 'M_E': return s.startup + s.active * 0.5;
    case 'R_Q': return s.startup + 0.1;
    case 'M_Q': return s.startup + 0.04;
    default: return s.startup + s.active * 0.5;
  }
}

export class CombatFX {
  constructor(game, combat) {
    this.game = game;
    this.combat = combat;
    this.trail = new StaffTrail(game.scene);
    this.explosion = new ExplosionFX(game, this);
    this.breach = new BreachFX(game, this);
    this.water = new WaterFX(game, this);
    this.aim = new AimOverlay(game);
    this.aimBlend = 0;
    this.lastReason = '';
    this.lastReasonT = -9;
    this.hud = null; // set by the HUD (switch-wait sign etc.)
    this._subscribe();
  }

  get shakeK() { return this.combat.settings.shake; }
  get flashK() { return this.combat.settings.flash; }
  shake(a) { this.game.cameraRig.addTrauma(a * this.combat.settings.shake); }
  flash(a, decay) { if (this.combat.settings.flash > 0) this.game.hud.flash(a * this.combat.settings.flash, decay); }

  _slot(id) { return this.game.player.slots[id]; }

  // ---- event wiring ------------------------------------------------------------------------------------------
  _subscribe() {
    const sim = this.combat.sim;
    const g = this.game;
    const on = (t, fn) => sim.on(t, fn);

    on('action:start', (e) => this._onStart(e));
    on('action:end', (e) => this._onEnd(e, false));
    on('action:cancel', (e) => this._onEnd(e, true));
    on('release', (e) => this._onRelease(e));
    on('contact', (e) => this._onContact(e));

    on('explosion', (e) => this._onExplosion(e));
    on('breach', (e) => { this.breach.onBreach(e); this._rpgExplosive(e, { pos: e.pos, kind: 'breach', radius: 1.5 }); });
    on('breach:mark', (e) => this.breach.onMark(e));
    on('breach:hit', (e) => this.breach.onHit(e));
    on('arrow', (e) => {
      this.water.onArrow(e);
      if (e.index === 0) g.rpg?.events.emit('volley', { from: new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z), dir: new THREE.Vector3(e.dir.x, e.dir.y, e.dir.z) });
    });
    on('arrow:hit', (e) => this.water.onArrowEnd(e, true));
    on('arrow:end', (e) => this.water.onArrowEnd(e, false));
    on('tidal', (e) => this.water.onTidal(e, sim.heroes[e.hero]));
    on('tidal:impact', (e) => this.water.onTidalImpact(e));
    on('parry:window', (e) => this.water.onParryWindow(sim.heroes[e.hero], e.open, e.countered));
    on('parry', (e) => this.water.onParry(e.hero, e.hit));

    on('dodge', (e) => {
      const slot = this._slot(e.hero);
      slot.anim.set('Roll', true, { duration: 0.62 });
      g.audio?.play('dodge');
      g.vfx.burst('dust', slot.controller.position, 5, { speed: 0.8, scale: 0.7, alpha: 0.3 });
    });
    on('dodged', (e) => {
      const slot = this._slot(e.hero);
      g.worldUI?.text?.(slot.controller.position, 'Уклон!');
      g.audio?.play('perfect', { vol: 0.5 });
    });
    on('block', (e) => {
      const slot = this._slot(e.hero);
      slot.model.getGemWorldPosition(_p);
      g.vfx.burst('hitSpark', _p, 8, { scale: 0.6 });
      g.audio?.play('hit', { vol: 0.8 });
      if (e.hero === g.player.character) this.shake(0.08);
    });
    on('guardbreak', (e) => {
      const slot = this._slot(e.hero);
      g.worldUI?.text?.(slot.controller.position, 'Защита сорвана!');
      slot.anim.playAction('Hit');
      if (e.hero === g.player.character) this.shake(0.3);
    });
    on('flinch', (e) => {
      const slot = this._slot(e.hero);
      slot.anim.playAction('Hit');
      slot.anim.stopAction?.();
      slot.anim.playAction('Hit');
    });
    on('hurt', (e) => {
      if (e.hero === g.player.character && !e.dot) g.hud.damageFlash();
      if (e.dot && e.hero === g.player.character && Math.random() < 0.3) g.hud.damageFlash();
    });
    on('denied', (e) => this._onDenied(e));
    on('pull:refused', (e) => g.rpg?.combatBark?.('CB_R005', e.hero));
    on('exhaust:start', (e) => {
      // The recoil: the knees give way; control comes back after 0.8 s (the core enforces it).
      const slot = this._slot(e.hero);
      this._exhaustAnim = { hero: e.hero };
      void slot;
    });
  }

  // ---- animation ---------------------------------------------------------------------------------------------------
  _onStart(e) {
    const g = this.game;
    const hero = e.act ? this.combat.sim.heroes[e.hero] : null;
    const slot = this._slot(e.hero);
    const anim = slot.anim;
    const spec = e.spec;
    anim.ctx.castCharge = 0;
    if (spec.kind === 'basic' || spec.kind === 'medium') {
      const full = slot.controller.horizontalSpeed < 0.5 && slot.controller.grounded;
      anim.playAction(CLIP[spec.id], full, { contact: contactTime(spec), duration: spec.total });
      g.audio?.play('swing', { vol: spec.kind === 'medium' ? 1 : 0.7 });
      if (spec.id === 'R_E' || spec.id === 'R_Q') this.water.start(hero, e.act);
      this.swing = { hero: e.hero, act: e.act };
    } else {
      anim.set('Cast', true, { duration: Math.min(spec.release * 0.55, 0.9) });
      if (spec.id === 'M_R') this.explosion.start(hero, e.act);
      else if (spec.id === 'M_F') this.breach.start(hero, e.act);
      else this.water.start(hero, e.act);
    }
  }

  _onRelease(e) {
    const slot = this._slot(e.hero);
    const s = e.spec;
    slot.anim.set('Release', true, { duration: s.id === 'M_R' ? 0.5 : 0.4 });
    if (s.id === 'M_R') this._recoil = { hero: e.hero, at: this.combat.sim.time + 0.5 };
    if (s.id === 'M_F') this.game.rpg?.combatBark?.('CB_M001', e.hero);
    if (s.id === 'R_F') this.game.rpg?.combatBark?.('CB_R002', e.hero);
  }

  _onEnd(e, cancelled) {
    const slot = this._slot(e.hero);
    const s = e.spec;
    if (s.kind === 'strong') {
      slot.anim.set('Idle', true);
      if (cancelled) {
        slot.anim.stopAction?.();
        if (s.id === 'M_R') this.explosion.cancel();
        if (s.id === 'M_F') this.breach.cancel();
      }
      this.water.end(s.id);
      if (cancelled) this.water.cancel(s.id);
      this._recoil = null;
    } else if (cancelled) {
      slot.anim.stopAction?.();
      this.water.end(s.id);
      if (s.id === 'R_Q') this.water.cancel(s.id);
    } else this.water.end(s.id);
    if (this.swing?.act?.uid === e.uid) this.swing = null;
  }

  onDown(id) {
    const slot = this._slot(id);
    slot.anim.ctx.exhaustDuration = 36000;
    slot.anim.stopAction?.();
    slot.anim.set('Exhausted', true);
    this.game.audio?.play('hurt');
  }

  onRevive(id) {
    const slot = this._slot(id);
    slot.anim.set('Idle', true);
    this.game.vfx.burst('heal', _p.copy(slot.controller.position).setY(slot.controller.position.y + 1), 20);
  }

  onSwitch() {
    this.aim.hide();
  }

  onHeroHit(id, res, hit) {
    const g = this.game;
    const slot = this._slot(id);
    const c = slot.controller;
    _p.set(c.position.x, c.position.y + 1.0, c.position.z);
    if (!res.blocked) g.vfx.burst('hitSpark', _p, 10);
    if (id === g.player.character) {
      this.shake(hit.kind === 'heavy' || hit.kind === 'wide' ? 0.4 : 0.2);
      g.audio?.play(res.blocked ? 'hit' : 'hurt');
    }
  }

  // ---- contacts ---------------------------------------------------------------------------------------------------
  _onContact(e) {
    const g = this.game;
    const t = e.target;
    const s = e.spec;
    const res = e.result;
    if (t.chest) t.chest(_p); else _p.set(t.pos.x, t.pos.y + t.h * 0.6, t.pos.z);
    const heavy = s.id === 'M_L3' || s.id === 'R_L3' || s.kind !== 'basic';
    const strong = s.kind === 'strong';
    const water = s.tags?.includes('water') || e.hit.wet > 0;
    // The impact comes from the real contact: sparks / wood-dust for the staff, drops for water; fire only for explosives.
    if (!strong) {
      g.vfx.burst('hitSpark', _p, heavy ? 22 : 12);
      if (water) g.vfx.burst('waterSplash', _p, 12, { scale: 0.6 });
      else g.vfx.burst('sparks', _p, heavy ? 10 : 5, { scale: 0.2 });
      if (e.hit.dust) g.vfx.burst('dust', _p2.copy(_p).setY(_p.y - 0.4), 10, { scale: 0.6, alpha: 0.5 });
      this.shake(heavy ? 0.22 : 0.1);
      g.audio?.play(heavy ? 'hitHeavy' : 'hit');
    }
    if (res?.reaction) {
      g.vfx.burst('energyRing', _p, 4, { scale: 0.18 });
      g.audio?.play('hitHeavy', { vol: 0.7 });
    }
    if (res?.killed && s.kind !== 'strong') this.shake(0.12);
    this.combat.stats.hits++;
    this.combat.stats.damage += res?.dmg ?? 0;
  }

  // ---- explosive spells and the story ----------------------------------------------------------------------------
  _onExplosion(e) {
    const g = this.game;
    const hero = this.combat.sim.heroes[e.hero];
    this.explosion.release(hero, hero.act, e);
    this._rpgExplosive(e, { pos: e.pos, kind: 'explosion', radius: e.radius });
    // Rubble, training dummies and other dynamic props.
    const T = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
    for (const d of g.world.dummies) {
      if (d.isDummy) d.blast(T, 10, 14);
      else if (e.tags?.includes('story_demolition')) d.blast?.(T, 10, 14);
    }
  }

  _rpgExplosive(e, extra) {
    const pos = extra.pos;
    this.game.rpg?.events.emit('explosion', { pos: new THREE.Vector3(pos.x, pos.y, pos.z), tags: e.tags, id: e.id, hero: e.hero, kind: extra.kind, radius: extra.radius });
  }

  // ---- denied input ------------------------------------------------------------------------------------------------
  _onDenied(e) {
    const g = this.game;
    if (e.id === 'dodge' || e.why === 'stamina') g.hud.denyStamina();
    else g.hud.denyAbility(this._slotKey(e.hero, e.id));
    const now = g.time;
    if (e.reason && (e.reason !== this.lastReason || now - this.lastReasonT > 1.6)) {
      this.lastReason = e.reason;
      this.lastReasonT = now;
      if (e.hero === g.player.character) g.hud.toast(e.reason, 1.6);
    }
    // Spoken hints, rare and never over story lines.
    if (e.why === 'aim' && /стена|упрётся/i.test(e.reason)) g.rpg?.combatBark?.(e.hero === 'roxy' ? 'CB_R006' : 'CB_M004', e.hero);
    if (e.id === 'M_R' && /Нужно/.test(e.reason ?? '')) g.rpg?.combatBark?.('CB_M005', e.hero);
  }

  _slotKey(hero, id) {
    for (const k of Object.keys(SLOTS[hero] || {})) if (SLOTS[hero][k] === id) return k;
    return null;
  }

  // ---- per frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const sim = this.combat.sim;
    // Staff trail while a swing is in its active window.
    this._swingTrail(dt);
    this.trail.update(dt);
    this.explosion.update(dt);
    this.breach.update(dt);
    this.water.update(dt);
    // Recoil pose after the Explosion release.
    if (this._recoil && sim.time >= this._recoil.at) {
      this._slot(this._recoil.hero).anim.set('Slump', true);
      this._recoil = null;
    }
    // Aim contours and the camera that closes in while aiming.
    this.aim.update(this.combat);
    const hero = this.combat.active;
    const aiming = !!hero && (hero.aim || (hero.state === 'action' && hero.act.spec.kind === 'strong' && !hero.act.released));
    this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 6, dt);
    g.cameraRig.aimBlend = this.aimBlend;
    // Tint the trail for the heroine.
    this.trail.setTint(...(g.player.character === 'roxy' ? [0.6, 1.0, 1.4] : [1.5, 1.4, 1.25]));
  }

  _swingTrail() {
    const sw = this.swing;
    if (!sw) return;
    const a = sw.act;
    const hero = this.combat.sim.heroes[sw.hero];
    if (hero.act !== a) { this.swing = null; return; }
    const s = a.spec;
    if (s.kind === 'strong') return;
    const t0 = s.startup * 0.7, t1 = s.startup + s.active + 0.05;
    if (a.t < t0 || a.t > t1) return;
    const model = this._slot(sw.hero).model;
    model.getStaffTipWorldPosition(_p);
    model.getGemWorldPosition(_p2);
    this.trail.push(_p, _p2, s.id === 'M_E' || s.id === 'M_L3' ? 1.2 : 0.9);
  }

  hudHint() {
    return this.aim.hint;
  }
}
void clamp; void HERO_NAME; void SPEC;
