import { S } from './dsl.js';

/**
 * Version 2.0, chapter 6 "Каменный уступ" (docs/ainstrey/06_Глава_Айнстрея.md, D00-D13): Luna's letter and the order, Nera at the
 * well of Olkhovka, Edmund's device, Doren at the Stone Ledge, the survey, the water, the supports, the choice of the method,
 * the old road post, the carts and the act, the first view of Ainstrey, Lissa at the fork, the White mills, the south dam.
 * The level: world/build/AinstreyLedge.js (the rockfall) and Ainstrey.js (mills, dam); props, volley targets, waves: data/story/props.js;
 * quest: data/quests.js `ainstrey_road`. Lines are referenced by clip number only (ids are those of the package).
 */
const ALL_SURVEYED = [{ v: 'ROAD_SURVEY_WATER' }, { v: 'ROAD_SURVEY_SLAB' }, { v: 'ROAD_SURVEY_WINCH' }];
const DITCH = { var: ['DRAIN_ROUTE', '==', 'ditch'] };

export const CHD1 = {
  // D00 — Luna: the letter for Selia Morn and the order.
  ...S('D00', ($) => [
    $.L(1, 6),
    $.CH('D00.1', [$.O(7, [$.L(8, 9)]), $.O(10, [$.L(11, 12)]), $.O(13, [$.L(14, 15)])]),
    $.L(16),
    $.DO([{ setVar: ['AINSTRAY_EXPEDITION', true] }, { advance: 'ainstrey_road' }]),
  ]),

  // D01 — Nera at the well of Olkhovka.
  ...S('D01', ($) => [
    $.L(1, 7),
    $.CH('D01.1', [$.O(8, [$.L(9)]), $.O(10, [$.L(11)]), $.O(12, [$.L(13, 15)])]),
    $.L(16),
    $.DO({ advance: 'ainstrey_road' }),
  ]),

  // D02 — Edmund: the device and the request to Ilar.
  ...S('D02', ($) => [
    $.L(1, 4),
    $.CH('D02.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8, 9)]), $.O(10, [$.L(11)])]),
    $.L(12),
    $.DO([{ give: [['road_scanner', 1]] }, { advance: 'ainstrey_road' }]),
  ]),

  // D03 — Doren at the Stone Ledge: the poles, the old guards, the optional road post.
  ...S('D03', ($) => [
    $.L(1, 6),
    $.CH('D03.1', [
      $.O(7, [$.L(8), $.DO({ setFlag: 'road_post_hint' })]),
      $.O(9, [$.L(10)]),
      $.O(11, [$.L(12, 13)]),
    ]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),

  // D04 — the three points of the survey (each said at its place), then the choice of the preparation.
  ...S('D04a', ($) => [
    $.L(1, 2),
    $.DO({ setVar: ['ROAD_SURVEY_WATER', true] }),
    $.IF(ALL_SURVEYED, [$.JUMP('D04')]),
  ], { prefix: 'D04' }),
  ...S('D04b', ($) => [
    $.L(3, 4),
    $.DO({ setVar: ['ROAD_SURVEY_SLAB', true] }),
    $.IF(ALL_SURVEYED, [$.JUMP('D04')]),
  ], { prefix: 'D04' }),
  ...S('D04c', ($) => [
    $.L(5, 6),
    $.DO({ setVar: ['ROAD_SURVEY_WINCH', true] }),
    $.IF(ALL_SURVEYED, [$.JUMP('D04')]),
  ], { prefix: 'D04' }),
  ...S('D04', ($) => [
    $.N('Все три места осмотрены. Нэра отмечает их на плане.'),
    $.CH('D04.1', [
      $.O(7, [$.L(8)]),
      $.O(9, [$.L(10), $.DO({ setFlag: 'D04_pref_explosion' })]),
      $.O(11, [$.L(12), $.DO({ setFlag: 'D04_pref_winch' })]),
    ]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),

  // D05 — where the water goes (two routes; the third answer only compares them).
  ...S('D05', ($) => [
    $.L(1, 4),
    $.MENU('D05.1', [$.O(11, [$.L(12)])], [
      $.O(5, [$.L(6, 7), $.DO({ setVar: ['DRAIN_ROUTE', 'ditch'] })]),
      $.O(8, [$.L(9, 10), $.DO({ setVar: ['DRAIN_ROUTE', 'service'] })]),
    ]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),
  // ... and when the pocket has been emptied.
  ...S('D05b', ($) => [$.L(13, 15)], { prefix: 'D05' }),

  // D06 — the supports under load, then the safe preparation.
  ...S('D06', ($) => [
    $.L(1, 4),
    $.CH('D06.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.L(11, 13),
    $.DO([{ setVar: ['ROAD_BRACED', true] }, { setFlag: 'D06_DONE' }, { heal: true }]),
  ]),

  // D07 — the choice of the method (the third answer is a free look around).
  ...S('D07', ($) => [
    $.L(1),
    $.MENU('D07.1', [$.O(10, [$.L(11)])], [
      $.O(2, [$.L(3, 5), $.DO({ setVar: ['CLEARING_METHOD', 'explosion'] })]),
      $.O(6, [$.L(7, 9), $.DO({ setVar: ['CLEARING_METHOD', 'winch'] })]),
    ]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),

  // D08 — the pass: the post was switched off (Roxy, Nera, Megumin) or the guards come (said during the fight: wave road_guards);
  // after either, Nera and Doren organise the clearing of the small stuff.
  ...S('D08a', ($) => [$.L(1, 3), $.JUMP('D08c')], { prefix: 'D08' }),
  ...S('D08c', ($) => [$.L(7, 8), $.DO({ advance: 'ainstrey_road' })], { prefix: 'D08' }),

  // D09 — the carts (each said when it has gone through), then the act.
  ...S('D09a', ($) => [$.L(1, 3)], { prefix: 'D09' }),
  ...S('D09b', ($) => [$.L(4, 5)], { prefix: 'D09' }),
  ...S('D09', ($) => [
    $.L(6),
    $.CH('D09.1', [$.O(7, [$.L(8)]), $.O(9, [$.L(10)]), $.O(11, [$.L(12)])]),
    $.DO([{ setVar: ['AINSTRAY_ROAD_OPEN', true] }, { advance: 'ainstrey_road' }]),
  ]),

  // D10 — the first view of Ainstrey (a place trigger on the chalk slopes; the player keeps control of the camera).
  ...S('D10', ($) => [
    $.L(1, 3),
    $.CH('D10.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)]), $.O(8, [$.L(9)])]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),

  // D11 — Lissa at the fork.
  ...S('D11', ($) => [
    $.L(1, 5),
    $.CH('D11.1', [
      $.O(6, [$.L(7)]),
      $.O(8, [$.IF(DITCH, [$.L(9)], [$.L(10)])]),
      $.O(11, [$.L(12)]),
    ]),
    $.L(13),
    $.DO({ advance: 'ainstrey_road' }),
  ]),

  // D12 — the White mills: the wheel (a short task with a lever and tongs), then the stamp on the fragment.
  ...S('D12', ($) => [
    $.L(1, 4),
    $.CH('D12.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8), $.DO({ setFlag: 'mill_fenced' })])]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),
  ...S('D12b', ($) => [$.L(9, 11), $.DO({ setFlag: 'mill_stamp' })], { prefix: 'D12' }),

  // D13 — the south dam: the last words before the gate.
  ...S('D13', ($) => [
    $.L(1, 4),
    $.CH('D13.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO({ advance: 'ainstrey_road' }),
  ]),
};
