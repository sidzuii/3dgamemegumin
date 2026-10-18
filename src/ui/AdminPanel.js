import * as THREE from 'three';
import { REGIONS } from '../world/MapData.js';
import { STOPS } from '../data/travel.js';
import { XP_TABLE } from '../rpg/RPG.js';

/**
 * The admin mode (for the author: a quick run through the story, the capital opened, cheats). Off by default: switched on in
 * Settings → «Админ» (megumin-settings.admin) or by `?admin` in the address; then F10 (or the pause menu) opens the panel.
 *
 *  Сюжет    — the tracked quest: next stage / finish it; jump to any chapter of the main chain (everything before it is marked done
 *             with its rewards and the flags the later chapters ask for, the chapter starts anew, the player stands at its first
 *             goal); «Открыть столицу».
 *  Телепорт — the regions of the map, the carriage stops of the capital, the goal of the tracked quest.
 *  Героини  — speed ×1…×5, immortality, endless stamina and mana, full health, levels, eris, skills, Roxy in the party.
 *  Мир      — time of day, enemies round about, all carriage stops, save.
 * The cheat switches are kept in localStorage `megumin-admin`; they act only while the admin mode is on.
 */
const KEY = 'megumin-admin';
const DEFAULTS = { speed: 1, god: false, stamina: false, mana: false };
/** The main chain in story order (first_delivery and ch2_bernard are steps of their chapters). */
const CHAIN = ['prologue_arrival', 'first_delivery', 'join_guild', 'guild_test', 'ch1_name', 'ch2_people', 'ch2_bernard', 'ch3_lights', 'ch4_astrarium', 'roxy_trust', 'ch4_return', 'ch5_crypt', 'ainstrey_road', 'ainstrey_city', 'ch6_relay', 'ch7_gorge', 'ch8_city'];
const JUMPS = [
  ['prologue_arrival', 'Пролог: прибытие в Аксель'],
  ['join_guild', 'Гл. 1 · Лицензия искателя'],
  ['guild_test', 'Гл. 1 · Испытание у Брана'],
  ['ch1_name', 'Гл. 1 · Имя в книге'],
  ['ch2_people', 'Гл. 2 · Люди Акселя'],
  ['ch3_lights', 'Гл. 3 · Два голоса под землёй'],
  ['ch4_astrarium', 'Гл. 4 · Чужой круг (встреча с Рокси)'],
  ['roxy_trust', 'Гл. 4 · Три кристалла'],
  ['ch4_return', 'Гл. 4 · Карта Эдмунда'],
  ['ch5_crypt', 'Гл. 5 · Под храмом'],
  ['ainstrey_road', 'Проход к Айнстрею (завал на уступе)'],
  ['ainstrey_city', 'Айнстрей: чужая накладная'],
  ['ch6_relay', 'Гл. 6 · По другую сторону хребта'],
  ['ch7_gorge', 'Гл. 7 · Договор в ущелье'],
  ['ch8_city', 'Гл. 8–10 · Город над машиной'],
];
/** What the scenes of a skipped quest would have done that later chapters rely on (flags in `requires` are added on their own). */
const AFTER = {
  join_guild: (R) => { R.state.guild.member = true; },
  ch1_name: (R) => { rankAtLeast(R, 'E'); R.setFlag('skill_M_Q'); R.setFlag('skill_M_E'); R.setFlag('skill_M_F'); },
  ch2_people: (R) => { R.setFlag('A12_DONE'); },
  roxy_trust: (R) => { R.apply([{ unlockRoxy: true }]); },
  ch4_return: (R) => { rankAtLeast(R, 'D'); },
  ainstrey_road: (R) => { R.setVar('AINSTRAY_ROAD_OPEN', true); },
};
const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
function rankAtLeast(R, r) {
  const g = R.state.guild;
  g.member = true;
  if (RANKS.indexOf(g.rank) < RANKS.indexOf(r)) g.rank = r;
}
/** Flags named in a `requires` condition (nested lists, any/all). */
function reqFlags(c, out = []) {
  if (!c) return out;
  if (Array.isArray(c)) { for (const x of c) reqFlags(x, out); return out; }
  if (c.flag) out.push(c.flag);
  for (const k of ['any', 'all']) if (c[k]) reqFlags(c[k], out);
  return out;
}
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class AdminPanel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.tab = 'story';
    this.cheats = { ...DEFAULTS };
    try { Object.assign(this.cheats, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }
    this.root = el('div', 'adm');
    this.root.innerHTML = '<div class="adm-box"><div class="adm-head"><b>Админ-режим</b><span class="adm-hint">F10 · Esc — закрыть</span></div><div class="adm-tabs"></div><div class="adm-body"></div><div class="adm-note"></div></div>';
    document.body.appendChild(this.root);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F10') { e.preventDefault(); if (this.enabled) this.toggle(); }
      else if (e.code === 'Escape' && this.open) { e.preventDefault(); e.stopPropagation(); this.close(); }
    }, true);
  }

  /** The admin mode: the setting or `?admin` in the address. */
  get enabled() {
    return !!this.game.mainMenu?.settings?.admin || new URLSearchParams(location.search).has('admin');
  }

  /** Speed multiplier for the heroine's movement (Player.update). */
  get speed() {
    return this.enabled ? this.cheats.speed || 1 : 1;
  }

  _saveCheats() {
    try { localStorage.setItem(KEY, JSON.stringify(this.cheats)); } catch { /* storage blocked */ }
  }

  /** Every frame (Game.update): the switches that hold the vitals. */
  update() {
    const g = this.game, on = this.enabled;
    if (g.combat?.sim) g.combat.sim.god = on && this.cheats.god;
    if (!on) return;
    for (const f of Object.values(g.player.fighters || {})) {
      if (this.cheats.stamina) { f.stamina = f.maxStamina; f.staminaDepleted = false; f.exhaust = 0; f.exhaustLock = 0; }
      if (this.cheats.mana) { f.mana = f.maxMana; f.reserved = 0; }
      if (this.cheats.god && f.hp < f.maxHp && !f.downed) f.hp = f.maxHp;
    }
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  show(tab = this.tab) {
    const g = this.game;
    if (!g.mainMenu?.started) return;
    if (g.mainMenu.pauseOpen) { const M = g.mainMenu; M.pauseOpen = false; M.view = 'game'; M._hide(); } // from the pause menu: no pointer lock in between
    this.tab = tab;
    this.open = true;
    this.root.classList.add('show');
    document.exitPointerLock?.();
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('show');
    setTimeout(() => { if (!this.game.uiBlocking) this.game.input.requestLock(); }, 0);
  }

  note(text) {
    const n = this.root.querySelector('.adm-note');
    n.textContent = text;
    clearTimeout(this._nt);
    this._nt = setTimeout(() => { n.textContent = ''; }, 4000);
  }

  // ---------------------------------------------------------------------------------------------------------------- view
  render() {
    const tabs = this.root.querySelector('.adm-tabs'), body = this.root.querySelector('.adm-body');
    tabs.innerHTML = '';
    for (const [id, label] of [['story', 'Сюжет'], ['tp', 'Телепорт'], ['hero', 'Героини'], ['world', 'Мир']]) {
      const b = el('button', 'adm-tab' + (id === this.tab ? ' on' : ''), label);
      b.onclick = () => { this.tab = id; this.render(); };
      tabs.appendChild(b);
    }
    body.innerHTML = '';
    this['_' + this.tab](body);
  }

  _btn(label, fn, cls = '') {
    const b = el('button', 'adm-btn ' + cls, label);
    b.onclick = () => { try { fn(); } catch (e) { console.error('[admin]', e); this.note('Ошибка: ' + e.message); } };
    return b;
  }

  _section(body, title) {
    body.appendChild(el('div', 'adm-sec', title));
    const grid = el('div', 'adm-grid');
    body.appendChild(grid);
    return grid;
  }

  _story(body) {
    const R = this.game.rpg, Q = R.quests, id = Q.tracked;
    const cur = this._section(body, 'Текущее задание');
    if (id && Q.status(id) === 'active') {
      const st = Q.stage(id);
      cur.appendChild(el('div', 'adm-info', `<b>${Q.def(id).title}</b><br>этап «${st?.id ?? '—'}»: ${st?.text ?? ''}`));
      cur.append(
        this._btn('Этап вперёд', () => { this._endTalk(); Q.advance(id); this.note('Этап пройден'); this.render(); }),
        this._btn('Завершить задание', () => { this._endTalk(); this._finish(id); this.render(); }),
        this._btn('К цели этапа', () => this._toGoal(id)),
      );
    } else cur.appendChild(el('div', 'adm-info', 'Нет активного сюжетного задания.'));
    if (R.dialogue.active) cur.appendChild(this._btn('Закрыть диалог', () => { this._endTalk(); this.render(); }));
    const cap = this._section(body, 'Столица');
    cap.append(
      this._btn('Открыть столицу и перейти к воротам', () => this.openCapital(), 'hot'),
      this._btn('Открыть все остановки повозок', () => { this._allStops(); this.note('Все остановки открыты'); }),
    );
    const jumps = this._section(body, 'Перейти к главе (всё до неё отмечается пройденным)');
    for (const [q, label] of JUMPS) {
      const s = Q.status(q);
      jumps.appendChild(this._btn(label + (s === 'active' ? ' · идёт' : s === 'done' ? ' · пройдено' : ''), () => this.jump(q), s === 'active' ? 'cur' : ''));
    }
  }

  _tp(body) {
    const R = this.game.rpg;
    const q = this._section(body, 'Задание');
    q.appendChild(this._btn('К цели отслеживаемого задания', () => this._toGoal(R.quests.tracked)));
    const st = this._section(body, 'Айнстрей — остановки повозок');
    for (const s of STOPS) if (R.spot(s.spot)) st.appendChild(this._btn(s.name, () => this.game.travel(s.spot)));
    const rg = this._section(body, 'Места карты');
    for (const r of REGIONS) if (r.spawn && !r.interior) rg.appendChild(this._btn(r.name, () => this.teleport(r.spawn, r.spawnYaw ?? 0)));
  }

  _hero(body) {
    const g = this.game, C = this.cheats;
    const sp = this._section(body, 'Скорость бега');
    for (const v of [1, 1.5, 2, 3, 5]) sp.appendChild(this._btn('×' + v, () => { C.speed = v; this._saveCheats(); this.render(); }, C.speed === v ? 'on' : ''));
    const sw = this._section(body, 'Переключатели');
    const flag = (k, label) => this._btn(`${label}: ${C[k] ? 'вкл.' : 'выкл.'}`, () => { C[k] = !C[k]; this._saveCheats(); this.render(); }, C[k] ? 'on' : '');
    sw.append(flag('god', 'Бессмертие'), flag('stamina', 'Бесконечная выносливость'), flag('mana', 'Бесконечная мана'));
    const pl = g.player;
    const st = this._section(body, `Уровень ${pl.level} · эрис ${g.inventory.eris}`);
    st.append(
      this._btn('Полное здоровье (обеим)', () => { this._heal(); this.note('Отряд здоров'); }),
      this._btn('+1 уровень', () => { this._levels(1); this.render(); }),
      this._btn('+5 уровней', () => { this._levels(5); this.render(); }),
      this._btn('+1000 эрис', () => { g.inventory.add('eris', 1000); this.render(); }),
      this._btn('Все навыки Мегумин', () => { for (const k of ['skill_M_Q', 'skill_M_E', 'skill_M_F']) g.rpg.setFlag(k); this.note('Навыки открыты'); }),
      this._btn('Рокси в отряд', () => { g.rpg.apply([{ unlockRoxy: true }]); this.note('Рокси в отряде (Tab)'); }),
      this._btn('Зелья ×5', () => { for (const it of ['hp_potion', 'mana_potion', 'st_potion']) g.inventory.add(it, 5, false, true); this.note('Зелья в сумке'); }),
    );
  }

  _world(body) {
    const g = this.game, R = g.rpg;
    const t = this._section(body, `Время: день ${R.clock.day}, ${String(Math.floor(R.clock.hour)).padStart(2, '0')}:${String(Math.floor((R.clock.hour % 1) * 60)).padStart(2, '0')}`);
    for (const [h, label] of [[7, 'Утро'], [12, 'Полдень'], [18, 'Вечер'], [22, 'Ночь']]) t.appendChild(this._btn(label, () => { R.clock.advanceTo(h); g.npcs.refresh(true); this.render(); }));
    const w = this._section(body, 'Мир');
    w.append(
      this._btn('Убрать врагов рядом (60 м)', () => this._killNear()),
      this._btn('Открыть все остановки повозок', () => { this._allStops(); this.note('Все остановки открыты'); }),
      this._btn('Сохранить игру', () => { R.save(); this.note('Сохранено'); }),
    );
  }

  // ---------------------------------------------------------------------------------------------------------------- actions
  _endTalk() {
    const R = this.game.rpg;
    if (R.dialogue.active) R.dialogue.end();
  }

  /** Move the heroine (and the camera) to a point; the companion follows by her own rule. */
  teleport(pos, yaw = 0) {
    const g = this.game, W = g.world;
    const p = new THREE.Vector3(pos.x, 0, pos.z);
    p.y = W.groundAt(p.x, p.z, (pos.y ?? W.heightAt(p.x, p.z)) + 3) + 0.05;
    g.player.controller.teleport(p, yaw);
    g.player.controller.velocity.set(0, 0, 0);
    g.cameraRig.snapBehind(yaw + Math.PI);
    g.cameraRig.initialized = false;
    g._checkLocation?.(true);
    g.npcs.refresh(true);
    g.rpg.markDirty(true);
    this.close();
  }

  _toGoal(id) {
    const R = this.game.rpg;
    if (!id) return this.note('Нет отслеживаемого задания');
    const p = R.quests.targetOf(id);
    if (!p) return this.note('У этапа нет места на карте');
    // a step aside from an NPC, not into them
    this.teleport({ x: p.x + 2.2, y: p.y, z: p.z + 2.2 }, Math.atan2(-2.2, -2.2));
  }

  /** A quest marked done as the story would have left it: rewards, reward flags, what its scenes set (AFTER). Silent, no `next`. */
  _forceDone(id) {
    const R = this.game.rpg, Q = R.quests, d = Q.def(id);
    if (!d || Q.status(id) === 'done') return;
    R.state.quests[id] = { status: 'done', stage: d.stages.length, progress: {}, day: R.clock.day, doneDay: R.clock.day };
    const r = d.rewards || {};
    if (r.eris) R.inventory.add('eris', r.eris);
    for (const [item, n] of r.items || []) R.inventory.add(item, n, false, true);
    if (r.xp) R.gainXp(r.xp);
    for (const f of r.flags || []) R.setFlag(f);
    AFTER[id]?.(R);
  }

  /** The tracked quest done at once; the story goes on with the next one. */
  _finish(id) {
    const R = this.game.rpg, Q = R.quests, d = Q.def(id);
    this._quiet(() => this._forceDone(id));
    if (Q.tracked === id) Q.tracked = null;
    if (d.next && Q.canStart(d.next)) Q.start(d.next);
    this._after();
    this.note(`«${d.title}» завершено`);
  }

  /** Jump to the start of a chapter of the main chain. */
  jump(target, go = true) {
    const g = this.game, R = g.rpg, Q = R.quests;
    this._endTalk();
    const at = CHAIN.indexOf(target);
    this._quiet(() => {
      for (let i = 0; i < at; i++) {
        const id = CHAIN[i];
        for (const f of reqFlags(Q.def(id)?.requires)) R.setFlag(f);
        this._forceDone(id);
      }
      for (const f of reqFlags(Q.def(target).requires)) R.setFlag(f);
      // the chapter itself and everything after it start anew (a jump back too)
      for (let i = at; i < CHAIN.length; i++) delete R.state.quests[CHAIN[i]];
      Q.tracked = null;
    });
    Q.start(target);
    Q.tracked = target;
    this._after();
    this.note('Глава начата: ' + Q.def(target).title);
    if (!go) return;
    if (Q.targetOf(target)) this._toGoal(target);
    else this.close();
  }

  openCapital() {
    const R = this.game.rpg, Q = R.quests;
    // the road done, the city chapter at its start (Oskar at the south gate); a save that is further keeps its story
    if (Q.status('ainstrey_road') !== 'done' || Q.status('ainstrey_city') === 'none') this.jump('ainstrey_city', false);
    R.setVar('AINSTRAY_ROAD_OPEN', true);
    this._allStops();
    this._after();
    this.close();
    this.game.travel('stop_gate');
    this.note('Столица открыта: все остановки повозок доступны');
  }

  _allStops() {
    const R = this.game.rpg;
    for (const s of STOPS) R.setFlag('stop_' + s.id);
  }

  /** The world and the people follow the new story state; the game is saved. */
  _after() {
    const g = this.game, R = g.rpg;
    g.hud.setCompanion?.(!!R.state.flags.roxy_companion);
    R._syncProps?.();
    g.npcs.refresh(true);
    R.markDirty(true);
    R.save();
  }

  /** Run without the flood of notifications (a skipped chapter would announce every reward). */
  _quiet(fn) {
    const R = this.game.rpg, n = R.notify;
    R.notify = () => {};
    try { fn(); } finally { R.notify = n; }
  }

  _heal() {
    const pl = this.game.player;
    pl.restoreParty?.(false);
    for (const [id, f] of Object.entries(pl.fighters)) {
      if (f.downed) { f.downed = false; this.game.combat?.sim?.resetHero?.(id); }
      f.hp = f.maxHp; f.mana = f.maxMana; f.stamina = f.maxStamina; f.exhaust = 0;
    }
  }

  _levels(n) {
    const pl = this.game.player, R = this.game.rpg;
    for (let i = 0; i < n; i++) R.gainXp(XP_TABLE(pl.level) - pl.xp);
    this.note('Уровень ' + pl.level);
  }

  _killNear() {
    const g = this.game, pp = g.player.position;
    let n = 0;
    for (const e of g.enemies.list) if (e.alive && e.position.distanceTo(pp) < 60) { e.takeHit(1e6, pp, 0); n++; }
    this.note(n ? `Убрано врагов: ${n}` : 'Рядом нет врагов');
  }
}
