import { ITEMS, ENEMY_LOOT, sellPrice } from '../data/items.js';

export { ITEMS, ENEMY_LOOT };

/**
 * Bag + equipment + wallet. Data lives in the item catalogue (data/items.js); persistence
 * goes through the RPG state (`serialize` / `deserialize`).
 *
 * Equipment slots: weapon, acc1, acc2. Equipped items leave the bag. Their `stats` combine
 * into `passives()` (melee / runDrain / defense multipliers, maxHp / maxMana bonuses,
 * manaRegen multiplier).
 */
export const SLOTS = 30;

export class Inventory {
  constructor(game) {
    this.game = game;
    this.items = []; // [{ id, count }]
    this.eris = 0;
    this.equipment = { weapon: 'staff_apprentice', acc1: null, acc2: null };
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  _changed() {
    for (const fn of this.listeners) fn(this);
    this.game.rpg?.markDirty();
  }

  count(id) {
    if (id === 'eris') return this.eris;
    let n = this.items.find((s) => s.id === id)?.count || 0;
    for (const k in this.equipment) if (this.equipment[k] === id) n++;
    return n;
  }

  /** Free slots (a new stack needs one). */
  get free() {
    return SLOTS - this.items.length;
  }

  canAdd(id) {
    return id === 'eris' || this.items.some((s) => s.id === id) || this.items.length < SLOTS;
  }

  /** Add items; returns false if the bag is full. */
  /** `force`: quest rewards and gifts go in even over the 30 stacks (never lost). */
  add(id, n = 1, silent = false, force = false) {
    if (!ITEMS[id] || n <= 0) return false;
    if (id === 'eris') {
      this.eris += n;
    } else {
      const slot = this.items.find((s) => s.id === id);
      if (slot) slot.count += n;
      else if (this.items.length < SLOTS || force) this.items.push({ id, count: n });
      else {
        this.game.hud.toast('Сумка полна! Продай или выброси что-нибудь.');
        return false;
      }
    }
    if (!silent) this.game.hud.lootPopup(ITEMS[id], n);
    this._changed();
    this.game.rpg?.events.emit('item', { id, n });
    return true;
  }

  remove(id, n = 1) {
    if (id === 'eris') {
      if (this.eris < n) return false;
      this.eris -= n;
      this._changed();
      return true;
    }
    const i = this.items.findIndex((s) => s.id === id);
    if (i < 0 || this.items[i].count < n) return false;
    this.items[i].count -= n;
    if (this.items[i].count <= 0) this.items.splice(i, 1);
    this._changed();
    this.game.rpg?.events.emit('item', { id, n: -n });
    return true;
  }

  spend(eris) {
    if (this.eris < eris) return false;
    this.eris -= eris;
    this._changed();
    return true;
  }

  /** Use / read / equip an item. */
  use(id) {
    const it = ITEMS[id];
    if (!it || !this.items.some((s) => s.id === id)) return false;
    if (it.kind === 'book') {
      this.game.hud.readBook(it);
      return true;
    }
    if (it.slot) return this.equip(id);
    if (it.kind !== 'consumable' && it.kind !== 'food') return false;
    if (this.game.player.hp <= 0) return false;
    // Potions (docs/combat/01 §12): a shared party cooldown of 20 s after drinking; in a fight drinking takes 0.9 s
    // and is interrupted by damage (the potion is kept).
    const potion = it.kind === 'consumable' && /potion/.test(id);
    if (potion) {
      if (this.potionCd > 0) {
        this.game.hud.toast(`Зелья отряда на задержке: ${Math.ceil(this.potionCd)} с`, 1.6);
        return false;
      }
      if (this.drinking) return false;
      if (this.game.combat?.inCombat) {
        this.drinking = { id, t: 0, hp: this.game.player.hp, who: this.game.player.character };
        this.game.hud.toast(`${it.icon} Пьёт… (удар прервёт)`, 1.1);
        return true;
      }
    }
    return this._consume(id, it, potion);
  }

  /** Drinking timer and the shared potion cooldown (the game clock: both freeze on pause). */
  update(dt) {
    this.potionCd = Math.max(0, (this.potionCd || 0) - dt);
    const d = this.drinking;
    if (!d) return;
    d.t += dt;
    const p = this.game.player;
    if (p.character !== d.who || p.hp < d.hp - 0.5 || p.hp <= 0) {
      this.drinking = null;
      this.game.hud.toast('Питьё прервано — предмет сохранён.', 1.8);
    } else if (d.t >= 0.9) {
      this.drinking = null;
      if (this.items.some((s) => s.id === d.id)) this._consume(d.id, ITEMS[d.id], true);
    }
  }

  _consume(id, it, potion) {
    it.use(this.game);
    if (potion) this.potionCd = 20;
    this.remove(id, 1);
    const p = this.game.player.position;
    this.game.vfx.burst(it.tint === 'st' ? 'gold' : it.tint === 'mana' ? 'magicPop' : 'heal', p.clone().setY(p.y + 1), 24);
    this.game.hud.toast(`${it.icon} ${it.name}`, 1.5);
    return true;
  }

  equip(id) {
    const it = ITEMS[id];
    if (!it?.slot) return false;
    let slot = it.slot === 'weapon' ? 'weapon' : !this.equipment.acc1 ? 'acc1' : !this.equipment.acc2 ? 'acc2' : 'acc1';
    const old = this.equipment[slot];
    if (!this.remove(id, 1)) return false;
    this.equipment[slot] = id;
    if (old) this.add(old, 1, true);
    this.game.hud.toast(`Надето: ${it.icon} ${it.name}`, 1.8);
    this.game.player.applyStats?.();
    this._changed();
    return true;
  }

  unequip(slot) {
    const id = this.equipment[slot];
    if (!id || slot === 'weapon') return false; // a mage never goes without her staff
    if (!this.canAdd(id)) {
      this.game.hud.toast('Сумка полна!');
      return false;
    }
    this.equipment[slot] = null;
    this.add(id, 1, true);
    this.game.player.applyStats?.();
    return true;
  }

  /** Drop (destroy) an item stack — quest items can't be dropped. */
  discard(id, n = 1) {
    if (ITEMS[id]?.kind === 'quest') return false;
    return this.remove(id, n);
  }

  sellValue(id) {
    return sellPrice(id);
  }

  /** Combined bonuses of the equipped items. */
  passives() {
    const p = { meleeMul: 1, runDrainMul: 1, defenseMul: 1, maxHp: 0, maxMana: 0, manaRegenMul: 1 };
    for (const k in this.equipment) {
      const s = ITEMS[this.equipment[k]]?.stats;
      if (!s) continue;
      if (s.melee) p.meleeMul *= s.melee;
      if (s.runDrain) p.runDrainMul *= s.runDrain;
      if (s.defense) p.defenseMul *= s.defense;
      if (s.maxHp) p.maxHp += s.maxHp;
      if (s.maxMana) p.maxMana += s.maxMana;
      if (s.manaRegen) p.manaRegenMul *= s.manaRegen;
    }
    return p;
  }

  rollEnemyLoot(typeKey) {
    const out = [];
    for (const [id, chance, a, b] of ENEMY_LOOT[typeKey] || []) {
      if (Math.random() < chance) out.push([id, a + Math.floor(Math.random() * (b - a + 1))]);
    }
    return out;
  }

  serialize() {
    return { eris: this.eris, items: this.items.map((s) => ({ ...s })), equipment: { ...this.equipment } };
  }

  deserialize(d) {
    if (!d) return;
    this.eris = Math.max(0, Math.floor(d.eris || 0));
    this.items = (d.items || []).filter((s) => ITEMS[s.id] && s.count > 0 && s.id !== 'eris').slice(0, SLOTS);
    // Legacy trinkets lived in the bag; keep them there (they can be equipped now).
    this.equipment = { weapon: 'staff_apprentice', acc1: null, acc2: null, ...(d.equipment || {}) };
    for (const k in this.equipment) if (this.equipment[k] && !ITEMS[this.equipment[k]]) this.equipment[k] = null;
    if (!this.equipment.weapon) this.equipment.weapon = 'staff_apprentice';
    for (const fn of this.listeners) fn(this);
  }
}
