import { POIS } from '../../world/MapData.js';

/**
 * Places and props of the side stories (docs/story/04), as DATA built by world/build/SideProps.js once every named spot exists.
 *   SIDE_SPOTS  { name, at: [x, z] | spot, dx, dz, yaw }   named places (quest markers, triggers, wave origins)
 *   SIDE_PROPS  { id, name, prompt, at | spot, dx, dz, shape, y, flat }   interactables; behaviour in data/story/props.js
 *               shape: lever | valve | stake | board | ring | crate | sack | plank | pipe | mark | none
 *               `flat`: interior coordinates (the dungeon): the floor is y = 0
 */
const poi = (id) => POIS.find((p) => p.id === id);
const P = (id) => [poi(id).x, poi(id).z];

export const SIDE_SPOTS = [
  { name: 'hill_oak', at: P('hill_oak') },
  { name: 'tar_camp_door', at: P('tar_camp') },
  { name: 'exit_flood', abs: [-12, 1190] },
  { name: 'night_field', spot: 'farmhouse', dx: 4, dz: 18 },
  { name: 'north_spring', at: [-318, -262], yaw: 0 },
  { name: 'spring_flume', at: [-326, -260] },
  { name: 'spring_seam', at: [-309, -262] },
  { name: 'spring_partition', at: [-311, -270] },
  { name: 'bridge_marta', at: [322, -157], yaw: 0 },
  { name: 'alder_west', at: [322, -160] },
  { name: 'bridge_board', at: [334, -163] },
  { name: 'cache_pond_barrel', at: [604, -125] },
  { name: 'upper_gate', spot: 'farmhouse', dx: 36, dz: -30 },
  { name: 'lower_flow', spot: 'farmhouse', dx: 28, dz: -22 },
  { name: 'wash_drain', spot: 'farmhouse', dx: 40, dz: -24 },
  { name: 'quiet_site', spot: 'hunter_rann', dx: -22, dz: 10 },
  { name: 'rann_pipe', spot: 'hunter_rann', dx: 34, dz: 30 },
  { name: 'pipe_ring', spot: 'hunter_rann', dx: 36, dz: 36 },
  { name: 'edmund_route', spot: 'scholar', dx: -10, dz: 6 },
];

