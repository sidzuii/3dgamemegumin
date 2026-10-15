import { S } from './dsl.js';

/**
 * Chapters 0-1 of the scenario package (docs/story/02_chapters_0-4.md): the caravan, the south gate, the bread,
 * the licence, the test with Bran, the guild board. Scene ids = package ids (A00...). Quest ids: data/quests.js.
 */
export const CH0 = {
  // A00 — Marta at the caravan (starts the new game). Option 1 sends Megumin to carry two bags first.
  ...S('A00', ($) => [
    $.L(1, 5),
    $.CH('A00.1', [
      $.O(6, [$.L(7, 8), $.DO({ startQuest: 'a00_bags' }), $.END]),
      $.O(9, [$.L(10, 12)]),
      $.O(13, [$.L(14, 16), $.DO({ setVar: ['MARTA_FLOUR', true] })]),
    ]),
    $.L(17, 23),
    $.IF({ quest: 'a00_bags', status: 'active' }, [$.DO([{ setVar: ['MARTA_BAGS', true] }, { advance: 'a00_bags' }])]),
    $.DO([{ eris: 20 }, { advance: 'prologue_arrival' }]),
  ], { entries: { join: 17 } }),

  // A01 — Bernard at the south gate: three questions, in any order, then the way in.
  ...S('A01', ($) => [
    $.L(1, 7),
    $.MENU('A01.1', [
      $.O(8, [$.L(9, 10)]),
      $.O(11, [$.L(12, 14)]),
      $.O(15, [$.L(16, 18)]),
    ], $.X('Это всё, что я хотела узнать.', [$.IF({ not: { seen: 'A01_011' } }, [$.L(19)]), $.L(20, 21)])),
    $.DO({ advance: 'prologue_arrival' }),
  ]),

  // A02 — Lina and the bread for the smith. Option 3: come back later (A02b).
  ...S('A02', ($) => [
    $.L(1, 7),
    $.CH('A02.1', [
      $.O(8, [$.L(9, 10)]),
      $.O(11, [$.L(12, 13)]),
      $.O(14, [$.L(15), $.DO({ setFlag: 'A02_LATER' }), $.END]),
    ]),
    $.L(17, 18),
    $.DO([{ clearFlag: 'A02_LATER' }, { advance: 'prologue_arrival' }, { startQuest: 'first_delivery' }, { give: [['parcel_bread', 1]] }]),
  ]),
  ...S('A02b', ($) => [
    $.L(16),
    $.CH('A02.1', [
      $.O(8, [$.L(9, 10)]),
      $.O(11, [$.L(12, 13)]),
    ]),
    $.L(17, 18),
    $.DO([{ clearFlag: 'A02_LATER' }, { advance: 'prologue_arrival' }, { startQuest: 'first_delivery' }, { give: [['parcel_bread', 1]] }]),
  ], { prefix: 'A02' }),

  // A03 — Garret at the forge; 'back' = Lina pays.
  ...S('A03', ($) => [
    $.L(1, 7),
    $.CH('A03.1', [
      $.O(8, [$.L(9, 10)]),
      $.O(11, [$.L(12, 13)]),
      $.O(14, [$.L(15, 16)]),
    ]),
    $.DO([{ take: [['parcel_bread', 1]] }, { met: 'garret' }, { advance: 'first_delivery' }]),
    $.END,
    $.L(17, 23),
    $.DO({ advance: 'first_delivery' }),
  ], { entries: { back: 17 } }),

  // A04 — Luna: licence terms.
  ...S('A04', ($) => [
    $.L(1, 7),
    $.CH('A04.1', [
      $.O(8, [$.L(9)]),
      $.O(10, [$.L(11, 12)]),
      $.O(13, [$.L(14), $.IF({ quest: 'first_delivery', status: 'done' }, [$.L(15, 16)], [$.L(17, 18)])]),
    ]),
    $.L(19),
    $.DO({ advance: 'join_guild' }),
  ]),

  // A05 — Wiss sells the registration flask for 20 eris (kept behind the counter until Luna has seen it).
  ...S('A05', ($) => [
    $.IF({ eris: 20 }, [
      $.L(1, 5),
      $.CH('A05.1', [
        $.O(6, [$.L(7, 8)]),
        $.O(9, [$.L(10, 11)]),
        $.O(12, [$.L(13, 14)]),
      ]),
      $.L(15, 16),
      $.DO([{ eris: -20 }, { give: [['reg_flask', 1]] }]),
    ], [
      $.T('wiss', 'Двадцать эрис за флакон. Сейчас их у тебя нет. Спроси у Лины, не нужен ли ей посыльный, и возвращайся.'),
    ]),
  ]),

  // A06 — Luna issues rank F: the flask becomes an ordinary potion, the fee is paid once.
  ...S('A06', ($) => [
    $.IF({ eris: 30 }, [
      $.L(1, 5),
      $.CH('A06.1', [
        $.O(6, [$.L(7, 9)]),
        $.O(10, [$.L(11, 12)]),
        $.O(13, [$.L(14, 15)]),
      ]),
      $.L(16),
      $.DO([{ take: [['reg_flask', 1]] }, { eris: -30 }, { joinGuild: true }, { give: [['hp_potion', 1]] }, { advance: 'join_guild' }]),
    ], [
      $.T('luna', 'Взнос тридцать эрис, и вносится он на месте. Вернись, когда соберёшь.'),
    ]),
  ]),

  // A07 — Bran's test: three staff hits (A07), the signal (A07:signal), the report (A07:report).
  ...S('A07', ($) => [
    $.L(1, 5),
    $.DO({ advance: 'guild_test' }),
    $.END,
    $.L(7, 9),
    $.CH('A07.1', [
      $.O(10, [$.L(11)]),
      $.O(12, [$.L(13, 14)]),
      $.O(15, [$.L(16, 17)]),
    ]),
    $.DO({ advance: 'guild_test' }),
    $.END,
    $.L(19, 23),
    $.DO([{ heal: true }, { advance: 'guild_test' }]),
  ], { entries: { signal: 7, report: 19 } }),

  // A08 — Luna at the board: three different orders before rank E.
  ...S('A08', ($) => [
    $.L(1, 5),
    $.CH('A08.1', [
      $.O(6, [$.L(7, 9)]),
      $.O(10, [$.L(11, 12)]),
      $.O(13, [$.L(14, 15)]),
    ]),
    $.L(16),
    $.DO({ advance: 'ch1_name' }),
  ]),
};
