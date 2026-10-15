import * as THREE from 'three';
import { CharacterController } from '../character/CharacterController.js';
import { damp, clamp, rand } from '../core/math.js';
import { isLavaXZ } from '../world/Terrain.js';
import { PoiseState } from '../combat/core/Damage.js';

/**
 * Hostile NPC.
 *
 * AI: idle/wander -> alert -> chase -> windup (telegraphed) -> strike -> recover,
 * with hurt/stagger, knock-up by explosions, leashing back to its camp and death
 * (dissolve) + delayed respawn. Movement uses the same kinematic controller as the
 * player (BVH collision, slopes, steps).
 *
 * Static-mesh enemies are animated procedurally on a pivot group (hop / waddle /
 * lean / squash). Rigged enemies (Roxy) override `animate()`.
 */

/**
 * Combat numbers follow docs/combat/04 §4 (health, physical / magical defence, stability tier) and the attack
 * templates: `atk.kind` decides how the blow is read and answered —
 *   light  — short frontal swing, blockable (12 stamina), can be turned aside by Roxy's counter poke;
 *   medium — blockable (25 stamina), not parryable;
 *   wide   — broad red swing, cannot be blocked or parried: leave the area;
 *   heavy  — red mark, cannot be blocked or parried, big damage;
 *   throw  — a visible projectile (blockable at 40%).
 */
const A = (kind, windup, strike, recover, damage, extra = {}) => ({ kind, windup, strike, recover, damage, ...extra });

export const TYPES = {
  goblin: {
    name: 'Гоблин-капюшонник', model: 'goblin', hp: 240, defP: 15, defM: 10, tier: 'light', speed: 4.4, walk: 1.5, radius: 0.42, height: 1.15,
    aggro: 13, attackRange: 1.6, atk: A('light', 0.55, 0.12, 0.6, 65), lunge: 4.5,
    knock: 1.25, style: 'hop', hitRadius: 0.55, xp: 8,
  },
  // A goblin that keeps its distance and throws: a visible trajectory (0.8 s of preparation).
  goblin_thrower: {
    name: 'Гоблин-метатель', model: 'goblin', hp: 200, defP: 10, defM: 10, tier: 'light', speed: 4.6, walk: 1.6, radius: 0.42, height: 1.15,
    aggro: 16, attackRange: 9, keepAway: 5.5, atk: A('throw', 0.8, 0.1, 0.9, 50, { range: 11, speed: 15 }), lunge: 0,
    knock: 1.25, style: 'hop', hitRadius: 0.55, xp: 10, tint: [0.8, 1.0, 0.8],
  },
  mushroom: {
    name: 'Гриб-переросток', model: 'mushroom', hp: 420, defP: 10, defM: 15, tier: 'medium', speed: 3.6, walk: 1.4, radius: 0.5, height: 1.45,
    aggro: 12, attackRange: 1.9, atk: A('wide', 1.0, 0.25, 1.0, 110, { arc: 160, reach: 2.3 }), lunge: 2.5,
    knock: 1.0, style: 'waddle', hitRadius: 0.6, xp: 10,
  },
  // Quaternius Bestiary: a pig-faced goblin with a club and a quick clawing imp.
  puglin: {
    name: 'Пуглин', model: 'puglin', hp: 300, defP: 15, defM: 10, tier: 'light', speed: 4.0, walk: 1.4, radius: 0.45, height: 1.05,
    aggro: 13, attackRange: 1.7, atk: A('light', 0.6, 0.15, 0.65, 75), lunge: 4,
    knock: 1.1, style: 'hop', hitRadius: 0.6, xp: 10,
  },
  imp: {
    name: 'Бес', model: 'imp', hp: 260, defP: 10, defM: 15, tier: 'light', speed: 5.0, walk: 1.6, radius: 0.45, height: 1.7,
    aggro: 15, attackRange: 1.8, atk: A('light', 0.45, 0.18, 0.6, 70), lunge: 5,
    knock: 0.8, style: 'dash', hitRadius: 0.6, xp: 18,
  },
  // KayKit Skeletons (CC0): the undead of the old mines and the dungeon (mocap-driven like the Bestiary).
  skeleton_minion: {
    name: 'Скелет-прислужник', model: 'skeleton_minion', hp: 200, defP: 10, defM: 10, tier: 'light', speed: 4.6, walk: 1.5, radius: 0.4, height: 1.45,
    aggro: 12, attackRange: 1.6, atk: A('light', 0.5, 0.12, 0.6, 60), lunge: 4.5,
    knock: 1.3, style: 'hop', hitRadius: 0.5, xp: 9,
  },
  skeleton_rogue: {
    name: 'Скелет-разбойник', model: 'skeleton_rogue', hp: 200, defP: 10, defM: 10, tier: 'light', speed: 5.4, walk: 1.7, radius: 0.42, height: 1.7,
    aggro: 14, attackRange: 9, keepAway: 5.5, atk: A('throw', 0.8, 0.1, 0.9, 50, { range: 11, speed: 16 }), lunge: 0,
    knock: 1.0, style: 'dash', hitRadius: 0.55, xp: 14,
  },
  skeleton_warrior: {
    name: 'Скелет-воин', model: 'skeleton_warrior', hp: 420, defP: 25, defM: 20, tier: 'medium', speed: 3.7, walk: 1.3, radius: 0.5, height: 1.85,
    aggro: 14, attackRange: 2.0, atk: A('medium', 0.8, 0.2, 0.9, 100), lunge: 3,
    knock: 0.6, style: 'hop', hitRadius: 0.65, xp: 24,
  },
  // Awakened stone guardians of the Astrarium (the demon body, cold grey-blue): armoured, a red heavy blow.
  guardian: {
    name: 'Каменный страж', model: 'demon', scale: 0.9, hp: 900, defP: 40, defM: 35, tier: 'heavy', speed: 2.6, walk: 1.1, radius: 0.58, height: 2.1,
    aggro: 14, attackRange: 2.2, atk: A('heavy', 1.25, 0.22, 1.0, 200, { aoe: 2.4 }), lunge: 2,
    knock: 0.4, style: 'brute', tint: [0.55, 0.68, 0.85], hitRadius: 0.75, xp: 22,
    // The armoured joint opens after a heavy swing and during a stagger (an amber glow): this is how the staff alone
    // can take a guardian down (the ritual, docs/combat/04 §5): the defence drops and the blows land harder.
    joint: { defP: 8, defM: 8, mul: 1.8 },
  },
  // The relay post's second kind of guard (chapter 6): lighter and quicker than the guardian — a rush and an open recovery.
  watcher: {
    name: 'Страж-наблюдатель', model: 'demon', scale: 0.78, hp: 520, defP: 25, defM: 20, tier: 'medium', speed: 4.6, walk: 1.4, radius: 0.5, height: 1.8,
    aggro: 16, attackRange: 2.0, atk: A('medium', 0.5, 0.2, 0.95, 90), lunge: 4.5,
    knock: 0.7, style: 'dash', tint: [0.6, 0.85, 1.1], hitRadius: 0.65, xp: 18,
  },
  demon: {
    name: 'Демон', model: 'demon', hp: 2400, defP: 25, defM: 25, tier: 'heavy', speed: 3.2, walk: 1.3, radius: 0.62, height: 2.35,
    aggro: 16, attackRange: 2.4, atk: A('heavy', 0.95, 0.22, 0.95, 180, { aoe: 2.7 }), atk2: A('wide', 0.8, 0.25, 0.85, 130, { arc: 170, reach: 3.0 }), lunge: 2.5,
    knock: 0.45, style: 'brute', hitRadius: 0.8, xp: 35,
  },
  archdemon: {
    name: 'Архидемон', model: 'demon', scale: 1.45, hp: 8000, defP: 30, defM: 30, tier: 'boss', speed: 3.4, walk: 1.4, radius: 0.9, height: 3.4,
    aggro: 20, attackRange: 3.2, atk: A('heavy', 1.0, 0.25, 1.0, 260, { aoe: 3.6 }), atk2: A('wide', 0.85, 0.3, 0.9, 170, { arc: 180, reach: 4.0 }), lunge: 3,
    knock: 0.25, style: 'brute', boss: true, tint: [1.35, 0.75, 0.75], hitRadius: 1.1, xp: 250,
  },
};
// The AI reads the flat fields; they come from the attack template.
for (const t of Object.values(TYPES)) {
  t.windup = t.atk.windup;
  t.strike = t.atk.strike;
  t.recover = t.atk.recover;
  t.damage = t.atk.damage;
  if (t.atk.aoe) t.aoe = t.atk.aoe;
}

