import * as THREE from 'three';
import { MOVE } from '../character/CharacterController.js';
import { clamp } from '../core/math.js';

/**
 * The heroine the player is not controlling (docs/combat/01 §10): follows at 3–5 m, fights with the ordinary staff
 * series, leaves telegraphed danger areas (dodging when the blow is about to land), guards against light blows
 * aimed at her. She never casts strong spells by herself; medium skills only if the tactic setting allows.
 * Orders (T): near · hold the point · retreat (the retreat order wins over attacking).
 */
const _mv = new THREE.Vector3();
const _dash = new THREE.Vector3();
const _a = new THREE.Vector3();
const FOLLOW_MIN = 2.6, FOLLOW_MAX = 5.2;

export class Companion {
  constructor(game, combat) {
    this.game = game;
    this.combat = combat;
    this.think = 0;
    this.guardUntil = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.target = null;
  }

  assign() {
    this.think = 0;
    this.guardUntil = 0;
    this.target = null;
    this.combat.holdPoint.copy(this.position());
  }

  position() {
    const s = this.game.player.companionSlot;
    return s ? s.controller.position : this.game.player.position;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const slot = p.companionSlot;
    if (!slot) return;
    const sim = this.combat.sim;
    const id = slot.id;
    const hero = sim.heroes[id];
    if (!hero || hero.absent) return;
    const f = hero.f;
    const c = slot.controller;
    const anim = slot.anim;
    const me = c.position;
    const lead = p.position;
    const out = hero.out;
    const order = this.combat.order;
    const cmd = { moveDir: _mv.set(0, 0, 0), run: false, jumpPressed: false, jumpHeld: false, canMove: true, canJump: false, speedMul: 1 };

    const downed = hero.state === 'downed';
    const moveMul = downed ? 0 : out.moveMul;
    cmd.canMove = moveMul > 0;
    cmd.speedMul = moveMul * (out.speedCap < Infinity ? clamp(out.speedCap / MOVE.walkSpeed, 0, 1) : 1);
    if (out.dash && !downed) cmd.dashVel = _dash.set(out.dash.vx, 0, out.dash.vz);
    if (out.faceYaw != null && !downed) {
      cmd.faceYaw = out.faceYaw;
      cmd.faceRate = hero.state === 'dodge' ? 30 : 20;
    }

    if (!downed && (hero.state === 'free' || (hero.state === 'action' && moveMul > 0))) {
      this._steer(dt, hero, slot, cmd, order);
    }
    c.update(dt, cmd);
    // Fell under the map, or left far behind (a ride, a long run): back at a checked free point beside the player, out of the fight only
    const far = Math.hypot(c.position.x - p.position.x, c.position.z - p.position.z) > 45 && !g.enemies.list.some((e) => e.alive && e.aggroed && e.position.distanceTo(p.position) < 30);
    if (c.position.y < -40 || far) p.placeCompanion();

    const speed = c.horizontalSpeed;
    const st = hero.state;
    if (st !== 'downed' && st !== 'dodge' && !(st === 'action' && hero.act.spec.kind === 'strong')) {
      let next;
      if (!c.grounded) next = 'Fall';
      else if (speed > MOVE.walkSpeed + 0.6) next = 'Run';
      else if (speed > 0.35) next = 'Walk';
      else next = 'Idle';
      if (anim.state === 'Exhausted' || anim.state === 'Slump') anim.set(next, true);
      else anim.set(next);
    }
    p.driveRig(slot, dt, speed);
    void f;
  }

