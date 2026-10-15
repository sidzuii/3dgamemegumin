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
  // V05: a locked passage answers with a line of the package; V07: the gorge after the finale
  street_blocked: { when: [{ flag: 'shelter_block' }, { not: { quest: 'ch8_city', status: 'done' } }], say: ['V05_004'] },
  gorge_patrol_t: { when: [{ flag: 'game_complete' }, { var: ['KHARZ_ROUTE', '==', 'treaty'] }], say: ['V07_001', 'V07_002'] },
  gorge_patrol_b: { when: [{ flag: 'game_complete' }, { var: ['KHARZ_ROUTE', '==', 'battle'] }], say: ['V07_003', 'V07_004'] },
  drain_panel_after: { when: { flag: 'game_complete' }, say: ['V07_005'] },
  crypt_sealed: { when: { notFlag: 'crypt_open' }, say: ['V05_001'] },

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

  // ---- chapter 7: the convoy ledge (C12) and the drain under the gorge (C13-C14)
  ledge_cargo_a: { when: AT('ch7_gorge', 'p12_cargo'), once: 'ledge_cargo_a', toast: 'Мешок вынесен за каменный столб.', vfx: 'magicPop' },
  ledge_cargo_b: { when: AT('ch7_gorge', 'p12_cargo'), once: 'ledge_cargo_b', toast: 'Второй мешок за столбом. Без спора.', vfx: 'magicPop' },
  ledge_people: { when: AT('ch7_gorge', 'p12_roxy'), once: 'ledge_people_out', toast: 'Люди выведены из телеги на твёрдую землю.', vfx: 'magicPop' },
  ledge_rope: {
    when: AT('ch7_gorge', 'p12_cargo', 'p12_roxy'), once: 'ledge_rope_set', char: 'megumin',
    wrong: 'Канат держит Мегумин (Tab).', toast: 'Канат закреплён за столб: телега больше не поедет.', vfx: 'magicPop',
  },
  ledge_axle: { when: AT('ch7_gorge', 'p12_rope'), once: 'ledge_axle_set', toast: 'Канат привязан к оси переднего колеса.', vfx: 'magicPop' },
  ledge_crack: { when: AT('ch7_gorge', 'p12_roxy', 'p12_rope'), toast: 'Край уступа крошится. Укрепить его может водяной заслон Рокси (Tab, затем Q).' },
  drain_gate: {
    when: { any: [{ quest: 'ch7_gorge', status: 'done' }, [{ quest: 'ch7_gorge', status: 'active' }, { any: ['gorge', 'cool', 'kharz', 'explosion', 'guards', 'gauge', 'decide', 't_gauge', 't_guards', 't_release', 'b_shields', 'b_fight', 'outro'].map((stage) => ({ quest: 'ch7_gorge', stage })) }]] },
  },
  drain_valve_a: { when: AT('ch7_gorge', 'cool'), once: 'drain_valve_a', toast: 'Клапан повернут: вода пошла к площадке.', vfx: 'magicPop' },
  drain_valve_b: { when: AT('ch7_gorge', 'cool'), once: 'drain_valve_b', toast: 'Клапан повернут: вода пошла к площадке.', vfx: 'magicPop' },
  drain_cool_a: { when: AT('ch7_gorge', 'cool'), toast: 'Плита раскалена. Охладить её может водяной залп Рокси (Tab, затем Q).' },
  drain_cool_b: { when: AT('ch7_gorge', 'cool'), toast: 'Плита раскалена. Охладить её может водяной залп Рокси (Tab, затем Q).' },
  drain_panel: {
    when: { quest: 'ch7_gorge' },
    do: [{ read: { icon: '📜', title: 'Договор о приёме избыточного потока', text: 'Стороны: Элиас Вейр, руководитель установки, и Харз, приёмник.\n\n1. Приёмник принимает избыточный поток установки в пределах внешнего отвода.\n2. Установка обязана держать внешний отвод открытым.\n3. Приёмник не покидает круг без согласия установки.\n4. Нагрузка не превышает вдвое пробную.\n5. Подпись руководителя ставится до первого опыта.\n6. Если приёмник разрывает связь без внешнего отвода, установка сбрасывает поток в городской резерв.' } }],
  },
  drain_growth: { when: AT('ch7_gorge', 'explosion'), toast: 'Нарост не сдвинуть руками. Нужен направленный взрыв в пустую боковую стену рядом (Мегумин, Q).' },
  drain_gauge_1: { when: AT('ch7_gorge', 'gauge'), once: 'drain_gauge_1', toast: 'Показания сняты: малый поток идёт ровно.', vfx: 'magicPop' },
  drain_gauge_2: { when: AT('ch7_gorge', 'gauge'), once: 'drain_gauge_2', toast: 'Показания сняты: малый поток идёт ровно.', vfx: 'magicPop' },
  drain_gauge_3: { when: AT('ch7_gorge', 'gauge'), once: 'drain_gauge_3', toast: 'Показания сняты: малый поток идёт ровно.', vfx: 'magicPop' },
  treaty_gauge: { when: AT('ch7_gorge', 't_gauge'), once: 'treaty_gauge', toast: 'Замер рядом с Харзом снят: он ждёт у линии и не двигается.', vfx: 'magicPop' },
  drain_valve_r: {
    when: AT('ch7_gorge', 't_release'), once: 'release_roxy', char: 'roxy',
    wrong: 'Клапан привязки поворачивает Рокси (Tab).', toast: 'Клапан открыт: привязка Харза держится только на рычаге.', vfx: 'magicPop',
  },
  drain_lever_m: {
    when: AT('ch7_gorge', 't_release'), once: 'release_megumin', char: 'megumin',
    wrong: 'Рычаг привязки тянет Мегумин (Tab).', need: { flag: 'release_roxy' }, locked: 'Рычаг не поддаётся, пока Рокси не открыла клапан привязки.',
    do: [{ setFlag: 'drain_released' }], scene: 'C14t', vfx: 'magicPop',
  },
  kharz_shield_a: { when: AT('ch7_gorge', 'b_shields'), toast: 'Щит держит жар. Разбить его может водяной залп Рокси (Tab, затем Q).' },
  kharz_shield_b: { when: AT('ch7_gorge', 'b_shields'), toast: 'Щит держит жар. Разбить его может водяной залп Рокси (Tab, затем Q).' },
  // ---- chapter 8: the shelter in front of the town hall, the pump station, the deep shaft
  pump_gate: {
    when: { any: [{ quest: 'ch8_city', status: 'done' }, [{ quest: 'ch8_city', status: 'active' }, { any: ['route_res', 'route_rep', 'pump_talk', 'pump_key', 'p17_shield', 'p17_hold', 'p17_flow', 'pump_out', 'veyr', 'deep', 'p19_lever', 'p19_latch', 'p19_breaker', 'deep_out', 'link', 'link_check'].map((stage) => ({ quest: 'ch8_city', stage })) }]] },
  },
  shelter_cart: { when: AT('ch8_city', 'shelter'), once: 'shelter_cart', toast: 'Тележка выкачена на ровное место: проход к убежищу свободен.', vfx: 'magicPop' },
  street_block: { when: AT('ch8_city', 'shelter'), once: 'shelter_block', toast: 'Опасный проход перекрыт заграждением: Бернард его удержит.', vfx: 'magicPop' },
  tunnel_lamp_a: { when: AT('ch8_city', 'route_res'), once: 'tunnel_lamp_a', toast: 'Лампа повешена. Жители помогают переносить свет по тоннелю.', vfx: 'magicPop' },
  tunnel_lamp_b: { when: AT('ch8_city', 'route_res'), once: 'tunnel_lamp_b', toast: 'Вторая лампа повешена: обход через боковой тоннель освещён.', vfx: 'magicPop' },
  gallery_tool: { when: AT('ch8_city', 'route_rep'), once: 'gallery_tool', do: [{ give: [['valve_key', 1]] }], toast: 'Ключ насоса снят со стойки рабочей галереи.' },
  gallery_valve: { when: AT('ch8_city', 'route_rep'), once: 'gallery_valve', toast: 'Вентиль галереи повернут: напор в трубе насосной ровнее.', vfx: 'magicPop' },
  pump_key: {
    when: AT('ch8_city', 'pump_key'), once: 'pump_turn1', char: 'megumin',
    wrong: 'Ключ берёт Мегумин (Tab).', toast: 'Рукоять провернулась, но на соседнем шве выступила течь!', scene: 'C17b',
  },
  pump_hole: { when: AT('ch8_city', 'p17_shield'), once: 'pump_shield', char: 'megumin', wrong: 'Щит ставит Мегумин (Tab).', toast: 'Ремонтный щит у отверстия поставлен.', vfx: 'magicPop' },
  pump_adjust: {
    when: AT('ch8_city', 'p17_shield'), once: 'pump_adjusted', char: 'roxy', wrong: 'Шов регулирует Рокси (Tab).',
    need: { flag: 'pump_shield' }, locked: 'Сначала ремонтный щит у отверстия (Мегумин).', toast: 'Рокси отрегулировала шов: течь прекратилась.', vfx: 'magicPop',
  },
  pump_valve: { when: AT('ch8_city', 'p17_flow'), once: 'pump_valve_a', toast: 'Нижний вентиль закрыт на четверть.', vfx: 'magicPop' },
  pump_valve_b: { when: AT('ch8_city', 'p17_flow'), once: 'pump_valve_b', toast: 'Вентиль подачи закрыт на четверть: поток держится.', vfx: 'magicPop' },
  service_panel: { when: AT('ch8_city', 'veyr'), once: 'service_on', scene: 'C18', vfx: 'magicPop' },
  deep_latch: { when: AT('ch8_city', 'p19_lever', 'p19_latch'), toast: 'Защёлка высоко над полом. Руками не достать: нужен водяной залп Рокси (Tab, затем Q).' },
  deep_lever: {
    when: AT('ch8_city', 'p19_lever'), once: 'deep_lever_held', char: 'megumin', wrong: 'Рычаг держит Мегумин (Tab).',
    toast: 'Мегумин удерживает рычаг: решётка стоит, пока он под рукой.', vfx: 'magicPop',
  },
  deep_osa_help: { when: AT('ch8_city', 'p19_latch'), once: 'deep_osa_helped', toast: 'Мегумин подаёт руку Осе: та ждёт сигнала Рокси.', vfx: 'magicPop' },
  deep_breaker: {
    when: AT('ch8_city', 'p19_breaker'), once: 'deep_breaker_off', toast: 'Рубильник выключен: панель погасла, решётка у нижнего шва ушла вверх.', do: [{ setFlag: 'deep_grate_open' }], vfx: 'magicPop',
  },
  deep_tag: { when: { quest: 'ch8_city' }, toast: 'Бирка на стене: «Малый расход. Для капсулы. Не превышать». Рядом отметки мелом: Дан и Оса.' },
  link_socket: {
    when: AT('ch8_city', 'link'), once: 'link_socket', need: { item: 'link_module' }, locked: 'Нужен модуль связи Эдмунда (его отдал Гаррет).',
    do: [{ take: [['link_module', 1]] }], toast: 'Модуль встал в гнездо: лампа загорелась жёлтым.', vfx: 'magicPop',
  },
  link_power: { when: AT('ch8_city', 'link'), once: 'link_power', need: { flag: 'link_socket' }, locked: 'Сначала установи модуль связи в гнездо.', toast: 'Питание подано: лампа модуля стала голубой.', vfx: 'magicPop' },
  link_check: { when: AT('ch8_city', 'link_check'), scene: 'C20', vfx: 'magicPop' },
  // ---- chapter 9: the central hall
  veyr_panel: { when: AT('ch9_capsule', 'veyr'), once: 'C21_seen', scene: 'C21' },
  core_scale: { when: { quest: 'ch9_capsule' }, toast: 'Шкала лет: тридцать насечек, последние стёрты чаще остальных: по ним считали дни.' },
  core_log: {
    when: { quest: 'ch9_capsule' },
    do: [{ read: { icon: '📖', title: 'Журнал смен', text: 'Смена за сменой, почерк один и тот же.\n\n«День 1. Поток принят. Нижний отсек не отвечает.»\n«День 2. Я остался один. Подпись под протоколом моя.»\n…\n«Год 12. Слышу службу в храме через вентиляцию. Хор поёт ровно.»\n«Год 23. Со стены пришло изображение: дети у фонтана.»\n«Год 30. Подняли первый регулятор из дерева. Отклик есть.»' } }],
  },
  core_names: {
    when: { quest: 'ch9_capsule' },
    do: [{ read: { icon: '🪦', title: 'Плита с именами', text: 'Орин Селл — нижний отсек.\nМайя Торн — нижний отсек.\nДес Валь — нижний отсек.\n\nИ ещё семь имён сотрудников. Под плитой выбито: «Приказ отдан до их выхода».' } }],
  },
  core_link: { when: AT('ch9_capsule', 'rules'), once: 'C22_seen', scene: 'C22' },
  core_switch: { when: AT('ch9_capsule', 'mark'), once: 'core_switch', toast: 'Ручной выключатель осмотрен и отмечен.', vfx: 'magicPop' },
  core_cable: { when: AT('ch9_capsule', 'mark'), once: 'core_cable_marked', toast: 'Нижний кабель на левой стойке отмечен: его размыкание отключит удалённое управление.', vfx: 'magicPop' },
  core_amp: { when: AT('ch9_capsule', 'mark'), once: 'core_amp', toast: 'Усилитель старого канала осмотрен: он перекрывается при малой пробе.', vfx: 'magicPop' },
  holder_1: { when: AT('ch9_capsule', 'holders'), once: 'holder_1', need: { item: 'star_shard', n: 3 }, locked: 'Нужны все три регулятора: они в футлярах отряда.', toast: 'Регулятор встал в держатель. Права отряда на предмет сохранены.', vfx: 'magicPop' },
  holder_2: { when: AT('ch9_capsule', 'holders'), once: 'holder_2', need: { item: 'star_shard', n: 3 }, locked: 'Нужны все три регулятора: они в футлярах отряда.', toast: 'Второй регулятор встал в держатель.', vfx: 'magicPop' },
  holder_3: { when: AT('ch9_capsule', 'holders'), once: 'holder_3', need: { item: 'star_shard', n: 3 }, locked: 'Нужны все три регулятора: они в футлярах отряда.', toast: 'Третий регулятор встал в держатель. Малая подача вращает насос.', vfx: 'magicPop' },
  core_gauge_1: { when: AT('ch9_capsule', 'probe'), once: 'core_gauge_1', toast: 'Левый мерный столб: нагрузка в норме.', vfx: 'magicPop' },
  core_gauge_2: { when: AT('ch9_capsule', 'probe'), once: 'core_gauge_2', toast: 'Правый мерный столб: нагрузка в норме.', vfx: 'magicPop' },
  core_seam_a: { when: AT('ch9_capsule', 'breach'), toast: 'Шов греется! Охладить его может водяной залп Рокси (Tab, затем Q).' },
  core_seam_b: { when: AT('ch9_capsule', 'breach'), toast: 'Шов греется! Охладить его может водяной залп Рокси (Tab, затем Q).' },
  core_cable_cut: {
    when: AT('ch9_capsule', 'breach'), once: 'core_cable_cut', char: 'megumin', wrong: 'Кабель размыкает Мегумин посохом (Tab).',
    need: [{ flag: 'core_seam_a' }, { flag: 'core_seam_b' }, { flag: 'wd_amp_guards' }], locked: 'К стойке не пройти: отбей стражей усилителя и охлади оба верхних шва (Рокси).',
    scene: 'C23b', vfx: 'magicPop',
  },
  post_l: { when: AT('ch9_capsule', 'battle2'), once: 'post_l_off', toast: 'Питание левого поста снято.', vfx: 'magicPop' },
  post_r: { when: AT('ch9_capsule', 'battle2'), once: 'post_r_off', toast: 'Питание правого поста снято.', vfx: 'magicPop' },
  core_valve: { when: AT('ch9_capsule', 'valve'), once: 'core_valve', toast: 'Клапан под лестницей открыт: нижняя труба на малом расходе.', vfx: 'magicPop' },
  capsule_pressure: { when: AT('ch9_capsule', 'capsule'), once: 'capsule_pressure', toast: 'Давление в капсуле сброшено.', vfx: 'magicPop' },
  capsule_lock: {
    when: AT('ch9_capsule', 'capsule'), need: { flag: 'capsule_pressure' }, locked: 'Нижняя ручка стоит: сначала сбрось давление клапаном справа.',
    once: 'capsule_lock', scene: 'C25', vfx: 'magicPop',
  },
  core_terminal: { when: AT('ch9_capsule', 'decision'), scene: 'C26' },
  // ---- chapter 10: the final operation, the epilogue, the north signpost
  core_link2: { when: AT('ch10_finale', 'prep'), scene: 'C27' },
  inflow_a: { when: AT('ch10_finale', 'c_inflow'), once: 'inflow_a', char: 'roxy', wrong: 'Притоки закрывает Рокси (Tab).', toast: 'Внешний приток закрыт: вода держится в желобе.', vfx: 'magicPop' },
  inflow_b: { when: AT('ch10_finale', 'c_inflow'), once: 'inflow_b', char: 'roxy', wrong: 'Притоки закрывает Рокси (Tab).', toast: 'Второй внешний приток закрыт.', vfx: 'magicPop' },
  limiter_panel: { when: AT('ch10_finale', 'r_limiter'), once: 'limiter_set', char: 'megumin', wrong: 'Ограничитель ставит Мегумин (Tab).', toast: 'Ограничитель Эдмунда встал в боковую панель: малая линия держит значение.', vfx: 'magicPop' },
  bypass_valve: { when: AT('ch10_finale', 'r_bypass'), once: 'bypass_set', char: 'roxy', wrong: 'Обводной вентиль открывает Рокси (Tab).', toast: 'Вода направлена в обход усилителя: за аркой только проверочный насос.', vfx: 'magicPop' },
  fpost_l: { when: AT('ch10_finale', 'f_wave'), once: 'fpost_l_off', toast: 'Питание левого поста снято: щит стража слабеет.', vfx: 'magicPop' },
  fpost_r: { when: AT('ch10_finale', 'f_wave'), once: 'fpost_r_off', toast: 'Питание правого поста снято: щит стража слабеет.', vfx: 'magicPop' },
  core_ready_c: { when: [AT('ch10_finale', 'f_ready'), { var: ['ENDING', '==', 'closure'] }], scene: 'C28a' },
  core_ready_r: { when: [AT('ch10_finale', 'f_ready'), { var: ['ENDING', '==', 'rebuild'] }], scene: 'C29a' },
  exit_shield: { when: AT('ch10_finale', 'f_exit'), once: 'exit_shield', char: 'roxy', wrong: 'Заслон ставит Рокси (Tab).', toast: 'Рокси держит водяной заслон: подъёмник свободен.', vfx: 'magicPop' },
  exit_lift: { when: AT('ch10_finale', 'f_exit'), need: { flag: 'exit_shield' }, locked: 'Подъёмник закрыт: Рокси должна поставить водяной заслон (Tab).', once: 'exit_lift', do: [{ travel: 'pump_gate_out' }] },
  north_sign: { when: AT('ch10_finale', 'finale'), scene: 'C33' },
  // ---- side stories (docs/story/04): B10, B13, B14-B23
  field_cart_a: { when: AT('c_night_raid', 'prep_carts'), once: 'field_cart_a', toast: 'Телега подкачена к проходу: грибы пойдут через сухой участок.', vfx: 'magicPop' },
  field_cart_b: { when: AT('c_night_raid', 'prep_carts'), once: 'field_cart_b', toast: 'Вторая телега встала рядом: проход перекрыт, остался сухой путь.', vfx: 'magicPop' },
  field_lantern: { when: AT('c_night_raid', 'prep_lantern'), once: 'field_lantern', toast: 'Фонарь повешен у камня: грибы выйдут на пустой участок.', vfx: 'magicPop' },
  cache_bridge_lever: {
    when: AT('c_cache_bridge', 'find'), once: 'cache_bridge_lever', toast: 'Платформа встала под нишу: ящик выше воды.', vfx: 'magicPop',
    do: [{ read: { icon: '📜', title: 'Записка владельца', text: 'Если вода поднялась, не прыгай к ящику. Крути платформу с берега.' } }],
  },
  cache_oak_clear: { when: AT('c_cache_oak', 'find'), once: 'cache_oak_cleared', toast: 'Подход расчищен руками: корень раскрывается с северной стороны.', vfx: 'magicPop' },
  cache_oak_latch: { when: AT('c_cache_oak', 'find'), need: { flag: 'cache_oak_cleared' }, locked: 'Подход зарос: сначала расчисти его руками.', once: 'cache_oak_open', toast: 'Защёлка найдена, крышка поднялась: внутри карта безопасного спуска.', vfx: 'magicPop' },
  cache_pond_block: { when: AT('c_cache_pond', 'find'), once: 'cache_pond_done', toast: 'Верёвка через береговой блок: бочка пошла к берегу.', vfx: 'magicPop' },
  cache_tar_part_a: { when: AT('c_cache_tar', 'find'), once: 'cache_tar_part_a', toast: 'Первая часть рукояти найдена среди печей.', vfx: 'magicPop' },
  cache_tar_part_b: { when: AT('c_cache_tar', 'find'), once: 'cache_tar_part_b', toast: 'Вторая часть рукояти найдена.', vfx: 'magicPop' },
  cache_tar_lid: {
    when: AT('c_cache_tar', 'find'), need: [{ flag: 'cache_tar_part_a' }, { flag: 'cache_tar_part_b' }], locked: 'Рукоять не собрана: найди обе части у печей.', once: 'cache_tar_open',
    toast: 'Рукоять встала, крышка поднялась: инструменты смолокуров сухие.', vfx: 'magicPop',
    do: [{ read: { icon: '📜', title: 'Смена печей', text: 'Первая печь — утро. Вторая — полдень. Третья — вечер.\n\nКто работает ночью, тот не спит. Под крышкой — инструменты: не оставляй их под дождём.' } }],
  },
  spring_gate: { when: AT('s_roxy_water', 'p_gate', 'p_blast'), once: 'spring_gate', char: 'megumin', wrong: 'Затвор перекрывает Мегумин (Tab).', toast: 'Верхний затвор перекрыт: напор на источнике упал.', vfx: 'magicPop' },
  spring_valve: { when: AT('s_roxy_water', 'p_wash'), once: 'spring_valve', toast: 'Дальний желоб закрыт руками.', vfx: 'magicPop' },
  spring_seam_prop: { when: AT('s_roxy_water', 'p_gate'), toast: 'Дальний шов течёт. Закрыть его может водяной залп Рокси (Tab, затем Q).' },
  spring_flume_prop: { when: AT('s_roxy_water', 'p_wash'), toast: 'Желоб забит солью. Смыть её малым потоком может Рокси (Tab, затем Q).' },
  spring_sample: {
    when: AT('s_roxy_water', 'p_gate', 'p_wash', 'p_blast'), once: 'spring_sample', char: 'roxy', wrong: 'Пробу берёт Рокси (Tab).',
    need: { any: [[{ flag: 'spring_gate' }, { flag: 'spring_seam' }], [{ flag: 'spring_wash' }, { flag: 'spring_valve' }], [{ flag: 'spring_gate' }, { flag: 'spring_blast' }]] },
    locked: 'Напор ещё высокий: сначала сделай то, о чём договорились у шкалы.', scene: 'B14d', vfx: 'magicPop',
  },
  bridge_clip: { when: AT('s_marta_bridge', 'p_clip', 'p_edge'), once: 'bridge_clip', toast: 'Скоба поставлена: настил больше не звенит.', vfx: 'magicPop' },
  bridge_branch: { when: AT('s_marta_bridge', 'p_clip', 'p_edge'), once: 'bridge_branch', toast: 'Упавшая ветка убрана с подхода руками.', vfx: 'magicPop' },
  bridge_board_prop: { when: AT('s_marta_bridge', 'p_edge'), toast: 'Нижнюю доску придержит поток Рокси (Tab, затем Q).' },
  bridge_cart: { when: AT('s_marta_bridge', 'p_clip', 'p_edge'), need: [{ flag: 'bridge_clip' }, { flag: 'bridge_branch' }], locked: 'Сначала скоба и ветка на подходе.', once: 'bridge_cart', toast: 'Марта сама ведёт лошадь; Рокси проверяет опоры под нагрузкой. Прошла!', vfx: 'magicPop' },
  shift_tag: { when: AT('s_garret_tag', 'room'), once: 'shift_tag', toast: 'Бирка номер семь: смена учеников.', vfx: 'magicPop' },
  shift_log: { when: AT('s_garret_tag', 'room'), need: { flag: 'shift_tag' }, locked: 'Сначала найди бирку смены (комната отдыха).', once: 'shift_log', scene: 'B16b', vfx: 'magicPop' },
  exit_grate: { when: AT('s_garret_tag', 'exit'), once: 'exit_grate', toast: 'Ручная решётка открыта. Дальше низкая галерея залита.', vfx: 'magicPop' },
  exit_flood_prop: { when: AT('s_garret_tag', 'exit'), toast: 'Низкая галерея залита. Слить воду может залп Рокси (Tab, затем Q).' },
  exit_stamp: {
    when: AT('s_garret_tag', 'exit'), once: 'exit_stamp', need: [{ flag: 'exit_grate' }, { flag: 'exit_flooded_drained' }], locked: 'До стены не добраться: открой решётку и слей воду.',
    say: ['B16b_009'], toast: 'Штамп на стене: «Восемь вышедших. Смена семь».', vfx: 'magicPop',
  },
  temple_list: { when: AT('s_fenrik_names', 'temple'), once: 'temple_list', toast: 'Имя Орина Селла в храмовом списке: написано полностью, без сокращений.', vfx: 'magicPop' },
  measure_a: { when: AT('s_boris_gate', 'measure'), once: 'measure_a', toast: 'Нижний рукав замерен: напор выше обычного.', vfx: 'magicPop' },
  measure_b: { when: AT('s_boris_gate', 'measure'), once: 'measure_b', toast: 'Верхний рукав замерен: русло заросло, вода почти не идёт.', vfx: 'magicPop' },
  upper_gate_wheel: {
    when: AT('s_boris_gate', 'p_far', 'p_wash'), once: 'upper_gate_open',
    need: { any: [{ var: ['B18_PLAN', '==', 'far'] }, [{ flag: 'drain_washed' }, { flag: 'extra_valve' }]] }, locked: 'Сначала промой пустой отвод и поставь клапан на обход.',
    toast: 'Верхний затвор открыт: вода пошла в оба рукава.', vfx: 'magicPop',
  },
  lower_flow_prop: { when: AT('s_boris_gate', 'p_far'), toast: 'Нижний рукав слишком напорный. Снизить напор может залп Рокси (Tab, затем Q).' },
  wash_drain_prop: { when: AT('s_boris_gate', 'p_wash'), toast: 'Пустой отвод забит грязью. Промыть его может залп Рокси (Tab, затем Q).' },
  extra_valve: { when: AT('s_boris_gate', 'p_wash'), need: { flag: 'drain_washed' }, locked: 'Сначала промой отвод.', once: 'extra_valve', toast: 'Клапан на обход поставлен.', vfx: 'magicPop' },
  gate_wheel: { when: AT('s_boris_gate', 'manual'), once: 'gate_wheel', toast: 'Положение ручного колеса отмечено: четверть оборота.', vfx: 'magicPop' },
  nest_a: { when: AT('s_rann_nests', 'nests'), once: 'nest_a', toast: 'Гнёзда пусты: перья давно не трогали.', vfx: 'magicPop' },
  nest_b: { when: AT('s_rann_nests', 'nests'), once: 'nest_b', toast: 'Второй участок пуст. Тон здесь слышен сильнее.', vfx: 'magicPop' },
  quiet_check: { when: AT('s_rann_nests', 'nests'), once: 'quiet_check', toast: 'Тихий участок: птицы поют, гула нет. Разница ясна.', vfx: 'magicPop' },
  pipe_net: { when: AT('s_rann_nests', 'p_net', 'p_lure', 'p_rope'), once: 'pipe_net', toast: 'Сетка встала на трубу.', vfx: 'magicPop' },
  pipe_valve_prop: { when: AT('s_rann_nests', 'p_net', 'p_lure', 'p_rope'), toast: 'Заслонка открыта до конца. Закрыть её до малого расхода может залп Рокси (Tab, затем Q).' },
  pipe_ring_prop: { when: AT('s_rann_nests', 'p_rope'), toast: 'Кольцо над оврагом: канат закрепит водяная стрела Рокси (Tab, затем Q).' },
  rann_box: { when: [{ v: 'RANN_NESTS' }, { flag: 'rann_slept' }], toast: 'Записка Ранна: «Два гнезда заняли снова. Остальные пока пусты».' },
  edm_m1: { when: AT('s_edmund_team', 'measure'), once: 'edm_m1', scene: 'B20b', vfx: 'magicPop' },
  edm_m2: { when: AT('s_edmund_team', 'measure'), need: { flag: 'edm_m1' }, locked: 'Сначала первое сравнение у склона.', once: 'edm_m2', toast: 'Второе сравнение: Тера и Эдмунд меняются приборами. Тринадцать.', vfx: 'magicPop' },
  edm_m3: { when: AT('s_edmund_team', 'measure'), need: { flag: 'edm_m2' }, locked: 'Сначала второе сравнение.', once: 'edm_m3', toast: 'Третье сравнение у вентиляционного канала: помехи заметны, но шкала держится.', vfx: 'magicPop' },
  water_ledger: { when: AT('s_clara_book', 'ledger'), once: 'water_ledger', scene: 'B21b', vfx: 'magicPop' },
  council_protocol: { when: AT('s_clara_book', 'compare'), once: 'council_protocol', toast: 'Ведомость сходится с протоколом совета: выбор у них был, дорогой и медленный.', vfx: 'magicPop' },
  road_debris: { when: AT('s_tobias_road', 'tasks'), once: 'road_debris', toast: 'Обломок телеги убран с дороги.', vfx: 'magicPop' },
  road_sign: { when: AT('s_tobias_road', 'tasks'), once: 'road_sign', toast: 'Указатель восстановлен: «Ольховка. Проезд свободен».', vfx: 'magicPop' },
  post_panel: { when: AT('s_tobias_road', 'tasks'), once: 'post_panel', toast: 'Панель холодная, кабель снят: страж больше не получит питание.', vfx: 'magicPop' },
  shelter_food: { when: AT('s_lina_day', 'w_bread'), once: 'shelter_food', toast: 'Обед роздан: детям маленькие тарелки, взрослым большие.', vfx: 'magicPop' },
  shelter_lamps: { when: AT('s_lina_day', 'w_lamps'), once: 'shelter_lamps', toast: 'Лампы стоят у дальней стены: свечи в стекле.', vfx: 'magicPop' },
  lost_bag: { when: AT('s_lina_day', 'bag'), toast: 'Под столом сумка: внутри бумага с рисунком колеса. Позови Мию.' },
};

