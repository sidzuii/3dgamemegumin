import { SPEAKERS } from '../data/story/speakers.js';
import * as THREE from 'three';
import { NPCS } from '../data/npcs.js';
import { NavGrid } from './NavGrid.js';
import { REGION } from '../world/MapData.js';
import { WALL, toWorld } from '../world/AxelPlan.js';
import { check } from '../rpg/State.js';
import { dampAngle, clamp } from '../core/math.js';

/**
 * Living townsfolk.
 *
 * Each NPC follows a day schedule (data/npcs.js): where to be and what to do for each time
 * window ("hidden" = indoors at home). Inside settlements routes come from walkability
 * grids; on the open road NPCs follow explicit waypoint routes. Bodies are Quaternius modular
 * people (npc/People.js); animation uses the shared mocap clips (idle / walk / talk / work /
 * guard / sit / dance / magic) retargeted once per people pack (men / women).
 *
 * Cost control: animation updates at full rate within 30 m, at ~10 Hz up to 70 m, frozen
 * beyond, hidden beyond 140 m. Walking NPCs raycast the ground only while moving.
 */
const CLIPS = {
  idle: 'mx:Standing Idle', walk: 'Walk_Loop', talk: 'mx:Talking', work: 'Interact', shop: 'PickUp_Table',
  // 'sit' = the Mixamo sitting idle (hands in the lap), its legs re-posed to the seat in NPC._sitPose.
  guard: 'Sword_Idle', sit: 'mx:Sitting Idle', dance: 'Dance_Loop', magic: 'Spell_Simple_Idle_Loop', wave: 'mx:Waving',
  // second variants: every other NPC (by id) idles / talks with these, so a crowd does not move in step
  idle2: 'mx:Happy Idle', talk2: 'mx:Talking2',
};
/** The main library's clips when the Mixamo pack did not load. */
const FALLBACK = { idle: 'Idle_Loop', talk: 'Idle_Talking_Loop', sit: 'Idle_Loop', wave: 'Interact', idle2: 'Idle_Loop', talk2: 'Idle_Talking_Loop' };
/** How much of the clips' downward gaze is lifted (hands-on work keeps looking down). */
const LEVEL_HEAD = { work: 0.3, shop: 0.4, magic: 0.5, dance: 0.6 };
const WALK_SPEED = 1.35;
const ESCORT_SPEED = 2.6; // a merchant with a mule on the road (the walk clip is sped up to match)
const SEAT_H = 0.46; // bench height; schedule entries may set `seat` (0.1 = on the ground)
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();