  _steer(dt, hero, slot, cmd, order) {
    const g = this.game;
    const sim = this.combat.sim;
    const p = g.player;
    const id = hero.id;
    const c = slot.controller;
    const me = c.position;
    const lead = p.position;
    const f = hero.f;
    const time = g.time;
    const enemies = g.enemies.list;
    const incoming = this._danger(hero, me);

    // 1. Leave a telegraphed area; dodge when the blow is about to land.
    if (incoming) {
      _a.set(me.x - incoming.x, 0, me.z - incoming.z);
      if (_a.lengthSq() < 0.01) _a.set(Math.sin(c.yaw + 1.57), 0, Math.cos(c.yaw + 1.57));
      _a.normalize();
      cmd.moveDir.copy(_a);
      cmd.run = true;
      if (incoming.urgent && hero.state === 'free' && f.stamina >= 22) sim.dodge(id, _a.x, _a.z);
      this.guardUntil = 0;
      sim.guard(id, false);
      return;
    }

    // 2. Guard against a light blow aimed at her.
    for (const e of enemies) {
      if (!e.alive || e.state !== 'windup' || e.target?.id !== id) continue;
      const left = e.windupTime - e.stateTime;
      const d = Math.hypot(e.position.x - me.x, e.position.z - me.z);
      if (left < 0.35 && d < e.type.attackRange + 1.2 && e.attack.kind !== 'heavy' && e.attack.kind !== 'wide' && f.stamina >= 14) {
        this.guardUntil = time + 0.55;
        this._face(hero, e.position);
      }
    }
    const wantGuard = time < this.guardUntil && order !== 'hold' ? true : time < this.guardUntil;
    sim.guard(id, wantGuard);
    if (wantGuard && hero.state === 'free') {
      // Face the attacker while guarding.
      cmd.faceYaw = hero.camYaw;
      cmd.faceRate = 14;
    }

    // 3. Retreat (ordered, or exhausted and left behind).
    const exhausted = f.exhaust > 0 && f.exhaustLock <= 0 && order !== 'hold';
    if (order === 'retreat' || exhausted || !f.alive) {
      this._goTo(cmd, me, this._retreatPoint(lead, me), 1.2);
      return;
    }

    // 4. Fight: the nearest enemy that threatens the leader or her, within reach of the leader.
    if (this.combat.inCombat) {
      this.think -= dt;
      if (this.think <= 0 || !this.target?.alive) {
        this.think = 0.25;
        this.target = this._pickTarget(me, lead, order);
      }
      const t = this.target;
      if (t && t.alive) {
        const dx = t.position.x - me.x, dz = t.position.z - me.z;
        const d = Math.hypot(dx, dz);
        const reach = (hero.id === 'megumin' ? 1.8 : 1.7) + t.type.hitRadius * 0.6;
        if (d > reach * 0.85) {
          // Approach, but stay within the leash around the leader (or the held point).
          const anchor = order === 'hold' ? this.combat.holdPoint : lead;
          const toAnchor = Math.hypot(me.x - anchor.x, me.z - anchor.z);
          const leash = order === 'hold' ? 3.5 : 8;
          if (toAnchor < leash || d < 2.5) {
            cmd.moveDir.set(dx / d, 0, dz / d);
            cmd.run = d > 5;
          }
        } else {
          // Strafe a little around the target instead of standing in its swing line.
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.5 + Math.random() * 1.5; }
          if (t.state === 'windup' && t.target?.id === id) cmd.moveDir.set(-dz / d * this.strafe, 0, dx / d * this.strafe).multiplyScalar(0.8);
        }
        this._face(hero, t.position);
        if (d <= reach + 0.2 && hero.state === 'free' && !wantGuard) {
          if (!this._medium(hero, t, d)) sim.attack(id);
        }
        return;
      }
    }

