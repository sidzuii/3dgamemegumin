import { S } from './dsl.js';

/**
 * Chapter 10, "Работа для двух магов" (docs/story/03_chapters_5-10.md): the final preparation (C27), the final operation in the central
 * hall — C28 for ENDING=closure (the collector is destroyed) or C29 for ENDING=rebuild (the amplifier is destroyed, the small circuit
 * stays) — and the epilogue: Luna (C30, rank C), Clara (C31), Bernard and Lina (C32) in any order, then Megumin and Roxy at the north
 * signpost (C33). Props, waves, explosion goals: data/story/props.js; quest: data/quests.js `ch10_finale`.
 */
const T3 = { var: ['ROXY_TRUST', '>=', 3] };

export const CH10 = {
  // C27 — the last check (answer 1: look at the equipment first, the game is saved; answer 2: begin).
  ...S('C27', ($) => [
    $.L(1, 4),
    $.IF(T3, [$.L(5, 6)], [$.L(7, 9)]),
    $.IF([{ v: 'ROXY_EXPLOSION' }, { v: 'ROXY_ACCOUNTABILITY' }], [$.L(10, 11)]),
    $.CH('C27.1', [
      $.O(12, [$.L(13), $.DO({ save: true }), $.END]),
      $.O(14, [$.L(15)]),
    ]),
    $.DO({ advance: 'ch10_finale' }),
  ]),

  // C28 — closure: the last words before the blast (C28a) and after it (C28b).
  ...S('C28a', ($) => [$.L(1, 5), $.DO({ advance: 'ch10_finale' })], { prefix: 'C28' }),
  ...S('C28b', ($) => [$.L(6, 10)], { prefix: 'C28' }),

  // C29 — rebuild.
  ...S('C29a', ($) => [$.L(1, 6), $.DO({ advance: 'ch10_finale' })], { prefix: 'C29' }),
  ...S('C29b', ($) => [$.L(7, 12)], { prefix: 'C29' }),

  // C30 — Luna: the report is accepted, rank C, what the city looks like.
  ...S('C30', ($) => [
    $.L(1),
    $.IF({ v: 'PUBLIC_REPORT' }, [$.L(2)], [$.L(3)]),
    $.L(4, 5),
    $.DO({ promote: 'C' }),
    $.L(6, 7),
    $.IF({ var: ['ENDING', '==', 'closure'] }, [$.L(8, 11)], [$.L(12, 15)]),
    $.CH('C30.1', [$.O(16, [$.L(17)]), $.O(18, [$.L(19, 20)]), $.O(21, [$.L(22, 23)])]),
    $.DO({ setFlag: 'C30_DONE' }),
  ]),

  // C31 — Clara answers the legend.
  ...S('C31', ($) => [
    $.L(1, 4),
    $.IF({ var: ['ENDING', '==', 'closure'] }, [$.L(5)], [$.L(6)]),
    $.CH('C31.1', [$.O(7, [$.L(8, 10)]), $.O(11, [$.L(12)]), $.O(13, [$.L(14, 15)])]),
    $.DO({ setFlag: 'C31_DONE' }),
  ]),

  // C32 — Bernard and Lina at the table (the branch follows what happened in A12-A14).
  ...S('C32', ($) => [
    $.L(1, 4),
    $.IF({ v: 'BERNARD_BROKEN' }, [$.L(5, 7)], [
      $.IF({ var: ['BERNARD_SHARE', '==', 'agreed'] }, [$.L(10, 11)], [
        $.IF({ v: 'BERNARD_PROMISE' }, [$.L(8, 9)]),
      ]),
    ]),
    $.CH('C32.1', [$.O(12, [$.L(13)]), $.O(14, [$.L(15)]), $.O(16, [$.L(17, 18)])]),
    $.DO({ setFlag: 'C32_DONE' }),
  ]),

  // C33 — at the north signpost, before the credits.
  ...S('C33', ($) => [
    $.L(1, 3),
    $.IF(T3, [$.L(4, 8)], [$.L(9, 12)]),
    $.CH('C33.1', [$.O(13, [$.L(14, 16)]), $.O(17, [$.L(18, 19)]), $.O(20, [$.L(21, 23)])]),
    $.DO({ advance: 'ch10_finale' }),
  ]),
};