/** Rotate bone `b` (world space) so that the direction to `child` becomes `dir`. */
function aimBone(b, child, dir) {
  b.getWorldPosition(_p);
  child.getWorldPosition(_a).sub(_p).normalize();
  _q.setFromUnitVectors(_a, dir);
  const w = b.getWorldQuaternion(_wq).premultiply(_q);
  b.quaternion.copy(b.parent.getWorldQuaternion(_q).invert().multiply(w));
  b.updateMatrixWorld(true);
}

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byId = new Map();
    this.people = game.people;
    this._bakeClips();
    const W = game.world;
    // Walkability grids: Axel inside its walls (+ the caravan camp at the south gate), Boris'
    // farm, Olkhovka.
    const box = (pts, m) => [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m];
    const [ax0, az0, ax1, az1] = box(WALL.nodes.map((n) => toWorld(n.u, n.v)), 6);
    const reg = (id, r) => { const c = REGION[id].center; return [c.x - r, c.z - r, c.x + r, c.z + r]; };
    this.grids = [
      new NavGrid(W, ax0, az0, ax1, az1 + 48),
      new NavGrid(W, ...reg('farms', 62)),
      new NavGrid(W, ...reg('olkhovka', 60)),
    ];
    for (const def of NPCS) this._create(def);
  }

  def(id) {
    return NPCS.find((d) => d.id === id) || SPEAKERS[id];
  }

  get(id) {
    return this.byId.get(id);
  }

  /** One clip set per people pack: the men's and women's skeletons differ in proportions. */
  _bakeClips() {
    const lib = this.game.animLib;
    const BASE = { m: ['Casual2_Head', 'Casual2_Body', 'Casual2_Legs', 'Casual2_Feet'], w: ['Formad_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'] };
    this.clips = {};
    for (const pack of Object.keys(BASE)) {
      const tpl = this.people.create({ pack, parts: BASE[pack], scale: 1 });
      const ctx = lib.prepareTarget(tpl.root, 'qp');
      const set = (this.clips[pack] = {});
      for (const [k, src0] of Object.entries(CLIPS)) set[k] = lib.bake(ctx, lib.clips[src0] ? src0 : FALLBACK[k], { name: `npc_${pack}_${k}`, hipsY: 'keep', levelHead: LEVEL_HEAD[k] ?? 0.8 });
      lib.restore(ctx);
    }
    // whole-character bodies (Mixamo skeletons): one clip set per body
    for (const id of Object.keys(this.people.bodies)) {
      const tpl = this.people.createBody(id);
      const ctx = lib.prepareTarget(tpl.root, 'mixamo');
      const set = (this.clips['body:' + id] = {});
      for (const [k, src0] of Object.entries(CLIPS)) set[k] = lib.bake(ctx, lib.clips[src0] ? src0 : FALLBACK[k], { name: `npc_${id}_${k}`, hipsY: 'keep', levelHead: LEVEL_HEAD[k] ?? 0.8 });
      lib.restore(ctx);
    }
  }

  _create(def) {
    let npc;
    if (def.special === 'roxy') npc = new RoxyNPC(this, def);
    else npc = new NPC(this, def);
    this.list.push(npc);
    this.byId.set(def.id, npc);
    this.game.interaction?.register(npc.interactable);
  }

  gridFor(a, b) {
    return this.grids.find((g) => g.contains(a.x, a.z) && g.contains(b.x, b.z)) || null;
  }

  update(dt) {
    const pp = this.game.player.position;
    for (const n of this.list) n.update(dt, pp);
  }

  /** Re-evaluate visibility conditions and schedules (after story changes / loading). `teleport` (start / load): everyone stands
   * at the spot of the hour at once instead of walking there from wherever the world build left them (escorts keep their place). */
  refresh(teleport = false) {
    for (const n of this.list) n.refresh(teleport && !(n.escorting || n.follow));
  }
}

