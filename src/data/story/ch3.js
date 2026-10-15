import { S } from './dsl.js';

/**
 * Chapter 3 (docs/story/02_chapters_0-4.md): Rann's camp, the first shard on the glade, Edmund in Olkhovka,
 * Garret before the descent, the cave-in and the second shard, the letter to Roxy.
 * A16 and A19 are Megumin's own lines at the places (no npc): 'A19' at the cave-in, 'A19:after' at the niche.
 */
export const CH3 = {
  // A15 — Rann in the hunters' camp.
  ...S('A15', ($) => [
    $.L(1, 7),
    $.CH('A15.1', [$.O(8, [$.L(9)]), $.O(10, [$.L(11, 12)]), $.O(13, [$.L(14, 15)])]),
    $.L(16, 18),
    $.DO([{ setFlag: 'glade_known' }, { advance: 'ch3_lights' }]),
  ]),

  // A16 — the stump on the glade: take the shard by the clamp, draw it first, or announce it.
  ...S('A16', ($) => [
    $.L(1, 2),
    $.CH('A16.1', [
      $.O(3, [$.L(4)]),
      $.O(5, [$.L(6), $.DO({ setVar: ['EDMUND_FIELD_NOTE', true] })]),
      $.O(7, [$.L(8)]),
    ]),
    $.L(9),
    $.DO([{ setFlag: 'glade_shard_taken' }, { give: [['star_shard', 1]] }]),
  ]),

  // A17 — Edmund measures the shard; he gives the instrument and the map of the mine.
  ...S('A17', ($) => [
    $.L(1, 8),
    $.CH('A17.1', [$.O(9, [$.L(10)]), $.O(11, [$.L(12, 13)]), $.O(14, [$.L(15, 17)])]),
    $.IF({ v: 'EDMUND_FIELD_NOTE' }, [$.L(18, 19)]),
    $.L(20, 22),
    $.DO([{ give: [['edmund_device', 1]] }, { advance: 'ch3_lights' }]),
  ]),

  // A18 — Garret checks the plan and gives two wedges.
  ...S('A18', ($) => [
    $.L(1, 5),
    $.CH('A18.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)]), $.O(10, [$.L(11)])]),
    $.L(12, 13),
    $.DO({ advance: 'ch3_lights' }),
  ]),

  // A19 — the mine. 'A19': before the blast (the cry "Взрыв!" is A19_007, said at the cast); 'A19:after': at the niche.
  ...S('A19', ($) => [
    $.L(1, 2),
    $.CH('A19.1', [$.O(3, [$.L(4)]), $.O(5, [$.L(6)])]),
    $.DO({ setFlag: 'A19_SEEN' }),
    $.END,
    $.L(8, 10),
    $.DO([{ setFlag: 'deep_shard_taken' }, { setFlag: 'dungeon_cleared' }, { give: [['star_shard', 1]] }]),
  ], { entries: { after: 8 } }),

  // A20 — Edmund compares the two shards and writes to Roxy.
  ...S('A20', ($) => [
    $.L(1, 5),
    $.CH('A20.1', [$.O(6, [$.L(7, 8)]), $.O(9, [$.L(10, 11)]), $.O(12, [$.L(13, 14)])]),
    $.L(15, 17),
    $.DO([{ give: [['sealed_letter', 1]] }, { advance: 'ch3_lights' }]),
  ]),
};
