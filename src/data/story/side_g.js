import { S } from './dsl.js';

/**
 * Side stories B10 (Boris' night raid), B13a-d (four caches), B14 (Roxy and the spring), B15 (Marta's bridge)
 * (docs/story/04_side_stories.md). Quests: data/quests.js; props / volley targets / waves: data/story/props.js;
 * places: data/story/sideprops.js.
 */
const TRUST = (d) => ({ addVar: ['ROXY_TRUST', d, -3, 6] });


export const SIDE_G = {
  // B10 — the night raid: the request (a: the plan decides the preparation), the report (b).
  ...S('B10a', ($) => [
    $.L(1, 3),
    $.CH('B10a.1', [
      $.O(4, [$.L(5), $.DO({ setVar: ['B10_PLAN', 'carts'] })]),
      $.O(6, [$.L(7), $.DO({ setVar: ['B10_PLAN', 'lantern'] })]),
    ]),
    $.DO([{ startQuest: 'c_night_raid' }, { advance: 'c_night_raid' }]),
  ]),
  ...S('B10b', ($) => [
    $.L(1, 3),
    $.CH('B10b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ setVar: ['BORIS_NIGHT', true] }, { advance: 'c_night_raid' }]),
  ]),

  // B13 — four caches: a short talk each, the find is a task at the place.
  ...S('B13a', ($) => [
    $.L(1, 3),
    $.CH('B13a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'c_cache_bridge' }, { advance: 'c_cache_bridge' }]),
  ]),
  ...S('B13b', ($) => [
    $.L(1, 3),
    $.CH('B13b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'c_cache_oak' }, { advance: 'c_cache_oak' }]),
  ]),
  ...S('B13c', ($) => [
    $.L(1, 3),
    $.CH('B13c.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)], { if: { roxy: true } })]),
    $.DO([{ startQuest: 'c_cache_pond' }, { advance: 'c_cache_pond' }]),
  ]),
  ...S('B13d', ($) => [
    $.L(1, 3),
    $.CH('B13d.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'c_cache_tar' }, { advance: 'c_cache_tar' }]),
  ]),

  // B14 — Roxy and the spring: Wiss (a), the chamber under the spring (b: who does what), the report (c).
  ...S('B14a', ($) => [
    $.L(1, 5),
    $.CH('B14a.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)])]),
    $.DO([{ startQuest: 's_roxy_water' }, { advance: 's_roxy_water' }]),
  ]),
  ...S('B14b', ($) => [
    $.L(1, 4),
    $.CH('B14b.1', [
      $.O(5, [$.L(6), $.DO([TRUST(1), { setVar: ['B14_PLAN', 'gate'] }])]),
      $.O(7, [$.L(8), $.DO({ setVar: ['B14_PLAN', 'wash'] })]),
      $.O(9, [$.L(10), $.DO({ setVar: ['B14_PLAN', 'blast'] })]),
    ]),
    $.DO({ advance: 's_roxy_water' }),
  ]),
  ...S('B14c', ($) => [
    $.L(1, 4),
    $.CH('B14c.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ setVar: ['ROXY_WATER', true] }, { advance: 's_roxy_water' }]),
  ]),
  // after the decision at the spring (said when the sample is taken)
  ...S('B14d', ($) => [$.L(11, 13)], { prefix: 'B14b' }),

  // B15 — Marta's bridge: the request (a), the repair plan at the bridge (b), the pay (c).
  ...S('B15a', ($) => [
    $.L(1, 4),
    $.CH('B15a.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO([{ startQuest: 's_marta_bridge' }, { advance: 's_marta_bridge' }]),
  ]),
  ...S('B15b', ($) => [
    $.L(1, 4),
    $.CH('B15b.1', [
      $.O(5, [$.L(6), $.DO({ setVar: ['B15_PLAN', 'clip'] })]),
      $.O(7, [$.L(8), $.DO({ setVar: ['B15_PLAN', 'edge'] })]),
    ]),
    $.DO({ advance: 's_marta_bridge' }),
  ]),
  ...S('B15c', ($) => [
    $.L(1, 4),
    $.CH('B15c.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)])]),
    $.DO([{ setVar: ['MARTA_BRIDGE', true] }, { advance: 's_marta_bridge' }]),
  ]),
};