// -----------------------------------------------------------------------------------------
class NPC {
  constructor(mgr, def) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.def = def;
    this.id = def.id;
    // Roxy (before she joins) is drawn with her real model; she only needs the hit volume.
    // a whole-character body (`body`, People BODIES) when it loaded, else the modular people body
    this.bodyId = def.body && mgr.people.bodies[def.body] ? def.body : null;
    const H0 = def.bodyHeight ?? 1.78;
    const { root, mesh } = this.bodyId ? mgr.people.createBody(this.bodyId, H0) : def.model ? mgr.people.create(def.model) : { root: new THREE.Group(), mesh: null };
    this.root = root;
    this.mesh = mesh;
    this.height = this.bodyId ? H0 : def.model ? 1.86 * root.scale.y : 1.6;
    root.name = 'NPC:' + def.id;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [k, clip] of Object.entries(this.bodyId ? mgr.clips['body:' + this.bodyId] : def.model ? mgr.clips[def.model.pack] : {})) {
      const a = this.mixer.clipAction(clip);
      a.setEffectiveWeight(0);
      this.actions[k] = a;
    }
    this.anim = null;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.path = null;
    this.state = 'idle';
    this.entry = null;
    this.talking = false;
    this.follow = null; // escort/follow target
    this.visible = false;
    this.animAcc = 0;
    this.collider = { x: 0, y: 0, z: 0, r: 0.32, h: 1.7, enabled: false };
    this.game.world.dynamicColliders.push(this.collider);
    // Hit volume for the interaction raycast.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ visible: false }));
    root.add(hit);
    const self = this;
    this.interactable = {
      name: def.name, get prompt() { return self.def.prompt || 'Поговорить'; },
      root, meshes: [hit],
      canInteract: () => self.visible && !self.game.player.inCombat,
      interact: (game) => game.rpg.talkTo(self),
      setHighlight: () => {},
      isNPC: true,
      npc: this,
    };
    hit.userData.interactable = this.interactable;
    this.game.scene.add(root);
    root.visible = false;
    this.refresh(true);
  }

  get position() { return this.pos; }

  /** Is this NPC present in the world right now (story conditions)? */
  present() {
    return check(this.game.rpg, this.def.appear);
  }

  _scheduleEntry() {
    const h = this.game.rpg.clock.hour;
    const sched = typeof this.def.schedule === 'function' ? this.def.schedule(this.game.rpg) : this.def.schedule;
    for (const e of sched || []) {
      const [a, b] = e.time || [0, 24];
      if (a <= b ? h >= a && h < b : h >= a || h < b) {
        if (!e.if || check(this.game.rpg, e.if)) return e;
      }
    }
    return null;
  }

  refresh(teleport = false) {
    if ((this.escorting || this.follow) && !teleport) return;
    const entry = this.present() ? this._scheduleEntry() : null;
    if (!entry || entry.hidden) {
      this._setVisible(false);
      this.entry = entry;
      this.path = null;
      this.pendingTarget = null;
      return;
    }
    const spot = this.game.rpg.spotPos(entry.spot);
    if (!spot) {
      this._setVisible(false);
      return;
    }
    const changed = entry !== this.entry;
    this.entry = entry;
    if (teleport || !this.visible) {
      this.pos.copy(spot);
      this.pos.y = this._ground(spot.x, spot.z, spot.y);
      this.yaw = this.game.rpg.spotYaw(entry.spot);
      this.path = null;
      this.pendingTarget = null;
      this._setVisible(true);
    } else if (changed) {
      this._goTo(spot, entry.route);
    }
  }

  _setVisible(v) {
    this.visible = v;
    this.root.visible = v;
    this.collider.enabled = v;
  }

  _ground(x, z, y = 0) {
    return this.game.world.groundAt(x, z, y + 2.5);
  }

  _goTo(target, route) {
    if (route) {
      this.path = route.map(([x, z]) => new THREE.Vector3(x, 0, z));
      this.path.push(target.clone());
    } else {
      const grid = this.mgr.gridFor(this.pos, target);
      if (!grid && this._lineBlocked(target)) {
        // The cities without a walk grid (Ainstrey): a straight walk would cross houses. Far from the player: be there; near: wait out of her sight.
        this.path = null;
        if (this.pos.distanceTo(this.game.player.position) > 25) this._appear(target);
        else this.pendingTarget = target.clone();
        return;
      }
      this.path = grid ? grid.path(this.pos.x, this.pos.z, target.x, target.z) : [target.clone()];
      if (!this.path) {
        // No walkable route: never walk through walls. Out of sight — just be there.
        this.path = null;
        if (this.pos.distanceTo(this.game.player.position) > 25) {
          this.pos.copy(target);
          this.pos.y = this._ground(target.x, target.z, target.y);
          this.targetYaw = this.entry?.spot ? this.game.rpg.spotYaw(this.entry.spot) : this.yaw;
        }
        return;
      }
    }
    this.blocked = 0;
    this.state = 'walk';
  }

  /** Is the straight way to `target` shut by the static world (a wall, a house) at the height of the chest and of the knees? */
  _lineBlocked(target) {
    const w = this.game.world, dx = target.x - this.pos.x, dz = target.z - this.pos.z, L = Math.hypot(dx, dz);
    if (L < 1.5) return false;
    for (const h of [0.5, 1.3]) {
      _v.set(this.pos.x, this.pos.y + h, this.pos.z);
      _v2.set(dx / L, 0, dz / L);
      if (w.raycast(_v, _v2, L - 0.3)) return true;
    }
    return false;
  }

  _appear(target) {
    this.pos.copy(target);
    this.pos.y = this._ground(target.x, target.z, target.y);
    this.yaw = this.entry?.spot ? this.game.rpg.spotYaw(this.entry.spot) : this.yaw;
    this.targetYaw = this.yaw;
    this.pendingTarget = null;
    this.path = null;
  }

  /** Follow the player (escort). target: { pos: () => Vector3, keep: metres } */
  setFollow(target) {
    this.follow = target;
  }

  startTalk() {
    this.talking = true;
  }

  endTalk() {
    this.talking = false;
  }

  _play(name, fade = 0.3) {
    if (this.variant === undefined) this.variant = [...(this.def?.id || '')].reduce((h, c) => h + c.charCodeAt(0), 0) % 2;
    if (this.variant && (name === 'idle' || name === 'talk') && this.actions[name + '2']) name += '2';
    if (this.anim === name) return;
    const next = this.actions[name] || this.actions.idle;
    if (!next) return;
    const prev = this.anim ? this.actions[this.anim] : null;
    next.reset().play();
    next.setEffectiveWeight(1);
    if (prev) prev.crossFadeTo(next, fade, false);
    this.anim = name;
    this.posed = false; // pose once even when too far for regular animation updates
  }

  update(dt, playerPos) {
    if (!this.visible) return;
    const d = this.pos.distanceTo(playerPos);
    if (this.pendingTarget && d > 25 && !this.talking) this._appear(this.pendingTarget);
    // Movement.
    let moving = false;
    if (this.talking) {
      const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.yaw = dampAngle(this.yaw, want, 8, dt);
    } else if (this.follow) {
      const t = this.follow.pos();
      const dist = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
      if (dist > (this.follow.keep ?? 2.2)) {
        moving = this._step(t, dt, dist > 8 ? 2.6 : WALK_SPEED * 1.2);
      }
    } else if (this.path?.length && !this.paused && !this.cower) {
      // Wait if the player stands right in the way.
      const nxt = this.path[0];
      _v.set(nxt.x - this.pos.x, 0, nxt.z - this.pos.z).normalize();
      const px = playerPos.x - this.pos.x, pz = playerPos.z - this.pos.z;
      const block = Math.hypot(px, pz) < 0.9 && px * _v.x + pz * _v.z > 0;
      const reach = this.escorting ? 0.8 : 0.25;
      if (!block) {
        moving = this._step(nxt, dt, this.escorting ? this.escortSpeed || ESCORT_SPEED : WALK_SPEED);
        this.blocked = 0;
      } else if (this.escorting && this.path.length > 1 && Math.hypot(nxt.x - this.pos.x, nxt.z - this.pos.z) < 1.5) {
        // The player waits on his next waypoint: take the one after it.
        this.path.shift();
        this.blocked = 0;
      } else if ((this.blocked = (this.blocked || 0) + dt) > 1.2) {
        // The player keeps standing in the way: step around her.
        this.path.unshift(new THREE.Vector3(this.pos.x - _v.z * 1.1 + _v.x * 0.6, 0, this.pos.z + _v.x * 1.1 + _v.z * 0.6));
        this.blocked = 0;
      }
      if (this.path[0] === nxt && Math.hypot(nxt.x - this.pos.x, nxt.z - this.pos.z) < reach) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          this.state = 'idle';
          if (this.entry?.spot) this.targetYaw = this.game.rpg.spotYaw(this.entry.spot);
        }
      }
    } else if (this.targetYaw !== undefined) {
      this.yaw = dampAngle(this.yaw, this.targetYaw, 4, dt);
    }
    // Animation.
    const anim = this.talking ? 'talk' : moving ? 'walk' : this.entry?.anim || 'idle';
    this._play(anim);
    this.sitting = !moving && !this.follow && this.entry?.anim === 'sit' && !!this.mesh;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    Object.assign(this.collider, { x: this.pos.x, y: this.pos.y, z: this.pos.z });
    // LOD.
    const show = d < 140;
    if (this.root.visible !== show) this.root.visible = show;
    if (!show) return;
    this.animAcc += dt;
    const interval = d < 30 ? 0 : d < 70 ? 0.1 : Infinity;
    if (this.animAcc >= interval || !this.posed) {
      this.mixer.update((this.posed ? this.animAcc : this.animAcc + 1) * (moving && this.escorting ? Math.min(2.2, (this.escortSpeed || ESCORT_SPEED) / WALK_SPEED) : 1));
      this.animAcc = 0;
      this.posed = true;
      if (this.sitting) this._sitPose();
    }
    if (this.sitting) this.root.position.y -= this.sitDrop || 0;
  }

  /**
   * Seated legs over the animated (idle / talk) pose: thighs forward, shins down (on a bench)
   * or stretched out (on the ground); the pelvis drops to the seat.
   */
  _sitPose() {
    if (this.bodyId) { this.sitDrop = 0; return; } // the Mixamo sitting idle already sits at chair height
    const r = this.root;
    if (!this._legs) {
      const g = (n) => r.getObjectByName(n);
      this._legs = ['L', 'R'].map((s) => [g('UpperLeg' + s), g('LowerLeg' + s), g('Foot' + s)]);
      this._hips = g('Body');
    }
    const seat = this.entry?.seat ?? SEAT_H;
    const ground = seat < 0.25;
    r.position.copy(this.pos);
    r.updateMatrixWorld(true);
    const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const thigh = fwd.clone().setY(ground ? -0.1 : 0).normalize();
    const shin = ground ? fwd.clone().setY(-0.25).normalize() : new THREE.Vector3(0, -1, 0).addScaledVector(fwd, 0.18).normalize();
    for (const [th, sh, ft] of this._legs) {
      aimBone(th, sh, thigh);
      aimBone(sh, ft, shin);
    }
    const hipY = this._hips.getWorldPosition(_p).y - this.pos.y;
    this.sitDrop = Math.max(0, hipY - seat - 0.08);
  }

  _step(target, dt, speed) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) return false;
    const s = Math.min(dist, speed * dt);
    this.pos.x += (dx / dist) * s;
    this.pos.z += (dz / dist) * s;
    this.pos.y = this._ground(this.pos.x, this.pos.z, this.pos.y);
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
    return true;
  }

  /** Head position for markers/labels. */
  head(target) {
    return target.copy(this.pos).setY(this.pos.y + this.height + 0.1);
  }

  /** While the game is paused in a conversation: face the player and keep talking. */
  updateTalking(dt, playerPos) {
    const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, want, 8, dt);
    this.root.rotation.y = this.yaw;
    this._play('talk');
    this.mixer.update(dt);
    if (this.sitting) {
      this._sitPose();
      this.root.position.y -= this.sitDrop || 0;
    }
  }
}

