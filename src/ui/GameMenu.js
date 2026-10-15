import { ITEMS, KIND_NAMES, RARITY_NAMES } from '../data/items.js';
import { SLOTS } from '../systems/Inventory.js';
import { MapView } from './MapView.js';
import { RANK_TITLES } from '../rpg/Guild.js';
import { RANK_POINTS } from '../rpg/State.js';
import { XP_TABLE } from '../rpg/RPG.js';
import { NPCS } from '../data/npcs.js';
import { lockedReason } from '../combat/unlocks.js';

/**
 * The game menu (game paused while open): Inventory (I), Journal (J), Map (M),
 * Character (C), Guild (G). Esc closes.
 */
const TABS = [
  { id: 'inv', label: 'Инвентарь', key: 'I' },
  { id: 'journal', label: 'Журнал', key: 'J' },
  { id: 'map', label: 'Карта', key: 'M' },
  { id: 'char', label: 'Персонаж', key: 'C' },
  { id: 'guild', label: 'Гильдия', key: 'G' },
  { id: 'combat', label: 'Бой', key: 'K' },
  { id: 'sound', label: 'Звук', key: 'O' },
];
const CAT = { story: 'Сюжет', contract: 'Заказ гильдии', side: 'Поручение' };

export class GameMenu {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = { root: $('menu'), tabs: $('menu-tabs'), body: $('menu-body'), foot: $('menu-foot') };
    this.open = false;
    this.tab = 'inv';
    this.sel = null;
    this.qsel = null;
    this.tabButtons = {};
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'menu-tab';
      b.innerHTML = `${t.label} <kbd>${t.key}</kbd>`;
      b.addEventListener('click', () => this.show(t.id));
      this.el.tabs.appendChild(b);
      this.tabButtons[t.id] = b;
    }
    this.map = new MapView(game);
    game.inventory.onChange(() => this.open && this.tab === 'inv' && this.render());
    window.addEventListener('resize', () => this.open && this.tab === 'map' && this.map.resize());
  }

  get rpg() {
    return this.game.rpg;
  }

  toggle(tab) {
    if (this.open && this.tab === tab) return this.close();
    this.show(tab);
  }

  show(tab) {
    if (tab === 'guild' && !this.rpg.state.guild.member) {
      this.game.hud.toast('Гильдия: сначала нужно получить лицензию.');
      if (!this.open) return;
      tab = 'inv';
    }
    this.tab = tab;
    if (!this.open) {
      this.open = true;
      this.el.root.classList.add('show');
      document.exitPointerLock?.();
    }
    for (const t of TABS) this.tabButtons[t.id].classList.toggle('active', t.id === tab);
    this.tabButtons.guild.disabled = !this.rpg.state.guild.member;
    this.render();
  }

  close() {
    this.open = false;
    this.el.root.classList.remove('show');
    setTimeout(() => { if (!this.game.uiBlocking) this.game.input.requestLock(); }, 0);
  }

  render() {
    const body = this.el.body;
    body.innerHTML = '';
    this.el.foot.textContent = `${this.rpg.clock.label()} · 🪙 ${this.game.inventory.eris}`;
    if (this.tab === 'inv') this._inv(body);
    if (this.tab === 'journal') this._journal(body);
    if (this.tab === 'map') {
      const wrap = div('mapwrap');
      const cv = div('mapcanvas');
      const leg = div('map-legend');
      leg.innerHTML = '<b>Карта</b><br>Колесо — масштаб<br>Перетаскивание — сдвиг<br><br><span style="color:#ff5a3a">▲</span> Мегумин<br><span style="color:#ffd36a">◆</span> цель задания<br>Тёмные области — ещё не исследованы.<br><br>Регионы открываются, когда вы их посещаете.';
      // Two pages: the old map and the Ainstrey region (the north is up on both).
      const pages = document.createElement('div');
      pages.style.cssText = 'display:flex;gap:6px;margin:10px 0';
      for (const [id, label] of [['main', 'Окрестности Акселя'], ['ainstrey', 'Айнстрей и тракт']]) {
        const b = document.createElement('button');
        b.className = 'menu-tab';
        b.textContent = label;
        b.addEventListener('click', () => { this.map.setSheet(id); });
        pages.appendChild(b);
      }
      leg.appendChild(pages);
      wrap.append(cv, leg);
      body.appendChild(wrap);
      this.map.attach(cv);
    }
    if (this.tab === 'char') this._char(body);
    if (this.tab === 'guild') this._guild(body);
    if (this.tab === 'combat') this._combat(body);
    if (this.tab === 'sound') this._sound(body);
  }

  // --------------------------------------------------------------------------- combat
  /** Combat settings (shake, flashes, auto-switch, companion tactics) and a reference of both skill sets. */
  _combat(body) {
    const C = this.game.combat, S = C.settings;
    const wrap = div('col');
    wrap.style.cssText = 'overflow:auto;width:100%;padding-right:6px';
    wrap.appendChild(h('Бой'));
    const set = (key, val) => { S[key] = val; C.saveSettings(); };
    const slider = (label, key, hint) => {
      const row = div('row');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;margin:8px 0';
      const l = document.createElement('span');
      l.style.minWidth = '190px';
      l.textContent = label;
      const r = document.createElement('input');
      r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(S[key] * 100);
      const v = document.createElement('span');
      v.textContent = r.value + '%';
      r.addEventListener('input', () => { set(key, r.value / 100); v.textContent = r.value + '%'; });
      row.append(l, r, v);
      if (hint) { const sm = document.createElement('small'); sm.style.opacity = 0.7; sm.textContent = hint; row.appendChild(sm); }
      return row;
    };
    const check = (label, key, hint) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:8px 0;cursor:pointer';
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = !!S[key];
      c.addEventListener('change', () => set(key, c.checked));
      const t = document.createElement('span');
      t.textContent = label;
      row.append(c, t);
      if (hint) { const sm = document.createElement('small'); sm.style.opacity = 0.7; sm.textContent = hint; row.appendChild(sm); }
      return row;
    };
    wrap.append(
      slider('Тряска камеры', 'shake', 'на механику не влияет'),
      slider('Яркие вспышки', 'flash', '0 — без вспышек'),
      check('Переключаться на напарницу после Explosion', 'autoSwitch', 'Мегумин после заклинания обессилена на 12 с'),
      check('Напарница сама применяет средние навыки', 'skillsInTactics', 'сильные заклинания она не использует никогда'),
    );
    const order = document.createElement('p');
    order.style.opacity = 0.8;
    order.textContent = 'Приказ напарнице (T): рядом · держать точку · отступить. Tab — сменить героиню (боевая пауза 1,2 с).';
    wrap.appendChild(order);
    for (const [hid, title] of [['megumin', 'Мегумин'], ['roxy', 'Рокси']]) {
      const hh = h(title + (hid === 'roxy' && !this.game.player.companionUnlocked ? ' (ещё не с нами)' : ''));
      wrap.appendChild(hh);
      const grid = div('combat-cards');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px';
      for (const key of ['Q', 'E', 'R', 'F']) {
        const info = C.slotInfo(hid, key);
        const sp = info.spec;
        const lock = lockedReason(this.rpg, hid, sp.id);
        const card = div('combat-card');
        card.style.cssText = 'border:1px solid var(--panel-line);border-radius:8px;padding:8px 10px;background:rgba(255,255,255,0.03)';
        const cost = [sp.cost.mana ? sp.cost.mana + ' маны' : '', sp.cost.stamina ? sp.cost.stamina + ' выносл.' : '', sp.cooldown ? 'перезарядка ' + sp.cooldown + ' с' : ''].filter(Boolean).join(' · ');
        card.innerHTML = `<b>${sp.name.replace(/ \/ .*/, '')}</b> <kbd>${key}</kbd><br><small style="opacity:.75">${cost}</small>`
          + (lock ? `<br><small style="color:#ff8f7a">${lock}</small>` : '');
        grid.appendChild(card);
      }
      wrap.appendChild(grid);
    }
    body.appendChild(wrap);
  }

  // --------------------------------------------------------------------------- sound
  _sound(body) {
    const A = this.game.audio, S = A.settings;
    const wrap = div('col');
    wrap.appendChild(h('Звук'));
    const slider = (label, key) => {
      const row = div('row');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;margin:10px 0';
      const l = document.createElement('span');
      l.style.minWidth = '150px';
      l.textContent = label;
      const r = document.createElement('input');
      r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(S[key] * 100);
      r.addEventListener('input', () => { A.set(key, r.value / 100); v.textContent = r.value + '%'; });
      const v = document.createElement('span');
      v.textContent = r.value + '%';
      row.append(l, r, v);
      return row;
    };
    const check = (label, key, hint) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:10px 0;cursor:pointer';
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = !!S[key];
      c.addEventListener('change', () => A.set(key, c.checked));
      const t = document.createElement('span');
      t.textContent = label;
      row.append(c, t);
      if (hint) { const s = document.createElement('small'); s.style.opacity = 0.7; s.textContent = hint; row.appendChild(s); }
      return row;
    };
    wrap.append(
      slider('Общая громкость', 'master'), slider('Эффекты', 'sfx'), slider('Музыка', 'music'),
      check('Выключить звук', 'muted', '(клавиша N)'),
      check('Подписи звуков', 'captions', 'важные сигналы показываются текстом'),
    );
    const note = document.createElement('p');
    note.style.opacity = 0.7;
    note.textContent = 'Музыка сменяется сама: город, поле, ночь, бой. Вкладка закрывается Esc.';
    wrap.appendChild(note);
    body.appendChild(wrap);
  }

  // --------------------------------------------------------------------------- inventory
  _inv(body) {
    const inv = this.game.inventory;
    const wrap = div('inv2');
    const left = div('col');
    left.appendChild(h('Снаряжение'));
    const eq = div('equip');
    for (const [slot, label] of [['weapon', 'Посох'], ['acc1', 'Аксессуар'], ['acc2', 'Аксессуар']]) {
      const id = inv.equipment[slot];
      const s = slotButton(id ? ITEMS[id] : null, null, () => { this.sel = id ? { id, slot } : null; this.render(); });
      s.insertAdjacentHTML('afterbegin', `<small>${label}</small>`);
      if (this.sel?.slot === slot) s.classList.add('sel');
      eq.appendChild(s);
    }
    left.appendChild(eq);
    left.appendChild(h(`Сумка ${inv.items.length}/${SLOTS}`));
    const grid = div('inv-grid');
    for (let i = 0; i < SLOTS; i++) {
      const s = inv.items[i];
      const b = slotButton(s ? ITEMS[s.id] : null, s?.count, () => { this.sel = s ? { id: s.id } : null; this.render(); }, () => s && inv.use(s.id));
      if (s && this.sel?.id === s.id && !this.sel.slot) b.classList.add('sel');
      grid.appendChild(b);
    }
    left.appendChild(grid);
    const right = div('inv-detail');
    const sel = this.sel && (this.sel.slot ? inv.equipment[this.sel.slot] === this.sel.id : inv.items.some((x) => x.id === this.sel.id)) ? this.sel : null;
    if (!sel) {
      right.innerHTML = '<div class="inv-empty">Выбери предмет.<br>Двойной клик — использовать / надеть.<br><br>3 — зелье исцеления · 4 — эликсир бодрости · 5 — эликсир маны</div>';
    } else {
      const it = ITEMS[sel.id];
      right.innerHTML = `<div class="d-ico">${it.icon}</div><div class="d-name r-${it.rarity}">${esc(it.name)}</div>
        <div class="d-meta">${KIND_NAMES[it.kind] || ''} · ${RARITY_NAMES[it.rarity] || ''}${sel.slot ? ' · надето' : ' · ×' + inv.count(sel.id)}${it.price ? ' · цена ' + it.price + ' 🪙' : ''}</div>
        <div class="d-desc">${esc(it.desc || '')}</div>`;
      const acts = div('d-actions');
      const btn = (t, fn, ghost) => {
        const b = document.createElement('button');
        b.className = 'btn' + (ghost ? ' ghost' : '');
        b.textContent = t;
        b.addEventListener('click', () => { fn(); this.render(); });
        acts.appendChild(b);
      };
      if (sel.slot) {
        if (sel.slot !== 'weapon') btn('Снять', () => inv.unequip(sel.slot));
      } else {
        if (it.slot) btn('Надеть', () => inv.equip(sel.id));
        if (it.kind === 'consumable' || it.kind === 'food') btn('Использовать', () => inv.use(sel.id));
        if (it.kind === 'book') btn('Читать', () => inv.use(sel.id));
        if (it.kind !== 'quest') btn('Выбросить', () => inv.discard(sel.id, 1), true);
      }
      right.appendChild(acts);
    }
    wrap.append(left, right);
    body.appendChild(wrap);
  }

  // --------------------------------------------------------------------------- journal
  _journal(body) {
    const Q = this.rpg.quests;
    const wrap = div('journal');
    const list = div('qlist scroll');
    const active = Q.active().sort((a, b) => (Q.def(a).category === 'story' ? -1 : 1) - (Q.def(b).category === 'story' ? -1 : 1));
    const done = Q.done();
    if (!this.qsel || !Q.def(this.qsel)) this.qsel = Q.tracked || active[0] || done[0] || null;
    list.appendChild(h('Активные'));
    if (!active.length) list.insertAdjacentHTML('beforeend', '<div class="inv-empty" style="margin:8px 0">Нет активных заданий.</div>');
    for (const id of active) list.appendChild(this._qitem(id, false));
    if (done.length) {
      list.appendChild(h('Выполненные'));
      for (const id of done.slice().reverse()) list.appendChild(this._qitem(id, true));
    }
    const det = div('qdetail scroll');
    if (this.qsel) {
      const d = Q.def(this.qsel);
      const q = this.rpg.state.quests[this.qsel];
      det.innerHTML = `<div class="qt">${esc(d.title)}</div><div class="qc">${CAT[d.category]}${d.kind ? ' · ' + d.kind : ''}${d.chapter !== undefined && d.category === 'story' ? ' · ' + chapterName(d.chapter) : ''}</div><div>${esc(d.summary || '')}</div>`;
      const stages = div('col');
      stages.style.marginTop = '12px';
      d.stages.forEach((st, i) => {
        if (q.status === 'active' && i > q.stage) return;
        const cur = q.status === 'active' && i === q.stage;
        const s = div('qstage' + (cur ? ' cur' : ''));
        s.textContent = (i < q.stage || q.status === 'done' ? '✓ ' : '') + st.text;
        if (cur) st.objectives?.forEach((o, k) => {
          if (o.type === 'talk' && !o.label) return;
          const ok = Q.objectiveDone(this.qsel, k);
          const ob = div('ob' + (ok ? ' done' : ''));
          ob.textContent = (ok ? '✓ ' : '• ') + Q.objectiveText(this.qsel, k);
          s.appendChild(ob);
        });
        stages.appendChild(s);
      });
      det.appendChild(stages);
      const r = d.rewards || {};
      const rew = [r.eris && `${r.eris} 🪙`, r.xp && `${r.xp} опыта`, r.rankPoints && `${r.rankPoints} очк. гильдии`, ...(r.items || []).map(([id, n]) => `${ITEMS[id].icon} ${ITEMS[id].name}${n > 1 ? ' ×' + n : ''}`)].filter(Boolean);
      if (rew.length) det.insertAdjacentHTML('beforeend', `<div class="h" style="margin-top:14px">Награда</div><div>${rew.join(' · ')}</div>`);
      if (q.status === 'active') {
        const b = document.createElement('button');
        b.className = 'btn';
        b.style.marginTop = '14px';
        b.textContent = Q.tracked === this.qsel ? 'Отслеживается ◆' : 'Отслеживать';
        b.disabled = Q.tracked === this.qsel;
        b.addEventListener('click', () => { Q.tracked = this.qsel; this.render(); });
        det.appendChild(b);
      }
    }
    wrap.append(list, det);
    body.appendChild(wrap);
  }

  _qitem(id, done) {
    const Q = this.rpg.quests;
    const d = Q.def(id);
    const b = document.createElement('button');
    b.className = 'qitem' + (this.qsel === id ? ' sel' : '') + (Q.tracked === id ? ' tracked' : '') + (done ? ' done' : '');
    b.innerHTML = `${esc(d.title)}<small>${CAT[d.category]}${done ? ' · выполнено' : ' · ' + esc(Q.stage(id)?.text || '').slice(0, 60) + '…'}</small>`;
    b.addEventListener('click', () => { this.qsel = id; this.render(); });
    return b;
  }

  // --------------------------------------------------------------------------- character
  _char(body) {
    const p = this.game.player, inv = this.game.inventory, S = this.rpg.state;
    const pa = inv.passives();
    const wrap = div('charpage');
    const left = div('col');
    left.appendChild(h('Мегумин · Архимаг'));
    const st = div('stats');
    const rows = [
      ['Уровень', p.level], ['Опыт', `${Math.floor(p.xp)} / ${XP_TABLE(p.level)}`],
      ['Здоровье', `${Math.ceil(p.hp)} / ${p.maxHp}`], ['Мана', `${Math.floor(p.mana)} / ${p.maxMana}`],
      ['Урон посохом', `×${pa.meleeMul.toFixed(2)}`], ['Получаемый урон', `×${pa.defenseMul.toFixed(2)}`],
      ['Расход выносливости', `×${pa.runDrainMul.toFixed(2)}`], ['Восстановление маны', `×${pa.manaRegenMul.toFixed(2)}`],
      ['Ранг гильдии', S.guild.member ? RANK_TITLES[S.guild.rank] : 'нет лицензии'],
      ['Открыто мест', `${this.game.discovered.size}`], ['Выполнено заказов', S.guild.completed.length],
      ['Время', this.rpg.clock.label()],
    ];
    for (const [a, b] of rows) st.insertAdjacentHTML('beforeend', `<span>${a}</span><span>${esc(String(b))}</span>`);
    left.appendChild(st);
    if (S.flags.roxy_companion) left.insertAdjacentHTML('beforeend', '<div class="h" style="margin-top:12px">Спутница</div><div>Рокси Мигурдия — маг воды. Tab — сменить героиню.</div>');
    const right = div('col scroll');
    right.appendChild(h('Знакомые'));
    const rel = div('rel');
    const met = NPCS.filter((n) => S.met[n.id]);
    if (!met.length) right.insertAdjacentHTML('beforeend', '<div class="inv-empty">Пока ни с кем не знакомы.</div>');
    for (const n of met) {
      const v = S.rel[n.id] || 0;
      rel.insertAdjacentHTML('beforeend', `<span>${esc(n.name)} <small style="color:var(--hud-dim)">${esc(n.title)}</small></span><div class="relbar"><i style="width:${Math.max(4, (v + 100) / 2)}%"></i></div>`);
    }
    right.appendChild(rel);
    if (S.log.length) {
      right.appendChild(h('Недавние события'));
      for (const l of S.log.slice(0, 8)) right.insertAdjacentHTML('beforeend', `<div style="font-size:12px;color:var(--hud-dim)">День ${l.day}: ${esc(l.text)}</div>`);
    }
    wrap.append(left, right);
    body.appendChild(wrap);
  }

  // --------------------------------------------------------------------------- guild
  _guild(body) {
    const rpg = this.rpg, G = rpg.state.guild, Q = rpg.quests;
    const wrap = div('guildpage');
    const left = div('col scroll');
    left.appendChild(h('Доска заказов'));
    const board = Q.boardContracts();
    if (!board.length) left.insertAdjacentHTML('beforeend', '<div class="inv-empty">Новых заказов пока нет. Загляните позже или повысьте ранг.</div>');
    for (const d of board) {
      const ok = Q.canStart(d.id);
      const c = div('contract');
      const r = d.rewards || {};
      c.innerHTML = `<div><div class="ck">${esc(d.kind || 'Заказ')} · ранг ${d.rank || 'F'}</div><div class="ct">${esc(d.title)}</div></div><div></div><div class="cd">${esc(d.summary)}</div><div class="cr">${[r.eris && r.eris + ' 🪙', r.xp && r.xp + ' опыта', r.rankPoints && r.rankPoints + ' очк.'].filter(Boolean).join(' · ')}</div>`;
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = ok ? 'Взять заказ' : `Нужен ранг ${d.rank}`;
      b.disabled = !ok;
      b.addEventListener('click', () => { Q.start(d.id); this.render(); });
      c.children[1].appendChild(b);
      left.appendChild(c);
    }
    const act = Q.active().filter((id) => Q.def(id).category === 'contract');
    if (act.length) {
      left.appendChild(h('Взятые заказы'));
      for (const id of act) left.insertAdjacentHTML('beforeend', `<div class="contract"><div><div class="ck">${esc(Q.def(id).kind || '')}</div><div class="ct">${esc(Q.def(id).title)}</div></div><div></div><div class="cd">${esc(Q.stage(id)?.text || '')}</div></div>`);
    }
    const right = div('col');
    const next = rpg.guild.nextRank();
    right.innerHTML = `<div class="rankbox"><div class="h">Ваш ранг</div><div class="rk">${G.rank}</div><div>${RANK_TITLES[G.rank]}</div><div style="margin-top:8px">Очки гильдии: <b style="color:var(--gold)">${G.points}</b>${next ? ' / ' + RANK_POINTS[next] : ''}</div><div style="margin-top:6px;color:var(--hud-dim);font-size:12px">${esc(rpg.guild.promotionHint())}</div><div style="margin-top:6px;color:var(--hud-dim);font-size:12px">Повышение — у Луны за стойкой.</div></div>`;
    if (G.completed.length) {
      right.appendChild(h('История заказов'));
      for (const id of G.completed.slice(-8).reverse()) right.insertAdjacentHTML('beforeend', `<div style="font-size:12.5px">✓ ${esc(Q.def(id)?.title || id)}</div>`);
    }
    wrap.append(left, right);
    body.appendChild(wrap);
  }

  update(dt, input) {
    if (!this.open) return;
    if (input.wasPressed('Escape')) return this.close();
    for (const t of TABS) if (input.wasPressed('Key' + t.key)) return this.toggle(t.id);
    if (this.tab === 'map') {
      this._mapT = (this._mapT || 0) - dt;
      if (this._mapT <= 0) { this._mapT = 0.25; this.map.draw(); }
    }
  }
}

function div(cls) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function h(t) {
  const d = div('h');
  d.textContent = t;
  return d;
}

function slotButton(it, count, onClick, onDbl) {
  const b = document.createElement('button');
  b.className = 'inv-slot' + (it ? ` filled r-${it.rarity}${it.kind === 'quest' ? ' k-quest' : ''}${it.tint ? ' t-' + it.tint : ''}` : '');
  if (it) {
    b.innerHTML = `<span class="ico">${it.icon}</span>${count > 1 ? `<b>${count}</b>` : ''}`;
    b.title = it.name;
  }
  b.addEventListener('click', onClick);
  if (onDbl) b.addEventListener('dblclick', onDbl);
  return b;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function chapterName(n) {
  return n === 0 ? 'Пролог' : `Глава ${n}`;
}
