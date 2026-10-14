/**
 * Item catalogue (single source of truth for names, prices, categories, effects).
 *
 * kind: currency | consumable | food | material | weapon | accessory | book | quest | trophy
 * price: base shop price in eris (shops may override; selling pays SELL_RATE of it).
 * stats (equipment): melee (damage multiplier), maxHp, maxMana, manaRegen (multiplier),
 *   runDrain (stamina multiplier), defense (damage taken multiplier).
 * quest items cannot be sold or dropped.
 */
export const SELL_RATE = 0.4;

export const ITEMS = {
  eris: { name: 'Эрисы', icon: '🪙', kind: 'currency', rarity: 'common', desc: 'Монеты королевства Бельзерг.' },

  // --- consumables ---
  hp_potion: { name: 'Зелье исцеления', icon: '🧪', tint: 'hp', kind: 'consumable', rarity: 'common', price: 25, desc: 'Восстанавливает 60 HP.', use: (g) => g.player.heal(60) },
  hp_potion_big: { name: 'Большое зелье исцеления', icon: '🧪', tint: 'hp', kind: 'consumable', rarity: 'rare', price: 70, desc: 'Восстанавливает 150 HP.', use: (g) => g.player.heal(150) },
  st_potion: { name: 'Эликсир бодрости', icon: '🧪', tint: 'st', kind: 'consumable', rarity: 'common', price: 20, desc: 'Полностью восстанавливает выносливость.', use: (g) => g.player.restoreStamina(100) },
  mana_potion: { name: 'Эликсир маны', icon: '🧪', tint: 'mana', kind: 'consumable', rarity: 'common', price: 35, desc: 'Восстанавливает 50 маны.', use: (g) => g.player.restoreMana(50) },
  manatite: {
    name: 'Манатит', icon: '💎', tint: 'mana', kind: 'consumable', rarity: 'epic', price: 300,
    desc: 'Кристалл, хранящий ману. Мгновенно восполняет ману и сбрасывает перезарядку способности.',
    use: (g) => { g.player.restoreMana(999); for (const k in g.abilities) g.abilities[k].cooldownLeft = 0; },
  },
  scroll_return: {
    name: 'Свиток возвращения', icon: '📜', kind: 'consumable', rarity: 'rare', price: 60,
    desc: 'Переносит на центральную площадь Акселя.',
    use: (g) => g.travel('square'),
  },

  // --- food ---
  bread: { name: 'Свежий хлеб', icon: '🍞', kind: 'food', rarity: 'common', price: 5, desc: 'Из пекарни Лины. +15 HP.', use: (g) => g.player.heal(15) },
  apple: { name: 'Яблоко', icon: '🍎', kind: 'food', rarity: 'common', price: 3, desc: 'Хрустящее. +8 HP.', use: (g) => g.player.heal(8) },
  cheese: { name: 'Сыр', icon: '🧀', kind: 'food', rarity: 'common', price: 8, desc: '+12 HP и немного бодрости.', use: (g) => { g.player.heal(12); g.player.restoreStamina(20); } },
  frog_meat: { name: 'Мясо гигантской жабы', icon: '🍖', kind: 'food', rarity: 'common', price: 12, desc: 'Сочное и питательное. +25 HP.', use: (g) => g.player.heal(25) },
  stew: { name: 'Рагу из таверны', icon: '🍲', kind: 'food', rarity: 'common', price: 15, desc: 'Фирменное блюдо Дорис. +40 HP, полная выносливость.', use: (g) => { g.player.heal(40); g.player.restoreStamina(100); } },
  pumpkin_pie: { name: 'Тыквенный пирог', icon: '🥧', kind: 'food', rarity: 'common', price: 18, desc: 'С фермы Бориса. +35 HP.', use: (g) => g.player.heal(35) },

  // --- materials ---
  herb: { name: 'Лечебная трава', icon: '🌿', kind: 'material', rarity: 'common', price: 4, desc: 'Растёт на лугах. Нужна алхимику.' },
  moonflower: { name: 'Лунный цветок', icon: '🌸', kind: 'material', rarity: 'rare', price: 14, desc: 'Светится в темноте. Растёт в тихих, забытых местах.' },
  iron_ore: { name: 'Железная руда', icon: '🪨', kind: 'material', rarity: 'common', price: 12, desc: 'Тяжёлая. Кузнец знает, что с ней делать.' },
  wood: { name: 'Древесина', icon: '🪵', kind: 'material', rarity: 'common', price: 6, desc: 'Крепкие сухие ветви.' },
  goblin_hood: { name: 'Обрывок капюшона', icon: '🧶', kind: 'material', rarity: 'common', price: 6, desc: 'Трофей с гоблина. Пахнет лесом и чем-то ещё.' },
  mushroom_cap: { name: 'Шляпка гриба', icon: '🍄', kind: 'material', rarity: 'common', price: 5, desc: 'Упругая. Алхимики добавляют её в зелья бодрости.' },
  demon_horn: { name: 'Рог демона', icon: '🦴', kind: 'material', rarity: 'rare', price: 40, desc: 'Ещё тёплый.' },
  leather: { name: 'Выделанная кожа', icon: '🟫', kind: 'material', rarity: 'common', price: 10, desc: 'Охотники выменивают её на зелья.' },
  guardian_core: { name: 'Ядро стража', icon: '🔷', kind: 'material', rarity: 'rare', price: 55, desc: 'Холодный камень, внутри которого ещё теплится магия.' },

  // --- equipment: staffs ---
  staff_apprentice: { name: 'Посох ученицы', icon: '🦯', kind: 'weapon', slot: 'weapon', rarity: 'common', price: 30, stats: { melee: 1 }, desc: 'Верный посох Мегумин с алым камнем.' },
  staff_ash: { name: 'Ясеневый посох', icon: '🦯', kind: 'weapon', slot: 'weapon', rarity: 'common', price: 140, stats: { melee: 1.15, maxMana: 10 }, desc: 'Лёгкий и прочный. Удары посохом +15%, мана +10.' },
  staff_iron: { name: 'Посох с железным навершием', icon: '🦯', kind: 'weapon', slot: 'weapon', rarity: 'rare', price: 260, stats: { melee: 1.32 }, desc: 'Работа Гаррета. Удары посохом +32%.' },
  staff_crimson: { name: 'Посох Алого клана', icon: '🔱', kind: 'weapon', slot: 'weapon', rarity: 'epic', price: 600, stats: { melee: 1.45, manaRegen: 1.3, maxMana: 20 }, desc: 'Удары +45%, мана +20, восстановление маны +30%.' },
  // --- equipment: accessories ---
  ring_crimson: { name: 'Кольцо Алых Демонов', icon: '💍', kind: 'accessory', slot: 'accessory', rarity: 'epic', price: 400, stats: { melee: 1.2 }, desc: 'Урон посохом +20%.' },
  amulet_wind: { name: 'Амулет попутного ветра', icon: '🧿', kind: 'accessory', slot: 'accessory', rarity: 'rare', price: 180, stats: { runDrain: 0.65 }, desc: 'Бег тратит на 35% меньше выносливости.' },
  ring_iron: { name: 'Железное кольцо', icon: '💍', kind: 'accessory', slot: 'accessory', rarity: 'common', price: 90, stats: { defense: 0.9 }, desc: 'Получаемый урон −10%.' },
  charm_herb: { name: 'Травяной оберег', icon: '🍀', kind: 'accessory', slot: 'accessory', rarity: 'common', price: 80, stats: { maxHp: 15 }, desc: 'Макс. HP +15.' },
  amulet_moon: { name: 'Лунный амулет', icon: '🌙', kind: 'accessory', slot: 'accessory', rarity: 'rare', price: 220, stats: { manaRegen: 1.4 }, desc: 'Восстановление маны +40%.' },

  // --- books ---
  book_explosion: {
    name: 'Гримуар Взрывной магии', icon: '📕', kind: 'book', rarity: 'epic', price: 0,
    desc: 'Потрёпанный гримуар с пометками на полях.',
    text: '«Тьма тьмы, глубже самой бездны… Explosion — высшая форма атакующей магии.»\n\nНа полях детским почерком: «Один взрыв в день. Без исключений.»',
  },
  book_aqua: {
    name: 'Дневник «богини»', icon: '📘', kind: 'book', rarity: 'rare', price: 20,
    desc: 'Подписан золотыми блёстками.',
    text: 'День 37. Меня опять назвали бесполезной. Сегодня я очистила целое озеро! Ну… почти. Лягушки меня съели только два раза.\n\nНапоминание: купить ещё шипучки.',
  },
  book_bestiary: {
    name: 'Бестиарий Акселя', icon: '📙', kind: 'book', rarity: 'common', price: 30,
    desc: 'Справочник гильдии искателей приключений.',
    text: 'Гоблин-капюшонник — слаб поодиночке, опасен стаей.\nГриб-переросток — медлителен, но бодается больно. Любит сырость.\nКаменный страж — пробудившаяся охрана древних руин. Медленный, но крепкий.\nДемон — не сбивается лёгкими ударами. Следи за красным кругом под ногами!',
  },
  book_axel: {
    name: 'Краткая история Акселя', icon: '📗', kind: 'book', rarity: 'common', price: 15,
    desc: 'Брошюра из храма Эрис.',
    text: 'Аксель вырос вокруг брода через Лунную реку. Первые поселенцы строили стены от гоблинов, а гильдию основали, когда в окрестностях стало слишком много работы.\n\nК северу, за хребтом, стоят руины Астрариума — обсерватории магов, покинутой задолго до основания города. Говорят, там учились читать звёзды. Говорят также, что однажды звёзды ответили.',
  },
  book_water: {
    name: 'Учебник водной магии', icon: '📘', kind: 'book', rarity: 'rare', price: 0,
    desc: 'Аккуратный почерк Рокси Мигурдии.',
    text: 'Урок 1. Вода не терпит спешки: сначала форма, потом сила.\nУрок 2. «Водяной залп» — пять снарядов, каждый ищет свою цель.\nУрок 3. Если ученик заснул на лекции — облить. Помогает всегда.',
  },

  // --- quest items ---
  parcel_bread: { name: 'Свёрток для кузнеца', icon: '📦', kind: 'quest', rarity: 'common', desc: 'Тёплый, пахнет хлебом. Лина просила отнести Гаррету.' },
  guild_license: { name: 'Лицензия искателя', icon: '🪪', kind: 'quest', rarity: 'rare', desc: 'Карточка гильдии: имя, класс «Архимаг» и ранг.' },
  star_shard: { name: 'Звёздный осколок', icon: '✨', kind: 'quest', rarity: 'epic', desc: 'Холодный и лёгкий, как кусочек ночного неба. Тихо звенит, если поднести к уху.' },
  scout_report: { name: 'Отчёт разведчиков', icon: '📃', kind: 'quest', rarity: 'common', desc: 'Записи гильдии о гоблинах у кромки леса.' },
  sealed_letter: { name: 'Запечатанное письмо', icon: '✉️', kind: 'quest', rarity: 'rare', desc: 'От учёного Эдмунда — «для мага, что изучает руины».' },
  resonance_crystal: { name: 'Резонирующий кристалл', icon: '🔹', kind: 'quest', rarity: 'rare', desc: 'Осколок кристалла из Астрариума. Гудит в такт с осколком звезды.' },
  merchant_goods: { name: 'Товары Тобиаса', icon: '🎁', kind: 'quest', rarity: 'common', desc: 'Тюк с тканями для Ольховки.' },

  // --- trophies (sold for coin) ---
  gem_ruby: { name: 'Алый самоцвет', icon: '♦️', kind: 'trophy', rarity: 'epic', price: 260, desc: 'Сияет как глаза Алых Демонов.' },
  old_coin: { name: 'Старинная монета', icon: '🪙', kind: 'trophy', rarity: 'rare', price: 45, desc: 'Чеканка времён Астрариума. Коллекционеры платят хорошо.' },
};