// -----------------------------------------------------------------------------------------
/** Roxy as an NPC (before she joins): her real model, idling at her camp. */
class RoxyNPC extends NPC {
  constructor(mgr, def) {
    super(mgr, def); // no body of its own: only the invisible hit volume of the base NPC is used
    this.model = mgr.game.player.models.roxy;
    this.inScene = false;
    this._zero = new THREE.Vector3();
    this.refresh(true);
  }

  _setVisible(v) {
    super._setVisible(v);
    if (!this.model) return; // called from the base constructor before setup
    const playerUses = this.game.player.character === 'roxy';
    const show = v && !playerUses;
    if (show && !this.inScene) this.game.scene.add(this.model.root);
    if (!show && this.inScene && !playerUses) this.game.scene.remove(this.model.root);
    this.inScene = show;
  }

  update(dt, playerPos) {
    if (!this.visible || this.game.player.character === 'roxy') return;
    super.update(dt, playerPos);
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    if (this.pos.distanceTo(playerPos) < 70) {
      this.model.animator.update(dt, { speed: 0, localVel: this._zero, localAccel: this._zero, turnRate: 0, grounded: true });
    }
  }

  head(target) {
    return target.copy(this.pos).setY(this.pos.y + 1.75);
  }

  updateTalking(dt, playerPos) {
    const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, want, 8, dt);
    this.model.root.rotation.y = this.yaw;
    this.model.animator.update(dt, { speed: 0, localVel: this._zero, localAccel: this._zero, turnRate: 0, grounded: true });
  }
}
