import { S } from './dsl.js';

/**
 * Version 2.0: the side stories of the capital N01-N05 (docs/ainstrey/07_Столичные_побочные_истории.md).
 * N01 the letter from the other bank (Lissa), N02 two stoves (Tavia), N03 a stranger's handwriting (Ilar), N04 the price of a bucket (Mirena),
 * N05 the watch at the White mills (Oskar). Quests: data/quests.js n01..n05; props: data/story/sideprops.js (+ props.js for the behaviour).
 */
export const CHN = {
  // ---- N01 (Lissa)
  ...S('N01a', ($) => [
    $.L(1, 4),
    $.CH('N01a.1', [$.O(5, [$.L(6), $.DO({ setVar: ['N01_PLAN', 'list'] })]), $.O(7, [$.L(8), $.DO({ setVar: ['N01_PLAN', 'street'] })])]),
    $.DO([{ startQuest: 'n01_letter' }, { advance: 'n01_letter' }]),
  ]),
  ...S('N01b', ($) => [
    $.L(1, 3),
    $.CH('N01b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO({ advance: 'n01_letter' }),
  ]),
  ...S('N01c', ($) => [
    $.L(1, 2),
    $.CH('N01c.1', [$.O(3, [$.L(4)]), $.O(5, [$.L(6)])]),
    $.DO([{ setVar: ['LISSA_ADDRESS_FIXED', true] }, { advance: 'n01_letter' }]),
  ]),

  // ---- N02 (Tavia)
  ...S('N02a', ($) => [
    $.L(1, 4),
    $.CH('N02a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ startQuest: 'n02_ovens' }, { advance: 'n02_ovens' }]),
  ]),
  ...S('N02b', ($) => [
    $.L(1, 3),
    $.CH('N02b.1', [$.O(4, [$.L(5), $.DO({ setVar: ['N02_PLAN', 'prop'] })]), $.O(6, [$.L(7), $.DO({ setVar: ['N02_PLAN', 'move'] })])]),
    $.DO({ advance: 'n02_ovens' }),
  ]),
  ...S('N02c', ($) => [
    $.L(1, 3),
    $.CH('N02c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['TAVIA_OVEN', true] }, { advance: 'n02_ovens' }]),
  ]),

  // ---- N03 (Ilar)
  ...S('N03a', ($) => [
    $.L(1, 3),
    $.CH('N03a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'n03_handwriting' }, { advance: 'n03_handwriting' }]),
  ]),
  ...S('N03b', ($) => [
    $.L(1, 3),
    $.CH('N03b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO({ advance: 'n03_handwriting' }),
  ]),
  ...S('N03c', ($) => [
    $.L(1, 3),
    $.CH('N03c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['ILAR_RECORD_CHECKED', true] }, { advance: 'n03_handwriting' }]),
  ]),

  // ---- N04 (Mirena)
  ...S('N04a', ($) => [
    $.L(1, 3),
    $.CH('N04a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'n04_bucket' }, { advance: 'n04_bucket' }]),
  ]),
  ...S('N04b', ($) => [
    $.L(1, 3),
    $.CH('N04b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO({ advance: 'n04_bucket' }),
  ]),
  ...S('N04c', ($) => [
    $.L(1, 3),
    $.CH('N04c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['MILL_WATER_AGREEMENT', true] }, { advance: 'n04_bucket' }]),
  ]),

  // ---- N05 (Oskar)
  ...S('N05a', ($) => [
    $.L(1, 4),
    $.CH('N05a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ startQuest: 'n05_patrol' }, { advance: 'n05_patrol' }, { give: [['n05_reserve_lantern', 1]] }]),
  ]),
  ...S('N05b', ($) => [
    $.L(1, 3),
    $.CH('N05b.1', [
      $.O(4, [$.L(5), $.DO({ setVar: ['N05_PLAN', 'lure'] })]),
      $.O(6, [$.L(7), $.DO({ setVar: ['N05_PLAN', 'top'] })]),
      $.O(8, [$.L(9), $.DO({ setVar: ['N05_PLAN', 'reserve'] })]),
    ]),
    $.DO({ advance: 'n05_patrol' }),
  ]),
  ...S('N05c', ($) => [
    $.L(1, 3),
    $.CH('N05c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['MILLS_PATROL_READY', true] }, { advance: 'n05_patrol' }]),
  ]),
};
