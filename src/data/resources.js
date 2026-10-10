/**
 * Gathering areas: nodes are scattered deterministically inside a circle (or placed on named
 * spots). respawn = game hours until the node regrows; night = only in bloom at night.
 */
export const RESOURCE_AREAS = [
  // Healing herbs on the meadows around town.
  { id: 'herb_west', item: 'herb', shape: 'herb', x: -86, z: 2, r: 22, count: 7, respawn: 18, amount: [1, 2], seed: 11 },
  { id: 'herb_south', item: 'herb', shape: 'herb', x: 40, z: 84, r: 20, count: 6, respawn: 18, amount: [1, 2], seed: 12 },
  { id: 'herb_river', item: 'herb', shape: 'herb', x: 64, z: -40, r: 14, count: 4, respawn: 18, amount: [1, 2], seed: 13 },
  { id: 'herb_forest', item: 'herb', shape: 'herb', x: -130, z: 20, r: 22, count: 6, respawn: 18, amount: [1, 3], seed: 14 },
  // Moonflowers: the hidden glade and the misty lake shore (night).
  { id: 'moon_glade', item: 'moonflower', shape: 'moon', x: -240, z: -40, r: 9, count: 6, respawn: 30, amount: [1, 1], night: true, seed: 21 },
  { id: 'moon_lake', item: 'moonflower', shape: 'moon', x: 190, z: 236, r: 14, count: 3, respawn: 30, amount: [1, 1], night: true, seed: 22 },
  // Iron ore: the hill around the mine, the watchtower slope, the mine itself, the old mines.
  { id: 'ore_cave', item: 'iron_ore', shape: 'ore', x: -96, z: -112, r: 16, count: 5, respawn: 24, amount: [1, 2], verb: 'Добыть', seed: 31 },
  { id: 'ore_tower', item: 'iron_ore', shape: 'ore', x: 62, z: -118, r: 12, count: 2, respawn: 24, amount: [1, 1], verb: 'Добыть', seed: 32 },
  { id: 'ore_dungeon', item: 'iron_ore', shape: 'ore', spots: ['ore_d0', 'ore_d1', 'ore_d2', 'ore_d3'], count: 4, respawn: 36, amount: [2, 3], verb: 'Добыть', anywhere: true },
  { id: 'ore_mines', item: 'iron_ore', shape: 'ore', x: -285, z: -262, r: 18, count: 4, respawn: 24, amount: [2, 3], verb: 'Добыть', seed: 34 },
  // Deadwood in the forest.
  { id: 'wood_forest', item: 'wood', shape: 'wood', x: -150, z: 40, r: 40, count: 7, respawn: 20, amount: [1, 3], verb: 'Нарубить', seed: 41 },
];
