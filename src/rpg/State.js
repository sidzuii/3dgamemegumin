/**
 * Persistent game state + event bus + condition/effect language.
 *
 * Everything that must survive a reload lives in `GameState.data` (plain JSON). Systems read
 * and write it through small helpers; the RPG facade saves it on meaningful changes and on
 * a timer. Old saves (megumin-save-v1, the cross-shaped map) are migrated: coins and items
 * are kept, the new story starts from the prologue.
 */
export const SAVE_KEY = 'megumin-save-v2';
const LEGACY_KEY = 'megumin-save-v1';
export const SAVE_VERSION = 2;
/** Map layout revision: saves from an older map get the player moved to a safe spot (RPG._fixups). */
export const MAP_REV = 3;

export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.map.get(type).delete(fn);
  }
  emit(type, data) {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) fn(data);
    const any = this.map.get('*');
    if (any) for (const fn of [...any]) fn(type, data);
  }
}

export function freshState() {
  return {
    version: SAVE_VERSION,
    // mapRev is set by RPG._fixups (absent in saves from the old map).
    flags: {},
    counters: {},
    quests: {}, // id -> { status: 'active'|'done', stage, progress: {}, day }
    guild: { member: false, rank: 'F', points: 0, completed: [] },
    rel: {}, // npcId -> -100..100
    met: {}, // npcId -> true
    chests: [],
    props: {}, // questProp id -> state
    discovered: [],
    explored: '', // base64 bitmap (fog of war, 96x96)
    time: { day: 1, minutes: 7 * 60 + 30 },
    player: null, // { x, y, z, yaw, hp, mana, stamina, level, xp, character }
    inventory: null, // { eris, items, equipment }
    shops: {},
    gather: {},
    events: {},
    kills: {},
    log: [], // recent story log lines
  };
}

/** Load the save (or migrate the legacy one). Returns { data, migrated, corrupted }. */
export function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return { data: null };
  }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) throw new Error('version');
      return { data: { ...freshState(), ...data } };
    } catch {
      return { data: null, corrupted: true };
    }
  }
  // Legacy save from the old map: keep coins and items, restart the story.
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (old && typeof old === 'object') {
      const data = freshState();
      data.inventory = { eris: old.eris || 0, items: Array.isArray(old.items) ? old.items : [], equipment: {} };
      return { data, migrated: true };
    }
  } catch {
    /* ignore */
  }
  return { data: null };
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY) || !!localStorage.getItem(LEGACY_KEY);
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A'];
export const RANK_POINTS = { F: 0, E: 3, D: 7, C: 12, B: 20, A: 30 };

/**
 * Condition language (all keys of one object must hold; arrays mean "all of"):
 *  { flag } { notFlag } { quest, status: 'none'|'active'|'done'|'available'|'notDone', stage }
 *  { member } { rank: 'E' } (at least) { item, n } { eris } { level } { hour: [from, to] }
 *  { rel: [npc, min] } { met: npc } { any: [...] } { not: {...} } { counter: [name, min] }
 *  { roxy: true } { day: n } (at least)
 */
export function check(rpg, cond) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every((c) => check(rpg, c));
  const S = rpg.state;
  for (const [k, v] of Object.entries(cond)) {
    switch (k) {
      case 'flag': if (!S.flags[v]) return false; break;
      case 'notFlag': if (S.flags[v]) return false; break;
      case 'quest': {
        const q = S.quests[v];
        const status = cond.status ?? 'active';
        if (status === 'none' && q) return false;
        if (status === 'active' && q?.status !== 'active') return false;
        if (status === 'done' && q?.status !== 'done') return false;
        if (status === 'notDone' && q?.status === 'done') return false;
        if (status === 'available' && (q || !rpg.quests.canStart(v))) return false;
        if (cond.stage && (q?.status !== 'active' || rpg.quests.stageId(v) !== cond.stage)) return false;
        break;
      }
      case 'status': case 'stage': break;
      case 'member': if (!!S.guild.member !== !!v) return false; break;
      case 'rank': if (RANKS.indexOf(S.guild.rank) < RANKS.indexOf(v)) return false; break;
      case 'item': if (rpg.inventory.count(v) < (cond.n ?? 1)) return false; break;
      case 'n': break;
      case 'eris': if (rpg.inventory.eris < v) return false; break;
      case 'level': if (rpg.game.player.level < v) return false; break;
      case 'hour': {
        const h = rpg.clock.hour;
        const [a, b] = v;
        if (a <= b ? !(h >= a && h < b) : !(h >= a || h < b)) return false;
        break;
      }
      case 'rel': if ((S.rel[v[0]] || 0) < v[1]) return false; break;
      case 'met': if (!S.met[v]) return false; break;
      case 'any': if (!v.some((c) => check(rpg, c))) return false; break;
      case 'not': if (check(rpg, v)) return false; break;
      case 'counter': if ((S.counters[v[0]] || 0) < v[1]) return false; break;
      case 'roxy': if (!!S.flags.roxy_companion !== !!v) return false; break;
      case 'day': if (S.time.day < v) return false; break;
      case 'canPromote': if (rpg.guild.canPromote() !== !!v) return false; break;
      default: break;
    }
  }
  return true;
}