export const SIDE_PROPS = [
  // B10 — the night raid on Boris' field
  { id: 'field_cart_a', name: 'Пустая телега', prompt: 'Подкатить телегу к проходу', spot: 'farmhouse', dx: 12, dz: 10, shape: 'crate' },
  { id: 'field_cart_b', name: 'Пустая телега', prompt: 'Подкатить телегу к проходу', spot: 'farmhouse', dx: 15, dz: 10, shape: 'crate' },
  { id: 'field_lantern', name: 'Камень у поля', prompt: 'Повесить фонарь у камня', spot: 'barn', dx: -9, dz: -5, shape: 'stake' },
  // B13 — four caches
  { id: 'cache_bridge_lever', name: 'Рычаг старой платформы', prompt: 'Повернуть платформу под нишу', at: P('bridge_stash'), dx: -3, dz: 2, shape: 'lever' },
  { id: 'cache_oak_clear', name: 'Заросший подход', prompt: 'Расчистить подход руками', at: P('hill_oak'), dx: 2, dz: 3, shape: 'plank' },
  { id: 'cache_oak_latch', name: 'Деревянная крышка', prompt: 'Найти защёлку на крышке', at: P('hill_oak'), dx: 3.4, dz: 0.8, shape: 'crate' },
  { id: 'cache_pond_block', name: 'Береговой блок', prompt: 'Подвести верёвку через блок', at: P('reed_pond'), dx: -19, dz: 0, shape: 'lever' },
  { id: 'cache_tar_part_a', name: 'Часть рукояти', prompt: 'Взять часть рукояти', at: P('tar_camp'), dx: 6, dz: 4, shape: 'plank' },
  { id: 'cache_tar_part_b', name: 'Часть рукояти', prompt: 'Взять часть рукояти', at: P('tar_camp'), dx: -5, dz: 7, shape: 'plank' },
  { id: 'cache_tar_lid', name: 'Каменная крышка печи', prompt: 'Поднять крышку собранной рукоятью', at: P('tar_camp'), dx: 0, dz: 0, shape: 'crate' },
  // B14 — the north spring
  { id: 'spring_gate', name: 'Верхний затвор', prompt: 'Перекрыть верхний затвор (Мегумин)', spot: 'north_spring', dx: 4, dz: -3, shape: 'valve' },
  { id: 'spring_valve', name: 'Дальний желоб', prompt: 'Закрыть дальний желоб руками', spot: 'north_spring', dx: -8, dz: -4, shape: 'valve' },
  { id: 'spring_sample', name: 'Источник', prompt: 'Взять пробу воды (Рокси)', spot: 'north_spring', dx: 2, dz: 5, shape: 'stake' },
  { id: 'spring_seam_prop', name: 'Дальний шов', prompt: 'Шов течёт. Закрой его водяным залпом (Рокси)', spot: 'north_spring', dx: 9, dz: 0, shape: 'none' },
  { id: 'spring_flume_prop', name: 'Промывочный желоб', prompt: 'Смыть соль малым потоком (Рокси)', spot: 'north_spring', dx: -8, dz: 2, shape: 'none' },
  // B15 — Marta's bridge
  { id: 'bridge_clip', name: 'Звенящая скоба', prompt: 'Снять звенящую скобу', spot: 'alder_west', dx: 5, dz: -1, shape: 'stake' },
  { id: 'bridge_branch', name: 'Упавшая ветка', prompt: 'Убрать ветку с подхода руками', spot: 'alder_west', dx: -3, dz: 1, shape: 'plank' },
  { id: 'bridge_cart', name: 'Пустая телега Марты', prompt: 'Вывести лошадь с телегой по настилу', spot: 'alder_west', dx: -1, dz: 3, shape: 'crate' },
  { id: 'bridge_board_prop', name: 'Нижняя доска', prompt: 'Придержать доску потоком (Рокси)', spot: 'bridge_board', dx: 0, dz: 0, shape: 'none' },
  // B16 — the shift room of the old mine (in the dungeon)
  { id: 'shift_tag', name: 'Бирка номер семь', prompt: 'Осмотреть бирку смены', abs: [34, 1140], shape: 'board', flat: true },
  { id: 'shift_log', name: 'Журнал расхода ламп', prompt: 'Прочитать журнал расхода ламп', abs: [30, 1136], shape: 'crate', flat: true },
  { id: 'exit_grate', name: 'Ручная решётка', prompt: 'Открыть ручную решётку аварийного выхода', abs: [-10, 1186], shape: 'lever', flat: true },
  { id: 'exit_flood_prop', name: 'Затопленная галерея', prompt: 'Низкая галерея залита. Рокси может сбить воду залпом', abs: [-12, 1191], shape: 'none', flat: true },
  { id: 'exit_stamp', name: 'Штамп на стене', prompt: 'Прочитать штамп', abs: [-12.2, 1196], shape: 'board', flat: true },
  // B17 — the temple list
  { id: 'temple_list', name: 'Храмовый список', prompt: 'Проверить имя Орина в храмовом списке', spot: 'temple_altar', dx: 3, dz: 0, shape: 'board' },
  // B18 — Boris' upper gate
  { id: 'measure_a', name: 'Мерная рейка у фермы', prompt: 'Замерить нижний рукав', spot: 'farmhouse', dx: 20, dz: -12, shape: 'stake' },
  { id: 'measure_b', name: 'Мерная рейка у поля', prompt: 'Замерить верхний рукав', spot: 'farmhouse', dx: 26, dz: -16, shape: 'stake' },
  { id: 'upper_gate_wheel', name: 'Верхний затвор', prompt: 'Открыть верхний затвор', spot: 'upper_gate', dx: 0, dz: 0, shape: 'valve' },
  { id: 'lower_flow_prop', name: 'Нижний рукав', prompt: 'Снизить напор снизу (Рокси)', spot: 'lower_flow', dx: 0, dz: 0, shape: 'none' },
  { id: 'wash_drain_prop', name: 'Пустой отвод', prompt: 'Промыть пустой отвод (Рокси)', spot: 'wash_drain', dx: 0, dz: 0, shape: 'none' },
  { id: 'extra_valve', name: 'Ещё один клапан', prompt: 'Поставить клапан на обход', spot: 'wash_drain', dx: 3, dz: 3, shape: 'valve' },
  { id: 'gate_wheel', name: 'Ручное колесо', prompt: 'Отметить положение ручного колеса', spot: 'upper_gate', dx: 3, dz: 1, shape: 'valve' },
  // B19 — Rann's empty nests
  { id: 'nest_a', name: 'Пустые гнёзда', prompt: 'Осмотреть гнёзда', spot: 'hunter_rann', dx: 18, dz: 20, shape: 'mark' },
  { id: 'nest_b', name: 'Пустые гнёзда', prompt: 'Осмотреть гнёзда', spot: 'hunter_rann', dx: 26, dz: 26, shape: 'mark' },
  { id: 'quiet_check', name: 'Тихий участок', prompt: 'Сравнить с тихим участком', spot: 'quiet_site', dx: 0, dz: 0, shape: 'mark' },
  { id: 'pipe_net', name: 'Вентиляционная труба', prompt: 'Поставить сетку на трубу', spot: 'rann_pipe', dx: 0, dz: 0, shape: 'pipe' },
  { id: 'pipe_valve_prop', name: 'Заслонка трубы', prompt: 'Закрыть заслонку до малого расхода (Рокси)', spot: 'rann_pipe', dx: 2, dz: 1, shape: 'none' },
  { id: 'pipe_ring_prop', name: 'Кольцо над оврагом', prompt: 'Закрепить канат у кольца водяной стрелой (Рокси)', spot: 'pipe_ring', dx: 0, dz: 0, shape: 'none' },
  { id: 'rann_box', name: 'Лагерный ящик', prompt: 'Посмотреть записку Ранна', spot: 'hunter_rann', dx: -2, dz: 2, shape: 'crate' },
  // B20 — the measuring route of Edmund and Tera
  { id: 'edm_m1', name: 'Площадка замера', prompt: 'Начать замер у западного склона', spot: 'edmund_route', dx: 0, dz: 0, shape: 'stake' },
  { id: 'edm_m2', name: 'Вторая площадка', prompt: 'Провести второе сравнение', spot: 'edmund_route', dx: -8, dz: 8, shape: 'stake' },
  { id: 'edm_m3', name: 'Площадка у канала', prompt: 'Провести сравнение у вентиляционного канала', spot: 'edmund_route', dx: -16, dz: 14, shape: 'stake' },
  // B21 — Clara's book of witnesses
  { id: 'water_ledger', name: 'Городской шкаф у гильдии', prompt: 'Найти ведомость выдачи воды', spot: 'guild_table', dx: 2, dz: 1, shape: 'crate' },
  { id: 'council_protocol', name: 'Копия протокола совета', prompt: 'Сравнить ведомость с протоколом совета', spot: 'temple_altar', dx: -3, dz: 1, shape: 'board' },
  // B22 — the open road
  { id: 'road_debris', name: 'Обломок телеги', prompt: 'Убрать обломок телеги с дороги', spot: 'relay_gate_out', dx: -6, dz: 5, shape: 'plank' },
  { id: 'road_sign', name: 'Указатель у дороги', prompt: 'Восстановить указатель', spot: 'relay_gate_out', dx: -9, dz: -3, shape: 'board' },
  { id: 'post_panel', name: 'Панель старого поста', prompt: 'Осмотреть холодную панель поста', spot: 'relay_gate_out', dx: 3, dz: -4, shape: 'stake' },
  // B23 — the day at the shelter
  { id: 'shelter_food', name: 'Столы с обедом', prompt: 'Раздать обед', spot: 'shelter', dx: 3, dz: 2, shape: 'crate' },
  { id: 'shelter_lamps', name: 'Лампы у дальней стены', prompt: 'Поставить лампы у дальней стены', spot: 'shelter', dx: -6, dz: 5, shape: 'stake' },
  { id: 'lost_bag', name: 'Сумка под столом', prompt: 'Осмотреть забытую сумку', spot: 'shelter', dx: 4, dz: 3, shape: 'sack' },
];

/** Enemy camps of the side stories: { type, spot, dx, dz, camp } (built with the props). */
export const SIDE_CAMPS = [
  { type: 'guardian', spot: 'rann_pipe', dx: -5, dz: 7, camp: 'pipe_guard' },
];
