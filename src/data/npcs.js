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
const NIGHT_HOME = { time: [22, 6], hidden: true };
const M = (parts, colors = {}, extra = {}) => ({ pack: 'm', parts, colors, ...extra });
const F = (parts, colors = {}, extra = {}) => ({ pack: 'w', parts, colors, ...extra });

export const NPCS = [
  // ------------------------------------------------------------------ the caravan
  {
    id: 'marta', name: 'Марта', title: 'Хозяйка каравана',
    model: F(['Soldier_Head', 'Adventurer_Body', 'Medieval_Legs', 'Adventurer_Feet'], { Hair_Brown: 0x6a3a1a, 'Adventurer_Body:Green': 0x8a6a4a, 'Adventurer_Body:LightGreen': 0x5a4030, Black: 0x4a3a2a }),
    look: { skin: 0xe8b890, hair: 0x6a3a1a, hairStyle: 'bun', top: 0x8a6a4a, vest: 0x5a4030, bottom: 0x4a3a2a, hat: 'wide', hatColor: 0x7a5a3a, build: 1.05, chestShape: true },
    schedule: [{ time: [6, 12], spot: 'caravan_master', anim: 'idle' }, { time: [12, 17], spot: 'caravan_office_desk', anim: 'sit', seat: 0.5 }, { time: [17, 21], spot: 'caravan_master', anim: 'idle' }, { time: [21, 24], spot: 'tavern_table4', anim: 'sit' }, NIGHT_HOME],
    talk: [{ if: { quest: 'prologue_arrival', stage: 'marta' }, dialogue: 'marta_arrival' }, { dialogue: 'marta_idle' }],
  },
  // ------------------------------------------------------------------ Axel
  {
    id: 'bernard', name: 'Бернард', title: 'Стражник южных ворот',
    model: M(['Casual2_Head', 'King_Body', 'King_Legs', 'King_Feet', 'Sword'], { Hair: 0x6a3a1a, Blue: 0x2f4f8a }),
    look: { skin: 0xf6d0b0, hair: 0x6a3a1a, hairStyle: 'short', top: 0x3a5a8a, bottom: 0x3a3a48, armor: 0x9aa0a8, hat: 'helmet', hatColor: 0x9aa0a8, build: 1.1, height: 1.05 },
    schedule: [
      { time: [21, 24], spot: 'gate_north', anim: 'guard', if: { quest: 'ch2_people', status: 'active' } },
      { time: [6, 21], spot: 'gate_south', anim: 'guard' },
      { time: [21, 23], spot: 'tavern_table1', anim: 'sit' },
      { time: [23, 6], hidden: true },
    ],
    talk: [
      { if: { quest: 'prologue_arrival', stage: 'gate' }, dialogue: 'bernard_gate' },
      { if: { quest: 'c_lost_cat', stage: 'ask' }, dialogue: 'bernard_cat' },
      { if: { quest: 'ch2_people', stage: 'bernard' }, dialogue: 'bernard_secret' },
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
    schedule: [{ time: [6, 18], spot: 'bakery_counter', anim: 'shop' }, { time: [18, 21], spot: 'square_west', anim: 'idle' }, { time: [21, 6], hidden: true }],
    talk: [
      { if: { quest: 'prologue_arrival', stage: 'lina' }, dialogue: 'lina_intro' },
      { if: { quest: 'first_delivery', stage: 'back' }, dialogue: 'lina_paid' },
      { if: { quest: 'ch2_people', stage: 'lina' }, dialogue: 'lina_bernard' },
      { dialogue: 'lina_shop' },
    ],
  },
  {
    id: 'garret', name: 'Гаррет', title: 'Кузнец',
    model: M(['King_Head', 'Farmer_Body', 'Worker_Legs', 'Worker_Feet'], { Hair_White: 0x2a1a12, Beige: 0x8a5a3a, LightBlue: 0x3a2a1e, 'Worker_Legs:Brown': 0x3a3028, 'Worker_Legs:Brown2': 0x2a2420 }, { hide: { King_Head: ['Gold'] }, scale: 0.98 }),
    look: { skin: 0xe8b890, hair: 0x2a1a12, hairStyle: 'bald', beard: true, top: 0x8a5a3a, sleeves: 'short', apron: 0x3a2a1e, bottom: 0x3a3028, build: 1.25, height: 1.06 },
    schedule: [{ time: [7, 19], spot: 'forge_anvil', anim: 'work' }, { time: [19, 22], spot: 'tavern_bar_front', anim: 'idle' }, NIGHT_HOME],
    talk: [
      { if: { quest: 'first_delivery', stage: 'deliver' }, dialogue: 'garret_parcel' },
      { if: { quest: 'c_ore_for_garret', stage: 'turnin' }, dialogue: 'garret_ore' },
      { dialogue: 'garret_main' },
    ],
  },
  {
    id: 'luna', name: 'Луна', title: 'Служащая гильдии',
    model: F(['Suit_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Blond: 0xb07a48, Hair_Brown: 0x8a5a30, LightBrown: 0x2f5a8a, DarkBrown: 0x22304a, Black: 0xf2ead8, LimeGreen: 0x2f3a5a, Red: 0x3a2a2a }),
    look: { skin: 0xffe8d8, hair: 0xa06a3a, hairStyle: 'long', top: 0xf2ead8, vest: 0x2f5a8a, dress: true, dressLong: true, dressColor: 0x2f3a5a, chestShape: true },
    schedule: [{ time: [8, 20], spot: 'guild_counter', anim: 'idle' }, { time: [20, 22], spot: 'tavern_table2', anim: 'sit' }, NIGHT_HOME],
    talk: [
      { if: { quest: 'join_guild', stage: 'go' }, dialogue: 'luna_join' },
      { if: { quest: 'join_guild', stage: 'potion' }, dialogue: 'luna_wait_potion' },
      { if: { quest: 'join_guild', stage: 'register' }, dialogue: 'luna_register' },
      { if: { quest: 'c_goblin_scouts', stage: 'report' }, dialogue: 'luna_scouts' },
      { if: { quest: 'c_watchtower', stage: 'report' }, dialogue: 'luna_tower' },
      { if: { quest: 'ch1_name', stage: 'promote' }, dialogue: 'luna_promote' },
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
      { if: { quest: 'ch2_people', stage: 'fenrik', hour: [18, 24] }, dialogue: 'fenrik_song' },
      { if: { quest: 'ch2_people', stage: 'fenrik' }, bark: ['Песни — вечером, в таверне! Днём я только настраиваюсь.'] },
      { if: { quest: 's_bard_song', stage: 'give' }, dialogue: 'fenrik_ballad' },
      { dialogue: 'fenrik_idle' },
    ],
  },
  {
    id: 'wiss', name: 'Висс', title: 'Алхимик',
    model: F(['Witch_Head', 'Witch_Body', 'Witch_Legs', 'Witch_Feet'], { Hair_Black: 0xb8a0d8, Purple: 0x4a3a5e }),
    look: { skin: 0xffe8d8, hair: 0xb8a0d8, hairStyle: 'long', top: 0x5a4a6e, dress: true, dressLong: true, dressColor: 0x4a3a5e, hat: 'witch', hatColor: 0x3a2a4e, chestShape: true },
    schedule: [{ time: [9, 19], spot: 'alchemist_counter', anim: 'shop' }, { time: [19, 21], spot: 'temple_door', anim: 'idle' }, { time: [21, 9], hidden: true }],
    talk: [
      { if: { quest: 'c_herbs', stage: 'turnin' }, dialogue: 'wiss_herbs' },
      { if: { quest: 'c_moonflowers', stage: 'turnin' }, dialogue: 'wiss_moon' },
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
    schedule: [{ time: [9, 18], spot: 'square_west', anim: 'idle' }, { time: [18, 9], hidden: true }],
    talk: [
      { if: { quest: 'c_lost_cat', stage: 'mia' }, dialogue: 'mia_cat' },
      { if: { quest: 'c_lost_cat', stage: 'return', flag: 'cat_found' }, dialogue: 'mia_return' },
      { if: { quest: 'c_lost_cat', status: 'active' }, bark: ['Уголёк ещё не нашёлся?..', 'Он любит тёплые места и не любит собак.'] },
      { if: { quest: 'c_lost_cat', status: 'none' }, dialogue: 'mia_sad' },
      { dialogue: 'mia_happy' },
    ],
  },
  {
    id: 'clara', name: 'Сестра Клара', title: 'Жрица храма Эрис',
    model: F(['Medieval_Head', 'Formal_Body', 'Formal_Legs', 'Formal_Feet'], { 'Medieval_Head:Brown': 0x8ab0e0, 'Medieval_Head:DarkBrown': 0x6a90c0, 'Medieval_Head:White': 0xe8d8a0, LimeGreen: 0xf4f0e8, Gold: 0x8ab0e0, 'Formal_Feet:Red': 0xd8c8a8 }),
    look: { skin: 0xffe8d8, hair: 0xe8d8a0, hairStyle: 'long', top: 0xf4f0e8, dress: true, dressLong: true, dressColor: 0xf4f0e8, hat: 'hood', hatColor: 0x8ab0e0, cape: 0x8ab0e0, chestShape: true },
    schedule: [{ time: [7, 21], spot: 'temple_altar', anim: 'idle' }, NIGHT_HOME],
    talk: [
      { if: { quest: 'ch2_people', stage: 'clara' }, dialogue: 'clara_legend' },
      { if: { quest: 'ch5_voices', stage: 'clara' }, dialogue: 'clara_crypt' },
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
      { if: { quest: 'guild_test', stage: 'bran' }, dialogue: 'bran_start' },
      { if: { quest: 'guild_test', stage: 'report' }, dialogue: 'bran_done' },
      { if: { quest: 'guild_test', status: 'active' }, bark: ['Не отвлекайся! Сначала — посох, потом — магия.'] },
      { dialogue: 'bran_idle' },
    ],
  },
  {
    id: 'tobias', name: 'Тобиас', title: 'Странствующий торговец',
    model: M(['Casual_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet', 'Backpack'], { Hair: 0x6a3a1a, 'Adventurer_Body:Green': 0x5a8a5a }),
    look: { skin: 0xf6d0b0, hair: 0x6a3a1a, hairStyle: 'short', top: 0x5a8a5a, vest: 0x8a6a3a, bottom: 0x4a3a2a, hat: 'cap', hatColor: 0x5a8a5a, bag: 0x7a5232 },
    schedule: (rpg) => (rpg.check({ any: [{ quest: 'c_escort_tobias', status: 'done' }, { quest: 'c_escort_tobias', stage: 'pay' }] })
      ? [{ time: [7, 21], spot: 'olkhovka_tobias', anim: 'idle' }, { time: [21, 7], hidden: true }]
      : [{ time: [8, 20], spot: 'tobias_wait', anim: 'idle' }, { time: [20, 8], hidden: true }]),
    talk: [
      { if: { quest: 'c_escort_tobias', stage: 'meet' }, dialogue: 'tobias_meet' },
      { if: { quest: 'c_escort_tobias', stage: 'escort' }, bark: ['Идём, идём! Только не слишком быстро…'] },
      { if: { quest: 'c_escort_tobias', stage: 'pay' }, dialogue: 'tobias_pay' },
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
      { if: { quest: 'c_mushroom_field', stage: 'report' }, dialogue: 'boris_report' },
      { dialogue: 'boris_main' },
    ],
  },
  {
    id: 'rann', name: 'Ранн', title: 'Охотник',
    model: M(['Adventurer_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Skin: 0xc89070, Hair: 0x3a2418, Green: 0x3a4a2a, LightGreen: 0x4a5a3a, 'Adventurer_Legs:Brown': 0x3a3a2a }),
    look: { skin: 0xc89070, hair: 0x3a2418, hairStyle: 'short', top: 0x4a5a3a, vest: 0x6a5040, bottom: 0x3a3a2a, hat: 'hood', hatColor: 0x3a4a2a, cape: 0x3a4a2a, tallBoots: true },
    schedule: [{ time: [6, 20], spot: 'hunter_rann', anim: 'idle' }, { time: [20, 6], spot: 'hunters_fire', anim: 'sit', seat: 0.12 }],
    talk: [
      { if: { quest: 'ch3_lights', stage: 'rann' }, dialogue: 'rann_lights' },
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
    model: M(['King_Head', 'King_Body', 'Casual2_Legs', 'Adventurer_Feet'], { Blue: 0x2a3a6a, Metal: 0x3a4a7a, Metal_Dark: 0x2a3456, Beige: 0xd8c890, LightBlue: 0x2a3a6a }, { hide: { King_Head: ['Gold'] }, scale: 0.93 }),
    look: { skin: 0xf6d0b0, hair: 0xe8e8e8, hairStyle: 'short', beard: true, top: 0x3a4a7a, dress: true, dressLong: true, dressColor: 0x2a3a6a, cape: 0x2a3a6a, height: 0.97 },
    schedule: [{ time: [20, 2], spot: 'olkhovka_green', anim: 'magic' }, { time: [8, 20], spot: 'scholar', anim: 'idle' }, { time: [2, 8], hidden: true }],
    talk: [
      { if: { quest: 'ch3_lights', stage: 'edmund' }, dialogue: 'edmund_shard' },
      { if: { quest: 'ch3_lights', stage: 'edmund2' }, dialogue: 'edmund_letter' },
      { if: { quest: 'ch5_voices', stage: 'edmund' }, dialogue: 'edmund_rift' },
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
    talk: [{ dialogue: 'ivo_help' }],
  },
  {
    id: 'caravan_trader', name: 'Сайрус', title: 'Странствующий торговец',
    model: M(['Adventurer_Head', 'King_Body', 'Adventurer_Legs', 'Farmer_Feet'], { Skin: 0xc89070, Hair: 0x1a1418, Blue: 0xa04a3a, Metal: 0xd8b060, Metal_Dark: 0x8a5a2a, Beige: 0xe0c080, 'Adventurer_Legs:Brown': 0x3a2a4a }),
    look: { skin: 0xc89070, hair: 0x1a1418, hairStyle: 'short', beard: true, top: 0xa04a3a, vest: 0xd8b060, bottom: 0x3a2a4a, hat: 'wide', hatColor: 0x8a3a2a, cape: 0xd8b060 },
    appear: { flag: 'event_caravan' },
    schedule: [{ time: [0, 24], spot: 'caravan_trader', anim: 'idle' }],
    talk: [{ dialogue: 'trader_main' }],
  },
  // ------------------------------------------------------------------ Roxy (chapter 4)
  {
    id: 'roxy', name: 'Рокси Мигурдия', title: 'Маг воды', special: 'roxy', portrait: 'roxy',
    appear: [{ notFlag: 'roxy_companion' }, { any: [{ quest: 'ch4_astrarium', stage: 'meet' }, { quest: 'roxy_trust', status: 'active' }] }],
    schedule: (rpg) => (rpg.check({ any: [{ quest: 'roxy_trust', stage: 'defend' }, { quest: 'roxy_trust', stage: 'talk' }] })
      ? [{ time: [0, 24], spot: 'astrarium_center', anim: 'idle' }]
      : [{ time: [0, 24], spot: 'roxy_camp', anim: 'idle' }]),
    talk: [
      { if: { quest: 'ch4_astrarium', stage: 'meet' }, dialogue: 'roxy_meet' },
      { if: { quest: 'roxy_trust', stage: 'return' }, dialogue: 'roxy_crystals' },
      { if: { quest: 'roxy_trust', stage: 'talk' }, dialogue: 'roxy_join' },
      { if: { quest: 'roxy_trust', stage: 'defend' }, bark: ['Держи их подальше от круга! Я почти закончила!'] },
      { dialogue: 'roxy_waiting' },
    ],
  },
];
