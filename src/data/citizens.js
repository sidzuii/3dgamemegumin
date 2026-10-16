/**
 * The people of the capital who are not in the story (ambient): they stand and work at the squares and the quay in the daytime and go home at night.
 * A few of them only (the far crowds are limited): bodies of the Quaternius packs, everyday lines instead of conversations. Their spots `ain_cit_<n>`
 * are laid by world/build/AinstreyCity.js from CITIZEN_SPOTS: [square id, du, dv (metres from the square's centre), animation, who].
 * They appear once the road is open (the city is in view of the road before the first visit).
 */
const M = (parts, colors = {}, extra = {}) => ({ pack: 'm', parts, colors, ...extra });
const F = (parts, colors = {}, extra = {}) => ({ pack: 'w', parts, colors, ...extra });

const WHO = [
  { name: 'Горожанин', model: M(['Casual2_Head', 'Casual_Body', 'Worker_Legs', 'Worker_Feet'], { Hair: 0x4a3a2a }), look: { skin: 0xe0b896, hair: 0x4a3a2a, hairStyle: 'short', top: 0x7a6a5a, bottom: 0x4a4a52 } },
  { name: 'Горожанка', model: F(['Casual_Head', 'Medieval_Body', 'Formal_Legs', 'Formal_Feet'], { Hair_Brown: 0x6a4a2a, Hair_Blond: 0x6a4a2a }), look: { skin: 0xf0d0b8, hair: 0x6a4a2a, hairStyle: 'bun', top: 0x8a6a5a, dress: true, dressColor: 0x6a5a7a } },
  { name: 'Торговец', model: M(['Farmer_Head', 'Farmer_Body', 'Farmer_Pants', 'Farmer_Feet'], {}), look: { skin: 0xd0a080, hair: 0x5a4a3a, hairStyle: 'short', top: 0x8a7a4a, bottom: 0x5a4a3a } },
  { name: 'Грузчик', model: M(['Casual_Head', 'Adventurer_Body', 'Worker_Legs', 'Worker_Feet'], { Hair: 0x2a2a2a }), look: { skin: 0xc89070, hair: 0x2a2a2a, hairStyle: 'short', top: 0x6a6a52, bottom: 0x3a3a3a, build: 1.15 } },
  { name: 'Школяр', model: M(['Suit_Head', 'King_Body', 'Casual2_Legs', 'Adventurer_Feet'], { Hair: 0x6a5a3a }), look: { skin: 0xf0d0b8, hair: 0x6a5a3a, hairStyle: 'short', top: 0x3a5a8a, bottom: 0x3a3a48 } },
  { name: 'Рыбачка', model: F(['Soldier_Head', 'Adventurer_Body', 'Adventurer_Legs', 'Adventurer_Feet'], { Hair_Brown: 0x3a2a22 }), look: { skin: 0xe8b890, hair: 0x3a2a22, hairStyle: 'ponytail', top: 0x5a7a6a, bottom: 0x4a3a2a, hat: 'cap', hatColor: 0x5a7a6a } },
];

export const CITIZEN_SPOTS = [
  ['steps', -34, 12, 'idle', 0], ['steps', 22, 14, 'idle', 1], ['steps', 4, -14, 'idle', 4],
  ['market', -44, 18, 'shop', 2], ['market', 14, 22, 'shop', 1], ['market', 40, -20, 'idle', 0],
  ['cargo', -30, 14, 'work', 3], ['cargo', 24, -14, 'work', 3],
  ['theatre', -26, 20, 'idle', 1], ['guildsq', 20, 18, 'idle', 0], ['guildsq', -30, -12, 'idle', 4],
  ['cathedral', 28, 20, 'idle', 1], ['council', 40, 12, 'idle', 0], ['council', -56, 10, 'idle', 1],
  ['academy', -30, 22, 'idle', 4], ['wagons', 10, 18, 'work', 3],
];
const BARKS = [
  ['Дорога открылась, говорят. У нас на рынке уже цены поползли вниз.', 'Хлеб у Тавии лучше, чем в порту. Вечером занимайте стол заранее.'],
  ['Площадь Ступеней смотрится лучше ночью, когда горят фонари.', 'Заблудились? Идите на башню гильдии, она видна отовсюду.'],
  ['В порту опять шумят у насосного склада. Что-то с выдачей скоб.', 'Лодочники берут за перевоз недорого, но по два человека.'],
];

export const CITIZENS = CITIZEN_SPOTS.map(([, , , anim, who], i) => {
  const W = WHO[who];
  return {
    id: 'cit_' + (i + 1), name: W.name, title: 'Житель Айнстрея', model: W.model, look: W.look,
    appear: { v: 'AINSTRAY_ROAD_OPEN' },
    schedule: [{ time: [7, 21], spot: 'ain_cit_' + (i + 1), anim }, { time: [21, 7], hidden: true }],
    talk: [{ bark: BARKS[i % BARKS.length] }],
  };
});
