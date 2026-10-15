import { damp } from '../core/math.js';
import { SLOTS, SLOT_KEYS } from '../combat/core/specs.js';

/** Slot art: one simple distinct pictogram per skill (physical = amber/steel, water = cool). */
const ICONS = {
  M_Q: '<path d="M8 40 L36 12" stroke="#ffd27a" stroke-width="4" stroke-linecap="round"/><path d="M28 10 H38 V20" stroke="#ffb06a" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 30 Q12 36 18 42" stroke="#9a8a7a" stroke-width="2" fill="none" opacity=".7"/>',
  M_E: '<circle cx="24" cy="24" r="14" fill="none" stroke="#ffd27a" stroke-width="3.5" stroke-dasharray="62 26" stroke-linecap="round"/><path d="M36 10 L40 18 L31 18 Z" fill="#ffb06a"/><path d="M24 24 L36 14" stroke="#e8c090" stroke-width="2" opacity=".8"/>',
  M_R: '<defs><radialGradient id="exg" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#ffb12e"/><stop offset=".7" stop-color="#ff3d14"/><stop offset="1" stop-color="#5a0b0b"/></radialGradient></defs><circle cx="24" cy="24" r="21" fill="none" stroke="#ff7a3a" stroke-width="1.2" stroke-dasharray="3 2.4" opacity=".8"/><circle cx="24" cy="25" r="11" fill="url(#exg)"/>',
  M_F: '<path d="M6 36 L16 30 L14 24 L26 20 L24 14 L38 10" stroke="#ff7a3a" stroke-width="3.2" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 36 L16 30 L14 24 L26 20 L24 14 L38 10" stroke="#fff0c0" stroke-width="1.1" fill="none" stroke-linejoin="round"/><circle cx="38" cy="10" r="3.2" fill="#ffd27a"/>',
  R_Q: '<path d="M8 38 C12 18 26 34 30 18 S36 10 40 8" stroke="#8fd2ff" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M8 38 C12 18 26 34 30 18 S36 10 40 8" stroke="#e6f6ff" stroke-width="1" fill="none"/><circle cx="41" cy="14" r="1.6" fill="#bfe8ff"/><circle cx="37" cy="5" r="1.3" fill="#bfe8ff"/>',
  R_E: '<path d="M10 38 L34 14" stroke="#cfe6ff" stroke-width="4" stroke-linecap="round"/><path d="M30 10 L40 8 L38 18" stroke="#8fd2ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 14 L22 24" stroke="#5ab8ff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/><circle cx="14" cy="12" r="2.4" fill="#e6f6ff"/>',
  R_R: '<g fill="#7fc8ff"><path d="M10 34 q-3 -6 0 -9 q3 3 0 9z"/><path d="M18 30 q-3 -6 0 -9 q3 3 0 9z"/><path d="M26 28 q-3 -6 0 -9 q3 3 0 9z"/><path d="M34 24 q-3 -6 0 -9 q3 3 0 9z"/><path d="M40 18 q-3 -6 0 -9 q3 3 0 9z"/></g><path d="M6 38 Q24 30 42 14" stroke="#cfeaff" stroke-width="1.2" fill="none" stroke-dasharray="2 3"/>',
  R_F: '<path d="M24 6 C16 18 15 25 24 30 C33 25 32 18 24 6 Z" fill="#6fc0ff"/><path d="M6 36 Q12 31 18 36 T30 36 T42 36" stroke="#cfeaff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M10 42 Q16 38 22 42 T34 42" stroke="#8fd2ff" stroke-width="2" fill="none" opacity=".7"/>',
};
const SLOT_NAMES = {
  M_Q: 'Выпад', M_E: 'Отбив', M_R: 'Explosion', M_F: 'Алый пролом',
  R_Q: 'Хлыст', R_E: 'Встречный укол', R_R: 'Водяной залп', R_F: 'Приливный обвал',
};