/** Models animated by retargeted mocap clips (idle/walk/run/attack/hit/death). */
const MOCAP = new Set(['demon', 'puglin', 'imp', 'skeleton_minion', 'skeleton_rogue', 'skeleton_warrior']);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _move = new THREE.Vector3();
const _from = new THREE.Vector3();
const _v3 = new THREE.Vector3();
let nextId = 1;

export class Enemy {
  constructor(game, typeKey, position, camp) {
    this.id = nextId++;
    this.game = game;
    this.typeKey = typeKey;
    this.type = TYPES[typeKey];
    this.camp = camp;
    this.home = position.clone();
    this.maxHp = this.type.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'idle';
    this.stateTime = 0;
    this.cooldown = rand(0.2, 1);
    this.wanderTarget = null;
    this.wanderWait = rand(0.5, 3);
    this.losTimer = Math.random() * 0.3;
    this.canSee = false;
    this.aggroed = false;
    this.lastHitTime = -10;
    this.poise = new PoiseState(this.type.tier || 'light'); // stability (docs/combat/01 §8)
    this.wet = 0; // seconds of «Намокание» left
    this.staggerTime = 0;
    this.staggerKind = '';
    this.baseDefP = this.type.defP ?? 0;
    this.baseDefM = this.type.defM ?? 0;
    this.tier = this.type.tier || 'light';
    this.altAttack = false;
    this.windupTime = this.type.windup;
    this.respawnTimer = 0;
    this.struck = false;
    this.flash = 0;
    this.dissolve = 0;
    this.lungeDir = new THREE.Vector3();
    this.telegraph = null;

    this.root = new THREE.Group();
    this.root.name = 'Enemy:' + typeKey;
    this.pivot = new THREE.Group(); // procedural animation pivot (feet)
    this.root.add(this.pivot);
    this._buildVisual();

    this.collider = { x: position.x, y: position.y, z: position.z, r: this.type.radius, h: this.type.height, enabled: true, owner: this };
    this.controller = new CharacterController(game.world, {
      radius: Math.min(this.type.radius, 0.5),
      height: Math.max(1.0, this.type.height * 0.9),
      stepHeight: 0.38,
      owner: this.collider,
      move: { walkSpeed: this.type.walk, runSpeed: this.type.speed, groundAccel: 26, groundDecel: 20, turnSpeed: 9 },
    });
    this.controller.teleport(position, rand(-Math.PI, Math.PI));
    // Animation state (static meshes).
    this.a = { phase: Math.random() * 10, pitch: 0, roll: 0, y: 0, squash: 0, vPitch: 0, tumble: 0 };
    this.syncRoot();
  }

