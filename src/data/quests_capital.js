/**
 * Version 2.0 — the capital Ainstrey (docs/ainstrey/06_Глава_Айнстрея.md D14-D28, 07_Столичные_побочные_истории.md N01-N05).
 * Merged into QUESTS by data/quests.js. The main quest `ainstrey_city` follows `ainstrey_road` and precedes `ch6_relay`.
 * Flags marked D*_DONE are set by the scenes (data/story/chD2.js); the props of the port and of the side stories: data/story/props.js.
 */
const Q = (id, q) => [id, { id, ...q }];

const METHOD = (m) => ({ skipIf: { not: { var: ['PORT_METHOD', '==', m] } } });
const GUARDS = (g) => ({ skipIf: { not: { var: ['PORT_GUARDS', '==', g] } } });

export const CAPITAL_QUESTS = [
  Q('ainstrey_city', {
    title: 'Айнстрей: чужая накладная', category: 'story', chapter: 7, giver: 'oskar', noAuto: true, requires: { quest: 'ainstrey_road', status: 'done' },
    summary: 'Дорога открыта. В столице нужно показать письмо Луны, получить в архиве опись водяной сети и выяснить, кто перенаправил крепления Нэры. След ведёт в порт, к насосу с неполной схемой: сначала выводят людей, потом разделяют муфту.',
    stages: [
      { id: 'gate', text: 'Южные ворота Айнстрея: Оскар проверит письмо и лицензии.', target: 'npc:oskar', objectives: [{ type: 'talk', label: 'Поговорить с Оскаром' }] },
      { id: 'meet', text: 'Общественные кварталы открыты. В гильдии (площадь Ступеней, на север) ждёт Селия Морн; Тавия держит постоялый двор. Порядок любой: архивная опись выдаётся и без этого.', target: 'npc:selia',
        objectives: [{ type: 'flag', flag: 'D15_DONE', label: 'Селия Морн (гильдия)' }, { type: 'flag', flag: 'D16_DONE', label: 'Тавия (постоялый двор)' }],
        hint: 'Указатели на площадях подскажут дорогу. Ночлег у Тавии первые две ночи оплачивает гильдия.' },
      { id: 'archive', text: 'В городском архиве Илар выдаст основную опись. Архив стоит на Соборной площади, на запад от прохода к саду.', target: 'npc:ilar', objectives: [{ type: 'flag', flag: 'D17_DONE', label: 'Опись у Илара' }] },
      { id: 'academy', text: 'Мирена держит действующую схему портового насоса. Её можно найти в академическом дворе.', target: 'npc:mirena', objectives: [{ type: 'flag', flag: 'D18_DONE', label: 'Схема Мирены' }] },
      { id: 'invoice', text: 'Нэра ждёт у гильдии: номер партии скоб, найденной у мельницы, её.', target: 'npc:nera', objectives: [{ type: 'flag', flag: 'D19_DONE', label: 'Нэра: номер партии' }] },
      { id: 'varlen', text: 'Варлен Дорн принимает на речном складе у порта (площадь Грузов, вдоль набережной).', target: 'npc:varlen', objectives: [{ type: 'flag', flag: 'D20_DONE', label: 'Варлен у склада' }] },
      { id: 'permit', text: 'У входа в насосный участок (пирс 5, южная часть порта) Оскар открывает допуск, Мирена ждёт.', target: 'npc:mirena', objectives: [{ type: 'flag', flag: 'D21_DONE', label: 'Допуск к нижнему насосу' }] },
      { id: 'prep', text: 'Нижняя насосная зона: переставь мосток для выхода людей, сними защёлку, Рокси держит протечку и снижает давление в левой трубе, правую проверь по синей риске (всё в любом порядке).', target: 'spot:pump_yard',
        objectives: [
          { type: 'flag', flag: 'port_gangway', label: 'Переставить мосток' },
          { type: 'flag', flag: 'port_latch_free', label: 'Освободить защёлку (Мегумин)' },
          { type: 'flag', flag: 'port_leak_held', label: 'Удержать протечку (Рокси: Tab, R)' },
          { type: 'flag', flag: 'port_gauge_left', label: 'Левая труба ниже белой черты (Рокси: Tab, R)' },
          { type: 'flag', flag: 'port_gauge_right', label: 'Правая труба: синяя риска' },
        ],
        hint: 'Лестница у входа ведёт на верхний мосток; безопасный выход для людей показан зелёной стрелкой на площадке вывода. Взрыв здесь без отметки не нужен.',
        onDone: [{ setVar: ['PORT_EVACUATED', true] }, { setVar: ['PORT_PRESSURE_SAFE', true] }] },
      { id: 'route', text: 'На обратном пути включаются два сервисных стража. Выбери, как их обойти.', target: 'spot:port_panel', objectives: [{ type: 'talk', label: 'Решить, как пройти' }], onStart: [{ scene: 'D22' }] },
      { id: 'p_top', ...GUARDS('top'), text: 'Обход сверху: поднимись на верхний мосток, Рокси снимает питание панели, Мегумин держит лестницу.', target: 'spot:port_panel',
        objectives: [{ type: 'flag', flag: 'port_upper', label: 'Подняться на верхний мосток' }, { type: 'flag', flag: 'port_panel_off', label: 'Снять питание панели (Рокси)' }] },
      { id: 'p_pit', ...GUARDS('pit'), text: 'Отведи двух стражей в пустой приямок у правой стены и выйди обратно по проходу вдоль стены.', target: 'spot:port_pit', onStart: [{ wave: 'port_guards' }],
        objectives: [{ type: 'flag', flag: 'wd_port_guards', label: 'Стражи выведены из строя' }] },
      { id: 'coupling', text: 'Муфта свободна. Поговори с Мириной: выбор способа отделения (Взрыв на белую отметку или домкрат и рычаг). Перед выбором безопасно передохни у отключённой панели.', target: 'npc:mirena', objectives: [{ type: 'talk', label: 'Поговорить с Мириной' }], onStart: [{ scene: 'D22b' }] },
      { id: 'p_expl', ...METHOD('explosion'), text: 'Взрыв: Рокси держит поток у отвода (Tab), затем Мегумин бьёт Взрывом (Q) по белой отметке на муфте. После удара Рокси берёт управление отводом.', target: 'spot:port_white_mark',
        objectives: [{ type: 'flag', flag: 'port_hold', label: 'Держать поток (Рокси)' }, { type: 'flag', flag: 'port_coupling_blasted', label: 'Взрыв по белой отметке' }, { type: 'flag', flag: 'port_flow_after', label: 'Взять отвод под управление (Рокси)' }],
        hint: 'Нужны обычные 100 маны. Несущую стену и резервную трубу не трогай: бьёшь только в белую отметку.' },
      { id: 'p_mech', ...METHOD('mechanical'), text: 'Домкрат и рычаг: Нэра держит упор, Мегумин поворачивает домкрат до метки, боковой рычаг отпускают по знаку, Рокси переводит поток.', target: 'spot:port_jack',
        objectives: [{ type: 'flag', flag: 'port_jack', label: 'Домкрат до метки (Мегумин)' }, { type: 'flag', flag: 'port_lever', label: 'Боковой рычаг' }, { type: 'flag', flag: 'port_flow_after', label: 'Перевести поток (Рокси)' }],
        hint: 'Домкрат вращает Мегумин (Tab); магический ресурс не тратится.' },
      { id: 'check_gate', text: 'Ручная панель доступна. Рокси проверяет, что нижняя заслонка отвечает.', target: 'spot:port_gate', objectives: [{ type: 'flag', flag: 'port_gate_ok', label: 'Проверить нижнюю заслонку (Рокси)' }],
        onStart: [{ scene: 'D23b' }], onDone: [{ setVar: ['PORT_REPAIRED', true] }, { scene: 'D23c' }] },
      { id: 'report', text: 'Вернись к Варлену у конторы порта: возврат материалов и способ огласки. Селия там же.', target: 'npc:varlen', objectives: [{ type: 'talk', label: 'Поговорить с Варленом' }] },
      { id: 'wrap', text: 'Илар вернёт приложение, а Лисса ждёт письмо в Аксель (в любом порядке).', target: 'npc:ilar',
        objectives: [{ type: 'flag', flag: 'D25_DONE', label: 'Илар: приложение' }, { type: 'flag', flag: 'D26_DONE', label: 'Лисса: письмо в Аксель' }] },
      { id: 'finish', text: 'Селия подведёт итог главы в гильдии.', target: 'npc:selia', objectives: [{ type: 'talk', label: 'Поговорить с Селией' }],
        onDone: [{ eris: 180 }, { notify: 'Дело порта закрыто. Награда за обследование и вывод работников: 180 эрис. Столица остаётся вашим вторым городом: торговля, отдых и местные заказы доступны.' }, { setFlag: 'ainstrey_hub' }] },
    ],
    rewards: { xp: 500, flags: ['ainstrey_city_done'] },
    next: 'ch6_relay',
  }),

  // ------------------------------------------------------------------ N01..N05: the side stories of the capital
  Q('n01_letter', {
    title: 'Письмо с другого берега', category: 'side', chapter: 7, giver: 'lissa', noAuto: true, requires: { flag: 'D26_DONE' },
    summary: 'Письмо трижды вернулось: дом получательницы теперь числится на другой улице. Нужны запись о переезде и подпись.',
    stages: [
      { id: 'brief', text: 'Поговори с Лиссой в гильдии: письмо без получателя.', target: 'npc:lissa', objectives: [{ type: 'talk', label: 'Поговорить с Лиссой' }] },
      { id: 'record', text: 'Найди запись о переезде семьи: в городском списке архива (шкаф у Илара) или спроси хозяина мастерской на прежней улице речного квартала.', target: 'spot:n01_shelf',
        objectives: [{ type: 'flag', flag: 'n01_record', label: 'Запись о переезде' }] },
      { id: 'compare', text: 'Расскажи Лиссе, что нашёл: старая и новая нумерация.', target: 'npc:lissa', objectives: [{ type: 'talk', label: 'Поговорить с Лиссой' }] },
      { id: 'deliver', text: 'Новый дом у лодочного двора (набережная, юг порта): отдай письмо получательнице, пусть она поставит подпись.', target: 'spot:n01_new_house', objectives: [{ type: 'flag', flag: 'n01_signed', label: 'Подпись получательницы' }] },
      { id: 'report', text: 'Вернись к Лиссе: исправить адрес у отправителя.', target: 'npc:lissa', objectives: [{ type: 'talk', label: 'Поговорить с Лиссой' }] },
    ],
    rewards: { eris: 90, xp: 120, items: [['bread', 2]] },
  }),
  Q('n02_ovens', {
    title: 'Две печи', category: 'side', chapter: 7, giver: 'tavia', noAuto: true, requires: { flag: 'tavia_night1' },
    summary: 'Вторая печь двора дымит: заслонку держит доска новой полки. Взрыв в жилом дворе исключён.',
    stages: [
      { id: 'brief', text: 'Поговори с Тавией на кухне: вторая печь гонит дым в комнату.', target: 'npc:tavia', objectives: [{ type: 'talk', label: 'Поговорить с Тавией' }] },
      { id: 'inspect', text: 'Проверь чердак, крышу и нижний выход печи (в любом порядке).', target: 'spot:n02_attic',
        objectives: [{ type: 'flag', flag: 'n02_attic', label: 'Чердак' }, { type: 'flag', flag: 'n02_roof', label: 'Крыша' }, { type: 'flag', flag: 'n02_exit', label: 'Нижний выход' }] },
      { id: 'plan', text: 'Скажи Тавии, как сделать: подпереть полку или перенести её.', target: 'npc:tavia', objectives: [{ type: 'talk', label: 'Поговорить с Тавией' }] },
      { id: 'p_prop', skipIf: { not: { var: ['N02_PLAN', '==', 'prop'] } }, text: 'Подопри полку и сними мешающую доску; Рокси проверит выход малым потоком холодной воды.', target: 'spot:n02_attic',
        objectives: [{ type: 'flag', flag: 'n02_support', label: 'Опора под полку' }, { type: 'flag', flag: 'n02_board', label: 'Снять доску' }, { type: 'flag', flag: 'n02_flue', label: 'Проверить выход потоком (Рокси: Tab, R)' }] },
      { id: 'p_move', skipIf: { not: { var: ['N02_PLAN', '==', 'move'] } }, text: 'Убери дрова с полки и перенеси её на другую стену, пока Тавия держит верх.', target: 'spot:n02_attic',
        objectives: [{ type: 'flag', flag: 'n02_wood', label: 'Убрать дрова' }, { type: 'flag', flag: 'n02_shelf', label: 'Перенести полку' }] },
      { id: 'bread', text: 'Печь тянет. Вернись к Тавии за хлебом.', target: 'npc:tavia', objectives: [{ type: 'talk', label: 'Поговорить с Тавией' }] },
    ],
    rewards: { eris: 100, xp: 120 },
  }),
  Q('n03_handwriting', {
    title: 'Чужой почерк', category: 'side', chapter: 7, giver: 'ilar', noAuto: true, requires: { flag: 'D17_DONE' },
    summary: 'В копии складской ведомости рядом лежат две поправки: одна законная, другая внесена при переписывании без записи. Сравни книгу, выдачу и рабочий список.',
    stages: [
      { id: 'brief', text: 'Поговори с Иларом в архиве: две поправки в одной ведомости.', target: 'npc:ilar', objectives: [{ type: 'talk', label: 'Поговорить с Иларом' }] },
      { id: 'compare', text: 'Сравни три записи (в любом порядке): архивную книгу у Илара, журнал выдачи у Селии, рабочий список у Мирены.', target: 'spot:n03_book',
        objectives: [{ type: 'flag', flag: 'n03_book', label: 'Книга (архив)' }, { type: 'flag', flag: 'n03_log', label: 'Журнал выдачи (гильдия)' }, { type: 'flag', flag: 'n03_list', label: 'Рабочий список (академия)' }] },
      { id: 'sign', text: 'Расскажи Мирене, что нашёл: две разные ошибки.', target: 'npc:mirena', objectives: [{ type: 'talk', label: 'Поговорить с Мирой' }] },
      { id: 'fix', text: 'Вернись к Илару: исправленная книга.', target: 'npc:ilar', objectives: [{ type: 'talk', label: 'Поговорить с Иларом' }] },
    ],
    rewards: { eris: 80, xp: 100 },
  }),
  Q('n04_bucket', {
    title: 'По цене ведра', category: 'side', chapter: 7, giver: 'mirena', noAuto: true, requires: [{ flag: 'D18_DONE' }, { var: ['AINSTRAY_ROAD_OPEN', '==', true] }],
    summary: 'На Белых мельницах один рукав даёт воды дворам у дороги больше, остаток уходит в нижние огороды. Нужны замеры на двух уровнях, ремонт стыка и подписи жителей.',
    stages: [
      { id: 'brief', text: 'Поговори с Мирой в академии: схема водяных долей Белых мельниц.', target: 'npc:mirena', objectives: [{ type: 'talk', label: 'Поговорить с Мирой' }] },
      { id: 'mills', text: 'Дойди до Белых мельниц (южнее города, дорога к дамбе). Мирена ждёт у верхнего рукава.', target: 'spot:n04_upper', objectives: [{ type: 'reach', spot: 'n04_upper', r: 10, label: 'Дойти до верхнего рукава' }] },
      { id: 'measure', text: 'Замерь поток на двух уровнях: верхний рукав и нижний затвор (прибор у Мирены уже при тебе).', target: 'spot:n04_upper',
        objectives: [{ type: 'flag', flag: 'n04_measure_a', label: 'Верхний рукав' }, { type: 'flag', flag: 'n04_measure_b', label: 'Нижний затвор' }] },
      { id: 'talk_b', text: 'Обсуди с Мирой результат и порядок: ремонт стыка и встреча.', target: 'npc:mirena', objectives: [{ type: 'talk', label: 'Поговорить с Мирой' }] },
      { id: 'leak', text: 'Удержи протечку (Рокси), замени уплотнение и отбей грибов у нижней канавы.', target: 'spot:n04_lower',
        objectives: [{ type: 'flag', flag: 'n04_leak_held', label: 'Удержать протечку (Рокси: Tab, R)' }, { type: 'flag', flag: 'n04_seal', label: 'Заменить уплотнение' }, { type: 'kill', camp: 'mill_fungi', n: 3, label: 'Отбить грибов' }] },
      { id: 'statements', text: 'Забери заявления жителей у трёх дворов: верхний двор, двор у дороги, нижние огороды.', target: 'spot:n04_yard_a',
        objectives: [{ type: 'flag', flag: 'n04_stmt_a', label: 'Верхний двор' }, { type: 'flag', flag: 'n04_stmt_b', label: 'Двор у дороги' }, { type: 'flag', flag: 'n04_stmt_c', label: 'Нижние огороды' }] },
      { id: 'mark', text: 'Отдай подписи Мирене: общая отметка.', target: 'npc:mirena', objectives: [{ type: 'talk', label: 'Поговорить с Мирой' }] },
    ],
    rewards: { eris: 110, xp: 130 },
  }),
  Q('n05_patrol', {
    title: 'Дозор у Белых мельниц', category: 'side', chapter: 7, giver: 'oskar', noAuto: true, requires: { var: ['AINSTRAY_ROAD_OPEN', '==', true] },
    summary: 'На боковой дороге пропал сигнальный фонарь: караваны уходят с безопасной дороги, потому что ночью не видят поворот. Нужно проверить три поста, вернуть свет и проверить его ночью.',
    stages: [
      { id: 'brief', text: 'Поговори с Оскаром у южных ворот: боковые посты у мельниц.', target: 'npc:oskar', objectives: [{ type: 'talk', label: 'Поговорить с Оскаром' }] },
      { id: 'posts', text: 'Проверь три поста на боковой дороге у мельниц (в любом порядке).', target: 'spot:n05_post_a',
        objectives: [{ type: 'flag', flag: 'n05_post_a', label: 'Первый пост' }, { type: 'flag', flag: 'n05_post_b', label: 'Второй пост' }, { type: 'flag', flag: 'n05_post_c', label: 'Дальний пост' }] },
      { id: 'camp', manual: true, text: 'Следы ведут к лагерю дорожных гоблинов за оградой. Лисса ждёт у лагеря.', target: 'spot:n05_camp', objectives: [{ type: 'reach', spot: 'n05_camp', r: 14, label: 'Дойти до лагеря' }] },
      { id: 'p_lure', skipIf: { not: { var: ['N05_PLAN', '==', 'lure'] } }, text: 'Отведи гоблинов от фонаря и ударь по лагерю (Пролом по пустому краю), затем забери фонарь.', target: 'spot:n05_lantern',
        objectives: [{ type: 'kill', camp: 'n05_camp', n: 4, label: 'Разбить лагерь' }, { type: 'flag', flag: 'n05_lantern_back', label: 'Забрать фонарь' }] },
      { id: 'p_top', skipIf: { not: { var: ['N05_PLAN', '==', 'top'] } }, text: 'Обойди лагерь по верхнему краю и забери фонарь до боя.', target: 'spot:n05_top',
        objectives: [{ type: 'flag', flag: 'n05_top', label: 'Верхний край' }, { type: 'flag', flag: 'n05_lantern_back', label: 'Забрать фонарь' }] },
      { id: 'p_reserve', skipIf: { not: { var: ['N05_PLAN', '==', 'reserve'] } }, text: 'Поставь запасной фонарь у поворота сразу; потом пройди лагерь и верни украденный.', target: 'spot:n05_bend',
        objectives: [{ type: 'flag', flag: 'n05_reserve', label: 'Запасной фонарь у поворота' }, { type: 'flag', flag: 'n05_lantern_back', label: 'Забрать фонарь из лагеря' }] },
      { id: 'light', text: 'Повесь фонарь у поворота, дождись ночи (вечером, после 20 часов) и проверь, виден ли свет от дальнего столба.', target: 'spot:n05_bend',
        objectives: [{ type: 'flag', flag: 'n05_hung', label: 'Повесить фонарь' }, { type: 'flag', flag: 'n05_night', label: 'Проверить свет ночью (после 20:00)' }],
        hint: 'Время сменится, если выспаться у Тавии или в лагере; ждать реальные сутки не нужно.' },
      { id: 'report', text: 'Вернись к Оскару: ночная проверка.', target: 'npc:oskar', objectives: [{ type: 'talk', label: 'Поговорить с Оскаром' }] },
    ],
    rewards: { eris: 130, xp: 140 },
  }),
];
