/**
 * Fast travel inside the capital (version 2.0, docs/ainstrey/TZ_capital.md §5.2): safe stops of the carts of the city and the river ferry.
 * A stop opens when the player has been there (within STOP_R metres of its spot); the carts run once three stops are known.
 * The spots `stop_*` are laid on the paved streets by world/build/AinstreyCity.js (capitalSpots), so every landing is walkable and open.
 * No stop stands in the pump hall, in the closed citadel or at the closed north intake.
 */
export const STOP_R = 24;
export const STOPS_NEEDED = 3;
export const STOPS = [
  { id: 'gate', name: 'Южные ворота', spot: 'stop_gate', ride: 'повозкой', district: 'Южный посад' },
  { id: 'market', name: 'Большой рынок', spot: 'stop_market', ride: 'повозкой', district: 'Южный посад' },
  { id: 'steps', name: 'Площадь Ступеней', spot: 'stop_steps', ride: 'повозкой', district: 'Площадь Ступеней' },
  { id: 'guild', name: 'Гильдия', spot: 'stop_guild', ride: 'повозкой', district: 'Квартал гильдий' },
  { id: 'archive', name: 'Городской архив', spot: 'stop_archive', ride: 'повозкой', district: 'Старый город' },
  { id: 'academy', name: 'Малый академический двор', spot: 'stop_academy', ride: 'повозкой', district: 'Академические улицы' },
  { id: 'port', name: 'Городская пристань (пирс 3)', spot: 'stop_port', ride: 'речным перевозчиком', district: 'Речной порт' },
  { id: 'garden', name: 'Сад Совета', spot: 'stop_garden', ride: 'повозкой', district: 'Сад Совета' },
];
/** The closed parts of the capital (the status is shown on the map; there is no task inside). */
export const CLOSED_PARTS = [
  { id: 'citadel', name: 'Внутренняя цитадель', spot: 'ain_citadel_gate', note: 'закрыта: будущая часть' },
  { id: 'north_intake', name: 'Нижний Северный водозабор', spot: 'north_intake_gate', note: 'закрыт: готовится обследование' },
];
