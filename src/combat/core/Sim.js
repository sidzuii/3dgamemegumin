import { STEP, SPEC, SLOTS, COMBO, NUM, INPUT_WINDOW, COMBO_RESET, BLOCK_STAMINA, HEROES } from './specs.js';
import { Fighter } from './Fighter.js';
import { applyHit } from './Damage.js';
import { SKILLS, stepProjectiles, stepWaves, stepZones, aimUpdate, aimInitial } from './skills.js';
import { clamp, wrap, bearingTo, dist2d, yawTo, DEG } from './geo.js';

/**
 * The combat simulation (renderer independent, fixed step 1/120 s).
 *
 * The game feeds it each frame (hero position/facing, camera ray, input commands) and reads back `hero.out`
 * (facing to hold, dash velocity, movement multiplier) and the events (`sim.on`). Visuals, sound and the world
 * react to events; this file never touches THREE.
 *
 * env contract (see tools/combat/FakeEnv.mjs):
 *   hostiles(): iterable of targets { id, alive, hp, pos{x,y,z}, r, h, defP, defM, tier, poise, wet, elem?, onHit(res) }
 *   los(a, b): is the segment between two world points free of walls / floors
 *   rayWall(o, d, maxLen): distance to the first wall along a ray (Infinity if none)
 *   groundAt(x, z, y): height of the walkable surface
 *   pickGround(o, d, maxLen): { x, y, z } where a camera ray hits the ground, or null
 *   groundLine(x0, z0, x1, z1): { len, reason } how far a ground wave may travel (walls, cliffs, steps > 0.6, slopes > 35°)
 *   allowed(heroId, spec, pos): { ok, reason } story / zone rules for the spell tags
 */
export class Hero {
  constructor(id, fighter) {
    this.id = id;
    this.f = fighter;
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0; // body facing (from the host)
    this.camYaw = 0; // direction the player wants to strike
    this.r = 0.3;
    this.h = 1.7;
    this.staff = { x: 0, y: 1.3, z: 0 }; // staff tip / gem (spell origin)
    this.cam = { origin: { x: 0, y: 2, z: -3 }, dir: { x: 0, y: 0, z: 1 } };
    this.state = 'free'; // free | action | dodge | stun | downed
    this.act = null;
    this.combo = { next: 1, readyAt: -99 };
    this.queue = null; // { kind: 'attack' | 'skill' | 'dodge', slot, at }
    this.aim = null;
    this.dodge = null;
    this.guardHeld = false;
    this.guarding = false;
    this.parryHit = null;
    this.lockTarget = null; // MMB lock-on
    this.absent = false; // not in the world yet (Roxy before she joins)
    this.out = { faceYaw: null, dash: null, moveMul: 1, speedCap: Infinity, noSprint: false };
  }

  get chest() {
    return { x: this.pos.x, y: this.pos.y + this.h * 0.62, z: this.pos.z };
  }
}

export class CombatSim {
  constructor(env) {
    this.env = env;
    this.time = 0;
    this.acc = 0;
    this.steps = 0;
    this.heroes = {};
    this.active = 'megumin';
    this.projectiles = [];
    this.waves = [];
    this.zones = [];
    this.uid = 1;
    this.listeners = {};
    this.switchCd = 0;
    this.inCombat = false;
    this.paused = false;
  }

  // ---- events --------------------------------------------------------------------------------------------
  on(type, fn) {
    (this.listeners[type] ||= []).push(fn);
    return () => this.listeners[type].splice(this.listeners[type].indexOf(fn), 1);
  }
  emit(type, data = {}) {
    data.type = type;
    data.time = this.time;
    for (const fn of this.listeners[type] || []) fn(data);
    for (const fn of this.listeners['*'] || []) fn(data);
  }

  // ---- heroes --------------------------------------------------------------------------------------------
  addHero(id, opts, fighter) {
    const hero = new Hero(id, fighter || new Fighter(id, opts));
    this.heroes[id] = hero;
    return hero;
  }
  hero(id) {
    return this.heroes[id];
  }
  get current() {
    return this.heroes[this.active];
  }
  other(id) {
    return this.heroes[id === 'megumin' ? 'roxy' : 'megumin'];
  }