    // 5. Follow the leader at 3–5 m (or stay on the held point).
    if (order === 'hold') {
      this._goTo(cmd, me, this.combat.holdPoint, 0.8);
    } else {
      const d = Math.hypot(lead.x - me.x, lead.z - me.z);
      if (d > FOLLOW_MAX) {
        cmd.moveDir.set(lead.x - me.x, 0, lead.z - me.z).normalize();
        cmd.run = d > FOLLOW_MAX + 4;
      } else if (d < FOLLOW_MIN) {
        // Step aside, not into the leader's path.
        cmd.moveDir.set(me.x - lead.x, 0, me.z - lead.z).normalize().multiplyScalar(0.6);
      }
    }
    if (cmd.moveDir.lengthSq() > 0.01 && !cmd.faceYaw) hero.camYaw = Math.atan2(cmd.moveDir.x, cmd.moveDir.z);
  }

  /** Optional use of a medium skill (tactics setting): a sweep when surrounded, a whip on a distant target. */
  _medium(hero, t, d) {
    if (!this.combat.settings.skillsInTactics) return false;
    const sim = this.combat.sim;
    const f = hero.f;
    if (hero.id === 'megumin' && f.stamina > 60 && this.game.enemies.near(this.position(), 2.3).length >= 2) return sim.skill(hero.id, 'E');
    if (hero.id === 'roxy' && f.mana > 30 && f.stamina > 50 && d > 3) return sim.skill(hero.id, 'Q');
    return false;
  }

  _face(hero, pos) {
    const p = this.position();
    hero.camYaw = Math.atan2(pos.x - p.x, pos.z - p.z);
  }

  _goTo(cmd, me, pt, stop) {
    const dx = pt.x - me.x, dz = pt.z - me.z;
    const d = Math.hypot(dx, dz);
    if (d > stop) {
      cmd.moveDir.set(dx / d, 0, dz / d);
      cmd.run = d > 6;
    }
  }

  /** A point behind the leader, away from the enemies. */
  _retreatPoint(lead, me) {
    let sx = 0, sz = 0, n = 0;
    for (const e of this.game.enemies.list) {
      if (!e.alive || !e.aggroed) continue;
      const d = Math.hypot(e.position.x - lead.x, e.position.z - lead.z);
      if (d > 25) continue;
      sx += e.position.x; sz += e.position.z; n++;
    }
    if (!n) return lead;
    sx /= n; sz /= n;
    _a.set(lead.x - sx, 0, lead.z - sz);
    if (_a.lengthSq() < 0.01) _a.set(me.x - lead.x, 0, me.z - lead.z);
    _a.normalize();
    const pt = this._pt || (this._pt = new THREE.Vector3());
    return pt.set(lead.x + _a.x * 6.5, lead.y, lead.z + _a.z * 6.5);
  }

  _pickTarget(me, lead, order) {
    let best = null, bs = Infinity;
    const anchor = order === 'hold' ? this.combat.holdPoint : lead;
    for (const e of this.game.enemies.list) {
      if (!e.alive || !e.aggroed || e.state === 'return' || e.state === 'idle') continue;
      const dl = Math.hypot(e.position.x - anchor.x, e.position.z - anchor.z);
      if (dl > (order === 'hold' ? 5 : 11)) continue;
      const dm = Math.hypot(e.position.x - me.x, e.position.z - me.z);
      const sc = dm + (e.target?.id === this.game.player.companionId ? -2 : 0) + dl * 0.3;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }

  /** The point of a danger area the companion stands in (heavy/wide blows, slams), with `urgent` near the strike. */
  _danger(hero, me) {
    for (const e of this.game.enemies.list) {
      if (!e.alive || (e.state !== 'windup' && e.state !== 'strike')) continue;
      const atk = e.attack;
      const left = e.state === 'windup' ? e.windupTime - e.stateTime : 0;
      if (atk.kind === 'heavy' || atk.kind === 'aoe') {
        const c = e.slamCenter;
        if (!c) continue;
        const d = Math.hypot(me.x - c.x, me.z - c.z);
        if (d < (atk.aoe || e.type.aoe || 2.4) + 0.7) return Object.assign(this._dz || (this._dz = {}), { x: c.x, z: c.z, urgent: left < 0.45 });
      } else if (atk.kind === 'wide') {
        const dx = me.x - e.position.x, dz = me.z - e.position.z;
        const d = Math.hypot(dx, dz);
        if (d > atk.reach + 0.9) continue;
        const yaw = e.controller.yaw;
        const ang = Math.acos(clamp((dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.max(d, 1e-3), -1, 1));
        if (ang < ((atk.arc || 150) * Math.PI) / 360 + 0.25) return Object.assign(this._dz || (this._dz = {}), { x: e.position.x, z: e.position.z, urgent: left < 0.45 });
      }
    }
    return null;
  }
}
