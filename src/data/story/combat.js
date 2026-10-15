import { S } from './dsl.js';

/**
 * Combat training scenes (docs/combat/04 §1–2); the lines are the new ids CB01_* / CB02_* (data/story/combatClips.js).
 *   CB01 — Bran teaches the directed force (Crimson Breach); `CB01_done` is the result after the lane.
 *   CB02 — Roxy and Megumin agree on roles in a pair; `CB02_done` is the result of the exercise.
 */
export const COMBAT = {
  ...S('CB01', ($) => [
    $.L(1, 5),
    $.CH('CB01.1', [
      $.O(6, [$.L(7)]),
      $.O(8, [$.L(9)]),
    ]),
    $.DO([{ setFlag: 'skill_M_F' }, { advance: 'cb01_breach' }]),
  ]),
  ...S('CB01_done', ($) => [
    $.L(10, 12),
    $.DO({ advance: 'cb01_breach' }),
  ], { prefix: 'CB01' }),

  ...S('CB02', ($) => [
    $.L(1, 5),
    $.CH('CB02.1', [
      $.O(6, [$.L(7)]),
      $.O(8, [$.L(9)]),
    ]),
    $.DO({ event: 'cb02_scene' }),
  ]),
  ...S('CB02_done', ($) => [
    $.L(10, 11),
    $.DO({ event: 'cb02_done' }),
  ], { prefix: 'CB02' }),
};
