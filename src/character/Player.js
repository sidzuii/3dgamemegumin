import * as THREE from 'three';
import { MeguminModel } from './MeguminModel.js';
import { RoxyModel } from './RoxyModel.js';
import { CharacterController, MOVE } from './CharacterController.js';
import { clamp } from '../core/math.js';
import { REGION } from '../world/MapData.js';

/**
 * The playable Megumin: model + controller + animation state machine + vitals.
 *
 * Action states (gate input):  none | cast | exhausted
 * Animation states:            Idle Walk Run Jump Fall Land Cast Release Exhausted
 */

const STAMINA = {
  max: 100,
  runDrain: 6.5,
  jumpCost: 6,
  regen: 32,
  regenDelay: 0.45,
  recoverThreshold: 20, // after hitting 0, sprint unlocks again at this value
};

const _move = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _localVel = new THREE.Vector3();
const _localAcc = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.models = { megumin: new MeguminModel(), roxy: new RoxyModel() };
    this.animators = {};
    this.character = 'megumin';
    this.model = this.models.megumin;
    this.switchCooldown = 0;
    this.controller = null; // created once the world exists (finishLoad)
    this.anim = null; // created once the rig is loaded
    this.spawnPoint = REGION.axel.spawn.clone(); // replaced by the save / a checkpoint
    this.spawnYaw = Math.PI; // facing -Z

    this.hp = 100;
    this.maxHp = 100;
    this.mana = 100;
    this.maxMana = 100;
    this.level = 1;
    this.xp = 0;
    this.stamina = STAMINA.max;
    this.staminaDepleted = false;
    this.staminaDelay = 0;

    this.action = 'none';
    this.actionTime = 0;
    this.exhaustDuration = 3.2;
    this.castCharge = 0;
    this.castTarget = new THREE.Vector3();
    this.landTimer = 0;
    this.lastStepPhase = 0;
    this.respawnPending = false;
    this.invuln = 0;
    this.envSpeedMul = 1; // water / terrain slowdown set by the world each frame
  }

  /** Called after the model is loaded and the world is built. */
  finishLoad() {
    this.controller = new CharacterController(this.game.world);
    for (const [k, m] of Object.entries(this.models)) this.animators[k] = m.setupAnimation(this.game.animLib);
    this.anim = this.animators[this.character];
    this.game.scene.add(this.model.root);
    this.respawn();
  }

  get position() {
    return this.controller.position;
  }

  /** An enemy is chasing her nearby (no chatting in the middle of a fight). */
  get inCombat() {
    const list = this.game.enemies?.list;
    if (!list) return false;
    for (const e of list) {
      if (e.alive && e.aggroed && (e.state === 'chase' || e.state === 'windup' || e.state === 'strike') && e.position.distanceTo(this.position) < 14) return true;
    }
    return false;
  }

  get stateLabel() {
    if (this.action === 'exhausted') return 'Истощена';
    if (this.action === 'cast') return this.anim.state === 'Release' ? 'EXPLOSION!' : 'Чтение заклинания…';
    return this.anim.state;
  }

  respawn(keepVitals = false) {
    const p = this.spawnPoint.clone();
    p.y = this.game.world.groundAt(p.x, p.z) + 0.05;
    this.controller.teleport(p, this.spawnYaw);
    if (!keepVitals) {
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      this.stamina = STAMINA.max;
    }
    this.action = 'none';
    this.anim.set('Idle', true);
    this.game.cameraRig?.snapBehind(this.spawnYaw + Math.PI);
  }

  /** Level + equipment -> max HP / mana (current values are kept within the new limits). */
  applyStats() {
    const pa = this.game.inventory?.passives() || { maxHp: 0, maxMana: 0 };
    this.maxHp = 100 + (this.level - 1) * 12 + pa.maxHp;
    this.maxMana = 100 + (this.level - 1) * 8 + pa.maxMana;
    this.hp = Math.min(this.hp, this.maxHp);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  restoreMana(n) {
    this.mana = Math.min(this.maxMana, this.mana + n);
  }

  /** Is Roxy travelling with Megumin (chapter 4+)? */
  get companionUnlocked() {
    return !!this.game.rpg?.state.flags.roxy_companion;
  }

  /** Swap the controlled character (shared position, HP and stamina). */
  switchCharacter(to, force = false) {
    const g = this.game;
    const next = to || (this.character === 'megumin' ? 'roxy' : 'megumin');
    if (next === this.character) return false;
    if (next === 'roxy' && !force && !this.companionUnlocked) return false;
    if (this.action !== 'none' || g.combat?.attacking || g.ability?.casting || this.switchCooldown > 0) return false;
    const old = this.model;
    g.scene.remove(old.root);
    this.character = next;
    this.model = this.models[next];
    this.anim = this.animators[next];
    this.anim.set('Idle', true);
    this.anim.stopAction();
    g.scene.add(this.model.root);
    this.model.root.position.copy(this.controller.position);
    this.model.root.rotation.y = this.controller.yaw;
    g.ability = g.abilities[next];
    this.switchCooldown = 1;
    const c = _v.set(this.position.x, this.position.y + 1, this.position.z);
    g.vfx.burst('magicPop', c, 40);
    g.vfx.burst(next === 'roxy' ? 'waterSplash' : 'fireBurst', c, 30);
    g.hud.setCharacter(next);
    return true;
  }

  /** Set a respawn checkpoint (called when discovering a location). */
  setCheckpoint(p, yaw) {
    this.spawnPoint.copy(p);
    this.spawnYaw = yaw;
  }

  // ---- vitals ---------------------------------------------------------------
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  restoreStamina(n) {
    this.stamina = Math.min(STAMINA.max, this.stamina + n);
    if (this.stamina >= STAMINA.recoverThreshold) this.staminaDepleted = false;
  }
  damage(n) {
    if (n <= 0 || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.game.hud.damageFlash();
    if (this.hp <= 0) {
      this.game.combat?.cancel();
      this.collapse(3.0);
      this.respawnPending = true;
      const who = this.character === 'roxy' ? 'Рокси' : 'Мегумин';
      this.game.hud.toast(`${who} без сил… Пробуждение у последней контрольной точки.`, 3);
    }
  }

  /** Hit by an enemy: damage, knockback, flinch, brief invulnerability. */
  takeHit(dmg, from, knock = 5, heavy = false) {
    if (this.invuln > 0 || this.hp <= 0 || this.action === 'exhausted') return false;
    this.invuln = 0.5;
    dmg = Math.max(1, Math.round(dmg * (this.game.inventory?.passives().defenseMul ?? 1)));
    this.damage(dmg);
    _v.set(this.position.x - from.x, 0, this.position.z - from.z);
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
    _v.normalize().multiplyScalar(knock);
    _v.y = heavy ? 5 : 0;
    this.controller.addImpulse(_v);
    this.game.cameraRig.addTrauma(heavy ? 0.4 : 0.22);
    if (this.hp > 0 && this.action === 'none') {
      this.game.combat?.cancel();
      this.anim.playAction('Hit');
    }
    this.game.vfx.burst('hitSpark', _v.set(this.position.x, this.position.y + 1.0, this.position.z), 10);
    return true;
  }

  canAttack(ongoing = false) {
    return this.action === 'none' && this.hp > 0 && (ongoing || this.controller.grounded);
  }

  // ---- ability hooks ----------------------------------------------------------
  canCast() {
    return this.action === 'none' && this.controller.grounded;
  }

  beginCast(target) {
    this.action = 'cast';
    this.actionTime = 0;
    this.castTarget.copy(target);
    this.castCharge = 0;
    this.anim.set('Cast');
  }

  release() {
    this.anim.set('Release');
  }

  collapse(duration) {
    this.action = 'exhausted';
    this.actionTime = 0;
    this.exhaustDuration = duration;
    this.anim.ctx.exhaustDuration = duration;
    this.anim.set('Exhausted', true);
    this.stamina = 0;
    this.staminaDepleted = true;
    this.staminaDelay = duration;
  }

  shockwaveHit(center, dist) {
    // Cape & hair whip from the blast wind; small stagger.
    _v.set(this.position.x - center.x, 0, this.position.z - center.z).normalize();
    const yaw = this.controller.yaw;
    const lx = _v.x * Math.cos(-yaw) + _v.z * Math.sin(-yaw);
    const lz = -_v.x * Math.sin(-yaw) + _v.z * Math.cos(-yaw);
    const f = clamp(1.2 - dist / 40, 0.3, 1);
    this.anim.capeWind.x += lx * 0.35 * f;
    this.anim.capeWind.z += lz * 0.5 * f;
    this.anim.capeWind.y += 0.2 * f;
    this.anim.gust += 0.9 * f;
    this.anim.lean.vRoll += lx * 2.5 * f;
    this.anim.lean.vPitch -= lz * 2.0 * f;
  }

  explosionNearby(center) {
    const d = Math.hypot(this.position.x - center.x, this.position.z - center.z);
    if (d < 10) this.damage(Math.round(60 * (1 - d / 10)) + 10);
  }

  // ---- main update ------------------------------------------------------------
  update(dt, input, cameraRig) {
    const c = this.controller;
    this.actionTime += dt;

    // --- Action state transitions ---
    this.invuln = Math.max(0, this.invuln - dt);
    this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    if (this.action === 'exhausted' && this.actionTime >= this.exhaustDuration) {
      this.action = 'none';
      if (this.respawnPending) {
        this.respawnPending = false;
        this.respawn();
        this.game.enemies?.resetAggro();
      }
    }
    if (this.action === 'cast' && this.anim.state === 'Release' && this.actionTime > 6) {
      this.action = 'none'; // safety (collapse normally happens first)
    }

    // --- Input -> movement command ---
    const canMove = this.action === 'none';
    let ix = 0, iz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    cameraRig.getForward(_fwd);
    cameraRig.getRight(_right);
    _move.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
    if (_move.lengthSq() > 1) _move.normalize();
    const combat = this.game.combat;
    const attacking = !!combat?.attacking;
    const moving = _move.lengthSq() > 0.01 && canMove;
    this.moveInput = moving;

    const wantsRun = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && moving;
    const run = wantsRun && !this.staminaDepleted && this.stamina > 0 && !attacking;

    let jumpPressed = input.wasPressed('Space') && canMove && !attacking;
    const canJump = this.stamina >= STAMINA.jumpCost * 0.5 || this.controller.grounded;

    const cmd = {
      moveDir: _move,
      run,
      jumpPressed,
      jumpHeld: input.isDown('Space'),
      canMove,
      canJump,
      speedMul: (attacking ? 0.3 : 1) * this.envSpeedMul,
    };
    if (attacking) {
      cmd.faceYaw = combat.faceYaw;
      cmd.faceRate = 22;
    }
    if (this.action === 'cast') {
      cmd.faceYaw = Math.atan2(this.castTarget.x - c.position.x, this.castTarget.z - c.position.z);
    }
    c.update(dt, cmd);
    const ev = c.events;

    // --- Stamina ---
    const speed = c.horizontalSpeed;
    if (run && c.grounded && speed > MOVE.walkSpeed + 0.3) {
      this.stamina -= STAMINA.runDrain * dt * (this.game.inventory?.passives().runDrainMul ?? 1);
      this.staminaDelay = STAMINA.regenDelay;
    }
    if (ev.jumped) {
      this.stamina -= STAMINA.jumpCost;
      this.staminaDelay = STAMINA.regenDelay;
    }
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.staminaDepleted = true;
    }
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    // Mana regenerates slowly (faster while resting).
    if (this.action !== 'cast' && this.hp > 0) {
      const regen = (speed < 0.5 ? 3.2 : 2.0) * (this.game.inventory?.passives().manaRegenMul ?? 1);
      this.mana = Math.min(this.maxMana, this.mana + regen * dt);
    }
    if (this.staminaDelay <= 0 && this.action !== 'exhausted') {
      this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * dt * (c.grounded ? 1 : 0.4));
    }
    if (this.staminaDepleted && this.stamina >= STAMINA.recoverThreshold) this.staminaDepleted = false;

    // --- Events: jump / land ---
    const vfx = this.game.vfx;
    if (ev.jumped) {
      vfx.burst('dust', this.position, 6, { speed: 0.8, scale: 0.8, alpha: 0.35 });
    }
    if (ev.landed) {
      const s = ev.landSpeed;
      const intensity = clamp((s - 2) / 12, 0, 1);
      if (s > 3) {
        this.anim.ctx.landIntensity = 0.35 + intensity * 0.65;
        if (this.action === 'none') this.anim.set('Land', true);
        this.landTimer = 0.16 + intensity * 0.18;
        cameraRig.impulse(-0.6 - intensity * 1.6);
        vfx.burst('dust', this.position, 6 + Math.round(intensity * 14), { speed: 1 + intensity * 1.5, alpha: 0.45 });
      }
      if (s > 16) this.damage(Math.round((s - 16) * 7));
      if (s > 10) cameraRig.addTrauma(0.12 + intensity * 0.25);
    }
    this.landTimer = Math.max(0, this.landTimer - dt);

    // --- Animation state selection ---
    if (this.action === 'none') {
      let next;
      if (!c.grounded) {
        if (c.velocity.y > 0.5 && c.airTime < 0.6) next = c.jumping ? 'Jump' : 'Fall';
        else next = c.airTime > 0.12 || c.velocity.y < -3 ? 'Fall' : this.anim.state;
      } else if (this.landTimer > 0 && this.anim.state === 'Land') {
        next = 'Land';
      } else if (speed > MOVE.walkSpeed + 0.6) next = 'Run';
      else if (speed > 0.35) next = 'Walk';
      else next = 'Idle';
      if (next) this.anim.set(next);
    }
    this.anim.ctx.castCharge = this.castCharge;

    // --- Footstep dust while running ---
    if (c.grounded && speed > MOVE.walkSpeed + 0.6) {
      const ph = Math.floor(this.anim.ctx.phase / Math.PI);
      if (ph !== this.lastStepPhase) {
        this.lastStepPhase = ph;
        vfx.burst('dust', this.position, 2, { speed: 0.6, scale: 0.6, alpha: 0.3 });
      }
    }

    // --- Drive the animation ---
    const yaw = c.yaw;
    const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
    _localVel.set(c.velocity.x * cs + c.velocity.z * sn, c.velocity.y, -c.velocity.x * sn + c.velocity.z * cs);
    _localAcc.set(c.acceleration.x * cs + c.acceleration.z * sn, 0, -c.acceleration.x * sn + c.acceleration.z * cs);
    this.anim.update(dt, {
      speed,
      localVel: _localVel,
      localAccel: _localAcc,
      turnRate: c.turnRate,
      grounded: c.grounded,
    });

    // --- Place the model ---
    const root = this.model.root;
    root.position.copy(c.position);
    root.position.y += c.stepOffset;
    root.rotation.y = yaw;
    // Retargeted idle/locomotion clips can lower a toe a few centimetres below
    // the controller's ground plane. Lift the rendered rig slightly while grounded.
    // `toeMargin`: height of the toe joint above the sole (Megumin's rest retarget stands on
    // her bind soles, so she needs only a few millimetres).
    if (c.grounded && this.model.feet?.length) {
      root.updateMatrixWorld(true);
      let lift = 0;
      const toe = new THREE.Vector3();
      const margin = this.model.toeMargin ?? 0.015;
      for (const foot of this.model.feet) {
        foot.getWorldPosition(toe);
        lift = Math.max(lift, this.game.world.groundAt(toe.x, toe.z) - toe.y + margin);
      }
      root.position.y += clamp(lift, 0, 0.12);
    }

    // Fell out of the world.
    if (c.position.y < -40) this.respawn();
  }

  /** Position the camera should focus on (smoothed step offset included). */
  getFocus(target) {
    return target.copy(this.controller.position).add(_v.set(0, this.controller.stepOffset, 0));
  }
}

export { STAMINA };
