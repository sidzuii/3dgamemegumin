import * as THREE from 'three';
import { MeguminModel } from './MeguminModel.js';
import { RoxyModel } from './RoxyModel.js';
import { CharacterController, MOVE } from './CharacterController.js';
import { Fighter } from '../combat/core/Fighter.js';
import { NUM } from '../combat/core/specs.js';
import { clamp } from '../core/math.js';
import { REGION } from '../world/MapData.js';

/**
 * The player's party: two heroines, each with her own model, rig, controller, health, mana and stamina
 * (docs/combat/01 §3). `character` is the one under control; every old API (`position`, `hp`, `controller`,
 * `anim`, `model`, `heal`, `restoreMana`…) refers to her. The other one is the companion: she is in the world
 * (after `roxy_companion`), driven by `combat/Companion.js`. All combat state lives in the combat core
 * (`game.combat.sim`); this class turns its output (`hero.out`) into movement.
 *
 * Action labels (compat for UI / interaction): none | dodge | attack | cast | stun | exhausted (downed).
 */

/** Old 100-point health units (potions, food, lava) -> the combat scale: Megumin 620, Roxy 700. */
export const HP_BASE = { megumin: 620, roxy: 700 };
const HPK = { megumin: 6.2, roxy: 7 };
const MANA_BASE = 100;

