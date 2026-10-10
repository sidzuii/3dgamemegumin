/**
 * Shops: stock = [itemId, dailyQuantity, condition?]; buys = item kinds the owner accepts.
 * Prices come from the item catalogue unless overridden in `prices`.
 */
export const SHOPS = {
  bakery: {
    name: 'Пекарня Лины', owner: 'lina', buys: ['food'],
    stock: [['bread', 12], ['apple', 12], ['cheese', 6], ['pumpkin_pie', 3]],
  },
  store: {
    name: 'Лавка «Всё для путника»', owner: 'otto', buys: ['material', 'trophy', 'food', 'consumable', 'book'],
    stock: [['hp_potion', 4], ['st_potion', 4], ['scroll_return', 2], ['wood', 8], ['bread', 6], ['book_bestiary', 1], ['book_axel', 1]],
    priceFactor: 1.1,
  },
  alchemist: {
    name: 'Лавка зелий Висс', owner: 'wiss', buys: ['material', 'consumable'], craft: 'alchemy',
    stock: [['hp_potion', 8], ['st_potion', 6], ['mana_potion', 5], ['hp_potion_big', 2, { rank: 'E' }], ['charm_herb', 1], ['herb', 6]],
  },
  weapons: {
    name: 'Оружейная Рольфа', owner: 'rolf', buys: ['weapon', 'accessory', 'trophy'],
    stock: [['staff_ash', 1], ['ring_iron', 2], ['amulet_wind', 1, { rank: 'E' }]],
  },
  forge: {
    name: 'Кузница Гаррета', owner: 'garret', buys: ['material', 'weapon'], craft: 'forge',
    stock: [['iron_ore', 4], ['ring_iron', 1]],
  },
  guild_supply: {
    name: 'Склад гильдии', owner: 'pell', buys: ['material', 'trophy'],
    stock: [['hp_potion', 4], ['mana_potion', 3], ['scroll_return', 3], ['book_bestiary', 1], ['st_potion', 3]],
    priceFactor: 0.9,
  },
  tavern: {
    name: 'Таверна «Кружка и посох»', owner: 'doris', buys: ['food'],
    stock: [['stew', 8], ['bread', 6], ['cheese', 4], ['frog_meat', 4]],
  },
  olkhovka_inn: {
    name: 'Постоялый двор «Ольха»', owner: 'helga', buys: ['material', 'trophy', 'food'],
    stock: [['hp_potion', 4], ['frog_meat', 6], ['leather', 5], ['scroll_return', 2], ['st_potion', 3]],
  },
  hunters: {
    name: 'Обмен у охотников', owner: 'rann', buys: ['material', 'food', 'trophy'],
    stock: [['leather', 6], ['frog_meat', 5], ['wood', 6]],
  },
  caravan: {
    name: 'Повозка странствующего торговца', owner: 'caravan_trader', buys: ['trophy', 'material', 'weapon', 'accessory'],
    stock: [['manatite', 1], ['amulet_moon', 1], ['hp_potion_big', 3], ['mana_potion', 4], ['staff_ash', 1], ['book_aqua', 1]],
    priceFactor: 1.2,
  },
};

/** Crafting recipes: station 'alchemy' (Wiss) or 'forge' (Garret). */
export const RECIPES = [
  { id: 'r_hp', station: 'alchemy', inputs: [['herb', 3]], fee: 5, output: ['hp_potion', 1] },
  { id: 'r_st', station: 'alchemy', inputs: [['herb', 1], ['mushroom_cap', 2]], fee: 5, output: ['st_potion', 1] },
  { id: 'r_mana', station: 'alchemy', inputs: [['moonflower', 1], ['herb', 1]], fee: 10, output: ['mana_potion', 1] },
  { id: 'r_hp_big', station: 'alchemy', inputs: [['herb', 4], ['moonflower', 1]], fee: 20, output: ['hp_potion_big', 1], requires: { rank: 'E' } },
  { id: 'r_charm', station: 'alchemy', inputs: [['herb', 5], ['leather', 1]], fee: 30, output: ['charm_herb', 1] },
  { id: 'r_moon', station: 'alchemy', inputs: [['moonflower', 3], ['iron_ore', 1]], fee: 60, output: ['amulet_moon', 1], requires: { quest: 'c_moonflowers', status: 'done' } },
  { id: 'r_ring', station: 'forge', inputs: [['iron_ore', 2]], fee: 25, output: ['ring_iron', 1] },
  { id: 'r_staff_iron', station: 'forge', inputs: [['iron_ore', 4], ['wood', 2]], fee: 80, output: ['staff_iron', 1], requires: { flag: 'forge_unlocked' } },
  { id: 'r_core_charm', station: 'forge', inputs: [['guardian_core', 1], ['iron_ore', 2]], fee: 60, output: ['ring_crimson', 1], requires: { flag: 'roxy_companion' } },
];
