import { S } from './dsl.js';

/**
 * Chapter 7, "Договор в ущелье" (docs/story/03_chapters_5-10.md): Luna gives rank D (C11), Marta's cart on a crumbling ledge
 * (C12: three plans, three tasks), Kharz and the treaty panel (C13), the outer drain (C14: a directed blast into an empty wall,
 * two cooling platforms, the measuring posts, then the choice: treaty or battle — KHARZ_ROUTE). Levels: world/build/Drain.js and
 * Countryside.js `convoyLedge`; props, volley targets, waves: data/story/props.js; quest: data/quests.js `ch7_gorge`.
 */
export const CH7 = {
  // C11 — Luna: rank D and the plan.
  ...S('C11', ($) => [
    $.L(1, 5),
    $.CH('C11.1', [$.O(6, [$.L(7, 8)]), $.O(9, [$.L(10, 11)]), $.O(12, [$.L(13, 15)])]),
    $.DO([{ promote: 'D' }, { give: [['rope_kit', 1], ['drain_map', 1], ['hp_potion', 2]] }, { advance: 'ch7_gorge' }]),
  ]),

  // C12 — Marta's cart on the ledge (said by the place trigger): the plan decides the task.
  ...S('C12', ($) => [
    $.L(1, 5),
    $.CH('C12.1', [
      $.O(6, [$.IF({ v: 'MARTA_BAGS' }, [$.L(7)], [$.L(8)]), $.DO({ setVar: ['C12_PLAN', 'cargo'] })]),
      $.O(9, [$.L(10, 11), $.DO({ setVar: ['C12_PLAN', 'roxy'] })]),
      $.O(12, [$.L(13, 14), $.DO({ setVar: ['C12_PLAN', 'rope'] })]),
    ]),
    $.DO({ advance: 'ch7_gorge' }),
  ]),
  ...S('C12b', ($) => [
    $.L(15, 17),
    $.DO({ advance: 'ch7_gorge' }),
  ], { prefix: 'C12' }),

  // C13 — Kharz behind the restriction line.
  ...S('C13', ($) => [
    $.L(1, 7),
    $.CH('C13.1', [$.O(8, [$.L(9, 10)]), $.O(11, [$.L(12, 13)]), $.O(14, [$.L(15, 17)])]),
    $.L(18),
    $.DO([{ setFlag: 'C13_DONE' }, { advance: 'ch7_gorge' }]),
  ]),

  // C14 — the choice (talk to Kharz again to change your mind); the endings of both routes meet in C14x.
  ...S('C14', ($) => [
    $.N('Малый поток проходит. Харз ждёт у линии: пора назвать условия.'),
    $.CH('C14.1', [
      $.O(5, [$.L(6, 9), $.DO([{ setVar: ['KHARZ_ROUTE', 'treaty'] }, { setFlag: 'kharz_line_open' }, { advance: 'ch7_gorge' }])]),
      $.O(10, [$.L(11, 13), $.DO([{ setVar: ['KHARZ_ROUTE', 'battle'] }, { setFlag: 'kharz_line_open' }, { setFlag: 'kharz_hostile' }, { advance: 'ch7_gorge' }])]),
      $.O(14, [$.L(15)]),
    ]),
  ]),
  ...S('C14t', ($) => [$.L(16, 19), $.JUMP('C14x')], { prefix: 'C14' }),
  ...S('C14b', ($) => [$.DO({ setFlag: 'drain_released' }), $.L(20, 23), $.JUMP('C14x')], { prefix: 'C14' }),
  ...S('C14x', ($) => [
    $.DO({ setFlag: 'drain_projection' }),
    $.L(24),
    $.N('Панель Вейра вспыхивает.'),
    $.L(25, 28),
    $.DO({ advance: 'ch7_gorge' }),
  ], { prefix: 'C14' }),
};