  /** Place the visual at the controller (also used while the enemy sleeps far away). */
  syncRoot() {
    const p = this.controller.position;
    this.root.position.set(p.x, p.y + this.controller.stepOffset, p.z);
    this.root.rotation.y = this.controller.yaw;
  }

  _buildVisual() {
    const inst = this.game.enemyAssets.instance(this.type.model);
    this.model = inst.object;
    this.uniforms = inst.uniforms;
    this.mixer = inst.mixer;
    this.actions = inst.actions;
    this.clipW = {};
    this.clip = null;
    const s = this.type.scale || 1;
    this.model.scale.setScalar(s);
    if (this.type.tint) this.uniforms.uTint.value.setRGB(...this.type.tint);
    this.pivot.add(this.model);
  }

  get position() {
    return this.controller.position;
  }

  get isBoss() {
    return !!this.type.boss;
  }

  // ---- combat target interface (src/combat/core/Damage.js) ---------------------------------------------
  get pos() {
    return this.controller.position;
  }
  get r() {
    return this.type.hitRadius;
  }
  get h() {
    return this.type.height;
  }
  get attack() {
    return this.altAttack && this.type.atk2 ? this.type.atk2 : this.type.atk;
  }
  /** Story shield (chapter 9): the side posts must be cut first. */
  immune() {
    return !!(this.shieldFlags && !this.shieldFlags.every((f) => this.game.rpg.state.flags[f]));
  }
  onImmune() {
    this.flash = 0.5;
    if (this.game.time - (this._shieldMsg ?? -99) > 4) {
      this._shieldMsg = this.game.time;
      this.game.hud?.toast('Щит держит: сними питание обоих боковых постов.', 3);
    }
  }
  /** A counter poke (Roxy) turns the blow aside: a short stagger, the swing is lost. */
  onDeflected() {
    if (this.state !== 'windup' && this.state !== 'strike') return;
    this.telegraph?.cancel();
    this.telegraph = null;
    this.stagger(0.55, 'deflect');
    this.a.vPitch -= 7;
    this.game.vfx.burst('hitSpark', this.chest(new THREE.Vector3()), 12);
  }

  /** World point at the chest (for hit FX, HP bars). */
  chest(target) {
    return target.copy(this.position).add(_v2.set(0, this.type.height * 0.6, 0));
  }

  head(target) {
    return target.copy(this.position).add(_v2.set(0, this.type.height + 0.25, 0));
  }

  /** An enemy with an armoured joint is open for the recovery of its swing and while it is staggered. */
  get jointOpen() {
    return !!this.type.joint && this.alive && (this.state === 'recover' || this.state === 'stagger' || this.poise?.reacting);
  }
  get defP() {
    return this.jointOpen ? Math.min(this.baseDefP, this.type.joint.defP) : this.baseDefP;
  }
  get defM() {
    return this.jointOpen ? Math.min(this.baseDefM, this.type.joint.defM) : this.baseDefM;
  }
  /** Damage multiplier read by the combat core at the moment of contact. */
  get vulnMul() {
    return this.jointOpen ? this.type.joint.mul : 1;
  }

  setState(s) {
    // Leaving the attack (or being interrupted) frees the attack slot for the next enemy.
    if (s !== 'windup' && s !== 'strike' && s !== 'recover') this.game.enemies.releaseSlot?.(this);
    if (this.state === 'windup' && s !== 'windup') this.uniforms.uFlashColor.value.setRGB(1, 1, 1);
    this.state = s;
    this.stateTime = 0;
    this.struck = false;
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    this.stateTime += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    // Wind-up tell: a glow that swells until the strike (orange for blockable blows, red for the ones to dodge).
    if (this.state === 'windup') {
      const k = this.stateTime / this.windupTime;
      this.flash = Math.max(this.flash, 0.15 + 0.6 * k + 0.12 * Math.sin(this.stateTime * 40));
    }
    if (this.type.joint && this.jointOpen) {
      this.flash = Math.max(this.flash, 0.2 + 0.05 * Math.sin(this.stateTime * 14));
      this.uniforms.uFlashColor.value.setRGB(1.0, 0.62, 0.2);
      this._jointGlow = true;
    } else if (this._jointGlow) {
      this._jointGlow = false;
      if (this.state !== 'windup') this.uniforms.uFlashColor.value.setRGB(1, 1, 1);
    }
    this.uniforms.uFlash.value = this.flash;
    if (this.wet > 0 && Math.random() < dt * 7) g.vfx.emit('waterTrail', this.chest(_v));

    if (this.state === 'dead') {
      this._updateDead(dt);
      return;
    }

    // The heroine this enemy is after (the nearest living one; the controlled one is slightly preferred).
    const tg = g.combat.targetFor(this);
    this.target = tg;
    const myPos = this.position;
    const pp = tg ? tg.pos : this.home;
    const dx = pp.x - myPos.x, dz = pp.z - myPos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayerYaw = Math.atan2(dx, dz);
    const playerAlive = !!tg;

    // Line of sight (throttled).
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.3;
      this.canSee = false;
      if (tg && dist < this.type.aggro * 1.4) {
        this.chest(_v);
        _v2.set(pp.x, pp.y + 1.2, pp.z).sub(_v);
        const d = _v2.length();
        const hit = g.world.raycast(_v, _v2.divideScalar(d), d);
        this.canSee = !hit;
      }
    }

