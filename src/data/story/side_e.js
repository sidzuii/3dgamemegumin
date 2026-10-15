import { S } from './dsl.js';

/**
 * Side stories of rank E (docs/story/04_side_stories.md): B07 the old tower, B08 moonflowers, B09 the ballad,
 * B11 Ivo, B12 Cyrus and the token. Quests: data/quests.js; B09's epilogue: story/triggers.js.
 */
export const SIDE_E = {
  // B07 — the watchtower: briefing (a), the logbook (b: Megumin alone at the top), report (c).
  ...S('B07a', ($) => [
    $.L(1, 3),
    $.CH('B07a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 'c_watchtower' }, { advance: 'c_watchtower' }]),
  ]),
  ...S('B07b', ($) => [
    $.L(1, 2),
    $.CH('B07b.1', [$.O(3, [$.L(4)]), $.O(5, [$.L(6)])]),
    $.DO({ setFlag: 'B07_LOG' }),
  ]),
  ...S('B07c', ($) => [
    $.L(1, 3),
    $.DO({ advance: 'c_watchtower' }),
  ]),

  // B08 — moonflowers for Wiss.
  ...S('B08a', ($) => [
    $.L(1, 3),
    $.CH('B08a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7), $.DO({ setFlag: 'B08_FOURTH' })])]),
    $.DO([{ startQuest: 'c_moonflowers' }, { advance: 'c_moonflowers' }]),
  ]),
  ...S('B08b', ($) => [
    $.L(1, 3),
    $.CH('B08b.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ take: [['moonflower', 3]] }, { advance: 'c_moonflowers' }]),
  ]),

  // B09 — the ballad: the request (a), the first verse (b). The children sing it at the square (triggers.js).
  ...S('B09a', ($) => [
    $.L(1, 3),
    $.CH('B09a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])]),
    $.DO([{ startQuest: 's_bard_song' }, { advance: 's_bard_song' }]),
  ]),
  ...S('B09b', ($) => [
    $.L(1, 7),
    $.CH('B09b.1', [$.O(8, [$.L(9)]), $.O(10, [$.L(11)]), $.O(12, [$.L(13)])]),
    $.DO([{ take: [['moonflower', 1]] }, { setFlag: 'ballad' }, { advance: 's_bard_song' }]),
  ]),

  // B11 — Ivo with the sprained ankle: the story of the coin loops back; potion -> b; no potion -> wait for help.
  ...S('B11a', ($) => [
    $.L(1, 3),
    $.MENU('B11a.1', [$.O(8, [$.L(9)])], [
      $.O(4, [$.L(5), $.DO([{ take: [['hp_potion', 1]] }, { setFlag: 'ivo_bandaged' }]), $.JUMP('B11b')], { if: { item: 'hp_potion' } }),
      $.O(6, [$.L(7), $.END], { if: { not: { item: 'hp_potion' } } }),
    ]),
  ]),
  ...S('B11b', ($) => [
    $.L(1, 3),
    $.CH('B11b.1', [
      $.O(4, [$.L(5), $.DO([{ eris: 40 }])]),
      $.O(6, [$.L(7)]),
    ]),
    $.DO([{ give: [['astra_token', 1]] }, { setFlag: 'traveler_helped' }, { setVar: ['IVO_HELP', true] }, { rel: ['ivo', 20] }, { xp: 30 }, { refreshNPCs: true }]),
  ]),

  // B12 — Cyrus and the token: the appraisal (a), the catalogue a visit later (b).
  ...S('B12a', ($) => [
    $.L(1, 3),
    $.MENU('B12a.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)])], $.O(8, [$.L(9), $.DO([{ setFlag: 'B12_ASKED' }, { setFlag: 'B12_WAIT' }])])),
  ]),
  ...S('B12b', ($) => [
    $.L(1, 3),
    $.CH('B12b.1', [
      $.O(4, [$.L(5), $.DO({ setFlag: 'STOREROOM_SIGN' })]),
      $.O(6, [$.L(7), $.DO([{ take: [['astra_token', 1]] }, { eris: 60 }, { setFlag: 'STOREROOM_SIGN' }])]),
    ]),
    $.DO({ setFlag: 'B12_DONE' }),
  ]),
};
