/**
 * Place triggers of the story: when the condition holds and the player is within `r` metres of the spot, the
 * lines are said / the effects run ONCE (flag trg_<id>). Checked a few times a second (rpg/RPG.js update).
 *   { id, if, spot, r, say: [clip ids], do: effects }
 */
export const TRIGGERS = [
  // Combat training (docs/combat/04): Bran offers the directed-force lesson after rank E; Roxy proposes the pair exercise.
  { id: 'CB01_offer', if: [{ quest: 'ch1_name', status: 'done' }, { not: { flag: 'cb01_done' } }], spot: 'training_field', r: 40, do: [{ startQuest: 'cb01_breach' }] },
  { id: 'CB02_offer', if: [{ flag: 'roxy_companion' }, { not: { flag: 'cb02_done' } }], spot: 'training_field', r: 40, do: [{ startQuest: 'cb02_pair' }] },
  { id: 'CB02_talk', if: { quest: 'cb02_pair', stage: 'talk' }, spot: 'training_center', r: 24, dialogue: 'CB02' },
  { id: 'CB02_end', if: { quest: 'cb02_pair', stage: 'report' }, spot: 'training_center', r: 24, dialogue: 'CB02_done' },
  // B09: the children sing the ballad at the Fountain square.
  // C03: the flooded passage in the crypt: who does what.
  { id: 'C03', if: { quest: 'ch5_crypt', stage: 'water' }, spot: 'crypt_water', r: 8, dialogue: 'C03' },
  // C12: Marta's cart on the ledge; C14: before the directed blast.
  { id: 'C12', if: { quest: 'ch7_gorge', stage: 'ledge' }, spot: 'ledge_marta', r: 12, dialogue: 'C12' },
  { id: 'C14a', if: { quest: 'ch7_gorge', stage: 'explosion' }, spot: 'drain_wall', r: 12, say: ['C14_001', 'C14_002'] },
  // Side stories: the night raid starts at night on the field (B10); scenes at the places of B14, B15, B18, B19, B22.
  { id: 'B10_raid', if: [{ quest: 'c_night_raid', stage: 'night' }, { hour: [21, 5] }], spot: 'night_field', r: 36, do: [{ wave: 'raid1' }] },
  { id: 'B14b', if: { quest: 's_roxy_water', stage: 'spring' }, spot: 'north_spring', r: 12, dialogue: 'B14b' },
  { id: 'B15b', if: { quest: 's_marta_bridge', stage: 'bridge' }, spot: 'alder_west', r: 10, dialogue: 'B15b' },
  { id: 'B18b', if: { quest: 's_boris_gate', stage: 'upper' }, spot: 'upper_gate', r: 12, dialogue: 'B18b' },
  { id: 'B19b', if: { quest: 's_rann_nests', stage: 'pipe' }, spot: 'rann_pipe', r: 10, dialogue: 'B19b' },
  { id: 'B22b', if: { quest: 's_tobias_road', stage: 'post' }, spot: 'relay_gate_out', r: 14, dialogue: 'B22b' },
  { id: 'B09_kids', if: { flag: 'ballad' }, spot: 'square', r: 18, say: ['B09b_014', 'B09b_015', 'B09b_016'] },
];
