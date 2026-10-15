/**
 * Speakers of the scenario that are not people walking around the world (a projection, a voice, a crowd): the dialogue UI
 * takes their name and portrait from here (npc/NPCManager.def). Colours as in data/npcs.js `look`.
 */
export const SPEAKERS = {
  veyr: { id: 'veyr', name: 'Элиас Вейр', title: 'Руководитель Астрариума', look: { skin: 0xd8c8b0, hair: 0xe0e0e0, hairStyle: 'short', beard: true, top: 0x4a5a7a } },
  kharz: { id: 'kharz', name: 'Харз', title: 'Архидемон ущелья', look: { skin: 0x9a2a2a, hair: 0x1a0a0a, hairStyle: 'bald', top: 0x2a1418 } },
  agata: { id: 'agata', name: 'Агата', title: 'Мать погибшего рабочего', look: { skin: 0xf0d0b8, hair: 0x8a7a6a, hairStyle: 'bun', top: 0x5a4a5a, dress: true, dressColor: 0x5a4a5a } },
  dan: { id: 'dan', name: 'Дан', title: 'Рабочий шахты', look: { skin: 0xc89070, hair: 0x2a1a12, hairStyle: 'short', top: 0x8a7a5a } },
  osa: { id: 'osa', name: 'Оса', title: 'Рабочая шахты', look: { skin: 0xe8c8a8, hair: 0x6a2a1a, hairStyle: 'ponytail', top: 0x6a6a4a } },
  tera: { id: 'tera', name: 'Тера', title: 'Помощница учёного', look: { skin: 0xf0d0b8, hair: 0x3a2a4a, hairStyle: 'braids', top: 0x4a6a8a } },
  carter: { id: 'carter', name: 'Возчик', title: 'Обозник', look: { skin: 0xd8a880, hair: 0x4a3a2a, hairStyle: 'short', beard: true, top: 0x7a5a3a, hat: 'cap', hatColor: 0x5a4a3a } },
  kids: { id: 'kids', name: 'Дети', title: 'Площадь Фонтана', look: { skin: 0xffe0c8, hair: 0xc89a5a, hairStyle: 'braids', top: 0xe0a0b0 } },
};