export const KIND_NAMES = {
  consumable: 'Расходуемое', food: 'Еда', material: 'Материал', weapon: 'Оружие', accessory: 'Аксессуар',
  book: 'Книга', quest: 'Задание', trophy: 'Трофей', currency: 'Валюта',
};
export const RARITY_NAMES = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический' };

/** Sale price in a shop that buys the item (0 = unsellable). */
export function sellPrice(id) {
  const it = ITEMS[id];
  if (!it || it.kind === 'quest' || it.kind === 'currency' || !it.price) return 0;
  return Math.max(1, Math.floor(it.price * SELL_RATE));
}

/** Chest contents by chest id (granted once per save). */
export const CHEST_LOOT = {
  garden_secret: [['eris', 60], ['charm_herb', 1], ['book_aqua', 1]],
  bridge_stash: [['eris', 90], ['old_coin', 2], ['scroll_return', 1]],
  glade: [['moonflower', 3], ['amulet_moon', 1], ['eris', 40]],
  goblin_den: [['eris', 120], ['amulet_wind', 1], ['goblin_hood', 3], ['hp_potion', 2]],
  tower_top: [['eris', 70], ['book_bestiary', 1], ['mana_potion', 2]],
  dungeon_side: [['eris', 80], ['iron_ore', 3], ['hp_potion', 2]],
  dungeon_final: [['eris', 200], ['staff_crimson', 1], ['manatite', 1]],
  mist_lake: [['eris', 150], ['hp_potion_big', 2], ['old_coin', 2]],
  crimson_gorge: [['eris', 300], ['ring_crimson', 1], ['gem_ruby', 1], ['manatite', 1]],
  old_mines: [['eris', 90], ['iron_ore', 4], ['old_coin', 1]],
  astrarium: [['eris', 120], ['mana_potion', 3]],
  hill_oak: [['eris', 35], ['apple', 3], ['old_coin', 1]],
  reed_pond: [['eris', 45], ['frog_meat', 2], ['hp_potion', 1]],
  tar_camp: [['eris', 40], ['wood', 4], ['st_potion', 1]],
};