    const cmd = { moveDir: _move.set(0, 0, 0), run: true, jumpPressed: false, jumpHeld: false, canMove: true, canJump: false };
    const leash = Math.hypot(myPos.x - this.home.x, myPos.z - this.home.z);
    const atk = this.attack;

    switch (this.state) {
      case 'idle': {
        cmd.run = false;
        if (this.wanderTarget) {
          _move.set(this.wanderTarget.x - myPos.x, 0, this.wanderTarget.z - myPos.z);
          if (_move.length() < 0.6 || this.stateTime > 8) {
            this.wanderTarget = null;
            this.wanderWait = rand(1.5, 4);
            _move.set(0, 0, 0);
          } else _move.normalize().multiplyScalar(0.8);
        } else {
          this.wanderWait -= dt;
          if (this.wanderWait <= 0) {
            const a = Math.random() * Math.PI * 2, r = rand(1.5, 6);
            this.wanderTarget = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
            this.stateTime = 0;
          }
        }
        if (playerAlive && ((this.canSee && dist < this.type.aggro) || dist < 4)) this._alert();
        break;
      }
      case 'alert': {
        cmd.faceYaw = toPlayerYaw;
        if (this.stateTime > 0.5) this.setState('chase');
        break;
      }
      case 'chase': {
        if (!playerAlive || leash > 38 || (dist > this.type.aggro * 2.2 && !this.canSee)) {
          this.setState('return');
          break;
        }
        this._chase(dt, dist, dx, dz, toPlayerYaw, cmd);
        break;
      }
      case 'windup': {
        cmd.faceYaw = toPlayerYaw;
        cmd.canMove = false;
        if (this.telegraph) this.telegraph.update(this.stateTime / this.windupTime);
        if (this.stateTime >= this.windupTime) {
          this.setState('strike');
          this._beginStrike(toPlayerYaw);
        }
        break;
      }
      case 'strike': {
        cmd.canMove = false;
        this._strike(dt, dist);
        if (this.stateTime >= atk.strike) {
          this.setState('recover');
          this.cooldown = rand(0.4, 1.1);
        }
        break;
      }
      case 'recover': {
        cmd.canMove = false;
        if (this.stateTime >= atk.recover) {
          // Light enemies hop back out of her face after a swing.
          if (dist < 1.1 && this.type.style !== 'brute') this.controller.addImpulse(_v.set(-dx / Math.max(dist, 1e-3), 0, -dz / Math.max(dist, 1e-3)).multiplyScalar(3));
          this.altAttack = !!this.type.atk2 && Math.random() < 0.4;
          this.setState('chase');
        }
        break;
      }
      case 'circle': {
        // Waiting for an attack slot: strafe around her at a respectful distance.
        if (!playerAlive || leash > 38) { this.setState('return'); break; }
        cmd.run = false;
        cmd.faceYaw = toPlayerYaw;
        const ring = this.type.attackRange + 1.6;
        const rx = dx / Math.max(dist, 1e-3), rz = dz / Math.max(dist, 1e-3);
        this.orbitT = (this.orbitT ?? 0) - dt;
        if (this.orbitT <= 0 || (this.stateTime > 0.4 && this.controller.horizontalSpeed < 0.2)) { this.orbitSign = -(this.orbitSign || 1); this.orbitT = rand(1.2, 2.8); }
        _move.set(-rz * this.orbitSign * 0.8 + rx * (dist - ring) * 0.6, 0, rx * this.orbitSign * 0.8 + rz * (dist - ring) * 0.6);
        if (_move.lengthSq() > 1) _move.normalize();
        if ((this.cooldown <= 0 && g.enemies.slotFree?.(this)) || dist > ring + 2.5) this.setState('chase');
        break;
      }
      case 'stagger': {
        // Stability broken: no new action for the duration of the reaction (0.65 / 1.0 / 1.2 / 1.6 s).
        cmd.canMove = false;
        if (this.stateTime >= this.staggerTime) this.setState('chase');
        break;
      }
      case 'hurt': {
        cmd.canMove = false;
        if (this.stateTime >= 0.38) this.setState('chase');
        break;
      }
      case 'airborne': {
        cmd.canMove = false;
        if (this.controller.grounded && this.stateTime > 0.35) {
          if (this.hp <= 0) this._die();
          else this.setState('getup');
        }
        break;
      }
      case 'getup': {
        cmd.canMove = false;
        if (this.stateTime > 0.7) this.setState('chase');
        break;
      }
      case 'return': {
        cmd.run = false;
        _move.set(this.home.x - myPos.x, 0, this.home.z - myPos.z);
        if (_move.length() < 1.5) {
          this.setState('idle');
          this.aggroed = false;
          _move.set(0, 0, 0);
        } else _move.normalize();
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
        if (playerAlive && this.canSee && dist < this.type.aggro * 0.7 && this.stateTime > 1.5) this._alert();
        break;
      }
    }

