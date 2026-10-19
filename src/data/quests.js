/**
 * Quests. Story quests drive the chapters; contracts come from the guild board; side quests
 * come from people. Stage objectives: see rpg/Quests.js. `target` points the compass/map.
 * `hint` appears as a gentle tutorial note when the stage begins.
 */
import { CAPITAL_QUESTS } from './quests_capital.js';

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
        hint: 'ЛКМ — удар посохом. Следующий удар нажимай в конце предыдущего — выйдет серия из трёх. ПКМ — защита, Space / V — уклонение.',
        onDone: { setFlag: 'skill_M_Q', notify: 'Бран показал Проламывающий выпад: Q — шаг и удар торцом посоха по одной цели (22 выносливости, перезарядка 7 с).' } },
      { id: 'bran2', text: 'Вернись к Брану: теперь большая мишень в центре поля.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
      { id: 'magic', text: 'Дождись сигнала Брана и ударь Explosion по центру поля (R, затем ЛКМ).', target: 'spot:training_center', objectives: [{ type: 'explosion', spot: 'training_center', r: 14, label: 'Заклинание по центру поля' }],
        hint: 'X — выбрать Explosion: на земле два контура (центр 2,5 м, край 5,5 м), цель на расстоянии 8–25 м. ЛКМ — подтвердить, подготовка 2,4 с (Space или ПКМ — отмена). После выпуска — истощение 12 с.',
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

  // --- Combat training (docs/combat/04 §1–2) ---
  Q('cb01_breach', {
    title: 'Направленная сила', category: 'side', chapter: 1, giver: 'bran', noAuto: true, requires: { quest: 'ch1_name', status: 'done' },
    summary: 'После ранга E Бран показывает Мегумин вторую технику: Алый пролом идёт по земле узким фронтом, а не куполом. Две мишени вдоль прохода, крайние стойки остаются.',
    stages: [
      { id: 'talk', text: 'Поговори с Браном на тренировочном поле.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
      { id: 'lane', text: 'Проведи Алый пролом по двум мишеням вдоль прохода (F, затем ЛКМ).', target: 'spot:training_lane', objectives: [{ type: 'custom', name: 'breach_lane', n: 2, label: 'Мишени на линии' }],
        hint: 'F — выбрать Алый пролом: полоса показывает длину и место, где волна остановится. ЛКМ — подтвердить; 1,10 с подготовки, потом фронт идёт 16 м/с. Цена 45 маны, истощения нет.' },
      { id: 'again', text: 'Повтори: мишени встали заново. Выбери момент, пока они на линии.', target: 'spot:training_lane', objectives: [{ type: 'custom', name: 'breach_lane', n: 2, label: 'Мишени на линии (второй проход)' }] },
      { id: 'report', text: 'Доложи Брану.', target: 'npc:bran', objectives: [{ type: 'talk', label: 'Поговорить с Браном' }] },
    ],
    rewards: { xp: 40, eris: 30, flags: ['cb01_done'] },
  }),
  Q('cb02_pair', {
    title: 'Роли в паре', category: 'side', chapter: 4, giver: 'roxy', noAuto: true, requires: { flag: 'roxy_companion' },
    summary: 'Рокси предлагает отработать связку на тренировочном поле: хлыст, встречный укол, обвал. Участок необязателен: карточки навыков доступны и без него.',
    stages: [
      { id: 'talk', text: 'Выслушай план Рокси на тренировочном поле.', target: 'spot:training_center', objectives: [{ type: 'custom', name: 'cb02_scene', label: 'Поговорить с Рокси' }] },
      { id: 'whip', text: 'Переключись на Рокси (Tab) и зацепи мишень на линии Водяным хлыстом (Q).', target: 'spot:training_lane', objectives: [{ type: 'custom', name: 'whip_dummy', n: 1, label: 'Хлыст по мишени' }],
        hint: 'Q — Водяной хлыст: дуга 90°, 7 м. Лёгкую цель подтягивает на метр, тяжёлых и боссов нет. Задетая цель Намокает на 6 с.' },
      { id: 'counter', text: 'Отведи лёгкий удар учебного гоблина Встречным уколом (E, окно 0,10–0,24 с).', target: 'spot:training_center', objectives: [{ type: 'custom', name: 'parry', n: 1, label: 'Отвести удар' }],
        onStart: { wave: 'cb02_goblin' }, hint: 'R — Встречный укол. Сработает на лёгкий удар спереди, красные удары не отводятся. Успех отвечает усиленным уколом.' },
      { id: 'tidal', text: 'Накрой Приливным обвалом три мишени сразу (F, ЛКМ), затем смени героиню.', target: 'spot:training_cluster', objectives: [{ type: 'custom', name: 'tidal_dummy', n: 3, label: 'Мишени под обвалом' }],
        hint: 'F — выбрать область (радиус 4,5 м, до 14 м). Вода падает с задержкой; Намокание держится 6 с: следующий взрывной удар Мегумин получит +10%.' },
      { id: 'report', text: 'Вернись к плану Рокси.', target: 'spot:training_center', objectives: [{ type: 'custom', name: 'cb02_done', label: 'Подвести итог' }] },
    ],
    rewards: { xp: 60, flags: ['cb02_done'] },
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
        hint: 'Держи дистанцию: ЛКМ — серия посохом, Q / R — навыки, ПКМ — защита, Space — уклонение. Зелья: 3 — исцеление, 4 — бодрость (общая задержка 20 с).' },
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
    // one after another: the song sends her to Clara, Clara sends her to Bernard (a save inside the old single stage moves on by its flags)
    stages: [
      { id: 'talks', text: 'Вечером в таверне поёт Фенрик. Послушай песню.', target: 'npc:fenrik',
        objectives: [{ type: 'flag', flag: 'A10_DONE', label: 'Фенрик и песня (таверна, вечером)' }] },
      { id: 'clara', text: 'Фенрик спел о звёздах под городом. Клара хранит записи тех лет — спроси её в храме.', target: 'npc:clara',
        objectives: [{ type: 'flag', flag: 'A11_DONE', label: 'Клара и легенда (храм)' }] },
      { id: 'bernard', text: 'Клара сказала: Бернард наблюдает свет над хребтом. После заката он на северной стене.', target: 'npc:bernard',
        objectives: [{ type: 'flag', flag: 'A12_DONE', label: 'Бернард на стене (после заката)' }] },
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
        hint: 'Завал разбирается только взрывом Explosion: отойди подальше, прицелься (R, ЛКМ). Алый пролом его не откроет. Глубокий ход оставь на потом.' },
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
      { id: 'water', text: 'Затопленный проход: сбей три защёлки на западной стене водяным залпом Рокси (Tab, R), затем Мегумин на галерее повернёт рукоять лебёдки.', target: 'spot:crypt_water',
        objectives: [{ type: 'flag', flag: 'crypt_drained', label: 'Слить воду' }],
        hint: 'Защёлки высоко над полом: залп летит по прицелу. Рукоять поворачивает посох Мегумин.' },
      { id: 'shard', text: 'В центральной нише вращай постамент двумя найденными осколками и достань третий.', target: 'spot:crypt_niche', objectives: [{ type: 'flag', flag: 'C04_DONE', label: 'Третий осколок' }] },
      { id: 'report', text: 'Поднимись подъёмником и доложи в гильдии: Луна, Клара и Эдмунд ждут.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Доклад в гильдии' }] },
    ],
    rewards: { eris: 150, xp: 300, flags: ['crypt_done'] },
    next: 'ainstrey_road',
  }),

  // =====================================================================================
  // CHAPTER 6 (version 2.0) — the Stone Ledge: the road to Ainstrey (docs/ainstrey/06_Глава_Айнстрея.md, D00-D13)
  // =====================================================================================
  Q('ainstrey_road', {
    title: 'Проход к Айнстрею', category: 'story', chapter: 6, giver: 'luna', noAuto: true, requires: { quest: 'ch5_crypt', status: 'done' },
    summary: 'Столица прислала бригаду расчистить обвал на тракте у Каменного уступа и попросила мага воды и человека, который умеет выбрать точку разрушения. Луна даёт письмо для Селии Морн; дорогу открывают вместе с бригадой Нэры Вальд.',
    stages: [
      { id: 'luna', text: 'Зайди к Луне: письмо для Селии Морн в столичной гильдии и задание от бригады.', target: 'npc:luna', objectives: [{ type: 'talk', label: 'Поговорить с Луной' }] },
      { id: 'nera', text: 'Тобиас идёт до Ольховки. Найди у колодца Нэру Вальд: она ведёт бригаду, которая восстанавливает тракт.', target: 'npc:nera', objectives: [{ type: 'talk', label: 'Поговорить с Нэрой' }] },
      { id: 'edmund', text: 'Эдмунд передаст запрос архивисту столицы и прибор для дороги.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
      { id: 'sack', text: 'У выхода из Ольховки лежит мешок креплений Гаррета. Забери его.', target: 'spot:olkhovka_sack', objectives: [{ type: 'flag', flag: 'olk_sack_taken', label: 'Взять мешок креплений' }] },
      { id: 'doren', text: 'Перевальные ворота за Ольховкой (дорога на восток, мимо Восточного поста) ведут на столичный тракт. Дойди до Каменного уступа и поговори с бригадиром Дореном.', target: 'npc:doren',
        objectives: [{ type: 'talk', label: 'Поговорить с Дореном' }],
        hint: 'Ворота перевала стоят справа от ущелья у поста. За сигнальными шестами без знака бригадира не ходи.' },
      { id: 'survey', manual: true, text: 'Осмотри три места у завала (в любом порядке): верхний карман, шов опорной плиты, зажатую лебёдку. Дополнительно, пока не начал основное: найди на лестнице панель старого поста и отключи её прибором Эдмунда.', target: 'spot:ledge_slab_edge',
        objectives: [{ type: 'flag', flag: 'survey_water', label: 'Верхний карман (Рокси)' }, { type: 'flag', flag: 'survey_slab', label: 'Опорная плита (Мегумин)' }, { type: 'flag', flag: 'survey_winch', label: 'Лебёдка' }],
        hint: 'Tab меняет героиню: малый поток у кармана держит Рокси, закрытый крепёж проверяет посохом Мегумин. Лестница на верхнюю площадку идёт вдоль северной стены.' },
      { id: 'drain_talk', text: 'Поговори с Нэрой: куда отвести воду верхнего кармана.', target: 'npc:nera', objectives: [{ type: 'talk', label: 'Поговорить с Нэрой' }] },
      { id: 'p_ditch', skipIf: { not: { var: ['DRAIN_ROUTE', '==', 'ditch'] } }, text: 'Сухая канава: поставь сигнальный шест, перенеси две секции ограды на верхней площадке, затем Рокси откроет слив кармана.', target: 'spot:ledge_pocket_gate',
        objectives: [{ type: 'flag', flag: 'ditch_pole', label: 'Сигнальный шест' }, { type: 'flag', flag: 'ditch_fence_a', label: 'Первая секция ограды' }, { type: 'flag', flag: 'ditch_fence_b', label: 'Вторая секция ограды' }, { type: 'flag', flag: 'pocket_drained', label: 'Слив кармана (Рокси)' }] },
      { id: 'p_service', skipIf: { not: { var: ['DRAIN_ROUTE', '==', 'service'] } }, text: 'Служебный сток: сними две решётки на нижней площадке (рычаг у Мегумина), Рокси промоет глину из выхода, затем откроет слив кармана.', target: 'spot:ledge_service_outlet',
        objectives: [{ type: 'flag', flag: 'service_grate_a', label: 'Первая решётка' }, { type: 'flag', flag: 'service_grate_b', label: 'Вторая решётка' }, { type: 'flag', flag: 'service_flush', label: 'Промыть выход (Рокси: Tab, Q)' }, { type: 'flag', flag: 'pocket_drained', label: 'Слив кармана (Рокси)' }] },
      { id: 'brace', text: 'Поставь две опоры под косую плиту (крепления Гаррета), затем проверь их под малой нагрузкой.', target: 'spot:ledge_slab_edge',
        objectives: [{ type: 'flag', flag: 'ledge_brace_a', label: 'Первая опора' }, { type: 'flag', flag: 'ledge_brace_b', label: 'Вторая опора' }, { type: 'flag', flag: 'D06_DONE', label: 'Проверка под нагрузкой' }],
        hint: 'После проверки у костра рабочей площадки можно передохнуть: силы восстановятся.' },
      { id: 'method', text: 'Рабочие вышли за шесты. Передохни у костра, если нужно, и поговори с Нэрой: выберите способ расчистки.', target: 'npc:nera', objectives: [{ type: 'talk', label: 'Поговорить с Нэрой' }] },
      { id: 'p_expl', skipIf: { not: { var: ['CLEARING_METHOD', '==', 'explosion'] } }, text: 'Взрыв: Рокси держит отвод. Встань в подготовленной зоне и ударь Взрывом (Мегумин, Q) по валуну с белой отметкой.', target: 'spot:ledge_white_mark',
        objectives: [{ type: 'flag', flag: 'ledge_main_cleared', label: 'Взрыв по белой отметке' }],
        hint: 'Неподготовленный удар по склону дорогу не откроет. Взрыв (Q) берёт обычную ману и вызывает истощение.' },
      { id: 'p_winch', skipIf: { not: { var: ['CLEARING_METHOD', '==', 'winch'] } }, text: 'Лебёдка: чередуй обороты рукояти (Мегумин) и водяной поток по нижнему краю плиты (Рокси, Tab, Q), затем уходи за шесты.', target: 'spot:ledge_slab_edge',
        objectives: [{ type: 'flag', flag: 'winch_turn_a', label: 'Два оборота рукояти' }, { type: 'flag', flag: 'winch_flow_a', label: 'Поток по краю плиты (Рокси)' }, { type: 'flag', flag: 'winch_turn_b', label: 'Ещё два оборота' }, { type: 'flag', flag: 'winch_flow_b', label: 'Поток по краю плиты (Рокси)' }, { type: 'flag', flag: 'winch_safe', label: 'Отойти за шесты' }] },
      { id: 'g_off', skipIf: { not: { v: 'ROAD_POST_DISABLED' } }, manual: true, text: 'Пост отключён: стражи стоят. Поговори с Нэрой.', target: 'npc:nera', objectives: [{ type: 'talk', label: 'Поговорить с Нэрой' }], onStart: [{ scene: 'D08a' }] },
      { id: 'g_fight', skipIf: { v: 'ROAD_POST_DISABLED' }, manual: true, text: 'Старый пост проснулся: двое каменных стражей выходят к отметкам в проходе. Останови их, не отходя от отвода.', target: 'spot:road_guard_a',
        objectives: [{ type: 'flag', flag: 'wd_road_guards', label: 'Каменные стражи' }], onStart: [{ wave: 'road_guards' }],
        hint: 'При истощении Мегумин вступает Рокси (Tab меняет героиню вручную). Стражи сначала встают на отметки и поднимают руки.' },
      { id: 'cleanup', text: 'Помоги бригаде убрать остатки: сними цепь с валуна, перенеси три отмеченных обломка с рабочей полосы, поправь настил у края.', target: 'spot:ledge_pass',
        objectives: [{ type: 'flag', flag: 'ledge_chain_off', label: 'Снять цепь' }, { type: 'flag', flag: 'ledge_debris_a', label: 'Первый обломок' }, { type: 'flag', flag: 'ledge_debris_b', label: 'Второй обломок' }, { type: 'flag', flag: 'ledge_debris_c', label: 'Третий обломок' }, { type: 'flag', flag: 'ledge_deck_fixed', label: 'Поправить настил' }] },
      { id: 'carts_empty', text: 'Дай знак колоколом у шестов: пустая телега проверит проход.', target: 'spot:ledge_safe', objectives: [{ type: 'flag', flag: 'cart_empty_ok', label: 'Пустая телега прошла' }], onStart: [{ setFlag: 'ledge_barrier_open' }] },
      { id: 'carts_loaded', text: 'Теперь гружёная телега: дай знак и посмотри, как она пройдёт.', target: 'spot:ledge_safe', objectives: [{ type: 'flag', flag: 'cart_loaded_ok', label: 'Гружёная телега прошла' }] },
      { id: 'act', text: 'Поговори с Нэрой: акт открытия дороги и награда отряду.', target: 'npc:nera', objectives: [{ type: 'talk', label: 'Получить акт' }], onDone: [{ eris: 200 }, { notify: 'Дорога к Айнстрею открыта. Награда отряду: 200 эрис. Путь назад остаётся свободным.' }] },
      { id: 'view', manual: true, text: 'Иди по тракту к Меловым склонам: с обзорной площадки видно стены столицы.', target: 'spot:chalk_view', objectives: [{ type: 'reach', spot: 'chalk_view', r: 26, label: 'Дойти до обзорной площадки' }] },
      { id: 'fork', text: 'У развилки на тракте Лисса Рейн ждёт путников. Поговори с ней.', target: 'npc:lissa', objectives: [{ type: 'talk', label: 'Поговорить с Лиссой' }] },
      { id: 'mills_talk', text: 'Белые мельницы: Лисса просит помочь остановить колесо на минуту.', target: 'npc:lissa', objectives: [{ type: 'talk', label: 'Поговорить с Лиссой' }] },
      { id: 'mills_task', text: 'Держи рычаг колеса (Мегумин), затем достань обломок щипцами.', target: 'spot:mill_wheel',
        objectives: [{ type: 'flag', flag: 'wheel_stopped', label: 'Остановить колесо (рычаг)' }, { type: 'flag', flag: 'wheel_debris', label: 'Достать обломок' }] },
      { id: 'dam', text: 'Южная дамба: Лисса ждёт у моста перед постом.', target: 'npc:lissa', objectives: [{ type: 'talk', label: 'Поговорить с Лиссой' }] },
    ],
    rewards: { xp: 400, flags: ['ainstrey_road_done'] },
    next: 'ainstrey_city',
  }),

  // =====================================================================================
  // CHAPTER 6 — beyond the ridge
  // =====================================================================================
  Q('ch6_relay', {
    title: 'По другую сторону хребта', category: 'story', chapter: 6, giver: 'tobias', requires: { quest: 'ainstrey_city', status: 'done' },
    summary: 'Вейр отправил за отчётом на восток. Тобиас знает дорогу к восточному посту Астрариума. На посту остались двое работников.',
    stages: [
      { id: 'tobias', text: 'Поговори с Тобиасом о восточной дороге и перевале.', target: 'npc:tobias', objectives: [{ type: 'talk', label: 'Поговорить с Тобиасом' }] },
      { id: 'road', text: 'Дойди до Восточного перевала (дорога за Ольховкой). Тобиас ждёт у ворот поста.', target: 'region:east_pass', objectives: [{ type: 'reach', region: 'east_pass', label: 'Дойти до перевала' }] },
      { id: 'yard', text: 'Войди в ворота поста: каменные стражи во дворе не пропустят. Осмотри верёвку работников на арке.', target: 'spot:relay_gate_out',
        objectives: [{ type: 'kill', camp: 'relay_yard', n: 2, label: 'Каменные стражи' }, { type: 'flag', flag: 'C06_ROPE', label: 'Осмотреть верёвку на арке' }],
        hint: 'Стражи медленные, но бьют сильно: уклоняйся (Пробел) и бей, когда замах закончился.' },
      { id: 'dan', text: 'В служебном зале за решёткой ждут Дан и Оса. Поговори с ними.', target: 'spot:relay_dan', objectives: [{ type: 'talk', label: 'Поговорить с Даном' }] },
      { id: 'p_dan', skipIf: { not: { var: ['C07_PLAN', '==', 'dan'] } }, text: 'План «Дан первый»: Рокси сбивает защёлку водяным залпом, Мегумин натягивает канат у опоры.', target: 'spot:relay_latch',
        objectives: [{ type: 'flag', flag: 'relay_latch_hit', label: 'Сбить защёлку (Рокси: Tab, R)' }, { type: 'flag', flag: 'relay_rope_set', label: 'Натянуть канат (Мегумин)' }] },
      { id: 'p_osa', skipIf: { not: { var: ['C07_PLAN', '==', 'osa'] } }, text: 'План «Оса ставит страховку»: закрепи нижний крюк у западной стены, Рокси сбивает защёлку.', target: 'spot:relay_latch',
        objectives: [{ type: 'flag', flag: 'relay_anchor_set', label: 'Закрепить нижний крюк' }, { type: 'flag', flag: 'relay_latch_hit', label: 'Сбить защёлку (Рокси: Tab, R)' }] },
      { id: 'p_guard', skipIf: { not: { var: ['C07_PLAN', '==', 'guard'] } }, text: 'План «отвести стража»: дойди до дальнего края зала, победи стража-наблюдателя и сбей защёлку.', target: 'spot:relay_far_edge',
        objectives: [{ type: 'reach', spot: 'relay_far_edge', r: 5, label: 'Дойти до дальнего края зала' }, { type: 'flag', flag: 'relay_watch_dead', label: 'Победить стража-наблюдателя' }, { type: 'flag', flag: 'relay_latch_hit', label: 'Сбить защёлку (Рокси: Tab, R)' }] },
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
        objectives: [{ type: 'flag', flag: 'ledge_people_out', label: 'Вывести людей' }, { type: 'flag', flag: 'ledge_rope_set', label: 'Закрепить канат (Мегумин)' }, { type: 'flag', flag: 'ledge_crack_fixed', label: 'Водяной заслон (Рокси: Tab, R)' }] },
      { id: 'p12_rope', skipIf: { not: { var: ['C12_PLAN', '==', 'rope'] } }, text: 'План «канат к оси»: привяжи канат к оси переднего колеса, Рокси укрепляет край водяным заслоном.', target: 'spot:ledge_cart',
        objectives: [{ type: 'flag', flag: 'ledge_axle_set', label: 'Привязать канат к оси' }, { type: 'flag', flag: 'ledge_crack_fixed', label: 'Водяной заслон (Рокси: Tab, R)' }] },
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
        objectives: [{ type: 'flag', flag: 'deep_lever_held', label: 'Удержать рычаг (Мегумин)' }, { type: 'flag', flag: 'deep_latch_hit', label: 'Сбить защёлку (Рокси: Tab, R)' }] },
      { id: 'p19_latch', skipIf: { not: { var: ['C19_PLAN', '==', 'latch'] } }, text: 'План «защёлка»: Рокси сбивает защёлку, Мегумин помогает Осе.', target: 'spot:deep_latch',
        objectives: [{ type: 'flag', flag: 'deep_latch_hit', label: 'Сбить защёлку (Рокси: Tab, R)' }, { type: 'flag', flag: 'deep_osa_helped', label: 'Помочь Осе' }] },
      { id: 'p19_breaker', skipIf: { not: { var: ['C19_PLAN', '==', 'breaker'] } }, text: 'План «рубильник»: поднимись на верхний уступ (восточный проход) и выключи рубильник панели.', target: 'spot:deep_ledge',
        objectives: [{ type: 'reach', spot: 'deep_ledge', r: 5, label: 'Подняться на уступ' }, { type: 'flag', flag: 'deep_breaker_off', label: 'Выключить рубильник' }] },
      { id: 'deep_out', text: 'Решётка открыта. Поговори с Осой.', target: 'npc:osa', objectives: [{ type: 'talk', label: 'Поговорить с Осой' }] },
      { id: 'link', text: 'Поставь модуль связи в гнездо на северной стене шахты и подай питание.', target: 'spot:deep_hall',
        objectives: [{ type: 'flag', flag: 'link_socket', label: 'Установить модуль' }, { type: 'flag', flag: 'link_power', label: 'Подать питание' }] },
      { id: 'link_check', text: 'Проверь связь на контрольной панели: Эдмунд и Луна на линии.', target: 'spot:deep_hall', objectives: [{ type: 'talk', label: 'Проверить связь' }] },
    ],
    rewards: { eris: 300, xp: 500, flags: ['ch8_done'] },
  }),

  // =====================================================================================
  // SIDE STORIES of the scenario package (docs/story/04): B10, B13-B23. Started by the giver's dialogue (`noAuto`).
  // =====================================================================================
  Q('c_night_raid', {
    title: 'Ночной налёт', category: 'side', chapter: 2, giver: 'boris', noAuto: true, requires: { rank: 'E' },
    summary: 'Борис видел у лампы тени: грибы ходят на поле по ночам. Он ставит сторожа и просит помочь.',
    stages: [
      { id: 'brief', text: 'Поговори с Борисом на ферме о ночном налёте.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
      { id: 'prep_carts', skipIf: { not: { var: ['B10_PLAN', '==', 'carts'] } }, text: 'Подкати две пустые телеги к проходу (у фермы): грибы пойдут через сухой проход.', target: 'spot:farmhouse',
        objectives: [{ type: 'flag', flag: 'field_cart_a', label: 'Первая телега' }, { type: 'flag', flag: 'field_cart_b', label: 'Вторая телега' }] },
      { id: 'prep_lantern', skipIf: { not: { var: ['B10_PLAN', '==', 'lantern'] } }, text: 'Повесь фонарь у камня за амбаром: грибы выйдут на пустой участок.', target: 'spot:barn', objectives: [{ type: 'flag', flag: 'field_lantern', label: 'Фонарь у камня' }] },
      { id: 'night', text: 'Дождись ночи (после 21:00) и встреть налёт на поле Бориса: две волны. Спать можно в таверне.', target: 'spot:night_field',
        objectives: [{ type: 'flag', flag: 'wd_raid2', label: 'Отбить две волны' }], hint: 'Первая волна — три гриба: отвлекай их. Во второй защищай ограждение.' },
      { id: 'after', text: 'Поговори с Борисом: ночь прошла.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
    ],
    rewards: { eris: 80, xp: 90 },
  }),
  Q('c_cache_bridge', {
    title: 'Тайник под Лунным мостом', category: 'side', chapter: 1, giver: 'lina', noAuto: true, requires: { member: true },
    summary: 'Лина заметила под Лунным мостом старую лестницу и ящик бесхозного склада. Нужно направить рычагом старую платформу под нишу.',
    stages: [
      { id: 'brief', text: 'Поговори с Линой о лестнице под Лунным мостом.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
      { id: 'find', text: 'Под Лунным мостом (южный берег) поверни рычаг старой платформы с берега.', target: 'spot:east_bridge', objectives: [{ type: 'flag', flag: 'cache_bridge_lever', label: 'Платформа под нишу' }] },
    ],
    rewards: { eris: 30, xp: 40, items: [['rope_kit', 1], ['iron_ore', 2]] },
  }),
  Q('c_cache_oak', {
    title: 'Холм с дубом', category: 'side', chapter: 1, giver: 'rann', noAuto: true, requires: { member: true },
    summary: 'Ранн вспомнил детский тайник под дубом на гребне между Развилкой и рощей.',
    stages: [
      { id: 'brief', text: 'Поговори с Ранном о тайнике под дубом.', target: 'npc:rann', objectives: [{ type: 'talk', label: 'Поговорить с Ранном' }] },
      { id: 'find', text: 'У одинокого дуба на гребне расчисти подход и найди защёлку на деревянной крышке.', target: 'spot:hill_oak',
        objectives: [{ type: 'flag', flag: 'cache_oak_cleared', label: 'Расчистить подход' }, { type: 'flag', flag: 'cache_oak_open', label: 'Открыть крышку' }] },
    ],
    rewards: { eris: 60, xp: 45, flags: ['safe_descent_map'] },
  }),
  Q('c_cache_pond', {
    title: 'Камышовый пруд', category: 'side', chapter: 1, giver: 'boris', noAuto: true, requires: { member: true },
    summary: 'В камышах у пруда у Ольховки привязана бочка со знаком старого снабжения.',
    stages: [
      { id: 'brief', text: 'Поговори с Борисом о бочке в камышах.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
      { id: 'find', text: 'У камышового пруда подними бочку: ручным блоком с берега или водяным залпом Рокси (Tab, R).', target: 'spot:cache_pond_barrel', objectives: [{ type: 'flag', flag: 'cache_pond_done', label: 'Поднять бочку' }] },
    ],
    rewards: { eris: 40, xp: 40, items: [['waterproof_case', 1], ['hp_potion', 1]] },
  }),
  Q('c_cache_tar', {
    title: 'Поляна смолокуров', category: 'side', chapter: 1, giver: 'marta', noAuto: true, requires: { member: true },
    summary: 'У старых печей смолокуров осталась кладовая инструментов под каменной крышкой.',
    stages: [
      { id: 'brief', text: 'Поговори с Мартой о старых печах.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }] },
      { id: 'find', text: 'На поляне смолокуров (в бору севернее Развилки) собери рукоять из двух частей и подними каменную крышку. Без огня.', target: 'spot:tar_camp_door',
        objectives: [{ type: 'flag', flag: 'cache_tar_part_a', label: 'Первая часть' }, { type: 'flag', flag: 'cache_tar_part_b', label: 'Вторая часть' }, { type: 'flag', flag: 'cache_tar_open', label: 'Поднять крышку' }] },
    ],
    rewards: { eris: 40, xp: 45, items: [['tar_tools', 1]] },
  }),
  Q('s_roxy_water', {
    title: 'Рокси: работа вдвоём', category: 'side', chapter: 5, giver: 'wiss', noAuto: true, requires: [{ quest: 'ch5_crypt', status: 'done' }, { flag: 'roxy_companion' }],
    summary: 'Вода северного источника изменила вкус: в пробе много соли. Висс просит Рокси проверить источник, а Мегумин — закрыть затвор.',
    stages: [
      { id: 'brief', text: 'Поговори с Висс: проба воды с севера.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Поговорить с Висс' }] },
      { id: 'spring', manual: true, text: 'Дойди до северного источника у северной дороги (за поворотом к пещере).', target: 'spot:north_spring', objectives: [{ type: 'reach', spot: 'north_spring', r: 12, label: 'Дойти до источника' }] },
      { id: 'p_gate', skipIf: { not: { var: ['B14_PLAN', '==', 'gate'] } }, text: 'Перекрой верхний затвор (Мегумин), Рокси закрывает дальний шов залпом, затем она берёт пробу.', target: 'spot:north_spring',
        objectives: [{ type: 'flag', flag: 'spring_gate', label: 'Верхний затвор (Мегумин)' }, { type: 'flag', flag: 'spring_seam', label: 'Дальний шов (Рокси: Tab, R)' }, { type: 'flag', flag: 'spring_sample', label: 'Проба (Рокси)' }] },
      { id: 'p_wash', skipIf: { not: { var: ['B14_PLAN', '==', 'wash'] } }, text: 'Другой порядок: смой соль малым потоком (Рокси), закрой дальний желоб руками и возьми пробу.', target: 'spot:north_spring',
        objectives: [{ type: 'flag', flag: 'spring_wash', label: 'Смыть соль (Рокси: Tab, R)' }, { type: 'flag', flag: 'spring_valve', label: 'Закрыть дальний желоб' }, { type: 'flag', flag: 'spring_sample', label: 'Проба (Рокси)' }] },
      { id: 'p_blast', skipIf: { not: { var: ['B14_PLAN', '==', 'blast'] } }, text: 'Сначала останови источник верхним затвором, затем разрушь пустую перегородку взрывом (Мегумин, Q) и возьми пробу.', target: 'spot:spring_partition',
        objectives: [{ type: 'flag', flag: 'spring_gate', label: 'Верхний затвор (Мегумин)' }, { type: 'explosion', spot: 'spring_partition', r: 10, label: 'Взрыв в пустую перегородку' }, { type: 'flag', flag: 'spring_sample', label: 'Проба (Рокси)' }] },
      { id: 'back', text: 'Вернись к Висс с результатом.', target: 'npc:wiss', objectives: [{ type: 'talk', label: 'Поговорить с Висс' }] },
    ],
    rewards: { eris: 120, xp: 150 },
  }),
  Q('s_marta_bridge', {
    title: 'Марта: лошади и мост', category: 'side', chapter: 4, giver: 'marta', noAuto: true, requires: [{ quest: 'ch4_return', status: 'done' }, { flag: 'roxy_companion' }],
    summary: 'На мостике у Ольховой рощи отошла доска: лошадь не идёт по звенящему настилу. Марте нужен мост, а не обход.',
    stages: [
      { id: 'brief', text: 'Поговори с Мартой на караванной стоянке.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }] },
      { id: 'bridge', manual: true, text: 'Дойди до мостика у Ольховой рощи (Марта ждёт у въезда).', target: 'spot:alder_west', objectives: [{ type: 'reach', spot: 'alder_west', r: 10, label: 'Дойти до моста' }] },
      { id: 'p_clip', skipIf: { not: { var: ['B15_PLAN', '==', 'clip'] } }, text: 'Сними звенящую скобу, убери ветку с подхода и выведи пустую телегу по настилу.', target: 'spot:alder_west',
        objectives: [{ type: 'flag', flag: 'bridge_clip', label: 'Звенящая скоба' }, { type: 'flag', flag: 'bridge_branch', label: 'Ветка на подходе' }, { type: 'flag', flag: 'bridge_cart', label: 'Пустая телега' }] },
      { id: 'p_edge', skipIf: { not: { var: ['B15_PLAN', '==', 'edge'] } }, text: 'Рокси держит доску водяным потоком, ты закрепляешь скобы, убираешь ветку и выводишь телегу.', target: 'spot:bridge_board',
        objectives: [{ type: 'flag', flag: 'bridge_board', label: 'Придержать доску (Рокси: Tab, R)' }, { type: 'flag', flag: 'bridge_clip', label: 'Крепление' }, { type: 'flag', flag: 'bridge_branch', label: 'Ветка на подходе' }, { type: 'flag', flag: 'bridge_cart', label: 'Пустая телега' }] },
      { id: 'pay', text: 'Поговори с Мартой: мост прошли.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }] },
    ],
    rewards: { eris: 80, xp: 100 },
  }),
  Q('s_garret_tag', {
    title: 'Гаррет: сменная бирка', category: 'side', chapter: 6, giver: 'garret', noAuto: true, requires: [{ quest: 'c_ore_for_garret', status: 'done' }, { quest: 'ch6_relay', status: 'done' }],
    summary: 'Гаррет хочет узнать, вывел ли его отец учеников из старой шахты до закрытия. Нужны бирка смены, журнал ламп и штамп у аварийного выхода.',
    stages: [
      { id: 'brief', text: 'Поговори с Гарретом в кузнице: план старой шахты.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Поговорить с Гарретом' }] },
      { id: 'room', manual: true, text: 'В старой шахте, в комнате отдыха шахтёров (восточный боковой тоннель), найди бирку смены и журнал расхода ламп.', target: 'spot:dungeon_entry',
        objectives: [{ type: 'flag', flag: 'shift_tag', label: 'Бирка номер семь' }, { type: 'flag', flag: 'shift_log', label: 'Журнал ламп' }] },
      { id: 'exit', text: 'У аварийного выхода (кристальный зал, западная стена): открой ручную решётку, Рокси сбивает воду залпом, найди штамп.', target: 'spot:dungeon_deep',
        objectives: [{ type: 'flag', flag: 'exit_grate', label: 'Ручная решётка' }, { type: 'flag', flag: 'exit_flooded_drained', label: 'Слить воду (Рокси: Tab, R)' }, { type: 'flag', flag: 'exit_stamp', label: 'Штамп на стене' }] },
      { id: 'report', text: 'Принеси Гаррету ответ.', target: 'npc:garret', objectives: [{ type: 'talk', label: 'Поговорить с Гарретом' }] },
    ],
    rewards: { eris: 100, xp: 120 },
  }),
  Q('s_fenrik_names', {
    title: 'Фенрик: имена в песне', category: 'side', chapter: 6, giver: 'fenrik', noAuto: true, requires: { quest: 'ch6_relay', status: 'done' },
    summary: 'Фенрик хочет обновить песню о звёздах и назвать людей, а не рифму. Нужны свидетель, храмовый список и проверенное имя Орина.',
    stages: [
      { id: 'brief', text: 'Поговори с Фенриком в таверне.', target: 'npc:fenrik', objectives: [{ type: 'talk', label: 'Поговорить с Фенриком' }] },
      { id: 'witness', text: 'Послушай свидетеля у караванной стоянки: Марта помнит ведро и два ужина. Фенрик ждёт там.', target: 'npc:marta', objectives: [{ type: 'talk', label: 'Поговорить с Мартой' }] },
      { id: 'temple', text: 'В храме проверь имя Орина в храмовом списке (у алтаря).', target: 'spot:temple_altar', objectives: [{ type: 'flag', flag: 'temple_list', label: 'Имя Орина' }] },
      { id: 'verse', text: 'Выслушай новый куплет у Фенрика.', target: 'npc:fenrik', objectives: [{ type: 'talk', label: 'Поговорить с Фенриком' }] },
    ],
    rewards: { eris: 60, xp: 80 },
  }),
  Q('s_boris_gate', {
    title: 'Борис: верхний затвор', category: 'side', chapter: 5, giver: 'boris', noAuto: true, requires: { quest: 'ch5_crypt', status: 'done' },
    summary: 'На речном рукаве у фермы поднялась вода без дождя: на верхнем затворе отметка Астрариума. Нужно отключить автоматику и поставить ручной режим.',
    stages: [
      { id: 'brief', text: 'Поговори с Борисом на ферме.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
      { id: 'measure', text: 'Измерь оба рукава у фермы (две мерные рейки на берегу, северо-восточнее дома).', target: 'spot:farmhouse', objectives: [{ type: 'flag', flag: 'measure_a', label: 'Нижний рукав' }, { type: 'flag', flag: 'measure_b', label: 'Верхний рукав' }] },
      { id: 'upper', manual: true, text: 'Поднимись к верхнему затвору (тропа с берега, северо-восток от фермы).', target: 'spot:upper_gate', objectives: [{ type: 'reach', spot: 'upper_gate', r: 10, label: 'Дойти до затвора' }] },
      { id: 'p_far', skipIf: { not: { var: ['B18_PLAN', '==', 'far'] } }, text: 'Дальнему полю: открой верхний затвор, Рокси снижает напор снизу.', target: 'spot:upper_gate',
        objectives: [{ type: 'flag', flag: 'upper_gate_open', label: 'Верхний затвор' }, { type: 'flag', flag: 'lower_flow_low', label: 'Снизить напор (Рокси: Tab, R)' }] },
      { id: 'p_wash', skipIf: { not: { var: ['B18_PLAN', '==', 'wash'] } }, text: 'Сначала промой пустой отвод (Рокси), поставь клапан на обход, затем открой верхний затвор.', target: 'spot:wash_drain',
        objectives: [{ type: 'flag', flag: 'drain_washed', label: 'Промыть отвод (Рокси: Tab, R)' }, { type: 'flag', flag: 'extra_valve', label: 'Клапан на обход' }, { type: 'flag', flag: 'upper_gate_open', label: 'Верхний затвор' }] },
      { id: 'mush', text: 'Из воды вышли грибы. Отбей их у затвора.', target: 'spot:upper_gate', onStart: [{ wave: 'gate_mushrooms' }], objectives: [{ type: 'flag', flag: 'wd_gate_mushrooms', label: 'Отбить грибов' }] },
      { id: 'manual', text: 'Отметь положение ручного колеса у затвора.', target: 'spot:upper_gate', objectives: [{ type: 'flag', flag: 'gate_wheel', label: 'Ручное колесо' }] },
      { id: 'report', text: 'Вернись к Борису.', target: 'npc:boris', objectives: [{ type: 'talk', label: 'Поговорить с Борисом' }] },
    ],
    rewards: { eris: 110, xp: 130 },
  }),
  Q('s_rann_nests', {
    title: 'Ранн: пустые гнёзда', category: 'side', chapter: 5, giver: 'rann', noAuto: true, requires: { quest: 'ch5_crypt', status: 'done' },
    summary: 'Птицы покинули участок у дальнего оврага. Возможно, туда идёт гул из старой вентиляционной трубы.',
    stages: [
      { id: 'brief', text: 'Поговори с Ранном в лагере охотников.', target: 'npc:rann', objectives: [{ type: 'talk', label: 'Поговорить с Ранном' }] },
      { id: 'nests', text: 'Осмотри два участка с гнёздами и сравни с тихим участком.', target: 'spot:quiet_site',
        objectives: [{ type: 'flag', flag: 'nest_a', label: 'Первое гнездовье' }, { type: 'flag', flag: 'nest_b', label: 'Второе гнездовье' }, { type: 'flag', flag: 'quiet_check', label: 'Тихий участок' }] },
      { id: 'pipe', manual: true, text: 'Дойди до старой вентиляционной трубы у оврага.', target: 'spot:rann_pipe', objectives: [{ type: 'reach', spot: 'rann_pipe', r: 8, label: 'Дойти до трубы' }] },
      { id: 'p_net', skipIf: { not: { var: ['B19_PLAN', '==', 'net'] } }, text: 'Поставь сетку на трубу, Рокси закрывает заслонку до малого расхода.', target: 'spot:rann_pipe',
        objectives: [{ type: 'flag', flag: 'pipe_net', label: 'Сетка' }, { type: 'flag', flag: 'pipe_valve', label: 'Заслонка (Рокси: Tab, R)' }] },
      { id: 'p_lure', skipIf: { not: { var: ['B19_PLAN', '==', 'lure'] } }, text: 'Сначала увези стража от оврага на сухую площадку и победи его, затем сетка и заслонка.', target: 'spot:rann_pipe',
        objectives: [{ type: 'kill', camp: 'pipe_guard', n: 1, label: 'Страж у трубы' }, { type: 'flag', flag: 'pipe_net', label: 'Сетка' }, { type: 'flag', flag: 'pipe_valve', label: 'Заслонка (Рокси: Tab, R)' }] },
      { id: 'p_rope', skipIf: { not: { var: ['B19_PLAN', '==', 'rope'] } }, text: 'Обойди стража сверху: Рокси закрепляет канат у кольца, сетку подай канатом, заслонка до малого расхода.', target: 'spot:pipe_ring',
        objectives: [{ type: 'flag', flag: 'pipe_ring', label: 'Канат у кольца (Рокси: Tab, R)' }, { type: 'flag', flag: 'pipe_net', label: 'Сетка' }, { type: 'flag', flag: 'pipe_valve', label: 'Заслонка (Рокси: Tab, R)' }] },
      { id: 'report', text: 'Вернись к Ранну.', target: 'npc:rann', objectives: [{ type: 'talk', label: 'Поговорить с Ранном' }] },
    ],
    rewards: { eris: 90, xp: 110 },
  }),
  Q('s_edmund_team', {
    title: 'Эдмунд: доверить измерение', category: 'side', chapter: 6, giver: 'edmund', noAuto: true, requires: { quest: 'ch6_relay', status: 'done' },
    summary: 'Тера принесла показания, которые Эдмунд отклонил. Нужно сравнить приборы по трём точкам маршрута.',
    stages: [
      { id: 'brief', text: 'Поговори с Эдмундом: у него Тера со своими показаниями.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
      { id: 'measure', text: 'Проведи три сравнения по маршруту у западного склона, последнее — у вентиляционного канала.', target: 'spot:edmund_route',
        objectives: [{ type: 'flag', flag: 'edm_m1', label: 'Первая площадка' }, { type: 'flag', flag: 'edm_m2', label: 'Вторая площадка' }, { type: 'flag', flag: 'edm_m3', label: 'У канала' }] },
      { id: 'sign', text: 'Вернись к Эдмунду и Тере.', target: 'npc:edmund', objectives: [{ type: 'talk', label: 'Поговорить с Эдмундом' }] },
    ],
    rewards: { eris: 100, xp: 120 },
  }),
  Q('s_clara_book', {
    title: 'Клара: книга свидетельств', category: 'side', chapter: 7, giver: 'clara', noAuto: true, requires: { quest: 'ch7_gorge', status: 'done' },
    summary: 'Клара собирает показания о засухе. Агата просит записать, что её брат голосовал в совете, и не стереть его имя.',
    stages: [
      { id: 'brief', text: 'Поговори с Агатой за архивным столом в храме.', target: 'npc:agata', objectives: [{ type: 'talk', label: 'Поговорить с Агатой' }] },
      { id: 'ledger', text: 'Найди в городском шкафу у гильдии ведомость выдачи воды: Луна даст доступ.', target: 'spot:guild_table', objectives: [{ type: 'flag', flag: 'water_ledger', label: 'Ведомость воды' }] },
      { id: 'compare', text: 'Сравни ведомость с копией протокола совета на столе у алтаря.', target: 'spot:temple_altar', objectives: [{ type: 'flag', flag: 'council_protocol', label: 'Протокол совета' }] },
      { id: 'read', text: 'Вернись к Агате: Клара прочитает ей готовую запись.', target: 'npc:agata', objectives: [{ type: 'talk', label: 'Поговорить с Агатой' }] },
    ],
    rewards: { eris: 90, xp: 110 },
  }),
  Q('s_tobias_road', {
    title: 'Тобиас: открытая дорога', category: 'side', chapter: 7, giver: 'tobias', noAuto: true, requires: [{ quest: 'c_escort_tobias', status: 'done' }, { quest: 'ch7_gorge', status: 'done' }],
    summary: 'Люди объезжают старый каменный пост на восточной дороге, хотя его страж выключен. Нужно показать дорогу и провести небольшой обоз.',
    stages: [
      { id: 'brief', text: 'Поговори с Тобиасом (Ольховка).', target: 'npc:tobias', objectives: [{ type: 'talk', label: 'Поговорить с Тобиасом' }] },
      { id: 'post', manual: true, text: 'Дойди до старого поста у Восточного перевала: Тобиас приведёт возчиков.', target: 'spot:relay_gate_out', objectives: [{ type: 'reach', spot: 'relay_gate_out', r: 14, label: 'Дойти до поста' }] },
      { id: 'tasks', text: 'У поста: убери обломок телеги, восстанови указатель и осмотри холодную панель.', target: 'spot:relay_gate_out',
        objectives: [{ type: 'flag', flag: 'road_debris', label: 'Обломок телеги' }, { type: 'flag', flag: 'road_sign', label: 'Указатель' }, { type: 'flag', flag: 'post_panel', label: 'Холодная панель' }] },
      { id: 'convoy', text: 'Проведи обоз до Ольховки.', target: 'region:olkhovka', objectives: [{ type: 'reach', region: 'olkhovka', label: 'Дойти до Ольховки' }] },
      { id: 'report', text: 'Поговори с Тобиасом.', target: 'npc:tobias', objectives: [{ type: 'talk', label: 'Поговорить с Тобиасом' }] },
    ],
    rewards: { eris: 90, xp: 100 },
  }),
  Q('s_lina_day', {
    title: 'День на площади', category: 'side', chapter: 8, giver: 'lina', noAuto: true,
    requires: { any: [{ quest: 'ch8_city', status: 'done' }, ...['veyr', 'deep', 'p19_lever', 'p19_latch', 'p19_breaker', 'deep_out', 'link', 'link_check'].map((stage) => ({ quest: 'ch8_city', stage }))] },
    summary: 'Лина просит помочь с обедом и лампами в убежище, пока вода уже идёт. Один час без угрозы взрыва.',
    stages: [
      { id: 'brief', text: 'Поговори с Линой: убежище, обед, лампы.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
      { id: 'w_bread', skipIf: { not: { var: ['B23_PLAN', '==', 'bread'] } }, text: 'Раздай обед у столов (убежище у ратуши); Рокси проверяет лампы.', target: 'spot:shelter', objectives: [{ type: 'flag', flag: 'shelter_food', label: 'Обед раздан' }] },
      { id: 'w_lamps', skipIf: { not: { var: ['B23_PLAN', '==', 'lamps'] } }, text: 'Поставь лампы у дальней стены убежища; Рокси раздаёт обед.', target: 'spot:shelter', objectives: [{ type: 'flag', flag: 'shelter_lamps', label: 'Лампы поставлены' }] },
      { id: 'bag', text: 'Мия нашла под столом забытую сумку. Поговори с ней.', target: 'npc:mia', objectives: [{ type: 'talk', label: 'Поговорить с Мией' }] },
      { id: 'last', text: 'Поговори с Линой: последний стол.', target: 'npc:lina', objectives: [{ type: 'talk', label: 'Поговорить с Линой' }] },
    ],
    rewards: { eris: 70, xp: 90 },
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
  ...CAPITAL_QUESTS,
].map(([id, q]) => [id, q]));
