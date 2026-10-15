import { S } from './dsl.js';

/**
 * Chapter 5, "Под храмом" (docs/story/03_chapters_5-10.md): Clara after the rest (C00), Garret's plan (C01), the seal (C02), the
 * water chamber (C03: Roxy's volley opens the gallery gate, Megumin turns the winch), the third shard and Veyr's projection
 * (C04), the report in the guild (C05). The level: world/build/Crypt.js. Quest: data/quests.js `ch5_crypt`.
 */
const TRUST = (d) => ({ addVar: ['ROXY_TRUST', d, -3, 6] });

export const CH5 = {
  // C00 — Clara: the three preparations (any order).
  ...S('C00', ($) => [
    $.L(1, 6),
    $.CH('C00.1', [$.O(7, [$.L(8, 9)]), $.O(10, [$.L(11, 12)]), $.O(13, [$.L(14, 16)])]),
    $.DO({ advance: 'ch5_crypt' }),
  ]),

  // C01 — Garret checks the stairs and the pipe.
  ...S('C01', ($) => [
    $.L(1, 4),
    $.CH('C01.1', [$.O(5, [$.L(6, 8)]), $.O(9, [$.L(10, 11)]), $.O(12, [$.L(13, 15)])]),
    $.N('Мегумин подсвечивает шов, Рокси проверяет малый поток, Гаррет ставит балку.'),
    $.L(16),
    $.DO({ setFlag: 'C00_GARRET' }),
  ]),

  // C02 — Clara breaks the seal at the crypt door.
  ...S('C02', ($) => [
    $.L(1, 4),
    $.N('Клара снимает печать. Открывается лестница, за ней сухой зал.'),
    $.L(5),
    $.CH('C02.1', [$.O(6, [$.L(7)]), $.O(8, [$.L(9, 10)]), $.O(11, [$.L(12, 13)])]),
    $.DO([{ setFlag: 'crypt_open' }, { advance: 'ch5_crypt' }]),
  ]),

  // C03 — at the flooded passage (said by the place trigger): who does what. The last two lines: when the water has gone
  // (RPG, at the winch).
  ...S('C03', ($) => [
    $.L(1, 3),
    $.CH('C03.1', [
      $.O(4, [$.L(5, 6), $.DO(TRUST(1))]),
      $.O(7, [$.L(8, 9)]),
      $.O(10, [$.L(11, 12)]),
    ]),
    $.DO({ setFlag: 'C03_SEEN' }),
  ]),

  // C04 — the pedestal, the third shard, Veyr's projection.
  ...S('C04', ($) => [
    $.L(1, 7),
    $.CH('C04.1', [$.O(8, [$.L(901), $.L(10, 11)]), $.O(12, [$.L(13, 14)]), $.O(15, [$.L(16, 18)])]),
    $.L(19),
    $.N('Проекция гаснет. В боковом канале поднимается вода.'),
    $.L(20, 21),
    $.DO([{ setFlag: 'C04_DONE' }, { setFlag: 'crypt_projection' }]),
  ]),

  // C05 — the report in the guild: Luna, Roxy, Clara, Edmund.
  ...S('C05', ($) => [
    $.L(1, 5),
    $.CH('C05.1', [
      $.O(6, [$.L(7), $.DO({ setVar: ['PUBLIC_REPORT', true] })]),
      $.O(8, [$.L(9), $.DO({ setVar: ['PUBLIC_REPORT', false] })]),
      $.O(10, [$.L(11, 12), $.DO({ setVar: ['PUBLIC_REPORT', true] })]),
    ]),
    // v2.0: rank D for the confirmed crypt expedition, Edmund's request to Ilar, the sealed upper channel, the road to Olkhovka.
    $.L(901, 906),
    $.DO([{ promote: 'D' }, { setVar: ['AXEL_TRAVEL_STABLE', true] }, { advance: 'ch5_crypt' }]),
  ]),
};
