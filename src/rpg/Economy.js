import { ITEMS, sellPrice } from '../data/items.js';
import { SHOPS, RECIPES } from '../data/shops.js';
import { check } from './State.js';

/**
 * Shops and crafting.
 *
 * Shops (data/shops.js): stock lists with limited quantities that refill every morning,
 * the item categories the owner buys, optional price factor. Friendly owners (relationship
 * >= 30) give 10% off. Every transaction really moves items and coins, and is refused with a
 * clear message when money or bag space is missing.
 *
 * Crafting: recipes per station (alchemy / forge) with ingredients, a fee and a result.
 */
export class Economy {
  constructor(rpg) {
    this.rpg = rpg;
  }

  get inv() {
    return this.rpg.inventory;
  }

  shop(id) {
    return SHOPS[id];
  }

  /** Remaining stock (refilled once per game day). */
  _stock(id) {
    const S = this.rpg.state.shops;
    const day = this.rpg.clock.day;
    if (!S[id] || S[id].day !== day) {
      S[id] = { day, left: Object.fromEntries(SHOPS[id].stock.map(([item, n]) => [item, n])) };
    }
    return S[id].left;
  }

  discount(id) {
    const owner = SHOPS[id].owner;
    return (this.rpg.state.rel[owner] || 0) >= 30 ? 0.9 : 1;
  }

  buyPrice(shopId, item) {
    const base = SHOPS[shopId].prices?.[item] ?? ITEMS[item].price ?? 1;
    return Math.max(1, Math.round(base * (SHOPS[shopId].priceFactor ?? 1) * this.discount(shopId)));
  }

  sellPriceAt(shopId, item) {
    const sh = SHOPS[shopId];
    const it = ITEMS[item];
    if (!it || !sh.buys?.includes(it.kind)) return 0;
    return sellPrice(item);
  }

  /** Items on sale: [{ item, price, left }] */
  listing(shopId) {
    const left = this._stock(shopId);
    return SHOPS[shopId].stock
      .filter(([item, , cond]) => !cond || check(this.rpg, cond))
      .map(([item]) => ({ item, price: this.buyPrice(shopId, item), left: left[item] ?? 0 }));
  }

  buy(shopId, item, qty = 1) {
    const left = this._stock(shopId);
    const it = ITEMS[item];
    if ((left[item] ?? 0) < qty) return { ok: false, msg: 'Этого товара больше нет. Загляни завтра.' };
    const price = this.buyPrice(shopId, item) * qty;
    if (this.inv.eris < price) return { ok: false, msg: `Не хватает эрис: нужно ${price}, есть ${this.inv.eris}.` };
    if (!this.inv.canAdd(item)) return { ok: false, msg: 'Сумка полна — освободи ячейку.' };
    this.inv.spend(price);
    this.inv.add(item, qty, true);
    left[item] -= qty;
    this.rpg.events.emit('buy', { shop: shopId, item, qty, price });
    this.rpg.markDirty();
    return { ok: true, msg: `Куплено: ${it.icon} ${it.name}${qty > 1 ? ' ×' + qty : ''} за ${price} эрис.` };
  }

  sell(shopId, item, qty = 1) {
    const it = ITEMS[item];
    const unit = this.sellPriceAt(shopId, item);
    if (!unit) return { ok: false, msg: it?.kind === 'quest' ? 'Это нужно для задания.' : 'Этот торговец такое не покупает.' };
    if (this.inv.items.find((s) => s.id === item)?.count < qty || !this.inv.items.some((s) => s.id === item)) return { ok: false, msg: 'Нечего продавать.' };
    this.inv.remove(item, qty);
    this.inv.add('eris', unit * qty, true);
    // Sold goods appear in the shop's stock for today.
    const left = this._stock(shopId);
    if (left[item] !== undefined) left[item] += qty;
    this.rpg.events.emit('sell', { shop: shopId, item, qty });
    this.rpg.markDirty();
    return { ok: true, msg: `Продано: ${it.icon} ${it.name}${qty > 1 ? ' ×' + qty : ''} за ${unit * qty} эрис.` };
  }

  // --- crafting ---
  recipes(station) {
    return RECIPES.filter((r) => r.station === station && (!r.requires || check(this.rpg, r.requires)));
  }

  lockedRecipes(station) {
    return RECIPES.filter((r) => r.station === station && r.requires && !check(this.rpg, r.requires));
  }

  canCraft(r) {
    if (this.inv.eris < (r.fee || 0)) return false;
    return r.inputs.every(([item, n]) => this.inv.count(item) >= n);
  }

  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return { ok: false, msg: 'Неизвестный рецепт.' };
    if (r.requires && !check(this.rpg, r.requires)) return { ok: false, msg: 'Этот рецепт пока недоступен.' };
    if (!this.canCraft(r)) return { ok: false, msg: 'Не хватает материалов или денег.' };
    const [out, n] = r.output;
    if (!this.inv.canAdd(out)) return { ok: false, msg: 'Сумка полна.' };
    for (const [item, k] of r.inputs) this.inv.remove(item, k);
    if (r.fee) this.inv.spend(r.fee);
    this.inv.add(out, n, true);
    this.rpg.events.emit('craft', { item: out, n, recipe: id });
    this.rpg.markDirty();
    const it = ITEMS[out];
    return { ok: true, msg: `Готово: ${it.icon} ${it.name}${n > 1 ? ' ×' + n : ''}.` };
  }
}
