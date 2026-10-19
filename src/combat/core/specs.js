import { PARAMS as P } from '../params.js';

/**
 * Normalised action specs built from the number sheet (docs/combat/Параметры_боевки.json).
 * `kind`: basic (staff combo) | medium (Q/E, cost at start) | strong (R/F, mana reserved at confirm, spent at release).
 */
export const STEP = 1 / 120; // fixed combat step: release/contact moments do not depend on the frame rate
export const INPUT_WINDOW = 0.18; // the next hit may be queued in the last 0.18 s of the current action
export const COMBO_RESET = 0.75; // the series restarts if the next hit is not started this long after it became ready
export const HEROES = ['megumin', 'roxy'];
export const HERO_NAME = { megumin: 'Мегумин', roxy: 'Рокси' };
export const COMBO = { megumin: ['M_L1', 'M_L2', 'M_L3'], roxy: ['R_L1', 'R_L2', 'R_L3'] };
/** Skill slot -> action id. Q/E are medium skills, R/F strong spells. */
export const SLOTS = {
  megumin: { Q: 'M_Q', E: 'M_E', R: 'M_R', F: 'M_F' },
  roxy: { Q: 'R_Q', E: 'R_E', R: 'R_R', F: 'R_F' },
};
export const SLOT_KEYS = ['Q', 'E', 'R', 'F'];
/** The keys of the slots (the slot ids stay Q E R F in the data): E is the interaction key, so the second medium skill is on R and
 *  the first strong spell (Explosion / Water Volley) on X. */
export const SLOT_INPUT = { Q: 'KeyQ', E: 'KeyR', R: 'KeyX', F: 'KeyF' };
export const SLOT_LABEL = { Q: 'Q', E: 'R', R: 'X', F: 'F' };

/** How each swing sweeps the staff relative to the body (positive bearing = left). */
const SWEEP = {
  M_L1: 'rl', M_L2: 'lr', M_L3: 'thrust',
  R_L1: 'rl', R_L2: 'lr', R_L3: 'thrust',
  M_E: 'around',
};

export const SPEC = {};
const add = (raw, kind) => {
  const s = { ...raw, kind };
  s.cost = { mana: 0, stamina: 0, ...(raw.cost || {}) };
  s.cooldown = raw.cooldown || 0;
  s.release = raw.release_at ?? raw.startup;
  s.activeEnd = raw.release_at != null ? (raw.emissions ? raw.emissions[raw.emissions.length - 1] : raw.release_at) : raw.startup + raw.active;
  s.total = raw.total;
  s.sweep = SWEEP[raw.id] || 'static';
  s.coefA = raw.damage?.A ?? 0;
  s.coefS = raw.damage?.S ?? 0;
  s.tags = raw.tags || (kind === 'basic' ? ['physical', 'melee'] : []);
  if (kind === 'basic') {
    s.cancelAt = Math.max(raw.cancel_at, s.activeEnd);
    s.earlyUntil = raw.startup * 0.6; // dodge / guard / switch in the first 60% of the preparation
  } else if (kind === 'medium') {
    s.cancelAt = raw.cancel_recovery_at;
    s.earlyUntil = raw.cancel_early_until;
  } else {
    s.cancelAt = raw.cancel_recovery_at ?? raw.total; // Explosion: no cancel until the recoil ends
    s.earlyUntil = s.release; // everything before the release may be cancelled (the reserve is returned)
  }
  SPEC[raw.id] = s;
};
for (const a of P.attacks) add(a, 'basic');
for (const a of P.abilities) add(a, a.category === 'strong' ? 'strong' : 'medium');

/** Combat-wide numbers. */
export const NUM = {
  baseline: P.baseline,
  regen: P.resource_regeneration,
  defense: P.defense,
  dodge: P.dodge,
  movement: P.movement,
  switching: P.switching,
  strong: P.strong_cast,
  wet: P.wet,
  stagger: P.stagger,
  exhaustion: P.exhaustion,
  /** Short reactions of a heroine: ordinary hit, heavy hit, guard break; protection from a new flinch afterwards. */
  reaction: { light: 0.18, heavy: 0.45, guardBreak: P.defense.guard_break_lock, protect: 0.5 },
  /** Party item cooldown (seconds) and drinking time. */
  items: { cooldown: 20, drink: 0.9, healFrac: 0.3, mana: 25 },
  /** Revive: seconds of channelling, returned health fraction. */
  revive: { time: 4, hpFrac: 0.25 },
};

/** Hit "weight" classes of enemy attacks -> stamina cost of a block. */
export const BLOCK_STAMINA = { light: P.defense.light_stamina, medium: P.defense.medium_stamina, projectile: P.defense.light_stamina };

export function slotSpec(hero, slot) {
  return SPEC[SLOTS[hero][slot]];
}
