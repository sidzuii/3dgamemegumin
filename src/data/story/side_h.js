import { S } from './dsl.js';

/**
 * Side stories B16 (Garret's shift tag), B17 (Fenrik: names in the song), B18 (Boris' upper gate), B19 (Rann's empty nests)
 * (docs/story/04_side_stories.md). Quests: data/quests.js; props / volley targets / waves: data/story/props.js.
 */
export const SIDE_H = {
  // B16 — the plan (a), the shift room (b: said at the journal; the last line when the stamp is found), the answer (c).
  ...S('B16a', ($) => [
    $.L(1, 4),
    $.CH('B16a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ startQuest: 's_garret_tag' }, { advance: 's_garret_tag' }]),
  ]),
  ...S('B16b', ($) => [
    $.L(1, 4),
    $.CH('B16b.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO({ advance: 's_garret_tag' }),
  ]),
  ...S('B16c', ($) => [
    $.L(1, 3),
    $.CH('B16c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['GARRET_RECORD', true] }, { advance: 's_garret_tag' }]),
  ]),

  // B17 — Fenrik wants the facts (a), Marta's memory at the caravan yard (b), the new verse (c).
  ...S('B17a', ($) => [
    $.L(1, 3),
    $.CH('B17a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)]), $.O(8, [$.L(9)])]),
    $.DO([{ startQuest: 's_fenrik_names' }, { advance: 's_fenrik_names' }]),
  ]),
  ...S('B17b', ($) => [
    $.L(1, 5),
    $.CH('B17b.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)])]),
    $.DO({ advance: 's_fenrik_names' }),
  ]),
  ...S('B17c', ($) => [
    $.L(1, 6),
    $.CH('B17c.1', [$.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO([{ setVar: ['FENRIK_NAMES', true] }, { advance: 's_fenrik_names' }]),
  ]),

  // B18 — Boris' water (a), the upper gate (b: the plan), the manual mode (c).
  ...S('B18a', ($) => [
    $.L(1, 4),
    $.CH('B18a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ startQuest: 's_boris_gate' }, { advance: 's_boris_gate' }]),
  ]),
  ...S('B18b', ($) => [
    $.L(1, 3),
    $.CH('B18b.1', [
      $.O(4, [$.L(5), $.DO({ setVar: ['B18_PLAN', 'far'] })]),
      $.O(6, [$.L(7), $.DO({ setVar: ['B18_PLAN', 'wash'] })]),
      $.O(8, [$.L(9, 10), $.DO({ setVar: ['B18_PLAN', 'wash'] })]),
    ]),
    $.DO({ advance: 's_boris_gate' }),
  ]),
  ...S('B18c', ($) => [
    $.L(1, 3),
    $.CH('B18c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['BORIS_GATE', true] }, { advance: 's_boris_gate' }]),
  ]),

  // B19 — the empty nests (a), the pipe by the ravine (b: the plan), the return (c).
  ...S('B19a', ($) => [
    $.L(1, 3),
    $.CH('B19a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 's_rann_nests' }, { advance: 's_rann_nests' }]),
  ]),
  ...S('B19b', ($) => [
    $.L(1, 4),
    $.CH('B19b.1', [
      $.O(5, [$.L(6), $.DO({ setVar: ['B19_PLAN', 'net'] })]),
      $.O(7, [$.L(8), $.DO({ setVar: ['B19_PLAN', 'lure'] })]),
      $.O(9, [$.L(10), $.DO({ setVar: ['B19_PLAN', 'rope'] })]),
    ]),
    $.DO({ advance: 's_rann_nests' }),
  ]),
  ...S('B19c', ($) => [
    $.L(1, 3),
    $.CH('B19c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['RANN_NESTS', true] }, { advance: 's_rann_nests' }]),
  ]),
};
