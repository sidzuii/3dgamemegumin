import { damp } from '../core/math.js';

/** Minimal DOM HUD. Only touches the DOM when a displayed value actually changes. */
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('hud'),
      hpFill: $('hp-fill'), hpTrail: $('hp-trail'), hpValue: $('hp-value'),
      stFill: $('st-fill'), stTrail: $('st-trail'), stValue: $('st-value'),
      stBar: document.querySelector('.bar.st'), hpBar: document.querySelector('.bar.hp'),
      ability: $('ability'), cd: $('ability-cd'), cdText: $('ability-cd-text'),
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
    document.querySelector('.ability-name').innerHTML = C.ability;
    const iconHost = document.querySelector('.ability-icon svg');
    if (!this._explosionIcon) this._explosionIcon = iconHost.outerHTML;
    iconHost.outerHTML = C.icon || this._explosionIcon;
    this.el.ability.classList.toggle('water', id === 'roxy');
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

  denyAbility() {
    const a = this.el.ability;
    a.classList.remove('denied');
    void a.offsetWidth;
    a.classList.add('denied');
  }

  update(dt, game) {
    const p = game.player;
    const ab = game.ability;
    const hp = p.hp / p.maxHp;
    const st = p.stamina / 100;
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

    // Ability slot.
    const cd = ab.cooldownFraction;
    const cdStr = cd.toFixed(3);
    if (this._cache.cd !== cdStr) {
      this._cache.cd = cdStr;
      this.el.cd.style.setProperty('--cd', cdStr);
    }
    this._set('cdT', this.el.cdText, 'text', ab.cooldownLeft > 0 && !ab.casting ? Math.ceil(ab.cooldownLeft).toString() : '');
    this.el.ability.classList.toggle('ready', ab.ready);
    this.el.ability.classList.toggle('casting', ab.casting);

    // Character state.
    this._set('state', this.el.state, 'text', p.stateLabel + (!this.companion ? '' : p.character === 'roxy' ? ' · Tab — Мегумин' : ' · Tab — Рокси'));
    this.el.stateWrap.classList.toggle('warn', p.action !== 'none' || p.hp < 30);

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
