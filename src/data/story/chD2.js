import { S } from './dsl.js';

/**
 * Version 2.0, chapter 7 "Айнстрей: чужая накладная" (docs/ainstrey/06_Глава_Айнстрея.md, D14-D28): Oskar at the south gate, Selia in the
 * guild, Tavia's inn, Ilar and the archive, Mirena and the incomplete scheme, Nera's batch number, Varlen at the river store, the permit
 * to the lower pump, the gallery and the workers, the coupling (explosion on the white mark or the jack and the lever), the report,
 * Ilar's annex, the letter to Axel, the end of the chapter and the short talk at the garden.
 * Level: world/build/AinstreyPump.js and the key buildings of AinstreyBuildings.js; props, volley, blasts, waves: data/story/props.js;
 * quest: data/quests.js `ainstrey_city`. Lines are referenced by clip number only (ids are those of the package).
 */
export const CHD2 = {
  // D14 — Oskar at the south gate.
  ...S('D14', ($) => [
    $.L(1, 5),
    $.CH('D14.1', [$.O(6, [$.L(7, 8)]), $.O(9, [$.L(10, 12)]), $.O(13, [$.L(14)])]),
    $.L(15),
    $.DO([{ setVar: ['AINSTRAY_ENTERED', true] }, { setFlag: 'oskar_met' }, { advance: 'ainstrey_city' }]),
  ]),

  // D15 — Selia in the guild hall: the licence is recognised, the request to the archive, the address of the inn, two rests paid by the guild.
  ...S('D15', ($) => [
    $.L(1, 5),
    $.CH('D15.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9), $.DO({ setFlag: 'D15_part_sent' })]), $.O(10, [$.L(11)])]),
    $.L(12),
    $.DO([{ setVar: ['CAPITAL_GUILD_REGISTERED', true] }, { addVar: ['TAVIA_FREE_RESTS', 2, 0, 9] }, { setFlag: 'capital_board' }, { setFlag: 'D15_DONE' }, { notify: 'Гильдия Айнстрея признала ваши лицензии. Городская доска заказов открыта; два ночлега у Тавии оплачены гильдией.' }]),
  ]),

  // D16 — Tavia: the room in the yard; the evening ends with a night's rest (the first of the two paid ones).
  ...S('D16', ($) => [
    $.L(1, 5),
    $.CH('D16.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)]), $.O(10, [$.L(11)])]),
    $.L(12, 14),
    $.DO([{ setFlag: 'D16_DONE' }, { setFlag: 'tavia_night1' }, { addVar: ['TAVIA_FREE_RESTS', -1, 0, 9] }, { sleep: 7 }]),
  ]),

  // D17 — Ilar: the main inventory at once; the annex is with the port service.
  ...S('D17', ($) => [
    $.L(1, 5),
    $.IF({ v: 'PUBLIC_REPORT' }, [$.L(6)], [$.L(7)]),
    $.CH('D17.1', [$.O(8, [$.L(9)]), $.O(10, [$.L(11, 12)]), $.O(13, [$.L(14, 15)])]),
    $.L(16),
    $.DO([{ give: [['capital_index', 1]] }, { setFlag: 'D17_DONE' }]),
  ]),

  // D18 — Mirena: two gates for the manual separation, one crossed out in the working copy of the port.
  ...S('D18', ($) => [
    $.L(1, 5),
    $.CH('D18.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9)]), $.O(10, [$.L(11)])]),
    $.L(12, 13),
    $.DO([{ give: [['pump_scheme', 1]] }, { setFlag: 'D18_DONE' }]),
  ]),

  // D19 — Nera: the number of the batch is hers.
  ...S('D19', ($) => [
    $.L(1, 4),
    $.CH('D19.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.DO({ setFlag: 'D19_DONE' }),
  ]),

  // D20 — Varlen at the river store.
  ...S('D20', ($) => [
    $.L(1, 6),
    $.CH('D20.1', [$.O(7, [$.L(8)]), $.O(9, [$.L(10, 11)]), $.O(12, [$.L(13, 14)])]),
    $.L(15),
    $.DO({ setFlag: 'D20_DONE' }),
  ]),

  // D21 — the permit to the lower pump (the separate order is paid when the chapter ends).
  ...S('D21', ($) => [
    $.L(1, 6),
    $.CH('D21.1', [$.O(7, [$.L(8)]), $.O(9, [$.L(10)]), $.O(11, [$.L(12)])]),
    $.DO([{ setFlag: 'D21_DONE' }, { give: [['pump_permit', 1]] }]),
  ]),

  // D22 — the gallery and the workers: the guards wake on the way back; the player picks the way round (above) or the pit.
  ...S('D22', ($) => [
    $.L(1, 3),
    $.CH('D22.1', [
      $.O(4, [$.L(5), $.DO({ setVar: ['PORT_GUARDS', 'top'] })]),
      $.O(6, [$.L(7), $.DO({ setVar: ['PORT_GUARDS', 'pit'] })]),
    ]),
    $.DO({ advance: 'ainstrey_city' }),
  ]),
  ...S('D22b', ($) => [$.L(8, 9)], { prefix: 'D22' }),

  // D23 — the coupling: the choice of the method. The Explosion needs the ordinary 100 mana of Megumin; without it the choice goes back to the preparation.
  ...S('D23', ($) => [
    $.L(1, 2),
    $.CH('D23.1', [
      $.O(3, [
        $.IF({ mana: ['megumin', 100] }, [$.L(4, 5), $.DO([{ setVar: ['PORT_METHOD', 'explosion'] }, { advance: 'ainstrey_city' }])], [
          $.N('Мегумин не хватает маны на Взрыв: нужны обычные 100. Передохните у отключённой панели (она безопасна) и вернитесь к Мирене. Домкрат и рычаг остаются выбором без магического ресурса.'),
        ]),
      ]),
      $.O(6, [$.L(7, 8), $.DO([{ setVar: ['PORT_METHOD', 'mechanical'] }, { advance: 'ainstrey_city' }])]),
    ]),
  ]),
  // ... when the coupling is apart (the panel is free) and, after Roxy has tried the lower gate, the way back.
  ...S('D23b', ($) => [$.L(9)], { prefix: 'D23' }),
  ...S('D23c', ($) => [$.L(10, 12)], { prefix: 'D23' }),

  // D24 — Varlen and the way the findings are announced.
  ...S('D24', ($) => [
    $.L(1, 4),
    $.CH('D24.1', [
      $.O(5, [$.L(6), $.DO({ setVar: ['PORT_REPORT', 'public'] })]),
      $.O(7, [$.L(8), $.DO({ setVar: ['PORT_REPORT', 'workers_first'] })]),
      $.O(9, [$.L(10, 11), $.DO([{ setVar: ['PORT_REPORT', 'workers_first'] }, { setVar: ['VARLEN_COOPERATES', true] }])]),
    ]),
    $.L(12, 13),
    $.DO({ advance: 'ainstrey_city' }),
  ]),

  // D25 — Ilar returns the annex: the next way leads to the east post; the north intake is only an old inventory and a shut gate.
  ...S('D25', ($) => [
    $.L(1, 4),
    $.CH('D25.1', [$.O(5, [$.L(6), $.DO({ setFlag: 'D25_pref_post' })]), $.O(7, [$.L(8)]), $.O(9, [$.L(10)])]),
    $.L(11, 12),
    $.DO([{ setVar: ['CAPITAL_PLANS_RECEIVED', true] }, { give: [['pump_annex', 1], ['post_plan', 1]] }, { setVar: ['NEXT_NORTH_SURVEY', 'planned'] }, { setFlag: 'D25_DONE' }]),
  ]),

  // D26 — Lissa: the letter to Axel.
  ...S('D26', ($) => [
    $.L(1, 4),
    $.CH('D26.1', [$.O(5, [$.L(6)]), $.O(7, [$.L(8)]), $.O(9, [$.L(10), $.DO({ setFlag: 'lina_bread_note' })])]),
    $.L(11),
    $.DO({ setFlag: 'D26_DONE' }),
  ]),

  // D27 — Selia: the chapter is complete, the city stays (no credits, no end of the game).
  ...S('D27', ($) => [
    $.L(1, 5),
    $.IF({ var: ['PORT_REPORT', '==', 'public'] }, [$.L(6)], [$.L(7)]),
    $.CH('D27.1', [$.O(8, [$.L(9)]), $.O(10, [$.L(11), $.DO({ setFlag: 'D27_pref_post' })]), $.O(12, [$.L(13, 15)])]),
    $.DO([{ setVar: ['AINSTRAY_CHAPTER_COMPLETE', true] }, { advance: 'ainstrey_city' }]),
  ]),

  // D28 — optional: a short talk at the city garden after D27.
  ...S('D28', ($) => [
    $.L(1, 3),
    $.CH('D28.1', [$.O(4, [$.L(5)]), $.O(6, [$.L(7)]), $.O(8, [$.L(9, 10)])]),
    $.DO([{ setFlag: 'D28_DONE' }, { addVar: ['ROXY_TRUST', 1, -3, 6] }]),
  ]),
};
