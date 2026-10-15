/**
 * Place triggers of the story: when the condition holds and the player is within `r` metres of the spot, the
 * lines are said / the effects run ONCE (flag trg_<id>). Checked a few times a second (rpg/RPG.js update).
 *   { id, if, spot, r, say: [clip ids], do: effects }
 */
export const TRIGGERS = [
  // B09: the children sing the ballad at the Fountain square.
  // C03: the flooded passage in the crypt: who does what.
  { id: 'C03', if: { quest: 'ch5_crypt', stage: 'water' }, spot: 'crypt_water', r: 8, dialogue: 'C03' },
  // C12: Marta's cart on the ledge; C14: before the directed blast.
  { id: 'C12', if: { quest: 'ch7_gorge', stage: 'ledge' }, spot: 'ledge_marta', r: 12, dialogue: 'C12' },
  { id: 'C14a', if: { quest: 'ch7_gorge', stage: 'explosion' }, spot: 'drain_wall', r: 12, say: ['C14_001', 'C14_002'] },
  { id: 'B09_kids', if: { flag: 'ballad' }, spot: 'square', r: 18, say: ['B09b_014', 'B09b_015', 'B09b_016'] },
];