export const STORY_VOLLEY = [
  {
    id: 'relay_latch', spot: 'relay_latch', when: AT('ch6_relay', 'p_dan', 'p_osa', 'p_guard'), flag: 'relay_latch_hit',
    do: [{ setFlag: 'relay_grate_open' }], toast: 'Защёлка сбита: решётка служебной площадки поднялась.',
  },
  { id: 'relay_trough', spot: 'relay_trough', when: AT('ch6_relay', 'lens'), flag: 'relay_trough_clean', toast: 'Желоб промыт: вода пошла к линзе.' },
  { id: 'ledge_crack', spot: 'ledge_crack', when: AT('ch7_gorge', 'p12_roxy', 'p12_rope'), flag: 'ledge_crack_fixed', toast: 'Водяной заслон схватил край уступа: он держит.' },
  { id: 'drain_cool_a', spot: 'drain_cool_a', when: AT('ch7_gorge', 'cool'), flag: 'drain_cool_a', toast: 'Плита остыла.' },
  { id: 'drain_cool_b', spot: 'drain_cool_b', when: AT('ch7_gorge', 'cool'), flag: 'drain_cool_b', toast: 'Плита остыла.' },
  { id: 'kharz_shield_a', spot: 'kharz_shield_a', when: AT('ch7_gorge', 'b_shields'), flag: 'kharz_shield_a', toast: 'Внешний щит разбит.' },
  { id: 'kharz_shield_b', spot: 'kharz_shield_b', when: AT('ch7_gorge', 'b_shields'), flag: 'kharz_shield_b', toast: 'Внешний щит разбит.' },
  { id: 'deep_latch', spot: 'deep_latch', when: AT('ch8_city', 'p19_lever', 'p19_latch'), flag: 'deep_latch_hit', do: [{ setFlag: 'deep_grate_open' }], toast: 'Защёлка сбита: решётка у нижнего шва поднялась.' },
  { id: 'core_seam_a', spot: 'core_seam_a', when: AT('ch9_capsule', 'breach'), flag: 'core_seam_a', toast: 'Левый шов охлаждён.' },
  { id: 'core_seam_b', spot: 'core_seam_b', when: AT('ch9_capsule', 'breach'), flag: 'core_seam_b', toast: 'Правый шов охлаждён.' },
  { id: 'cache_pond_barrel', spot: 'cache_pond_barrel', when: AT('c_cache_pond', 'find'), flag: 'cache_pond_done', toast: 'Водяной залп подхватил бочку: она пошла к берегу.' },
  { id: 'spring_seam', spot: 'spring_seam', when: AT('s_roxy_water', 'p_gate'), flag: 'spring_seam', toast: 'Дальний шов закрыт.' },
  { id: 'spring_flume', spot: 'spring_flume', when: AT('s_roxy_water', 'p_wash'), flag: 'spring_wash', toast: 'Малый поток смыл соль из желоба.' },
  { id: 'bridge_board', spot: 'bridge_board', when: AT('s_marta_bridge', 'p_edge'), flag: 'bridge_board', toast: 'Поток держит нижнюю доску.' },
  { id: 'exit_flood', spot: 'exit_flood', when: AT('s_garret_tag', 'exit'), flag: 'exit_flooded_drained', toast: 'Вода ушла: низкая галерея свободна.' },
  { id: 'lower_flow', spot: 'lower_flow', when: AT('s_boris_gate', 'p_far'), flag: 'lower_flow_low', toast: 'Напор нижнего рукава снижен.' },
  { id: 'wash_drain', spot: 'wash_drain', when: AT('s_boris_gate', 'p_wash'), flag: 'drain_washed', toast: 'Пустой отвод промыт.' },
  { id: 'pipe_valve', spot: 'rann_pipe', when: AT('s_rann_nests', 'p_net', 'p_lure', 'p_rope'), flag: 'pipe_valve', toast: 'Заслонка закрыта до малого расхода.' },
  { id: 'pipe_ring', spot: 'pipe_ring', when: AT('s_rann_nests', 'p_rope'), flag: 'pipe_ring', toast: 'Канат закреплён у кольца.' },
];

