/**
 * Quests. Story quests drive the chapters; contracts come from the guild board; side quests
 * come from people. Stage objectives: see rpg/Quests.js. `target` points the compass/map.
 * `hint` appears as a gentle tutorial note when the stage begins.
 */
const Q = (id, q) => [id, { id, ...q }];

export const QUESTS = Object.fromEntries([
  // =====================================================================================
  // PROLOGUE — a new life
  // =====================================================================================
  Q('prologue_arrival', {
    title: 'Город начинающих', category: 'story', chapter: 0, giver: 'marta', hidden: true,
    summary: 'Караван наконец добрался до Акселя — города, где начинают все искатели приключений. Пора осмотреться.',
    stages: [
      { id: 'marta', text: 'Попрощайся с Мартой, хозяйкой каравана.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }],
        hint: 'WASD — идти, Shift — бег, мышь — камера. Подойди к Марте и нажми E.' },
      { id: 'gate', text: 'Войди в город через южные ворота. Стражник подскажет, куда идти.', target: 'npc:bernard', objectives: [{ type: 'talk', label: 'Поговорить со стражником' }] },
      { id: 'square', text: 'Осмотрись на центральной площади Акселя.', target: 'spot:square', objectives: [{ type: 'reach', spot: 'square', r: 9, label: 'Дойти до площади' }],
        hint: 'Компас вверху показывает направление к цели задания (◆).' },
      { id: 'lina', text: 'С рынка пахнет свежим хлебом. Загляни в пекарню Лины (рынок, юго-восток).', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
    ],
    rewards: { xp: 15 },
  }),
  Q('first_delivery', {
    title: 'Хлеб для кузнеца', category: 'story', chapter: 0, giver: 'lina', requires: { quest: 'prologue_arrival', stage: 'lina' },
    summary: 'Лина попросила отнести свёрток кузнецу Гаррету и пообещала заплатить.',
    stages: [
      { id: 'deliver', text: 'Отнеси свёрток кузнецу Гаррету — кузница в юго-западном квартале.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Отдать свёрток Гаррету' }],
        hint: 'Свёрток в сумке: I — инвентарь. Предметы задания нельзя продать или выбросить.' },
      { id: 'back', text: 'Вернись к Лине за платой.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
    ],
    rewards: { eris: 30, xp: 20, items: [['bread', 2]], rel: [['lina', 10], ['garret', 5]] },
  }),
  Q('join_guild', {
    title: 'Лицензия искателя', category: 'story', chapter: 0, giver: 'lina', requires: { quest: 'first_delivery', status: 'done' },
    summary: 'Чтобы зарабатывать на приключениях, нужна лицензия Гильдии искателей.',
    stages: [
      { id: 'go', text: 'Гильдия — большое здание с синей крышей и башней к северо-востоку от площади. Поговори с Луной.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'potion', text: 'Правило гильдии: при себе должно быть зелье исцеления. Купи его у алхимика Висс (рынок, юго-восток).', target: 'npc:wiss',
        objectives: [{ type: 'collect', item: 'hp_potion', n: 1, label: 'Зелье исцеления' }],
        hint: 'Поговори с торговцем и выбери «Торговать». Купленное сразу попадает в сумку.' },
      { id: 'register', text: 'Вернись к Луне и заплати вступительный взнос — 30 эрис.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Зарегистрироваться' }] },
    ],
    rewards: { xp: 30 },
    next: 'guild_test',
  }),
  Q('guild_test', {
    title: 'Практическое испытание', category: 'story', chapter: 0, giver: 'luna', requires: { quest: 'join_guild', status: 'done' },
    summary: 'Новичок обязан показать, что умеет. Испытание проводит инструктор Бран на поле гильдии за северными воротами.',
    stages: [
      { id: 'bran', text: 'Найди инструктора Брана на тренировочном поле за северными воротами.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
      { id: 'staff', text: 'Покажи владение посохом: ударь манекен три раза.', target: 'spot:training_center', objectives: [{ type: 'custom', name: 'dummy_hit', n: 3, label: 'Удары по манекену' }],
        hint: 'ЛКМ или F — удар посохом. Три нажатия подряд — комбо.' },
      { id: 'magic', text: 'Теперь — магия. Ударь заклинанием по центру поля (Q).', target: 'spot:training_center', objectives: [{ type: 'explosion', spot: 'training_center', r: 14, label: 'Заклинание по центру поля' }],
        hint: 'Q — способность. Прицелься в центр поля (на расстоянии 12–34 м). Explosion тратит всю ману.' },
      { id: 'report', text: 'Доложи инструктору Брану.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
    ],
    rewards: { eris: 50, xp: 50, items: [['mana_potion', 2]], rankPoints: 1, flags: ['guild_tested'] },
    next: 'ch1_name',
  }),

  // =====================================================================================
  // CHAPTER 1 — a beginner adventurer
  // =====================================================================================
  Q('ch1_name', {
    title: 'Имя в гильдии', category: 'story', chapter: 1, giver: 'luna', requires: { quest: 'guild_test', status: 'done' },
    summary: 'Луна советует набраться опыта на простых заказах. Доска заказов — в зале гильдии, слева от входа.',
    stages: [
      { id: 'contracts', text: 'Выполни три заказа с доски гильдии.', target: 'spot:guild_front', objectives: [{ type: 'custom', name: 'contract_done', n: 3, label: 'Заказы' }],
        hint: 'Доска заказов: подойди к ней в гильдии и нажми E — или открой меню гильдии (G).' },
      { id: 'promote', text: 'Поговори с Луной о повышении ранга.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
    ],
    rewards: { eris: 60, xp: 60 },
    next: 'ch2_people',
  }),

  // --- Contracts (guild board) ---
  Q('c_herbs', {
    title: 'Травы для лавки', category: 'contract', kind: 'Сбор', chapter: 1, giver: 'wiss', rank: 'F',
    summary: 'Алхимику Висс нужны лечебные травы. Они растут на лугах вокруг города.',
    stages: [
      { id: 'gather', text: 'Собери 5 лечебных трав (луга у западных ворот, к югу от города).', target: 'spot:herb_meadow', objectives: [{ type: 'collect', item: 'herb', n: 5, label: 'Лечебная трава' }],
        hint: 'Травы с белыми цветками растут на лугах. Подойди и нажми E.' },
      { id: 'turnin', text: 'Отнеси травы Висс.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Отдать травы' }] },
    ],
    rewards: { eris: 40, xp: 25, rankPoints: 1, items: [['hp_potion', 1]], rel: [['wiss', 10]] },
  }),
  Q('c_lost_cat', {
    title: 'Пропал Уголёк', category: 'contract', kind: 'Поиск', chapter: 1, giver: 'mia', rank: 'F',
    summary: 'Девочка Мия потеряла чёрного кота Уголька. Награда — все её сбережения.',
    stages: [
      { id: 'mia', text: 'Расспроси Мию о пропавшем коте (площадь, днём).', target: 'npc:mia', objectives: [{ type: 'talk', label: 'Поговорить с Мией' }] },
      { id: 'ask', text: 'Мия видела, как Уголёк убежал к южным воротам. Спроси стражника Бернарда.', target: 'npc:bernard', objectives: [{ type: 'talk', label: 'Расспросить Бернарда' }] },
      { id: 'search', text: 'Из амбара на ферме Бориса доносится мяуканье. Поищи там.', target: 'spot:cat_hide', objectives: [{ type: 'interact', id: 'cat_ugolek', label: 'Найти Уголька' }] },
      { id: 'return', text: 'Верни Уголька Мие.', target: 'npc:mia', objectives: [{ type: 'talk', label: 'Вернуть кота' }] },
    ],
    rewards: { xp: 35, rankPoints: 1 },
  }),
  Q('c_goblin_scouts', {
    title: 'Разведчики у кромки леса', category: 'contract', kind: 'Устранение угрозы', chapter: 1, giver: 'luna', rank: 'F',
    summary: 'У опушки Шепчущего леса, к западу от города, поставили лагерь гоблины-разведчики. Их нужно прогнать.',
    stages: [
      { id: 'kill', text: 'Победи гоблинов у кромки леса (запад, за лагерем охотников не ходи).', target: 'spot:forest_scouts', objectives: [{ type: 'kill', camp: 'forest_scouts', n: 4, label: 'Гоблины' }],
        hint: 'Держи дистанцию: ЛКМ/F — комбо посохом, Q — способность. Зелья: 3 — исцеление, 4 — бодрость.' },
      { id: 'report', text: 'Доложи Луне в гильдии.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Доложить' }] },
    ],
    rewards: { eris: 60, xp: 45, rankPoints: 1 },
  }),
  Q('c_mushroom_field', {
    title: 'Грибная напасть', category: 'contract', kind: 'Охота', chapter: 1, giver: 'boris', rank: 'F',
    summary: 'Фермер Борис жалуется: с речного луга к полям повадились ходить грибы-переростки.',
    stages: [
      { id: 'kill', text: 'Прогони грибов с речного луга (за мостом, к востоку от ферм).', target: 'spot:river_meadow', objectives: [{ type: 'kill', camp: 'river_meadow', n: 3, label: 'Грибы' }] },
      { id: 'report', text: 'Сообщи Борису на ферме.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
    ],
    rewards: { eris: 45, xp: 35, rankPoints: 1, items: [['pumpkin_pie', 2]], rel: [['boris', 10]] },
  }),
  Q('c_ore_for_garret', {
    title: 'Руда для кузницы', category: 'contract', kind: 'Помощь торговцу', chapter: 1, giver: 'garret', rank: 'F',
    summary: 'Караван с рудой задерживается. Гаррету нужна железная руда — её можно наковырять у входа в старую шахту.',
    stages: [
      { id: 'gather', text: 'Добудь 4 железной руды (холм у Старой шахты, северо-запад).', target: 'spot:cave_mouth', objectives: [{ type: 'collect', item: 'iron_ore', n: 4, label: 'Железная руда' }] },
      { id: 'turnin', text: 'Отнеси руду Гаррету.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Отдать руду' }] },
    ],
    rewards: { eris: 50, xp: 40, rankPoints: 1, rel: [['garret', 15]], flags: ['forge_unlocked'] },
  }),
  Q('c_escort_tobias', {
    title: 'Попутчик до Ольховки', category: 'contract', kind: 'Сопровождение', chapter: 1, giver: 'tobias', rank: 'F',
    requires: { quest: 'c_goblin_scouts', status: 'done' },
    summary: 'Торговец Тобиас везёт ткани в деревню Ольховку за рекой и боится идти один.',
    stages: [
      { id: 'meet', text: 'Найди Тобиаса у восточных ворот.', target: 'npc:tobias', objectives: [{ type: 'talk', label: 'Поговорить с Тобиасом' }] },
      { id: 'escort', text: 'Проводи Тобиаса до Ольховки по восточной дороге. Не отставай!', target: 'npc:tobias', objectives: [{ type: 'escort', npc: 'tobias', label: 'Довести Тобиаса' }] },
      { id: 'pay', text: 'Поговори с Тобиасом в Ольховке.', target: 'npc:tobias', objectives: [{ type: 'talk', label: 'Получить плату' }] },
    ],
    rewards: { eris: 80, xp: 55, rankPoints: 2, rel: [['tobias', 15]], flags: ['olkhovka_route'] },
  }),
  Q('c_watchtower', {
    title: 'Огни на старой башне', category: 'contract', kind: 'Исследование', chapter: 1, giver: 'luna', rank: 'E',
    summary: 'По ночам на заброшенной сторожевой башне к северо-востоку видели огни. Гильдия хочет знать, кто там.',
    stages: [
      { id: 'reach', text: 'Доберись до старой сторожевой башни (тропа от северной дороги).', target: 'region:watchtower', objectives: [{ type: 'reach', region: 'watchtower', label: 'Дойти до башни' }] },
      { id: 'log', text: 'Поднимись наверх и найди, что оставили дозорные.', target: 'spot:watchtower_top', objectives: [{ type: 'interact', id: 'tower_logbook', label: 'Осмотреть журнал' }] },
      { id: 'report', text: 'Доложи Луне.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Доложить' }] },
    ],
    rewards: { eris: 70, xp: 60, rankPoints: 2, flags: ['lore_tower'] },
  }),
  Q('c_moonflowers', {
    title: 'Лунные цветы', category: 'contract', kind: 'Сбор', chapter: 2, giver: 'wiss', rank: 'E',
    requires: { flag: 'glade_known' },
    summary: 'Висс нужны лунные цветы. Они раскрываются только ночью — например, на скрытой поляне в лесу.',
    stages: [
      { id: 'gather', text: 'Собери 3 лунных цветка (ночью, Скрытая поляна).', target: 'region:glade', objectives: [{ type: 'collect', item: 'moonflower', n: 3, label: 'Лунный цветок' }],
        hint: 'Если не хочется ждать ночи — можно снять комнату в таверне и выспаться.' },
      { id: 'turnin', text: 'Отнеси цветы Висс.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Отдать цветы' }] },
    ],
    rewards: { eris: 90, xp: 70, rankPoints: 2, rel: [['wiss', 10]] },
  }),

  // =====================================================================================
  // CHAPTER 2 — people and their stories
  // =====================================================================================
  Q('ch2_people', {
    title: 'Люди Акселя', category: 'story', chapter: 2, giver: 'luna', requires: { quest: 'ch1_name', status: 'done' },
    summary: 'Ранг E открывает больше дверей. А заодно — больше разговоров. Город живёт своей жизнью, и в нём что-то не так.',
    stages: [
      { id: 'fenrik', text: 'Вечером (после 18:00) весь город собирается в таверне. Послушай барда Фенрика.', target: 'npc:fenrik', objectives: [{ type: 'talk', label: 'Поговорить с Фенриком' }] },
      { id: 'clara', text: 'Сестра Клара в храме Эрис знает старые легенды о «падающих звёздах».', target: 'npc:clara', objectives: [{ type: 'talk', label: 'Поговорить с Кларой' }] },
      { id: 'bernard', text: 'Лина волнуется: её брат Бернард стал задерживаться на посту до ночи. Узнай, в чём дело.', target: 'npc:bernard', objectives: [{ type: 'talk', label: 'Поговорить с Бернардом' }] },
      { id: 'lina', text: 'Расскажи Лине о Бернарде… или не всё.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
    ],
    rewards: { eris: 40, xp: 80 },
    next: 'ch3_lights',
  }),

  // =====================================================================================
  // CHAPTER 3 — beyond the familiar world
  // =====================================================================================
  Q('ch3_lights', {
    title: 'Странное сияние', category: 'story', chapter: 3, giver: 'luna', requires: [{ rank: 'E' }, { quest: 'ch2_people', status: 'done' }],
    summary: 'Огни над северным хребтом, легенда о звёздах, что упали в лес… Охотники Шепчущего леса тоже что-то видели.',
    stages: [
      { id: 'rann', text: 'Поговори с охотником Ранном в лагере охотников (Шепчущий лес, запад).', target: 'npc:rann', objectives: [{ type: 'talk', label: 'Поговорить с Ранном' }] },
      { id: 'glade', text: 'Найди скрытую поляну — заросшая тропа на запад от лагеря охотников.', target: 'region:glade', objectives: [{ type: 'reach', region: 'glade', label: 'Найти поляну' }] },
      { id: 'shard', text: 'Осмотри светящийся пень в центре поляны.', target: 'region:glade', objectives: [{ type: 'interact', id: 'glade_shard', label: 'Осмотреть свет' }] },
      { id: 'edmund', text: 'Говорят, в Ольховке живёт учёный, который изучает звёзды. Покажи ему осколок.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
      { id: 'mine', text: 'Эдмунд уверен: второй осколок упал в Старую шахту. Найди его в глубине.', target: 'region:cave',
        objectives: [{ type: 'interact', id: 'deep_shard', label: 'Второй осколок' }],
        hint: 'Вход в шахту — на холме к северо-западу от города. Внутри может понадобиться кое-что… громкое.' },
      { id: 'edmund2', text: 'Вернись к Эдмунду в Ольховку.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
    ],
    rewards: { eris: 150, xp: 150, rankPoints: 3 },
    next: 'ch4_astrarium',
  }),

  // =====================================================================================
  // CHAPTER 4 — the mage from the ruins
  // =====================================================================================
  Q('ch4_astrarium', {
    title: 'Маг из руин', category: 'story', chapter: 4, giver: 'edmund', requires: { quest: 'ch3_lights', status: 'done' },
    summary: 'Эдмунд попросил передать письмо магу, которая работает в Руинах Астрариума за северным хребтом.',
    stages: [
      { id: 'travel', text: 'Отправляйся в Руины Астрариума: северная дорога через перевал в хребте.', target: 'region:astrarium', objectives: [{ type: 'reach', region: 'astrarium', label: 'Дойти до руин' }],
        hint: 'Руины охраняют каменные стражи. Запасись зельями.' },
      { id: 'meet', text: 'Найди мага у костра к югу от руин и передай письмо.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Передать письмо' }] },
    ],
    rewards: { xp: 60 },
    next: 'roxy_trust',
  }),
  Q('roxy_trust', {
    title: 'Без единого взрыва', category: 'story', chapter: 4, giver: 'roxy', requires: { quest: 'ch4_astrarium', status: 'done' },
    summary: 'Рокси Мигурдия изучает разлом в Астрариуме. Она не доверяет «взрывному магу», но согласилась на помощь — с одним условием.',
    stages: [
      { id: 'crystals', text: 'Собери три резонирующих кристалла в руинах. Условие Рокси: никаких Explosion!', target: 'region:astrarium',
        objectives: [{ type: 'collect', item: 'resonance_crystal', n: 3, label: 'Резонирующий кристалл' }] },
      { id: 'return', text: 'Принеси кристаллы Рокси.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
      { id: 'defend', text: 'Защити Рокси, пока она запечатывает разлом!', target: 'spot:astrarium_center', objectives: [{ type: 'kill', camp: 'rift_wave', n: 4, label: 'Стражи разлома' }],
        onStart: { spawn: { type: 'guardian', spot: 'astrarium_center', n: 4, r: 11, camp: 'rift_wave' } } },
      { id: 'talk', text: 'Поговори с Рокси.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
    ],
    rewards: { eris: 100, xp: 200, items: [['book_water', 1]], rel: [['roxy', 20]] },
    next: 'ch5_voices',
  }),

  // =====================================================================================
  // CHAPTER 5 — the main mystery (opening)
  // =====================================================================================
  Q('ch5_voices', {
    title: 'Голоса звёзд', category: 'story', chapter: 5, giver: 'roxy', requires: { quest: 'roxy_trust', status: 'done' },
    summary: 'Осколки, разлом, огни над хребтом… Рокси считает, что всё это связано с чем-то под самим Акселем.',
    stages: [
      { id: 'edmund', text: 'Расскажи Эдмунду о разломе в Астрариуме.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
      { id: 'clara', text: 'Сестра Клара упоминала крипту под храмом Эрис. Спроси её.', target: 'npc:clara', objectives: [{ type: 'talk', label: 'Поговорить с Кларой' }] },
    ],
    rewards: { xp: 120, flags: ['ch5_hook'] },
  }),

  // =====================================================================================
  // SIDE QUESTS
  // =====================================================================================
  Q('s_bard_song', {
    title: 'Баллада для архимага', category: 'side', chapter: 2, giver: 'fenrik', requires: { quest: 'ch2_people', status: 'done' },
    summary: 'Фенрик ищет вдохновение для новой баллады. Ему нужно что-нибудь… сияющее.',
    stages: [
      { id: 'flower', text: 'Принеси Фенрику лунный цветок.', target: 'npc:fenrik', objectives: [{ type: 'collect', item: 'moonflower', n: 1, label: 'Лунный цветок' }] },
      { id: 'give', text: 'Отдай цветок Фенрику (таверна, вечером).', target: 'npc:fenrik', objectives: [{ type: 'talk', label: 'Поговорить с Фенриком' }] },
    ],
    rewards: { eris: 30, xp: 50, rel: [['fenrik', 20]], flags: ['ballad'] },
  }),
].map(([id, q]) => [id, q]));
