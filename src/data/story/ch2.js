import { S } from './dsl.js';

/**
 * Chapter 2 (docs/story/02_chapters_0-4.md): rank E and the evening conversations. A10 (Fenrik), A11 (Clara) and A12
 * (Bernard) can be done in any order; A13 (Lina) and A14 (Bernard's delayed reaction) close Bernard's story.
 * Variables: BERNARD_PROMISE / BERNARD_SHARE / BERNARD_BROKEN (vars.js); flags A10_DONE / A11_DONE / A12_DONE.
 */
export const CH2 = {
  // A09 — rank E.
  ...S('A09', ($) => [
    $.L(1, 4),
    $.DO({ promote: true }),
    $.L(5),
    $.CH('A09.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)]), $.O(10, [$.L(11)])]),
    $.IF({ not: { seen: 'A09_010' } }, [$.L(12)]),
    $.L(13, 16),
    $.DO({ advance: 'ch1_name' }),
  ]),

  // A10 — Fenrik's song in the tavern (evening).
  ...S('A10', ($) => [
    $.IF({ flag: 'A11_DONE' }, [$.LX('A11', 22)]),
    $.L(1, 8),
    $.CH('A10.1', [$.O(9, [$.L(10)]), $.O(11, [$.L(12)]), $.O(13, [$.L(14, 16)])]),
    $.L(17, 18),
    $.DO([{ setFlag: 'A10_DONE' }, { startIfAvailable: 'ch4_astrarium' }]),
  ]),

  // A11 — Clara: the legend of the Astrarium.
  ...S('A11', ($) => [
    $.L(1, 6),
    $.CH('A11.1', [$.O(7, [$.L(8, 10)]), $.O(11, [$.L(12, 14)]), $.O(15, [$.L(16, 18)])]),
    $.L(19, 21),
    $.DO([{ setFlag: 'A11_DONE' }, { startIfAvailable: 'ch4_astrarium' }]),
  ]),

  // A12 — Bernard on the wall after dusk: the request for secrecy (a promise, an agreement, or neither).
  ...S('A12', ($) => [
    $.L(1, 7),
    $.CH('A12.1', [
      $.O(8, [$.L(9, 10), $.DO({ setVar: ['BERNARD_PROMISE', true] })]),
      $.O(11, [$.L(12, 14), $.DO({ setVar: ['BERNARD_SHARE', 'agreed'] })]),
      $.O(15, [$.L(16, 18), $.DO({ setVar: ['BERNARD_SHARE', 'undecided'] })]),
    ]),
    $.L(19, 23),
    $.DO([{ setFlag: 'A12_DONE' }, { startQuest: 'ch2_bernard' }, { startQuest: 'ch3_lights' }]),
  ]),

  // A13 — Lina asks about Bernard: tell her, keep the promise (and say so), or send her to him.
  ...S('A13', ($) => [
    $.L(1, 3),
    $.CH('A13.1', [
      $.O(4, [
        $.DO({ setFlag: 'A13_TOLD' }),
        $.IF({ var: ['BERNARD_SHARE', '==', 'agreed'] }, [$.L(5, 7)], [
          $.IF({ v: 'BERNARD_PROMISE' }, [$.L(8, 10), $.DO({ setVar: ['BERNARD_BROKEN', true] })], [$.L(11)]),
        ]),
      ]),
      $.O(12, [$.L(13, 14)], { if: { v: 'BERNARD_PROMISE' } }),
      $.O(15, [$.L(16, 19)]),
    ]),
    $.DO({ advance: 'ch2_bernard' }),
  ]),

  // A14 — Bernard's reaction at the next visit: one branch by what happened.
  ...S('A14', ($) => [
    $.IF({ v: 'BERNARD_BROKEN' }, [
      $.L(1, 3),
      $.CH('A14.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    ], [
      $.IF({ any: [{ var: ['BERNARD_SHARE', '==', 'agreed'] }, { flag: 'A13_TOLD' }] }, [$.L(13, 15)], [$.L(8, 12)]),
    ]),
    $.DO({ advance: 'ch2_bernard' }),
  ]),
};
