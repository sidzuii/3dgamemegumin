import { S } from './dsl.js';

/**
 * Rank-F orders of the guild board, B01-B06 (docs/story/04_side_stories.md): briefing (a), report (b / c).
 * Three different ones give rank E (A09). The quests themselves: data/quests.js.
 */
export const SIDE_F = {
  // B01 — herbs for Wiss.
  ...S('B01a', ($) => [
    $.L(1, 3),
    $.CH('B01a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)]), $.O(8, [$.L(9)])]),
    $.DO([{ startQuest: 'c_herbs' }, { advance: 'c_herbs' }]),
  ]),
  ...S('B01b', ($) => [
    $.L(1, 3),
    $.CH('B01b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ take: [['herb', 5]] }, { advance: 'c_herbs' }]),
  ]),

  // B02 — the cat Ugolyok. Mia (a), Bernard and Boris (b, 'boris'), the return (c): her savings are accepted or refused.
  ...S('B02a', ($) => [
    $.L(1, 5),
    $.CH('B02a.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)]), $.O(10, [$.L(11)])]),
    $.DO([{ startQuest: 'c_lost_cat' }, { advance: 'c_lost_cat' }]),
  ]),
  ...S('B02b', ($) => [
    $.L(1, 3),
    $.DO({ advance: 'c_lost_cat' }),
    $.END,
    $.L(4, 6),
  ], { entries: { boris: 4 } }),
  ...S('B02c', ($) => [
    $.L(1, 3),
    $.CH('B02c.1', [
      $.O(4, [$.L(5, 6), $.DO([{ setVar: ['MIA_KIND', true] }, { rel: ['mia', 25] }, { setFlag: 'mia_kind' }])]),
      $.O(7, [$.L(8, 9), $.DO([{ setVar: ['MIA_KIND', false] }, { eris: 25 }, { rel: ['mia', 10] }])]),
    ]),
    $.L(10),
    $.DO([{ setFlag: 'cat_returned' }, { advance: 'c_lost_cat' }]),
  ]),

  // B03 — goblin scouts: briefing and report at Luna's desk (the report opens B06).
  ...S('B03a', ($) => [
    $.L(1, 3),
    $.CH('B03a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'c_goblin_scouts' }, { advance: 'c_goblin_scouts' }]),
  ]),
  ...S('B03b', ($) => [
    $.L(1, 3),
    $.CH('B03b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO({ advance: 'c_goblin_scouts' }),
  ]),

  // B04 — mushrooms on the river meadow (Boris).
  ...S('B04a', ($) => [
    $.L(1, 3),
    $.CH('B04a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7, 8)]), $.O(9, [$.L(10)])]),
    $.DO([{ startQuest: 'c_mushroom_field' }, { advance: 'c_mushroom_field' }]),
  ]),
  ...S('B04b', ($) => [
    $.L(1, 3),
    $.CH('B04b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO({ advance: 'c_mushroom_field' }),
  ]),

  // B05 — iron ore for the forge; the report opens the workbench.
  ...S('B05a', ($) => [
    $.L(1, 3),
    $.CH('B05a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)]), $.O(8, [$.L(9)])]),
    $.DO([{ startQuest: 'c_ore_for_garret' }, { advance: 'c_ore_for_garret' }]),
  ]),
  ...S('B05b', ($) => [
    $.L(1, 3),
    $.CH('B05b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ take: [['iron_ore', 4]] }, { advance: 'c_ore_for_garret' }]),
  ]),

  // B06 — escort to Olkhovka: terms (a), the ambush lines (b, spoken during the escort), payment (c).
  ...S('B06a', ($) => [
    $.L(1, 3),
    $.CH('B06a.1', [$.O(10, [$.L(4)]), $.O(5, [$.L(6, 7)]), $.O(8, [$.L(9)])]),
    $.DO([{ advance: 'c_escort_tobias' }, { escort: { npc: 'tobias', to: 'olkhovka_tobias', road: 'east_road', ambush: { spot: 'ambush_point', type: 'mushroom', n: 3 } } }]),
  ]),
  ...S('B06b', ($) => [$.L(1, 6)]),
  ...S('B06c', ($) => [
    $.L(1, 3),
    $.CH('B06c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO({ advance: 'c_escort_tobias' }),
  ]),
};
