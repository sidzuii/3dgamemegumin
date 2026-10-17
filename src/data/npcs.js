/**
 * People of Axel and its surroundings.
 *
 *  model     3D body from the Quaternius modular people (npc/People.js): outfit pieces
 *            [head, body, legs, feet, extras...] + recolours by material name
 *            ('Piece:Material' recolours one piece only), { hide, scale }
 *  look      colours for the dialogue portrait (ui/portrait.js)
 *  schedule  first matching entry wins: { time: [from, to], spot, anim, hidden, if }
 *            (anim: idle | work | shop | guard | sit | dance | magic | talk)
 *  talk      first matching entry: { if, dialogue } or { if, bark: [...] }
 *  barks     short written lines for people without a conversation right now
 *  appear    condition for being in the world at all
 */
import { clipText } from './story/index.js';
import { CITIZENS } from './citizens.js';

/** Stages of the road quest `ainstrey_road` in order (data/quests.js): schedules of the road crew follow them. */
const ROAD_STAGES = ['luna', 'nera', 'edmund', 'sack', 'doren', 'survey', 'drain_talk', 'p_ditch', 'p_service', 'brace', 'method', 'p_expl', 'p_winch', 'g_off', 'g_fight', 'cleanup', 'carts_empty', 'carts_loaded', 'act', 'view', 'fork', 'mills_talk', 'mills_task', 'dam'];
/** Where the road quest is: -1 not started, an index into ROAD_STAGES, 99 done. */
export const roadAt = (rpg) => {
  const st = rpg.quests.status('ainstrey_road');
  if (st === 'done') return 99;
  if (st !== 'active') return -1;
  return ROAD_STAGES.indexOf(rpg.quests.stageId('ainstrey_road'));
};

/** Stages of the main quest of the capital `ainstrey_city` (data/quests_capital.js) in order: schedules of the capital's people follow them. */
const CITY_STAGES = ['gate', 'meet', 'archive', 'academy', 'invoice', 'varlen', 'permit', 'prep', 'route', 'p_top', 'p_pit', 'coupling', 'p_expl', 'p_mech', 'check_gate', 'report', 'wrap', 'finish'];
/** Where the capital quest is: -1 not started, an index into CITY_STAGES, 99 done. */
export const cityAt = (rpg) => {
  const st = rpg.quests.status('ainstrey_city');
  if (st === 'done') return 99;
  if (st !== 'active') return -1;
  return CITY_STAGES.indexOf(rpg.quests.stageId('ainstrey_city'));
};
const CS = (stage) => ({ quest: 'ainstrey_city', stage });
const VARLEN_BARK = (rpg) => [clipText(rpg.getVar('VARLEN_COOPERATES') ? 'V08_009' : 'V08_010')];

const NIGHT_HOME = { time: [22, 6], hidden: true };
const M = (parts, colors = {}, extra = {}) => ({ pack: 'm', parts, colors, ...extra });
const F = (parts, colors = {}, extra = {}) => ({ pack: 'w', parts, colors, ...extra });

