import { S } from './dsl.js';

/**
 * Chapter 6, "По другую сторону хребта" (docs/story/03_chapters_5-10.md): Tobias and the road (C06), the two workers behind the
 * grate (C07: three plans, three different tasks), the archive (C08: three documents, then the choice), the lens and Veyr's
 * second call (C09), Roxy and Severin's letter at the camp (C10). The level: world/build/Relay.js; props, volley targets and
 * waves: data/story/props.js; quest: data/quests.js `ch6_relay`.
 */
const TRUST = (d) => ({ addVar: ['ROXY_TRUST', d, -3, 6] });
const DOCS_READ = [{ flag: 'C08_DOC1' }, { flag: 'C08_DOC2' }, { flag: 'C08_DOC3' }];

export const CH6 = {
  // C06 — Tobias: the road and the workers.
  ...S('C06', ($) => [
    $.L(901),
    $.L(2, 5),
    $.CH('C06.1', [
      $.O(6, [$.L(7, 8)]),
      $.O(9, [$.L(10, 11)]),
      $.O(12, [
        $.IF({ quest: 'c_escort_tobias', status: 'done' }, [$.L(13)], [$.T('tobias', 'Да. Я умею вести обоз, а не драться с камнем.')]),
        $.L(14),
      ]),
    ]),
    $.L(15),
    $.DO({ advance: 'ch6_relay' }),
  ]),

  // C07 — the workers behind the grate: the plan decides the task (stages p_dan / p_osa / p_guard of the quest).
  ...S('C07', ($) => [
    $.L(1, 5),
    $.CH('C07.1', [
      $.O(6, [$.L(7, 8), $.DO({ setVar: ['C07_PLAN', 'dan'] })]),
      $.O(9, [$.L(10, 11), $.DO({ setVar: ['C07_PLAN', 'osa'] })]),
      $.O(12, [$.L(13, 14), $.DO([{ setVar: ['C07_PLAN', 'guard'] }, { wave: 'relay_watch' }])]),
    ]),
    $.DO({ advance: 'ch6_relay' }),
  ]),
  // ... and the pass, once both are out.
  ...S('C07b', ($) => [
    $.L(15, 16),
    $.DO([{ setFlag: 'relay_workers_out' }, { advance: 'ch6_relay' }]),
  ], { prefix: 'C07' }),

  // C08 — the archive: three documents (each read aloud on its own), then the choice what to do with them.
  ...S('C08a', ($) => [
    $.L(1, 4),
    $.IF(DOCS_READ, [$.JUMP('C08')]),
  ], { prefix: 'C08' }),
  ...S('C08b', ($) => [
    $.L(5),
    $.IF(DOCS_READ, [$.JUMP('C08')]),
  ], { prefix: 'C08' }),
  ...S('C08c', ($) => [
    $.L(6, 7),
    $.IF(DOCS_READ, [$.JUMP('C08')]),
  ], { prefix: 'C08' }),
  ...S('C08', ($) => [
    $.N('Три документа лежат рядом. Что с ними сделать?'),
    $.CH('C08.1', [
      $.O(8, [$.L(9), $.DO({ setVar: ['C08_CHOICE', 'copies'] })]),
      $.O(10, [$.L(11, 12), $.DO({ setVar: ['C08_CHOICE', 'council'] })]),
      $.O(13, [$.L(14, 15), $.DO([{ setVar: ['C08_CHOICE', 'orin'] }, TRUST(1)])]),
    ]),
    $.L(16),
    $.DO({ advance: 'ch6_relay' }),
  ]),

  // C09 — the lens is on, the panel is held: Veyr's second call.
  ...S('C09', ($) => [
    $.DO({ setFlag: 'relay_projection' }),
    $.N('Стражи упали. Над панелью вспыхивает проекция Вейра.'),
    $.L(1, 5),
    $.CH('C09.1', [
      $.O(6, [$.L(7)]),
      $.O(8, [$.L(9, 10)]),
      $.O(11, [$.L(12, 13)]),
    ]),
    $.L(14, 15),
    $.N('Связь прекращается. Линза показывает светящийся поток в ущелье и погасшие старые насосы.'),
    $.DO({ advance: 'ch6_relay' }),
  ]),

  // C10 — Roxy and Severin's letter at the camp.
  ...S('C10', ($) => [
    $.L(1, 5),
    $.CH('C10.1', [
      $.O(6, [$.L(7, 8), $.DO(TRUST(1))]),
      $.O(9, [$.L(10, 12)]),
      $.O(13, [$.L(14, 16)]),
    ]),
    $.L(17),
    $.DO({ advance: 'ch6_relay' }),
  ]),
};
