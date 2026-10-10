import { Frame, house, tree, bush, rock, lamp, stall, barrel, crate, haystack, fence, well, wagon, bench } from './Kit.js';
import { tent, campfire } from './Countryside.js';
import { ROOF_COLORS } from '../KitLibrary.js';

/**
 * Objects placed with the map editor (public/data/placements.json → layout.added).
 * A record: { id, type, x, z, rot, s, dy, ...params }. Each one is built as its own editable
 * group (World.group), so the editor can select, move and delete it like the built-in places.
 */
export const PLACEABLES = {
  house: { label: 'Дом', cat: 'Постройки', scalable: true, defaults: { w: 7, d: 6, floors: 2, roof: 'red', style: 'plaster' } },
  stall: { label: 'Прилавок', cat: 'Постройки', defaults: { color: 'red', goods: 'fruit' } },
  lamp: { label: 'Фонарь', cat: 'Постройки', defaults: {} },
  bench: { label: 'Скамейка', cat: 'Постройки', defaults: {} },
  well: { label: 'Колодец', cat: 'Постройки', defaults: {} },
  wagon: { label: 'Фургон', cat: 'Постройки', defaults: {} },
  fence: { label: 'Забор', cat: 'Постройки', scalable: true, defaults: { len: 8 } },
  tree_oak: { label: 'Дерево (лиственное)', cat: 'Природа', scalable: true, defaults: {} },
  tree_pine: { label: 'Сосна', cat: 'Природа', scalable: true, defaults: {} },
  tree_birch: { label: 'Берёза', cat: 'Природа', scalable: true, defaults: {} },
  tree_dark: { label: 'Тёмное дерево', cat: 'Природа', scalable: true, defaults: {} },
  bush: { label: 'Куст', cat: 'Природа', scalable: true, defaults: {} },
  rock: { label: 'Камень', cat: 'Природа', scalable: true, defaults: {} },
  tent: { label: 'Палатка', cat: 'Лагерь', defaults: {} },
  campfire: { label: 'Костёр', cat: 'Лагерь', defaults: {} },
  barrel: { label: 'Бочка', cat: 'Лагерь', defaults: {} },
  crate: { label: 'Ящик', cat: 'Лагерь', scalable: true, defaults: {} },
  haystack: { label: 'Стог сена', cat: 'Лагерь', scalable: true, defaults: {} },
  kit: { label: 'Модель Kenney', cat: 'Kenney', scalable: true, defaults: { name: 'town/cart' } },
};

/** Real-size scale of a piece of each Kenney kit (1 kit unit = this many metres). */
export const KIT_SCALE = { town: 2.8, castle: 3, survival: 3, food: 0.42, nature: 4, furniture: 2.3, graveyard: 2.2, dungeon: 3 };

export const STALL_COLORS = { red: 0xc83a3a, green: 0x4a9a5a };

export function placeableLabel(a) {
  if (a.type === 'kit') return a.name;
  return PLACEABLES[a.type]?.label || a.type;
}

/** Build one placed object as an editable group. */
export function buildPlacement(W, a) {
  return W.group(a.id, { x: a.x, z: a.z, rot: a.rot || 0 }, (rng) => buildBody(W, a, rng), placeableLabel(a), { added: true, data: a });
}

function buildBody(W, a, rng) {
  const s = a.s ?? 1;
  const y = W.heightAt(a.x, a.z) + (a.dy ?? 0);
  const F = new Frame(W, a.x, y, a.z, a.rot || 0);
  const at = (lx = 0, lz = 0) => F.at(lx, 0, lz);
  switch (a.type) {
    case 'house':
      house(W, { x: a.x, z: a.z, y, rot: a.rot || 0, w: (a.w ?? 7) * s, d: (a.d ?? 6) * s, floors: a.floors ?? 2, roofTint: ROOF_COLORS[a.roof] ?? ROOF_COLORS.red, style: a.style ?? 'plaster', kind: 'house' }, rng);
      break;
    case 'stall': stall(W, a.x, a.z, a.rot || 0, STALL_COLORS[a.color] ?? STALL_COLORS.red, a.goods || 'fruit', rng); break;
    case 'lamp': lamp(W, at(), a.rot || 0); break;
    case 'bench': bench(W, F, 0, 0, 0); break;
    case 'well': well(W, a.x, a.z); break;
    case 'wagon': wagon(W, a.x, a.z, a.rot || 0); break;
    case 'fence': {
      const len = (a.len ?? 8) * s;
      const p0 = F.at(0, 0, -len / 2), p1 = F.at(0, 0, len / 2);
      fence(W, [[p0.x, p0.z], [p1.x, p1.z]]);
      break;
    }
    case 'tree_oak': case 'tree_pine': case 'tree_birch': case 'tree_dark':
      tree(W, a.x, a.z, s, rng, a.type.slice(5));
      break;
    case 'bush': bush(W, a.x, a.z, s, rng); break;
    case 'rock': rock(W, a.x, a.z, s, rng); break;
    case 'tent': tent(W, a.x, a.z, a.rot || 0, 0x7b5a3a); break;
    case 'campfire': campfire(W, a.x, a.z); break;
    case 'barrel': barrel(W, F, 0, 0); break;
    case 'crate': crate(W, F, 0, 0, 0.8 * s, 0); break;
    case 'haystack': haystack(W, a.x, a.z, s); break;
    case 'kit': {
      if (!W.kits.has(a.name)) break;
      const kit = a.name.split('/')[0];
      F.kit(a.name, 0, 0, 0, { s: (KIT_SCALE[kit] ?? 1) * s, collide: a.collide ?? 'box' });
      break;
    }
    default:
      console.warn('[placements] unknown type', a.type);
  }
}
