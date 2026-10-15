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
    title: 'Город начинающих', category: 'story', chapter: 0, giver: 'marta', hidden: true, noAuto: true,
    summary: 'Караван наконец добрался до Акселя — города, где начинают все искатели приключений. Пора осмотреться.',
    stages: [
      { id: 'marta', text: 'Поговори с Мартой, хозяйкой каравана.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }],
        hint: 'WASD — идти, Shift — бег, мышь — камера. E — говорить и брать предметы.' },
      { id: 'gate', text: 'Войди в город через южные ворота. Стражник назовёт дорогу.', target: 'npc:bernard', objectives: [{ type: 'talk', label: 'Поговорить со стражником' }] },
      { id: 'square', text: 'Осмотрись на площади Фонтана.', target: 'spot:square', objectives: [{ type: 'reach', spot: 'square', r: 9, label: 'Дойти до площади' }],
        hint: 'Компас вверху показывает направление к цели задания (◆).' },
      { id: 'lina', text: 'С рынка пахнет свежим хлебом. Загляни в пекарню Лины (справа от фонтана).', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
    ],
    rewards: { xp: 15 },
  }),
  // A00, option 1: two sacks by the rear wheel of Marta's cart.
  Q('a00_bags', {
    title: 'Два мешка для Марты', category: 'side', chapter: 0, giver: 'marta', hidden: true, noAuto: true,
    summary: 'Марта попросила перенести два мешка от заднего колеса. Потом можно спорить.',
    stages: [
      { id: 'carry', text: 'Перенеси два мешка у заднего колеса телеги Марты.', target: 'npc:marta',
        objectives: [{ type: 'interact', id: 'caravan_bag_a', label: 'Первый мешок' }, { type: 'interact', id: 'caravan_bag_b', label: 'Второй мешок' }] },
      { id: 'back', text: 'Вернись к Марте.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }] },
    ],
    rewards: { xp: 5, rel: [['marta', 5]] },
  }),
  Q('first_delivery', {
    title: 'Хлеб для кузнеца', category: 'story', chapter: 0, giver: 'lina', noAuto: true, requires: { quest: 'prologue_arrival', stage: 'lina' },
    summary: 'Лина попросила отнести свёрток кузнецу Гаррету и пообещала тридцать эрис.',
    stages: [
      { id: 'deliver', text: 'Отнеси свёрток кузнецу Гаррету: кузница у восточной улицы.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Отдать свёрток Гаррету' }],
        hint: 'Свёрток в сумке: I — инвентарь. Предметы задания нельзя продать или выбросить.' },
      { id: 'back', text: 'Вернись к Лине за платой. Она ждёт пустую салфетку.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
    ],
    rewards: { eris: 30, xp: 20, rel: [['lina', 10], ['garret', 5]] },
    next: 'join_guild',
  }),
  Q('join_guild', {
    title: 'Лицензия искателя', category: 'story', chapter: 1, giver: 'luna', noAuto: true, requires: { quest: 'first_delivery', status: 'done' },
    summary: 'Чтобы брать заказы гильдии, нужна лицензия: взнос тридцать эрис и регистрационное зелье Висс.',
    stages: [
      { id: 'go', text: 'Гильдия — здание с синей крышей за площадью Фонтана. Поговори с Луной.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'potion', text: 'Забери регистрационный флакон у алхимика Висс (лавка у рынка, двадцать эрис).', target: 'npc:wiss',
        objectives: [{ type: 'collect', item: 'reg_flask', n: 1, label: 'Регистрационный флакон' }],
        hint: 'Флакон нельзя выпить до проверки Луной: после неё он станет обычным зельем.' },
      { id: 'register', text: 'Вернись к Луне: взнос тридцать эрис и подпись.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Зарегистрироваться' }] },
    ],
    rewards: { xp: 30 },
    next: 'guild_test',
  }),
  Q('guild_test', {
    title: 'Испытание у Брана', category: 'story', chapter: 1, giver: 'luna', noAuto: true, requires: { quest: 'join_guild', status: 'done' },
    summary: 'Лицензия ранга F выдана. Первый отчёт Мегумин принесёт после испытания: посох, дистанция, контроль площадки. Инструктор Бран ждёт на поле за северными воротами.',
    stages: [
      { id: 'bran', text: 'Найди инструктора Брана на тренировочном поле за северными воротами.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
      { id: 'staff', text: 'Ударь манекен посохом три раза.', target: 'spot:training_center', objectives: [{ type: 'custom', name: 'dummy_hit', n: 3, label: 'Удары по манекену' }],
        hint: 'ЛКМ или F — удар посохом. Три нажатия подряд — комбо.' },
      { id: 'bran2', text: 'Вернись к Брану: теперь большая мишень в центре поля.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
      { id: 'magic', text: 'Дождись сигнала Брана и ударь заклинанием по центру поля (Q).', target: 'spot:training_center', objectives: [{ type: 'explosion', spot: 'training_center', r: 14, label: 'Заклинание по центру поля' }],
        hint: 'Q — способность. Прицелься в мишень в центре поля (12–34 м). Explosion тратит всю ману, потом нужен отдых.',
        onDone: { say: 'A07_018' } },
      { id: 'report', text: 'Доложи инструктору Брану.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
    ],
    rewards: { eris: 50, xp: 50, items: [['mana_potion', 2]], rankPoints: 1, flags: ['guild_tested'] },
    next: 'ch1_name',
  }),

  // =====================================================================================
  // CHAPTER 1 — a beginner adventurer
  // =====================================================================================
  Q('ch1_name', {
    title: 'Имя в книге', category: 'story', chapter: 1, giver: 'luna', noAuto: true, requires: { quest: 'guild_test', status: 'done' },
    summary: 'Луна даст ранг E, когда будут сданы три разных заказа с доски гильдии: заказчику результат, затем отметка у неё.',
    stages: [
      { id: 'board', text: 'Бран прислал отчёт. Поговори с Луной у доски заказов.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'contracts', text: 'Сдай три разных заказа с доски гильдии.', target: 'spot:guild_front', objectives: [{ type: 'custom', name: 'contract_done', n: 3, label: 'Заказы' }],
        hint: 'Доска заказов: подойди к ней в гильдии и нажми E — или открой меню гильдии (G). Один заказ дважды не считается.' },
      { id: 'promote', text: 'Поговори с Луной о ранге E.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
    ],
    rewards: { eris: 60, xp: 60 },
    next: 'ch2_people',
  }),

  // --- Contracts (guild board) ---
  Q('c_herbs', {
    title: 'Травы для лавки', category: 'contract', kind: 'Сбор', chapter: 1, giver: 'wiss', rank: 'F',
    summary: 'Алхимику Висс нужны лечебные травы. Они растут на лугах вокруг города.',
    stages: [
      { id: 'brief', text: 'Поговори с Висс: она покажет образец травы.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Поговорить с Висс' }] },
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
      { id: 'brief', text: 'Поговори с Луной о заказе: границы участка и правила добычи.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'kill', text: 'Прогони гоблинов у кромки леса (запад). Дальше белых столбов не иди.', target: 'spot:forest_scouts', objectives: [{ type: 'kill', camp: 'forest_scouts', n: 4, label: 'Гоблины' }],
        hint: 'Держи дистанцию: ЛКМ/F — комбо посохом, Q — способность. Зелья: 3 — исцеление, 4 — бодрость.' },
      { id: 'report', text: 'Доложи Луне в гильдии.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Доложить' }] },
    ],
    rewards: { eris: 60, xp: 45, rankPoints: 1 },
  }),
  Q('c_mushroom_field', {
    title: 'Грибная напасть', category: 'contract', kind: 'Охота', chapter: 1, giver: 'boris', rank: 'F',
    summary: 'Фермер Борис жалуется: с речного луга к полям повадились ходить грибы-переростки.',
    stages: [
      { id: 'brief', text: 'Поговори с Борисом: он уберёт людей с луга.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
      { id: 'kill', text: 'Прогони грибов с речного луга (за мостом, к востоку от ферм).', target: 'spot:river_meadow', objectives: [{ type: 'kill', camp: 'river_meadow', n: 3, label: 'Грибы' }] },
      { id: 'report', text: 'Сообщи Борису на ферме.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
    ],
    rewards: { eris: 45, xp: 35, rankPoints: 1, items: [['pumpkin_pie', 2]], rel: [['boris', 10]] },
  }),
  Q('c_ore_for_garret', {
    title: 'Руда для кузницы', category: 'contract', kind: 'Помощь торговцу', chapter: 1, giver: 'garret', rank: 'F',
    summary: 'Караван с рудой задерживается. Гаррету нужна железная руда — её можно наковырять у входа в старую шахту.',
    stages: [
      { id: 'brief', text: 'Поговори с Гаррет: он покажет, где бить породу.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Поговорить с Гарретом' }] },
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
      { id: 'brief', text: 'Поговори с Луной о заказе: журнал дозорного на старой башне.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'reach', text: 'Доберись до старой сторожевой башни (тропа от северной дороги).', target: 'region:watchtower', objectives: [{ type: 'reach', region: 'watchtower', label: 'Дойти до башни' }] },
      { id: 'log', text: 'Поднимись наверх и найди журнал дозорного.', target: 'spot:watchtower_top', objectives: [{ type: 'flag', flag: 'B07_LOG', label: 'Осмотреть журнал' }] },
      { id: 'report', text: 'Доложи Луне.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Доложить' }] },
    ],
    rewards: { eris: 70, xp: 60, rankPoints: 2, flags: ['lore_tower'] },
  }),
  Q('c_moonflowers', {
    title: 'Лунные цветы', category: 'contract', kind: 'Сбор', chapter: 2, giver: 'wiss', rank: 'E',
    requires: { flag: 'glade_known' },
    summary: 'Висс нужны лунные цветы. Они раскрываются только ночью — например, на скрытой поляне в лесу.',
    stages: [
      { id: 'brief', text: 'Поговори с Висс: ей нужны лунные цветы.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Поговорить с Висс' }] },
      { id: 'gather', text: 'Собери 3 раскрывшихся лунных цветка (ночью, Скрытая поляна). Закрытые бутоны оставь.', target: 'region:glade', objectives: [{ type: 'collect', item: 'moonflower', n: 3, label: 'Лунный цветок' }],
        hint: 'Если не хочется ждать ночи — можно снять комнату в таверне и выспаться.' },
      { id: 'turnin', text: 'Отнеси цветы Висс.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Отдать цветы' }] },
    ],
    rewards: { eris: 90, xp: 70, rankPoints: 2, rel: [['wiss', 10]] },
  }),

  // =====================================================================================
  // CHAPTER 2 — people and their stories
  // =====================================================================================
  Q('ch2_people', {
    title: 'Люди Акселя', category: 'story', chapter: 2, giver: 'luna', noAuto: true, requires: { quest: 'ch1_name', status: 'done' },
    summary: 'Ранг E открывает дальние маршруты. Вечером город разговорчивее: в таверне поёт Фенрик, в храме Клара хранит записи, а Бернард после заката стоит на стене.',
    stages: [
      { id: 'talks', text: 'Поговори с людьми: Фенрик поёт в таверне вечером, Клара ждёт в храме, Бернард на стене после заката.', target: 'npc:fenrik',
        objectives: [
          { type: 'flag', flag: 'A10_DONE', label: 'Фенрик и песня (таверна, вечером)' },
          { type: 'flag', flag: 'A11_DONE', label: 'Клара и легенда (храм)' },
          { type: 'flag', flag: 'A12_DONE', label: 'Бернард на стене (после заката)' },
        ] },
    ],
    rewards: { eris: 40, xp: 80 },
  }),
  // A13-A14: Bernard's story closes at the next visits; it never blocks the main line.
  Q('ch2_bernard', {
    title: 'Записи Бернарда', category: 'story', chapter: 2, giver: 'lina', noAuto: true, requires: { flag: 'A12_DONE' },
    summary: 'Бернард ведёт тетрадь со вспышками над хребтом и просил не говорить сестре. Лина волнуется: он задерживается на посту.',
    stages: [
      { id: 'lina', text: 'Лина спрашивает про брата. Зайди в пекарню.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
      { id: 'bernard', text: 'Загляни к Бернарду: у него будет что сказать после разговора с Линой.', target: 'npc:bernard', objectives: [{ type: 'talk', label: 'Поговорить с Бернардом' }] },
    ],
    rewards: { xp: 40, rel: [['lina', 5], ['bernard', 5]] },
  }),

  // =====================================================================================
  // CHAPTER 3 — two voices under the ground
  // =====================================================================================
  Q('ch3_lights', {
    title: 'Два голоса под землёй', category: 'story', chapter: 3, giver: 'bernard', noAuto: true, requires: [{ rank: 'E' }, { flag: 'A12_DONE' }],
    summary: 'Бернард записывает вспышки над хребтом и назвал место: западный лес. Ранн в лагере охотников должен видеть больше.',
    stages: [
      { id: 'rann', text: 'Поговори с охотником Ранном в лагере Шепчущего леса (запад).', target: 'npc:rann', objectives: [{ type: 'talk', label: 'Поговорить с Ранном' }] },
      { id: 'glade', text: 'Найди Скрытую поляну: тропа от ручья, держись белых камней.', target: 'region:glade', objectives: [{ type: 'reach', region: 'glade', label: 'Найти поляну' }] },
      { id: 'shard', text: 'Осмотри светящийся пень в центре поляны.', target: 'region:glade', objectives: [{ type: 'flag', flag: 'glade_shard_taken', label: 'Осмотреть пень' }] },
      { id: 'edmund', text: 'Покажи находку учёному Эдмунду в Ольховке.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
      { id: 'garret', text: 'Покажи Гаррету план шахты, прежде чем спускаться.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Поговорить с Гарретом' }] },
      { id: 'mine', text: 'Вход в Старую шахту на холме к северо-западу. Отойди к каменной арке и расчисти завал в боковом тупике.', target: 'region:cave',
        objectives: [{ type: 'flag', flag: 'deep_shard_taken', label: 'Второй осколок' }],
        hint: 'Завал разбирается взрывом: отойди подальше, прицелься (Q). Глубокий ход оставь на потом.' },
      { id: 'edmund2', text: 'Вернись к Эдмунду с вторым осколком.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
    ],
    rewards: { eris: 150, xp: 150, rankPoints: 3 },
    next: 'ch4_astrarium',
  }),

  // =====================================================================================
  // CHAPTER 4 — a foreign circle
  // =====================================================================================
  // Starts after chapter 3 once the song (A10) and Clara's legend (A11) are heard.
  Q('ch4_astrarium', {
    title: 'Чужой круг', category: 'story', chapter: 4, giver: 'edmund', noAuto: true, requires: [{ quest: 'ch3_lights', status: 'done' }, { flag: 'A10_DONE' }, { flag: 'A11_DONE' }],
    summary: 'Эдмунд написал письмо магу воды, которая два месяца изучает разлом в Руинах Астрариума за северным хребтом.',
    stages: [
      { id: 'travel', text: 'Отправляйся в Руины Астрариума: северная дорога через перевал. Ворота руин охраняют каменные стражи.', target: 'region:astrarium', objectives: [{ type: 'reach', region: 'astrarium', label: 'Дойти до руин' }],
        hint: 'Стражи реагируют на отмеченные сектора. Осколки при проходе не расходуются.',
        onDone: { sayChain: ['A21_001', 'A21_002', 'A21_003', 'A21_004', 'A21_005'] } },
      { id: 'meet', text: 'Найди Рокси Мигурдию у лагеря южнее руин и передай письмо.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Передать письмо' }] },
    ],
    rewards: { xp: 60 },
    next: 'roxy_trust',
  }),
  Q('roxy_trust', {
    title: 'Три кристалла', category: 'story', chapter: 4, giver: 'roxy', noAuto: true, requires: { quest: 'ch4_astrarium', status: 'done' },
    summary: 'Рокси Мигурдия изучает разлом. Для запечатывания ей нужны три резонирующих кристалла. Условие: ни одного взрыва в руинах до окончания подготовки.',
    stages: [
      { id: 'crystals', text: 'Принеси Рокси три целых резонирующих кристалла. Синие ленты отмечают колонны, которые нельзя задеть.', target: 'region:astrarium',
        objectives: [{ type: 'collect', item: 'resonance_crystal', n: 3, label: 'Резонирующий кристалл' }] },
      { id: 'return', text: 'Отнеси кристаллы Рокси.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
      { id: 'repair', skipIf: { nv: 'ROXY_EXPLOSION' }, text: 'Помоги Рокси вернуть измерительную стойку в западной галерее на место (рычаг у стены).', target: 'spot:astra_lever',
        objectives: [{ type: 'interact', id: 'astra_lever', label: 'Поднять стойку рычагом' }] },
      { id: 'prep', skipIf: { nv: 'ROXY_EXPLOSION' }, text: 'Вернись к Рокси: она объяснит порядок ритуала.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
      { id: 'ritual', text: 'Рокси замыкает круг. Поговори с ней: готова ли ты. Разрешённый сектор для взрыва: дальний, за белым камнем.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
      { id: 'defend', text: 'Защити круг, пока Рокси запечатывает разлом! Стражи идут двумя волнами.', target: 'spot:astrarium_center', objectives: [{ type: 'kill', camp: 'rift_wave', n: 4, label: 'Стражи разлома' }],
        onStart: { ritualWave: 1 } },
      { id: 'after', text: 'Поговори с Рокси: разлом закрыт.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
      { id: 'join', text: 'После отдыха Рокси ждёт у стены. Поговори с ней.', target: 'npc:roxy', objectives: [{ type: 'talk', label: 'Поговорить с Рокси' }] },
    ],
    rewards: { eris: 100, xp: 200, items: [['book_water', 1]], rel: [['roxy', 20]] },
    next: 'ch4_return',
  }),
  Q('ch4_return', {
    title: 'Карта Эдмунда', category: 'story', chapter: 4, giver: 'edmund', noAuto: true, requires: { quest: 'roxy_trust', status: 'done' },
    summary: 'Разлом запечатан, Рокси идёт с отрядом. Три осколка резонируют на трёх линиях: Эдмунд сведёт их на карте.',
    stages: [
      { id: 'camp', text: 'Дорога обратно: первый общий привал у костра на северной дороге.', target: 'spot:return_camp', objectives: [{ type: 'flag', flag: 'A27_DONE', label: 'Привал у костра' }] },
      { id: 'edmund', text: 'Утром дойдите до Эдмунда в Ольховке: он сравнит показания.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
      { id: 'clara', text: 'Покажите карту Кларе в храме Эрис.', target: 'npc:clara', objectives: [{ type: 'talk', label: 'Поговорить с Кларой' }] },
    ],
    rewards: { xp: 120, flags: ['ch5_hook'] },
    onComplete: { notify: 'Конец доступного сюжета: крипта под храмом остаётся закрытой. Продолжение — в следующих главах.' },
  }),

  // =====================================================================================
  // SIDE QUESTS
  // =====================================================================================
  Q('s_bard_song', {
    title: 'Баллада для архимага', category: 'side', chapter: 2, giver: 'fenrik', requires: [{ flag: 'A10_DONE' }, { flag: 'glade_known' }],
    summary: 'Фенрик пишет балладу о Мегумин. Для куплета ему нужна вещь, которую она принесёт сама: лунный цветок.',
    stages: [
      { id: 'brief', text: 'Поговори с Фенриком о песне (таверна, вечером).', target: 'npc:fenrik', objectives: [{ type: 'talk', label: 'Поговорить с Фенриком' }] },
      { id: 'flower', text: 'Принеси Фенрику отдельный лунный цветок (не из трёх для Висс).', target: 'region:glade', objectives: [{ type: 'collect', item: 'moonflower', n: 1, label: 'Лунный цветок' }] },
      { id: 'give', text: 'Отдай цветок Фенрику и послушай первый куплет.', target: 'npc:fenrik', objectives: [{ type: 'talk', label: 'Поговорить с Фенриком' }] },
    ],
    rewards: { eris: 30, xp: 50, rel: [['fenrik', 20]] },
  }),
].map(([id, q]) => [id, q]));