    // Separation from other enemies.
    for (const o of g.enemies.near(myPos, 2.5)) {
      if (o === this || !o.alive) continue;
      _v.subVectors(myPos, o.position);
      _v.y = 0;
      const d = _v.length();
      const min = this.type.radius + o.type.radius;
      if (d < min && d > 1e-3) this.controller.extVel.addScaledVector(_v.divideScalar(d), (min - d) * 6 * dt * 10);
    }

    // Never walk into lava (they can still be knocked into it).
    if (cmd.moveDir.lengthSq() > 0.01 && isLavaXZ(myPos.x + cmd.moveDir.x * 1.2, myPos.z + cmd.moveDir.z * 1.2)) {
      cmd.moveDir.set(0, 0, 0);
      if (this.state === 'idle') this.wanderTarget = null;
    }
    this.controller.update(dt, cmd);
    const p = this.position;
    this.syncRoot();
    this.collider.x = p.x;
    this.collider.y = p.y;
    this.collider.z = p.z;

    this.animate(dt);
    if (p.y < -40) this._respawn();
  }

  _alert() {
    if (this.state === 'alert' || this.state === 'chase') return;
    this.setState('alert');
    this.aggroed = true;
    this.game.worldUI?.alert(this);
    // Wake up camp-mates.
    for (const o of this.game.enemies.list) {
      if (o !== this && o.camp === this.camp && o.alive && o.state === 'idle' && o.position.distanceTo(this.position) < 14) {
        o.setState('alert');
        o.aggroed = true;
      }
    }
  }

  _chase(dt, dist, dx, dz, yaw, cmd) {
    const t = this.type;
    const atk = this.attack;
    const ranged = atk.kind === 'throw';
    if (ranged) {
      // A thrower keeps its distance: backs off when she gets close, closes in when she is far.
      const lo = t.keepAway, hi = atk.range * 0.85;
      if (dist < lo) cmd.moveDir.set(-dx / dist, 0, -dz / dist);
      else if (dist > hi) cmd.moveDir.set(dx / dist, 0, dz / dist);
      else cmd.faceYaw = yaw;
      if (dist < lo) cmd.faceYaw = yaw;
      if (dist < atk.range && dist > 2 && this.cooldown <= 0 && this.canSee && this.game.enemies.takeRangedSlot(this)) {
        this._startWindup(dist, 'throw');
      }
      return;
    }
    if (dist > t.attackRange * 0.85) {
      cmd.moveDir.set(dx / dist, 0, dz / dist);
    } else {
      cmd.faceYaw = yaw;
    }
    if (dist < t.attackRange && this.cooldown <= 0 && this.canSee) {
      // At most two melee enemies attack at once; the rest circle and wait their turn.
      if (!this.game.enemies.takeSlot(this)) {
        if (dist < t.attackRange + 2.5) this.setState('circle');
        return;
      }
      this._startWindup(dist, atk.kind);
    }
  }

  /** Begin the telegraphed attack. A blow from behind the camera gets at least 0.7 s of audible warning. */
  _startWindup(dist, kind) {
    const g = this.game;
    const atk = this.attack;
    let w = atk.windup;
    const cam = g.cameraRig;
    if (cam) {
      cam.getForward(_v);
      _v2.subVectors(this.position, g.camera.position).setY(0);
      const l = _v2.length();
      const behind = l > 1e-3 && _v.dot(_v2.divideScalar(l)) < 0.1;
      if (behind) w = Math.max(w, 0.7);
    }
    this.windupTime = w;
    this.setState('windup');
    g.audio?.play('windup', { dist, vol: kind === 'heavy' || kind === 'wide' ? 0.95 : 0.6 });
    const red = kind === 'heavy' || kind === 'wide' || kind === 'aoe';
    this.uniforms.uFlashColor.value.setRGB(red ? 1 : 1, red ? 0.12 : 0.42, red ? 0.08 : 0.1);
    this._showTelegraph(kind);
  }

  _beginStrike(yaw) {
    const t = this.type;
    const atk = this.attack;
    this.lungeDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    const tg = this.target;
    this.strikeYaw = yaw;
    this.game.audio?.play?.('swing');
    if (atk.kind === 'throw') {
      this._throw(yaw);
      return;
    }
    // Lunge less when already close: they stop about a metre from her instead of hugging.
    const d = tg ? Math.hypot(tg.pos.x - this.position.x, tg.pos.z - this.position.z) : 9;
    this.controller.addImpulse(_v.copy(this.lungeDir).multiplyScalar(t.lunge * clamp((d - 0.9) / t.attackRange, 0, 1)));
    if (atk.kind === 'heavy' || atk.kind === 'aoe') this._slam();
  }

  _strike() {
    const atk = this.attack;
    if (this.struck || atk.kind === 'heavy' || atk.kind === 'aoe' || atk.kind === 'throw') return;
    const g = this.game;
    const wide = atk.kind === 'wide';
    const reach = wide ? atk.reach : this.type.style === 'dash' ? 1.25 : this.type.attackRange * 0.9 + 0.35;
    const halfArc = wide ? ((atk.arc || 150) * Math.PI) / 360 : 0.95;
    let any = false;
    for (const h of g.combat.livingHeroes()) {
      _v.subVectors(h.pos, this.position);
      const vy = _v.y;
      _v.y = 0;
      const d = _v.length();
      if (d > reach + 0.3 || Math.abs(vy) > 2) continue;
      const ang = d > 1e-3 ? Math.acos(clamp(_v.dot(this.lungeDir) / d, -1, 1)) : 0;
      if (ang > halfArc) continue;
      any = true;
      g.combat.hitParty(h.id, { dmg: atk.damage, kind: atk.kind === 'medium' ? 'medium' : atk.kind === 'wide' ? 'wide' : 'light', from: this.position, parryable: atk.kind === 'light', attacker: this, knock: this.type.style === 'dash' ? 6 : 5 });
    }
    if (any) this.struck = true;
  }

  _throw(yaw) {
    const g = this.game;
    const atk = this.attack;
    const tg = this.target;
    if (!tg) return;
    this.chest(_v);
    // The projectile flies along the line fixed at the throw; a heroine who steps aside is missed.
    _v2.set(tg.pos.x, tg.pos.y + 1.0, tg.pos.z).sub(_v);
    const l = _v2.length() || 1;
    g.projectiles.spawnEnemy(_v, _v2.divideScalar(l), atk.speed, atk.damage, this);
    this.struck = true;
  }

  _showTelegraph(kind) {
    const atk = this.attack;
    const yaw = this.controller.yaw;
    const c = this.game.combat;
    if (kind === 'heavy' || kind === 'aoe') {
      const ctr = _v.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(this.type.attackRange * 0.7).add(this.position);
      this.slamCenter = ctr.clone();
      this.telegraph = c.telegraph(this.slamCenter, atk.aoe || this.type.aoe || 2.4, this.windupTime);
    } else if (kind === 'wide') {
      this.telegraph = c.telegraph(this.position.clone(), atk.reach, this.windupTime, { yaw, arc: atk.arc || 150 });
    } else if (kind === 'throw') {
      const tg = this.target;
      if (tg) this.telegraph = c.telegraphLine(this.position, tg.pos, this.windupTime);
    }
  }

  _slam() {
    const g = this.game;
    const atk = this.attack;
    const c = this.slamCenter || this.position;
    this.telegraph?.finish();
    this.telegraph = null;
    g.vfx.burst('groundDust', c, 22, { scale: 0.45 });
    g.vfx.burst('sparks', c, 16, { scale: 0.4 });
    g.combat.groundImpact(c, atk.aoe || this.type.aoe);
    g.audio?.play('slam', { dist: g.player.position.distanceTo(c) });
    const d = g.player.position.distanceTo(c);
    g.cameraRig.addTrauma(clamp(0.5 - d / 30, 0.05, 0.45));
    for (const h of g.combat.livingHeroes()) {
      const dd = Math.hypot(h.pos.x - c.x, h.pos.z - c.z);
      if (dd < (atk.aoe || this.type.aoe) + 0.3 && Math.abs(h.pos.y - c.y) < 1.6) {
        g.combat.hitParty(h.id, { dmg: atk.damage, kind: 'heavy', from: c, attacker: this, knock: 8, heavy: true });
      }
    }
  }

  // ---------------------------------------------------------------------------
  /** A short reaction when the stability is broken (also: a counter poke deflecting the swing). */
  stagger(duration, kind) {
    this.telegraph?.cancel();
    this.telegraph = null;
    this.staggerTime = duration;
    this.staggerKind = kind;
    this.setState('stagger');
    this.a.vPitch -= kind === 'boss' ? 4 : 6;
  }

  /** Called by the combat core after the damage was applied (src/combat/core/Damage.js applyHit). */
  onHit(res) {
    const g = this.game;
    const hit = res.hit;
    this.flash = 1;
    this.lastHitTime = g.time;
    this.aggroed = true;
    const explosive = hit.tags?.includes('explosive');
    const from = _from.set(hit.from?.x ?? this.position.x, this.position.y, hit.from?.z ?? this.position.z);
    this.chest(_v);
    g.worldUI?.damage(_v.clone(), res.dmg, !!(explosive || res.wetBonus || res.dmg >= 150));
    if (res.wetBonus) g.worldUI?.text?.(this.position, 'Намокшая цель +10%');
    g.audio?.play(res.dmg >= 150 ? 'hitHeavy' : 'hit');
    _v2.subVectors(this.position, from).setY(0);
    if (_v2.lengthSq() < 1e-6) _v2.set(0, 0, 1);
    _v2.normalize();
    const push = hit.push;
    if (res.killed) {
      this.hp = 0;
      const blast = push?.blast;
      this.controller.addImpulse(_v2.multiplyScalar((blast ? 9 : 4) * this.type.knock).setY(blast ? 9 : 3));
      this.a.tumble = (Math.random() < 0.5 ? -1 : 1) * (blast ? 9 : 3);
      this.telegraph?.cancel();
      this.telegraph = null;
      this.setState('airborne');
      this.alive = false;
      g.enemies.onKilled(this);
      return;
    }
    if (push?.blast) {
      // Explosion: light and medium enemies are thrown, heavy ones only flinch.
      const k = this.tier === 'light' ? 1 : this.tier === 'medium' ? 0.5 : 0;
      if (k > 0) {
        this.controller.addImpulse(_v2.multiplyScalar(7 * k).setY(6 * k));
        this.a.tumble = (Math.random() < 0.5 ? -1 : 1) * 7 * k;
      }
    } else if (push && push.dist > 0) {
      this._push(push, _v2);
    }
    if (res.reaction) {
      this.stagger(res.reaction.duration, res.reaction.tier);
    } else {
      this.a.vPitch -= 3; // a small flinch: not an interruption
    }
    if (this.state === 'idle' || this.state === 'return') this._alert();
  }

  /** Displace by `push.dist` metres (away from the source or towards it), stopping before walls and bodies. */
  _push(push, away) {
    const g = this.game;
    let dist = push.dist;
    const dir = _v3.copy(away);
    if (push.dir === 'toward') {
      dir.negate();
      if (push.to) {
        const d = Math.hypot(push.to.x - this.position.x, push.to.z - this.position.z);
        dist = Math.min(dist, Math.max(0, d - (push.stopAt ?? 1)));
      }
    }
    if (dist <= 0.02) return;
    // Free path: no wall within the distance (at knee height).
    _v.copy(this.position).setY(this.position.y + 0.5);
    const wall = g.world.raycast(_v, dir, dist + this.type.radius);
    if (wall) dist = Math.max(0, wall.distance - this.type.radius - 0.05);
    for (const o of g.enemies.near(this.position, dist + 1.5)) {
      if (o === this || !o.alive) continue;
      _v2.subVectors(o.position, this.position).setY(0);
      const along = _v2.dot(dir);
      if (along > 0 && along < dist + 0.6 && Math.abs(_v2.x * dir.z - _v2.z * dir.x) < o.type.radius + this.type.radius) dist = Math.max(0, along - o.type.radius - this.type.radius);
    }
    if (dist > 0.02) this.controller.addImpulse(dir.multiplyScalar(dist * 7)); // extVel decays ~ e^(-7t): total ≈ impulse/7
  }

  /** Legacy damage (lava, scripted): bypasses the core, no stability change. */
  takeHit(damage, from, knock = 4, heavy = false) {
    if (!this.alive || this.state === 'dead') return false;
    if (this.immune()) { this.onImmune(); return false; }
    this.hp -= damage;
    this.flash = 1;
    this.lastHitTime = this.game.time;
    this.aggroed = true;
    if (this.hp <= 0) {
      _v.subVectors(this.position, from).setY(0).normalize();
      this.controller.addImpulse(_v.multiplyScalar(knock * this.type.knock * 1.6).setY(heavy ? 5 : 3));
      this.setState('airborne');
      this.alive = false;
      this.game.enemies.onKilled(this);
      return true;
    }
    if (this.state === 'idle' || this.state === 'return') this._alert();
    return false;
  }

  _die() {
    this.setState('dead');
    this.alive = false;
    this.collider.enabled = false;
    this.telegraph?.cancel();
    this.telegraph = null;
    this.game.enemies.dropLoot(this);
  }

  _updateDead(dt) {
    const a = this.a;
    if (this.mixer && MOCAP.has(this.type.model)) {
      this._animateClips(dt);
    } else {
      if (this.mixer) this.mixer.update(dt);
      a.pitch = damp(a.pitch, -1.45, 6, dt);
      a.y = damp(a.y, -0.05, 4, dt);
    }
    this._applyPivot();
    if (this.stateTime > 0.7) {
      this.dissolve = Math.min(1, this.dissolve + dt * 0.9);
      this.uniforms.uDissolve.value = this.dissolve;
      if (Math.random() < dt * 30 * (1 - this.dissolve)) {
        this.chest(_v).add(_v2.set(rand(-0.4, 0.4), rand(-0.6, 0.3), rand(-0.4, 0.4)));
        this.game.vfx.emit('ember', _v, { spread: 0.3, speed: 1.2 });
      }
    }
    if (this.dissolve >= 1) {
      this.root.visible = false;
      if (this.noRespawn) {
        this.game.enemies.remove(this);
        return;
      }
      this.respawnTimer += dt;
      const far = this.game.player.position.distanceTo(this.home) > 45;
      if (this.respawnTimer > 60 && far && !this.type.boss) this._respawn();
      if (this.respawnTimer > 150 && far && this.type.boss) this._respawn();
    }
  }

  _respawn() {
    this.hp = this.maxHp;
    this.alive = true;
    this.aggroed = false;
    this.dissolve = 0;
    this.uniforms.uDissolve.value = 0;
    this.respawnTimer = 0;
    this.poise = new PoiseState(this.tier);
    this.wet = 0;
    this.root.visible = true;
    this.collider.enabled = true;
    this.a.pitch = this.a.roll = this.a.y = this.a.tumble = 0;
    this.clip = null;
    this.controller.teleport(this.home.clone().setY(this.game.world.groundAt(this.home.x, this.home.z, this.home.y + 6) + 0.05), rand(-3, 3));
    this.syncRoot();
    this.setState('idle');
  }

  /** Reset after the player dies (enemies forget her and walk home healed). */
  reset() {
    if (this.state === 'dead') return;
    this.hp = this.maxHp;
    this.aggroed = false;
    this.wet = 0;
    this.poise = new PoiseState(this.tier);
    this.telegraph?.cancel();
    this.telegraph = null;
    this.setState('return');
  }

  // ---------------------------------------------------------------------------
  /** Procedural animation for static meshes (pivot at the feet). */
  animate(dt) {
    if (this.mixer) this._animateClips(dt);
    const a = this.a;
    const t = this.type;
    if (MOCAP.has(this.type.model) && this.state !== 'airborne' && this.state !== 'dead') {
      // Fully mocap-driven: keep the pivot neutral.
      a.pitch = damp(a.pitch, 0, 10, dt);
      a.roll = damp(a.roll, 0, 10, dt);
      a.y = damp(a.y, 0, 10, dt);
      a.squash = damp(a.squash, 0, 10, dt);
      this._applyPivot();
      return;
    }
    const c = this.controller;
    const speed = c.horizontalSpeed;
    const big = t.style === 'brute';
    a.phase += dt * (speed * (big ? 2.2 : 3.6) + 1.2);
    let tp = 0, tr = 0, ty = 0, ts = 0;
    const st = this.state;
    const k = this.stateTime;
    if (st === 'stagger') {
      tp = -0.35;
      ts = 0.1;
      tr = Math.sin(k * 30) * 0.05;
    } else if (st === 'windup') {
      const n = clamp(k / this.windupTime, 0, 1);
      tp = big ? -0.35 * n : -0.3 * n;
      ts = big ? 0.12 * n : -0.14 * n;
      tr = Math.sin(k * 50) * 0.03 * n;
    } else if (st === 'strike') {
      tp = big ? 0.55 : 0.45;
      ts = big ? -0.14 : 0.1;
    } else if (st === 'recover') {
      tp = 0.25 * (1 - k / this.attack.recover);
    } else if (st === 'alert') {
      ty = Math.sin(Math.min(k / 0.3, 1) * Math.PI) * 0.25;
      ts = 0.06;
    } else if (st === 'airborne') {
      a.pitch += a.tumble * dt;
      a.tumble = damp(a.tumble, 0, 1.5, dt);
    } else if (st === 'getup') {
      tp = 0.3 * (1 - k / 0.7);
    } else if (speed > 0.3) {
      const s = Math.sin(a.phase), ab = Math.abs(s);
      if (t.style === 'hop') {
        ty = ab * 0.13;
        ts = (ab - 0.5) * 0.12;
        tr = s * 0.1;
        tp = 0.15;
      } else if (t.style === 'dash') {
        ty = ab * 0.06;
        tr = s * 0.07;
        tp = 0.18;
      } else {
        ty = ab * 0.05;
        tr = s * 0.09;
        tp = 0.08;
        ts = -ab * 0.04;
      }
      tp *= speed / t.speed;
    } else {
      const br = Math.sin(a.phase * 0.6);
      ts = br * 0.025;
      tr = Math.sin(a.phase * 0.25) * 0.03;
    }
    if (st !== 'airborne') {
      a.vPitch += ((tp - a.pitch) * 140 - a.vPitch * 16) * dt;
      a.pitch += a.vPitch * dt;
    }
    a.roll = damp(a.roll, tr, 12, dt);
    a.y = damp(a.y, ty, 18, dt);
    a.squash = damp(a.squash, ts, 16, dt);
    this._applyPivot();
  }

  /** Skeletal clips (demon: retargeted mocap; mushroom: its own idle/walk). */
  _animateClips(dt) {
    const acts = this.actions;
    const st = this.state;
    const c = this.controller;
    const demon = MOCAP.has(this.type.model);
    let want = 'idle', fade = 0.25;
    const spd = c.horizontalSpeed;
    if (demon) {
      if (st === 'dead' || (st === 'airborne' && this.hp <= 0)) { want = 'death'; fade = 0.12; }
      else if (st === 'hurt' || st === 'stagger' || st === 'airborne' || st === 'getup') { want = 'hit'; fade = 0.06; }
      else if (st === 'windup' || st === 'strike' || st === 'recover') { want = 'attack'; fade = 0.12; }
      else if (spd > 2.2) want = 'run';
      else if (spd > 0.25) want = 'walk';
    } else {
      want = spd > 0.25 ? 'walking' : 'idle';
    }
    if (want !== this.clip) {
      const a = acts[want];
      a.reset();
      const once = want === 'attack' || want === 'hit' || want === 'death';
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.play();
      if (want === 'attack') {
        // Land the blow exactly when the telegraph completes.
        const dur = a.getClip().duration;
        a.timeScale = (this.game.enemyAssets.strike[this.type.model] * dur) / this.windupTime;
        this._attackSlow = true;
      } else a.timeScale = 1;
      this.clip = want;
      this.clipFade = fade;
    }
    if (want === 'attack' && st !== 'windup' && this._attackSlow) {
      acts.attack.timeScale = 1.1;
      this._attackSlow = false;
    }
    if (want === 'walk' || want === 'run' || want === 'walking') {
      const ref = want === 'run' ? 3.2 : want === 'walk' ? 1.5 : 1.2;
      acts[want].timeScale = THREE.MathUtils.clamp(spd / ref, 0.5, 2.2) * (this.type.scale ? 1 / this.type.scale : 1);
    }
    // Cross-fade by explicit weights.
    let total = 0;
    for (const n in acts) {
      const tgt = n === this.clip ? 1 : 0;
      const w0 = this.clipW[n] || 0;
      const w = tgt > w0 ? Math.min(1, w0 + dt / this.clipFade) : Math.max(0, w0 - dt / this.clipFade);
      this.clipW[n] = w;
      total += w;
    }
    for (const n in acts) {
      const w = total > 0 ? this.clipW[n] / total : 0;
      acts[n].setEffectiveWeight(w);
      if (w <= 0 && n !== this.clip && acts[n].isRunning()) acts[n].stop();
    }
    this.mixer.update(dt);
  }

  _applyPivot() {
    const a = this.a;
    const p = this.pivot;
    p.position.y = a.y;
    p.rotation.set(a.pitch, 0, a.roll, 'YXZ');
    const sy = 1 + a.squash;
    p.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  }
}

