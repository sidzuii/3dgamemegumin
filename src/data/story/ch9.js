import { S } from './dsl.js';

/**
 * Chapter 9, "Тот, кто позвал" (docs/story/03_chapters_5-10.md): Veyr in the capsule (C21), the rules of the small test (C22), the test
 * and the breach (C23), the battle for control (C24), the exit from the capsule (C25), the decision about the installation (C26:
 * ENDING). Levels: world/build/Core.js; props, volley targets, waves (with shields): data/story/props.js; quest: `ch9_capsule`.
 */
export const CH9 = {
  // C21 — the central hall: Veyr's body in the capsule, his projection at the panel.
  ...S('C21', ($) => [
    $.DO({ setFlag: 'core_projection' }),
    $.L(1, 10),
    $.CH('C21.1', [$.O(11, [$.L(12)]), $.O(13, [$.L(14, 15)]), $.O(16, [$.L(17, 18)])]),
    $.L(19, 20),
    $.DO({ advance: 'ch9_capsule' }),
  ]),

  // C22 — Edmund over the link: the rules of the small test (who holds the switch).
  ...S('C22', ($) => [
    $.L(1, 5),
    $.CH('C22.1', [
      $.O(6, [$.L(7), $.DO({ setVar: ['C22_PLAN', 'roxy_switch'] })]),
      $.O(8, [$.L(9), $.DO({ setVar: ['C22_PLAN', 'megumin_switch'] })]),
      $.O(10, [$.L(11, 12), $.DO({ setVar: ['C22_PLAN', 'cable'] })]),
    ]),
    $.DO({ advance: 'ch9_capsule' }),
  ]),

  // C23 — the test: the power drops, Veyr opens the old amplifier (C23a); after the cable is cut (C23b).
  ...S('C23a', ($) => [
    $.L(1, 5),
    $.IF({ var: ['C22_PLAN', '==', 'megumin_switch'] }, [$.L(6, 8)], [$.L(9, 10)]),
    $.DO({ wave: 'amp_guards' }),
  ], { prefix: 'C23' }),
  ...S('C23b', ($) => [
    $.L(11, 13),
    $.DO([{ clearFlag: 'core_hot' }, { advance: 'ch9_capsule' }]),
  ], { prefix: 'C23' }),

  // C24 — between the waves: Veyr offers to lower the heat (VEYR_HELP); after the victory.
  ...S('C24b', ($) => [
    $.L(3),
    $.CH('C24.1', [
      $.O(4, [$.L(5, 6), $.DO({ setVar: ['VEYR_HELP', true] })]),
      $.O(7, [$.L(8), $.DO({ setVar: ['VEYR_HELP', false] })]),
    ]),
    $.DO({ advance: 'ch9_capsule' }),
  ], { prefix: 'C24' }),
  ...S('C24c', ($) => [
    $.L(9, 11),
    $.DO({ advance: 'ch9_capsule' }),
  ], { prefix: 'C24' }),

  // C25 — the lock is turned: Veyr leaves the capsule.
  ...S('C25', ($) => [
    $.L(1, 6),
    $.DO([{ setFlag: 'capsule_open' }, { setFlag: 'veyr_out' }]),
    $.CH('C25.1', [$.O(7, [$.L(8, 9)]), $.O(10, [$.L(11, 12)]), $.O(13, [$.L(14, 15)])]),
    $.DO({ advance: 'ch9_capsule' }),
  ]),

  // C26 — the decision (the third answer returns to the choice: look at the readings again).
  ...S('C26', ($) => [
    $.L(1, 6),
    $.MENU('C26.1', [$.O(15, [$.L(16)])], [
      $.O(7, [$.L(8, 10), $.DO({ setVar: ['ENDING', 'closure'] })]),
      $.O(11, [$.L(12, 14), $.DO({ setVar: ['ENDING', 'rebuild'] })]),
    ]),
    $.L(17),
    $.DO({ advance: 'ch9_capsule' }),
  ]),
};
