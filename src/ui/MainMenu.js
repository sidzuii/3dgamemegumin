import { hasSave, deleteSave, loadSave } from '../rpg/State.js';
import { QUESTS } from '../data/quests.js';
import { PRESETS } from '../core/Quality.js';

/**
 * The main menu of the game: the loading screen, the title screen (a live flight over Axel behind it: Game.attract), the pause
 * menu (Esc while playing: the game stops), settings (graphics, mouse, sound, combat), the controls and the credits.
 * Settings of its own are kept in localStorage `megumin-settings`; quality, sound and combat keep their own keys.
 */
const KEY = 'megumin-settings';
const DEFAULTS = { fov: 60, sens: 1, invertY: false, dynamicRes: true, fps: false, voice: 1, fullscreen: false };
const TIPS = [
  'Explosion забирает всю ману: после него Мегумин нужна передышка — или помощь Рокси.',
  'E — поговорить, открыть, взять. Компас вверху показывает направление к цели задания.',
  'Shift — бег, CapsLock — шаг. Space в бою — уклонение, вне боя — прыжок.',
  'Серия ударов посохом: нажимай ЛКМ в конце удара — следующий выйдет сразу.',
  'Зелья: 3 — исцеление, 4 — бодрость, 5 — мана.',
  'Заказы гильдии висят на доске у Луны. Чем выше ранг — тем интереснее работа.',
  'F9 — качество графики, F8 — счётчик кадров. Всё это есть и в настройках (Esc).',
  'Ночью город живёт иначе: лавки закрываются, а у таверны собираются люди.',
];
const CONTROLS = [
  ['Движение', 'WASD / стрелки'], ['Бег · шаг', 'Shift · CapsLock'], ['Прыжок / уклонение в бою', 'Space · V'],
  ['Камера · приближение', 'мышь · колесо'], ['Удар посохом (серия из 3)', 'ЛКМ'], ['Защита посохом', 'ПКМ'],
  ['Средние навыки', 'Q · R'], ['Сильные заклинания (выбор → ЛКМ)', 'X · F'], ['Захват цели', 'СКМ'],
  ['Приказ спутнице', 'T'], ['Сменить героиню', 'Tab · 1 · 2'], ['Взаимодействие', 'E'], ['Поднять героиню', 'E (зажать)'],
  ['Зелья', '3 · 4 · 5'], ['Инвентарь · журнал · карта', 'I · J · M'], ['Персонаж · гильдия · бой · звук', 'C · G · K · O'],
  ['Пауза и меню', 'Esc'], ['Показать курсор (пока зажат)', 'Alt'], ['Подсказки', 'H'], ['Звук вкл./выкл.', 'N'], ['Качество графики · счётчик кадров', 'F9 · F8'],
  ['Диалог: ответ · дальше · уйти', '1–6 · E/Space · Esc'],
];

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class MainMenu {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.view = 'loading';
    this.started = false;
    this.pauseOpen = false;
    this.back = null; // the view a sub-page returns to
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }
    root.innerHTML = '';
    root.className = 'mm';
    this.bg = el('div', 'mm-bg');
    this.panel = el('div', 'mm-panel');
    this.modal = el('div', 'mm-modal');
    root.append(this.bg, this.panel, this.modal);
    this._loading();
    window.addEventListener('keydown', (e) => this._key(e));
    document.addEventListener('pointerlockchange', () => this._lockChange());
    // left the full screen (Esc held, F11): the setting follows, the Esc lock goes
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) return;
      navigator.keyboard?.unlock?.();
      if (this.settings.fullscreen) this._set('fullscreen', false);
    });
  }

  // ------------------------------------------------------------------------------------------------ loading
  _loading() {
    this.view = 'loading';
    this.root.dataset.view = 'loading';
    this.panel.innerHTML = '';
    const box = el('div', 'mm-load');
    box.append(this._logo());
    this.loadMsg = el('div', 'mm-load-msg', 'Загрузка мира…');
    const bar = el('div', 'mm-bar');
    this.loadBar = el('div');
    bar.appendChild(this.loadBar);
    this.tip = el('div', 'mm-tip', '');
    box.append(this.loadMsg, bar, this.tip);
    this.panel.appendChild(box);
    let i = Math.floor(Math.random() * TIPS.length);
    const next = () => { this.tip.textContent = 'Совет: ' + TIPS[i++ % TIPS.length]; };
    next();
    this._tipTimer = setInterval(next, 6000);
  }

  progress(p, msg) {
    if (this.view !== 'loading') return;
    if (msg) this.loadMsg.textContent = msg;
    this.loadBar.style.width = Math.round(p * 100) + '%';
  }

  error(msg) {
    if (this.loadMsg) this.loadMsg.textContent = 'Ошибка загрузки: ' + msg;
  }

  /** The world is built: apply the saved settings and show the title screen over the live view. */
  async ready() {
    this.progress(0.97, 'Готовим шейдеры…');
    await this.game.compileScene(); // before the first frame of the title (else that frame compiles them all, the page stalls)
    clearInterval(this._tipTimer);
    this.applySettings();
    this.game.attract();
    this.title();
    setTimeout(() => this.game.prewarmAsync(), 200); // shaders and NPC grids while the menu is up
  }

  _logo() {
    const l = el('div', 'mm-logo');
    l.innerHTML = '<div class="mm-logo-title">Мегумин</div><div class="mm-logo-tag">Дорога приключений</div>';
    return l;
  }

  // ------------------------------------------------------------------------------------------------ title
  title() {
    this.view = 'title';
    this.back = null;
    this.root.dataset.view = 'title';
    this._show();
    this.panel.innerHTML = '';
    const col = el('div', 'mm-col');
    col.appendChild(this._logo());
    const list = el('div', 'mm-list');
    const saved = hasSave();
    if (saved) {
      const b = this._btn('Продолжить', () => this._play(false), 'primary');
      list.appendChild(b);
      const card = this._saveCard();
      if (card) list.appendChild(card);
      list.appendChild(this._btn('Новая игра', () => this._newGame()));
    } else list.appendChild(this._btn('Начать путь', () => this._play(true), 'primary'));
    list.append(
      this._btn('Настройки', () => this.settingsView('title')),
      this._btn('Управление', () => this.controls('title')),
      this._btn('Об игре', () => this.credits('title')),
    );
    if (import.meta.env.DEV) list.appendChild(this._btn('Редактор карты', () => { location.search = '?editor'; }, 'ghost'));
    list.appendChild(this._btn('Выйти', () => this._quit(), 'ghost'));
    col.appendChild(list);
    col.appendChild(el('div', 'mm-foot', 'v2.0 · Esc — пауза и настройки · F9 — качество графики'));
    this.panel.appendChild(col);
    this._focusFirst();
  }

  /** What the save holds: chapter and story quest, level, place, day and the date it was written. */
  _saveCard() {
    const S = loadSave().data;
    if (!S || !S.player) return null;
    const story = Object.entries(S.quests || {}).filter(([id, q]) => q.status === 'active' && QUESTS[id]?.category === 'story').map(([id]) => QUESTS[id]);
    const q = story.sort((a, b) => (b.chapter ?? 0) - (a.chapter ?? 0))[0];
    const place = this.game.world?.locationAt?.({ x: S.player.x, z: S.player.z })?.name || '';
    const m = S.time?.minutes ?? 0;
    const time = `день ${S.time?.day ?? 1}, ${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    const when = S.savedAt ? new Date(S.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    const c = el('div', 'mm-save');
    const ch = q ? (q.chapter ? `Глава ${q.chapter}` : 'Пролог') : 'Свободная игра';
    c.innerHTML = `<div class="mm-save-ch">${ch}${q ? ' · ' + q.title : ''}</div>`
      + `<div class="mm-save-row">Уровень ${S.player.level || 1}${place ? ' · ' + place : ''} · ${time}</div>`
      + (when ? `<div class="mm-save-row dim">Сохранено ${when}</div>` : '');
    return c;
  }

  async _newGame() {
    if (hasSave() && !(await this.ask('Начать новую игру?', 'Текущее сохранение будет удалено: уровень, вещи и задания пропадут.', 'Начать заново'))) return;
    deleteSave();
    this._play(true);
  }

  /**
   * The game's own full screen + the keyboard lock of Esc (Keyboard Lock API, Chromium: Chrome, Edge): Esc then reaches the game
   * (the pause) instead of the browser taking the cursor; holding Esc leaves the full screen. In a window the browser always
   * releases the cursor on Esc — a page cannot forbid it. Needs a click (the settings toggle, «Играть»).
   */
  fullscreen(on) {
    const d = document;
    if (on && !d.fullscreenElement) {
      d.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => navigator.keyboard?.lock?.(['Escape'])).catch(() => {});
    } else if (!on && d.fullscreenElement) {
      navigator.keyboard?.unlock?.();
      d.exitFullscreen?.().catch(() => {});
    }
  }

  _play(newGame) {
    if (this.settings.fullscreen) this.fullscreen(true);
    this._hide();
    this.started = true;
    this.view = 'game';
    this.game.input.requestLock();
    this.game.start(newGame);
    this.applySettings();
  }

  async _quit() {
    if (this.started) this.game.rpg.save();
    window.close();
    // A tab the player opened can't be closed by the page: say so (the progress is saved either way)
    setTimeout(() => this.ask('Выйти из игры', 'Прогресс сохранён. Просто закрой окно или вкладку браузера.', 'Понятно', true), 300);
  }

  // ------------------------------------------------------------------------------------------------ pause
  openPause() {
    if (!this.started || this.pauseOpen || this.game.uiBlocking) return;
    this.pauseOpen = true;
    this._pausedAt = performance.now();
    document.exitPointerLock?.();
    this.pause();
  }

  pause() {
    this.view = 'pause';
    this.back = null;
    this.root.dataset.view = 'pause';
    this._show();
    this.panel.innerHTML = '';
    const col = el('div', 'mm-col mm-center');
    col.appendChild(el('div', 'mm-h', 'Пауза'));
    const where = this.game.world.locationAt?.(this.game.player.position)?.name;
    if (where) col.appendChild(el('div', 'mm-sub', where));
    const list = el('div', 'mm-list');
    list.append(
      this._btn('Продолжить', () => this.resume(), 'primary'),
      this._btn('Сохранить игру', () => this._save()),
      this._btn('Журнал заданий', () => this._gameMenu('journal')),
      this._btn('Карта', () => this._gameMenu('map')),
      this._btn('Настройки', () => this.settingsView('pause')),
      ...(this.game.admin?.enabled ? [this._btn('Админ-меню (F10)', () => this.game.admin.show())] : []),
      this._btn('Управление', () => this.controls('pause')),
      this._btn('Главное меню', () => this._toTitle(), 'ghost'),
      this._btn('Выйти из игры', () => this._quit(), 'ghost'),
    );
    col.appendChild(list);
    this.saveNote = el('div', 'mm-note', '');
    col.appendChild(this.saveNote);
    this.panel.appendChild(col);
    this._focusFirst();
  }

  resume() {
    if (!this.pauseOpen) return;
    this.pauseOpen = false;
    this.view = 'game';
    this._hide();
    this.game.input.requestLock();
  }

  _save() {
    const g = this.game;
    if (g.player.inCombat) { this.saveNote.textContent = 'Во время боя сохранить нельзя.'; return; }
    g.rpg.save();
    this.saveNote.textContent = 'Игра сохранена · ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  _gameMenu(tab) {
    this.pauseOpen = false;
    this.view = 'game';
    this._hide();
    this.game.menu.show(tab);
  }

  async _toTitle() {
    if (!(await this.ask('Выйти в главное меню?', 'Игра будет сохранена. Мир загрузится заново.', 'Выйти в меню'))) return;
    this.game.rpg.save();
    location.reload();
  }

  // ------------------------------------------------------------------------------------------------ settings
  settingsView(from, tab = 'gfx') {
    this.back = from;
    this.view = 'settings';
    this.root.dataset.view = from === 'title' ? 'title-sub' : 'pause';
    this.panel.innerHTML = '';
    const box = el('div', 'mm-box');
    box.appendChild(el('div', 'mm-h', 'Настройки'));
    const tabs = el('div', 'mm-tabs');
    const TABS = [['gfx', 'Графика'], ['mouse', 'Мышь и камера'], ['sound', 'Звук'], ['combat', 'Бой'], ['admin', 'Админ']];
    for (const [id, label] of TABS) {
      const b = el('button', 'mm-tab' + (id === tab ? ' active' : ''), label);
      b.addEventListener('click', () => this.settingsView(from, id));
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    const body = el('div', 'mm-body');
    const g = this.game, S = this.settings;
    if (tab === 'gfx') {
      body.append(
        this._choice('Качество', Object.entries(PRESETS).map(([k, p]) => [k, p.label]), g.quality.name, (v) => g.quality.set(v),
          'Низкое — для встроенной графики, высокое — для отдельной видеокарты'),
        this._check('Динамическое разрешение', S.dynamicRes, (v) => this._set('dynamicRes', v), 'чёткость падает, когда кадры тяжёлые — игра остаётся плавной'),
        this._range('Поле зрения', 50, 80, 1, S.fov, (v) => this._set('fov', v), (v) => v + '°'),
        this._check('Счётчик кадров', S.fps, (v) => this._set('fps', v), 'F8'),
        this._check('Полный экран', S.fullscreen, (v) => { this._set('fullscreen', v); this.fullscreen(v); },
          'Esc в нём открывает только паузу и не отпускает курсор; выйти из полного экрана — зажать Esc'),
      );
    } else if (tab === 'mouse') {
      body.append(
        this._range('Чувствительность мыши', 30, 250, 5, Math.round(S.sens * 100), (v) => this._set('sens', v / 100), (v) => v + '%'),
        this._check('Инвертировать по вертикали', S.invertY, (v) => this._set('invertY', v)),
      );
    } else if (tab === 'sound') {
      const A = g.audio, AS = A.settings;
      body.append(
        this._range('Общая громкость', 0, 100, 1, Math.round(AS.master * 100), (v) => A.set('master', v / 100), (v) => v + '%'),
        this._range('Эффекты', 0, 100, 1, Math.round(AS.sfx * 100), (v) => A.set('sfx', v / 100), (v) => v + '%'),
        this._range('Музыка', 0, 100, 1, Math.round(AS.music * 100), (v) => A.set('music', v / 100), (v) => v + '%'),
        this._range('Голоса', 0, 100, 1, Math.round((S.voice ?? 1) * 100), (v) => this._set('voice', v / 100), (v) => v + '%'),
        this._check('Выключить звук', AS.muted, (v) => A.set('muted', v), 'N'),
        this._check('Подписи звуков', AS.captions, (v) => A.set('captions', v), 'важные сигналы показываются текстом'),
      );
    } else if (tab === 'combat') {
      const C = g.combat, CS = C.settings;
      const set = (k, v) => { CS[k] = v; C.saveSettings(); };
      body.append(
        this._range('Тряска камеры', 0, 100, 1, Math.round(CS.shake * 100), (v) => set('shake', v / 100), (v) => v + '%'),
        this._range('Яркие вспышки', 0, 100, 1, Math.round(CS.flash * 100), (v) => set('flash', v / 100), (v) => (v ? v + '%' : 'нет')),
        this._check('Переключаться на напарницу после Explosion', CS.autoSwitch, (v) => set('autoSwitch', v), 'Мегумин обессилена на 12 с'),
        this._check('Напарница сама применяет средние навыки', CS.skillsInTactics, (v) => set('skillsInTactics', v)),
      );
    } else if (tab === 'admin') {
      body.append(
        this._check('Админский режим', !!S.admin, (v) => this._set('admin', v), 'F10 — админ-меню: главы сюжета, столица, телепорт, скорость, бессмертие'),
      );
      body.appendChild(el('p', '', 'Для себя: быстро пройти сюжет, открыть столицу, проверить места. Прыжок к главе отмечает всё до неё пройденным — лучше делать это на отдельном сохранении.'));
    }
    box.appendChild(body);
    const foot = el('div', 'mm-row-end');
    foot.appendChild(this._btn('Назад', () => this._back(), 'small'));
    box.appendChild(foot);
    this.panel.appendChild(box);
    this._focusFirst();
  }

  _set(key, value) {
    this.settings[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* storage blocked */ }
    this.applySettings();
  }

  applySettings() {
    const g = this.game, S = this.settings;
    if (g.cameraRig) {
      g.cameraRig.sensitivity = 0.0024 * S.sens;
      g.cameraRig.invertY = !!S.invertY;
      g.cameraRig.baseFov = S.fov;
    }
    g.quality?.setDynamic(S.dynamicRes);
    if (g.voice) g.voice.volume = S.voice ?? 1;
    if (this.started) g._toggleFps(!!S.fps);
  }

  // ------------------------------------------------------------------------------------------------ controls, credits
  controls(from) {
    this.back = from;
    this.view = 'controls';
    this.root.dataset.view = from === 'title' ? 'title-sub' : 'pause';
    this.panel.innerHTML = '';
    const box = el('div', 'mm-box');
    box.appendChild(el('div', 'mm-h', 'Управление'));
    const t = el('div', 'mm-body mm-keys');
    for (const [what, keys] of CONTROLS) t.appendChild(el('div', 'mm-key', `<span>${what}</span><kbd>${keys}</kbd>`));
    box.appendChild(t);
    const foot = el('div', 'mm-row-end');
    foot.appendChild(this._btn('Назад', () => this._back(), 'small'));
    box.appendChild(foot);
    this.panel.appendChild(box);
    this._focusFirst();
  }

  credits(from) {
    this.back = from;
    this.view = 'credits';
    this.root.dataset.view = 'title-sub';
    this.panel.innerHTML = '';
    const box = el('div', 'mm-box mm-credits');
    box.appendChild(el('div', 'mm-h', 'Об игре'));
    box.appendChild(el('div', 'mm-body', `
      <p><b>Мегумин: Дорога приключений</b> — фанатская некоммерческая RPG. Персонажи и мир принадлежат их правообладателям.</p>
      <p>Аксель, Ольховка, Айнстрей и дороги между ними; десять глав основной истории, побочные истории и заказы гильдии.</p>
      <h4>Ассеты</h4>
      <p>Quaternius — анимации Universal Animation Library, Medieval Village, люди, Fantasy Props MegaKit (CC0)<br>
      Kenney — наборы города, кладбища, замка (CC0)<br>
      KayKit (Kay Lousberg) — Skeletons, Resource Bits (CC0)<br>
      Mixamo — анимации стойки, разговора и сидения<br>
      Модели героинь, врагов и объектов Айнстрея предоставлены автором игры.</p>
      <h4>Технологии</h4>
      <p>three.js, three-mesh-bvh, Vite, glTF-Transform, FBX2glTF.</p>`));
    const foot = el('div', 'mm-row-end');
    foot.appendChild(this._btn('Назад', () => this._back(), 'small'));
    box.appendChild(foot);
    this.panel.appendChild(box);
    this._focusFirst();
  }

  _back() {
    if (this.back === 'pause') this.pause();
    else this.title();
  }

  // ------------------------------------------------------------------------------------------------ input
  _key(e) {
    if (this.game.editorMode) return;
    const open = this.view !== 'game' && this.view !== 'loading';
    if (e.code === 'Escape') {
      if (this.modal.classList.contains('show')) { this._answer(false); return; }
      // in game: the pause (with the keyboard lock of the full screen the browser does not take the cursor: the game does it)
      if (this.view === 'game') { this.openPause(); return; }
      if (this.back) { this._back(); return; }
      if (this.view === 'pause' && performance.now() - this._pausedAt > 250) this.resume();
      return;
    }
    if (!open || !['ArrowUp', 'ArrowDown'].includes(e.code)) return;
    const scope = this.modal.classList.contains('show') ? this.modal : this.panel;
    const items = [...scope.querySelectorAll('button:not([disabled])')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const n = e.code === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[n].focus();
  }

  /** Esc while playing releases the mouse (the browser does it): that opens the pause menu, unless a game window just took it. */
  _lockChange() {
    if (!this.started || this.view !== 'game' || this.game.editorMode) return;
    if (document.pointerLockElement === this.game.renderer.domElement) return;
    if (this.game.input.freeCursor) return; // Alt: the game let the cursor out itself
    setTimeout(() => {
      const g = this.game;
      if (document.pointerLockElement || g.uiBlocking || performance.now() - (g._blockedAt || 0) < 400) return;
      this.openPause();
    }, 60);
  }

  /** Fade out, then take the menu out of the page (its blurred backdrop costs the GPU even when transparent). */
  _hide() {
    this.root.classList.add('hidden');
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => { if (this.root.classList.contains('hidden')) this.root.style.display = 'none'; }, 400);
  }

  _show() {
    clearTimeout(this._hideT);
    this.root.style.display = '';
    this.root.classList.remove('hidden');
  }

  // ------------------------------------------------------------------------------------------------ widgets
  _btn(label, fn, kind = '') {
    const b = el('button', 'mm-btn ' + kind, label);
    b.addEventListener('click', fn);
    b.addEventListener('mouseenter', () => b.focus({ preventScroll: true }));
    return b;
  }

  _focusFirst() {
    setTimeout(() => this.panel.querySelector('.mm-btn.primary, .mm-btn, .mm-tab.active')?.focus({ preventScroll: true }), 30);
  }

  _row(label, hint) {
    const r = el('div', 'mm-set');
    const l = el('div', 'mm-set-label', label + (hint ? `<small>${hint}</small>` : ''));
    r.appendChild(l);
    return r;
  }

  _range(label, min, max, step, value, onInput, fmt) {
    const r = this._row(label);
    const wrap = el('div', 'mm-set-ctl');
    const i = el('input');
    Object.assign(i, { type: 'range', min, max, step, value });
    const v = el('span', 'mm-val', fmt(+value));
    i.addEventListener('input', () => { v.textContent = fmt(+i.value); onInput(+i.value); });
    wrap.append(i, v);
    r.appendChild(wrap);
    return r;
  }

  _check(label, value, onChange, hint) {
    const r = this._row(label, hint);
    const wrap = el('div', 'mm-set-ctl');
    const b = el('button', 'mm-toggle' + (value ? ' on' : ''), value ? 'Вкл.' : 'Выкл.');
    b.addEventListener('click', () => {
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      b.textContent = on ? 'Вкл.' : 'Выкл.';
      onChange(on);
    });
    wrap.appendChild(b);
    r.appendChild(wrap);
    return r;
  }

  _choice(label, options, value, onPick, hint) {
    const r = this._row(label, hint);
    const wrap = el('div', 'mm-set-ctl mm-seg');
    for (const [k, text] of options) {
      const b = el('button', 'mm-seg-btn' + (k === value ? ' on' : ''), text);
      b.addEventListener('click', () => {
        for (const x of wrap.children) x.classList.toggle('on', x === b);
        onPick(k);
      });
      wrap.appendChild(b);
    }
    r.appendChild(wrap);
    return r;
  }

  /** A modal question; resolves true (ok) / false (cancel, Esc). `single`: only the ok button. */
  ask(title, text, ok = 'Да', single = false) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.modal.innerHTML = '';
      const card = el('div', 'mm-modal-card');
      card.append(el('div', 'mm-h small', title), el('p', 'mm-modal-text', text));
      const row = el('div', 'mm-row-end');
      if (!single) row.appendChild(this._btn('Отмена', () => this._answer(false), 'small ghost'));
      row.appendChild(this._btn(ok, () => this._answer(true), 'small primary'));
      card.appendChild(row);
      this.modal.appendChild(card);
      this.modal.classList.add('show');
      this._show();
      setTimeout(() => row.lastChild.focus(), 30);
    });
  }

  _answer(v) {
    this.modal.classList.remove('show');
    const r = this._resolve;
    this._resolve = null;
    if (this.view === 'game') this._hide();
    r?.(v);
  }
}
