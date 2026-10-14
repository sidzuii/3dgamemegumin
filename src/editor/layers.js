import { HALF } from '../world/MapData.js';
import { BUILDINGS } from '../world/AxelPlan.js';

/**
 * Editor layers (every object on the map belongs to exactly one) and the layout validator.
 * The validator guards every boundary: loading placements.json, importing a draft, saving.
 */
export const LAYERS = [
  { id: 'buildings', label: 'Здания (ключевые)' },
  { id: 'houses', label: 'Дома города' },
  { id: 'streets', label: 'Улицы и площади' },
  { id: 'wall', label: 'Стена, башни, ворота' },
  { id: 'lamps', label: 'Фонари' },
  { id: 'places', label: 'Места и постройки' },
  { id: 'parts', label: 'Мелкие части (двери, мебель, бочки)' },
  { id: 'signs', label: 'Указатели' },
  { id: 'spots', label: 'Точки NPC и заданий' },
  { id: 'camps', label: 'Лагеря врагов (точки появления)' },
  { id: 'added', label: 'Добавленные в редакторе' },
  { id: 'tree', label: 'Деревья' },
  { id: 'bush', label: 'Кусты' },
  { id: 'rock', label: 'Камни' },
  { id: 'stump', label: 'Пни и брёвна' },
  { id: 'mushroom', label: 'Грибы' },
  { id: 'flower', label: 'Цветы' },
];
const KEY = new Set(BUILDINGS.map((b) => b.id));

/** Layer id of an editor record (a group or a vegetation wrapper). */
export function layerOf(rec) {
  if (rec.veg) return rec.veg.kind;
  if (rec.marker) return rec.marker.kind === 'spot' ? 'spots' : 'camps';
  if (rec.added) return 'added';
  const id = rec.id;
  if (rec.parent) {
    const root = id.split('/')[0];
    // Streets and wall sections are parts of their container but belong to its layer.
    if (root === 'axel_streets') return 'streets';
    if (root === 'axel_wall') return 'wall';
    return 'parts';
  }
  if (id === 'axel_streets' || id === 'square' || id === 'market_square') return 'streets';
  if (id === 'axel_wall' || /^(tower_|wall_tower_|gate_)/.test(id)) return 'wall';
  if (/^lamp_/.test(id) || /_lamp_/.test(id)) return 'lamps';
  if (/^sign_/.test(id)) return 'signs';
  if (KEY.has(id)) return 'buildings';
  if (/^axel_/.test(id)) return 'houses';
  return 'places';
}

const NUM = (v) => typeof v === 'number' && Number.isFinite(v);
const LIM = { coord: HALF * 1.3 + 1500, dy: 60, s: [0.2, 5], rot: 1e3, overrides: 20000, vegetation: 30000, added: 5000, erase: 500, bytes: 6e6, eraseR: 80 };

/**
 * Validate a layout document (placements.json). Returns { ok, errors }; stops at 12 errors.
 * Requires the exact layout revision and rejects non-finite or out-of-range numbers, duplicate
 * ids, oversize documents and malformed nested records.
 */
export function validateLayout(data, { layoutRev = 2 } = {}) {
  const errors = [];
  const bad = (m) => { if (errors.length < 12) errors.push(m); };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Документ должен быть объектом'] };
  if (data.layout !== layoutRev) bad(`Версия раскладки ${data.layout} (нужна ${layoutRev})`);
  let bytes = 0;
  try { bytes = JSON.stringify(data).length; } catch { bad('Документ не сериализуется'); }
  if (bytes > LIM.bytes) bad('Документ слишком большой');
  const place = (where, o, { allowDeleted = true } = {}) => {
    if (!o || typeof o !== 'object') return bad(`${where}: не объект`);
    if (o.deleted !== undefined && (o.deleted !== true || !allowDeleted)) bad(`${where}: deleted должен быть true`);
    for (const k of ['x', 'z', 'dy', 'rot', 's']) if (k in o && !NUM(o[k])) bad(`${where}.${k}: не число`);
    if ('x' in o && Math.abs(o.x) > LIM.coord) bad(`${where}.x вне карты`);
    if ('z' in o && Math.abs(o.z) > LIM.coord) bad(`${where}.z вне карты`);
    if ('dy' in o && Math.abs(o.dy) > LIM.dy) bad(`${where}.dy вне диапазона`);
    if ('s' in o && (o.s < LIM.s[0] || o.s > LIM.s[1])) bad(`${where}.s вне диапазона`);
    if ('rot' in o && Math.abs(o.rot) > LIM.rot) bad(`${where}.rot вне диапазона`);
  };
  for (const [name, cap] of [['overrides', LIM.overrides], ['vegetation', LIM.vegetation]]) {
    const m = data[name];
    if (m === undefined && name === 'vegetation') continue;
    if (!m || typeof m !== 'object' || Array.isArray(m)) { bad(`${name}: должен быть объектом`); continue; }
    const keys = Object.keys(m);
    if (keys.length > cap) bad(`${name}: слишком много записей`);
    for (const k of keys.slice(0, cap)) place(`${name}[${k}]`, m[k]);
  }
  if (!Array.isArray(data.added)) bad('added: должен быть массивом');
  else {
    if (data.added.length > LIM.added) bad('added: слишком много объектов');
    const ids = new Set();
    for (const a of data.added.slice(0, LIM.added)) {
      if (!a || typeof a.id !== 'string' || typeof a.type !== 'string') { bad('added: у объекта нет id / type'); continue; }
      if (ids.has(a.id)) bad(`added: повтор id ${a.id}`);
      ids.add(a.id);
      place(`added[${a.id}]`, a, { allowDeleted: false });
    }
  }
  if (data.erase !== undefined) {
    if (!Array.isArray(data.erase) || data.erase.length > LIM.erase) bad('erase: массив до ' + LIM.erase);
    else for (const c of data.erase) if (!c || !NUM(c.x) || !NUM(c.z) || !NUM(c.r) || c.r <= 0 || c.r > LIM.eraseR || Math.abs(c.x) > LIM.coord || Math.abs(c.z) > LIM.coord) bad('erase: неверный круг');
  }
  for (const name of ['spots', 'camps']) {
    const m = data[name];
    if (m === undefined) continue;
    if (!m || typeof m !== 'object' || Array.isArray(m)) { bad(`${name}: должен быть объектом`); continue; }
    for (const [k, o] of Object.entries(m).slice(0, 5000)) {
      if (!o || !NUM(o.x) || !NUM(o.z) || Math.abs(o.x) > LIM.coord || Math.abs(o.z) > LIM.coord || ('yaw' in o && !NUM(o.yaw))) bad(`${name}[${k}]: неверная точка`);
    }
  }
  return { ok: errors.length === 0, errors };
}
