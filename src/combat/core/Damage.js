import { NUM } from './specs.js';

/**
 * Damage and stability rules (docs/combat/01 §4, §8, §9, 05 §7).
 *   damage = coefficient × (A or S) × 100 / (100 + defence) × element multiplier, physical and magical parts
 *   are computed apart, summed and rounded once; a successful positive hit deals at least 1.
 * A target is any object with: alive, hp, defP, defM, tier ('light'|'medium'|'heavy'|'boss'), poise (PoiseState),
 * wet (seconds left), elem (optional { water, fire }), vulnMul (optional: an open weak spot) and `onHit(result)`.
 */

export const defenceFactor = (def) => 100 / (100 + (def || 0));

export function computeHealth({ coefA = 0, coefS = 0, A = 100, S = 100, defP = 0, defM = 0, elem = 1, wetMul = 1, physMul = 1 }) {
  const phys = coefA * A * defenceFactor(defP) * elem * physMul;
  const mag = coefS * S * defenceFactor(defM) * elem * wetMul;
  if (coefA <= 0 && coefS <= 0) return 0;
  return Math.max(1, Math.round(phys + mag));
}

/** Stability of an enemy: a pool with a tier threshold; breaking it gives a reaction and then 3 s of protection. */
export class PoiseState {
  constructor(tier = 'light') {
    this.tier = tier;
    this.max = NUM.stagger.thresholds[tier];
    this.value = this.max; // remaining stability; reaching 0 = break
    this.sinceHit = 99;
    this.reactionLeft = 0; // reaction in progress
    this.protectLeft = 0; // post-reaction protection (the icon)
    this.kind = ''; // current reaction name
  }

  get protected() {
    return this.protectLeft > 0 || this.reactionLeft > 0;
  }
  get fraction() {
    return this.max > 0 ? this.value / this.max : 0;
  }
  get reacting() {
    return this.reactionLeft > 0;
  }

  /** Apply a hit's stability damage. Returns the reaction ({ tier, duration }) if the threshold was broken. */
  hit(amount) {
    this.sinceHit = 0;
    if (this.protected) return null; // ordinary damage passes, the stability is not reduced during protection
    this.value -= amount;
    if (this.value > 0) return null;
    const duration = NUM.stagger.reactions[this.tier];
    this.value = 0;
    this.reactionLeft = duration;
    this.kind = this.tier;
    return { tier: this.tier, duration };
  }

  tick(h) {
    this.sinceHit += h;
    if (this.reactionLeft > 0) {
      this.reactionLeft -= h;
      if (this.reactionLeft <= 0) {
        this.reactionLeft = 0;
        this.protectLeft = NUM.stagger.immunity_after_reaction;
        this.value = this.max;
        this.kind = '';
      }
      return;
    }
    if (this.protectLeft > 0) {
      this.protectLeft = Math.max(0, this.protectLeft - h);
      return;
    }
    if (this.sinceHit > NUM.stagger.regen_delay && this.value < this.max) {
      this.value = Math.min(this.max, this.value + NUM.stagger.regen * h);
    }
  }
}

/**
 * Resolve one contact against a target. `hit`: { coefA, coefS, A, S, poise, tags[], wet (seconds), physMul,
 * from {x,z}, id, heavy }. Returns { dmg, poiseReaction, wetBonus, killed }.
 * Order (05 §7): the defence and the Wet state are read at the moment of contact; the Wet bonus is consumed before
 * the explosive damage; new Wet is applied after water damage and never on a dead target.
 */
export function applyHit(target, hit) {
  if (!target.alive) return null;
  if (target.immune?.(hit)) {
    target.onImmune?.(hit); // a story shield: the blow is absorbed
    return null;
  }
  const explosive = hit.tags?.includes('explosive');
  let wetMul = 1;
  let wetBonus = false;
  if (explosive && target.wet > 0 && hit.coefS > 0) {
    wetMul = NUM.wet.next_explosive_damage_multiplier;
    wetBonus = true;
    target.wet = 0; // consumed; no secondary explosion, no extra stagger
  }
  const dmg = computeHealth({
    coefA: hit.coefA, coefS: hit.coefS, A: hit.A, S: hit.S,
    defP: target.defP, defM: target.defM, elem: (target.elem?.[hit.element] ?? 1) * (target.vulnMul ?? 1), wetMul, physMul: hit.physMul ?? 1,
  });
  const dealt = Math.min(dmg, Math.max(0, target.hp));
  target.hp -= dmg;
  const killed = target.hp <= 0;
  let reaction = null;
  if (!killed && hit.poise > 0 && target.poise) reaction = target.poise.hit(hit.poise);
  else if (target.poise) target.poise.sinceHit = 0;
  if (hit.wet > 0 && !killed) target.wet = NUM.wet.duration; // refresh, never stacks
  const result = { dmg, dealt, killed, reaction, wetBonus, hit, target };
  target.onHit?.(result);
  return result;
}