/** Minimal DOM HUD. Only touches the DOM when a displayed value actually changes. */
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('hud'),
      hpFill: $('hp-fill'), hpTrail: $('hp-trail'), hpValue: $('hp-value'),
      stFill: $('st-fill'), stTrail: $('st-trail'), stValue: $('st-value'),
      stBar: document.querySelector('.bar.st'), hpBar: document.querySelector('.bar.hp'),
      slots: $('slots'), aimHint: $('aim-hint'), mpReserve: $('mp-reserve'),
      ally: $('ally'), allyName: $('ally-name'), allyHp: $('ally-hp'), allyMp: $('ally-mp'), allyState: $('ally-state'),
      revive: $('revive'), reviveFill: $('revive-fill'), switchWait: $('switch-wait'),
      hint: $('interact-hint'), hintName: $('interact-name'), hintText: document.querySelector('#interact-hint span'),
      toast: $('toast'), flash: $('flash'), vignette: $('vignette'),
      state: $('char-state'), stateWrap: document.querySelector('.char-state'),
      help: $('help'), crosshair: document.querySelector('.crosshair'),
    };
    this.hpTrail = 1;
    this.stTrail = 1;
    this.flashV = 0;
    this.flashDecay = 2;
    this.toastTimer = 0;
    this._cache = {};
    this._banner = { el: document.getElementById('banner'), name: document.getElementById('banner-name'), sub: document.getElementById('banner-sub'), t: 0 };
    this.killsEl = document.getElementById('kills');
    this.compassStrip = document.getElementById('compass-strip');
    this.compassItems = [];
  }

  /** Character card + ability slot for the active character. */
  setCharacter(id) {
    const C = {
      megumin: {
        name: 'Мегумин', sub: 'Архимаг · Клан Алых Демонов', ability: 'Explosion<span>Взрыв</span>',
        portrait: '<svg viewBox="0 0 40 40"><path d="M6 30 L20 3 L24 14 L34 30 Z" fill="#2a1c22" stroke="#e8a33a" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 30 Q20 36 37 30" fill="none" stroke="#e8a33a" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="22" r="2.6" fill="#ff3b3b"/></svg>',
        icon: null,
      },
      roxy: {
        name: 'Рокси Мигурдия', sub: 'Маг воды · Святой ранг', ability: 'Водяной залп<span>Water Volley</span>',
        portrait: '<svg viewBox="0 0 40 40"><path d="M5 31 L20 4 L35 31 Z" fill="#1d2a4a" stroke="#7fb6ff" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 31 Q20 37 37 31" fill="none" stroke="#7fb6ff" stroke-width="2.2" stroke-linecap="round"/><path d="M20 16 C16 22 16 26 20 27 C24 26 24 22 20 16 Z" fill="#6fd0ff"/></svg>',
        icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="#5ab8ff" stroke-width="1.2" stroke-dasharray="3 2.4" opacity="0.8"/><path d="M24 9 C15 22 14 30 24 36 C34 30 33 22 24 9 Z" fill="#3aa8ff" opacity="0.9"/><path d="M12 30 C18 27 30 27 36 30" stroke="#bfe8ff" stroke-width="2" fill="none"/><circle cx="21" cy="24" r="2.5" fill="#e8f7ff"/></svg>',
      },
    }[id];
    document.querySelector('.char-name').textContent = C.name;
    document.querySelector('.char-sub').textContent = C.sub;
    document.querySelector('.char-portrait').innerHTML = C.portrait;
    this._buildSlots(id);
  }

  /** Four skill slots (Q E R F) of the controlled heroine: cost, cooldown and the reason it cannot be used now. */
  _buildSlots(id) {
    this.slotHero = id;
    const host = this.el.slots;
    host.innerHTML = '';
    host.classList.toggle('water', id === 'roxy');
    this.slotEls = {};
    for (const k of SLOT_KEYS) {
      const sid = SLOTS[id][k];
      const el = document.createElement('div');
      el.className = 'slot ' + (k === 'R' || k === 'F' ? 'strong' : 'medium');
      el.innerHTML = `<div class="slot-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[sid]}</svg><div class="slot-cd"></div><div class="slot-cdt"></div><kbd class="slot-key">${k}</kbd></div>`
        + `<div class="slot-name">${SLOT_NAMES[sid]}</div><div class="slot-cost"></div><div class="slot-why"></div>`;
      host.appendChild(el);
      this.slotEls[k] = { el, cd: el.querySelector('.slot-cd'), cdt: el.querySelector('.slot-cdt'), cost: el.querySelector('.slot-cost'), why: el.querySelector('.slot-why'), key: k, sid };
    }
    this._cache = {};
  }

  /** Build compass markers: cardinal directions + icons of discovered regions. */
  setupCompass(regions, discovered) {
    this.discovered = discovered;
    const add = (label, kind, data) => {
      const el = document.createElement('span');
      el.className = kind;
      el.innerHTML = label;
      this.compassStrip.appendChild(el);
      this.compassItems.push({ el, ...data });
    };
    const cards = [['С', 0], ['В', Math.PI / 2], ['Ю', Math.PI], ['З', -Math.PI / 2], ['СВ', Math.PI / 4], ['ЮВ', (3 * Math.PI) / 4], ['ЮЗ', (-3 * Math.PI) / 4], ['СЗ', -Math.PI / 4]];
    // World: north = -Z, east = +X.
    for (const [l, a] of cards) add(l, l.length === 1 ? 'cardinal' : '', { bearing: a });
    for (const L of regions) {
      if (L.interior || L.r < 17) continue;
      add(`${L.icon}<small></small>`, 'loc', { loc: L });
    }
  }

  /** Show / hide the companion hint on the character card. */
  setCompanion(on) {
    this.companion = on;
  }

  /** Brief black fade (travel, sleep). */
  fade(seconds = 0.8) {
    const f = document.getElementById('fade');
    f.classList.add('on');
    clearTimeout(this._fadeT);
    this._fadeT = setTimeout(() => f.classList.remove('on'), seconds * 1000);
  }

  banner(name, sub) {
    const b = this._banner;
    b.name.textContent = name;
    b.sub.textContent = sub;
    b.el.classList.remove('show');
    void b.el.offsetWidth;
    b.el.classList.add('show');
    b.t = 3.2;
  }

  denyStamina() {
    const bar = this.el.stBar;
    bar.classList.remove('blink');
    void bar.offsetWidth;
    bar.classList.add('blink');
  }

  show() { this.el.root.classList.remove('hidden'); }

  lootPopup(item, n) { this.invUI?.lootPopup(item, n); }
  readBook(item) { this.invUI?.readBook(item); }

  toggleHelp() { this.el.help.classList.toggle('hidden'); }

  _set(key, el, prop, value) {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else el.style[prop] = value;
  }

  toast(text, seconds = 3.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  /** Full-screen flash; `amount` 0..1, `decay` per second. */
  flash(amount, decay = 1.5) {
    this.flashV = Math.max(this.flashV, amount);
    this.flashDecay = 1 / Math.max(decay, 0.05);
  }

  damageFlash() {
    this.el.hpBar.classList.remove('blink');
    void this.el.hpBar.offsetWidth;
    this.el.hpBar.classList.add('blink');
    this.el.vignette.style.opacity = '1';
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => (this.el.vignette.style.opacity = '0'), 350);
  }

  setInteract(prompt, name, available) {
    const show = !!prompt;
    this.el.hint.classList.toggle('show', show);
    this.el.hint.classList.toggle('unavailable', show && !available);
    this.el.crosshair.classList.toggle('active', show && available);
    if (show) {
      this._set('hintName', this.el.hintName, 'text', available ? `${name}: ${prompt.toLowerCase()}` : `${name}: ${prompt}`);
    }
  }

  pulseInteract() {
    const k = this.el.hint.querySelector('kbd');
    k.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 180 });
  }

  denyAbility(key) {
    const e = key && this.slotEls?.[key];
    if (!e) return;
    e.el.classList.remove('denied');
    void e.el.offsetWidth;
    e.el.classList.add('denied');
  }

  /** The switch to the other heroine waits for a free moment: a short clock sign. */
  switchWait() {
    const el = this.el.switchWait;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  update(dt, game) {
    const p = game.player;
    const combat = game.combat;
    const hp = p.hp / p.maxHp;
    const st = p.stamina / p.f.maxStamina;
    // Trailing "damage" bars catch up after a short delay.
    this.hpTrail = hp > this.hpTrail ? hp : damp(this.hpTrail, hp, 2.5, dt);
    this.stTrail = st > this.stTrail ? st : damp(this.stTrail, st, 3.5, dt);
    this._set('hp', this.el.hpFill, 'transform', `scaleX(${hp.toFixed(3)})`);
    this._set('hpT', this.el.hpTrail, 'transform', `scaleX(${this.hpTrail.toFixed(3)})`);
    this._set('hpV', this.el.hpValue, 'text', String(Math.ceil(p.hp)));
    this._set('st', this.el.stFill, 'transform', `scaleX(${st.toFixed(3)})`);
    this._set('stT', this.el.stTrail, 'transform', `scaleX(${this.stTrail.toFixed(3)})`);
    this._set('stV', this.el.stValue, 'text', String(Math.ceil(p.stamina)));
    this.el.stBar.classList.toggle('depleted', p.staminaDepleted);

    // Skill slots.
    if (combat && this.slotEls) {
      if (combat.fx && !combat.fx.hud) combat.fx.hud = this;
      if (this.slotHero !== p.character) this._buildSlots(p.character);
      for (const k of SLOT_KEYS) {
        const e = this.slotEls[k];
        const info = combat.slotInfo(p.character, k);
        const cdOn = info.cd > 0 || info.frac > 0;
        const cls = `${info.ready ? 'ready' : ''} ${info.running ? 'casting' : ''} ${info.aiming ? 'aiming' : ''} ${!info.ready && !cdOn ? 'blocked' : ''}`;
        if (this._cache['cls' + k] !== cls) {
          this._cache['cls' + k] = cls;
          e.el.classList.toggle('ready', info.ready);
          e.el.classList.toggle('casting', info.running);
          e.el.classList.toggle('aiming', info.aiming);
          e.el.classList.toggle('blocked', !info.ready && !cdOn);
        }
        const cdStr = info.frac.toFixed(3);
        if (this._cache['cd' + k] !== cdStr) {
          this._cache['cd' + k] = cdStr;
          e.cd.style.setProperty('--cd', cdStr);
        }
        this._set('cdt' + k, e.cdt, 'text', info.cd > 0.05 && !info.running ? Math.ceil(info.cd).toString() : '');
        const sp = info.spec;
        const cost = [sp.cost.stamina ? `<i class="st">${sp.cost.stamina}</i>` : '', sp.cost.mana ? `<i class="mp">${sp.cost.mana}</i>` : ''].join('');
        if (this._cache['cost' + k] !== cost) {
          this._cache['cost' + k] = cost;
          e.cost.innerHTML = cost;
        }
        const why = info.reason && !info.reason.startsWith('Перезарядка') ? info.reason : info.note || '';
        this._set('why' + k, e.why, 'text', why);
      }
      this._set('aimHint', this.el.aimHint, 'text', combat.fx.hudHint?.() || '');
    }
    // Mana held by a confirmed strong spell (not spent yet).
    {
      const f = p.f;
      const left = ((f.mana - f.reserved) / f.maxMana) * 100;
      const w = (f.reserved / f.maxMana) * 100;
      this._set('mpResL', this.el.mpReserve, 'left', left.toFixed(1) + '%');
      this._set('mpResW', this.el.mpReserve, 'width', w.toFixed(1) + '%');
    }

    // The other heroine.
    if (combat) {
      const cs = p.companionSlot;
      this.el.ally.classList.toggle('show', !!cs);
      if (cs) {
        const f = p.fighters[p.companionId];
        this._set('allyN', this.el.allyName, 'text', p.companionId === 'roxy' ? 'Рокси' : 'Мегумин');
        this._set('allyHp', this.el.allyHp, 'transform', `scaleX(${(f.hp / f.maxHp).toFixed(3)})`);
        this._set('allyMp', this.el.allyMp, 'transform', `scaleX(${(f.mana / f.maxMana).toFixed(3)})`);
        const ord = { near: 'рядом', hold: 'держит точку', retreat: 'отступает' }[combat.order];
        const state = f.downed ? (f.revives >= 1 ? 'Без сил до конца боя' : 'Без сил — E (зажать), подними') : f.exhaust > 0 ? `Истощена ${Math.ceil(f.exhaust)} с` : ord;
        this._set('allyS', this.el.allyState, 'text', state);
        this.el.ally.classList.toggle('down', f.downed);
      }
      const rp = combat.reviveProgress || 0;
      this.el.revive.classList.toggle('show', rp > 0);
      if (rp > 0) this.el.reviveFill.style.transform = `scaleX(${Math.min(1, rp).toFixed(3)})`;
    }

    // Character state.
    this._set('state', this.el.state, 'text', p.stateLabel + (!this.companion ? '' : p.character === 'roxy' ? ' · Tab — Мегумин' : ' · Tab — Рокси'));
    this.el.stateWrap.classList.toggle('warn', p.action !== 'none' || p.hp / p.maxHp < 0.3);

    // Flash & toast.
    if (this.flashV > 0.001) {
      this.flashV = Math.max(0, this.flashV - dt * this.flashDecay);
      this.el.flash.style.opacity = (this.flashV * this.flashV).toFixed(3);
    } else if (this._cache.flashZero !== true) {
      this.el.flash.style.opacity = '0';
    }
    this._cache.flashZero = this.flashV <= 0.001;
    // Banner fade-out.
    if (this._banner.t > 0) {
      this._banner.t -= dt;
      if (this._banner.t <= 0) this._banner.el.classList.remove('show');
    }
    // Compass: bearing of the camera (north = -Z).
    const cam = game.cameraRig;
    if (this.compassItems.length) {
      const heading = Math.atan2(-Math.sin(cam.yawS), Math.cos(cam.yawS)) ; // 0 = north, +east
      const width = this.compassStrip.clientWidth || 400;
      const fov = Math.PI * 0.75;
      const pp = game.player.position;
      for (const it of this.compassItems) {
        let b = it.bearing;
        if (it.loc) {
          if (!this.discovered?.has(it.loc.id) || game.inDungeon) {
            if (it.el.style.display !== 'none') it.el.style.display = 'none';
            continue;
          }
          const dx = it.loc.center.x - pp.x, dz = it.loc.center.z - pp.z;
          b = Math.atan2(dx, -dz);
          const d = Math.round(Math.hypot(dx, dz));
          const sm = it.el.firstElementChild;
          const txt = d < it.loc.r ? 'здесь' : d + ' м';
          if (sm.textContent !== txt) sm.textContent = txt;
        }
        let rel = b - heading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        const vis = Math.abs(rel) < fov / 2;
        it.el.style.display = vis ? 'block' : 'none';
        if (vis) it.el.style.left = ((rel / fov + 0.5) * width).toFixed(1) + 'px';
      }
    }
    const k = game.enemies ? game.enemies.kills : 0;
    this._set('kills', this.killsEl, 'text', k ? `Повержено врагов: ${k}` : '');
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }
}
