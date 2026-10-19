/**
 * Interiors of Axel's buildings: separate rooms beyond the map edge (inside DUNGEON, floor at y 0), entered through the door of the
 * building with E (game.travel to `<id>_inside`, out to `<id>_outside`). The houses in town are only shells with a shut door.
 * Built by world/build/TownInteriors.js; regions (interior, safe) come from here too (MapData), NPC walk grids per room
 * (NPCManager), quest pointers map a target in a room to the door of its building (World.navPoint).
 *
 *   w × d = the inner floor (m), h = the ceiling, door = x of the door on the front wall (+z), (x, z) = the room's centre.
 */
export const HOUSE_ZONE = { minX: -240, maxX: 240, minZ: 2370, maxZ: 2570 };

export const ROOMS = [
  { id: 'guild', name: 'Гильдия искателей приключений', w: 20, d: 14, h: 6.0, door: 0, x: -175, z: 2420 },
  { id: 'tavern', name: 'Таверна «Кружка и посох»', w: 18, d: 14, h: 4.6, door: 0, x: -115, z: 2420 },
  { id: 'temple', name: 'Храм Эрис', w: 14, d: 24, h: 8.0, door: 0, x: -55, z: 2430 },
  { id: 'bakery', name: 'Пекарня Лины', w: 9.6, d: 7.4, h: 3.5, door: -3.6, x: 5, z: 2420 },
  { id: 'store', name: 'Лавка Отто «Всё для путника»', w: 9.6, d: 7.4, h: 3.5, door: -3.6, x: 55, z: 2420 },
  { id: 'alchemist', name: 'Алхимик', w: 8.8, d: 8.6, h: 3.5, door: -3.2, x: 105, z: 2420 },
  { id: 'weaponsmith', name: 'Оружейник', w: 9.6, d: 7.4, h: 3.5, door: -3.6, x: 155, z: 2420, prefix: 'weapons' },
  { id: 'caravan_office', name: 'Караванная контора', w: 10.4, d: 7.4, h: 3.5, door: -4.0, x: 205, z: 2420 },
];

export const inHouseZone = (x, z) => x > HOUSE_ZONE.minX && x < HOUSE_ZONE.maxX && z > HOUSE_ZONE.minZ && z < HOUSE_ZONE.maxZ;

/** The room containing (x, z) (its floor plus a 1 m margin), or null. */
export function roomAt(x, z) {
  if (!inHouseZone(x, z)) return null;
  return ROOMS.find((r) => Math.abs(x - r.x) < r.w / 2 + 1 && Math.abs(z - r.z) < r.d / 2 + 1) || null;
}
