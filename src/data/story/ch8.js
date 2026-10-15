import { S } from './dsl.js';

/**
 * Chapter 8, "Город над машиной" (docs/story/03_chapters_5-10.md): the city HQ and the first water (C15: WATER_FIRST), the shelter of
 * Lina and Mia (C16), the pump (C17: three repair plans), Veyr at the service panel (C18), the deep shaft with Dan and Osa (C19: three
 * plans), the link with Edmund (C20). Levels: Town.js (hatch, shelter), world/build/Pump.js; props, volley targets, waves:
 * data/story/props.js; quest: data/quests.js `ch8_city`.
 */
const TRUST = (d) => ({ addVar: ['ROXY_TRUST', d, -3, 6] });

export const CH8 = {
  // C15 — Luna: where do the barrels go? (answer 3 asks for the numbers and returns to the choice)
  ...S('C15', ($) => [
    $.L(1, 6),
    $.MENU('C15.1', [$.O(14, [$.L(15)])], [
      $.O(7, [$.L(8, 9), $.DO({ setVar: ['WATER_FIRST', 'residents'] })]),
      $.O(10, [$.L(11, 13), $.DO({ setVar: ['WATER_FIRST', 'repair'] })]),
    ]),
    $.L(16),
    $.DO({ advance: 'ch8_city' }),
  ]),

  // C16 — Lina and Mia at the shelter (the stage also needs the cart and the barrier: props).
  ...S('C16', ($) => [
    $.L(1, 3),
    $.IF({ v: 'MIA_KIND' }, [$.L(4, 6), $.DO({ setVar: ['MIA_SUPPORT', true] })], [$.L(7, 9)]),
    $.L(10),
    $.CH('C16.1', [
      $.O(11, [$.L(12, 13)], { if: [{ nv: 'BERNARD_BROKEN' }, { quest: 'ch2_bernard', status: 'done' }] }),
      $.O(14, [$.L(15)]),
      $.O(16, [$.L(17, 19)]),
    ]),
    $.DO({ setFlag: 'C16_DONE' }),
  ]),

  // C17 — the pump: Garret, the jammed valve; after the first turn a seam leaks and the plan is chosen (C17b).
  ...S('C17', ($) => [$.L(1, 5), $.DO({ advance: 'ch8_city' })]),
  ...S('C17b', ($) => [
    $.L(6),
    $.CH('C17.1', [
      $.O(7, [$.L(8), $.DO({ setVar: ['C17_PLAN', 'shield'] })]),
      $.O(9, [$.L(10), $.DO({ setVar: ['C17_PLAN', 'hold'] })]),
      $.O(11, [$.L(12), $.DO({ setVar: ['C17_PLAN', 'flow'] })]),
    ]),
    $.DO({ advance: 'ch8_city' }),
  ], { prefix: 'C17' }),
  ...S('C17c', ($) => [
    $.L(13, 16),
    $.DO([{ give: [['link_module', 1]] }, { advance: 'ch8_city' }]),
  ], { prefix: 'C17' }),

  // C18 — Veyr at the service panel.
  ...S('C18', ($) => [
    $.DO({ setFlag: 'pump_projection' }),
    $.L(1, 6),
    $.CH('C18.1', [$.O(7, [$.L(8, 9)]), $.O(10, [$.L(11, 12)]), $.O(13, [$.L(14, 15)])]),
    $.L(16, 17),
    $.DO({ advance: 'ch8_city' }),
  ]),

  // C19 — Dan and Osa in the deep shaft: the plan (C19) and what Osa says after the rescue (C19b).
  ...S('C19', ($) => [
    $.L(1, 5),
    $.CH('C19.1', [
      $.O(6, [$.L(7), $.DO({ setVar: ['C19_PLAN', 'lever'] })]),
      $.O(8, [$.L(9, 10), $.DO({ setVar: ['C19_PLAN', 'latch'] })]),
      $.O(11, [$.L(12), $.DO({ setVar: ['C19_PLAN', 'breaker'] })]),
    ]),
    $.DO({ advance: 'ch8_city' }),
  ]),
  ...S('C19b', ($) => [$.L(13, 15), $.DO({ advance: 'ch8_city' })], { prefix: 'C19' }),

  // C20 — Edmund over the link: the last talk before the central hall.
  ...S('C20', ($) => [
    $.L(1),
    $.L(901, 904),
    $.CH('C20.1', [
      $.O(905, [$.L(906, 907), $.DO(TRUST(1))]),
      $.O(908, [$.L(909, 910)]),
      $.O(911, [$.L(912)]),
    ]),
    $.L(913, 915),
    $.DO([{ promote: 'C' }, { setVar: ['AXEL_LOCAL_FLOW_SAFE', true] }, { setVar: ['NEXT_NORTH_SURVEY', 'planned'] }, { advance: 'ch8_city' }]),
  ]),
};
