/**
 * Item feedback on the HUD: loot feed, quick slots (3 healing, 4 stamina, 5 mana) and the
 * book reader. The inventory window itself is a tab of the game menu (GameMenu).
 */
export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.inv = game.inventory;
    const $ = (id) => document.getElementById(id);
    this.el = {
      feed: $('loot-feed'), book: $('book'), bookTitle: $('book-title'), bookText: $('book-text'),
      q3: $('quick-3'), q4: $('quick-4'), q5: $('quick-5'), hudEris: $('hud-eris'),
    };
    this.bookOpen = false;
    this.el.book.addEventListener('click', () => this.closeBook());
    this.inv.onChange(() => this.render());
    this.render();
  }

  readBook(item) {
    this.bookOpen = true;
    this.el.bookTitle.textContent = `${item.icon || ''} ${item.name}`;
    this.el.bookText.textContent = item.text;
    this.el.book.classList.add('show');
    document.exitPointerLock?.();
  }

  closeBook() {
    this.bookOpen = false;
    this.el.book.classList.remove('show');
    setTimeout(() => { if (!this.game.uiBlocking) this.game.input.requestLock(); }, 0);
  }

  lootPopup(item, n) {
    const row = document.createElement('div');
    row.className = 'loot-row r-' + item.rarity + (item.tint ? ' t-' + item.tint : '');
    row.innerHTML = `<span class="ico">${item.icon}</span><span></span><b>×${n}</b>`;
    row.children[1].textContent = item.name;
    this.el.feed.appendChild(row);
    setTimeout(() => row.classList.add('out'), 2600);
    setTimeout(() => row.remove(), 3200);
    while (this.el.feed.children.length > 6) this.el.feed.firstChild.remove();
  }

  render() {
    const inv = this.inv;
    this.el.hudEris.textContent = `🪙 ${inv.eris}`;
    for (const [el, id] of [[this.el.q3, 'hp_potion'], [this.el.q4, 'st_potion'], [this.el.q5, 'mana_potion']]) {
      const n = inv.count(id);
      el.querySelector('b').textContent = n;
      el.classList.toggle('empty', !n);
    }
  }
}