  // ---- stepping ------------------------------------------------------------------------------------------
  advance(dt) {
    if (this.paused) return;
    this.acc += dt;
    if (this.acc > 0.25) this.acc = 0.25;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  step(h) {
    this.time += h;
    this.steps++;
    this.switchCd = Math.max(0, this.switchCd - h);
    for (const id of HEROES) {
      const hero = this.heroes[id];
      if (hero) this._stepHero(hero, h);
    }
    stepProjectiles(this, h);
    stepWaves(this, h);
    stepZones(this, h);
    for (const t of this.env.hostiles()) {
      if (t.poise && (t.poise.value < t.poise.max || t.poise.protectLeft > 0 || t.poise.reactionLeft > 0)) t.poise.tick(h);
      else if (t.poise) t.poise.sinceHit += h;
      if (t.wet > 0) t.wet = Math.max(0, t.wet - h);
    }
  }

  _stepHero(hero, h) {
    if (hero.absent) return;
    const f = hero.f;
    const out = hero.out;
    out.faceYaw = null;
    out.dash = null;
    out.moveMul = 1;
    out.speedCap = f.exhausted && f.exhaust > 0 ? NUM.exhaustion.movement : Infinity;
    out.noSprint = false;
    const casting = hero.act?.spec.kind === 'strong';
    f.tick(h, { active: hero.id === this.active, inCombat: this.inCombat, casting, guarding: hero.guarding });
    if (!f.alive) {
      if (hero.state !== 'downed') this._down(hero);
      return;
    }
    switch (hero.state) {
      case 'stun':
        out.moveMul = 0;
        if (f.reaction <= 0 && f.guardBreak <= 0) {
          hero.state = 'free';
          this._consumeQueue(hero);
        }
        break;
      case 'dodge':
        this._stepDodge(hero, h);
        break;
      case 'action':
        SKILLS.stepAction(this, hero, h);
        // Staff series: a queued hit cuts the recovery of the current one at its cancel point.
        if (hero.state === 'action' && hero.act.spec.kind === 'basic' && hero.queue?.kind === 'attack' && hero.act.t >= hero.act.spec.cancelAt) {
          SKILLS.finish(this, hero);
          this._consumeQueue(hero);
        }
        break;
      default:
        this._stepFree(hero, h);
    }
    if (hero.aim) aimUpdate(this, hero, h);
  }

  _stepFree(hero, h) {
    const f = hero.f;
    hero.guarding = hero.guardHeld && !hero.aim && f.guardBreak <= 0;
    if (hero.guarding) {
      hero.out.moveMul = 0.5;
      hero.out.noSprint = true;
    }
    if (hero.aim) {
      hero.out.noSprint = true;
      hero.out.moveMul = 0.8;
    }
    this._consumeQueue(hero);
  }

  _consumeQueue(hero) {
    const q = hero.queue;
    if (!q || hero.state !== 'free') return;
    hero.queue = null;
    if (!q.chain && this.time - q.at > INPUT_WINDOW) return; // too old: only the last 0.18 s count
    if (q.kind === 'attack') this._startAttack(hero);
    else if (q.kind === 'skill') this.skill(hero.id, q.slot);
    else if (q.kind === 'dodge') this.dodge(hero.id, q.dx, q.dz);
  }

  // ---- commands ------------------------------------------------------------------------------------------
  setCamera(id, origin, dir) {
    const hero = this.heroes[id];
    hero.cam.origin = origin;
    hero.cam.dir = dir;
    hero.camYaw = Math.atan2(dir.x, dir.z);
  }

  /** May the current action be cancelled now (dodge / guard / switch)? Active phases never can. */
  canCancel(hero) {
    if (hero.state === 'free') return true;
    if (hero.state === 'dodge') return hero.dodge.t >= NUM.dodge.movement_cancel;
    if (hero.state !== 'action') return false;
    const a = hero.act, s = a.spec;
    if (s.kind === 'strong' && a.released) return a.t >= s.cancelAt;
    if (s.kind === 'strong') return true;
    if (a.t <= s.earlyUntil) return true;
    if (a.t < s.activeEnd) return false;
    return a.t >= s.cancelAt;
  }

  /** LMB: confirm an aimed spell, otherwise a staff hit / the next hit of the series. */
  attack(id) {
    const hero = this.heroes[id];
    if (!hero?.f.alive) return false;
    if (hero.aim) return this.confirm(id);
    if (hero.state === 'free') {
      if (hero.guarding && hero.f.guardBreak > 0) return false;
      return this._startAttack(hero);
    }
    if (hero.state === 'action' || hero.state === 'dodge' || hero.state === 'stun') {
      // A press during a staff swing is kept for the whole swing: the next hit starts from its cancel point.
      hero.queue = { kind: 'attack', at: this.time, chain: hero.state === 'action' && hero.act?.spec.kind === 'basic' };
      return true;
    }
    return false;
  }

  _startAttack(hero) {
    const f = hero.f;
    if (f.exhaustLock > 0 || !f.alive) return false;
    if (this.time - hero.combo.readyAt > COMBO_RESET) hero.combo.next = 1;
    const id = COMBO[hero.id][hero.combo.next - 1];
    const s = SPEC[id];
    if (f.stamina < s.cost.stamina) {
      this.emit('denied', { hero: hero.id, id, reason: 'Не хватает выносливости', why: 'stamina' });
      return false;
    }
    f.spendStamina(s.cost.stamina, NUM.regen.basic_stamina_delay ?? NUM.regen.stamina_delay); // staff hits do not pause the regeneration
    hero.guarding = false;
    SKILLS.begin(this, hero, s);
    return true;
  }

  /** Slots Q / E (medium; keys Q / R) or R / F (keys X / F: select a strong spell and show the aim). */
  skill(id, slot) {
    const hero = this.heroes[id];
    if (!hero?.f.alive) return false;
    const spec = SPEC[SLOTS[id][slot]];
    // Pressing the same strong key again leaves the aim; another strong key switches the aim.
    if (hero.aim && spec.kind === 'strong' && hero.aim.slot === slot) {
      this.cancelAim(id);
      return false;
    }
    if (hero.state !== 'free') {
      if ((hero.state === 'action' || hero.state === 'dodge') && spec.kind === 'medium') hero.queue = { kind: 'skill', slot, at: this.time };
      return false;
    }
    const why = this.availability(id, slot);
    if (why) {
      this.emit('denied', { hero: id, id: spec.id, reason: why, why: 'skill' });
      return false;
    }
    if (spec.kind === 'medium') {
      this.cancelAim(id, true);
      hero.guarding = false;
      this._payStart(hero, spec);
      SKILLS.begin(this, hero, spec);
      return true;
    }
    // Strong: aim first (no mana is spent).
    hero.aim = { slot, id: spec.id, spec, valid: false, reason: '', point: null, desired: null, yaw: hero.camYaw, target: null, since: this.time };
    aimInitial(this, hero);
    this.emit('aim:start', { hero: id, id: spec.id });
    return true;
  }

  /** Why the slot cannot be used now ('' if it can). Includes story / zone rules. */
  availability(id, slot) {
    const hero = this.heroes[id];
    const spec = SPEC[SLOTS[id][slot]];
    const locked = this.env.locked?.(id, spec.id);
    if (locked) return locked;
    let why = hero.f.unavailable(spec.id, id === 'roxy' && spec.id === 'R_E' ? { manaCostOverride: 0 } : {});
    if (!why && spec.kind === 'medium' && spec.id === 'R_Q' && hero.f.freeMana < spec.cost.mana) why = `Нужно ${spec.cost.mana} маны`;
    if (!why && spec.tags.includes('explosive')) {
      const g = this.env.allowed?.(id, spec, hero.pos);
      if (g && !g.ok) why = g.reason || 'Здесь нельзя применять взрыв';
    }
    return why;
  }

  _payStart(hero, spec) {
    const f = hero.f;
    if (spec.cost.stamina > 0) f.spendStamina(spec.cost.stamina);
    let mana = spec.cost.mana;
    if (spec.id === 'R_E') mana = f.freeMana >= spec.cost.mana ? spec.cost.mana : 0;
    hero.paidMana = mana;
    if (mana > 0) f.spendMana(mana);
    if (spec.cooldown > 0) f.cd[spec.id] = spec.cooldown;
  }

  cancelAim(id, silent) {
    const hero = this.heroes[id];
    if (!hero?.aim) return;
    const a = hero.aim;
    hero.aim = null;
    if (!silent) this.emit('aim:cancel', { hero: id, id: a.id });
  }

  /** LMB in aim mode: reserve the mana and start the preparation. */
  confirm(id) {
    const hero = this.heroes[id];
    const aim = hero?.aim;
    if (!aim) return false;
    if (hero.state !== 'free') return false;
    if (!aim.valid) {
      this.emit('denied', { hero: id, id: aim.id, reason: aim.reason || 'Нельзя выбрать это место', why: 'aim' });
      return false;
    }
    const spec = aim.spec;
    const why = hero.f.unavailable(spec.id);
    if (why) {
      this.emit('denied', { hero: id, id: spec.id, reason: why, why: 'skill' });
      this.cancelAim(id);
      return false;
    }
    hero.f.reserve(spec.cost.mana);
    hero.guarding = false;
    const carry = hero.aim;
    hero.aim = null;
    SKILLS.begin(this, hero, spec, carry);
    this.emit('reserve', { hero: id, id: spec.id, mana: spec.cost.mana });
    return true;
  }

  /** RMB: hold the guard; in aim mode it cancels the selection. */
  guard(id, down) {
    const hero = this.heroes[id];
    if (!hero) return;
    if (down && hero.aim) {
      this.cancelAim(id);
      hero.guardHeld = false;
      return;
    }
    hero.guardHeld = down;
    if (down && hero.state === 'action' && this.canCancel(hero)) this.cancelAction(id, 'guard');
  }

  /** Space / V. dx, dz = desired world direction. */
  dodge(id, dx, dz) {
    const hero = this.heroes[id];
    if (!hero?.f.alive) return false;
    const f = hero.f;
    if (hero.state === 'stun' || hero.state === 'downed') return false;
    if (f.exhaustLock > 0) return false;
    if (hero.state === 'dodge') {
      if (hero.dodge.t >= NUM.dodge.next_dodge) return false;
      hero.queue = { kind: 'dodge', dx, dz, at: this.time };
      return false;
    }
    if (hero.aim) this.cancelAim(id, true);
    if (hero.state === 'action' && !this.canCancel(hero)) {
      hero.queue = { kind: 'dodge', dx, dz, at: this.time };
      return false;
    }
    if (f.stamina < NUM.dodge.stamina) {
      this.emit('denied', { hero: id, id: 'dodge', reason: 'Не хватает выносливости', why: 'stamina' });
      return false;
    }
    if (hero.state === 'action') this.cancelAction(id, 'dodge');
    f.spendStamina(NUM.dodge.stamina);
    hero.combo.next = 1;
    hero.guarding = false;
    let l = Math.hypot(dx, dz);
    if (l < 1e-4) {
      dx = -Math.sin(hero.camYaw);
      dz = -Math.cos(hero.camYaw);
      l = 1;
    }
    hero.dodge = { t: 0, dx: dx / l, dz: dz / l };
    hero.state = 'dodge';
    this.emit('dodge', { hero: id, dx: dx / l, dz: dz / l });
    return true;
  }

  _stepDodge(hero, h) {
    const D = hero.dodge, N = NUM.dodge;
    D.t += h;
    const T = N.total, hold = 0.18;
    const v0 = N.distance / (hold + (T - hold) / 2);
    const v = D.t < hold ? v0 : Math.max(0, v0 * (1 - (D.t - hold) / (T - hold)));
    hero.out.dash = { vx: D.dx * v, vz: D.dz * v };
    hero.out.faceYaw = Math.atan2(D.dx, D.dz);
    hero.out.moveMul = 0;
    // After 0.42 s movement and the next input are accepted.
    if (D.t >= N.movement_cancel) {
      const q = hero.queue;
      if (q && q.kind !== 'dodge' && this.time - q.at <= INPUT_WINDOW) {
        hero.state = 'free';
        hero.dodge = null;
        this._consumeQueue(hero);
        return;
      }
      hero.out.moveMul = 1; // control returns; the tail of the slide continues
    }
    if (D.t >= T) {
      hero.state = 'free';
      hero.dodge = null;
      this.emit('dodge:end', { hero: hero.id });
      this._consumeQueue(hero);
    }
  }

  /** i-frames of the dodge: 0.10 – 0.28 s from its start. */
  isInvulnerable(hero) {
    if (this.god) return true; // the admin mode's immortality (ui/AdminPanel): every hit misses
    return hero.state === 'dodge' && hero.dodge.t >= NUM.dodge.invulnerability[0] && hero.dodge.t <= NUM.dodge.invulnerability[1];
  }

  /** Cancel the running action. A strong spell before its release returns the reserve and sets a retry delay. */
  cancelAction(id, reason = 'cancel') {
    const hero = this.heroes[id];
    if (hero.state !== 'action') return;
    SKILLS.cancel(this, hero, reason);
  }

  // ---- switching -------------------------------------------------------------------------------------------
  /** Can control pass to the other heroine now? Returns '' or the reason ('cd' | 'down' | 'wait'). */
  switchBlock(fromId = this.active) {
    const hero = this.heroes[fromId], other = this.other(fromId);
    if (!hero || !other) return 'none';
    if (other.absent) return 'none';
    if (!other.f.alive) return 'down';
    if (this.inCombat && this.switchCd > 0) return 'cd';
    if (hero.state === 'action' && !this.canCancel(hero)) return 'wait';
    if (hero.state === 'dodge' && !this.canCancel(hero)) return 'wait';
    return '';
  }

  /** Tab: the controlled heroine changes; resources, cooldowns and statuses stay with their owners. */
  switchTo(id, { force = false } = {}) {
    if (id === this.active) return false;
    const from = this.heroes[this.active];
    if (!force && this.switchBlock(this.active)) return false;
    if (from.state === 'action') this.cancelAction(from.id, 'switch');
    if (from.aim) this.cancelAim(from.id, true);
    from.guardHeld = false;
    from.guarding = false;
    from.queue = null;
    this.active = id;
    this.switchCd = this.inCombat ? NUM.switching.cooldown_from_success : 0;
    this.emit('switch', { from: from.id, to: id });
    return true;
  }

  /** Auto-switch after the Explosion: the other heroine, only if she can fight and has finished her own action. */
  autoSwitchTarget(fromId) {
    const other = this.other(fromId);
    if (!other || other.absent || !other.f.alive) return null;
    if (other.state === 'action' || other.state === 'stun') return null;
    return other.id;
  }

  // ---- being hit -----------------------------------------------------------------------------------------
  /**
   * An enemy attack reaches heroine `id`.
   * hit: { dmg, kind: 'light'|'medium'|'heavy'|'wide'|'projectile'|'aoe'|'grab', from {x,z}, parryable?, attacker?, direct? }
   * Returns { taken, blocked, dodged, parried, broken, downed }.
   */
  hitHero(id, hit) {
    const hero = this.heroes[id];
    const f = hero.f;
    const res = { taken: 0, blocked: false, dodged: false, parried: false, broken: false, downed: false };
    if (!f.alive) return res;
    if (this.isInvulnerable(hero)) {
      res.dodged = true;
      this.emit('dodged', { hero: id, hit });
      return res;
    }
    const kind = hit.kind || 'light';
    // The guard faces where the player looks (camera / the companion's target); during an action, the action's facing.
    const front = bearingTo(hero.pos, hero.state === 'action' ? (hero.guardYaw ?? hero.yaw) : hero.camYaw, hit.from);
    // Counter window of Roxy's R_E: a light physical blow from the front within 60° is turned aside.
    if (hero.state === 'action' && hero.act.spec.id === 'R_E') {
      const a = hero.act, s = a.spec;
      const [w0, w1] = s.parry_window;
      if (a.t >= w0 && a.t <= w1 && kind === 'light' && hit.parryable !== false && Math.abs(front) <= (s.parry_arc / 2) * DEG && !hit.noParry) {
        res.parried = true;
        a.countered = true;
        hero.parryHit = { attacker: hit.attacker, from: hit.from };
        this.emit('parry', { hero: id, hit });
        hit.attacker?.onDeflected?.(hero);
        return res;
      }
    }
    let dmg = hit.dmg;
    const blockable = kind === 'light' || kind === 'medium' || kind === 'projectile';
    if (hero.guarding && blockable && Math.abs(front) <= (NUM.defense.guard_arc / 2) * DEG) {
      const cost = BLOCK_STAMINA[kind] ?? BLOCK_STAMINA.light;
      if (f.stamina >= cost) {
        f.stamina -= cost;
        f.staminaDelay = NUM.regen.stamina_delay;
        dmg *= 1 - (kind === 'projectile' ? NUM.defense.projectile_block_reduction : NUM.defense.melee_block_reduction);
        res.blocked = true;
        this.emit('block', { hero: id, hit, cost });
      } else {
        f.stamina = 0;
        f.guardBreak = NUM.defense.guard_break_lock;
        dmg *= NUM.defense.guard_break_damage_fraction;
        res.broken = true;
        hero.guarding = false;
        hero.guardHeld = false;
        this.emit('guardbreak', { hero: id, hit });
        this._stun(hero);
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    f.hp -= dmg;
    res.taken = dmg;
    this.emit('hurt', { hero: id, dmg, hit, blocked: res.blocked });
    if (f.hp <= 0) {
      f.hp = 0;
      res.downed = true;
      this._down(hero);
      return res;
    }
    if (!res.blocked && !res.broken) this._flinch(hero, hit);
    return res;
  }

  /** Damage over time / scripted damage: health only, no flinch, may down her. */
  dot(id, dmg) {
    const hero = this.heroes[id];
    if (!hero || hero.absent || !hero.f.alive || this.isInvulnerable(hero)) return;
    hero.f.hp -= Math.max(1, Math.round(dmg));
    this.emit('hurt', { hero: id, dmg, dot: true, blocked: false });
    if (hero.f.hp <= 0) {
      hero.f.hp = 0;
      this._down(hero);
    }
  }

  /** Back to a clean state (checkpoint respawn, rest). */
  resetHero(id) {
    const hero = this.heroes[id];
    if (!hero) return;
    if (hero.state === 'action') this.cancelAction(id, 'reset');
    hero.state = 'free';
    hero.act = null;
    hero.aim = null;
    hero.queue = null;
    hero.dodge = null;
    hero.guardHeld = false;
    hero.guarding = false;
    hero.combo = { next: 1, readyAt: -99 };
    hero.f.reaction = 0;
    hero.f.guardBreak = 0;
    hero.f.reserved = 0;
    hero.f.downed = false;
  }

  _flinch(hero, hit) {
    const f = hero.f;
    const heavy = hit.kind === 'heavy' || hit.kind === 'wide' || hit.kind === 'aoe' || hit.heavy;
    // Strong preparation breaks on any unblocked direct hit.
    if (hero.state === 'action' && hero.act.spec.kind === 'strong' && !hero.act.released) {
      SKILLS.cancel(this, hero, 'interrupted');
    }
    if (f.reaction > 0 || (f.protect > 0 && !heavy)) return;
    const startup = hero.state === 'action' && hero.act.t < hero.act.spec.startup;
    if (hero.state === 'action' && !startup && !heavy) return; // light hits do not stop a swing that already connects
    if (hero.state === 'action' && hero.act.spec.kind === 'strong' && hero.act.released) return;
    if (hero.state === 'action') SKILLS.cancel(this, hero, 'flinch');
    f.reaction = heavy ? NUM.reaction.heavy : NUM.reaction.light;
    f.reactionKind = heavy ? 'heavy' : 'light';
    this._stun(hero);
    this.emit('flinch', { hero: hero.id, heavy });
  }

  _stun(hero) {
    if (hero.state === 'action') SKILLS.cancel(this, hero, 'stun');
    hero.state = 'stun';
    hero.guarding = false;
    hero.dodge = null;
    hero.combo.next = 1;
  }

  _down(hero) {
    if (hero.state === 'action') SKILLS.cancel(this, hero, 'down');
    hero.aim = null;
    hero.queue = null;
    hero.state = 'downed';
    hero.f.downed = true;
    hero.f.hp = 0;
    hero.guarding = false;
    hero.guardHeld = false;
    this.emit('down', { hero: hero.id });
  }

  /** Lift a downed heroine (channelled by the other one, 4 s) or let her stand up after the fight. */
  revive(id, frac = NUM.revive.hpFrac) {
    const hero = this.heroes[id];
    if (!hero.f.downed) return false;
    hero.f.downed = false;
    hero.f.hp = Math.max(1, Math.round(hero.f.maxHp * frac));
    hero.f.reaction = 0;
    hero.state = 'free';
    this.emit('revive', { hero: id });
    return true;
  }

  // ---- shared helpers for skills -------------------------------------------------------------------------
  /** Hostile targets whose body overlaps the vertical slab and that are alive. */
  targets() {
    const out = [];
    for (const t of this.env.hostiles()) if (t.alive) out.push(t);
    return out;
  }

  /** Strike target `t` with `hit`; emits `contact`. */
  strike(hero, spec, t, extra = {}) {
    const f = hero.f;
    const hit = {
      coefA: spec.coefA, coefS: spec.coefS, A: f.powerA, S: f.powerS, poise: spec.poise || 0,
      tags: spec.tags, wet: 0, physMul: f.exhausted && spec.kind === 'basic' ? NUM.exhaustion.physical_damage_multiplier : 1,
      from: { x: hero.pos.x, z: hero.pos.z }, id: spec.id, hero: hero.id, ...extra,
    };
    const res = applyHit(t, hit);
    if (!res) return null;
    this.emit('contact', { hero: hero.id, spec, target: t, result: res, hit });
    return res;
  }

  uidNext() {
    return this.uid++;
  }
}