const _move = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _localVel = new THREE.Vector3();
const _localAcc = new THREE.Vector3();
const _v = new THREE.Vector3();
const _dash = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.models = { megumin: new MeguminModel(), roxy: new RoxyModel() };
    this.fighters = {
      megumin: new Fighter('megumin', { maxHp: HP_BASE.megumin }),
      roxy: new Fighter('roxy', { maxHp: HP_BASE.roxy }),
    };
    this.slots = {};
    this.character = 'megumin';
    this.switchCooldown = 0;
    this.spawnPoint = REGION.axel.spawn.clone(); // replaced by the save / a checkpoint
    this.spawnYaw = Math.PI; // facing -Z

    this.level = 1;
    this.xp = 0;
    this.respawnPending = false;
    this.respawnTimer = 0;
    this.landTimer = 0;
    this.lastStepPhase = 0;
    this.envSpeedMul = 1; // water / terrain slowdown set by the world each frame
    this.strolling = false; // walk mode (CapsLock): walking pace instead of the default jog
  }

  /** Called after the models are loaded and the world is built. */
  finishLoad() {
    for (const id of ['megumin', 'roxy']) {
      const model = this.models[id];
      const controller = new CharacterController(this.game.world);
      const collider = { x: 0, y: 0, z: 0, r: 0.3, h: 1.6, enabled: true };
      controller.owner = collider;
      this.slots[id] = { id, model, anim: model.setupAnimation(this.game.animLib), controller, collider, present: id === 'megumin' };
    }
    this.game.scene.add(this.models.megumin.root);
    this.game.world.dynamicColliders.push(this.slots.megumin.collider);
    this.respawn();
  }

  // ---- active-heroine accessors (the old single-character API) -----------------------------------------------
  get slot() {
    return this.slots[this.character];
  }
  get controller() {
    return this.slots[this.character]?.controller ?? null;
  }
  get anim() {
    return this.slots[this.character]?.anim ?? null;
  }
  get model() {
    return this.models[this.character];
  }
  get position() {
    return this.slots[this.character].controller.position;
  }
  get f() {
    return this.fighters[this.character];
  }
  /** The combat core's record of the controlled heroine. */
  get hero() {
    return this.game.combat?.sim.heroes[this.character] ?? null;
  }
  get companionId() {
    return this.character === 'megumin' ? 'roxy' : 'megumin';
  }
  get companionSlot() {
    const s = this.slots[this.companionId];
    return s?.present ? s : null;
  }

  get hp() { return this.f.hp; }
  set hp(v) { this.f.hp = v; }
  get maxHp() { return this.f.maxHp; }
  get mana() { return this.f.mana; }
  set mana(v) { this.f.mana = v; }
  get maxMana() { return this.f.maxMana; }
  get stamina() { return this.f.stamina; }
  set stamina(v) { this.f.stamina = v; }
  get staminaDepleted() { return this.f.staminaDepleted; }

  /** An enemy is after her (or her companion) nearby: no chatting in the middle of a fight. */
  get inCombat() {
    return !!this.game.combat?.inCombat;
  }

  /** Compat label: what the controlled heroine is doing. */
  get action() {
    const h = this.hero;
    if (!h) return 'none';
    switch (h.state) {
      case 'dodge': return 'dodge';
      case 'action': return h.act.spec.kind === 'strong' ? 'cast' : 'attack';
      case 'stun': return 'stun';
      case 'downed': return 'exhausted';
      default: return 'none';
    }
  }

  get castCharge() {
    const h = this.hero;
    if (h?.state === 'action' && h.act.spec.kind === 'strong' && !h.act.released) return clamp(h.act.t / h.act.spec.release, 0, 1);
    return 0;
  }

  get stateLabel() {
    const h = this.hero;
    const f = this.f;
    if (!h) return 'Готова';
    if (h.state === 'downed') return 'Без сил';
    if (h.state === 'stun') return 'Сбита';
    if (h.state === 'dodge') return 'Уклонение';
    if (h.state === 'action') {
      const s = h.act.spec;
      if (s.kind === 'strong') return h.act.released ? (s.id === 'M_R' ? 'EXPLOSION!' : 'Заклинание') : 'Подготовка…';
      return 'Бой';
    }
    if (h.aim) return 'Прицел';
    if (h.guarding) return 'Защита';
    if (f.exhaust > 0) return `Истощение ${Math.ceil(f.exhaust)} с`;
    return this.anim?.state === 'Run' ? 'Бег' : this.anim?.state === 'Walk' ? 'Ход' : 'Готова';
  }

  respawn(keepVitals = false) {
    const p = this.spawnPoint.clone();
    p.y = this.game.world.groundAt(p.x, p.z) + 0.05;
    this.controller.teleport(p, this.spawnYaw);
    if (!keepVitals) this.restoreParty(true);
    const h = this.hero;
    if (h) h.state = 'free';
    this.anim.set('Idle', true);
    this.anim.stopAction();
    this.game.cameraRig?.snapBehind(this.spawnYaw + Math.PI);
    // The companion stands up next to her.
    const cs = this.companionSlot;
    if (cs) this.placeCompanion();
  }

  /** Level + equipment -> max HP / mana / power of both heroines (current values are kept within the new limits). */
  applyStats() {
    const pa = this.game.inventory?.passives() || { maxHp: 0, maxMana: 0, meleeMul: 1, manaRegenMul: 1 };
    for (const id of ['megumin', 'roxy']) {
      const f = this.fighters[id];
      f.maxHp = Math.round((100 + (this.level - 1) * 12 + pa.maxHp) * HPK[id]);
      f.maxMana = MANA_BASE + (this.level - 1) * 8 + pa.maxMana;
      f.powerA = 100 * (1 + 0.03 * (this.level - 1)) * pa.meleeMul;
      f.powerS = 100 * (1 + 0.03 * (this.level - 1));
      f.manaRegenMul = pa.manaRegenMul;
      f.hp = Math.min(f.hp, f.maxHp);
      f.mana = Math.min(f.mana, f.maxMana);
    }
  }

  restoreMana(n) {
    this.f.restoreMana(n);
  }

  /** Is Roxy travelling with Megumin (chapter 4+)? */
  get companionUnlocked() {
    return !!this.game.rpg?.state.flags.roxy_companion;
  }

  /** The other heroine appears in the world next to the controlled one (after she joins). */
  spawnCompanion() {
    const id = this.companionId;
    const s = this.slots[id];
    if (!s || s.present) return;
    s.present = true;
    this.game.scene.add(s.model.root);
    this.game.world.dynamicColliders.push(s.collider);
    this.placeCompanion();
    this.game.combat?.onCompanionSpawned?.(id);
  }

  placeCompanion() {
    const s = this.companionSlot;
    if (!s) return;
    const p = this.position;
    const yaw = this.controller.yaw;
    const W = this.game.world;
    // A checked free point beside / behind the player: the line from her chest is clear (no wall between) and the ground there is
    // at about the same height (not on a roof, not down a pit). Otherwise she stands where the player stands.
    let x = p.x, z = p.z, y = p.y + 0.05;
    const head = new THREE.Vector3(p.x, p.y + 1.2, p.z), dir = new THREE.Vector3();
    for (const da of [0.75, -0.75, 1, -1, 0.5, -0.5]) {
      const a = yaw + Math.PI * da, cx = p.x + Math.sin(a) * 2.4, cz = p.z + Math.cos(a) * 2.4;
      dir.set(Math.sin(a), 0, Math.cos(a));
      if (W.raycast(head, dir, 2.8)) continue;
      const cy = W.groundAt(cx, cz, p.y + 2);
      if (Math.abs(cy - p.y) > 0.9) continue;
      x = cx; z = cz; y = cy + 0.05;
      break;
    }
    s.controller.teleport(new THREE.Vector3(x, y, z), yaw);
    s.model.root.position.set(x, y, z);
    s.anim.set('Idle', true);
  }

  /**
   * Swap the controlled heroine. She stays where she is (no teleport): the camera moves to her actual position;
   * resources, cooldowns and statuses stay with their owners. Roxy must have joined (or `force`).
   */
  switchCharacter(to, force = false) {
    const g = this.game;
    const next = to || this.companionId;
    if (next === this.character) return false;
    if (next === 'roxy' && !force && !this.companionUnlocked) return false;
    if (!this.slots[next].present) {
      if (force || this.companionUnlocked) {
        // First appearance: the other heroine joins at once.
        const keep = this.character;
        this.character = next === 'roxy' ? 'megumin' : 'roxy';
        this.spawnCompanion();
        this.character = keep;
      } else return false;
    }
    if (!force && !g.combat.requestSwitch(next)) return false;
    this.character = next;
    g.combat.afterSwitch(next);
    g.hud.setCharacter(next);
    return true;
  }

  /** Set a respawn checkpoint (called when discovering a location). */
  setCheckpoint(p, yaw) {
    this.spawnPoint.copy(p);
    this.spawnYaw = yaw;
  }

  // ---- vitals (old 100-point units are converted) ----------------------------------------------------------------
  heal(n) { this.f.heal(n * HPK[this.character]); }
  healFraction(fr) { this.f.heal(this.f.maxHp * fr); }
  restoreStamina(n) { this.f.restoreStamina(n); }
  /** Full rest of the whole party (inn, camp, level-up): health, mana, stamina of both heroines; no Exhaustion left. */
  restoreParty(full = true) {
    for (const f of Object.values(this.fighters)) {
      if (f.downed) { f.downed = false; }
      f.hp = f.maxHp;
      f.mana = f.maxMana;
      f.stamina = f.maxStamina;
      f.reserved = 0;
      f.staminaDepleted = false;
      if (full) { f.exhaust = 0; f.cd = {}; f.retry = {}; }
    }
    const sim = this.game.combat?.sim;
    if (sim) for (const h of Object.values(sim.heroes)) if (h.state === 'downed') { h.state = 'free'; }
  }
  /** Damage over time / scripted damage in the old units (lava, fall): no flinch, may down her. */
  damage(n) {
    if (n <= 0) return;
    this.game.combat.dot(this.character, n * HPK[this.character]);
  }

  /** Legacy single-hit API: routed through the combat rules. */
  takeHit(dmg, from, knock = 5, heavy = false) {
    const r = this.game.combat.hitParty(this.character, { dmg, kind: heavy ? 'heavy' : 'light', from, knock, heavy });
    return !!r && !r.dodged;
  }

  /** The combat core says the controlled heroine went down; nobody can take over: back to the checkpoint. */
  defeated() {
    if (this.respawnPending) return;
    this.respawnPending = true;
    this.respawnTimer = 3;
    this.game.hud.toast('Вы без сил… Пробуждение у последней контрольной точки.', 3);
  }

  /** Cast posture for the old effect code (aim marker of the Explosion etc.). */
  get iframes() {
    const h = this.hero;
    return !!h && this.game.combat.sim.isInvulnerable(h);
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

  // ---- main update (the controlled heroine) --------------------------------------------------------------------
  update(dt, input, cameraRig) {
    const slot = this.slot;
    const c = slot.controller;
    const anim = slot.anim;
    const hero = this.hero;
    const out = hero?.out;
    const f = this.f;
    const combat = this.game.combat;

    this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    if (this.respawnPending) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnPending = false;
        this.respawn();
        this.game.enemies?.resetAggro();
        combat?.afterRespawn?.();
      }
    }

    const state = hero?.state ?? 'free';
    const downed = state === 'downed';
    const moveMul = downed ? 0 : out ? out.moveMul : 1;

    // --- Input -> movement command ---
    let ix = 0, iz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    cameraRig.getForward(_fwd);
    cameraRig.getRight(_right);
    _move.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
    if (_move.lengthSq() > 1) _move.normalize();
    const canMove = moveMul > 0 && !this.respawnPending;
    const moving = _move.lengthSq() > 0.01 && canMove;
    this.moveInput = moving;

    const wantsRun = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && moving;
    const run = wantsRun && !f.staminaDepleted && f.stamina > 0 && !(out?.noSprint) && moveMul >= 1 && f.exhaust <= 0;
    if (input.wasPressed('CapsLock')) {
      this.strolling = !this.strolling;
      this.game.hud.toast(this.strolling ? 'Режим шага: вкл.' : 'Режим шага: выкл.', 1.6);
    }

    const jumpPressed = input.wasPressed('Space') && canMove && state === 'free';
    const canJump = f.stamina >= 3 || c.grounded;

    let speedMul = moveMul * this.envSpeedMul;
    if (out && out.speedCap < Infinity) speedMul *= clamp(out.speedCap / MOVE.walkSpeed, 0, 1);
    const cmd = {
      moveDir: _move, run, stroll: this.strolling, jumpPressed, jumpHeld: input.isDown('Space') && state === 'free',
      canMove, canJump, speedMul,
    };
    if (out?.dash && !downed) cmd.dashVel = _dash.set(out.dash.vx, 0, out.dash.vz);
    if (out && out.faceYaw != null && !downed) {
      cmd.faceYaw = out.faceYaw;
      cmd.faceRate = state === 'dodge' ? 30 : 22;
    } else if (hero?.guarding && !downed && !moving) {
      cmd.faceYaw = Math.atan2(_fwd.x, _fwd.z);
      cmd.faceRate = 14;
    }
    c.update(dt, cmd);
    const ev = c.events;

    // --- Stamina (sprint and jumps); regeneration runs in the combat core ---
    const speed = c.horizontalSpeed;
    if (run && c.grounded && speed > MOVE.walkSpeed + 0.3) {
      f.spendStamina((combat?.inCombat ? NUM.movement.sprint_stamina_per_second : 6.5) * dt * (this.game.inventory?.passives().runDrainMul ?? 1));
    }
    if (ev.jumped) f.spendStamina(6);

    // --- Events: jump / land ---
    const vfx = this.game.vfx;
    if (ev.jumped) vfx.burst('dust', this.position, 6, { speed: 0.8, scale: 0.8, alpha: 0.35 });
    if (ev.landed) {
      const s = ev.landSpeed;
      const intensity = clamp((s - 2) / 12, 0, 1);
      if (s > 3) {
        anim.ctx.landIntensity = 0.35 + intensity * 0.65;
        if (state === 'free') anim.set('Land', true);
        this.landTimer = 0.16 + intensity * 0.18;
        cameraRig.impulse(-0.6 - intensity * 1.6);
        vfx.burst('dust', this.position, 6 + Math.round(intensity * 14), { speed: 1 + intensity * 1.5, alpha: 0.45 });
      }
      if (s > 16) this.damage(Math.round((s - 16) * 7));
      if (s > 10) cameraRig.addTrauma(0.12 + intensity * 0.25);
    }
    this.landTimer = Math.max(0, this.landTimer - dt);

    // --- Animation base state (the combat animation driver owns dodge, spells, downed) ---
    const baseLocked = downed || state === 'dodge' || (state === 'action' && hero.act.spec.kind === 'strong');
    if (!baseLocked) {
      let next;
      if (!c.grounded) {
        if (c.velocity.y > 0.5 && c.airTime < 0.6) next = c.jumping ? 'Jump' : 'Fall';
        else next = c.airTime > 0.12 || c.velocity.y < -3 ? 'Fall' : anim.state;
      } else if (this.landTimer > 0 && anim.state === 'Land') {
        next = 'Land';
      } else if (speed > MOVE.walkSpeed + 0.6) next = 'Run';
      else if (speed > 0.35) next = 'Walk';
      else next = 'Idle';
      if (next && anim.state !== 'Exhausted' && anim.state !== 'Slump') anim.set(next);
      else if (next && (anim.state === 'Exhausted' || anim.state === 'Slump')) anim.set(next, true);
    }
    anim.ctx.castCharge = this.castCharge;

    // --- Footstep dust while running ---
    if (c.grounded && speed > MOVE.walkSpeed + 0.6) {
      const ph = Math.floor(anim.ctx.phase / Math.PI);
      if (ph !== this.lastStepPhase) {
        this.lastStepPhase = ph;
        vfx.burst('dust', this.position, 2, { speed: 0.6, scale: 0.6, alpha: 0.3 });
      }
    }

    this.driveRig(slot, dt, speed);

    // Fell out of the world.
    if (c.position.y < -40) this.respawn();
  }

  /** Animation update + model placement of one heroine (shared by the controlled one and the companion). */
  driveRig(slot, dt, speed) {
    const c = slot.controller;
    const yaw = c.yaw;
    const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
    _localVel.set(c.velocity.x * cs + c.velocity.z * sn, c.velocity.y, -c.velocity.x * sn + c.velocity.z * cs);
    _localAcc.set(c.acceleration.x * cs + c.acceleration.z * sn, 0, -c.acceleration.x * sn + c.acceleration.z * cs);
    slot.anim.update(dt, { speed, localVel: _localVel, localAccel: _localAcc, turnRate: c.turnRate, grounded: c.grounded });

    const root = slot.model.root;
    root.position.copy(c.position);
    root.position.y += c.stepOffset;
    root.rotation.y = yaw;
    // Retargeted idle/locomotion clips can lower a toe a few centimetres below the controller's ground plane.
    // Lift the rendered rig slightly while grounded. The ground probe starts just above her feet: from the sky it
    // hit ceilings, roofs and bridge decks (a 12 cm float indoors).
    if (c.grounded && slot.model.feet?.length) {
      root.updateMatrixWorld(true);
      let lift = 0;
      const toe = _v;
      const margin = slot.model.toeMargin ?? 0.015;
      for (const foot of slot.model.feet) {
        foot.getWorldPosition(toe);
        lift = Math.max(lift, this.game.world.groundAt(toe.x, toe.z, c.position.y + 0.6) - toe.y + margin);
      }
      root.position.y += clamp(lift, 0, 0.12);
    }
    slot.collider.x = c.position.x;
    slot.collider.y = c.position.y;
    slot.collider.z = c.position.z;
    slot.collider.enabled = slot.present && !this.fighters[slot.id].downed;
  }

  /** Position the camera should focus on (smoothed step offset included). */
  getFocus(target) {
    return target.copy(this.controller.position).add(_v.set(0, this.controller.stepOffset, 0));
  }
}