/** Enemy drops: [item, chance, min, max]. */
export const ENEMY_LOOT = {
  goblin: [['eris', 1, 2, 6], ['goblin_hood', 0.35, 1, 1], ['hp_potion', 0.06, 1, 1]],
  mushroom: [['eris', 1, 3, 8], ['mushroom_cap', 0.45, 1, 1], ['st_potion', 0.08, 1, 1]],
  puglin: [['eris', 1, 3, 7], ['hp_potion', 0.08, 1, 1], ['old_coin', 0.15, 1, 1]],
  skeleton_minion: [['eris', 1, 3, 8], ['old_coin', 0.2, 1, 1], ['hp_potion', 0.06, 1, 1]],
  skeleton_rogue: [['eris', 1, 5, 11], ['old_coin', 0.3, 1, 1], ['st_potion', 0.1, 1, 1]],
  skeleton_warrior: [['eris', 1, 9, 16], ['iron_ore', 0.35, 1, 2], ['old_coin', 0.35, 1, 2], ['hp_potion', 0.12, 1, 1]],
  imp: [['eris', 1, 6, 12], ['demon_horn', 0.25, 1, 1], ['mana_potion', 0.1, 1, 1]],
  guardian: [['eris', 1, 10, 18], ['guardian_core', 0.5, 1, 1], ['old_coin', 0.25, 1, 1]],
  demon: [['eris', 1, 12, 22], ['demon_horn', 0.35, 1, 1], ['hp_potion', 0.2, 1, 1]],
  archdemon: [['eris', 1, 80, 120], ['gem_ruby', 1, 1, 1], ['manatite', 0.5, 1, 1]],
};
