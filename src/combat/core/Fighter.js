import { NUM, SPEC } from './specs.js';
import { clamp } from './geo.js';

/**
 * Vitals + clocks of ONE heroine (docs/combat/01 §3, §5, §11): health, mana, stamina, the mana reserve of a
 * confirmed strong spell, cooldowns, the retry delay after a cancelled spell, Exhaustion, reactions.
 * Everything here advances on the fixed combat clock, so it freezes together with the game and does not
 * depend on the frame rate.
 */
export class Fighter {
  constructor(id, { maxHp = 620, maxMana = 100, maxStamina = 100 } = {}) {
    this.id = id;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.maxMana = maxMana;
    this.mana = maxMana;
    this.maxStamina = maxStamina;
    this.stamina = maxStamina;
    this.reserved = 0; // mana held by a confirmed strong spell (not spent yet)
    this.manaDelay = 0; // seconds until mana starts to regenerate
    this.staminaDelay = 0;
    this.staminaDepleted = false; // sprint lock after hitting 0 (until 20 again)
    this.cd = {}; // action id -> seconds left
    this.retry = {}; // action id -> seconds left (retry delay after a cancelled spell)
    this.wet = 0; // Wetness on the heroine herself (reserved for enemy water; not used by the player's own magic)
    this.exhaust = 0; // seconds of Exhaustion left (Explosion)
    this.exhaustLock = 0; // first 0.8 s: no actions at all
    this.reaction = 0; // flinch / stagger left
    this.reactionKind = '';
    this.protect = 0; // no new ordinary flinch for this long after one ended
    this.guardBreak = 0;
    this.downed = false;
    this.revives = 0; // how many times she was lifted in this encounter
    this.powerA = 100; // physical power A, spell power S (set from level + equipment)
    this.powerS = 100;
    this.manaRegenMul = 1;
  }

  get alive() {
    return !this.downed && this.hp > 0;
  }
  get freeMana() {
    return this.mana - this.reserved;
  }
  get exhausted() {
    return this.exhaust > 0;
  }
  get busyReacting() {
    return this.reaction > 0 || this.guardBreak > 0 || this.exhaustLock > 0;
  }

  /** Why the action cannot start now (Russian, shown on the slot), or '' if it can. */
  unavailable(id, { manaCostOverride } = {}) {
    const s = SPEC[id];
    if (!this.alive) return 'Недееспособна';
    if (this.exhaustLock > 0) return `Истощение: ${Math.ceil(this.exhaust)} с`;
    if (s.kind !== 'basic' && this.exhausted && (s.kind === 'strong' || id === 'M_Q' || id === 'M_E')) {
      return `Истощение: ${Math.ceil(this.exhaust)} с`;
    }
    if (this.cd[id] > 0) return `Перезарядка: ${Math.ceil(this.cd[id])} с`;
    if (this.retry[id] > 0) return `Повтор через ${this.retry[id].toFixed(1)} с`;
    const mana = manaCostOverride ?? s.cost.mana;
    if (s.kind === 'strong' && mana > 0) {
      const need = s.minimum_mana ?? mana;
      if (this.freeMana < need) return `Нужно ${need} маны`;
    } else if (s.kind === 'medium' && s.cost.mana > 0 && id !== 'R_E' && this.freeMana < s.cost.mana) {
      return `Нужно ${s.cost.mana} маны`;
    }
    if (s.cost.stamina > 0 && this.stamina < s.cost.stamina) return 'Не хватает выносливости';
    if (s.kind === 'basic' && s.cost.stamina > 0 && this.stamina < s.cost.stamina) return 'Не хватает выносливости';
    return '';
  }

  spendStamina(n, delay = NUM.regen.stamina_delay) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = Math.max(this.staminaDelay, delay);
    if (this.stamina <= 0) this.staminaDepleted = true;
  }

  /** Spell prepared: hold the mana. */
  reserve(n) {
    this.reserved += n;
  }
  /** Cast cancelled before the release: give the mana back. */
  unreserve(n) {
    this.reserved = Math.max(0, this.reserved - n);
  }
  /** Release: the reserve turns into spending. */
  spendReserved(n) {
    this.reserved = Math.max(0, this.reserved - n);
    this.mana = Math.max(0, this.mana - n);
    this.manaDelay = NUM.regen.mana_delay;
  }
  spendMana(n) {
    this.mana = Math.max(0, this.mana - n);
    this.manaDelay = NUM.regen.mana_delay;
  }

  heal(n) {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
  restoreMana(n) {
    this.mana = Math.min(this.maxMana, this.mana + n);
  }
  restoreStamina(n) {
    this.stamina = Math.min(this.maxStamina, this.stamina + n);
    if (this.stamina >= 20) this.staminaDepleted = false;
  }

  startExhaustion() {
    this.exhaust = NUM.exhaustion.duration_from_release;
    this.exhaustLock = NUM.exhaustion.recovery_lock;
  }

  /** @param ctx { active, inCombat, casting, guarding } */
  tick(h, ctx) {
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - h);
    for (const k in this.retry) if (this.retry[k] > 0) this.retry[k] = Math.max(0, this.retry[k] - h);
    this.wet = Math.max(0, this.wet - h);
    this.exhaust = Math.max(0, this.exhaust - h);
    this.exhaustLock = Math.max(0, this.exhaustLock - h);
    this.guardBreak = Math.max(0, this.guardBreak - h);
    if (this.reaction > 0) {
      this.reaction -= h;
      if (this.reaction <= 0) {
        this.reaction = 0;
        this.protect = NUM.reaction.protect;
        this.reactionKind = '';
      }
    } else this.protect = Math.max(0, this.protect - h);
    if (!this.alive) return;
    const R = NUM.regen;
    // Mana: starts 1 s after a magical action ends; not while preparing a spell; not while exhausted.
    if (ctx.casting) this.manaDelay = R.mana_delay;
    else this.manaDelay = Math.max(0, this.manaDelay - h);
    if (!ctx.casting && this.manaDelay <= 0 && this.exhaust <= 0) {
      const rate = !ctx.inCombat ? R.out_of_combat_mana : ctx.active ? R.active_mana : R.inactive_mana;
      this.mana = Math.min(this.maxMana, this.mana + rate * this.manaRegenMul * h);
    }
    // Stamina: 0.7 s after the last spending; not while the guard is held.
    this.staminaDelay = Math.max(0, this.staminaDelay - h);
    if (this.staminaDelay <= 0 && !ctx.guarding) {
      this.stamina = Math.min(this.maxStamina, this.stamina + (ctx.active ? R.active_stamina : R.inactive_stamina) * h);
      if (this.staminaDepleted && this.stamina >= 20) this.staminaDepleted = false;
    }
    this.mana = clamp(this.mana, 0, this.maxMana);
  }

  snapshot() {
    return { hp: this.hp, mana: this.mana, stamina: this.stamina, cd: { ...this.cd }, exhaust: this.exhaust, downed: this.downed };
  }
}
