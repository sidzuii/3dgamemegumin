/**
 * Place triggers of the story: when the condition holds and the player is within `r` metres of the spot, the
 * lines are said / the effects run ONCE (flag trg_<id>). Checked a few times a second (rpg/RPG.js update).
 *   { id, if, spot, r, say: [clip ids], do: effects }
 */
export const TRIGGERS = [
  // B09: the children sing the ballad at the Fountain square.
  { id: 'B09_kids', if: { flag: 'ballad' }, spot: 'square', r: 18, say: ['B09b_014', 'B09b_015', 'B09b_016'] },
];