export const STORY_WAVES = {
  relay_watch: { spot: 'relay_watch', camp: 'relay_watch', enemies: [['watcher', 0, 0]], onClear: [{ setFlag: 'relay_watch_dead' }] },
  relay_panel: {
    spot: 'relay_panel', camp: 'relay_wave_c6', enemies: [['guardian', -6, 2], ['guardian', 6, 2], ['watcher', 0, -4]],
    onClear: [{ scene: 'C09' }],
  },
  drain_guards: { spot: 'drain_guards', camp: 'drain_wave', enemies: [['guardian', -5, 3], ['guardian', 5, 3], ['watcher', 0, -6]], onClear: [] },
  veyr_guards: { spot: 'veyr_guards', camp: 'veyr_wave', enemies: [['guardian', -6, 2], ['guardian', 6, 2], ['watcher', 0, -3]], onClear: [] },
  kharz_battle: { spot: 'kharz_arena', camp: 'kharz_battle', enemies: [['archdemon', 0, 0], ['imp', -4, -3], ['imp', 4, -3]], onClear: [{ scene: 'C14b' }] },
  pump_guards: { spot: 'pump_guards', camp: 'pump_wave', enemies: [['guardian', -6, 2], ['guardian', 6, 2], ['watcher', 0, -5]], onClear: [] },
  amp_guards: { spot: 'core_rack', camp: 'amp_wave', enemies: [['guardian', 4, 3], ['guardian', 4, -3]], onClear: [] },
  ctrl_wave1: { spot: 'core_arena', camp: 'ctrl_w1', enemies: [['guardian', -6, 0], ['watcher', 6, 2], ['imp', 0, -5]], onClear: [{ scene: 'C24b' }] },
  ctrl_wave2: { spot: 'core_arena', camp: 'ctrl_w2', enemies: [['guardian', 0, 5, { shield: ['post_l_off', 'post_r_off'] }], ['watcher', -6, -2]], onClear: [{ scene: 'C24c' }] },
  final_wave: { spot: 'core_arena', camp: 'final_w', enemies: [['guardian', -5, 3, { shield: ['fpost_l_off', 'fpost_r_off'] }], ['guardian', 5, 3, { shield: ['fpost_l_off', 'fpost_r_off'] }], ['watcher', 0, -5]], onClear: [] },
  raid1: { spot: 'night_field', camp: 'raid_w1', enemies: [['mushroom', -6, 0], ['mushroom', 0, 5], ['mushroom', 6, 0]], onClear: [{ wave: 'raid2' }], say: [] },
  raid2: { spot: 'night_field', camp: 'raid_w2', enemies: [['mushroom', -8, 2], ['mushroom', 8, 2], ['mushroom', 0, 8], ['puglin', 0, -4]], onClear: [] },
  gate_mushrooms: { spot: 'upper_gate', camp: 'gate_mush', enemies: [['mushroom', -4, 3], ['mushroom', 4, 3], ['mushroom', 0, 6]], onClear: [] },
};

/** Directed blasts that set a flag: { spot, r, when, flag } (the explosion handler in rpg/RPG.js). */
export const STORY_BLASTS = [
  { spot: 'spring_partition', r: 10, when: AT('s_roxy_water', 'p_blast'), flag: 'spring_blast' },
];
