/**
 * Story props, volley targets and enemy waves of the chapters as DATA (rpg/RPG.js runs them generically).
 *
 * STORY_PROPS[id] — an interactable of the world (QuestProp) with:
 *   when    condition (rpg/State.js `check`) under which the prop is there at all (otherwise it is switched off)
 *   once    flag set on use; the prop is switched off afterwards
 *   char    'megumin' | 'roxy' — who must be playing (else `wrong`)
 *   need    condition that must hold (else `locked`)
 *   do      effects run on use;  scene: dialogue id started on use;  say: recorded clips played one after another
 *   toast   a game-glue line shown on use;  vfx: particle burst
 * STORY_VOLLEY — targets for Roxy's Water Volley: { id, spot, when, flag, do, toast }
 * STORY_WAVES — enemies spawned by the effect { wave: id }: { spot, camp, enemies: [[type, dx, dz]], onClear, say }
 */
const AT = (quest, ...stages) => (stages.length === 1 ? { quest, stage: stages[0] } : { any: stages.map((stage) => ({ quest, stage })) });
const PLAN = (v) => ({ var: ['C07_PLAN', '==', v] });

export const STORY_PROPS = {
  // ---- chapter 6: the relay post
  relay_gate: { when: { any: [{ quest: 'ch6_relay', status: 'done' }, [{ quest: 'ch6_relay', status: 'active' }, { not: { quest: 'ch6_relay', stage: 'tobias' } }]] } },
  relay_lift: { when: { flag: 'relay_projection' } },
  relay_rope_gate: {
    when: AT('ch6_relay', 'yard'), once: 'C06_ROPE',
    toast: 'Верёвка Дана и Осы: узлы свежие, она уходит вглубь поста. Они зашли этим ходом.',
  },
  relay_latch: { when: AT('ch6_relay', 'p_dan', 'p_osa', 'p_guard'), toast: 'Защёлка высоко над полом. Руками не достать: нужен водяной залп Рокси (Tab, затем Q).' },
  relay_rope_mid: {
    when: AT('ch6_relay', 'p_dan'), once: 'relay_rope_set', char: 'megumin',
    wrong: 'Канат натягивает Мегумин (Tab).', toast: 'Мегумин натягивает канат между опорой и решёткой.', vfx: 'magicPop',
  },
  relay_anchor_low: {
    when: AT('ch6_relay', 'p_osa'), once: 'relay_anchor_set',
    toast: 'Нижний крюк закреплён: страховка для Осы готова.', vfx: 'magicPop',
  },
  relay_doc_1: { when: AT('ch6_relay', 'archive'), once: 'C08_DOC1', scene: 'C08a' },
  relay_doc_2: { when: AT('ch6_relay', 'archive'), once: 'C08_DOC2', scene: 'C08b' },
  relay_doc_3: { when: AT('ch6_relay', 'archive'), once: 'C08_DOC3', scene: 'C08c' },
  relay_plate_a: { when: AT('ch6_relay', 'lens'), once: 'relay_plate_a', toast: 'Площадка согласована: знаки на плите загорелись.', vfx: 'magicPop' },
  relay_plate_b: { when: AT('ch6_relay', 'lens'), once: 'relay_plate_b', toast: 'Площадка согласована: знаки на плите загорелись.', vfx: 'magicPop' },
  relay_trough: { when: AT('ch6_relay', 'lens'), toast: 'Желоб забит осадком. Промыть его может только водяной залп Рокси (Tab, затем Q).' },
  relay_lens: {
    when: AT('ch6_relay', 'lens'), once: 'relay_lens_on', char: 'megumin',
    wrong: 'Рычаг тугой: его удерживает Мегумин (Tab), Рокси направляет воду.',
    need: [{ flag: 'relay_plate_a' }, { flag: 'relay_plate_b' }, { flag: 'relay_trough_clean' }],
    locked: 'Рычаг не сдвинуть: сначала согласуй обе площадки и промой водяной желоб.',
    do: [{ wave: 'relay_panel' }], toast: 'Линза набирает свет. Стражи постов просыпаются: защити панель!', vfx: 'magicPop',
  },
  relay_camp: { when: AT('ch6_relay', 'camp'), scene: 'C10' },
};

export const STORY_VOLLEY = [
  {
    id: 'relay_latch', spot: 'relay_latch', when: AT('ch6_relay', 'p_dan', 'p_osa', 'p_guard'), flag: 'relay_latch_hit',
    do: [{ setFlag: 'relay_grate_open' }], toast: 'Защёлка сбита: решётка служебной площадки поднялась.',
  },
  { id: 'relay_trough', spot: 'relay_trough', when: AT('ch6_relay', 'lens'), flag: 'relay_trough_clean', toast: 'Желоб промыт: вода пошла к линзе.' },
];

export const STORY_WAVES = {
  relay_watch: { spot: 'relay_watch', camp: 'relay_watch', enemies: [['watcher', 0, 0]], onClear: [{ setFlag: 'relay_watch_dead' }] },
  relay_panel: {
    spot: 'relay_panel', camp: 'relay_wave_c6', enemies: [['guardian', -6, 2], ['guardian', 6, 2], ['watcher', 0, -4]],
    onClear: [{ scene: 'C09' }],
  },
};
