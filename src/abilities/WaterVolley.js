import * as THREE from 'three';
import { MagicCircle } from '../vfx/ExplosionEffects.js';
import { clamp } from '../core/math.js';

/**
 * Roxy's Q — "Водяной залп": a short cast, then a fan of homing water bolts.
 * Same public surface as ExplosionAbility (ready / cooldownFraction / casting / tryCast / update).
 */
export const VOLLEY = { name: 'Водяной залп', cooldown: 6, charge: 0.5, bolts: 5, damage: 18, mana: 18 };

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class WaterVolley {
  constructor(game) {
    this.game = game;
    this.state = 'ready';
    this.t = 0;
    this.cooldownLeft = 0;
    this.fired = false;
  }

  get ready() {
    return this.state === 'ready' && this.cooldownLeft <= 0;
  }

  get cooldownFraction() {
    return clamp(this.cooldownLeft / VOLLEY.cooldown, 0, 1);
  }

  get casting() {
    return this.state === 'charging';
  }

  tryCast() {
    const p = this.game.player;
    if (!this.ready || p.action !== 'none') return false;
    if (p.mana < VOLLEY.mana) {
      this.game.hud.toast(`Не хватает маны (${VOLLEY.mana}).`, 2);
      return false;
    }
    p.mana -= VOLLEY.mana;
    this.state = 'charging';
    this.t = 0;
    this.fired = false;
    this.cooldownLeft = VOLLEY.cooldown;
    this.game.cameraRig.getForward(_d);
    p.beginCast(_v.copy(p.position).addScaledVector(_d, 10));
    const feet = p.position.clone();
    this.circle = this.game.vfx.add(new MagicCircle({ radius: 1.3, color: [0.6, 1.8, 3.4], variant: 1, spin: 1.6, position: feet }));
    return true;
  }

  update(dt) {
    if (this.state === 'ready') {
      this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
      return;
    }
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    const g = this.game;
    const p = g.player;
    this.t += dt;
    p.castCharge = clamp(this.t / VOLLEY.charge, 0, 1);
    if (this.circle) this.circle.object.position.copy(p.position);
    if (Math.random() < dt * 60) g.vfx.emit('waterTrail', p.model.getGemWorldPosition(_v));
    if (!this.fired && this.t >= VOLLEY.charge) {
      this.fired = true;
      p.anim.set('Release', true);
      const from = p.model.getGemWorldPosition(_v).clone();
      g.cameraRig.getForward(_d);
      _d.y = 0.12;
      _d.normalize();
      for (let i = 0; i < VOLLEY.bolts; i++) {
        const a = (i - (VOLLEY.bolts - 1) / 2) * 0.22;
        const dir = _d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        g.projectiles.spawn(from, dir.multiplyScalar(16), VOLLEY.damage, 0.9, true);
      }
      g.rpg?.events.emit('volley', { from: from.clone(), dir: _d.clone() });
      g.vfx.burst('waterSplash', from, 30);
      g.cameraRig.addTrauma(0.12);
      this.circle?.kill(5);
    }
    if (this.t >= VOLLEY.charge + 0.45) {
      this.state = 'ready';
      p.action = 'none';
      p.anim.set('Idle');
    }
  }
}
