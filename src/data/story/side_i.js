import { S } from './dsl.js';

/**
 * Side stories B20 (Edmund and Tera), B21 (Clara's book of witnesses), B22 (Tobias: the open road), B23 (a day at the shelter)
 * (docs/story/04_side_stories.md). Quests: data/quests.js; props / volley targets / waves: data/story/props.js.
 */
export const SIDE_I = {
  // B20 — the argument at the table (a), the first comparison at the slope (b), two operators (c).
  ...S('B20a', ($) => [
    $.L(1, 4),
    $.CH('B20a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO([{ startQuest: 's_edmund_team' }, { advance: 's_edmund_team' }]),
  ]),
  ...S('B20b', ($) => [
    $.L(1, 4),
    $.CH('B20b.1', [$.O(5, [$.L(6, 7)]), $.O(8, [$.L(9, 10)])]),
  ]),
  ...S('B20c', ($) => [
    $.L(1, 3),
    $.CH('B20c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['EDMUND_TEAM', true] }, { advance: 's_edmund_team' }]),
  ]),

  // B21 — Agata at the archive table (a), the water ledger with Luna (b), Agata reads the record (c).
  ...S('B21a', ($) => [
    $.L(1, 4),
    $.CH('B21a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO([{ startQuest: 's_clara_book' }, { advance: 's_clara_book' }]),
  ]),
  ...S('B21b', ($) => [
    $.L(1, 4),
    $.CH('B21b.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
  ]),
  ...S('B21c', ($) => [
    $.L(1, 3),
    $.CH('B21c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['CLARA_RECORD', true] }, { advance: 's_clara_book' }]),
  ]),

  // B22 — Tobias at the market (a), the old post (b), Olkhovka (c).
  ...S('B22a', ($) => [
    $.L(1, 4),
    $.CH('B22a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ startQuest: 's_tobias_road' }, { advance: 's_tobias_road' }]),
  ]),
  ...S('B22b', ($) => [
    $.L(1, 4),
    $.CH('B22b.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8, 9)])]),
    $.DO({ advance: 's_tobias_road' }),
  ]),
  ...S('B22c', ($) => [
    $.L(1, 4),
    $.CH('B22c.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ setVar: ['TOBIAS_ROAD', true] }, { advance: 's_tobias_road' }]),
  ]),

  // B23 — a day at the shelter: Lina's tables (a; the third answer simply waits), Mia and the forgotten bag (b), the last table (c).
  ...S('B23a', ($) => [
    $.L(1, 4),
    $.CH('B23a.1', [
      $.O(5, [$.L(6), $.DO([{ startQuest: 's_lina_day' }, { setVar: ['B23_PLAN', 'bread'] }, { advance: 's_lina_day' }])]),
      $.O(7, [$.L(8), $.DO([{ startQuest: 's_lina_day' }, { setVar: ['B23_PLAN', 'lamps'] }, { advance: 's_lina_day' }])]),
      $.O(9, [$.L(10), $.END]),
    ]),
  ]),
  ...S('B23b', ($) => [
    $.L(1, 3),
    $.CH('B23b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.IF({ v: 'MIA_KIND' }, [$.L(8, 9)]),
    $.DO({ advance: 's_lina_day' }),
  ]),
  ...S('B23c', ($) => [
    $.L(1, 4),
    $.CH('B23c.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO([{ setVar: ['AXEL_SHELTER', true] }, { advance: 's_lina_day' }]),
  ]),
};