export const NPCS = [
  // ------------------------------------------------------------------ the caravan
  {
    id: 'marta', name: 'Марта', title: 'Хозяйка каравана',
    model: F(['Soldier_Head', 'Adventurer_Body', 'Medieval_Legs', 'Adventurer_Feet'], { Hair_Brown: 0x6a3a1a, 'Adventurer_Body:Green': 0x8a6a4a, 'Adventurer_Body:LightGreen': 0x5a4030, Black: 0x4a3a2a }),
    look: { skin: 0xe8b890, hair: 0x6a3a1a, hairStyle: 'bun', top: 0x8a6a4a, vest: 0x5a4030, bottom: 0x4a3a2a, hat: 'wide', hatColor: 0x7a5a3a, build: 1.05, chestShape: true },
    schedule: [
      // A00: at her cart in the caravan camp before the south gate until Megumin is through the gate (and the sacks are carried)
      { time: [0, 24], spot: 'marta_road', anim: 'idle', if: { any: [{ quest: 'prologue_arrival', stage: 'marta' }, { quest: 'prologue_arrival', stage: 'gate' }, { quest: 'a00_bags', status: 'active' }] } },
      { time: [0, 24], spot: 'bridge_marta', anim: 'idle', if: { any: ['bridge', 'p_clip', 'p_edge'].map((stage) => ({ quest: 's_marta_bridge', stage })) } },
      { time: [0, 24], spot: 'ledge_marta', anim: 'idle', if: { any: ['ledge', 'p12_cargo', 'p12_roxy', 'p12_rope', 'ledge_out'].map((stage) => ({ quest: 'ch7_gorge', stage })) } },
      { time: [6, 12], spot: 'caravan_master', anim: 'idle' }, { time: [12, 17], spot: 'caravan_office_desk', anim: 'sit', seat: 0.5 }, { time: [17, 21], spot: 'caravan_master', anim: 'idle' }, { time: [21, 24], spot: 'tavern_table4', anim: 'sit' }, NIGHT_HOME],
    talk: [
      { if: { v: 'MARTA_BRIDGE' }, bark: [clipText('V06_006')] },
      { if: { quest: 'c_cache_tar', status: 'available' }, dialogue: 'B13d' },
      { if: { quest: 's_marta_bridge', status: 'available' }, dialogue: 'B15a' },
      { if: { quest: 's_marta_bridge', stage: 'pay' }, dialogue: 'B15c' },
      { if: { quest: 's_fenrik_names', stage: 'witness' }, dialogue: 'B17b' },
      { if: { quest: 'ch7_gorge', stage: 'ledge' }, dialogue: 'C12' },
      { if: { quest: 'ch7_gorge', stage: 'ledge_out' }, dialogue: 'C12b' },
      { if: { any: ['p12_cargo', 'p12_roxy', 'p12_rope'].map((stage) => ({ quest: 'ch7_gorge', stage })) }, bark: ['Не подходи к колесу. Уступ крошится.', 'Лошадей я отвела. Груз и телега — на вас.'] },
      { if: { quest: 'a00_bags', stage: 'back' }, dialogue: 'A00:join' },
      { if: { quest: 'a00_bags', stage: 'carry' }, bark: ['Два у заднего колеса. Потом можешь спорить.'] },
      { if: { quest: 'prologue_arrival', stage: 'marta' }, dialogue: 'A00' },
      { dialogue: 'marta_idle' },
    ],
  },
  // ------------------------------------------------------------------ version 2.0: the road crew (D01-D13)
  {
    id: 'nera', name: 'Нэра Вальд', title: 'Дорожный инженер',
    model: F(['Soldier_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Hair_Brown: 0x3a2a22, 'Adventurer_Body:Green': 0x6a7a8a, 'Adventurer_Body:LightGreen': 0x4a5a6a, 'Adventurer_Legs:Brown': 0x4a4a52, 'Adventurer_Legs:Brown2': 0x3a3a44 }),
    look: { skin: 0xf0d0b8, hair: 0x3a2a22, hairStyle: 'ponytail', top: 0x6a7a8a, vest: 0x8a6a3a, bottom: 0x4a4a52, hat: 'cap', hatColor: 0xb8903a, tallBoots: true, bag: 0x7a5232 },
    schedule: (rpg) => {
      const at = roadAt(rpg);
      if (at >= 1 && at <= 3) return [{ time: [0, 24], spot: 'olkhovka_well', anim: 'idle' }];
      if (at >= 4 && at <= 18) return [{ time: [0, 24], spot: 'ledge_nera', anim: 'idle' }];
      const cy = cityAt(rpg); // after the act she goes ahead to the city: the batch number, the store, the pump
      if (cy === 4 || cy === 99 || cy === 16 || cy === 17) return [{ time: [8, 20], spot: 'guild_yard_nera', anim: 'idle' }, { time: [20, 8], hidden: true }];
      if (cy === 5 || cy === 6) return [{ time: [0, 24], spot: 'port_store_nera', anim: 'idle' }];
      if (cy >= 7 && cy <= 14) return [{ time: [0, 24], spot: 'pump_nera', anim: 'idle' }];
      if (cy === 15) return [{ time: [0, 24], spot: 'port_office_nera', anim: 'idle' }];
      return [{ time: [0, 24], hidden: true }];
    },
    talk: [
      { if: { quest: 'ainstrey_road', stage: 'nera' }, dialogue: 'D01' },
      { if: { quest: 'ainstrey_road', stage: 'drain_talk' }, dialogue: 'D05' },
      { if: { quest: 'ainstrey_road', stage: 'method' }, dialogue: 'D07' },
      { if: { quest: 'ainstrey_road', stage: 'g_off' }, dialogue: 'D08a' },
      { if: { quest: 'ainstrey_road', stage: 'act' }, dialogue: 'D09' },
      { if: CS('invoice'), dialogue: 'D19' },
      { if: { any: [CS('varlen'), CS('permit')] }, bark: ['Склад и журнал сначала, спор потом. Я рядом с Варленом.'] },
      { if: { any: [CS('prep'), CS('p_top'), CS('p_pit'), CS('coupling')] }, bark: ['Крепления сняла, скобы лежат у стены. Без белой отметки ничего не трогаем.'] },
      { if: { any: [CS('p_expl'), CS('p_mech')] }, bark: ['Упор держу. Только на мой знак.'] },
      { if: { quest: 'ainstrey_city', status: 'done' }, bark: [clipText('V08_001')] },
      { if: { quest: 'ainstrey_road', stage: 'edmund' }, bark: ['Эдмунд живёт у теплицы за площадью. Прибор нужен будет на склоне: после обвала старые посты иногда включаются сами.'] },
      { if: { quest: 'ainstrey_road', stage: 'sack' }, bark: ['Мешок креплений Гаррета лежит у выхода. Две скобы, вторую держи, пока затягиваешь.'] },
      { if: { quest: 'ainstrey_road', stage: 'survey' }, bark: ['Три места: верхний карман, шов плиты, лебёдка. Порядок любой. Мел у меня на плане.'] },
      { if: { quest: 'ainstrey_road', stage: 'p_ditch' }, bark: ['Шест у входа в канаву, потом ограда. Воду пускаем только после предупреждения.'] },
      { if: { quest: 'ainstrey_road', stage: 'p_service' }, bark: ['Решётки снимает рычаг, выход промывает Рокси. Торопиться некуда.'] },
      { if: { quest: 'ainstrey_road', stage: 'brace' }, bark: ['Опоры ставим под шов, не под край. Потом проверка под малой нагрузкой.'] },
      { if: { any: [{ quest: 'ainstrey_road', stage: 'p_expl' }, { quest: 'ainstrey_road', stage: 'p_winch' }] }, bark: ['Рабочие за шестами. Я не снимаю людей с безопасных мест, пока вы не закончите.'] },
      { if: { quest: 'ainstrey_road', stage: 'g_fight' }, bark: ['Стражи у отметок! Не подпускай их к отводу.'] },
      { if: { quest: 'ainstrey_road', stage: 'cleanup' }, bark: ['Цепь, три обломка, настил. Остальное сделают люди по двое.'] },
      { if: { any: [{ quest: 'ainstrey_road', stage: 'carts_empty' }, { quest: 'ainstrey_road', stage: 'carts_loaded' }] }, bark: ['Колокол у шестов. Сначала пустая, потом гружёная.'] },
      { bark: ['Тракт работает. После дождя пост смотрит склон; если понадобится ремонт, дадим отдельное задание.'] },
    ],
  },
  {
    id: 'doren', name: 'Дорен Крей', title: 'Бригадир расчистки',
    model: M(['Casual2_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet'], { Hair: 0x3a2a1e, Skin: 0xc89070, Skin_Darker: 0xa87050, LightBrown: 0x7a6a4a }, { scale: 1.02 }),
    look: { skin: 0xc89070, hair: 0x3a2a1e, hairStyle: 'short', beard: true, top: 0x7a6a4a, sleeves: 'short', bottom: 0x4a3a2a, hat: 'cap', hatColor: 0xb8903a, build: 1.2, height: 1.04, tallBoots: true },
    schedule: [{ time: [0, 24], spot: 'ledge_doren', anim: 'idle' }],
    talk: [
      { if: { quest: 'ainstrey_road', stage: 'doren' }, dialogue: 'D03' },
      { if: { quest: 'ainstrey_road', stage: 'survey' }, bark: ['От шестов дальше только по плану. На верхней площадке лестница, перила держат.'] },
      { if: { quest: 'ainstrey_road', stage: 'brace' }, bark: ['Вторую скобу держи, пока затягиваю. Бригада за шестами.'] },
      { if: { any: [{ quest: 'ainstrey_road', stage: 'p_expl' }, { quest: 'ainstrey_road', stage: 'p_winch' }] }, bark: ['Бригада ждёт. Дам знак, как только площадка свободна.'] },
      { if: { quest: 'ainstrey_road', stage: 'cleanup' }, bark: ['Рабочие, по двое к лебёдке. Остальные ждут у нижнего края.'] },
      { if: { quest: 'ainstrey_road', status: 'active' }, bark: ['Делай по списку Нэры. Люди ценнее скорости.'] },
      { bark: ['Дорога открыта. Двое моих остаются на склоне до конца работ, потом пост смотрит после дождя.'] },
    ],
  },
  {
    id: 'lissa', name: 'Лисса Рейн', title: 'Посыльная',
    model: F(['Casual_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Hair_Blond: 0xb8602a, Hair_Brown: 0xb8602a, 'Adventurer_Body:Green': 0x3a6a5a, 'Adventurer_Body:LightGreen': 0x5a8a7a, 'Adventurer_Legs:Brown': 0x4a3a2a }),
    look: { skin: 0xf6d0b0, hair: 0xb8602a, hairStyle: 'braids', top: 0x3a6a5a, vest: 0x8a6a3a, bottom: 0x4a3a2a, hat: 'cap', hatColor: 0x3a6a5a, bag: 0x7a5232, tallBoots: true, height: 0.97 },
    schedule: (rpg) => {
      const at = roadAt(rpg);
      if (at === 7) return [{ time: [0, 24], spot: 'ledge_camp', anim: 'idle' }]; // the lower camp: she will carry the warning down to the mills
      if (at === 20) return [{ time: [0, 24], spot: 'lissa_fork', anim: 'idle' }];
      if (at === 21 || at === 22) return [{ time: [0, 24], spot: 'mill_wheel', anim: 'idle' }];
      if (at === 23) return [{ time: [0, 24], spot: 'dam_south', anim: 'idle' }];
      const cy = cityAt(rpg);
      if (rpg.quests.status('n05_patrol') === 'active' && ['camp', 'p_lure', 'p_top', 'p_reserve'].includes(rpg.quests.stageId('n05_patrol'))) return [{ time: [0, 24], spot: 'n05_camp_lissa', anim: 'idle' }];
      if (cy >= 1 || cy === 99) return [{ time: [7, 21], spot: 'guild_lissa', anim: 'idle' }, { time: [21, 7], hidden: true }];
      if (at === 99) return [{ time: [7, 20], spot: 'mills_camp', anim: 'idle' }, { time: [20, 7], hidden: true }];
      return [{ time: [0, 24], hidden: true }];
    },
    talk: [
      { if: { quest: 'ainstrey_road', stage: 'fork' }, dialogue: 'D11' },
      { if: { quest: 'ainstrey_road', stage: 'mills_talk' }, dialogue: 'D12' },
      { if: { quest: 'ainstrey_road', stage: 'mills_task' }, bark: ['Рычаг держит один, обломок вынимает второй. Без большого заклинания.'] },
      { if: { quest: 'ainstrey_road', stage: 'dam' }, dialogue: 'D13' },
      { if: { quest: 'ainstrey_city', stage: 'wrap', notFlag: 'D26_DONE' }, dialogue: 'D26' },
      { if: { quest: 'n01_letter', stage: 'compare' }, dialogue: 'N01b' },
      { if: { quest: 'n01_letter', stage: 'report' }, dialogue: 'N01c' },
      { if: { quest: 'n01_letter', status: 'available' }, dialogue: 'N01a' },
      { if: { any: [{ quest: 'n01_letter', stage: 'record' }, { quest: 'n01_letter', stage: 'deliver' }] }, bark: ['Запись и подпись: без них письмо снова вернётся. Конверт не открываю.'] },
      { if: { flag: 'D15_DONE' }, bark: [clipText('V08_003')] },
      { if: { quest: 'ainstrey_road', stage: 'p_ditch' }, bark: ['Я у нижнего привала. Предупреждение мельникам донесу быстрее телеги, как только вы поставите шест.'] },
      { bark: ['Дороги покажу по заказу. Короткий путь не обязан быть хорошим.'] },
    ],
  },
  // ------------------------------------------------------------------ version 2.0: the capital Ainstrey (D14-D28, N01-N05)
  {
    id: 'oskar', name: 'Оскар', title: 'Старший стражи ворот',
    model: M(['Adventurer_Head', 'King_Body', 'King_Legs', 'King_Feet', 'Sword'], { Hair: 0x3a2e24, Blue: 0x3a5a7a }, { scale: 1.02 }),
    look: { skin: 0xe0b896, hair: 0x3a2e24, hairStyle: 'short', beard: true, top: 0x3a5a7a, bottom: 0x3a3a48, armor: 0xa2a8b0, hat: 'helmet', hatColor: 0xa2a8b0, build: 1.15, height: 1.05 },
    schedule: (rpg) => {
      const cy = cityAt(rpg);
      if (cy >= 6 && cy <= 14) return [{ time: [0, 24], spot: 'pump_oskar', anim: 'guard' }];
      return [{ time: [5, 22], spot: 'oskar_post', anim: 'guard' }, { time: [22, 5], spot: 'oskar_post', anim: 'guard' }];
    },
    talk: [
      { if: CS('gate'), dialogue: 'D14' },
      { if: { quest: 'n05_patrol', stage: 'brief' }, dialogue: 'N05a' },
      { if: { quest: 'n05_patrol', stage: 'report' }, dialogue: 'N05c' },
      { if: { quest: 'n05_patrol', status: 'available' }, dialogue: 'N05a' },
      { if: { quest: 'n05_patrol', status: 'active' }, bark: ['Три поста и фонарь. Проверка ночью, не днём: днём всё видно и так.'] },
      { if: { any: [CS('permit'), CS('prep'), CS('route'), CS('p_top'), CS('p_pit'), CS('coupling')] }, bark: ['Нижний проход перекрыт. Границы допуска: рабочая зона, верхний мосток, боковой проход. Городскую стену в допуск не вписали.'] },
      { dialogue: 'oskar_idle' },
    ],
  },
  {
    id: 'selia', name: 'Селия Морн', title: 'Распорядитель гильдии Айнстрея',
    model: F(['Formad_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Brown: 0x4a3a30, Hair_Blond: 0x4a3a30, LimeGreen: 0x3a5a7a, Gold: 0xf0e8d0 }),
    look: { skin: 0xf0d0b8, hair: 0x4a3a30, hairStyle: 'bun', top: 0x3a5a7a, dress: true, dressLong: true, dressColor: 0x2f4a6a, apron: 0xf0e8d0, chestShape: true, height: 1.0 },
    schedule: (rpg) => {
      const cy = cityAt(rpg);
      if (cy === 5 || cy === 6) return [{ time: [0, 24], spot: 'port_store_selia', anim: 'idle' }];
      if (cy === 15) return [{ time: [0, 24], spot: 'port_office_selia', anim: 'idle' }];
      return [{ time: [7, 21], spot: 'guild_selia', anim: 'shop' }, { time: [21, 7], hidden: true }];
    },
    talk: [
      { if: [CS('meet'), { notFlag: 'D15_DONE' }], dialogue: 'D15' },
      { if: [{ quest: 'n03_handwriting', stage: 'compare' }, { notFlag: 'n03_log' }], dialogue: 'selia_log' },
      { if: CS('permit'), bark: ['Заказ на обследование оформлен: сто восемьдесят эрис отряду. Возврат материалов Нэры не вычитаем.'] },
      { if: CS('finish'), dialogue: 'D27' },
      { dialogue: 'selia_idle' },
    ],
  },
  {
    id: 'tavia', name: 'Тавия', title: 'Хозяйка «Двора Тавии»',
    model: F(['Medieval_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Brown: 0x6a3a22, Hair_Blond: 0x6a3a22, LimeGreen: 0x9a5a3a, Gold: 0xf4ecd8 }),
    look: { skin: 0xe8b890, hair: 0x6a3a22, hairStyle: 'bun', top: 0xd88a6a, dress: true, dressLong: true, dressColor: 0x5a4a3a, apron: 0xf4f0e8, chestShape: true, height: 0.98 },
    schedule: [{ time: [6, 24], spot: 'inn_tavia', anim: 'shop' }, { time: [0, 6], hidden: true }],
    talk: [
      { if: [{ quest: 'ainstrey_city', status: 'active' }, { notFlag: 'D16_DONE' }, { flag: 'oskar_met' }], dialogue: 'D16' },
      { if: { quest: 'n02_ovens', stage: 'brief' }, dialogue: 'N02a' },
      { if: { quest: 'n02_ovens', stage: 'plan' }, dialogue: 'N02b' },
      { if: { quest: 'n02_ovens', stage: 'bread' }, dialogue: 'N02c' },
      { if: { quest: 'n02_ovens', status: 'available' }, dialogue: 'N02a' },
      { if: { quest: 'n02_ovens', status: 'active' }, bark: ['Печь не трогайте, пока доска на месте. Дом мне нужен целиком.'] },
      { if: { flag: 'D16_DONE' }, dialogue: 'tavia_idle' },
      { bark: [clipText('V08_008')] },
    ],
  },
  {
    id: 'ilar', name: 'Илар', title: 'Архивариус Айнстрея',
    model: M(['Suit_Head', 'King_Body', 'Worker_Legs', 'Worker_Feet'], { Hair: 0x7a7468, Skin: 0xe0b896, Blue: 0x4a4a62 }),
    look: { skin: 0xe0b896, hair: 0x8a8478, hairStyle: 'short', beard: true, top: 0x4a4a62, bottom: 0x3a3a48, glasses: true, build: 0.92, height: 1.0 },
    schedule: [{ time: [7, 20], spot: 'archive_ilar', anim: 'sit', seat: 0.5 }, { time: [20, 7], hidden: true }],
    talk: [
      { if: { any: [CS('meet'), CS('archive')] }, dialogue: 'D17' },
      { if: { quest: 'ainstrey_city', stage: 'wrap', notFlag: 'D25_DONE' }, dialogue: 'D25' },
      { if: { quest: 'n03_handwriting', stage: 'brief' }, dialogue: 'N03a' },
      { if: [{ quest: 'n03_handwriting', stage: 'compare' }, { notFlag: 'n03_book' }], dialogue: 'ilar_book' },
      { if: { quest: 'n03_handwriting', stage: 'fix' }, dialogue: 'N03c' },
      { if: { quest: 'n03_handwriting', status: 'available' }, dialogue: 'N03a' },
      { if: { flag: 'D17_DONE' }, dialogue: 'ilar_idle' },
      { bark: [clipText('V08_006')] },
    ],
  },
  {
    id: 'mirena', name: 'Мирена', title: 'Инженер водяной службы',
    model: F(['Suit_Head', 'Witch_Body', 'Witch_Legs', 'Witch_Feet'], { Hair_Brown: 0x2a2a3a, Hair_Blond: 0x2a2a3a, Purple: 0x3a6a8a }),
    look: { skin: 0xe8c0a0, hair: 0x2a2a3a, hairStyle: 'ponytail', top: 0x3a6a8a, vest: 0x8a6a3a, bottom: 0x3a3a48, glasses: true, tallBoots: true, height: 0.99 },
    schedule: (rpg) => {
      const cy = cityAt(rpg);
      if (cy >= 5 && cy <= 14) return [{ time: [0, 24], spot: cy >= 7 ? 'pump_mirena' : 'pump_yard_mirena', anim: 'idle' }];
      if (rpg.quests.status('n04_bucket') === 'active' && ['mills', 'measure', 'talk_b', 'leak', 'statements'].includes(rpg.quests.stageId('n04_bucket'))) return [{ time: [0, 24], spot: 'n04_upper', anim: 'idle' }];
      return [{ time: [8, 19], spot: 'academy_mirena', anim: 'idle' }, { time: [19, 8], hidden: true }];
    },
    talk: [
      { if: CS('academy'), dialogue: 'D18' },
      { if: CS('permit'), dialogue: 'D21' },
      { if: CS('coupling'), dialogue: 'D23' },
      { if: { any: [CS('prep'), CS('route'), CS('p_top'), CS('p_pit')] }, bark: ['Давление смотрим по двум шкалам. Мостик к лестнице свободен, люди выходят по одному. Стражи у панели: я вижу их с поста.'] },
      { if: { any: [CS('p_expl'), CS('p_mech')] }, bark: ['Муфта отделяется только по белой отметке или домкратом. Несущую стену не трогаем.'] },
      { if: [{ quest: 'n03_handwriting', stage: 'compare' }, { notFlag: 'n03_list' }], dialogue: 'mirena_list' },
      { if: { quest: 'n03_handwriting', stage: 'sign' }, dialogue: 'N03b' },
      { if: { quest: 'n04_bucket', stage: 'brief' }, dialogue: 'N04a' },
      { if: { quest: 'n04_bucket', stage: 'talk_b' }, dialogue: 'N04b' },
      { if: { quest: 'n04_bucket', stage: 'mark' }, dialogue: 'N04c' },
      { if: { quest: 'n04_bucket', status: 'available' }, dialogue: 'N04a' },
      { if: { quest: 'n04_bucket', status: 'active' }, bark: ['Замеры, ремонт, подписи. Порядок — как на схеме.'] },
      { dialogue: 'mirena_idle' },
    ],
  },
  {
    id: 'varlen', name: 'Варлен Дорн', title: 'Инспектор перевозок порта',
    model: M(['Casual2_Head', 'Adventurer_Body', 'Worker_Legs', 'Worker_Feet', 'Backpack'], { Hair: 0x3a3a3a, Skin: 0xd0a080, LightBrown: 0x6a5a4a }, { scale: 1.0 }),
    look: { skin: 0xd0a080, hair: 0x3a3a3a, hairStyle: 'short', beard: true, top: 0x6a5a4a, bottom: 0x3a3a48, hat: 'cap', hatColor: 0x4a4a52, build: 1.05, height: 1.02 },
    schedule: (rpg) => {
      const cy = cityAt(rpg);
      if (cy === 5 || cy === 6) return [{ time: [0, 24], spot: 'port_store_varlen', anim: 'idle' }];
      if (cy >= 7 && cy <= 14) return [{ time: [0, 24], spot: 'port_store_varlen', anim: 'idle' }];
      return [{ time: [7, 20], spot: 'port_varlen', anim: 'sit', seat: 0.5 }, { time: [20, 7], hidden: true }];
    },
    talk: [
      { if: CS('varlen'), dialogue: 'D20' },
      { if: CS('report'), dialogue: 'D24' },
      { if: { any: [CS('permit'), CS('prep'), CS('route'), CS('p_top'), CS('p_pit'), CS('coupling'), CS('p_expl'), CS('p_mech'), CS('check_gate')] }, bark: ['Новые поставки остановил. Рабочие наверху. Спорить буду после, у конторы.'] },
      { if: { any: [CS('wrap'), CS('finish'), { quest: 'ainstrey_city', status: 'done' }] }, bark: VARLEN_BARK },
      { bark: ['Порт работает. По делам перевозок обращайтесь к стойке.'] },
    ],
  },
  // ------------------------------------------------------------------ Axel
  {
    id: 'bernard', name: 'Бернард', title: 'Стражник южных ворот',
    model: M(['Casual2_Head', 'King_Body', 'King_Legs', 'King_Feet', 'Sword'], { Hair: 0x6a3a1a, Blue: 0x2f4f8a }),
    look: { skin: 0xf6d0b0, hair: 0x6a3a1a, hairStyle: 'short', top: 0x3a5a8a, bottom: 0x3a3a48, armor: 0x9aa0a8, hat: 'helmet', hatColor: 0x9aa0a8, build: 1.1, height: 1.05 },
    schedule: [
      { time: [19, 24], spot: 'gate_north', anim: 'guard', if: { quest: 'ch2_people', status: 'active', notFlag: 'A12_DONE' } },
      { time: [6, 21], spot: 'gate_south', anim: 'guard' },
      { time: [21, 23], spot: 'tavern_table1', anim: 'sit' },
      { time: [23, 6], hidden: true },
    ],
    talk: [
      { if: { quest: 'prologue_arrival', stage: 'gate' }, dialogue: 'A01' },
      { if: { quest: 'c_lost_cat', stage: 'ask' }, dialogue: 'B02b' },
      { if: { quest: 'ch2_people', status: 'active', notFlag: 'A12_DONE', hour: [19, 24] }, dialogue: 'A12' },
      { if: { quest: 'ch2_people', status: 'active', notFlag: 'A12_DONE' }, bark: ['Ворота ещё открыты. Если нужен я, не днём. После заката я на северной стене.'] },
      { if: { quest: 'ch2_bernard', stage: 'bernard' }, dialogue: 'A14' },
      { dialogue: 'bernard_idle' },
    ],
  },
  {
    id: 'heinz', name: 'Хайнц', title: 'Стражник северных ворот',
    model: M(['Adventurer_Head', 'King_Body', 'King_Legs', 'King_Feet', 'Sword'], { Hair: 0x3a2418, Blue: 0x2f4f8a }),
    look: { skin: 0xe8b890, hair: 0x3a2418, hairStyle: 'short', top: 0x3a5a8a, bottom: 0x3a3a48, armor: 0x8a9098, hat: 'helmet', hatColor: 0x8a9098, beard: true, build: 1.12 },
    schedule: [{ time: [0, 24], spot: 'gate_north', anim: 'guard', if: { not: { quest: 'ch2_people', status: 'active' } } }, { time: [0, 24], spot: 'gate_east', anim: 'guard' }],
    barks: (rpg) => [
      'Северная дорога ведёт к старой шахте и дальше, через хребет. Без лицензии туда не суйся.',
      rpg.state.flags.guild_member ? 'О, новенькая из гильдии. Поле для испытаний — сразу за воротами, налево.' : 'Хочешь за ворота — сначала в гильдию.',
      'По ночам над хребтом что-то светится. Начальство говорит — болотные огни. Ага, конечно.',
    ],
  },
  {
    id: 'lina', name: 'Лина', title: 'Пекарь',
    model: F(['Casual_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Blond: 0xe8d098, Hair_Brown: 0xc8a868, LimeGreen: 0xc87a5a, Gold: 0xf4f0e8 }),
    look: { skin: 0xffe0c8, hair: 0xe8d8a0, hairStyle: 'ponytail', top: 0xd88a6a, dress: true, dressLong: true, dressColor: 0x6a4a3a, apron: 0xf4f0e8, chestShape: true, height: 0.95 },
    schedule: [{ time: [0, 24], spot: 'shelter_lina', anim: 'idle', if: { any: [{ quest: 'ch8_city', stage: 'shelter' }, { quest: 'ch8_city', stage: 'route_res' }, { quest: 'ch8_city', stage: 'route_rep' }, { quest: 'ch8_city', stage: 'pump_talk' }, { quest: 'ch8_city', stage: 'pump_key' }, { quest: 'ch8_city', stage: 'p17_shield' }, { quest: 'ch8_city', stage: 'p17_hold' }, { quest: 'ch8_city', stage: 'p17_flow' }, { quest: 'ch8_city', stage: 'pump_out' }, { quest: 'ch8_city', stage: 'veyr' }, { quest: 'ch8_city', stage: 'deep' }, { quest: 'ch8_city', stage: 'p19_lever' }, { quest: 'ch8_city', stage: 'p19_latch' }, { quest: 'ch8_city', stage: 'p19_breaker' }, { quest: 'ch8_city', stage: 'deep_out' }, { quest: 'ch8_city', stage: 'link' }, { quest: 'ch8_city', stage: 'link_check' }] } }, { time: [6, 18], spot: 'bakery_counter', anim: 'shop' }, { time: [18, 21], spot: 'square_west', anim: 'idle' }, { time: [21, 6], hidden: true }],
    talk: [
      { if: { quest: 'c_cache_bridge', status: 'available' }, dialogue: 'B13a' },
      { if: { quest: 's_lina_day', status: 'available' }, dialogue: 'B23a' },
      { if: { quest: 's_lina_day', stage: 'last' }, dialogue: 'B23c' },
      { if: { quest: 'ch8_city', stage: 'shelter' }, dialogue: 'C16' },
      { if: { quest: 'ch8_city', status: 'active', flag: 'C16_DONE' }, bark: ['Пока все не получат воду, я здесь. Хлеб вечером будет холодный.'] },
      { if: { quest: 'prologue_arrival', stage: 'lina', flag: 'A02_LATER' }, dialogue: 'A02b' },
      { if: { quest: 'prologue_arrival', stage: 'lina' }, dialogue: 'A02' },
      { if: { quest: 'first_delivery', stage: 'back' }, dialogue: 'A03:back' },
      { if: { quest: 'ch2_bernard', stage: 'lina' }, dialogue: 'A13' },
      { dialogue: 'lina_shop' },
    ],
  },
  {
    id: 'garret', name: 'Гаррет', title: 'Кузнец',
    model: M(['King_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet'], { Hair_White: 0x2a1a12, Beige: 0x8a5a3a, LightBlue: 0x3a2a1e, 'Worker_Legs:Brown': 0x3a3028, 'Worker_Legs:Brown2': 0x2a2420 }, { hide: { King_Head: ['Gold'] }, scale: 0.98 }),
    look: { skin: 0xe8b890, hair: 0x2a1a12, hairStyle: 'bald', beard: true, top: 0x8a5a3a, sleeves: 'short', apron: 0x3a2a1e, bottom: 0x3a3028, build: 1.25, height: 1.06 },
    schedule: [{ time: [0, 24], spot: 'pump_garret', anim: 'work', if: { any: [{ quest: 'ch8_city', stage: 'pump_talk' }, { quest: 'ch8_city', stage: 'pump_key' }, { quest: 'ch8_city', stage: 'p17_shield' }, { quest: 'ch8_city', stage: 'p17_hold' }, { quest: 'ch8_city', stage: 'p17_flow' }, { quest: 'ch8_city', stage: 'pump_out' }] } }, { time: [7, 19], spot: 'forge_anvil', anim: 'work' }, { time: [19, 22], spot: 'tavern_bar_front', anim: 'idle' }, NIGHT_HOME],
    talk: [
      { if: { v: 'GARRET_RECORD' }, bark: [clipText('V06_005')] },
      { if: { quest: 's_garret_tag', status: 'available' }, dialogue: 'B16a' },
      { if: { quest: 's_garret_tag', stage: 'report' }, dialogue: 'B16c' },
      { if: { quest: 'ch8_city', stage: 'pump_talk' }, dialogue: 'C17' },
      { if: { quest: 'ch8_city', stage: 'pump_out' }, dialogue: 'C17c' },
      { if: { any: [{ quest: 'ch8_city', stage: 'pump_key' }, { quest: 'ch8_city', stage: 'p17_shield' }, { quest: 'ch8_city', stage: 'p17_hold' }, { quest: 'ch8_city', stage: 'p17_flow' }] }, bark: ['Если снять крышку под напором, поток ударит в лицо. Не торопись.'] },
      { if: { quest: 'first_delivery', stage: 'deliver' }, dialogue: 'A03' },
      { if: { quest: 'ch3_lights', stage: 'garret' }, dialogue: 'A18' },
      { if: { quest: 'ch5_crypt', stage: 'prep', notFlag: 'C00_GARRET' }, dialogue: 'C01' },
      { if: { quest: 'c_ore_for_garret', stage: 'brief' }, dialogue: 'B05a' },
      { if: { quest: 'c_ore_for_garret', stage: 'turnin' }, dialogue: 'B05b' },
      { dialogue: 'garret_main' },
    ],
  },
  {
    id: 'luna', name: 'Луна', title: 'Служащая гильдии',
    model: F(['Suit_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Blond: 0xb07a48, Hair_Brown: 0x8a5a30, LightBrown: 0x2f5a8a, DarkBrown: 0x22304a, Black: 0xf2ead8, LimeGreen: 0x2f3a5a, Red: 0x3a2a2a }),
    look: { skin: 0xffe8d8, hair: 0xa06a3a, hairStyle: 'long', top: 0xf2ead8, vest: 0x2f5a8a, dress: true, dressLong: true, dressColor: 0x2f3a5a, chestShape: true },
    schedule: [{ time: [8, 20], spot: 'guild_counter', anim: 'idle' }, { time: [20, 22], spot: 'tavern_table2', anim: 'sit' }, NIGHT_HOME],
    talk: [
      { if: { quest: 'ainstrey_road', stage: 'luna' }, dialogue: 'D00' },
      { if: { quest: 'ch8_city', stage: 'hq' }, dialogue: 'C15' },
      { if: { quest: 'ch7_gorge', stage: 'luna' }, dialogue: 'C11' },
      { if: { quest: 'join_guild', stage: 'go' }, dialogue: 'A04' },
      { if: { quest: 'join_guild', stage: 'potion' }, bark: ['Регистрационный флакон ждёт тебя у Висс. Принеси его и взнос.'] },
      { if: { quest: 'join_guild', stage: 'register' }, dialogue: 'A06' },
      { if: { quest: 'ch1_name', stage: 'board' }, dialogue: 'A08' },
      { if: { quest: 'ch5_crypt', stage: 'prep', notFlag: 'C00_LAMPS' }, dialogue: 'lamps' },
      { if: { quest: 'ch5_crypt', stage: 'report' }, dialogue: 'C05' },
      { if: { quest: 'ch1_name', stage: 'promote' }, dialogue: 'A09' },
      { if: { quest: 'c_goblin_scouts', stage: 'brief' }, dialogue: 'B03a' },
      { if: { quest: 'c_goblin_scouts', stage: 'report' }, dialogue: 'B03b' },
      { if: { quest: 'c_watchtower', stage: 'brief' }, dialogue: 'B07a' },
      { if: { quest: 'c_watchtower', stage: 'report' }, dialogue: 'B07c' },
      { dialogue: 'luna_main' },
    ],
  },
  {
    id: 'pell', name: 'Пелл', title: 'Кладовщик гильдии',
    model: M(['Casual_Head', 'Casual2_Body', 'Worker_Legs', 'Adventurer_Feet'], { Hair: 0xc89048, LightBrown: 0x6a7a4a }),
    look: { skin: 0xf6d0b0, hair: 0xc89048, hairStyle: 'spiky', top: 0x6a7a4a, apron: 0x8a6a4a, bottom: 0x4a3a2a, hat: 'cap', hatColor: 0x2f5a8a, height: 0.97 },
    schedule: [{ time: [8, 19], spot: 'guild_supplier', anim: 'shop' }, { time: [19, 21], spot: 'guild_table2', anim: 'idle' }, { time: [21, 8], hidden: true }],
    talk: [{ if: { member: true }, dialogue: 'pell_shop' }, { bark: ['Склад только для членов гильдии. Сначала — лицензия у Луны.'] }],
  },
  {
    id: 'doris', name: 'Дорис', title: 'Трактирщица',
    model: F(['Formad_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { 'Formad_Head:Red': 0xa04a2a, LightBrown: 0x8a3a3a, DarkBrown: 0x5a3030, LimeGreen: 0x5a3a3a, 'Formal_Feet:Red': 0x3a2a2a }),
    look: { skin: 0xf6d0b0, hair: 0xa04a2a, hairStyle: 'bun', top: 0x8a3a3a, sleeves: 'short', dress: true, dressLong: true, dressColor: 0x5a3a3a, apron: 0xf0e8d8, build: 1.2, chestShape: true },
    schedule: [{ time: [9, 2], spot: 'tavern_bar', anim: 'idle' }, { time: [2, 9], hidden: true }],
    talk: [{ dialogue: 'doris_main' }],
  },
  {
    id: 'fenrik', name: 'Фенрик', title: 'Бард',
    model: M(['Beach_Head', 'Casual_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Hair: 0xe8d8a0, Purple: 0x6a2a6a, 'Adventurer_Legs:Brown': 0x3a2a4a, 'Adventurer_Legs:Brown2': 0x2a2038 }),
    look: { skin: 0xffe0c8, hair: 0xe8d8a0, hairStyle: 'long', top: 0xe0c080, vest: 0x6a2a6a, bottom: 0x3a2a4a, cape: 0x6a2a6a, hat: 'wide', hatColor: 0x6a2a6a, tallBoots: true },
    schedule: [{ time: [11, 17], spot: 'square_east', anim: 'talk' }, { time: [18, 24], spot: 'tavern_stage', anim: 'dance' }, { time: [0, 11], hidden: true }],
    talk: [
      { if: { quest: 's_fenrik_names', status: 'available' }, dialogue: 'B17a' },
      { if: { quest: 's_fenrik_names', stage: 'verse' }, dialogue: 'B17c' },
      { if: { quest: 'ch2_people', status: 'active', notFlag: 'A10_DONE', hour: [18, 24] }, dialogue: 'A10' },
      { if: { quest: 'ch2_people', status: 'active', notFlag: 'A10_DONE' }, bark: ['Песни вечером, в таверне. Днём я только настраиваюсь.'] },
      { if: { quest: 's_bard_song', stage: 'brief' }, dialogue: 'B09a' },
      { if: { quest: 's_bard_song', stage: 'give' }, dialogue: 'B09b' },
      { if: { quest: 's_bard_song', status: 'available' }, dialogue: 'B09a' },
      { dialogue: 'fenrik_idle' },
    ],
  },
  {
    id: 'wiss', name: 'Висс', title: 'Алхимик',
    model: F(['Witch_Head', 'Witch_Body', 'Witch_Legs', 'Witch_Feet'], { Hair_Black: 0xb8a0d8, Purple: 0x4a3a5e }),
    look: { skin: 0xffe8d8, hair: 0xb8a0d8, hairStyle: 'long', top: 0x5a4a6e, dress: true, dressLong: true, dressColor: 0x4a3a5e, hat: 'witch', hatColor: 0x3a2a4e, chestShape: true },
    schedule: [{ time: [9, 19], spot: 'alchemist_counter', anim: 'shop' }, { time: [19, 21], spot: 'temple_door', anim: 'idle' }, { time: [21, 9], hidden: true }],
    talk: [
      { if: { quest: 's_roxy_water', status: 'available' }, dialogue: 'B14a' },
      { if: { quest: 's_roxy_water', stage: 'back' }, dialogue: 'B14c' },
      { if: { quest: 'join_guild', stage: 'potion' }, dialogue: 'A05' },
      { if: { quest: 'c_herbs', stage: 'brief' }, dialogue: 'B01a' },
      { if: { quest: 'c_herbs', stage: 'turnin' }, dialogue: 'B01b' },
      { if: { quest: 'c_moonflowers', stage: 'brief' }, dialogue: 'B08a' },
      { if: { quest: 'c_moonflowers', stage: 'turnin' }, dialogue: 'B08b' },
      { dialogue: 'wiss_main' },
    ],
  },
  {
    id: 'otto', name: 'Отто', title: 'Торговец',
    model: M(['Adventurer_Head', 'Adventurer_Body', 'Worker_Legs', 'Farmer_Feet'], { Hair: 0x6a3a1a, Green: 0x4c6e5a, LightGreen: 0x8a6a3a }),
    look: { skin: 0xf6d0b0, hair: 0x6a3a1a, hairStyle: 'short', beard: true, top: 0x4c6e5a, vest: 0x8a6a3a, bottom: 0x4a3a2a, build: 1.2 },
    schedule: [{ time: [8, 19], spot: 'store_counter', anim: 'shop' }, { time: [19, 22], spot: 'tavern_table0', anim: 'sit' }, NIGHT_HOME],
    talk: [{ dialogue: 'otto_shop' }],
  },
  {
    id: 'rolf', name: 'Рольф', title: 'Оружейник',
    model: M(['Suit_Head', 'King_Body', 'Worker_Legs', 'Worker_Feet'], { Hair: 0x8a8a90, Blue: 0x5a3a2a }),
    look: { skin: 0xe8b890, hair: 0x8a8a90, hairStyle: 'short', top: 0x5a3a2a, armor: 0x6a5040, bottom: 0x3a3028, build: 1.1 },
    schedule: [{ time: [9, 18], spot: 'weapons_counter', anim: 'shop' }, { time: [18, 22], spot: 'tavern_table3', anim: 'sit' }, NIGHT_HOME],
    talk: [{ dialogue: 'rolf_shop' }],
  },
  {
    id: 'mia', name: 'Мия', title: 'Девочка с площади',
    model: F(['Formad_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { 'Formad_Head:Red': 0xe8789a, LimeGreen: 0xf0a0c0, Gold: 0xffffff }, { scale: 0.64 }),
    look: { skin: 0xffe8d8, hair: 0xe8789a, hairStyle: 'braids', top: 0xf0a0c0, dress: true, dressColor: 0xf0a0c0, stockings: 0xffffff, height: 0.72 },
    schedule: [{ time: [0, 24], spot: 'shelter_mia', anim: 'idle', if: { any: [{ quest: 'ch8_city', stage: 'shelter' }, { quest: 'ch8_city', stage: 'route_res' }, { quest: 'ch8_city', stage: 'route_rep' }, { quest: 'ch8_city', stage: 'pump_talk' }, { quest: 'ch8_city', stage: 'pump_key' }, { quest: 'ch8_city', stage: 'p17_shield' }, { quest: 'ch8_city', stage: 'p17_hold' }, { quest: 'ch8_city', stage: 'p17_flow' }, { quest: 'ch8_city', stage: 'pump_out' }, { quest: 'ch8_city', stage: 'veyr' }, { quest: 'ch8_city', stage: 'deep' }, { quest: 'ch8_city', stage: 'p19_lever' }, { quest: 'ch8_city', stage: 'p19_latch' }, { quest: 'ch8_city', stage: 'p19_breaker' }, { quest: 'ch8_city', stage: 'deep_out' }, { quest: 'ch8_city', stage: 'link' }, { quest: 'ch8_city', stage: 'link_check' }] } }, { time: [9, 18], spot: 'square_west', anim: 'idle' }, { time: [18, 9], hidden: true }],
    talk: [
      { if: { v: 'AXEL_SHELTER' }, bark: [clipText('V06_010')] },
      { if: { quest: 's_lina_day', stage: 'bag' }, dialogue: 'B23b' },
      { if: { quest: 'ch8_city', status: 'active' }, bark: ['Уголёк сегодня сидит в корзине. Сам. Это очень подозрительно.', 'Лина нарисовала линию мелом. Мы за неё не заходим.'] },
      { if: { quest: 'c_lost_cat', stage: 'mia' }, dialogue: 'B02a' },
      { if: { quest: 'c_lost_cat', stage: 'return', flag: 'cat_found' }, dialogue: 'B02c' },
      { if: { quest: 'c_lost_cat', status: 'active' }, bark: ['Уголёк ещё не нашёлся?..', 'Он любит тёплые места и не любит собак.'] },
      { if: { quest: 'c_lost_cat', status: 'none', member: true }, dialogue: 'B02a' },
      { if: { quest: 'c_lost_cat', status: 'none' }, dialogue: 'mia_sad' },
      { dialogue: 'mia_happy' },
    ],
  },
  {
    id: 'clara', name: 'Сестра Клара', title: 'Жрица храма Эрис',
    model: F(['Medieval_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { 'Medieval_Head:Brown': 0x8ab0e0, 'Medieval_Head:DarkBrown': 0x6a90c0, 'Medieval_Head:White': 0xe8d8a0, LimeGreen: 0xf4f0e8, Gold: 0x8ab0e0, 'Formal_Feet:Red': 0xd8c8a8 }),
    look: { skin: 0xffe8d8, hair: 0xe8d8a0, hairStyle: 'long', top: 0xf4f0e8, dress: true, dressLong: true, dressColor: 0xf4f0e8, hat: 'hood', hatColor: 0x8ab0e0, cape: 0x8ab0e0, chestShape: true },
    schedule: (rpg) => (rpg.check({ quest: 'ch5_crypt', stage: 'seal' })
      ? [{ time: [0, 24], spot: 'crypt_door', anim: 'idle' }]
      : [{ time: [7, 21], spot: 'temple_altar', anim: 'idle' }, NIGHT_HOME]),
    talk: [
      { if: { quest: 's_clara_book', status: 'available' }, bark: ['Агата ждёт за архивным столом: поговори с ней.'] },
      { if: { quest: 'ch5_crypt', stage: 'rest' }, bark: ['Водяной знак у шва не потемнел. Отдыхайте. Крипту я открою, когда мы подготовимся.'] },
      { if: { quest: 'ch5_crypt', stage: 'clara' }, dialogue: 'C00' },
      { if: { quest: 'ch5_crypt', stage: 'prep' }, bark: ['Гаррет проверит лестницу. Луна выделит лампы. Нижнюю комнату я прошу осмотреть вас.'] },
      { if: { quest: 'ch5_crypt', stage: 'seal' }, dialogue: 'C02' },
      { if: { quest: 'ch2_people', status: 'active', notFlag: 'A11_DONE' }, dialogue: 'A11' },
      { if: { quest: 'ch4_return', stage: 'clara' }, dialogue: 'A29' },
      { dialogue: 'clara_main' },
    ],
  },
  {
    id: 'tom', name: 'Старый Том', title: 'Отставной искатель',
    model: M(['King_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Green: 0x6a5a4a, LightGreen: 0x5a4a3a, 'Adventurer_Legs:Brown': 0x4a4038 }, { hide: { King_Head: ['Gold'] }, scale: 0.91 }),
    look: { skin: 0xe8b890, hair: 0xd8d8d8, hairStyle: 'short', beard: true, top: 0x6a5a4a, cape: 0x5a4a3a, bottom: 0x4a4038, build: 0.95, height: 0.96 },
    schedule: [{ time: [9, 18], spot: 'tom_bench', anim: 'sit' }, { time: [18, 23], spot: 'guild_table', anim: 'idle' }, { time: [23, 9], hidden: true }],
    talk: [{ dialogue: 'tom_main' }],
  },
  {
    id: 'bran', name: 'Бран', title: 'Инструктор гильдии',
    model: M(['Casual2_Head', 'King_Body', 'King_Legs', 'King_Feet', 'Sword'], { Skin: 0xc89070, Skin_Darker: 0xa87050, Hair: 0x1a1418, Blue: 0x7a3a2a }, { scale: 0.99 }),
    look: { skin: 0xc89070, hair: 0x1a1418, hairStyle: 'short', top: 0x7a3a2a, armor: 0x6a5a4a, bottom: 0x3a3a3a, build: 1.15, height: 1.08, tallBoots: true },
    schedule: [{ time: [7, 20], spot: 'training_field', anim: 'guard' }, { time: [20, 23], spot: 'guild_table', anim: 'idle' }, { time: [23, 7], hidden: true }],
    talk: [
      { if: { quest: 'guild_test', stage: 'bran' }, dialogue: 'A07' },
      { if: { quest: 'guild_test', stage: 'staff' }, bark: [clipText('A07_006')] },
      { if: { quest: 'guild_test', stage: 'bran2' }, dialogue: 'A07:signal' },
      { if: { quest: 'guild_test', stage: 'magic' }, bark: ['Рука наверху. Начинай, когда готова. Цель — центр поля.'] },
      { if: { quest: 'guild_test', stage: 'report' }, dialogue: 'A07:report' },
      { if: { quest: 'cb01_breach', stage: 'talk' }, dialogue: 'CB01' },
      { if: { quest: 'cb01_breach', stage: 'report' }, dialogue: 'CB01_done' },
      { if: { quest: 'cb01_breach', status: 'active' }, bark: ['Полоса от посоха вперёд. Дай ей время: мишени сами не побегут. Крайние стойки оставь.'] },
      { dialogue: 'bran_idle' },
    ],
  },
  {
    id: 'tobias', name: 'Тобиас', title: 'Странствующий торговец',
    model: M(['Casual_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet', 'Backpack'], { Hair: 0x6a3a1a, 'Adventurer_Body:Green': 0x5a8a5a }),
    look: { skin: 0xf6d0b0, hair: 0x6a3a1a, hairStyle: 'short', top: 0x5a8a5a, vest: 0x8a6a3a, bottom: 0x4a3a2a, hat: 'cap', hatColor: 0x5a8a5a, bag: 0x7a5232 },
    schedule: (rpg) => (rpg.check({ quest: 'ch6_relay', status: 'active' }) && !rpg.check({ any: [{ quest: 'ch6_relay', stage: 'tobias' }] })
      ? [{ time: [0, 24], spot: 'relay_tobias', anim: 'idle' }]
      : rpg.check({ any: [{ quest: 'c_escort_tobias', status: 'done' }, { quest: 'c_escort_tobias', stage: 'pay' }] })
        ? [{ time: [7, 21], spot: 'olkhovka_tobias', anim: 'idle' }, { time: [21, 7], hidden: true }]
        : [{ time: [8, 20], spot: 'tobias_wait', anim: 'idle' }, { time: [20, 8], hidden: true }]),
    talk: [
      { if: { v: 'TOBIAS_ROAD' }, bark: [clipText('V06_007')] },
      { if: { quest: 's_tobias_road', status: 'available' }, dialogue: 'B22a' },
      { if: { quest: 's_tobias_road', stage: 'report' }, dialogue: 'B22c' },
      { if: { quest: 'ch6_relay', stage: 'tobias' }, dialogue: 'C06' },
      { if: { quest: 'ch6_relay', status: 'active' }, bark: ['Дорогу знаю, внутрь не пойду. Жду у ворот.', 'Если Дан и Оса выйдут, я отведу их к лошадям.'] },
      { if: { quest: 'c_escort_tobias', stage: 'meet' }, dialogue: 'B06a' },
      { if: { quest: 'c_escort_tobias', stage: 'escort' }, bark: ['Идём, идём! Только не слишком быстро…'] },
      { if: { quest: 'c_escort_tobias', stage: 'pay' }, dialogue: 'B06c' },
      { if: { quest: 'c_escort_tobias', status: 'available' }, dialogue: 'tobias_offer' },
      { if: { quest: 'c_escort_tobias', status: 'done' }, dialogue: 'tobias_idle' },
      { bark: ['Мне бы попутчика до Ольховки… Покрепче, с лицензией.'] },
    ],
  },
  {
    id: 'anna', name: 'Анна', title: 'Горожанка',
    model: F(['Soldier_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Brown: 0x3a2418, LimeGreen: 0x8ab0a0, Gold: 0xd8a0a0 }),
    look: { skin: 0xf6d0b0, hair: 0x3a2418, hairStyle: 'bun', top: 0x8ab0a0, dress: true, dressLong: true, dressColor: 0x5a6a5a, hat: 'scarf', hatColor: 0xd8a0a0, chestShape: true },
    schedule: [{ time: [8, 12], spot: 'market_fruit', anim: 'idle' }, { time: [12, 17], spot: 'well', anim: 'idle' }, { time: [17, 21], spot: 'tavern_table3', anim: 'sit' }, { time: [21, 8], hidden: true }],
    barks: (rpg) => [
      'Яблоки у Отто опять подорожали. Грабёж!',
      rpg.state.flags.guild_member ? 'Ты из гильдии? Говорят, новенькие опять что-то взорвали за воротами.' : 'Новенькая? Добро пожаловать в Аксель. Тут все когда-то были новенькими.',
      'Лина печёт лучший хлеб в городе. Только не говори это пекарю из Ольховки.',
    ],
  },
  {
    id: 'karl', name: 'Карл', title: 'Носильщик',
    model: M(['Casual2_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet', 'Backpack'], { Skin: 0xc89070, Skin_Darker: 0xa87050, Hair: 0x1a1418, Beige: 0xa08a6a, LightBlue: 0x5a4a3a }),
    look: { skin: 0xc89070, hair: 0x1a1418, hairStyle: 'short', top: 0xa08a6a, sleeves: 'short', bottom: 0x4a4038, build: 1.15, bag: 0x7a5232 },
    schedule: [{ time: [7, 12], spot: 'store_front', anim: 'work' }, { time: [12, 16], spot: 'forge_front', anim: 'idle' }, { time: [16, 20], spot: 'square_east', anim: 'idle' }, { time: [20, 7], hidden: true }],
    barks: ['Ящики сами себя не перенесут…', 'Караваны с востока задерживаются — перевал завалило. Работы меньше.', 'Если ищешь работу — доска в гильдии. Я туда не хожу: я не по монстрам, я по ящикам.'],
  },
  {
    id: 'greta', name: 'Бабушка Грета', title: 'Старожил',
    model: F(['Suit_Head', 'Witch_Body', 'Witch_Legs', 'Witch_Feet'], { Hair_Blond: 0xe0e0e0, Hair_Brown: 0xc8c8c8, Purple: 0x6a5a7a, Gold: 0x8a6a8a }, { scale: 0.86 }),
    look: { skin: 0xf6d0b0, hair: 0xe0e0e0, hairStyle: 'bun', top: 0x7a6a8a, dress: true, dressLong: true, dressColor: 0x4a3a4a, hat: 'scarf', hatColor: 0x8a6a8a, height: 0.9 },
    schedule: [{ time: [9, 17], spot: 'house_6', anim: 'idle' }, { time: [17, 9], hidden: true }],
    barks: (rpg) => [
      'В моё время звёзды падали только в сказках, деточка.',
      rpg.state.flags.mia_kind ? 'Ты — та добрая девочка, что вернула Мие кота. Хорошая душа.' : 'Внучка соседки опять плачет. Котёнок у неё пропал, что ли…',
      'Не ходи ночью к старой шахте. Там шахтёры пропали лет тридцать назад.',
    ],
  },
  // ------------------------------------------------------------------ countryside
  {
    id: 'boris', name: 'Борис', title: 'Фермер',
    model: M(['Farmer_Head', 'Farmer_Body', 'Farmer_Pants', 'Farmer_Feet']),
    look: { skin: 0xe8b890, hair: 0x8a5a2a, hairStyle: 'short', beard: true, top: 0xa0b060, sleeves: 'short', bottom: 0x5a4a3a, hat: 'wide', hatColor: 0xd8b060, build: 1.15 },
    schedule: [{ time: [6, 12], spot: 'field_0', anim: 'work' }, { time: [12, 13], spot: 'farmhouse', anim: 'idle' }, { time: [13, 19], spot: 'field_2', anim: 'work' }, { time: [19, 6], hidden: true }],
    talk: [
      { if: { v: 'BORIS_GATE' }, bark: [clipText('V06_004')] },
      { if: { quest: 'c_night_raid', status: 'available' }, dialogue: 'B10a' },
      { if: { quest: 'c_night_raid', stage: 'after' }, dialogue: 'B10b' },
      { if: { quest: 'c_night_raid', status: 'active' }, bark: ['Ночью выйду с лампой на поле. Что надо — расскажи.', 'Телеги и фонарь — всё, что я могу. Остальное за тобой.'] },
      { if: { quest: 'c_cache_pond', status: 'available' }, dialogue: 'B13c' },
      { if: { quest: 's_boris_gate', status: 'available' }, dialogue: 'B18a' },
      { if: { quest: 's_boris_gate', stage: 'report' }, dialogue: 'B18c' },
      { if: { quest: 'c_lost_cat', stage: 'search' }, dialogue: 'B02b:boris' },
      { if: { quest: 'c_mushroom_field', stage: 'brief' }, dialogue: 'B04a' },
      { if: { quest: 'c_mushroom_field', stage: 'report' }, dialogue: 'B04b' },
      { dialogue: 'boris_main' },
    ],
  },
  {
    id: 'rann', name: 'Ранн', title: 'Охотник',
    model: M(['Adventurer_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Skin: 0xc89070, Hair: 0x3a2418, Green: 0x3a4a2a, LightGreen: 0x4a5a3a, 'Adventurer_Legs:Brown': 0x3a3a2a }),
    look: { skin: 0xc89070, hair: 0x3a2418, hairStyle: 'short', top: 0x4a5a3a, vest: 0x6a5040, bottom: 0x3a3a2a, hat: 'hood', hatColor: 0x3a4a2a, cape: 0x3a4a2a, tallBoots: true },
    schedule: [{ time: [6, 20], spot: 'hunter_rann', anim: 'idle' }, { time: [20, 6], spot: 'hunters_fire', anim: 'sit', seat: 0.12 }],
    talk: [
      { if: { v: 'RANN_NESTS' }, bark: [clipText('V06_003')] },
      { if: { quest: 'c_cache_oak', status: 'available' }, dialogue: 'B13b' },
      { if: { quest: 's_rann_nests', status: 'available' }, dialogue: 'B19a' },
      { if: { quest: 's_rann_nests', stage: 'report' }, dialogue: 'B19c' },
      { if: { quest: 'ch3_lights', stage: 'rann' }, dialogue: 'A15' },
      { dialogue: 'rann_main' },
    ],
  },
  {
    id: 'helga', name: 'Хельга', title: 'Хозяйка постоялого двора',
    model: F(['Casual_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Blond: 0xc89048, Hair_Brown: 0xa06a30, LightBrown: 0x4a8a5a, DarkBrown: 0x2f4a30, LimeGreen: 0x3a5a3a }),
    look: { skin: 0xf6d0b0, hair: 0xc89048, hairStyle: 'braids', top: 0x4a8a5a, dress: true, dressLong: true, dressColor: 0x3a5a3a, apron: 0xf0e8d8, build: 1.1, chestShape: true },
    schedule: [{ time: [7, 23], spot: 'olkhovka_inn', anim: 'shop' }, { time: [23, 7], hidden: true }],
    talk: [{ dialogue: 'helga_main' }],
  },
  {
    id: 'edmund', name: 'Эдмунд', title: 'Учёный-астроном',
    body: 'astrey', bodyHeight: 1.8, // the user's Mixamo character (model/characters/Astrey); the modular body below is the fallback
    model: M(['King_Head', 'King_Body', 'Casual2_Legs', 'Adventurer_Feet'], { Blue: 0x2a3a6a, Metal: 0x3a4a7a, Metal_Dark: 0x2a3456, Beige: 0xd8c890, LightBlue: 0x2a3a6a }, { hide: { King_Head: ['Gold'] }, scale: 0.93 }),
    look: { skin: 0xf6d0b0, hair: 0xe8e8e8, hairStyle: 'short', beard: true, top: 0x3a4a7a, dress: true, dressLong: true, dressColor: 0x2a3a6a, cape: 0x2a3a6a, height: 0.97 },
    schedule: [{ time: [20, 2], spot: 'olkhovka_green', anim: 'magic' }, { time: [8, 20], spot: 'scholar', anim: 'idle' }, { time: [2, 8], hidden: true }],
    talk: [
      { if: { quest: 'ainstrey_road', stage: 'edmund' }, dialogue: 'D02' },
      { if: { quest: 's_edmund_team', status: 'available' }, dialogue: 'B20a' },
      { if: { quest: 's_edmund_team', stage: 'sign' }, dialogue: 'B20c' },
      { if: { quest: 'ch3_lights', stage: 'edmund' }, dialogue: 'A17' },
      { if: { quest: 'ch3_lights', stage: 'edmund2' }, dialogue: 'A20' },
      { if: { quest: 'ch4_return', stage: 'camp' }, dialogue: 'A28' },
      { if: { quest: 'ch4_return', stage: 'edmund' }, dialogue: 'A28' },
      { dialogue: 'edmund_main' },
    ],
  },
  {
    id: 'pyotr', name: 'Пётр', title: 'Житель Ольховки',
    model: M(['Casual2_Head', 'Casual2_Body', 'Worker_Legs', 'Farmer_Feet'], { Hair: 0x6a3a1a, LightBrown: 0x8a7a5a }),
    look: { skin: 0xe8b890, hair: 0x6a3a1a, hairStyle: 'short', top: 0x8a7a5a, bottom: 0x4a3a2a, hat: 'cap', hatColor: 0x6a5a3a },
    schedule: [{ time: [7, 20], spot: 'olkhovka_green', anim: 'idle' }, { time: [20, 7], hidden: true }],
    barks: (rpg) => [
      'Перевал завалило — караваны стоят. Хельга говорит, гильдия обещала расчистить. Обещала.',
      'Учёный наш, Эдмунд, всё ночами в небо смотрит. Говорит, звёзды «не на своих местах».',
      rpg.state.flags.olkhovka_route ? 'Спасибо, что Тобиаса довела. Без его тканей мы бы до зимы в старье ходили.' : 'До Акселя — по восточной дороге, через каменный мост.',
    ],
  },
  {
    id: 'ivo', name: 'Иво', title: 'Путник',
    model: M(['Suit_Head', 'Adventurer_Body', 'Worker_Legs', 'Adventurer_Feet', 'Backpack'], { Hair: 0x3a2418, 'Adventurer_Body:Green': 0x7a6a5a, 'Adventurer_Body:LightGreen': 0x5a6a7a }),
    look: { skin: 0xf6d0b0, hair: 0x3a2418, hairStyle: 'short', top: 0x7a6a5a, cape: 0x5a6a7a, bottom: 0x4a4038, bag: 0x6a4a30 },
    appear: [{ flag: 'event_traveler' }, { notFlag: 'traveler_helped' }],
    schedule: [{ time: [0, 24], spot: 'injured_traveler', anim: 'sit', seat: 0.12 }],
    talk: [{ if: { flag: 'ivo_bandaged' }, dialogue: 'B11b' }, { dialogue: 'B11a' }],
  },
  {
    id: 'caravan_trader', name: 'Сайрус', title: 'Странствующий торговец',
    model: M(['Adventurer_Head', 'King_Body', 'Adventurer_Legs', 'Farmer_Feet'], { Skin: 0xc89070, Hair: 0x1a1418, Blue: 0xa04a3a, Metal: 0xd8b060, Metal_Dark: 0x8a5a2a, Beige: 0xe0c080, 'Adventurer_Legs:Brown': 0x3a2a4a }),
    look: { skin: 0xc89070, hair: 0x1a1418, hairStyle: 'short', beard: true, top: 0xa04a3a, vest: 0xd8b060, bottom: 0x3a2a4a, hat: 'wide', hatColor: 0x8a3a2a, cape: 0xd8b060 },
    appear: { flag: 'event_caravan' },
    schedule: [{ time: [0, 24], spot: 'caravan_trader', anim: 'idle' }],
    talk: [
      { if: { flag: 'B12_DONE' }, bark: [clipText('V06_002')] },
      { if: { flag: 'B12_READY', notFlag: 'B12_DONE' }, dialogue: 'B12b' },
      { if: { item: 'astra_token', notFlag: 'B12_ASKED' }, dialogue: 'B12a' },
      { dialogue: 'trader_main' },
    ],
  },
  // ------------------------------------------------------------------ Kharz (chapter 7): the archdemon of the gorge, bound by a treaty
  {
    id: 'kharz', name: 'Харз', title: 'Хозяин участка ущелья',
    appear: [{ not: { flag: 'kharz_hostile' } }, { any: [{ quest: 'ch7_gorge', status: 'active' }, { quest: 'ch7_gorge', status: 'done' }] }],
    model: M(['Casual2_Head', 'King_Body', 'King_Legs', 'King_Feet'], { Skin: 0x9a2a2a, Skin_Darker: 0x7a1a1a, Hair: 0x1a0a0a, Blue: 0x3a1418 }, { scale: 1.3 }),
    look: { skin: 0x9a2a2a, hair: 0x1a0a0a, hairStyle: 'bald', top: 0x3a1418, build: 1.2 },
    schedule: [{ time: [0, 24], spot: 'drain_kharz', anim: 'idle' }],
    talk: [
      { if: { quest: 'ch7_gorge', stage: 'kharz' }, dialogue: 'C13' },
      { if: { quest: 'ch7_gorge', stage: 'decide' }, dialogue: 'C14' },
      { bark: ['Договор лежит на панели. Читайте, пока работаете.', 'Без отвода ни один из нас не получит желаемого.', 'Пока Марта едет по дороге, она в безопасности.'] },
    ],
  },
  // ------------------------------------------------------------------ the workers of the relay post (chapter 6)
  {
    id: 'dan', name: 'Дан', title: 'Рабочий поста',
    model: M(['Casual2_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet'], { Skin: 0xc89070, Skin_Darker: 0xa87050, Hair: 0x2a1a12, Beige: 0x8a7a5a, LightBlue: 0x5a4a3a }),
    look: { skin: 0xc89070, hair: 0x2a1a12, hairStyle: 'short', top: 0x8a7a5a, sleeves: 'short', bottom: 0x4a4038 },
    schedule: (rpg) => (rpg.check({ any: [{ quest: 'ch8_city', stage: 'deep' }, { quest: 'ch8_city', stage: 'p19_lever' }, { quest: 'ch8_city', stage: 'p19_latch' }, { quest: 'ch8_city', stage: 'p19_breaker' }, { quest: 'ch8_city', stage: 'deep_out' }] }) ? [{ time: [0, 24], spot: 'deep_dan', anim: 'idle' }] : rpg.check({ quest: 'ch8_city', status: 'active' }) && !rpg.check({ quest: 'ch8_city', stage: 'hq' }) && rpg.check({ flag: 'relay_workers_out' }) ? [{ time: [0, 24], hidden: true }] : rpg.check({ any: [{ quest: 'ch6_relay', stage: 'dan' }, { quest: 'ch6_relay', stage: 'p_dan' }, { quest: 'ch6_relay', stage: 'p_osa' }, { quest: 'ch6_relay', stage: 'p_guard' }, { quest: 'ch6_relay', stage: 'out' }] })
      ? [{ time: [0, 24], spot: 'relay_dan', anim: 'idle' }]
      : rpg.check({ flag: 'relay_workers_out' }) ? [{ time: [0, 24], spot: 'relay_dan_out', anim: 'idle' }] : [{ time: [0, 24], hidden: true }]),
    talk: [
      { if: { quest: 'ch8_city', stage: 'deep' }, dialogue: 'C19' },
      { if: { quest: 'ch8_city', stage: 'deep_out' }, dialogue: 'C19b' },
      { if: { any: [{ quest: 'ch8_city', stage: 'p19_lever' }, { quest: 'ch8_city', stage: 'p19_latch' }, { quest: 'ch8_city', stage: 'p19_breaker' }] }, bark: ['Лестницу держу. Решётка закрывается сама.'] },
      { if: { quest: 'ch6_relay', stage: 'dan' }, dialogue: 'C07' },
      { if: { quest: 'ch6_relay', stage: 'out' }, dialogue: 'C07b' },
      { if: { quest: 'ch6_relay', status: 'active', flag: 'relay_workers_out' }, bark: ['Спасибо. Нога болит, но идти могу.', 'Панель в архиве читает наш пропуск. Берите документы, пока они сухие.'] },
      { bark: ['Не поднимайтесь по лестнице: страж её видит.', 'Защёлка наверху. Мы туда не достаём.'] },
    ],
  },
  {
    id: 'osa', name: 'Оса', title: 'Рабочая поста',
    model: F(['Soldier_Head', 'Adventurer_Body', 'Medieval_Legs', 'Adventurer_Feet'], { Hair_Brown: 0x6a2a1a, 'Adventurer_Body:Green': 0x6a6a4a, 'Adventurer_Body:LightGreen': 0x4a4a38, Black: 0x3a3428 }),
    look: { skin: 0xe8c8a8, hair: 0x6a2a1a, hairStyle: 'ponytail', top: 0x6a6a4a, vest: 0x4a4a38, bottom: 0x3a3428 },
    schedule: (rpg) => (rpg.check({ any: [{ quest: 'ch8_city', stage: 'deep' }, { quest: 'ch8_city', stage: 'p19_lever' }, { quest: 'ch8_city', stage: 'p19_latch' }, { quest: 'ch8_city', stage: 'p19_breaker' }, { quest: 'ch8_city', stage: 'deep_out' }] }) ? [{ time: [0, 24], spot: 'deep_osa', anim: 'idle' }] : rpg.check({ quest: 'ch8_city', status: 'active' }) && !rpg.check({ quest: 'ch8_city', stage: 'hq' }) && rpg.check({ flag: 'relay_workers_out' }) ? [{ time: [0, 24], hidden: true }] : rpg.check({ any: [{ quest: 'ch6_relay', stage: 'dan' }, { quest: 'ch6_relay', stage: 'p_dan' }, { quest: 'ch6_relay', stage: 'p_osa' }, { quest: 'ch6_relay', stage: 'p_guard' }, { quest: 'ch6_relay', stage: 'out' }] })
      ? [{ time: [0, 24], spot: 'relay_osa', anim: 'idle' }]
      : rpg.check({ flag: 'relay_workers_out' }) ? [{ time: [0, 24], spot: 'relay_osa_out', anim: 'idle' }] : [{ time: [0, 24], hidden: true }]),
    talk: [
      { if: { quest: 'ch8_city', stage: 'deep' }, dialogue: 'C19' },
      { if: { quest: 'ch8_city', stage: 'deep_out' }, dialogue: 'C19b' },
      { if: { any: [{ quest: 'ch8_city', stage: 'p19_lever' }, { quest: 'ch8_city', stage: 'p19_latch' }, { quest: 'ch8_city', stage: 'p19_breaker' }] }, bark: ['Жду. Решётка закрывается сама, не отпускайте рычаг!'] },
      { if: { quest: 'ch6_relay', stage: 'dan' }, dialogue: 'C07' },
      { if: { quest: 'ch6_relay', stage: 'out' }, dialogue: 'C07b' },
      { if: { quest: 'ch6_relay', status: 'active', flag: 'relay_workers_out' }, bark: ['В архиве список людей, которые работали до нас. Не оставляйте его под водой.'] },
      { bark: ['На боковой площадке держится последний крюк.', 'По одному. Я первая, у Дана болит нога.'] },
    ],
  },
  // ------------------------------------------------------------------ Tera and Agata (side stories B20, B21)
  {
    id: 'tera', name: 'Тера', title: 'Помощница учёного',
    appear: { quest: 'ch6_relay', status: 'done' },
    model: F(['Casual_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Blond: 0x4a3a5a, Hair_Brown: 0x3a2a4a, LightBrown: 0x4a6a8a, DarkBrown: 0x2a3a4a, LimeGreen: 0x3a4a6a }),
    look: { skin: 0xf0d0b8, hair: 0x3a2a4a, hairStyle: 'braids', top: 0x4a6a8a, bottom: 0x3a3a48 },
    schedule: [{ time: [8, 20], spot: 'scholar', anim: 'idle' }, { time: [20, 8], hidden: true }],
    talk: [
      { if: { v: 'EDMUND_TEAM' }, bark: [clipText('V06_008')] },{ bark: ['Журнал сегодня веду я. Эдмунд проверяет, потом поменяемся.', 'Я записываю время и положение. Без этого число ничего не значит.'] }],
  },
  {
    id: 'agata', name: 'Агата', title: 'Свидетельница',
    appear: { quest: 'ch7_gorge', status: 'done' },
    model: F(['Soldier_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Brown: 0x8a7a6a, LimeGreen: 0x5a4a5a, Gold: 0xb0a0b0 }),
    look: { skin: 0xf0d0b8, hair: 0x8a7a6a, hairStyle: 'bun', top: 0x5a4a5a, dress: true, dressColor: 0x5a4a5a },
    schedule: [{ time: [8, 19], spot: 'temple_altar', anim: 'idle' }, { time: [19, 8], hidden: true }],
    talk: [
      { if: { v: 'CLARA_RECORD' }, bark: [clipText('V06_009')] },
      { if: { quest: 's_clara_book', status: 'available' }, dialogue: 'B21a' },
      { if: { quest: 's_clara_book', stage: 'read' }, dialogue: 'B21c' },
      { bark: ['Я принесла письмо того дня. В нём тоже про вёдра.', 'Его имя не сокращайте. Он голосовал, и это тоже правда.'] },
    ],
  },
  // ------------------------------------------------------------------ Roxy (chapter 4)
  {
    id: 'roxy', name: 'Рокси Мигурдия', title: 'Маг воды', special: 'roxy', portrait: 'roxy',
    appear: [{ notFlag: 'roxy_companion' }, { any: [{ quest: 'ch4_astrarium', stage: 'meet' }, { quest: 'roxy_trust', status: 'active' }] }],
    schedule: (rpg) => (rpg.check({ any: [{ quest: 'roxy_trust', stage: 'ritual' }, { quest: 'roxy_trust', stage: 'defend' }, { quest: 'roxy_trust', stage: 'after' }, { quest: 'roxy_trust', stage: 'join' }] })
      ? [{ time: [0, 24], spot: 'astrarium_center', anim: 'idle' }]
      : [{ time: [0, 24], spot: 'roxy_camp', anim: 'idle' }]),
    talk: [
      { if: { quest: 'ch4_astrarium', stage: 'meet' }, dialogue: 'A22' },
      { if: { quest: 'roxy_trust', stage: 'return' }, dialogue: 'A24' },
      { if: { quest: 'roxy_trust', stage: 'repair' }, bark: ['Рычаг у стены. Я скажу, где остановиться.'] },
      { if: { quest: 'roxy_trust', stage: 'prep' }, dialogue: 'A24:join' },
      { if: { quest: 'roxy_trust', stage: 'ritual' }, dialogue: 'A25' },
      { if: { quest: 'roxy_trust', stage: 'defend' }, bark: ['Держу поток. Стражи у линии, не у меня!'] },
      { if: { quest: 'roxy_trust', stage: 'after' }, dialogue: 'A25:after' },
      { if: { quest: 'roxy_trust', stage: 'join' }, dialogue: 'A26' },
      { dialogue: 'roxy_waiting' },
    ],
  },
  // ------------------------------------------------------------------ version 2.0: the people of the capital (ambient, data/citizens.js)
  ...CITIZENS,
];
