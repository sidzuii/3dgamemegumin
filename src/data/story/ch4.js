import { S } from './dsl.js';

/**
 * Chapter 4 (docs/story/02_chapters_0-4.md): the pass and the ruins, Roxy's condition, three crystals, the ritual,
 * Roxy joins, the first camp together, Edmund's map, Clara at the seal (the end of the first version).
 * Variables: ROXY_PROMISE / ROXY_START / ROXY_TRUST / ROXY_EXPLOSION / ROXY_REPAIR / ROXY_ACCOUNTABILITY.
 */
const TRUST = (d) => ({ addVar: ['ROXY_TRUST', d, -3, 6] });

export const CH4 = {
  // A21 — the guardians at the gate (spoken as lines on the way: RPG sayChain from the quest stage).
  ...S('A21', ($) => [$.L(1, 5)]),

  // A22 — Roxy: the letter, three crystals, the condition (no explosions in the ruins).
  ...S('A22', ($) => [
    $.L(1, 9),
    $.CH('A22.1', [
      $.O(10, [$.L(11, 12), $.DO({ setVar: ['ROXY_PROMISE', true] })]),
      $.O(13, [$.L(14, 15), $.DO([{ setVar: ['ROXY_PROMISE', true] }, { setVar: ['ROXY_START', 'argument'] }])]),
      $.O(16, [$.L(17, 19), $.DO([{ setVar: ['ROXY_PROMISE', true] }, TRUST(1)])]),
    ]),
    $.L(20, 22),
    $.DO([{ take: [['sealed_letter', 1]] }, { advance: 'ch4_astrarium' }]),
  ]),

  // A23 — one line at each crystal (said when picked up; the third depends on the promise): A23_001..A23_004.
  ...S('A23', ($) => [$.L(1, 4)]),

  // A24 — Roxy takes the crystals. No explosion: thanks and trust; explosion: the stand, a choice, the repair
  // (stage 'repair'), then 'A24:join' (the plan of the ritual).
  ...S('A24', ($) => [
    $.L(1, 2),
    $.IF({ nv: 'ROXY_EXPLOSION' }, [
      $.L(3, 5),
      $.DO(TRUST(1)),
      $.L(18, 22),
      $.DO([{ take: [['resonance_crystal', 3]] }, { advance: 'roxy_trust' }]),
      $.END,
    ]),
    $.L(6, 8),
    $.CH('A24.1', [
      $.O(9, [$.L(10, 11), $.DO([{ setVar: ['ROXY_REPAIR', true] }, { setVar: ['ROXY_ACCOUNTABILITY', true] }, TRUST(1)])]),
      $.O(12, [$.L(13, 14), $.DO([{ setVar: ['ROXY_REPAIR', true] }, { setVar: ['ROXY_ACCOUNTABILITY', false] }])]),
      $.O(15, [$.L(16, 17), $.DO([{ setVar: ['ROXY_REPAIR', true] }, { setVar: ['ROXY_ACCOUNTABILITY', true] }, TRUST(1)])]),
    ]),
    $.DO([{ take: [['resonance_crystal', 3]] }, { advance: 'roxy_trust' }]),
    $.END,
    $.L(18, 22),
    $.DO({ advance: 'roxy_trust' }),
  ], { entries: { join: 18 } }),

  // A25 — the ritual: the start (A25), the lines in the fight (said by the game), the end (A25:after).
  ...S('A25', ($) => [
    $.L(1),
    $.CH('A25.1', [
      $.O(2, [$.L(3), $.DO({ advance: 'roxy_trust' }), $.END]),
      $.O(4, [$.L(5), $.END]),
    ]),
    $.L(11, 15),
    $.IF({ flag: 'ritual_sector_hit' }, [$.L(16)]),
    $.DO([{ heal: true }, { advance: 'roxy_trust' }]),
  ], { entries: { after: 11 } }),

  // A26 — Roxy joins; Water Volley on the old target.
  ...S('A26', ($) => [
    $.L(1, 7),
    $.CH('A26.1', [
      $.O(8, [$.L(9, 10), $.DO(TRUST(1))]),
      $.O(11, [$.L(12, 13)]),
      $.O(14, [$.L(15, 16), $.DO(TRUST(1))]),
    ]),
    $.L(17, 19),
    $.DO([{ unlockRoxy: true }, { advance: 'roxy_trust' }]),
    $.N('Рокси показывает Water Volley: пять водяных стрел летят за целью. Tab — сменить героиню.'),
    $.L(20, 21),
  ]),

  // A27 — the first camp together (the fire on the way back).
  ...S('A27', ($) => [
    $.L(1, 5),
    $.CH('A27.1', [
      $.O(6, [$.L(7, 8), $.DO(TRUST(1))]),
      $.O(9, [$.L(10, 12), $.DO(TRUST(1))]),
      $.O(13, [$.L(14, 15)]),
    ]),
    $.L(16),
    $.DO({ advance: 'ch4_return' }),
  ]),

  // A28 — Edmund's map: three lines meet under the temple.
  ...S('A28', ($) => [
    $.L(1, 6),
    $.CH('A28.1', [$.O(7, [$.L(8)]), $.O(9, [$.L(10, 11)]), $.O(12, [$.L(13, 15)])]),
    $.IF({ quest: 'c_watchtower', status: 'done' }, [$.LX('B07c', 4)]),
    $.L(16),
    $.DO([{ take: [['edmund_device', 1]] }, { advance: 'ch4_return' }]),
  ]),

  // A29 — Clara at the seal: the crypt stays closed. End of the first version.
  ...S('A29', ($) => [
    $.L(1, 6),
    $.CH('A29.1', [$.O(7, [$.L(8)]), $.O(9, [$.L(10, 11)]), $.O(12, [$.L(13, 14)])]),
    $.L(15),
    $.DO({ advance: 'ch4_return' }),
  ]),
};
