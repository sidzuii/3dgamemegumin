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
    next: 'ch5_crypt',
  }),

  // =====================================================================================
  // CHAPTER 5 — under the temple
  // =====================================================================================
  Q('ch5_crypt', {
    title: 'Под храмом', category: 'story', chapter: 5, giver: 'clara', noAuto: true, requires: { quest: 'ch4_return', status: 'done' },
    summary: 'Третий осколок остался в закрытой крипте под храмом Эрис. Клара откроет печать, когда войти будет безопасно: люди выведены, крепления проверены, лампы розданы.',
    stages: [
      { id: 'rest', text: 'Сегодня Клара крипту не откроет. Отдохни (кровать в таверне) и вернись к ней утром.', target: 'npc:clara', objectives: [{ type: 'flag', flag: 'C_RESTED', label: 'Отдохнуть' }],
        hint: 'Кровать: поговори с Дорис в таверне и выбери «Снять комнату». Время сменится по твоему выбору, ждать реальные сутки не нужно.' },
      { id: 'clara', text: 'Поговори с Кларой после отдыха.', target: 'npc:clara', objectives: [{ type: 'talk', label: 'Поговорить с Кларой' }] },
      { id: 'prep', text: 'Подготовь вход (в любом порядке): проверь крепления вместе с Гарреттом, убедись, что в нижней комнате храма никого нет, получи лампы у Луны.', target: 'npc:garret',
        objectives: [
          { type: 'flag', flag: 'C00_GARRET', label: 'Крепления и труба (Гаррет)' },
          { type: 'flag', flag: 'C00_ROOM', label: 'Нижняя комната храма пуста' },
          { type: 'flag', flag: 'C00_LAMPS', label: 'Лампы (Луна)' },
        ] },
      { id: 'seal', text: 'Клара ждёт у входа в крипту на кладбище: она снимет печать.', target: 'npc:clara', objectives: [{ type: 'talk', label: 'Поговорить с Кларой' }] },
      { id: 'descend', text: 'Спустись в крипту. Два удара колокола означают подъём воды: тогда назад, к подъёмнику.', target: 'region:crypt', objectives: [{ type: 'reach', region: 'crypt', label: 'Спуститься в крипту' }],
        hint: 'Две лампы гильдии повесь на крюки у развилок: это отметки возврата. Мегумин и Рокси действуют вместе: Tab меняет героиню.' },
      { id: 'water', text: 'Затопленный проход: сбей три защёлки на западной стене водяным залпом Рокси (Tab, Q), затем Мегумин на галерее повернёт рукоять лебёдки.', target: 'spot:crypt_water',
        objectives: [{ type: 'flag', flag: 'crypt_drained', label: 'Слить воду' }],
        hint: 'Защёлки высоко над полом: залп летит по прицелу. Рукоять поворачивает посох Мегумин.' },
      { id: 'shard', text: 'В центральной нише вращай постамент двумя найденными осколками и достань третий.', target: 'spot:crypt_niche', objectives: [{ type: 'flag', flag: 'C04_DONE', label: 'Третий осколок' }] },
      { id: 'report', text: 'Поднимись подъёмником и доложи в гильдии: Луна, Клара и Эдмунд ждут.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Доклад в гильдии' }] },
    ],
    rewards: { eris: 150, xp: 300, flags: ['crypt_done'] },
    next: 'ch6_relay',
  }),

  // =====================================================================================
  // CHAPTER 6 — beyond the ridge
  // =====================================================================================
  Q('ch6_relay', {
    title: 'По другую сторону хребта', category: 'story', chapter: 6, giver: 'tobias', requires: { quest: 'ch5_crypt', status: 'done' },
    summary: 'Вейр отправил за отчётом на восток. Тобиас знает дорогу к восточному посту Астрариума. На посту остались двое работников.',
    stages: [
      { id: 'tobias', text: 'Поговори с Тобиасом о восточной дороге и перевале.', target: 'npc:tobias', objectives: [{ type: 'talk', label: 'Поговорить с Тобиасом' }] },
      { id: 'road', text: 'Дойди до Восточного перевала (дорога за Ольховкой). Тобиас ждёт у ворот поста.', target: 'region:east_pass', objectives: [{ type: 'reach', region: 'east_pass', label: 'Дойти до перевала' }] },
      { id: 'yard', text: 'Войди в ворота поста: каменные стражи во дворе не пропустят. Осмотри верёвку работников на арке.', target: 'spot:relay_gate_out',
        objectives: [{ type: 'kill', camp: 'relay_yard', n: 2, label: 'Каменные стражи' }, { type: 'flag', flag: 'C06_ROPE', label: 'Осмотреть верёвку на арке' }],
        hint: 'Стражи медленные, но бьют сильно: уклоняйся (Пробел) и бей, когда замах закончился.' },
      { id: 'dan', text: 'В служебном зале за решёткой ждут Дан и Оса. Поговори с ними.', target: 'spot:relay_dan', objectives: [{ type: 'talk', label: 'Поговорить с Даном' }] },
      { id: 'p_dan', skipIf: { not: { var: ['C07_PLAN', '==', 'dan'] } }, text: 'План «Дан первый»: Рокси сбивает защёлку водяным залпом, Мегумин натягивает канат у опоры.', target: 'spot:relay_latch',
        objectives: [{ type: 'flag', flag: 'relay_latch_hit', label: 'Сбить защёлку (Рокси: Tab, Q)' }, { type: 'flag', flag: 'relay_rope_set', label: 'Натянуть канат (Мегумин)' }] },
      { id: 'p_osa', skipIf: { not: { var: ['C07_PLAN', '==', 'osa'] } }, text: 'План «Оса ставит страховку»: закрепи нижний крюк у западной стены, Рокси сбивает защёлку.', target: 'spot:relay_latch',
        objectives: [{ type: 'flag', flag: 'relay_anchor_set', label: 'Закрепить нижний крюк' }, { type: 'flag', flag: 'relay_latch_hit', label: 'Сбить защёлку (Рокси: Tab, Q)' }] },
      { id: 'p_guard', skipIf: { not: { var: ['C07_PLAN', '==', 'guard'] } }, text: 'План «отвести стража»: дойди до дальнего края зала, победи стража-наблюдателя и сбей защёлку.', target: 'spot:relay_far_edge',
        objectives: [{ type: 'reach', spot: 'relay_far_edge', r: 5, label: 'Дойти до дальнего края зала' }, { type: 'flag', flag: 'relay_watch_dead', label: 'Победить стража-наблюдателя' }, { type: 'flag', flag: 'relay_latch_hit', label: 'Сбить защёлку (Рокси: Tab, Q)' }] },
      { id: 'out', text: 'Решётка поднята. Поговори с Даном: он отдаст пропуск.', target: 'spot:relay_dan', objectives: [{ type: 'talk', label: 'Поговорить с Даном' }] },
      { id: 'archive', manual: true, text: 'В архиве на трёх столах лежат документы. Прочитай их все.', target: 'spot:relay_archive',
        objectives: [{ type: 'flag', flag: 'C08_DOC1', label: 'Протокол испытаний' }, { type: 'flag', flag: 'C08_DOC2', label: 'Возражение Орина' }, { type: 'flag', flag: 'C08_DOC3', label: 'Список людей' }] },
      { id: 'lens', text: 'Зал линзы: согласуй две площадки, промой водяной желоб (залп Рокси), затем Мегумин держит рычаг линзы.', target: 'spot:relay_lens',
        objectives: [{ type: 'flag', flag: 'relay_plate_a', label: 'Первая площадка' }, { type: 'flag', flag: 'relay_plate_b', label: 'Вторая площадка' }, { type: 'flag', flag: 'relay_trough_clean', label: 'Промыть желоб (Рокси)' }, { type: 'flag', flag: 'relay_lens_on', label: 'Рычаг линзы (Мегумин)' }],
        hint: 'Рокси стреляет водяным залпом по прицелу (Tab, затем Q). Рычаг держит Мегумин.' },
      { id: 'panel', manual: true, text: 'Стражи постов идут к панели. Защити её.', target: 'spot:relay_panel', objectives: [{ type: 'flag', flag: 'wd_relay_panel', label: 'Защитить панель' }] },
      { id: 'camp', text: 'Вернись на перевал (подъёмник в зале) и присядь к костру у ворот: Рокси хочет поговорить.', target: 'spot:relay_camp', objectives: [{ type: 'talk', label: 'Привал у костра' }] },
    ],
    rewards: { eris: 200, xp: 350, flags: ['ch6_done'] },
    next: 'ch7_gorge',
  }),

  // =====================================================================================
  // CHAPTER 7 — the treaty in the gorge
  // =====================================================================================
  Q('ch7_gorge', {
    title: 'Договор в ущелье', category: 'story', chapter: 7, giver: 'luna', requires: { quest: 'ch6_relay', status: 'done' },
    summary: 'Схема аварийного отвода ведёт в Багровое ущелье. У отвода — договор Вейра с Харзом: разорвать привязку без внешнего канала нельзя.',
    stages: [
      { id: 'luna', text: 'Поговори с Луной: работники вернулись, она оформит заказ на обследование ущелья.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'ledge', manual: true, text: 'Дойди до уступа на лавовой тропе (от Ольховки к ущелью): там застрял обоз.', target: 'region:ledge', objectives: [{ type: 'reach', region: 'ledge', label: 'Дойти до уступа' }] },
      { id: 'p12_cargo', skipIf: { not: { var: ['C12_PLAN', '==', 'cargo'] } }, text: 'План «грузы»: вынеси оба мешка за каменный столб и закрепи канат (Мегумин).', target: 'spot:ledge_cart',
        objectives: [{ type: 'flag', flag: 'ledge_cargo_a', label: 'Первый мешок' }, { type: 'flag', flag: 'ledge_cargo_b', label: 'Второй мешок' }, { type: 'flag', flag: 'ledge_rope_set', label: 'Закрепить канат (Мегумин)' }] },
      { id: 'p12_roxy', skipIf: { not: { var: ['C12_PLAN', '==', 'roxy'] } }, text: 'План «укрепить уступ»: выведи людей из телеги, закрепи канат (Мегумин), Рокси укрепляет край водяным заслоном.', target: 'spot:ledge_cart',
        objectives: [{ type: 'flag', flag: 'ledge_people_out', label: 'Вывести людей' }, { type: 'flag', flag: 'ledge_rope_set', label: 'Закрепить канат (Мегумин)' }, { type: 'flag', flag: 'ledge_crack_fixed', label: 'Водяной заслон (Рокси: Tab, Q)' }] },
      { id: 'p12_rope', skipIf: { not: { var: ['C12_PLAN', '==', 'rope'] } }, text: 'План «канат к оси»: привяжи канат к оси переднего колеса, Рокси укрепляет край водяным заслоном.', target: 'spot:ledge_cart',
        objectives: [{ type: 'flag', flag: 'ledge_axle_set', label: 'Привязать канат к оси' }, { type: 'flag', flag: 'ledge_crack_fixed', label: 'Водяной заслон (Рокси: Tab, Q)' }] },
      { id: 'ledge_out', text: 'Обоз удержан. Поговори с Мартой.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }] },
      { id: 'gorge', text: 'Дойди до Багрового ущелья (тропа дальше по склону). Ворота отвода на южном краю.', target: 'region:crimson_gorge', objectives: [{ type: 'reach', region: 'crimson_gorge', label: 'Дойти до ущелья' }] },
      { id: 'cool', text: 'Спустись к отводу и восстанови две площадки охлаждения: повернуть ручной клапан и охладить плиту залпом Рокси.', target: 'spot:drain_cool',
        objectives: [{ type: 'flag', flag: 'drain_valve_a', label: 'Клапан (левая плита)' }, { type: 'flag', flag: 'drain_cool_a', label: 'Залп на левую плиту (Рокси)' }, { type: 'flag', flag: 'drain_valve_b', label: 'Клапан (правая плита)' }, { type: 'flag', flag: 'drain_cool_b', label: 'Залп на правую плиту (Рокси)' }],
        hint: 'Рокси стреляет водяным залпом по прицелу (Tab, затем Q). Клапаны крутит любая героиня.' },
      { id: 'kharz', text: 'За ограничительной линией ждёт Харз. Поговори с ним; договор лежит на панели слева.', target: 'npc:kharz', objectives: [{ type: 'talk', label: 'Поговорить с Харзом' }] },
      { id: 'explosion', text: 'Освободи ручную заслонку: направленный взрыв в пустую боковую стену у западной стены внешнего отвода (Мегумин, Q).', target: 'spot:drain_wall',
        objectives: [{ type: 'explosion', spot: 'drain_wall', r: 14, label: 'Взрыв в пустую стену' }], onDone: [{ setFlag: 'drain_blast' }, { wave: 'drain_guards' }],
        hint: 'Взрыв: Q. Целься в стену, а не в канал: канал остаётся за аркой.' },
      { id: 'guards', manual: false, text: 'Взрыв разбудил стражей. Рокси держит оборону, пока Мегумин приходит в себя: отбей стражей.', target: 'spot:drain_guards', objectives: [{ type: 'flag', flag: 'wd_drain_guards', label: 'Отбить стражей' }] },
      { id: 'gauge', text: 'Проверь малый поток по трём мерным столбам вдоль западной стены.', target: 'spot:drain_outer',
        objectives: [{ type: 'flag', flag: 'drain_gauge_1', label: 'Первый столб' }, { type: 'flag', flag: 'drain_gauge_2', label: 'Второй столб' }, { type: 'flag', flag: 'drain_gauge_3', label: 'Третий столб' }],
        onDone: [{ sayChain: ['C14_003', 'C14_004'] }] },
      { id: 'decide', text: 'Вернись к Харзу и назови условия: договор или бой. (Можно сначала ещё раз осмотреть отвод.)', target: 'npc:kharz', objectives: [{ type: 'talk', label: 'Решение о Харзе' }] },
      { id: 't_gauge', skipIf: { not: { var: ['KHARZ_ROUTE', '==', 'treaty'] } }, text: 'Договор: сними замер рядом с Харзом (мерный столб справа от панели).', target: 'spot:drain_kharz', objectives: [{ type: 'flag', flag: 'treaty_gauge', label: 'Замер у линии' }] },
      { id: 't_guards', skipIf: { not: { var: ['KHARZ_ROUTE', '==', 'treaty'] } }, text: 'Стражи Вейра пришли разбираться: отбей их.', target: 'spot:veyr_guards', onStart: [{ wave: 'veyr_guards' }], objectives: [{ type: 'flag', flag: 'wd_veyr_guards', label: 'Отбить стражей Вейра' }] },
      { id: 't_release', skipIf: { not: { var: ['KHARZ_ROUTE', '==', 'treaty'] } }, text: 'Сними привязку вместе: Рокси открывает клапан слева, затем Мегумин тянет рычаг справа.', target: 'spot:drain_hall',
        objectives: [{ type: 'flag', flag: 'release_roxy', label: 'Клапан привязки (Рокси)' }, { type: 'flag', flag: 'release_megumin', label: 'Рычаг привязки (Мегумин)' }] },
      { id: 'b_shields', skipIf: { not: { var: ['KHARZ_ROUTE', '==', 'battle'] } }, text: 'Бой: разбей два внешних щита Харза водяными залпами Рокси.', target: 'spot:kharz_arena',
        objectives: [{ type: 'flag', flag: 'kharz_shield_a', label: 'Левый щит (Рокси)' }, { type: 'flag', flag: 'kharz_shield_b', label: 'Правый щит (Рокси)' }] },
      { id: 'b_fight', skipIf: { not: { var: ['KHARZ_ROUTE', '==', 'battle'] } }, text: 'Открой ядро: победи Харза. Он уйдёт ослабленным.', target: 'spot:kharz_arena', onStart: [{ wave: 'kharz_battle' }], objectives: [{ type: 'flag', flag: 'wd_kharz_battle', label: 'Победить Харза' }] },
      { id: 'outro', text: 'Выслушай Вейра у панели.', target: 'spot:drain_projection', objectives: [{ type: 'talk', label: 'Панель Вейра' }] },
    ],
    rewards: { eris: 300, xp: 450, flags: ['ch7_done'] },
    next: 'ch8_city',
  }),

  // =====================================================================================
  // CHAPTER 8 — the city above the machine
  // =====================================================================================
  Q('ch8_city', {
    title: 'Город над машиной', category: 'story', chapter: 8, giver: 'luna', requires: { quest: 'ch7_gorge', status: 'done' },
    summary: 'Внешний отвод защитил город от жара, но установка начала забирать воду из городского резерва. Трубы пусты. Нужно подать воду людям, починить насос и подготовиться к центральному залу.',
    stages: [
      { id: 'hq', text: 'В гильдии штаб: Лина, Бернард, Клара и Луна. Поговори с Луной: куда вести первые бочки?', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'shelter', text: 'Убежище у ратуши: поговори с Линой, вытолкни застрявшую тележку и перекрой опасный проход.', target: 'spot:shelter',
        objectives: [{ type: 'flag', flag: 'C16_DONE', label: 'Поговорить с Линой' }, { type: 'flag', flag: 'shelter_cart', label: 'Вытолкнуть тележку' }, { type: 'flag', flag: 'shelter_block', label: 'Перекрыть проход' }] },
      { id: 'route_res', skipIf: { not: { var: ['WATER_FIRST', '==', 'residents'] } }, text: 'Путь «сначала жителям»: спустись в люк у колодца, пройди боковым тоннелем (западный ход) и повесь две лампы. Стражи обслуживания в тоннеле.', target: 'spot:pump_tunnel',
        objectives: [{ type: 'flag', flag: 'tunnel_lamp_a', label: 'Первая лампа' }, { type: 'flag', flag: 'tunnel_lamp_b', label: 'Вторая лампа' }] },
      { id: 'route_rep', skipIf: { not: { var: ['WATER_FIRST', '==', 'repair'] } }, text: 'Путь «сначала насос»: спустись в люк у колодца, пройди рабочей галереей (восточный ход): возьми ключ насоса и поверни вентиль.', target: 'spot:pump_gallery',
        objectives: [{ type: 'flag', flag: 'gallery_tool', label: 'Ключ насоса' }, { type: 'flag', flag: 'gallery_valve', label: 'Вентиль галереи' }] },
      { id: 'pump_talk', text: 'В насосной ждёт Гаррет. Поговори с ним.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Поговорить с Гарретом' }] },
      { id: 'pump_key', text: 'Мегумин проворачивает заклинивший клапан ключом (Рокси держит воду).', target: 'spot:pump_room', objectives: [{ type: 'talk', label: 'Провернуть клапан (Мегумин)' }] },
      { id: 'p17_shield', skipIf: { not: { var: ['C17_PLAN', '==', 'shield'] } }, text: 'План «щит»: Мегумин ставит ремонтный щит у отверстия, затем Рокси регулирует шов водой.', target: 'spot:pump_seam_b',
        objectives: [{ type: 'flag', flag: 'pump_shield', label: 'Ремонтный щит (Мегумин)' }, { type: 'flag', flag: 'pump_adjusted', label: 'Регулировка шва (Рокси)' }] },
      { id: 'p17_hold', skipIf: { not: { var: ['C17_PLAN', '==', 'hold'] } }, text: 'План «меняемся»: Мегумин держит ключ, а сервисные стражи вышли на рабочую площадку. Защити её.', target: 'spot:pump_guards', onStart: [{ wave: 'pump_guards' }],
        objectives: [{ type: 'flag', flag: 'wd_pump_guards', label: 'Отбить стражей обслуживания' }] },
      { id: 'p17_flow', skipIf: { not: { var: ['C17_PLAN', '==', 'flow'] } }, text: 'План «снизить поток»: закрой нижний вентиль и вентиль подачи на четверть.', target: 'spot:pump_room',
        objectives: [{ type: 'flag', flag: 'pump_valve_a', label: 'Нижний вентиль' }, { type: 'flag', flag: 'pump_valve_b', label: 'Вентиль подачи' }] },
      { id: 'pump_out', text: 'Поговори с Гарретом: насос пошёл.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Поговорить с Гарретом' }] },
      { id: 'veyr', text: 'Включи сервисную панель на северной стене насосной: Вейр вышел на связь.', target: 'spot:service_panel', objectives: [{ type: 'talk', label: 'Сервисная панель' }] },
      { id: 'deep', text: 'Спустись глубже по сервисному ходу. Дан держит лестницу, Оса осталась у нижнего шва.', target: 'npc:dan', objectives: [{ type: 'talk', label: 'Поговорить с Даном' }] },
      { id: 'p19_lever', skipIf: { not: { var: ['C19_PLAN', '==', 'lever'] } }, text: 'План «рычаг»: Мегумин держит рычаг решётки, Рокси сбивает защёлку водяным залпом.', target: 'spot:deep_latch',
        objectives: [{ type: 'flag', flag: 'deep_lever_held', label: 'Удержать рычаг (Мегумин)' }, { type: 'flag', flag: 'deep_latch_hit', label: 'Сбить защёлку (Рокси: Tab, Q)' }] },
      { id: 'p19_latch', skipIf: { not: { var: ['C19_PLAN', '==', 'latch'] } }, text: 'План «защёлка»: Рокси сбивает защёлку, Мегумин помогает Осе.', target: 'spot:deep_latch',
        objectives: [{ type: 'flag', flag: 'deep_latch_hit', label: 'Сбить защёлку (Рокси: Tab, Q)' }, { type: 'flag', flag: 'deep_osa_helped', label: 'Помочь Осе' }] },
      { id: 'p19_breaker', skipIf: { not: { var: ['C19_PLAN', '==', 'breaker'] } }, text: 'План «рубильник»: поднимись на верхний уступ (восточный проход) и выключи рубильник панели.', target: 'spot:deep_ledge',
        objectives: [{ type: 'reach', spot: 'deep_ledge', r: 5, label: 'Подняться на уступ' }, { type: 'flag', flag: 'deep_breaker_off', label: 'Выключить рубильник' }] },
      { id: 'deep_out', text: 'Решётка открыта. Поговори с Осой.', target: 'npc:osa', objectives: [{ type: 'talk', label: 'Поговорить с Осой' }] },
      { id: 'link', text: 'Поставь модуль связи в гнездо на северной стене шахты и подай питание.', target: 'spot:deep_hall',
        objectives: [{ type: 'flag', flag: 'link_socket', label: 'Установить модуль' }, { type: 'flag', flag: 'link_power', label: 'Подать питание' }] },
      { id: 'link_check', text: 'Проверь связь на контрольной панели: Эдмунд и Луна на линии.', target: 'spot:deep_hall', objectives: [{ type: 'talk', label: 'Проверить связь' }] },
    ],
    rewards: { eris: 300, xp: 500, flags: ['ch8_done'] },
    next: 'ch9_capsule',
  }),

  // =====================================================================================
  // CHAPTER 9 — the one who called
  // =====================================================================================
  Q('ch9_capsule', {
    title: 'Тот, кто позвал', category: 'story', chapter: 9, giver: 'luna', requires: { quest: 'ch8_city', status: 'done' },
    summary: 'Сервисный ход открыт. В центральном зале установки ждёт Вейр: его тело лежит в капсуле тридцать лет. Малая проба, бой за управление, выход Вейра и решение об установке.',
    stages: [
      { id: 'gallery', text: 'Пройди сервисные галереи (северо-восточный выход глубокой шахты) до центрального зала. Стражи обслуживания охраняют ход.', target: 'spot:core_hall',
        objectives: [{ type: 'reach', spot: 'core_hall', r: 6, label: 'Дойти до центрального зала' }] },
      { id: 'veyr', text: 'Подойди к панели Вейра на северной стене зала.', target: 'spot:veyr_panel', objectives: [{ type: 'talk', label: 'Панель Вейра' }] },
      { id: 'rules', text: 'Включи консоль связи слева у входа: Эдмунд и Луна обсудят правила малой пробы.', target: 'spot:core_hall', objectives: [{ type: 'talk', label: 'Консоль связи' }] },
      { id: 'mark', text: 'Осмотри и отметь выключатель (слева), нижний кабель (левая стойка) и усилитель старого канала (правая стена).', target: 'spot:core_rack',
        objectives: [{ type: 'flag', flag: 'core_switch', label: 'Выключатель' }, { type: 'flag', flag: 'core_cable_marked', label: 'Кабель' }, { type: 'flag', flag: 'core_amp', label: 'Усилитель' }] },
      { id: 'holders', text: 'Поставь три регулятора (осколка) во временные держатели. Они остаются у отряда.', target: 'spot:core_arena',
        objectives: [{ type: 'flag', flag: 'holder_1', label: 'Первый держатель' }, { type: 'flag', flag: 'holder_2', label: 'Второй держатель' }, { type: 'flag', flag: 'holder_3', label: 'Третий держатель' }] },
      { id: 'probe', text: 'Проверь малый поток по двум мерным столбам у южной части зала.', target: 'spot:core_arena',
        objectives: [{ type: 'flag', flag: 'core_gauge_1', label: 'Левый столб' }, { type: 'flag', flag: 'core_gauge_2', label: 'Правый столб' }], onDone: [{ setFlag: 'core_hot' }, { scene: 'C23a' }] },
      { id: 'breach', manual: true, text: 'Вейр включил старый канал: отбей стражей усилителя, Рокси охлаждает два верхних шва, Мегумин размыкает кабель посохом.', target: 'spot:core_rack',
        objectives: [{ type: 'flag', flag: 'wd_amp_guards', label: 'Отбить стражей усилителя' }, { type: 'flag', flag: 'core_seam_a', label: 'Левый шов (Рокси)' }, { type: 'flag', flag: 'core_seam_b', label: 'Правый шов (Рокси)' }, { type: 'flag', flag: 'core_cable_cut', label: 'Разомкнуть кабель (Мегумин)' }] },
      { id: 'battle1', manual: true, text: 'Бой за управление: сервисные стражи держат старую команду. Отбей первую волну.', target: 'spot:core_arena',
        onStart: [{ wave: 'ctrl_wave1' }, { sayChain: ['C24_001', 'C24_002'] }], objectives: [{ type: 'flag', flag: 'wd_ctrl_wave1', label: 'Первая волна' }] },
      { id: 'valve', skipIf: { var: ['VEYR_HELP', '==', true] }, text: 'Рокси держит шов: открой клапан под лестницей (левый угол у входа).', target: 'spot:core_hall', objectives: [{ type: 'flag', flag: 'core_valve', label: 'Клапан под лестницей' }] },
      { id: 'battle2', manual: true, text: 'Последний страж питается от двух боковых постов: сними питание обоих и победи его.', target: 'spot:core_arena',
        onStart: [{ wave: 'ctrl_wave2' }], objectives: [{ type: 'flag', flag: 'post_l_off', label: 'Левый пост' }, { type: 'flag', flag: 'post_r_off', label: 'Правый пост' }, { type: 'flag', flag: 'wd_ctrl_wave2', label: 'Победить стража' }] },
      { id: 'capsule', text: 'Выведи Вейра: сбрось давление клапаном справа от капсулы, затем поверни нижнюю ручку.', target: 'spot:core_capsule',
        objectives: [{ type: 'talk', label: 'Открыть капсулу (клапан, затем нижняя ручка)' }] },
      { id: 'decision', text: 'Реши судьбу установки: панель отчётов у северной стены справа. Можно осмотреть схему и вернуться к решению.', target: 'spot:veyr_panel', objectives: [{ type: 'talk', label: 'Панель отчётов' }] },
    ],
    rewards: { eris: 400, xp: 600, flags: ['ch9_done'] },
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
