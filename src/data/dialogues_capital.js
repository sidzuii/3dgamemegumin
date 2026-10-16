/**
 * Everyday conversations of the capital's people (version 2.0): shop, rest, the board, the way. Written game glue (not voiced);
 * the scenes of the package are in data/story/chD2.js and chN.js.
 */
import { clipText } from './story/index.js';

const D = (nodes, start = 'start') => ({ start, nodes });
const BYE = { text: 'До встречи.', next: 'end' };

export const CAPITAL_DIALOGUES = {
  oskar_idle: D({
    start: { text: (r) => (r.check({ v: 'AINSTRAY_CHAPTER_COMPLETE' }) ? clipText('V08_004') : 'Общественные кварталы открыты. Служебные затворы — по допуску водяной службы.'), choices: [
      { text: 'Какие районы можно посмотреть?', next: 'map' },
      { text: 'Есть дело на дальнюю дорогу?', if: { quest: 'n05_patrol', status: 'done' }, next: 'done' },
      BYE,
    ] },
    map: { text: 'Площадь Ступеней и гильдейские кварталы, старый город с архивом, академические дворы, порт, сад Совета. Внутренняя цитадель и нижний Северный водозабор закрыты до отдельного обследования.', next: 'end' },
    done: { text: 'Боковой маршрут у мельниц теперь пригоден для караванов. Новые посты поставим позже.', next: 'end' },
  }),
  selia_idle: D({
    start: { text: clipText('V08_005'), choices: [
      { text: 'Доска заказов.', do: { openBoard: true } },
      { text: 'Склад гильдии.', do: { openShop: 'guild_supply' } },
      BYE,
    ] },
  }),
  tavia_idle: D({
    start: { text: (r) => (r.clock.hour >= 18 || r.clock.hour < 4 ? 'Ужин до закрытия кухни. Комната во дворе, лестница без скрипа справа.' : 'Комната во дворе, ужин с хлебом. За шутки берём обычную цену.'), choices: [
      { text: 'Поесть (магазин).', do: { openShop: 'inn_tavia' } },
      { text: 'Отдохнуть в комнате (ночлег оплачен гильдией).', if: { var: ['TAVIA_FREE_RESTS', '>', 0] }, next: 'sleep', do: [{ addVar: ['TAVIA_FREE_RESTS', -1, 0, 9] }] },
      { text: 'Снять комнату и выспаться (10 эрис).', if: [{ var: ['TAVIA_FREE_RESTS', '<=', 0] }, { eris: 10 }], next: 'sleep', do: [{ eris: -10 }] },
      { text: 'Какие новости?', next: 'news' },
      BYE,
    ] },
    sleep: { who: 'narrator', text: 'Лестница без скрипа, тёплая кровать, пахнет хлебом из кухни. Мегумин и Рокси проспали до рассвета.', next: 'end', do: [{ setFlag: 'tavia_night1' }, { sleep: 7 }] },
    news: { text: (r) => (r.check({ v: 'AINSTRAY_CHAPTER_COMPLETE' }) ? 'Столица говорит, что порт снова слушается ручной панели. Про вас говорят спокойно, без шума.' : 'Столица пока говорит, что дорога открылась. Остальное доскажете сами.'), next: 'end' },
  }),
  ilar_idle: D({
    start: { text: clipText('V08_006'), choices: [
      { text: 'Что с нижним водозабором?', if: { v: 'AINSTRAY_CHAPTER_COMPLETE' }, next: 'north' },
      { text: 'Я ищу запись о переезде семьи.', if: { quest: 'n01_letter', stage: 'record' }, next: 'record' },
      BYE,
    ] },
    north: { text: 'Вход в нижний водозабор ещё не подготовлен. Дело по порту закрыли. Для нижнего участка служба готовит отдельный осмотр; когда будут план и ответственный на сбросе, сообщу через гильдию.', next: 'end' },
    record: { text: 'Список по кварталам в шкафу слева. Там старая и новая нумерация рядом. Покажи номер, найдёшь за минуту.', next: 'end' },
  }),
  mirena_idle: D({
    start: { text: clipText('V08_007'), choices: [
      { text: 'Что с узлом порта?', if: { v: 'PORT_REPAIRED' }, next: 'port' },
      BYE,
    ] },
    port: { text: 'Ручная панель отвечает, старая команда отключена. Это ремонт одного узла: всю древнюю сеть он не отключает.', next: 'end' },
  }),
  varlen_idle: D({
    start: { text: 'Порт работает. По делам перевозок обращайтесь к стойке.', next: 'end' },
  }),
  // N03: the three records (said at the person's place; the flags close the stage `compare`)
  ilar_book: D({ start: { text: 'Вот книга. Две поправки рядом: моя и чужая. Смотри на почерк и на дату: у моей есть пометка архива, у соседней её нет.', next: 'end', do: [{ setFlag: 'n03_book' }] } }),
  selia_log: D({ start: { text: 'Журнал выдачи: страница с датой и подписью получателя. Бери копию, Илару она нужна целиком. Оригинал остаётся у меня.', next: 'end', do: [{ setFlag: 'n03_log' }] } }),
  mirena_list: D({ start: { text: 'Рабочий список. Поправка Илара здесь учтена, а соседняя появилась после копирования: другой номер партии и зачёркнутый возврат.', next: 'end', do: [{ setFlag: 'n03_list' }] } }),
};
