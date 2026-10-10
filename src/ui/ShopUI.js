import { ITEMS, KIND_NAMES } from '../data/items.js';

/**
 * Trade window (buy from the owner's stock / sell what they accept) and the crafting
 * workshop (recipes of the station). Shift+click trades five at once.
 */
export class ShopUI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = { root: $('shop'), name: $('shop-name'), eris: $('shop-eris'), body: $('shop-body'), msg: $('shop-msg') };
    this.open = false;
    this.mode = null;
    this.id = null;
    game.inventory.onChange(() => this.open && this.render());
  }

  get eco() {
    return this.game.rpg.economy;
  }

  openShop(id) {
    this.mode = 'shop';
    this.id = id;
    this._show(this.eco.shop(id).name);
  }

  openCraft(station) {
    this.mode = 'craft';
    this.id = station;
    this._show(station === 'alchemy' ? 'Мастерская алхимика' : 'Кузнечный горн');
  }

  _show(title) {
    this.open = true;
    this.el.name.textContent = title;
    this.el.msg.textContent = '';
    this.el.root.classList.add('show');
    document.exitPointerLock?.();
    this.render();
  }

  close() {
    this.open = false;
    this.el.root.classList.remove('show');
    setTimeout(() => { if (!this.game.uiBlocking) this.game.input.requestLock(); }, 0);
  }

  _say(r) {
    this.el.msg.textContent = r.msg;
    this.el.msg.className = 'shop-msg' + (r.ok ? '' : ' err');
  }

  render() {
    const inv = this.game.inventory;
    this.el.eris.textContent = `🪙 ${inv.eris}`;
    const body = this.el.body;
    body.innerHTML = '';
    if (this.mode === 'shop') {
      const left = this._col('Товары');
      for (const row of this.eco.listing(this.id)) {
        const it = ITEMS[row.item];
        const can = row.left > 0 && inv.eris >= row.price;
        left.list.appendChild(this._row(it, `${KIND_NAMES[it.kind] || ''} · осталось ${row.left}`, row.price, 'Купить', can, (e) => this._say(this.eco.buy(this.id, row.item, e.shiftKey ? 5 : 1))));
      }
      const right = this._col('Ваша сумка — продать');
      const sellable = inv.items.filter((s) => this.eco.sellPriceAt(this.id, s.id) > 0);
      if (!sellable.length) right.list.innerHTML = '<div class="inv-empty">Здесь нечего продать.<br>Этот торговец покупает: ' + this.eco.shop(this.id).buys.map((k) => KIND_NAMES[k]).join(', ').toLowerCase() + '.</div>';
      for (const s of sellable) {
        const it = ITEMS[s.id];
        right.list.appendChild(this._row(it, `×${s.count}`, this.eco.sellPriceAt(this.id, s.id), 'Продать', true, (e) => this._say(this.eco.sell(this.id, s.id, e.shiftKey ? Math.min(5, s.count) : 1))));
      }
      body.append(left.col, right.col);
    } else {
      const left = this._col('Рецепты');
      for (const r of this.eco.recipes(this.id)) left.list.appendChild(this._recipe(r, false));
      for (const r of this.eco.lockedRecipes(this.id)) left.list.appendChild(this._recipe(r, true));
      const right = this._col('Материалы в сумке');
      const mats = inv.items.filter((s) => ['material', 'consumable'].includes(ITEMS[s.id].kind));
      if (!mats.length) right.list.innerHTML = '<div class="inv-empty">Материалов нет. Травы растут на лугах, руда — у старой шахты.</div>';
      for (const s of mats) right.list.appendChild(this._row(ITEMS[s.id], `×${s.count}`, null, null, false, null));
      body.append(left.col, right.col);
    }
  }

  _col(title) {
    const col = document.createElement('div');
    col.className = 'shop-col';
    col.innerHTML = `<div class="h">${title}</div>`;
    const list = document.createElement('div');
    list.className = 'shop-list';
    col.appendChild(list);
    return { col, list };
  }

  _row(it, sub, price, action, enabled, onClick) {
    const r = document.createElement('div');
    r.className = 'srow' + (enabled || !action ? '' : ' off');
    r.innerHTML = `<span class="ico">${it.icon}</span><span class="nm"></span><span class="pr">${price != null ? price + ' 🪙' : ''}</span>`;
    r.querySelector('.nm').innerHTML = `${escape(it.name)}<small>${escape(sub)}</small>`;
    r.title = it.desc || '';
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = action;
      b.disabled = !enabled;
      b.addEventListener('click', onClick);
      r.appendChild(b);
    } else r.appendChild(document.createElement('span'));
    return r;
  }

  _recipe(r, locked) {
    const inv = this.game.inventory;
    const out = ITEMS[r.output[0]];
    const row = document.createElement('div');
    row.className = 'recipe' + (locked ? ' locked' : '');
    const ins = r.inputs.map(([id, n]) => {
      const have = inv.count(id);
      return `<span class="${have >= n ? 'ok' : 'no'}">${ITEMS[id].icon} ${escape(ITEMS[id].name)} ${Math.min(have, n)}/${n}</span>`;
    }).join(' · ');
    row.innerHTML = `<span class="ico" style="font-size:24px">${out.icon}</span><div><b>${escape(out.name)}</b>${r.output[1] > 1 ? ' ×' + r.output[1] : ''}<div class="ins">${ins}${r.fee ? ` · <span class="${inv.eris >= r.fee ? 'ok' : 'no'}">${r.fee} 🪙</span>` : ''}</div>${locked ? '<div class="ins">Рецепт пока неизвестен.</div>' : ''}</div>`;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Создать';
    b.disabled = locked || !this.eco.canCraft(r);
    b.addEventListener('click', () => this._say(this.eco.craft(r.id)));
    row.appendChild(b);
    return row;
  }

  update(input) {
    if (this.open && input.wasPressed('Escape')) this.close();
  }
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
